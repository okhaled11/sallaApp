/**
 * Vercel Serverless Function - Products with sold quantity
 *
 * Served at /api/products
 */
import { productsRequest } from "../server/lib/products-core.js";

export default async function handler(req, res) {
  const { statusCode, headers, body } = await productsRequest({
    method: req.method,
    body: req.body,
  });

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.status(statusCode).send(body);
}
