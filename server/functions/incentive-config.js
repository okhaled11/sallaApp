/**
 * Netlify Serverless Function - Visitor incentive settings
 *
 * Served at /.netlify/functions/incentive-config
 */
import { incentiveConfigRequest } from "../lib/incentive-config-core.js";

export async function handler(event) {
  return incentiveConfigRequest({
    method: event.httpMethod,
    body: event.body,
    query: event.queryStringParameters || {},
  });
}
