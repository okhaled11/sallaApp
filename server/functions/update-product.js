/**
 * Netlify Serverless Function - Update product price / quantity
 *
 * Served at /.netlify/functions/update-product (and /api/update-product via netlify.toml redirect)
 */
import { updateProductRequest } from "../lib/products-core.js";

export const handler = async (event, _context) =>
  updateProductRequest({ method: event.httpMethod, body: event.body });
