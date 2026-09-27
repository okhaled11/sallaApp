/**
 * Vercel Serverless Function - Update product price / quantity
 *
 * Served at /api/update-product
 */
import { updateProductRequest } from "../server/lib/products-core.js";

export default async function handler(req, res) {
  const { statusCode, headers, body } = await updateProductRequest({
    method: req.method,
    body: req.body,
  });

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.status(statusCode).send(body);
}
