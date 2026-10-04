/**
 * Netlify Serverless Function - Create Salla purchase coupon
 *
 * Served at /.netlify/functions/create-coupon
 */
import { createCouponRequest } from "../lib/coupons-core.js";

export async function handler(event) {
  return createCouponRequest({
    method: event.httpMethod,
    body: event.body,
  });
}
