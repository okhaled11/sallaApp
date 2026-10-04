/**
 * Vercel Serverless Function - Salla coupon statistics
 *
 * Served at /api/coupon-stats
 */
import { couponStatsRequest } from "../server/lib/coupon-stats-core.js";

export default async function handler(req, res) {
  const { statusCode, headers, body } = await couponStatsRequest({
    method: req.method,
    body: req.body,
  });

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.status(statusCode).send(body);
}
