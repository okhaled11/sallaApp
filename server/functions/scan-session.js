/**
 * Netlify Serverless Function - Scan-to-Product
 *
 * Served at /.netlify/functions/scan-session
 */
import { scanSessionRequest } from "../lib/scan-session-core.js";

export async function handler(event) {
  return scanSessionRequest({
    method: event.httpMethod,
    body: event.body,
    query: event.queryStringParameters || {},
    headers: event.headers || {},
  });
}
