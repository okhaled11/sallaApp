// Serverless functions (api/*.js on Vercel, server/functions/*.js on Netlify)
export const VERIFY_FUNCTION_URL = "/api/verify-token";
export const PRODUCTS_FUNCTION_URL = "/api/products";
export const UPDATE_PRODUCT_FUNCTION_URL = "/api/update-product";
export const CREATE_COUPON_FUNCTION_URL = "/api/create-coupon";

// App ID - can be overridden via URL parameter ?appId=XXX
export function getAppId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("app_id");
}
