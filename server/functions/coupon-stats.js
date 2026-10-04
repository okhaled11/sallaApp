/**
 * Netlify Serverless Function - Salla coupon statistics
 *
 * Served at /.netlify/functions/coupon-stats
 */
import { couponStatsRequest } from "../lib/coupon-stats-core.js";

export async function handler(event) {
  return couponStatsRequest({
    method: event.httpMethod,
    body: event.body,
  });
}
