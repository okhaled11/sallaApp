/**
 * Vercel Serverless Function - Salla app webhooks
 *
 * Served at /api/webhooks/salla
 * Set this URL as the Webhook URL of the app in Salla Partners.
 */
import { handleSallaWebhook } from "../../server/lib/salla-webhook-core.js";

/**
 * Read the exact bytes Salla sent (needed for the HMAC signature).
 * Falls back to the body Vercel already parsed, if the stream was consumed.
 */
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length) return Buffer.concat(chunks).toString("utf8");

  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  return "";
}

export default async function handler(req, res) {
  const rawBody = req.method === "POST" ? await readRawBody(req) : "";

  const { statusCode, headers, body } = await handleSallaWebhook({
    method: req.method,
    headers: req.headers,
    rawBody,
  });

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.status(statusCode).send(body);
}
