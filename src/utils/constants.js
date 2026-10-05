// Serverless functions (api/*.js on Vercel, server/functions/*.js on Netlify)
export const VERIFY_FUNCTION_URL = "/api/verify-token";
export const PRODUCTS_FUNCTION_URL = "/api/products";
export const UPDATE_PRODUCT_FUNCTION_URL = "/api/update-product";
export const CREATE_COUPON_FUNCTION_URL = "/api/create-coupon";
export const CREATE_OFFER_FUNCTION_URL = "/api/create-offer";
export const COUPON_STATS_FUNCTION_URL = "/api/coupon-stats";
export const INCENTIVE_CONFIG_FUNCTION_URL = "/api/incentive-config";
export const INCENTIVE_OFFERS_FUNCTION_URL = "/api/incentive-offers";

// App ID - can be overridden via URL parameter ?appId=XXX
export function getAppId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("app_id");
}
