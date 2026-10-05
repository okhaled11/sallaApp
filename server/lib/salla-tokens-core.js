/**
 * Self-refreshing Salla merchant access token (platform-agnostic).
 *
 * Replaces the manual "copy access_token from a webhook inspector, paste into
 * Vercel, redeploy every ~14 days" flow:
 *
 *   1. The `app.store.authorize` webhook (see webhook-core.js) delivers
 *      {access_token, refresh_token, expires} and this module stores it.
 *   2. getActiveAccessToken() is called by every Salla API request. When the
 *      stored token is close to expiring, it is refreshed via
 *      POST https://accounts.salla.sa/oauth2/token (grant_type=refresh_token)
 *      and the new token is stored, transparently to the caller.
 *
 * Storage: Upstash Redis (same env vars as incentive-config-core.js), or an
 * in-memory map as a local-dev fallback (lost on restart).
 *
 * Backward compatible: until the webhook has delivered a token,
 * getActiveAccessToken() falls back to the static SALLA_ACCESS_TOKEN env var.
 */
import { Redis } from "@upstash/redis";
import { logError } from "./errors.js";

const TOKEN_REFRESH_URL = "https://accounts.salla.sa/oauth2/token";
// Refresh a day ahead of the real expiry so a slow request never races it.
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;
// Single-merchant setup (see README): one token record for the whole app.
const STORE_KEY = "salla-tokens:default";

const memory = new Map();
let redis;

function getRedis() {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

async function readToken() {
  const client = getRedis();
  return client ? await client.get(STORE_KEY) : memory.get(STORE_KEY) || null;
}

async function writeToken(record) {
  const client = getRedis();
  if (client) await client.set(STORE_KEY, record);
  else memory.set(STORE_KEY, record);
}

/**
 * Called by the webhook handler when Salla pushes `app.store.authorize`.
 * @param {{ access_token: string, refresh_token?: string, expires?: number|string, merchant?: string|number }} params
 */
export async function saveTokenFromWebhook({ access_token, refresh_token, expires, merchant }) {
  if (!access_token) return;
  await writeToken({
    access_token,
    refresh_token: refresh_token || null,
    // Salla sends `expires` as a Unix timestamp (seconds)
    expires: Number(expires) || null,
    merchant: merchant != null ? String(merchant) : null,
    updatedAt: Date.now(),
  });
}

/**
 * Non-secret snapshot for debugging "which token is the server using?".
 * Never includes the token values themselves.
 */
export async function getTokenStatus() {
  const stored = await readToken();
  return {
    storedFromWebhook: Boolean(stored?.access_token),
    expiresAt: stored?.expires ? new Date(stored.expires * 1000).toISOString() : null,
    expired: stored?.expires ? stored.expires * 1000 < Date.now() : null,
    hasRefreshToken: Boolean(stored?.refresh_token),
    canAutoRefresh: Boolean(process.env.SALLA_CLIENT_ID && process.env.SALLA_CLIENT_SECRET),
    receivedAt: stored?.updatedAt ? new Date(stored.updatedAt).toISOString() : null,
    persistentStorage: Boolean(getRedis()),
    envFallbackSet: Boolean(process.env.SALLA_ACCESS_TOKEN),
    activeSource: stored?.access_token ? "webhook" : process.env.SALLA_ACCESS_TOKEN ? "env" : "none",
  };
}

/** Called on `app.uninstalled` so a stale token cannot keep being used. */
export async function clearStoredToken() {
  const client = getRedis();
  if (client) await client.del(STORE_KEY);
  else memory.delete(STORE_KEY);
}

async function refreshAccessToken(refreshToken) {
  const clientId = process.env.SALLA_CLIENT_ID;
  const clientSecret = process.env.SALLA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch(TOKEN_REFRESH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) {
      logError("salla-tokens:refresh", new Error(`Refresh failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`));
      return null;
    }
    return json;
  } catch (err) {
    logError("salla-tokens:refresh", err);
    return null;
  }
}

/**
 * Returns a ready-to-use access token, refreshing it first if it is close to
 * expiring. Returns null only when nothing is available at all (no stored
 * token AND no SALLA_ACCESS_TOKEN env var).
 */
export async function getActiveAccessToken() {
  const stored = await readToken();
  if (!stored?.access_token) {
    return process.env.SALLA_ACCESS_TOKEN || null;
  }

  const expiresAtMs = stored.expires ? stored.expires * 1000 : 0;
  const needsRefresh = expiresAtMs > 0 && Date.now() > expiresAtMs - REFRESH_MARGIN_MS;
  if (!needsRefresh || !stored.refresh_token) {
    return stored.access_token;
  }

  const refreshed = await refreshAccessToken(stored.refresh_token);
  if (!refreshed) {
    // Refresh failed: keep using the current token, it may still be valid.
    return stored.access_token;
  }

  const expires = refreshed.expires_in
    ? Math.floor(Date.now() / 1000) + Number(refreshed.expires_in)
    : stored.expires;
  await writeToken({
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || stored.refresh_token,
    expires,
    merchant: stored.merchant,
    updatedAt: Date.now(),
  });
  return refreshed.access_token;
}
