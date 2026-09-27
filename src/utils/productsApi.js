import { PRODUCTS_FUNCTION_URL, getAppId } from "./constants.js";
import logger from "./logger.js";

/**
 * Fetch store products with their sold quantity via serverless function
 */
export async function fetchProducts(token) {
  try {
    const response = await fetch(PRODUCTS_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token,
        appId: getAppId(),
      }),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    logger.error("Products fetch error:", error);
    return { success: false, error: error.message };
  }
}
