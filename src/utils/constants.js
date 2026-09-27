// Token verification is handled by a serverless function (api/verify-token.js on Vercel)
export const VERIFY_FUNCTION_URL = "/api/verify-token";

// App ID - can be overridden via URL parameter ?appId=XXX
export function getAppId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("app_id");
}
