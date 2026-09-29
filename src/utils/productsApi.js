import {
  PRODUCTS_FUNCTION_URL,
  UPDATE_PRODUCT_FUNCTION_URL,
  getAppId,
} from "./constants.js";
import logger from "./logger.js";

async function postJson(url, payload, label) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...payload, appId: getAppId() }),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    logger.error(`${label} error:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch store products with their sold quantity via serverless function
 */
export function fetchProducts(token) {
  return postJson(PRODUCTS_FUNCTION_URL, { token }, "Products fetch");
}

/**
 * Update a product's price and/or quantity via serverless function
 *
 * @param {string} token - Embedded token
 * @param {number} productId - Salla product ID
 * @param {{ price?: number, quantity?: number }} changes
 */
export function updateProduct(token, productId, changes) {
  return postJson(
    UPDATE_PRODUCT_FUNCTION_URL,
    { token, productId, ...changes },
    "Product update",
  );
}
