/**
 * PostgreSQL connection pool (lazy, one per serverless instance).
 *
 * Expects DATABASE_URL, e.g.
 *   postgres://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
 */
import pg from "pg";
import { redact, requireEnv } from "./errors.js";

let pool = null;

export function getPool() {
  if (!pool) {
    requireEnv("DATABASE_URL");
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      // Serverless: keep few connections per instance, release idle ones fast
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    // An idle client error must not crash the function
    pool.on("error", (error) => {
      console.error("Postgres pool error:", redact(error.message));
    });
  }
  return pool;
}

/** Test helper: drop the cached pool */
export function resetPool() {
  pool = null;
}
