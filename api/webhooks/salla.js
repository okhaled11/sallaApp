/**
 * Vercel Serverless Function - Salla Partner Portal webhooks
 *
 * Served at /api/webhooks/salla
 *
 * The body parser is disabled so we receive the exact bytes Salla signed;
 * the HMAC in X-Salla-Signature cannot be verified from re-serialized JSON.
 */
import { sallaWebhookRequest } from "../../server/lib/webhook-core.js";

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req, res) {
  const body = req.method === "POST" ? await readRawBody(req) : "";
  const { statusCode, headers, body: out } = await sallaWebhookRequest({
    method: req.method,
    body,
    headers: req.headers,
  });

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.status(statusCode).send(out);
}
