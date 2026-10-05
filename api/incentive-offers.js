/**
 * Vercel Serverless Function - Manual incentive offers (merchant -> visitor)
 *
 * Served at /api/incentive-offers
 */
import { incentiveOffersRequest } from "../server/lib/incentive-offers-core.js";

export default async function handler(req, res) {
  const { statusCode, headers, body } = await incentiveOffersRequest({
    method: req.method,
    body: req.body,
    query: req.query || {},
  });

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.status(statusCode).send(body);
}
