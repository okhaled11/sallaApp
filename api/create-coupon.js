/**
 * Vercel Serverless Function - Create Salla purchase coupon
 *
 * Served at /api/create-coupon
 */
import { createCouponRequest } from "../server/lib/coupons-core.js";

export default async function handler(req, res) {
  const { statusCode, headers, body } = await createCouponRequest({
    method: req.method,
    body: req.body,
  });

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.status(statusCode).send(body);
}
