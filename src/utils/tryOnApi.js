import { TRYON_CONFIG_FUNCTION_URL, getAppId } from "./constants.js";
import logger from "./logger.js";

/**
 * Loads the try-on items currently published for the store (enabled ones only).
 *
 * @returns {Promise<{ success: boolean, items: object[], error?: string }>}
 */
export async function fetchTryOnItems(storeId) {
  try {
    const response = await fetch(`${TRYON_CONFIG_FUNCTION_URL}?store=${encodeURIComponent(storeId)}`);
    const result = await response.json().catch(() => null);
    if (!result?.success) return { success: false, items: [], error: result?.error };
    return { success: true, items: result.data?.items || [] };
  } catch (error) {
    logger.error("Fetch try-on items error:", error);
    return { success: false, items: [], error: error.message };
  }
}

/**
 * Publishes the full item list; the storefront script picks it up at runtime.
 *
 * @returns {Promise<{ success: boolean, persisted?: boolean, error?: string }>}
 */
export async function publishTryOnItems({ token, storeId, items }) {
  try {
    const response = await fetch(TRYON_CONFIG_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, appId: getAppId(), storeId, items }),
    });
    const result = await response.json().catch(() => null);
    return result || { success: false, error: `سيرفر الإعدادات غير متاح (${response.status})` };
  } catch (error) {
    logger.error("Publish try-on items error:", error);
    return { success: false, error: error.message || "فشل الاتصال بسيرفر التطبيق" };
  }
}

/** The one line a merchant pastes into the store, once. It never changes. */
export function buildTryOnInstallSnippet({ origin, storeId, asHtmlTag = false }) {
  const src = `${origin}/storefront/tryon.js`;
  if (asHtmlTag) {
    return `<script src="${src}" data-store="${storeId}" async></script>`;
  }
  return `(function(){var s=document.createElement("script");s.src="${src}";s.async=true;s.setAttribute("data-store","${storeId}");document.head.appendChild(s);})();`;
}
