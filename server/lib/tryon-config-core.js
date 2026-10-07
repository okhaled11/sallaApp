/**
 * Virtual try-on settings store (platform-agnostic).
 *
 * The storefront script (public/storefront/tryon.js) reads which products offer
 * try-on, and each product's overlay image + placement, from here at runtime.
 *
 *   GET  ?store=<id>  public: returns the enabled items
 *   POST {token, appId, storeId, items}  embedded-token protected save
 *
 * Storage: Upstash Redis (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN,
 * or the KV_REST_API_* names set by Vercel's integration). Without it, an
 * in-memory map is used (lost on restart; fine for local dev only).
 */
import { Redis } from "@upstash/redis";
import { verifyEmbeddedToken } from "./verify-token-core.js";
import { logError } from "./errors.js";

const STORE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PRODUCT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const IMAGE_RE = /^data:image\/(png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_ITEMS = 20;
const MAX_IMAGE_CHARS = 150 * 1024;
const MAX_BYTES = 900 * 1024;

// fit: multiplier on the auto-fitted size (1 = frame as wide as the face at the temples).
export const FIT_RANGE = [0.5, 1.6];
export const OFFSET_RANGE = [-0.5, 0.5];

const headers = (extra = {}) => ({
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  ...extra,
});

const reply = (statusCode, payload, extra) => ({
  statusCode,
  headers: headers(extra),
  body: payload === undefined ? "" : JSON.stringify(payload),
});

const memory = new Map();
let redis;

function getRedis() {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

const keyFor = (storeId) => `salla-tryon:${storeId}`;

async function readRecord(storeId) {
  const client = getRedis();
  return client ? await client.get(keyFor(storeId)) : memory.get(storeId) || null;
}

async function writeRecord(storeId, record) {
  const client = getRedis();
  if (client) await client.set(keyFor(storeId), record);
  else memory.set(storeId, record);
}

const clamp = (value, [min, max], fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export const TYPES = ["glasses", "earrings", "hat", "necklace", "lipstick", "blush", "eyeshadow", "eyeliner"];
export const MAKEUP_TYPES = ["lipstick", "blush", "eyeshadow", "eyeliner"];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const OPACITY_RANGE = [0.2, 1];
const DEFAULT_MAKEUP_COLORS = {
  lipstick: "#c2185b",
  blush: "#e57373",
  eyeshadow: "#8d6e63",
  eyeliner: "#1a1a1a",
};

/**
 * Validates one merchant-submitted item; returns the cleaned item or null.
 * Image types accept only data-URL images so the storefront never loads a remote host;
 * makeup types (lipstick, blush, eyeshadow, eyeliner) carry a color instead of an image.
 */
export function sanitizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const productId = String(raw.productId ?? "");
  if (!PRODUCT_ID_RE.test(productId)) return null;
  const type = TYPES.includes(raw.type) ? raw.type : "glasses";
  const base = {
    productId,
    name: String(raw.name ?? "").slice(0, 120),
    type,
    fit: clamp(raw.fit, FIT_RANGE, 1),
    offsetX: clamp(raw.offsetX, OFFSET_RANGE, 0),
    offsetY: clamp(raw.offsetY, OFFSET_RANGE, 0),
    enabled: raw.enabled !== false,
  };
  if (MAKEUP_TYPES.includes(type)) {
    const fallbackColor = DEFAULT_MAKEUP_COLORS[type] || "#c2185b";
    return {
      ...base,
      image: "",
      color: typeof raw.color === "string" && COLOR_RE.test(raw.color) ? raw.color.toLowerCase() : fallbackColor,
      opacity: clamp(raw.opacity, OPACITY_RANGE, type === "blush" ? 0.5 : type === "eyeliner" ? 0.9 : 0.7),
      finish: raw.finish === "gloss" || raw.finish === "shimmer" ? raw.finish : "matte",
    };
  }
  const image = String(raw.image ?? "");
  if (image.length > MAX_IMAGE_CHARS || !IMAGE_RE.test(image)) return null;
  return { ...base, image, mirror: raw.mirror !== false };
}

function parseBody(body) {
  return typeof body === "string" ? JSON.parse(body || "{}") : body || {};
}

/**
 * @param {{ method: string, body?: any, query?: Record<string, string> }} request
 */
export async function tryonConfigRequest({ method, body, query = {} }) {
  if (method === "OPTIONS") return reply(204);

  try {
    if (method === "GET") {
      const storeId = String(query.store || "");
      if (!STORE_ID_RE.test(storeId)) {
        return reply(400, { success: false, error: "Invalid store id" });
      }
      const record = await readRecord(storeId);
      const items = (record?.items || []).filter((item) => item.enabled);
      return reply(
        200,
        { success: true, data: record ? { items, updatedAt: record.updatedAt } : null },
        { "Cache-Control": "public, max-age=30" },
      );
    }

    if (method !== "POST") return reply(405, { success: false, error: "Method not allowed" });

    let data;
    try {
      data = parseBody(body);
    } catch {
      return reply(400, { success: false, error: "Invalid JSON body" });
    }

    const { token, appId, storeId, items } = data;
    if (!token || !appId) return reply(400, { success: false, error: "token و appId مطلوبان" });
    if (!STORE_ID_RE.test(String(storeId || ""))) {
      return reply(400, { success: false, error: "معرّف المتجر غير صالح" });
    }
    if (!Array.isArray(items) || items.length > MAX_ITEMS) {
      return reply(400, { success: false, error: "بيانات الإعدادات غير صالحة" });
    }

    const clean = items.map(sanitizeItem);
    if (clean.some((item) => item === null)) {
      return reply(400, { success: false, error: "صورة أو بيانات منتج غير صالحة" });
    }
    if (JSON.stringify(clean).length > MAX_BYTES) {
      return reply(413, { success: false, error: "حجم الصور كبير جداً" });
    }

    const { result } = await verifyEmbeddedToken({ token, appId });
    if (!result?.success) return reply(401, { success: false, error: "جلسة التطبيق غير صالحة" });

    // First writer owns the store id; other merchants cannot overwrite it.
    const merchantId = String(result.data?.merchant_id ?? result.merchant_id ?? "");
    const existing = await readRecord(storeId);
    if (existing?.owner && merchantId && existing.owner !== merchantId) {
      return reply(403, { success: false, error: "معرّف المتجر مرتبط بتاجر آخر" });
    }

    const updatedAt = Date.now();
    await writeRecord(storeId, {
      items: clean,
      owner: merchantId || existing?.owner || "",
      updatedAt,
    });
    return reply(200, { success: true, persisted: Boolean(getRedis()), updatedAt });
  } catch (err) {
    logError("tryonConfigRequest", err);
    return reply(500, { success: false, error: "تعذر معالجة طلب الإعدادات" });
  }
}
