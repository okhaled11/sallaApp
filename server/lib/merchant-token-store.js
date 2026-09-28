/**
 * Merchant token persistence in Upstash Redis.
 *
 * Keys:
 *   salla:merchant:<id>:tokens        JSON { accessToken, refreshToken, expiresAt, scope, updatedAt }
 *   salla:merchant:<id>:lock          short-lived mutex (SET NX PX)
 *
 * Tokens stay server-side. Rows are returned as:
 *   { merchantId, accessToken, refreshToken, expiresAt: Date, scope, updatedAt: Date|null }
 */
import { randomUUID } from "crypto";
import { getRedis } from "./redis.js";
import { ERROR_CODES, SallaAuthError } from "./errors.js";

// Longer than a refresh round-trip (10s timeout), short enough to recover
// quickly if a function instance dies while holding the lock
const LOCK_TTL_MS = 30_000;
// How long a request waits for another request's refresh before giving up
const LOCK_WAIT_MS = 15_000;
const LOCK_POLL_MS = 200;

// Delete the lock only if we still own it (it may have expired and been
// taken by someone else)
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0`;

const tokensKey = (merchantId) => `salla:merchant:${merchantId}:tokens`;
const lockKey = (merchantId) => `salla:merchant:${merchantId}:lock`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function storageError(error) {
  if (error instanceof SallaAuthError) return error;
  const wrapped = new SallaAuthError(
    ERROR_CODES.STORAGE_ERROR,
    "Storage error while accessing merchant tokens",
    500,
  );
  wrapped.cause = error;
  return wrapped;
}

function toRow(merchantId, stored) {
  if (!stored) return null;
  // Upstash deserializes JSON automatically; handle raw strings too
  const data = typeof stored === "string" ? JSON.parse(stored) : stored;
  return {
    merchantId: String(merchantId),
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: new Date(data.expiresAt),
    scope: data.scope ?? null,
    updatedAt: data.updatedAt ? new Date(data.updatedAt) : null,
  };
}

async function writeTokens(
  redis,
  merchantId,
  { accessToken, refreshToken, expiresAt, scope },
) {
  await redis.set(
    tokensKey(merchantId),
    JSON.stringify({
      accessToken,
      refreshToken,
      expiresAt: new Date(expiresAt).toISOString(),
      scope: scope ?? null,
      updatedAt: new Date().toISOString(),
    }),
  );
}

/**
 * Wait for and take the merchant's lock. Works across serverless instances
 * because the lock lives in Redis.
 */
async function acquireLock(redis, merchantId) {
  const owner = randomUUID();
  const deadline = Date.now() + LOCK_WAIT_MS;

  while (Date.now() < deadline) {
    const acquired = await redis.set(lockKey(merchantId), owner, {
      nx: true,
      px: LOCK_TTL_MS,
    });
    if (acquired === "OK") return owner;
    await sleep(LOCK_POLL_MS);
  }

  throw new SallaAuthError(
    ERROR_CODES.STORAGE_ERROR,
    "Timed out waiting for another request to refresh the store's token. Try again.",
    503,
  );
}

async function releaseLock(redis, merchantId, owner) {
  await redis.eval(RELEASE_LOCK_SCRIPT, [lockKey(merchantId)], [owner]);
}

/**
 * Run `fn(row, save)` while holding the merchant's lock, so only one request
 * at a time can read-and-rotate the refresh token.
 * `row` is null if the merchant has no tokens; `save(tokens)` stores new ones.
 */
export async function withLockedMerchantToken(merchantId, fn) {
  let redis;
  let owner;
  try {
    redis = getRedis();
    owner = await acquireLock(redis, merchantId);
  } catch (error) {
    throw storageError(error);
  }

  try {
    const row = toRow(merchantId, await redis.get(tokensKey(merchantId)));
    const save = (tokens) => writeTokens(redis, merchantId, tokens);
    return await fn(row, save);
  } catch (error) {
    throw storageError(error);
  } finally {
    await releaseLock(redis, merchantId, owner).catch(() => {});
  }
}

/**
 * Insert or replace (on install / reinstall) a merchant's tokens.
 * Takes the lock so it can't interleave with a refresh in progress.
 */
export async function upsertMerchantToken({ merchantId, ...tokens }) {
  await withLockedMerchantToken(merchantId, (_row, save) => save(tokens));
}

export async function getMerchantToken(merchantId) {
  try {
    return toRow(merchantId, await getRedis().get(tokensKey(merchantId)));
  } catch (error) {
    throw storageError(error);
  }
}

export async function deleteMerchantToken(merchantId) {
  try {
    await getRedis().del(tokensKey(merchantId));
  } catch (error) {
    throw storageError(error);
  }
}
