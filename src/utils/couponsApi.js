import { CREATE_COUPON_FUNCTION_URL, COUPON_STATS_FUNCTION_URL, getAppId } from "./constants.js";
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
    if (result.simulated) {
      // Server had no SALLA_ACCESS_TOKEN: nothing was created in Salla.
      return {
        success: false,
        error: "لم يتم إنشاء الكوبون في سلة: SALLA_ACCESS_TOKEN غير مضبوط على السيرفر. أضفه في ملف .env (أو Vercel Environment Variables) وأعد التشغيل.",
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

/**
 * Fetches usage/sales statistics for Salla coupons by their numeric ids.
 * A 404 from Salla comes back as `{ exists: false }` for that id.
 *
 * @param {Array<string|number>} ids
 * @returns {Promise<Record<string, { exists: boolean|null, usage?: number, customers?: number, sales?: number, currency?: string }>>}
 */
export async function fetchCouponStats(ids) {
  if (!ids.length) return {};
  try {
    const response = await fetch(COUPON_STATS_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const result = await response.json().catch(() => null);
    return result?.success ? result.stats || {} : {};
  } catch (error) {
    logger.error("Coupon stats error:", error);
    return {};
  }
}
