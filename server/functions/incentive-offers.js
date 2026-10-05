/**
 * Netlify Serverless Function - Manual incentive offers (merchant -> visitor)
 *
 * Served at /.netlify/functions/incentive-offers
 */
import { incentiveOffersRequest } from "../lib/incentive-offers-core.js";

export async function handler(event) {
  return incentiveOffersRequest({
    method: event.httpMethod,
    body: event.body,
    query: event.queryStringParameters || {},
  });
}
