/**
 * Vercel Serverless Function - Risky (cash on delivery) orders detector
 *
 * Served at /api/risky-orders
 */
import { riskyOrdersRequest } from "../server/lib/risky-orders-core.js";

export default async function handler(req, res) {
  const { statusCode, headers, body } = await riskyOrdersRequest({
    method: req.method,
    body: req.body,
  });

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.status(statusCode).send(body);
}
