/**
 * Vercel Serverless Function - Visual search (find products from a photo)
 *
 * Served at /api/visual-search
 */
import { visualSearchRequest } from "../server/lib/visual-search-core.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  const { statusCode, headers, body } = await visualSearchRequest({
    method: req.method,
    body: req.body,
    headers: req.headers || {},
  });

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.status(statusCode).send(body);
}
