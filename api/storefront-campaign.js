/**
 * Vercel Serverless Function - Public campaign for the storefront popup
 *
 * Served at /api/storefront-campaign?store=<id>
 * Called by public/storefront/campaign.js (loaded by the App Snippet).
 */
import { storefrontCampaignRequest } from "../server/lib/campaign-core.js";

export default async function handler(req, res) {
  const { statusCode, headers, body } = await storefrontCampaignRequest({
    method: req.method,
    query: req.query,
  });

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.status(statusCode).send(body);
}
