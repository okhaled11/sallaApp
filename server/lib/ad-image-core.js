/**
 * Ad image generator core (platform-agnostic).
 *
 * The merchant picks a product, a style and a format; Gemini's image model
 * re-stages the product photo as a marketing image (clean white studio,
 * lifestyle scene, luxury, ...). The product itself must stay unchanged.
 *
 * Served through the scan-session function (action "adimage") so the project
 * stays within the serverless function limit. Embedded-token protected: it
 * spends image-generation credits.
 */
import { verifyEmbeddedToken } from "./verify-token-core.js";
import { loadCatalog } from "./visual-search-core.js";
import { logError } from "./errors.js";

const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const TOTAL_BUDGET_MS = 52_000;
const IMAGE_MIME_RE = /^image\/(jpeg|png|webp)$/;

export const STYLES = {
  studio:
    "a clean, pure white seamless studio background with a soft natural contact shadow, evenly lit, e-commerce hero shot",
  lifestyle:
    "a natural lifestyle scene that fits how the product is used, warm natural light, shallow depth of field",
  luxury:
    "a dark premium backdrop with dramatic rim lighting, subtle glossy reflections and an elegant luxury mood",
  bold:
    "a vibrant colourful gradient background with a dynamic, eye-catching social-media ad composition",
  festive:
    "a warm festive Ramadan / Eid atmosphere with golden bokeh lights and soft lantern glow, elegant and tasteful",
};

export const FORMATS = {
  square: "1:1",
  portrait: "4:5",
  story: "9:16",
  wide: "16:9",
};

const json = (statusCode, payload) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(payload),
});

export function buildPrompt({ style, note, productName }) {
  const scene = STYLES[style] || STYLES.studio;
  const extra = String(note || "").trim().slice(0, 200);
  return [
    `Create a professional advertising image of this product${productName ? ` ("${productName}")` : ""}.`,
    `Place the product in ${scene}.`,
    "Keep the product EXACTLY as photographed: same shape, colours, materials, logos and any printed text. Do not redraw, restyle or replace it.",
    "Show only this one product, large and centred with comfortable margins. Do not add any text, watermark, border or extra products.",
    extra ? `Additional direction from the merchant: ${extra}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

async function downloadImage(url) {
  if (!/^https:\/\//i.test(String(url || ""))) throw new Error("لا توجد صورة صالحة لهذا المنتج");
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error("تعذّر تحميل صورة المنتج");
  const mime = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_MIME_RE.test(mime)) throw new Error("صيغة صورة المنتج غير مدعومة (استخدم JPG أو PNG أو WebP)");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_SOURCE_BYTES) throw new Error("صورة المنتج كبيرة جدًا");
  return { mime, data: buffer.toString("base64") };
}

function extractImage(result) {
  for (const part of result?.candidates?.[0]?.content?.parts || []) {
    const inline = part.inlineData || part.inline_data;
    if (inline?.data) return { mime: inline.mimeType || inline.mime_type || "image/png", data: inline.data };
  }
  return null;
}

async function generate({ apiKey, source, prompt, aspectRatio }) {
  const models = [
    process.env.GEMINI_IMAGE_MODEL,
    "gemini-2.5-flash-image",
    "gemini-2.5-flash-image-preview",
  ].filter(Boolean);

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastError = null;
  for (const model of [...new Set(models)]) {
    const remaining = deadline - Date.now();
    if (remaining < 5000) break;
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }, { inline_data: { mime_type: source.mime, data: source.data } }],
              },
            ],
            generationConfig: {
              responseModalities: ["IMAGE"],
              imageConfig: { aspectRatio },
            },
          }),
          signal: AbortSignal.timeout(remaining),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = new Error(`Gemini (${model}) ${response.status}: ${result.error?.message || "failed"}`);
        continue;
      }
      const image = extractImage(result);
      if (image) return image;
      lastError = new Error(`Gemini (${model}) returned no image`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("تعذّر توليد الصورة");
}

export async function adImageRequest({ method, body, apiKey = "" }) {
  if (method === "OPTIONS") return json(204, undefined);
  if (method !== "POST") return json(405, { success: false, error: "Method not allowed" });

  let data;
  try {
    data = typeof body === "string" ? JSON.parse(body || "{}") : body || {};
  } catch {
    return json(400, { success: false, error: "Invalid JSON body" });
  }

  const { token, appId } = data;
  const isDevToken = process.env.NODE_ENV !== "production" && String(token || "").startsWith("dev-");
  if (!isDevToken) {
    if (!token || !appId) return json(400, { success: false, error: "token و appId مطلوبان" });
    const { result } = await verifyEmbeddedToken({ token, appId });
    if (!result?.success) return json(401, { success: false, error: "جلسة التطبيق غير صالحة" });
  }

  const style = STYLES[data.style] ? data.style : "studio";
  const aspectRatio = FORMATS[data.format] || FORMATS.square;
  if (!apiKey) return json(503, { success: false, error: "مفتاح Gemini غير مضبوط على السيرفر" });

  try {
    const products = await loadCatalog({ all: true });
    const product = products.find((p) => String(p.id) === String(data.productId));
    if (!product) return json(404, { success: false, error: "المنتج غير موجود" });

    const source = await downloadImage(product.image);
    const image = await generate({
      apiKey,
      source,
      aspectRatio,
      prompt: buildPrompt({ style, note: data.note, productName: product.name }),
    });
    return json(200, {
      success: true,
      data: { image: `data:${image.mime};base64,${image.data}`, style, format: data.format || "square" },
    });
  } catch (err) {
    logError("ad image", err);
    const known = /صورة|صيغة|المنتج/.test(err.message || "");
    return json(502, {
      success: false,
      error: known ? err.message : "تعذّر توليد الصورة. حاول مرة أخرى بعد قليل",
      // Provider reason (status + message, never the key) so the merchant can see why it failed.
      ...(known ? {} : { detail: String(err.message || err).slice(0, 300) }),
    });
  }
}
