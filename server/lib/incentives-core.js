/**
 * Cart incentives core logic (platform-agnostic).
 *
 * - GET  (public): the storefront script reads the published settings
 * - POST { token, appId, settings }: the dashboard publishes new settings,
 *   only for a verified embedded session
 *
 * Settings are stored in Upstash Redis under one key (single-merchant
 * development setup, like SALLA_ACCESS_TOKEN).
 *
 * Used by the Vercel function (api/incentives.js) and the Netlify function
 * (server/functions/incentives.js).
 */
import { Redis } from "@upstash/redis";
import { verifyEmbeddedToken } from "./verify-token-core.js";
import { ERROR_CODES, SallaAuthError, logError } from "./errors.js";

export const SETTINGS_KEY = "incentives:settings";

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Storefront reads hit the CDN for 30s instead of Redis on every page view
const PUBLIC_CACHE = "public, max-age=0, s-maxage=30";

const respond = (statusCode, payload, extraHeaders = {}) => ({
  statusCode,
  headers: { ...HEADERS, ...extraHeaders },
  body: payload === undefined ? "" : JSON.stringify(payload),
});

let redisClient = null;

function getRedis() {
  if (redisClient) return redisClient;

  // Vercel's Upstash integration names them KV_REST_API_*
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new SallaAuthError(
      ERROR_CODES.CONFIG_MISSING,
      "Server is missing configuration: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN",
      500,
    );
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

/** Test hook: swap the Redis client (pass null to reset). */
export function setRedisClient(client) {
  redisClient = client;
}

const isBool = (value) => typeof value === "boolean";
const isWholeNumber = (value, min) => Number.isInteger(value) && value >= min;

/**
 * Validate the settings coming from the browser and keep known fields only.
 *
 * @returns {{ settings?: object, error?: string }}
 */
export function validateSettings(input) {
  if (!input || typeof input !== "object") {
    return { error: "Settings are required" };
  }
  const { freeShipping, countdown, coupon, lowStock } = input;
  if (!freeShipping || !countdown || !coupon || !lowStock) {
    return { error: "Settings are missing a section" };
  }

  if (!isBool(freeShipping.enabled) || !isWholeNumber(freeShipping.threshold, 1)) {
    return { error: "Free shipping threshold must be a whole number of at least 1" };
  }

  const endsAt = new Date(countdown.endsAt);
  if (!isBool(countdown.enabled) || Number.isNaN(endsAt.getTime())) {
    return { error: "Countdown end date is invalid" };
  }

  if (
    !isBool(coupon.enabled) ||
    typeof coupon.code !== "string" ||
    typeof coupon.text !== "string" ||
    !["inline", "popup"].includes(coupon.display)
  ) {
    return { error: "Coupon settings are invalid" };
  }
  const code = coupon.code.trim().toUpperCase();
  if (code.length > 30 || /\s/.test(code)) {
    return { error: "Coupon code must be up to 30 characters without spaces" };
  }
  const text = coupon.text.trim();
  if (text.length > 80) {
    return { error: "Coupon message must be up to 80 characters" };
  }
  if (coupon.enabled && !code) {
    return { error: "Enter a coupon code or turn the coupon off" };
  }

  if (!isBool(lowStock.enabled) || !isWholeNumber(lowStock.threshold, 1)) {
    return { error: "Stock limit must be a whole number of at least 1" };
  }

  return {
    settings: {
      freeShipping: {
        enabled: freeShipping.enabled,
        threshold: freeShipping.threshold,
      },
      countdown: { enabled: countdown.enabled, endsAt: endsAt.toISOString() },
      coupon: { enabled: coupon.enabled, code, text, display: coupon.display },
      lowStock: { enabled: lowStock.enabled, threshold: lowStock.threshold },
    },
  };
}

function parseBody(body) {
  return typeof body === "string" ? JSON.parse(body || "{}") : body || {};
}

async function saveSettings(body) {
  let data;
  try {
    data = parseBody(body);
  } catch {
    return respond(400, { success: false, error: "Invalid JSON body" });
  }
  const { token, appId } = data;

  if (!token) {
    return respond(400, { success: false, error: "Token is required" });
  }
  if (!appId) {
    return respond(400, { success: false, error: "App ID is required" });
  }

  const { settings, error } = validateSettings(data.settings);
  if (error) {
    return respond(400, { success: false, error });
  }

  const redis = getRedis();

  // Only the merchant dashboard may change what the storefront shows
  const verification = await verifyEmbeddedToken({ token, appId });
  if (!verification.result?.success) {
    throw new SallaAuthError(
      ERROR_CODES.EMBEDDED_TOKEN_INVALID,
      "Embedded session could not be verified. Reopen the app from the Salla dashboard.",
      401,
    );
  }

  const saved = { ...settings, updatedAt: new Date().toISOString() };
  await redis.set(SETTINGS_KEY, saved);
  return respond(200, { success: true, data: { settings: saved } });
}

/**
 * @param {{ method: string, body: unknown }} request - body may be a JSON string or an already-parsed object
 * @returns {Promise<{ statusCode: number, headers: Record<string, string>, body: string }>}
 */
export async function incentivesRequest({ method, body }) {
  try {
    if (method === "OPTIONS") return respond(204);

    if (method === "GET") {
      // null until the merchant publishes for the first time
      const settings = (await getRedis().get(SETTINGS_KEY)) ?? null;
      return respond(
        200,
        { success: true, data: { settings } },
        { "Cache-Control": PUBLIC_CACHE },
      );
    }

    if (method === "POST") return await saveSettings(body);

    return respond(405, { success: false, error: "Method not allowed" });
  } catch (error) {
    logError("Incentives error:", error);
    if (error instanceof SallaAuthError) {
      return respond(error.status, {
        success: false,
        error: error.message,
        code: error.code,
      });
    }
    return respond(500, { success: false, error: "Internal server error" });
  }
}
