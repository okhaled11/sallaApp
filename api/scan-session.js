/**
 * Vercel Serverless Function - Scan-to-Product (QR phone capture + AI draft + publish)
 *
 * Served at /api/scan-session
 */
import { scanSessionRequest } from "../server/lib/scan-session-core.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const { statusCode, headers, body, isBase64Encoded } = await scanSessionRequest({
    method: req.method,
    body: req.body,
    query: req.query || {},
    headers: req.headers || {},
  });

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.status(statusCode).send(isBase64Encoded ? Buffer.from(body, "base64") : body);
}
