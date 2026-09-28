/**
 * Token verification core logic (platform-agnostic).
 *
 * Proxies the request to the Salla exchange authority service.
 * Used by both the Vercel function (api/verify-token.js) and the
 * Netlify function (server/functions/verify-token.js).
 */
import { logError } from "./errors.js";

// Environment-based API URLs
const VERIFY_API_URLS = {
  dev: "https://exchange-authority-service-dev-62.merchants.workers.dev/exchange-authority/v1/verify",
  prod: "https://api.salla.dev/exchange-authority/v1/verify",
};

// Same service; introspect also returns who the token belongs to
// ({ merchant_id, user_id, exp }), as used by embedded.auth.introspect()
const INTROSPECT_API_URLS = {
  dev: "https://exchange-authority-service-dev-62.merchants.workers.dev/exchange-authority/v1/introspect",
  prod: "https://api.salla.dev/exchange-authority/v1/introspect",
};

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const respond = (statusCode, payload) => ({
  statusCode,
  headers: JSON_HEADERS,
  body: payload === undefined ? "" : JSON.stringify(payload),
});

/**
 * Introspect an embedded token server-side and return the merchant it was
 * issued for. The merchant ID comes from Salla's answer, never from the
 * browser, so a client cannot ask for another store's data.
 *
 * @param {{ token: string, appId: string }} params
 * @returns {Promise<{ verified: boolean, merchantId: string|null }>}
 */
export async function introspectEmbeddedToken({ token, appId }) {
  const environment = process.env.ENV || "prod";
  const apiUrl = INTROSPECT_API_URLS[environment];
  if (!apiUrl) {
    return { verified: false, merchantId: null };
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "S-Source": appId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token,
      iss: "merchant-dashboard",
      subject: "embedded-page",
      env: environment,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    return { verified: false, merchantId: null };
  }

  const merchantId = result.data?.merchant_id;
  return {
    verified: true,
    merchantId:
      merchantId === null || merchantId === undefined
        ? null
        : String(merchantId),
  };
}

/**
 * Verify an embedded token against the Salla exchange authority service.
 *
 * @param {{ token: string, appId: string, iss?: string, subject?: string }} params
 * @returns {Promise<{ status: number, result: any }>}
 */
export async function verifyEmbeddedToken({ token, appId, iss, subject }) {
  // Determine environment (default to 'prod' when ENV is not set)
  const environment = process.env.ENV || "prod";

  const apiUrl = VERIFY_API_URLS[environment];
  if (!apiUrl) {
    return {
      status: 400,
      result: {
        success: false,
        error: `Invalid environment: ${environment}. Must be 'dev' or 'prod'`,
      },
    };
  }

  console.log("Verifying token with Salla API", {
    apiUrl,
    appId,
    token: "[REDACTED]",
    iss: iss || "merchant-dashboard",
    subject: subject || "embedded-page",
    env: environment,
  });

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "s-source": appId, // APP ID (dynamic)
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token,
      iss: iss || "merchant-dashboard",
      subject: subject || "embedded-page",
      env: environment,
    }),
  });

  console.log("Salla API response status:", response.status);

  const result = await response.json();
  return { status: response.status, result };
}

/**
 * @param {{ method: string, body: unknown }} request - body may be a JSON string or an already-parsed object
 * @returns {Promise<{ statusCode: number, headers: Record<string, string>, body: string }>}
 */
export async function verifyTokenRequest({ method, body }) {
  if (method === "OPTIONS") {
    return respond(204);
  }

  // Only allow POST requests
  if (method !== "POST") {
    return respond(405, { success: false, error: "Method not allowed" });
  }

  try {
    const data =
      typeof body === "string" ? JSON.parse(body || "{}") : body || {};
    const { token, iss, subject, appId } = data;

    if (!token) {
      return respond(400, { success: false, error: "Token is required" });
    }

    if (!appId) {
      return respond(400, { success: false, error: "App ID is required" });
    }

    const { status, result } = await verifyEmbeddedToken({
      token,
      appId,
      iss,
      subject,
    });
    return respond(status, result);
  } catch (error) {
    logError("Token verification error:", error);
    return respond(500, {
      success: false,
      error: error.message || "Internal server error",
    });
  }
}
