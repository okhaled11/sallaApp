import { RISKY_ORDERS_FUNCTION_URL, getAppId } from "./constants.js";
import logger from "./logger.js";

/**
 * Loads the store's recent orders, each scored for delivery risk by the server.
 *
 * @param {string|null} token - Embedded auth token
 * @param {{ days?: number }} [options]
 * @returns {Promise<{ success: boolean, error?: string, data?: object }>}
 */
export async function fetchRiskyOrders(token, { days } = {}) {
  try {
    const response = await fetch(RISKY_ORDERS_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, appId: getAppId(), days }),
    });
    const result = await response.json().catch(() => null);
    return result || { success: false, error: `خدمة تحليل الطلبات غير متاحة (${response.status})` };
  } catch (error) {
    logger.error("Risky orders error:", error);
    return { success: false, error: error.message || "فشل الاتصال بسيرفر التطبيق" };
  }
}
