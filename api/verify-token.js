/**
 * Vercel Serverless Function - Token Verification
 *
 * Served at /api/verify-token
 */
import { verifyTokenRequest } from "../server/lib/verify-token-core.js";

export default async function handler(req, res) {
  const { statusCode, headers, body } = await verifyTokenRequest({
    method: req.method,
    body: req.body,
  });

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.status(statusCode).send(body);
}
