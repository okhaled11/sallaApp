-- Salla merchant OAuth tokens (server-side only, never sent to the browser).
-- Filled by the app.store.authorize webhook, rotated by the token manager.
--
-- Run with: pnpm db:migrate  (safe to run more than once)

CREATE TABLE IF NOT EXISTS salla_merchant_tokens (
  -- Salla store ID (the "merchant" field of webhook payloads)
  merchant_id    BIGINT      PRIMARY KEY,
  access_token   TEXT        NOT NULL,
  -- Rotating, single-use: always replaced after a successful refresh
  refresh_token  TEXT        NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  scope          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
