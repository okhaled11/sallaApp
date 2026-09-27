/**
 * Netlify Serverless Function - Products with sold quantity
 *
 * Served at /.netlify/functions/products (and /api/products via netlify.toml redirect)
 */
import { productsRequest } from "../lib/products-core.js";

export const handler = async (event, _context) =>
  productsRequest({ method: event.httpMethod, body: event.body });
