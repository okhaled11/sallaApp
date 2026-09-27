/**
 * Token verification core logic (platform-agnostic).
 *
 * Proxies the request to the Salla exchange authority service.
 * Used by both the Vercel function (api/verify-token.js) and the
 * Netlify function (server/functions/verify-token.js).
 */

// Environment-based API URLs
const VERIFY_API_URLS = {
  dev: "https://exchange-authority-service-dev-62.merchants.workers.dev/exchange-authority/v1/verify",
  prod: "https://api.salla.dev/exchange-authority/v1/verify",
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
    console.error("Token verification error:", error);
    return respond(500, {
      success: false,
      error: error.message || "Internal server error",
    });
  }
}
