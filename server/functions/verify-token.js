/**
 * Netlify Serverless Function - Token Verification
 *
 * Served at /.netlify/functions/verify-token (and /api/verify-token via netlify.toml redirect)
 */
import { verifyTokenRequest } from "../lib/verify-token-core.js";

export const handler = async (event, _context) =>
  verifyTokenRequest({ method: event.httpMethod, body: event.body });
