/**
 * Salla merchant token manager.
 *
 * getValidAccessToken(merchantId) returns an access token that is valid for
 * at least EXPIRY_BUFFER_MS, refreshing it (and persisting the NEW refresh
 * token) when needed.
 *
 * Concurrency: the refresh runs while holding a Postgres row lock on the
 * merchant's row (see withLockedMerchantToken). A request that waited on the
 * lock re-reads the row and reuses the token the first request just saved,
 * so a refresh token is never used twice — even across serverless instances.
 */
import {
  getMerchantToken,
  withLockedMerchantToken,
} from "./merchant-token-store.js";
import { refreshAccessToken } from "./salla-oauth.js";
import { ERROR_CODES, SallaAuthError } from "./errors.js";

// Refresh a little before the real expiry to avoid using a token mid-expiry
export const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export function isTokenFresh(row, now = Date.now()) {
  return (
    Boolean(row?.accessToken) &&
    row.expiresAt instanceof Date &&
    row.expiresAt.getTime() - EXPIRY_BUFFER_MS > now
  );
}

function notAuthorized() {
  return new SallaAuthError(
    ERROR_CODES.MERCHANT_NOT_AUTHORIZED,
    "This store has not authorized the app yet. Install (or reinstall) the app from the Salla dashboard.",
    403,
  );
}

/**
 * @param {string|number} merchantId - Verified Salla merchant (store) ID
 * @param {object} [options]
 * @param {string} [options.rejectedToken] - An access token Salla just
 *   rejected with 401: refresh even if it looks fresh, unless another request
 *   already replaced it.
 * @returns {Promise<string>} access token
 */
export async function getValidAccessToken(merchantId, options = {}) {
  const { rejectedToken } = options;
  const id = String(merchantId);

  const needsRefresh = (row) =>
    !isTokenFresh(row) || (rejectedToken && row.accessToken === rejectedToken);

  // Fast path: no lock / transaction when the stored token is still good
  const current = await getMerchantToken(id);
  if (!current) throw notAuthorized();
  if (!needsRefresh(current)) return current.accessToken;

  return withLockedMerchantToken(id, async (row, save) => {
    if (!row) throw notAuthorized();

    // Another request refreshed while we waited for the lock
    if (!needsRefresh(row)) return row.accessToken;

    if (!row.refreshToken) {
      throw new SallaAuthError(
        ERROR_CODES.MERCHANT_TOKEN_MISSING,
        "No refresh token stored for this store. Reinstall the app from the Salla dashboard.",
        403,
      );
    }

    const tokens = await refreshAccessToken(row.refreshToken);

    await save({
      accessToken: tokens.accessToken,
      // Rotating tokens: always persist the new one. Salla always returns it;
      // the fallback only guards against an unexpected response shape.
      refreshToken: tokens.refreshToken || row.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    });

    console.log("Refreshed Salla access token", {
      merchantId: id,
      expiresAt: tokens.expiresAt.toISOString(),
    });

    return tokens.accessToken;
  });
}
