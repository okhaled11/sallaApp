/**
 * Netlify Serverless Function - Public campaign for the storefront popup
 *
 * Served at /.netlify/functions/storefront-campaign (and /api/storefront-campaign via netlify.toml redirect)
 */
import { storefrontCampaignRequest } from "../lib/campaign-core.js";

export const handler = async (event, _context) =>
  storefrontCampaignRequest({
    method: event.httpMethod,
    query: event.queryStringParameters,
  });
