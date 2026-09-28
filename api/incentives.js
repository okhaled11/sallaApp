/**
 * Vercel Serverless Function - Read (storefront) / publish (dashboard) cart incentives
 *
 * Served at /api/incentives
 */
import { incentivesRequest } from "../server/lib/incentives-core.js";

export default async function handler(req, res) {
  const { statusCode, headers, body } = await incentivesRequest({
    method: req.method,
    body: req.body,
  });

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.status(statusCode).send(body);
}
