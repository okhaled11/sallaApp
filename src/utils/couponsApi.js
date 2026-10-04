import { CREATE_COUPON_FUNCTION_URL, getAppId } from "./constants.js";
import logger from "./logger.js";

/**
 * Creates or synchronizes a purchase coupon with Salla's Merchant API
 *
 * @param {string|null} token - Embedded auth token (optional)
 * @param {{
 *   code: string,
 *   name?: string,
 *   discount_type: "percentage"|"fixed"|"free_shipping",
 *   discount_value: number,
 *   free_shipping?: boolean
 * }} couponData
 * @returns {Promise<{ success: boolean, message?: string, error?: string, coupon?: object, alreadyExists?: boolean }>}
 */
export async function createSallaCoupon(token, couponData) {
  try {
    const response = await fetch(CREATE_COUPON_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token,
        appId: getAppId(),
        ...couponData,
      }),
    });

    const result = await response.json().catch(() => null);
    if (!result) {
      return {
        success: false,
        error: `سيرفر القسائم غير متاح (${response.status}). تأكد من نشر /api/create-coupon أو تشغيل التطبيق عبر netlify dev / vercel dev.`,
      };
    }
    return result;
  } catch (error) {
    logger.error("Create coupon error:", error);
    return {
      success: false,
      error: error.message || "فشل الاتصال بسيرفر التطبيق",
    };
  }
}
