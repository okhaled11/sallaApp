/**
 * Vercel Serverless Function - Promo campaign (get / save / stop)
 *
 * Served at /api/campaign
 */
import { campaignRequest } from "../server/lib/campaign-core.js";

export default async function handler(req, res) {
  const { statusCode, headers, body } = await campaignRequest({
    method: req.method,
    body: req.body,
  });

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.status(statusCode).send(body);
}
