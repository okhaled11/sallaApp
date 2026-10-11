import { SCAN_SESSION_FUNCTION_URL, getAppId } from "./constants.js";
import logger from "./logger.js";

async function post(payload, label) {
  try {
    const response = await fetch(SCAN_SESSION_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok && result.success === undefined) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    return result;
  } catch (error) {
    logger.error(`${label} error:`, error);
    return { success: false, error: error.message };
  }
}

export const scanImageUrl = (token) => `${SCAN_SESSION_FUNCTION_URL}?img=${token}`;

/** Build the URL the phone opens (encoded in the QR). */
export function buildPhoneUrl(baseUrl, sid, phoneKey) {
  const url = new URL(baseUrl || window.location.origin);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  url.searchParams.set("m", "capture");
  url.searchParams.set("s", sid);
  url.searchParams.set("k", phoneKey);
  return url.toString();
}

// dashboard
export const createScanSession = (token) =>
  post({ action: "create", token, appId: getAppId() }, "Scan create");
export const pollScanSession = (sid, deskKey) =>
  post({ action: "poll", sid, deskKey }, "Scan poll");
export const publishScannedProduct = (token, sid, deskKey, product) =>
  post({ action: "publish", token, appId: getAppId(), sid, deskKey, product }, "Scan publish");

// phone
export const joinScanSession = (sid, phoneKey) => post({ action: "join", sid, phoneKey }, "Scan join");
export const uploadScanImage = (sid, phoneKey, image) =>
  post({ action: "upload", sid, phoneKey, image }, "Scan upload");
export const analyzeScanSession = (sid, phoneKey) =>
  post({ action: "analyze", sid, phoneKey }, "Scan analyze");
