/**
 * Products core logic (platform-agnostic).
 *
 * - productsRequest: lists all products with how many times each was sold
 * - updateProductRequest: updates a product's price and/or quantity
 *
 * Both verify the embedded token first (so only the Salla dashboard can call
 * them), then talk to the Salla Merchant API.
 *
 * Used by the Vercel functions (api/products.js, api/update-product.js) and the
 * Netlify functions (server/functions/products.js, server/functions/update-product.js).
 *
 * Requires env var SALLA_ACCESS_TOKEN: the merchant OAuth access token
 * (scope: products.read_write) obtained when the app was installed on the store.
 */
import { respond, verifyEmbeddedToken } from "./verify-token-core.js";

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

function sallaError(result, response, fallback) {
  const message = result.error?.message || result.message || fallback;
  const error = new Error(message);
  error.status = response.status;
  return error;
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

    const result = await response.json();
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

  const result = await response.json();
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
 * Shared request checks: method, body, embedded token, access token.
 * When `response` is returned the request is rejected with it.
 *
 * @returns {Promise<{ response?: object, data?: object, accessToken?: string }>}
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

  const data = typeof body === "string" ? JSON.parse(body || "{}") : body || {};
  const { token, appId } = data;

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

  const accessToken = process.env.SALLA_ACCESS_TOKEN;
  if (!accessToken) {
    return {
      response: respond(500, {
        success: false,
        error: "SALLA_ACCESS_TOKEN is not configured on the server",
      }),
    };
  }

  // Only serve / change product data for a verified embedded session
  const verification = await verifyEmbeddedToken({ token, appId });
  if (!verification.result?.success) {
    return {
      response: respond(401, {
        success: false,
        error: "Token verification failed",
      }),
    };
  }

  return { data, accessToken };
}

function errorResponse(error, label) {
  console.error(`${label}:`, error);
  return respond(error.status || 500, {
    success: false,
    error: error.message || "Internal server error",
  });
}

/**
 * Body: { token, appId }
 *
 * @param {{ method: string, body: unknown }} request - body may be a JSON string or an already-parsed object
 * @returns {Promise<{ statusCode: number, headers: Record<string, string>, body: string }>}
 */
export async function productsRequest(request) {
  try {
    const { response, accessToken } = await authorizeRequest(request);
    if (response) return response;

    const rawProducts = await fetchAllProducts(accessToken);
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
    return errorResponse(error, "Products fetch error");
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
    const { response, data, accessToken } = await authorizeRequest(request);
    if (response) return response;

    const { changes, error } = validateProductChanges(data);
    if (error) {
      return respond(400, { success: false, error });
    }

    const updated = await updateProduct(accessToken, data.productId, changes);

    return respond(200, {
      success: true,
      data: { product: mapProduct(updated) },
    });
  } catch (error) {
    return errorResponse(error, "Product update error");
  }
}
