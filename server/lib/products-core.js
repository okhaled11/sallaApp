/**
 * Products sales core logic (platform-agnostic).
 *
 * 1. Verifies the embedded token (so only the Salla dashboard can call this)
 * 2. Fetches all products from the Salla Merchant API
 * 3. Returns each product with how many times it was sold (sold_quantity)
 *
 * Used by both the Vercel function (api/products.js) and the
 * Netlify function (server/functions/products.js).
 *
 * Requires env var SALLA_ACCESS_TOKEN: the merchant OAuth access token
 * (scope: products.read) obtained when the app was installed on the store.
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
    soldQuantity: Number(product.sold_quantity) || 0,
  };
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
      const message =
        result.error?.message || result.message || "Failed to fetch products";
      const error = new Error(message);
      error.status = response.status;
      throw error;
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
 * @param {{ method: string, body: unknown }} request - body may be a JSON string or an already-parsed object
 * @returns {Promise<{ statusCode: number, headers: Record<string, string>, body: string }>}
 */
export async function productsRequest({ method, body }) {
  if (method === "OPTIONS") {
    return respond(204);
  }

  if (method !== "POST") {
    return respond(405, { success: false, error: "Method not allowed" });
  }

  try {
    const data =
      typeof body === "string" ? JSON.parse(body || "{}") : body || {};
    const { token, appId } = data;

    if (!token) {
      return respond(400, { success: false, error: "Token is required" });
    }

    if (!appId) {
      return respond(400, { success: false, error: "App ID is required" });
    }

    const accessToken = process.env.SALLA_ACCESS_TOKEN;
    if (!accessToken) {
      return respond(500, {
        success: false,
        error: "SALLA_ACCESS_TOKEN is not configured on the server",
      });
    }

    // Only serve product data to a verified embedded session
    const verification = await verifyEmbeddedToken({ token, appId });
    if (!verification.result?.success) {
      return respond(401, {
        success: false,
        error: "Token verification failed",
      });
    }

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
    console.error("Products fetch error:", error);
    return respond(error.status || 500, {
      success: false,
      error: error.message || "Internal server error",
    });
  }
}
