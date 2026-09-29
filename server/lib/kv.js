/**
 * Upstash Redis client (REST, works in serverless).
 *
 * Uses KV_REST_API_URL / KV_REST_API_TOKEN, which the Upstash integration
 * from the Vercel Marketplace adds to the project automatically.
 *
 * This holds the app's own internal data (the promo campaign snapshot).
 * It is NOT Salla App Settings: those are a form the merchant fills in
 * during install, not private storage — see campaign-core.js.
 */
import { Redis } from "@upstash/redis";
import { requireEnv } from "./errors.js";

let client = null;

export function getKV() {
  if (!client) {
    requireEnv("KV_REST_API_URL", "KV_REST_API_TOKEN");
    client = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }
  return client;
}

/** Test helper: drop the cached client */
export function resetKV() {
  client = null;
}
