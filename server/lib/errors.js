/**
 * Safe, typed errors for the Salla API flow.
 *
 * `message` is always safe to return to the browser: it never contains
 * tokens or secrets.
 */

export const ERROR_CODES = {
  CONFIG_MISSING: "CONFIG_MISSING",
  EMBEDDED_TOKEN_INVALID: "EMBEDDED_TOKEN_INVALID",
  SALLA_UNAUTHORIZED: "SALLA_UNAUTHORIZED",
  SALLA_FORBIDDEN: "SALLA_FORBIDDEN",
  SALLA_API_ERROR: "SALLA_API_ERROR",
};

export class SallaAuthError extends Error {
  /**
   * @param {string} code - One of ERROR_CODES
   * @param {string} message - Safe, user-facing message
   * @param {number} status - HTTP status to return
   */
  constructor(code, message, status = 500) {
    super(message);
    this.name = "SallaAuthError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Throw CONFIG_MISSING if any env var is missing (names only, never values).
 */
export function requireEnv(...names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new SallaAuthError(
      ERROR_CODES.CONFIG_MISSING,
      `Server is missing configuration: ${missing.join(", ")}`,
      500,
    );
  }
}

const SECRET_ENV_VARS = ["SALLA_ACCESS_TOKEN", "SALLA_CLIENT_SECRET"];

// Salla (Ory) tokens, bearer headers, and credentials inside URLs
const SECRET_PATTERNS = [
  /ory_(at|rt)_[A-Za-z0-9._~+/=-]+/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /(postgres(?:ql)?:\/\/)[^@\s]+@/gi,
  /("?(?:access_token|refresh_token|client_secret)"?\s*[:=]\s*"?)[^"&,\s}]+/gi,
];

/**
 * Remove anything that looks like a secret from a string.
 */
export function redact(text) {
  if (typeof text !== "string") return text;
  let result = text;

  for (const name of SECRET_ENV_VARS) {
    const value = process.env[name];
    if (value && value.length >= 6) {
      result = result.split(value).join("[REDACTED]");
    }
  }

  result = result
    .replace(SECRET_PATTERNS[0], "[REDACTED]")
    .replace(SECRET_PATTERNS[1], "Bearer [REDACTED]")
    .replace(SECRET_PATTERNS[2], "$1[REDACTED]@")
    .replace(SECRET_PATTERNS[3], "$1[REDACTED]");

  return result;
}

/**
 * A log-safe summary of an error (no stack args, no request bodies).
 */
export function toLoggable(error) {
  if (!(error instanceof Error)) return { message: redact(String(error)) };
  return {
    name: error.name,
    code: error.code,
    status: error.status,
    message: redact(error.message),
  };
}

/**
 * Log an error without leaking secrets.
 */
export function logError(label, error) {
  console.error(label, toLoggable(error));
}
