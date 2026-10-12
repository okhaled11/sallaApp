/**
 * Netlify Serverless Function - Visual search
 *
 * Served at /.netlify/functions/visual-search
 */
import { visualSearchRequest } from "../lib/visual-search-core.js";

export async function handler(event) {
  return visualSearchRequest({
    method: event.httpMethod,
    body: event.body,
    headers: event.headers || {},
  });
}
