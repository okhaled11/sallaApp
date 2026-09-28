#!/usr/bin/env node
/* global console, process */

/**
 * Create / update the database schema (db/schema.sql).
 *
 * Usage:
 *   DATABASE_URL="postgres://..." pnpm db:migrate
 *   # or with a local .env file:
 *   node --env-file=.env scripts/db-migrate.js
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { redact } from "../server/lib/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "..", "db", "schema.sql");

if (!process.env.DATABASE_URL) {
  console.error("✗ DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query(readFileSync(schemaPath, "utf-8"));
  console.log("✓ Database schema is up to date (salla_merchant_tokens)");
} catch (error) {
  // Only the message: never print the connection string
  console.error(`✗ Migration failed: ${redact(error.message)}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
