/**
 * Netlify Serverless Function - Read (storefront) / publish (dashboard) cart incentives
 *
 * Served at /.netlify/functions/incentives (and /api/incentives via netlify.toml redirect)
 */
import { incentivesRequest } from "../lib/incentives-core.js";

export const handler = async (event, _context) =>
  incentivesRequest({ method: event.httpMethod, body: event.body });
