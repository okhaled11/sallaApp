/**
 * Visitor-incentive settings store (platform-agnostic).
 *
 * The storefront script loads its config/rules from here at runtime, so the
 * merchant installs the snippet once and later edits apply without re-pasting.
 *
 *   GET  ?store=<id>  public: returns the live (enabled + coupon-activated) rules
 *   POST {token, appId, storeId, config, rules}  embedded-token protected save
 *
 * Storage: Upstash Redis (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN,
 * or the KV_REST_API_* names set by Vercel's integration). Without it, an
 * in-memory map is used (lost on restart; fine for local dev only).
 */
import { Redis } from "@upstash/redis";
import { verifyEmbeddedToken } from "./verify-token-core.js";
import { logError } from "./errors.js";

const STORE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BYTES = 200 * 1024;
const MAX_RULES = 50;

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

const keyFor = (storeId) => `salla-incentives:${storeId}`;

async function readRecord(storeId) {
  const client = getRedis();
  return client ? await client.get(keyFor(storeId)) : memory.get(storeId) || null;
}

async function writeRecord(storeId, record) {
  const client = getRedis();
  if (client) await client.set(keyFor(storeId), record);
  else memory.set(storeId, record);
}

// Never ship rules the merchant has not activated in Salla to the storefront.
function isLiveRule(rule) {
  if (!rule || !rule.enabled || !rule.trigger) return false;
  const inc = rule.incentive || {};
  if (inc.type === "free_product") return inc.isCreatedInSalla === true;
  if (inc.type === "custom" || !inc.couponCode) return true;
  return inc.isCreatedInSalla === true;
}

function parseBody(body) {
  return typeof body === "string" ? JSON.parse(body || "{}") : body || {};
}

/**
 * @param {{ method: string, body?: any, query?: Record<string, string> }} request
 */
export async function incentiveConfigRequest({ method, body, query = {} }) {
  if (method === "OPTIONS") return reply(204);

  try {
    if (method === "GET") {
      const storeId = String(query.store || "");
      if (!STORE_ID_RE.test(storeId)) {
        return reply(400, { success: false, error: "Invalid store id" });
      }
      const record = await readRecord(storeId);
      const data = record
        ? {
            config: record.config || {},
            rules: (record.rules || []).filter(isLiveRule),
            updatedAt: record.updatedAt,
          }
        : null;
      return reply(200, { success: true, data }, { "Cache-Control": "public, max-age=30" });
    }

    if (method !== "POST") return reply(405, { success: false, error: "Method not allowed" });

    let data;
    try {
      data = parseBody(body);
    } catch {
      return reply(400, { success: false, error: "Invalid JSON body" });
    }

    const { token, appId, storeId, config, rules } = data;
    if (!token || !appId) return reply(400, { success: false, error: "token و appId مطلوبان" });
    if (!STORE_ID_RE.test(String(storeId || ""))) {
      return reply(400, { success: false, error: "معرّف المتجر غير صالح" });
    }
    if (!config || typeof config !== "object" || !Array.isArray(rules) || rules.length > MAX_RULES) {
      return reply(400, { success: false, error: "بيانات الإعدادات غير صالحة" });
    }
    if (JSON.stringify({ config, rules }).length > MAX_BYTES) {
      return reply(413, { success: false, error: "حجم الإعدادات كبير جداً" });
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
    await writeRecord(storeId, { config, rules, owner: merchantId || existing?.owner || "", updatedAt });
    return reply(200, { success: true, persisted: Boolean(getRedis()), updatedAt });
  } catch (err) {
    logError("incentiveConfigRequest", err);
    return reply(500, { success: false, error: "تعذر معالجة طلب الإعدادات" });
  }
}
