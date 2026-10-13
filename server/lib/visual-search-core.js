/**
 * Visual search core (platform-agnostic).
 *
 * A shopper on the storefront (or the merchant testing it in the dashboard)
 * sends a photo of something they like; Gemini compares it with the store's
 * catalogue and we return the closest in-stock products.
 *
 *   POST {image}   image = JPEG/PNG/WebP data URL (the client downsizes it)
 *
 * Served through the scan-session function (action "vsearch") so the project
 * stays within the serverless function limit. Public endpoint (the storefront has no Salla login), so it is rate limited
 * per IP and only ever returns data already shown on the storefront. The Salla
 * access token and the Gemini key stay on the server.
 */
import { Redis } from "@upstash/redis";
import { fetchAllProducts, mapProduct } from "./products-core.js";
import { getActiveAccessToken } from "./salla-tokens-core.js";
import { logError } from "./errors.js";

const IMAGE_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const MAX_IMAGE_CHARS = 600 * 1024;
const CATALOG_TTL_MS = 5 * 60 * 1000;
const MAX_CATALOG = 300;
const MAX_RESULTS = 6;
const RATE_LIMIT = 8; // requests
const RATE_WINDOW = 60; // seconds
const GEMINI_TIMEOUT_MS = 20_000;
const MODELS = ["gemini-flash-latest", "gemini-3.5-flash"];

const json = (statusCode, payload) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  },
  body: payload === undefined ? "" : JSON.stringify(payload),
});

// ---------- rate limit ----------
const hits = new Map(); // ip -> { count, resetAt } (local dev / fallback)
let redis;

function getRedis() {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

async function allowed(ip) {
  const client = getRedis();
  if (client) {
    const key = `salla-vsearch:rl:${ip}`;
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, RATE_WINDOW);
    return count <= RATE_LIMIT;
  }
  const now = Date.now();
  const hit = hits.get(ip);
  if (!hit || hit.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW * 1000 });
    return true;
  }
  hit.count += 1;
  return hit.count <= RATE_LIMIT;
}

const clientIp = (headers = {}) =>
  String(headers["x-forwarded-for"] || headers["x-real-ip"] || "unknown").split(",")[0].trim();

// ---------- catalogue ----------
let catalogCache = { at: 0, items: [] };

export function isSearchable(product) {
  if (!product || product.status === "hidden" || product.status === "deleted") return false;
  return product.quantity === null || product.quantity > 0;
}

/** Store catalogue (cached 5 min). `all` includes hidden / out-of-stock products. */
export async function loadCatalog({ all = false } = {}) {
  if (Date.now() - catalogCache.at >= CATALOG_TTL_MS || !catalogCache.items.length) {
    const accessToken = await getActiveAccessToken();
    if (!accessToken) throw new Error("SALLA_ACCESS_TOKEN غير مضبوط على السيرفر");
    catalogCache = { at: Date.now(), items: (await fetchAllProducts(accessToken)).map(mapProduct) };
  }
  return all ? catalogCache.items : catalogCache.items.filter(isSearchable).slice(0, MAX_CATALOG);
}

// ---------- AI ----------
export function buildPrompt(products) {
  const lines = products.map((p) => {
    const category = p.categories?.[0]?.name || "";
    return `${p.id} | ${p.name}${category ? ` | ${category}` : ""}`;
  });
  return `You are a visual shopping assistant for an Arabic online store.
The attached photo shows an item the shopper likes. Find the products below that look most similar
(same kind of item first, then style, colour and material). Only pick genuinely similar products;
if nothing fits, return an empty list. Never invent ids.

Products (id | name | category):
${lines.join("\n")}

Reply with ONLY JSON:
{ "description": "one short Arabic sentence describing what is in the photo",
  "matches": [{ "id": "<product id from the list>", "reason": "very short Arabic reason" }] }
Return at most ${MAX_RESULTS} matches, best first.`;
}

async function askGemini(apiKey, mime, data, products) {
  let lastError = null;
  for (const model of MODELS) {
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
                parts: [{ text: buildPrompt(products) }, { inline_data: { mime_type: mime, data } }],
              },
            ],
            generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = new Error(`Gemini (${model}) ${response.status}: ${result.error?.message || "failed"}`);
        continue;
      }
      const text = result.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      return JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, ""));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("تعذّر تحليل الصورة");
}

/** Keep only real catalogue ids, de-duplicated, best first. */
export function pickMatches(raw, products) {
  const byId = new Map(products.map((p) => [String(p.id), p]));
  const seen = new Set();
  const out = [];
  for (const m of Array.isArray(raw?.matches) ? raw.matches : []) {
    const id = String(m?.id ?? "");
    if (!byId.has(id) || seen.has(id)) continue;
    seen.add(id);
    const p = byId.get(id);
    out.push({
      id: p.id,
      name: p.name,
      price: p.salePrice ?? p.price,
      oldPrice: p.salePrice ? p.price : null,
      currency: p.currency || "SAR",
      image: p.image,
      url: p.url,
      reason: typeof m.reason === "string" ? m.reason.slice(0, 80) : "",
    });
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

export async function visualSearchRequest({ method, body, headers = {}, apiKey = "" }) {
  if (method === "OPTIONS") return json(204);
  if (method !== "POST") return json(405, { success: false, error: "Method not allowed" });

  let data;
  try {
    data = typeof body === "string" ? JSON.parse(body || "{}") : body || {};
  } catch {
    return json(400, { success: false, error: "Invalid JSON body" });
  }

  const image = String(data.image || "");
  const m = IMAGE_RE.exec(image);
  if (!m || image.length > MAX_IMAGE_CHARS) {
    return json(400, { success: false, error: "صورة غير صالحة أو كبيرة جدًا" });
  }

  try {
    if (!(await allowed(clientIp(headers)))) {
      return json(429, { success: false, error: "محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى" });
    }
    if (!apiKey) return json(503, { success: false, error: "البحث بالصورة غير متاح حاليًا" });

    const products = await loadCatalog();
    if (products.length === 0) {
      return json(200, { success: true, data: { description: "", matches: [] } });
    }
    const raw = await askGemini(apiKey, m[1], m[2], products);
    return json(200, {
      success: true,
      data: {
        description: typeof raw?.description === "string" ? raw.description.slice(0, 200) : "",
        matches: pickMatches(raw, products),
      },
    });
  } catch (err) {
    logError("visual search", err);
    return json(502, { success: false, error: "تعذّر البحث بالصورة. حاول مرة أخرى" });
  }
}
