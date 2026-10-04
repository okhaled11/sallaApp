/**
 * Salla coupon statistics core logic (platform-agnostic).
 *
 * For each coupon id, calls
 * GET https://api.salla.dev/admin/v2/coupons/statistics/{coupon}  (scope: marketing.read)
 * and reports usage, customers and sales. A 404 means the coupon no longer
 * exists in the store, so the UI can drop its "synced" mark.
 */
import { respond } from "./verify-token-core.js";
import { logError } from "./errors.js";

const SALLA_COUPONS_URL = "https://api.salla.dev/admin/v2/coupons";
const MAX_IDS = 20;

async function fetchStats(id, accessToken) {
  const res = await fetch(`${SALLA_COUPONS_URL}/statistics/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (res.status === 404) return { exists: false };
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.data) {
    return { exists: null, error: `Salla ${res.status}` };
  }
  return {
    exists: true,
    usage: Number(json.data.num_of_usage) || 0,
    customers: Number(json.data.num_of_customers) || 0,
    sales: Number(json.data.coupon_sales?.amount) || 0,
    currency: json.data.coupon_sales?.currency || "",
  };
}

/**
 * @param {{ method: string, body: any }} request
 */
export async function couponStatsRequest({ method, body }) {
  if (method === "OPTIONS") return respond(204);
  if (method !== "POST") return respond(405, { success: false, error: "Method not allowed" });

  let data;
  try {
    data = typeof body === "string" ? JSON.parse(body || "{}") : body || {};
  } catch {
    return respond(400, { success: false, error: "Invalid JSON body" });
  }

  const ids = [...new Set((Array.isArray(data.ids) ? data.ids : []).map(String))]
    .filter((id) => /^\d+$/.test(id))
    .slice(0, MAX_IDS);
  if (ids.length === 0) return respond(200, { success: true, stats: {} });

  const accessToken = process.env.SALLA_ACCESS_TOKEN;
  if (!accessToken) {
    return respond(200, { success: false, error: "SALLA_ACCESS_TOKEN غير مضبوط على السيرفر" });
  }

  try {
    const entries = await Promise.all(ids.map(async (id) => [id, await fetchStats(id, accessToken)]));
    return respond(200, { success: true, stats: Object.fromEntries(entries) });
  } catch (err) {
    logError("couponStatsRequest", err);
    return respond(500, { success: false, error: "تعذر جلب إحصائيات الكوبونات من سلة" });
  }
}
