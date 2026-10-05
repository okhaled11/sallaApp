/**
 * Manual incentive offers (platform-agnostic).
 *
 * "Manual" mode: the storefront script never pops the modal up on its own.
 * Instead the merchant presses "تفعيل الخصم" on a visitor row in the studio,
 * which stores an offer for that visitor here; the visitor's page polls for it
 * and shows the modal.
 *
 *   POST {token, appId, storeId, clientId, rule}  embedded-token protected
 *   GET  ?store=<id>&client=<visitorId>           public; returns and consumes the offer
 *
 * Storage: Upstash Redis with a 1 hour TTL (same env vars as the other cores),
 * or an in-memory map for local dev.
 */
import { Redis } from "@upstash/redis";
import { verifyEmbeddedToken } from "./verify-token-core.js";
import { logError } from "./errors.js";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TTL_SECONDS = 60 * 60;
const MAX_BYTES = 20 * 1024;

const headers = (extra = {}) => ({
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  ...extra,
});

const reply = (statusCode, payload) => ({
  statusCode,
  headers: headers(),
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

const keyFor = (storeId, clientId) => `salla-offers:${storeId}:${clientId}`;

async function putOffer(key, offer) {
  const client = getRedis();
  if (client) await client.set(key, offer, { ex: TTL_SECONDS });
  else memory.set(key, { offer, expires: Date.now() + TTL_SECONDS * 1000 });
}

async function takeOffer(key) {
  const client = getRedis();
  if (client) {
    const offer = await client.get(key);
    if (offer) await client.del(key);
    return offer || null;
  }
  const entry = memory.get(key);
  memory.delete(key);
  return entry && entry.expires > Date.now() ? entry.offer : null;
}

/**
 * @param {{ method: string, body?: any, query?: Record<string, string> }} request
 */
export async function incentiveOffersRequest({ method, body, query = {} }) {
  if (method === "OPTIONS") return reply(204);

  try {
    if (method === "GET") {
      const storeId = String(query.store || "");
      const clientId = String(query.client || "");
      if (!ID_RE.test(storeId) || !ID_RE.test(clientId)) {
        return reply(400, { success: false, error: "Invalid store or client id" });
      }
      const offer = await takeOffer(keyFor(storeId, clientId));
      return reply(200, { success: true, data: offer });
    }

    if (method !== "POST") return reply(405, { success: false, error: "Method not allowed" });

    let data;
    try {
      data = typeof body === "string" ? JSON.parse(body || "{}") : body || {};
    } catch {
      return reply(400, { success: false, error: "Invalid JSON body" });
    }

    const { token, appId, storeId, clientId, rule } = data;
    if (!token || !appId) return reply(400, { success: false, error: "token و appId مطلوبان" });
    if (!ID_RE.test(String(storeId || "")) || !ID_RE.test(String(clientId || ""))) {
      return reply(400, { success: false, error: "معرّف المتجر أو الزائر غير صالح" });
    }
    if (!rule || typeof rule !== "object" || JSON.stringify(rule).length > MAX_BYTES) {
      return reply(400, { success: false, error: "بيانات العرض غير صالحة" });
    }

    const { result } = await verifyEmbeddedToken({ token, appId });
    if (!result?.success) return reply(401, { success: false, error: "جلسة التطبيق غير صالحة" });

    await putOffer(keyFor(storeId, clientId), { rule, sentAt: Date.now() });
    return reply(200, { success: true, persisted: Boolean(getRedis()) });
  } catch (err) {
    logError("incentiveOffersRequest", err);
    return reply(500, { success: false, error: "تعذر معالجة طلب العرض" });
  }
}
