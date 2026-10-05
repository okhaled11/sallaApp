/**
 * Netlify Serverless Function - Salla Partner Portal webhooks
 *
 * Served at /api/webhooks/salla (redirected, see netlify.toml)
 */
import { sallaWebhookRequest } from "../lib/webhook-core.js";

export async function handler(event) {
  const body = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";
  return sallaWebhookRequest({ method: event.httpMethod, body, headers: event.headers });
}
