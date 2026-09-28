/**
 * Products core logic (platform-agnostic).
 *
 * - productsRequest: lists all products with how many times each was sold
 * - updateProductRequest: updates a product's price and/or quantity
 *
 * Flow for both:
 *   1. Introspect the embedded token (?token=...) with Salla -> verified merchant_id
 *   2. getValidAccessToken(merchant_id) -> merchant OAuth token from Redis
 *      (refreshed automatically when it is about to expire)
 *   3. Call the Salla Merchant API with Authorization: Bearer <access_token>
 *
 * The merchant access/refresh tokens never leave the server.
 *
 * Used by the Vercel functions (api/products.js, api/update-product.js) and the
 * Netlify functions (server/functions/products.js, server/functions/update-product.js).
 */
import {
  respond,
  introspectEmbeddedToken,
  resolveAppId,
} from "./verify-token-core.js";
import { getValidAccessToken } from "./salla-token-manager.js";
import { ERROR_CODES, SallaAuthError, logError, redact } from "./errors.js";

const SALLA_PRODUCTS_URL = "https://api.salla.dev/admin/v2/products";
const PER_PAGE = 50;
// Safety cap so a huge catalog can't keep the function running forever
const MAX_PAGES = 40;

/**
 * Normalize a Salla product into the shape the UI needs.
 */
export function mapProduct(product) {
  return {
    id: product.id,
    name: product.name || "—",
    sku: product.sku || null,
    status: product.status || null,
    price: product.price?.amount ?? null,
    currency: product.price?.currency ?? null,
    image:
      product.thumbnail || product.main_image || product.image?.url || null,
    // null means unlimited stock
    quantity:
      product.quantity === null || product.quantity === undefined
        ? null
        : Number(product.quantity),
    soldQuantity: Number(product.sold_quantity) || 0,
  };
}

/**
 * Turn a failed Salla API response into a safe, specific error.
 */
function sallaError(result, response, fallback) {
  const sallaMessage = redact(
    result.error?.message || result.message || fallback,
  );

  if (response.status === 401) {
    return new SallaAuthError(
      ERROR_CODES.SALLA_UNAUTHORIZED,
      "Salla API returned 401: the store's access token was rejected. Reinstall the app from the Salla dashboard to re-authorize it.",
      401,
    );
  }

  if (response.status === 403) {
    return new SallaAuthError(
      ERROR_CODES.SALLA_FORBIDDEN,
      `Salla API returned 403 (insufficient scope): ${sallaMessage}. Enable the required permission in Salla Partners (App Scopes), then reinstall the app.`,
      403,
    );
  }

  return new SallaAuthError(
    ERROR_CODES.SALLA_API_ERROR,
    `Salla API returned ${response.status}: ${sallaMessage}`,
    response.status >= 400 && response.status < 600 ? response.status : 502,
  );
}

/**
 * Fetch every page of products from the Salla Merchant API.
 *
 * @param {string} accessToken - Merchant OAuth access token
 * @returns {Promise<Array>} Raw Salla product objects
 */
export async function fetchAllProducts(accessToken) {
  const products = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${SALLA_PRODUCTS_URL}?page=${page}&per_page=${PER_PAGE}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false) {
      throw sallaError(result, response, "Failed to fetch products");
    }

    const pageItems = Array.isArray(result.data) ? result.data : [];
    products.push(...pageItems);

    const pagination = result.pagination || {};
    const totalPages = pagination.totalPages ?? pagination.total_pages;
    const hasNext = totalPages
      ? page < totalPages
      : Boolean(pagination.links?.next || pagination.next);

    if (!hasNext || pageItems.length === 0) break;
  }

  return products;
}

/**
 * Update a product in the Salla Merchant API (partial update).
 *
 * @param {string} accessToken - Merchant OAuth access token
 * @param {number} productId - Salla product ID
 * @param {{ price?: number, quantity?: number }} changes
 * @returns {Promise<object>} Raw updated Salla product
 */
export async function updateProduct(accessToken, productId, changes) {
  const response = await fetch(`${SALLA_PRODUCTS_URL}/${productId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(changes),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    throw sallaError(result, response, "Failed to update product");
  }
  return result.data;
}

/**
 * Validate the update payload coming from the browser.
 *
 * @returns {{ changes?: object, error?: string }}
 */
export function validateProductChanges({ productId, price, quantity }) {
  if (!Number.isInteger(productId) || productId <= 0) {
    return { error: "A valid productId is required" };
  }

  const changes = {};

  if (price !== undefined) {
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
      return { error: "Price must be a number greater than or equal to 0" };
    }
    changes.price = price;
  }

  if (quantity !== undefined) {
    if (!Number.isInteger(quantity) || quantity < 0) {
      return {
        error: "Quantity must be a whole number greater than or equal to 0",
      };
    }
    changes.quantity = quantity;
  }

  if (Object.keys(changes).length === 0) {
    return { error: "Nothing to update: send price and/or quantity" };
  }

  return { changes };
}

/**
 * Run a Salla API call with the merchant's token. If Salla rejects the token
 * with 401 (e.g. revoked early), refresh once and retry.
 */
export async function withMerchantAccessToken(merchantId, call) {
  const accessToken = await getValidAccessToken(merchantId);
  try {
    return await call(accessToken);
  } catch (error) {
    if (error?.code !== ERROR_CODES.SALLA_UNAUTHORIZED) throw error;
    const retryToken = await getValidAccessToken(merchantId, {
      rejectedToken: accessToken,
    });
    return call(retryToken);
  }
}

/**
 * Shared request checks: method, body, embedded session -> merchant ID.
 * Returns `{ response }` to short-circuit, otherwise `{ data, merchantId }`.
 * Throws SallaAuthError when the embedded session can't be verified.
 */
async function authorizeRequest({ method, body }) {
  if (method === "OPTIONS") {
    return { response: respond(204) };
  }

  if (method !== "POST") {
    return {
      response: respond(405, { success: false, error: "Method not allowed" }),
    };
  }

  let data;
  try {
    data = typeof body === "string" ? JSON.parse(body || "{}") : body || {};
  } catch {
    return {
      response: respond(400, { success: false, error: "Invalid JSON body" }),
    };
  }
  const { token } = data;
  const appId = resolveAppId(data.appId);

  if (!token) {
    return {
      response: respond(400, { success: false, error: "Token is required" }),
    };
  }

  if (!appId) {
    return {
      response: respond(400, { success: false, error: "App ID is required" }),
    };
  }

  // The merchant ID comes from Salla's introspection of the embedded token,
  // never from the request body.
  const identity = await introspectEmbeddedToken({ token, appId });
  if (!identity.verified) {
    throw new SallaAuthError(
      ERROR_CODES.EMBEDDED_TOKEN_INVALID,
      "Embedded session could not be verified. Reopen the app from the Salla dashboard.",
      401,
    );
  }
  if (!identity.merchantId) {
    throw new SallaAuthError(
      ERROR_CODES.MERCHANT_UNKNOWN,
      "Could not determine the store for this session.",
      401,
    );
  }

  return { data, merchantId: identity.merchantId };
}

function errorResponse(error, label) {
  logError(label, error);
  if (error instanceof SallaAuthError) {
    return respond(error.status, {
      success: false,
      error: error.message,
      code: error.code,
    });
  }
  return respond(500, { success: false, error: "Internal server error" });
}

/**
 * Body: { token, appId }
 *
 * @param {{ method: string, body: unknown }} request - body may be a JSON string or an already-parsed object
 * @returns {Promise<{ statusCode: number, headers: Record<string, string>, body: string }>}
 */
export async function productsRequest(request) {
  try {
    const { response, merchantId } = await authorizeRequest(request);
    if (response) return response;

    const rawProducts = await withMerchantAccessToken(
      merchantId,
      fetchAllProducts,
    );
    const products = rawProducts
      .map(mapProduct)
      .sort((a, b) => b.soldQuantity - a.soldQuantity);

    return respond(200, {
      success: true,
      data: {
        products,
        totalSold: products.reduce((sum, p) => sum + p.soldQuantity, 0),
      },
    });
  } catch (error) {
    return errorResponse(error, "Products fetch error:");
  }
}

/**
 * Body: { token, appId, productId, price?, quantity? }
 *
 * @param {{ method: string, body: unknown }} request - body may be a JSON string or an already-parsed object
 * @returns {Promise<{ statusCode: number, headers: Record<string, string>, body: string }>}
 */
export async function updateProductRequest(request) {
  try {
    const { response, data, merchantId } = await authorizeRequest(request);
    if (response) return response;

    const { changes, error } = validateProductChanges(data);
    if (error) {
      return respond(400, { success: false, error });
    }

    const updated = await withMerchantAccessToken(merchantId, (accessToken) =>
      updateProduct(accessToken, data.productId, changes),
    );

    return respond(200, {
      success: true,
      data: { product: mapProduct(updated) },
    });
  } catch (error) {
    return errorResponse(error, "Product update error:");
  }
}
