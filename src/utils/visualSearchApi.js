import { SCAN_SESSION_FUNCTION_URL } from "./constants.js";
import logger from "./logger.js";

/** Find the store products closest to a photo (image = JPEG/PNG/WebP data URL). */
export async function searchByImage(image) {
  try {
    const response = await fetch(SCAN_SESSION_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "vsearch", image }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok && result.success === undefined) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    return result;
  } catch (error) {
    logger.error("Visual search error:", error);
    return { success: false, error: error.message };
  }
}

export function buildVisualSearchSnippet({ origin, asHtmlTag = false }) {
  const src = `${origin}/storefront/visual-search.js`;
  if (asHtmlTag) return `<script src="${src}" async></script>`;
  return `(function(){var s=document.createElement("script");s.src="${src}";s.async=true;document.head.appendChild(s);})();`;
}
