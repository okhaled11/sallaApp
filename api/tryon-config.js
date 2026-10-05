/**
 * Vercel Serverless Function - Virtual try-on settings (read by the storefront script)
 *
 * Served at /api/tryon-config
 */
import { tryonConfigRequest } from "../server/lib/tryon-config-core.js";

export default async function handler(req, res) {
  const { statusCode, headers, body } = await tryonConfigRequest({
    method: req.method,
    body: req.body,
    query: req.query || {},
  });

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.status(statusCode).send(body);
}
