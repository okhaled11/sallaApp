/**
 * Salla app webhook handler (platform-agnostic).
 *
 * Events:
 *   app.store.authorize -> upsert the merchant's OAuth tokens
 *   app.uninstalled     -> delete the merchant's tokens
 *   anything else       -> acknowledged and ignored
 *
 * Security (configured per app in Salla Partners -> Webhooks):
 *   X-Salla-Security-Strategy: Signature
 *     X-Salla-Signature = hex HMAC-SHA256(request body, SALLA_WEBHOOK_SECRET)
 *   X-Salla-Security-Strategy: Token
 *     Authorization = the token configured in Salla Partners (SALLA_WEBHOOK_SECRET)
 *
 * Requests without a valid signature/token are rejected with 401.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { respond } from "./verify-token-core.js";
import {
  upsertMerchantToken,
  deleteMerchantToken,
} from "./merchant-token-store.js";
import { SallaAuthError, logError } from "./errors.js";

function getHeader(headers, name) {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      return Array.isArray(value) ? value[0] : value;
    }
  }
  return undefined;
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function hmacHex(secret, payload) {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

/**
 * @param {{ headers: object, rawBody: string, parsedBody?: object }} params
 * @returns {{ valid: boolean, reason?: string }}
 */
export function verifyWebhookRequest({ headers, rawBody, parsedBody }) {
  const secret = process.env.SALLA_WEBHOOK_SECRET;
  if (!secret) {
    return { valid: false, reason: "SALLA_WEBHOOK_SECRET is not configured" };
  }

  const strategy = (
    getHeader(headers, "x-salla-security-strategy") || ""
  ).toLowerCase();

  if (strategy === "signature") {
    const signature = (getHeader(headers, "x-salla-signature") || "").trim();
    if (!signature) return { valid: false, reason: "Missing signature" };

    // The raw body is what Salla signs. Salla's own sample re-serializes the
    // parsed JSON, so accept that form too (both require the secret).
    const candidates = [rawBody];
    if (parsedBody) candidates.push(JSON.stringify(parsedBody));

    const matches = candidates.some(
      (body) =>
        typeof body === "string" &&
        safeEqual(hmacHex(secret, body), signature.toLowerCase()),
    );
    return matches
      ? { valid: true }
      : { valid: false, reason: "Invalid signature" };
  }

  if (strategy === "token") {
    const token = (getHeader(headers, "authorization") || "")
      .replace(/^Bearer\s+/i, "")
      .trim();
    return safeEqual(token, secret)
      ? { valid: true }
      : { valid: false, reason: "Invalid token" };
  }

  return { valid: false, reason: "Unknown security strategy" };
}

/**
 * Convert Salla's `expires` (Unix timestamp in seconds per the docs) to a Date.
 * Unknown values become "now" so the first API call refreshes the token.
 */
export function parseExpires(expires, now = Date.now()) {
  if (expires === null || expires === undefined || expires === "") {
    return new Date(now);
  }
  const numeric = Number(expires);
  if (Number.isFinite(numeric) && numeric > 0) {
    // Seconds (10 digits) vs milliseconds (13 digits)
    return new Date(numeric < 1e12 ? numeric * 1000 : numeric);
  }
  const parsed = Date.parse(expires);
  return Number.isNaN(parsed) ? new Date(now) : new Date(parsed);
}

function parseMerchantId(merchant) {
  const id = typeof merchant === "object" ? merchant?.id : merchant;
  return /^\d+$/.test(String(id ?? "")) ? String(id) : null;
}

/**
 * @param {{ method: string, headers: object, rawBody: string }} request
 * @returns {Promise<{ statusCode: number, headers: Record<string, string>, body: string }>}
 */
export async function handleSallaWebhook({ method, headers, rawBody }) {
  if (method !== "POST") {
    return respond(405, { success: false, error: "Method not allowed" });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody || "");
  } catch {
    return respond(400, { success: false, error: "Invalid JSON body" });
  }

  const verification = verifyWebhookRequest({
    headers,
    rawBody,
    parsedBody: payload,
  });
  if (!verification.valid) {
    console.warn("Rejected Salla webhook:", verification.reason);
    return respond(401, { success: false, error: "Unauthorized webhook" });
  }

  const event = payload?.event;
  const merchantId = parseMerchantId(payload?.merchant);

  try {
    if (event === "app.store.authorize") {
      const data = payload.data || {};
      if (!merchantId || !data.access_token || !data.refresh_token) {
        return respond(400, {
          success: false,
          error: "app.store.authorize payload is missing merchant or tokens",
        });
      }

      const expiresAt = parseExpires(data.expires);
      await upsertMerchantToken({
        merchantId,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt,
        scope: data.scope ?? null,
      });

      // Never log token values
      console.log("Stored Salla merchant tokens", {
        event,
        merchantId,
        expiresAt: expiresAt.toISOString(),
        scope: data.scope ?? null,
      });
      return respond(200, { success: true, event, merchant: merchantId });
    }

    if (event === "app.uninstalled") {
      if (merchantId) {
        await deleteMerchantToken(merchantId);
        console.log("Deleted Salla merchant tokens", { event, merchantId });
      }
      return respond(200, { success: true, event, merchant: merchantId });
    }

    // Acknowledge other events so Salla does not retry them
    return respond(200, { success: true, event, ignored: true });
  } catch (error) {
    logError("Salla webhook error:", error);
    // Non-2xx makes Salla retry the webhook later
    return respond(error instanceof SallaAuthError ? error.status : 500, {
      success: false,
      error:
        error instanceof SallaAuthError
          ? error.message
          : "Internal server error",
    });
  }
}
