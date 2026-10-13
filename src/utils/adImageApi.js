import { SCAN_SESSION_FUNCTION_URL, getAppId } from "./constants.js";
import logger from "./logger.js";

export const AD_STYLES = [
  { id: "studio", label: "خلفية بيضاء", hint: "استوديو نظيف للمتجر" },
  { id: "lifestyle", label: "أجواء الاستخدام", hint: "المنتج في مشهد طبيعي" },
  { id: "luxury", label: "فخامة داكنة", hint: "إضاءة درامية وأنيقة" },
  { id: "bold", label: "ملوّن للسوشيال", hint: "ألوان جريئة للفت النظر" },
  { id: "festive", label: "رمضان والعيد", hint: "أجواء احتفالية دافئة" },
];

export const AD_FORMATS = [
  { id: "square", label: "منشور مربع", ratio: "1:1" },
  { id: "portrait", label: "إنستغرام عمودي", ratio: "4:5" },
  { id: "story", label: "ستوري", ratio: "9:16" },
  { id: "wide", label: "عريض", ratio: "16:9" },
];

/** Generate an ad image for a catalogue product. Resolves to { success, data:{ image } | error }. */
export async function generateAdImage({ token, productId, style, format, note }) {
  try {
    const response = await fetch(SCAN_SESSION_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "adimage",
        token: token || "dev-token",
        appId: getAppId(),
        productId,
        style,
        format,
        note,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok && result.success === undefined) {
      return { success: false, error: response.status === 504 ? "انتهت مهلة التوليد. حاول مرة أخرى" : `HTTP ${response.status}` };
    }
    return result;
  } catch (error) {
    logger.error("Ad image error:", error);
    return { success: false, error: error.message };
  }
}
