/**
 * Salla Special Offers core logic (platform-agnostic): "buy product X, get product Y free".
 *
 * Creates (or updates) a native `buy_x_get_y` special offer via
 *   POST /admin/v2/specialoffers        (scope: specialoffers.read_write)
 *   PUT  /admin/v2/specialoffers/{id}
 *
 * Salla applies the offer in the cart by itself (no coupon code) and the free
 * item is limited to the quantity in `get`, so a customer cannot multiply it.
 */
import { respond, verifyEmbeddedToken } from "./verify-token-core.js";
import { getActiveAccessToken } from "./salla-tokens-core.js";
import { logError, redact } from "./errors.js";

const SALLA_OFFERS_URL = "https://api.salla.dev/admin/v2/specialoffers";
const ID_RE = /^\d+$/;
const MAX_PRODUCTS = 50;

// Accepts an array of ids, or a single id (older clients); returns clean unique ids or null.
function parseIds(many, single) {
  const raw = Array.isArray(many) && many.length ? many : single !== undefined && single !== "" ? [single] : [];
  const ids = [...new Set(raw.map((v) => String(v)))];
  return ids.length > 0 && ids.length <= MAX_PRODUCTS && ids.every((id) => ID_RE.test(id)) ? ids : null;
}

// Quantities come from the merchant: whole numbers from 1 to 100.
function clampQty(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 100) : 1;
}

// Salla validates start_date as a date AND time that must not be in the past, in the
// store's timezone (unknown here). Try Saudi time (UTC+3) a few minutes ahead first,
// then a wider margin for stores whose clock is further ahead.
const START_OFFSETS_MINUTES = [3 * 60 + 5, 5 * 60 + 5];

function dateTime(utcMs, offsetMinutes) {
  return new Date(utcMs + offsetMinutes * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
}

function isoDate(ms) {
  return new Date(ms).toISOString().split("T")[0];
}

function sallaErrorText(result, status) {
  const fields = result?.error?.fields
    ? Object.entries(result.error.fields).map(([k, v]) => `${k}: ${[].concat(v).join(", ")}`).join(" | ")
    : "";
  const message = result?.error?.message || result?.message || "فشل إنشاء العرض في سلة";
  return `استجابة سلة (${status}): ${redact([message, fields].filter(Boolean).join(" — "))}`;
}

/**
 * @param {{ method: string, body: any }} request
 */
export async function createOfferRequest({ method, body }) {
  if (method === "OPTIONS") return respond(204);
  if (method !== "POST") return respond(405, { success: false, error: "Method not allowed" });

  let data;
  try {
    data = typeof body === "string" ? JSON.parse(body || "{}") : body || {};
  } catch {
    return respond(400, { success: false, error: "Invalid JSON body" });
  }

  const { token, appId, name, existing_offer_id } = data;
  const buyQty = clampQty(data.buy_quantity);
  const giftQty = clampQty(data.gift_quantity);
  const buyIds = parseIds(data.buy_product_ids, data.buy_product_id);
  const giftIds = parseIds(data.gift_product_ids, data.gift_product_id);

  if (!buyIds || !giftIds) {
    return respond(400, { success: false, error: "اختر منتج الشراء ومنتج الهدية" });
  }
  if (!token || !appId) {
    return respond(400, { success: false, error: "token و appId مطلوبان" });
  }

  const accessToken = await getActiveAccessToken();
  if (!accessToken) {
    return respond(500, { success: false, error: "SALLA_ACCESS_TOKEN غير متوفر على السيرفر" });
  }

  try {
    const verification = await verifyEmbeddedToken({ token, appId });
    if (!verification.result?.success) {
      return respond(401, { success: false, error: "جلسة التطبيق غير صالحة، أعد فتح التطبيق من لوحة سلة" });
    }
  } catch (err) {
    logError("createOfferRequest:verify", err);
    return respond(401, { success: false, error: "تعذر التحقق من جلسة التطبيق" });
  }

  const title = String(name || "").trim() || "هدية مجانية";
  const payload = {
    name: title,
    message: title,
    applied_channel: "browser_and_application",
    offer_type: "buy_x_get_y",
    applied_to: "product",
    start_date: dateTime(Date.now(), START_OFFSETS_MINUTES[0]),
    expiry_date: isoDate(Date.now() + 365 * 24 * 60 * 60 * 1000),
    buy: { type: "product", quantity: buyQty, products: buyIds.map(Number) },
    get: { type: "product", discount_type: "free-product", quantity: giftQty, products: giftIds.map(Number) },
  };

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  async function send(method, url) {
    const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
    return { res, result: await res.json().catch(() => ({})) };
  }

  try {
    const attempt = async () => {
      let outcome = null;
      if (existing_offer_id && ID_RE.test(String(existing_offer_id))) {
        outcome = await send("PUT", `${SALLA_OFFERS_URL}/${existing_offer_id}`);
        // The old offer may have been deleted in Salla: fall back to creating a new one.
        if (!outcome.res.ok && !outcome.result?.error?.fields?.start_date) outcome = null;
      }
      return outcome || (await send("POST", SALLA_OFFERS_URL));
    };

    let outcome = null;
    for (const offset of START_OFFSETS_MINUTES) {
      payload.start_date = dateTime(Date.now(), offset);
      outcome = await attempt();
      if (outcome.res.ok || !outcome.result?.error?.fields?.start_date) break;
    }

    const { res, result } = outcome;
    if (res.ok && result.status !== "error" && (result.data?.id || existing_offer_id)) {
      const id = result.data?.id ?? existing_offer_id;
      return respond(200, {
        success: true,
        offer: { id },
        message: `تم إنشاء العرض الخاص في سلة: اشترِ ${buyQty} واحصل على ${giftQty} هدية مجاناً (رقم ${id}). تجده في التسويق ← العروض الخاصة.`,
      });
    }

    return respond(res.status >= 400 && res.status < 600 ? res.status : 502, {
      success: false,
      error: sallaErrorText(result, res.status),
    });
  } catch (err) {
    logError("createOfferRequest:call", err);
    return respond(500, { success: false, error: `حدث خطأ أثناء الاتصال بسيرفر سلة: ${err.message}` });
  }
}
