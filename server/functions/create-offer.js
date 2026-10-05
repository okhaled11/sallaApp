/**
 * Netlify Serverless Function - Create Salla "buy X get Y free" special offer
 *
 * Served at /.netlify/functions/create-offer
 */
import { createOfferRequest } from "../lib/special-offers-core.js";

export async function handler(event) {
  return createOfferRequest({
    method: event.httpMethod,
    body: event.body,
  });
}
