/**
 * Salla OAuth client (refresh grant).
 *
 * Docs: POST https://accounts.salla.sa/oauth2/token
 *   Content-Type: application/x-www-form-urlencoded
 *   grant_type=refresh_token, client_id, client_secret, refresh_token
 * Response: { access_token, refresh_token, expires_in, scope, token_type }
 *
 * Refresh tokens are single-use: the response always carries a NEW
 * refresh_token which must replace the old one.
 */
import { ERROR_CODES, SallaAuthError, requireEnv } from "./errors.js";

export const SALLA_TOKEN_URL = "https://accounts.salla.sa/oauth2/token";
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * @param {string} refreshToken - The latest stored refresh token
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresAt: Date, scope: string|null }>}
 */
export async function refreshAccessToken(refreshToken) {
  requireEnv("SALLA_CLIENT_ID", "SALLA_CLIENT_SECRET");

  let response;
  try {
    response = await fetch(SALLA_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.SALLA_CLIENT_ID,
        client_secret: process.env.SALLA_CLIENT_SECRET,
        refresh_token: refreshToken,
      }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SallaAuthError(
      ERROR_CODES.TOKEN_REFRESH_FAILED,
      "Token refresh failed: could not reach Salla accounts service",
      502,
    );
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.access_token) {
    // OAuth error codes (e.g. invalid_grant) are safe to show; token values are not
    const reason = typeof result.error === "string" ? ` (${result.error})` : "";
    const needsReinstall = response.status === 400 || response.status === 401;
    throw new SallaAuthError(
      ERROR_CODES.TOKEN_REFRESH_FAILED,
      needsReinstall
        ? `Token refresh failed${reason}. The store must re-authorize the app (reinstall it from the Salla dashboard).`
        : `Token refresh failed: Salla returned ${response.status}${reason}`,
      needsReinstall ? 401 : 502,
    );
  }

  const expiresIn = Number(result.expires_in);
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    // Unknown lifetime -> treat as expiring now so the next call refreshes
    expiresAt: new Date(
      Date.now() + (Number.isFinite(expiresIn) ? expiresIn * 1000 : 0),
    ),
    scope: result.scope ?? null,
  };
}
