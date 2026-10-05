/**
 * Vercel Serverless Function - Create Salla "buy X get Y free" special offer
 *
 * Served at /api/create-offer
 */
import { createOfferRequest } from "../server/lib/special-offers-core.js";

export default async function handler(req, res) {
  const { statusCode, headers, body } = await createOfferRequest({
    method: req.method,
    body: req.body,
  });

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.status(statusCode).send(body);
}
