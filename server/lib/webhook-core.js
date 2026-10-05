/**
 * Salla Partner Portal webhook handler (platform-agnostic).
 *
 * Served at /api/webhooks/salla (set as this app's Webhook URL in Salla
 * Partners). Handles the lifecycle events needed to stop managing
 * SALLA_ACCESS_TOKEN by hand:
 *
 *   app.store.authorize -> stores {access_token, refresh_token, expires}
 *                           (salla-tokens-core.js auto-refreshes it later)
 *   app.uninstalled      -> clears the stored token
 *
 * Verifies `X-Salla-Signature` (HMAC-SHA256 of the RAW body, keyed with
 * SALLA_WEBHOOK_SECRET) when the secret is set. Callers must pass the raw
 * body string: re-serializing parsed JSON would not match what Salla signed.
 */
import crypto from "node:crypto";
import { respond } from "./verify-token-core.js";
import { saveTokenFromWebhook, clearStoredToken, getTokenStatus } from "./salla-tokens-core.js";
import { logError } from "./errors.js";

function getHeader(headers, name) {
  if (!headers) return undefined;
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
}

function isValidSignature(rawBody, signature, secret) {
  if (!signature) return false;
  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(String(signature), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * @param {{ method: string, body: string|object, headers?: Record<string, string> }} request
 */
export async function sallaWebhookRequest({ method, body, headers = {} }) {
  if (method === "OPTIONS") return respond(204);
  // Opening the URL in a browser shows which token the server is using (no secrets).
  if (method === "GET") return respond(200, { success: true, token: await getTokenStatus() });
  if (method !== "POST") return respond(405, { success: false, error: "Method not allowed" });

  const rawBody = typeof body === "string" ? body : JSON.stringify(body ?? {});

  const secret = process.env.SALLA_WEBHOOK_SECRET;
  if (secret) {
    const signature = getHeader(headers, "x-salla-signature");
    if (!isValidSignature(rawBody, signature, secret)) {
      logError("sallaWebhookRequest", new Error("Invalid or missing X-Salla-Signature"));
      return respond(401, { success: false, error: "Invalid signature" });
    }
  }

  let data;
  try {
    data = typeof body === "string" ? JSON.parse(body || "{}") : body || {};
  } catch {
    return respond(400, { success: false, error: "Invalid JSON body" });
  }

  try {
    switch (data.event) {
      case "app.store.authorize": {
        const d = data.data || data;
        await saveTokenFromWebhook({
          access_token: d.access_token,
          refresh_token: d.refresh_token,
          expires: d.expires,
          merchant: data.merchant ?? d.merchant,
        });
        break;
      }
      case "app.uninstalled":
        await clearStoredToken();
        break;
      default:
        break;
    }
  } catch (err) {
    logError("sallaWebhookRequest:handle", err);
    return respond(500, { success: false, error: "Failed to process webhook" });
  }

  return respond(200, { success: true });
}
