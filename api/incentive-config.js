/**
 * Vercel Serverless Function - Visitor incentive settings (read by the storefront script)
 *
 * Served at /api/incentive-config
 */
import { incentiveConfigRequest } from "../server/lib/incentive-config-core.js";

export default async function handler(req, res) {
  const { statusCode, headers, body } = await incentiveConfigRequest({
    method: req.method,
    body: req.body,
    query: req.query || {},
  });

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.status(statusCode).send(body);
}
