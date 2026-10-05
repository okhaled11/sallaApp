/**
 * Netlify Serverless Function - Virtual try-on settings
 *
 * Served at /.netlify/functions/tryon-config
 */
import { tryonConfigRequest } from "../lib/tryon-config-core.js";

export async function handler(event) {
  return tryonConfigRequest({
    method: event.httpMethod,
    body: event.body,
    query: event.queryStringParameters || {},
  });
}
