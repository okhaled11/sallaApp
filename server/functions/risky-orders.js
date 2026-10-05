/**
 * Netlify Serverless Function - Risky (cash on delivery) orders detector
 *
 * Served at /.netlify/functions/risky-orders
 */
import { riskyOrdersRequest } from "../lib/risky-orders-core.js";

export async function handler(event) {
  return riskyOrdersRequest({
    method: event.httpMethod,
    body: event.body,
  });
}
