/**
 * Netlify Serverless Function - Salla app webhooks
 *
 * Served at /.netlify/functions/salla-webhook (and /api/webhooks/salla via netlify.toml redirect)
 */
import { handleSallaWebhook } from "../lib/salla-webhook-core.js";

export const handler = async (event, _context) =>
  handleSallaWebhook({
    method: event.httpMethod,
    headers: event.headers,
    rawBody: event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "",
  });
