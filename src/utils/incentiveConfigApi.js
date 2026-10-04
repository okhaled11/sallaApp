import { INCENTIVE_CONFIG_FUNCTION_URL, getAppId } from "./constants.js";
import logger from "./logger.js";

/**
 * Publishes the saved incentive config + rules so the storefront script (installed once)
 * picks them up at runtime.
 *
 * @returns {Promise<{ success: boolean, persisted?: boolean, error?: string }>}
 */
export async function publishIncentiveSettings({ token, storeId, config, rules }) {
  try {
    const response = await fetch(INCENTIVE_CONFIG_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, appId: getAppId(), storeId, config, rules }),
    });
    const result = await response.json().catch(() => null);
    return result || { success: false, error: `سيرفر الإعدادات غير متاح (${response.status})` };
  } catch (error) {
    logger.error("Publish incentive settings error:", error);
    return { success: false, error: error.message || "فشل الاتصال بسيرفر التطبيق" };
  }
}

/**
 * The only thing a merchant pastes into the store, once. It never changes.
 *
 * @param {{ origin: string, storeId: string, asHtmlTag?: boolean }} params
 */
export function buildInstallSnippet({ origin, storeId, asHtmlTag = false }) {
  const src = `${origin}/storefront/incentive.js`;
  if (asHtmlTag) {
    return `<script src="${src}" data-store="${storeId}" async></script>`;
  }
  return `(function(){var s=document.createElement("script");s.src="${src}";s.async=true;s.setAttribute("data-store","${storeId}");document.head.appendChild(s);})();`;
}
