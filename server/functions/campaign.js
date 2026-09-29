/**
 * Netlify Serverless Function - Promo campaign (get / save / stop)
 *
 * Served at /.netlify/functions/campaign (and /api/campaign via netlify.toml redirect)
 */
import { campaignRequest } from "../lib/campaign-core.js";

export const handler = async (event, _context) =>
  campaignRequest({ method: event.httpMethod, body: event.body });
