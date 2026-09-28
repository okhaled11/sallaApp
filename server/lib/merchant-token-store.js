/**
 * Merchant token persistence (table: salla_merchant_tokens).
 *
 * Tokens stay server-side. Rows are returned in camelCase:
 *   { merchantId, accessToken, refreshToken, expiresAt: Date, scope, updatedAt }
 */
import { getPool } from "./db.js";
import { ERROR_CODES, SallaAuthError } from "./errors.js";

const COLUMNS =
  "merchant_id, access_token, refresh_token, expires_at, scope, updated_at";

// How long a request waits for another request's refresh before giving up
const LOCK_TIMEOUT = "15s";

function toRow(record) {
  if (!record) return null;
  return {
    merchantId: String(record.merchant_id),
    accessToken: record.access_token,
    refreshToken: record.refresh_token,
    expiresAt: new Date(record.expires_at),
    scope: record.scope,
    updatedAt: record.updated_at ? new Date(record.updated_at) : null,
  };
}

function databaseError(error) {
  if (error instanceof SallaAuthError) return error;
  const wrapped = new SallaAuthError(
    ERROR_CODES.DATABASE_ERROR,
    "Database error while accessing merchant tokens",
    500,
  );
  wrapped.cause = error;
  return wrapped;
}

/**
 * Insert or update (on reinstall / re-authorize) a merchant's tokens.
 */
export async function upsertMerchantToken({
  merchantId,
  accessToken,
  refreshToken,
  expiresAt,
  scope,
}) {
  try {
    await getPool().query(
      `INSERT INTO salla_merchant_tokens
         (merchant_id, access_token, refresh_token, expires_at, scope)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (merchant_id) DO UPDATE SET
         access_token  = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expires_at    = EXCLUDED.expires_at,
         scope         = EXCLUDED.scope,
         updated_at    = now()`,
      [merchantId, accessToken, refreshToken, expiresAt, scope ?? null],
    );
  } catch (error) {
    throw databaseError(error);
  }
}

export async function getMerchantToken(merchantId) {
  try {
    const { rows } = await getPool().query(
      `SELECT ${COLUMNS} FROM salla_merchant_tokens WHERE merchant_id = $1`,
      [merchantId],
    );
    return toRow(rows[0]);
  } catch (error) {
    throw databaseError(error);
  }
}

export async function deleteMerchantToken(merchantId) {
  try {
    await getPool().query(
      "DELETE FROM salla_merchant_tokens WHERE merchant_id = $1",
      [merchantId],
    );
  } catch (error) {
    throw databaseError(error);
  }
}

/**
 * Run `fn` while holding a row lock (SELECT ... FOR UPDATE) on the merchant's
 * token row. Any other request for the same merchant waits here until the
 * transaction ends, so only one of them can use the refresh token.
 * Works across serverless instances because the lock lives in Postgres.
 *
 * `fn(row, save)`: row is null if the merchant has no tokens; `save(tokens)`
 * updates the row inside the same transaction.
 */
export async function withLockedMerchantToken(merchantId, fn) {
  let client;
  try {
    client = await getPool().connect();
  } catch (error) {
    throw databaseError(error);
  }

  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

    const { rows } = await client.query(
      `SELECT ${COLUMNS} FROM salla_merchant_tokens
       WHERE merchant_id = $1 FOR UPDATE`,
      [merchantId],
    );

    const save = async ({ accessToken, refreshToken, expiresAt, scope }) => {
      await client.query(
        `UPDATE salla_merchant_tokens SET
           access_token  = $2,
           refresh_token = $3,
           expires_at    = $4,
           scope         = COALESCE($5, scope),
           updated_at    = now()
         WHERE merchant_id = $1`,
        [merchantId, accessToken, refreshToken, expiresAt, scope ?? null],
      );
    };

    const result = await fn(toRow(rows[0]), save);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw databaseError(error);
  } finally {
    client.release();
  }
}
