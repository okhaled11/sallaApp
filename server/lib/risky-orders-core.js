/**
 * Risky orders core logic (platform-agnostic).
 *
 * Flow:
 *   1. Verify the embedded token (only a real dashboard session may read orders)
 *   2. Page through the store's recent orders: GET /admin/v2/orders  (scope: orders.read)
 *   3. Score every order against the store's own history (shared/orderRisk.js)
 *   4. Return the last 30 days, riskiest first, with the reasons for each score
 *
 * The whole history window is used for the statistics (customer history, city
 * return rates, typical order value), but only recent orders are sent back.
 */
import { respond, verifyEmbeddedToken } from "./verify-token-core.js";
import { getActiveAccessToken } from "./salla-tokens-core.js";
import { ERROR_CODES, SallaAuthError, logError, redact } from "./errors.js";
import { analyzeOrders } from "../../shared/orderRisk.js";

const SALLA_ORDERS_URL = "https://api.salla.dev/admin/v2/orders";
const PER_PAGE = 30; // Salla's recommended maximum
const MAX_PAGES = 40;
const TIME_BUDGET_MS = 18_000; // stay inside the serverless time limit
const DEFAULT_DAYS = 60;
const MIN_DAYS = 7;
const MAX_DAYS = 120;
const RETURN_DAYS = 30;
const MAX_RETURNED = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

const isoDay = (ms) => new Date(ms).toISOString().split("T")[0];

function sallaError(response, result) {
  const message = redact(result?.error?.message || result?.message || "Salla API error");
  if (response.status === 401) {
    return new SallaAuthError(
      ERROR_CODES.SALLA_UNAUTHORIZED,
      "Salla API returned 401: the access token is invalid or expired. Reinstall the app so Salla re-sends it to the webhook, or replace SALLA_ACCESS_TOKEN in Vercel and redeploy.",
      401,
    );
  }
  if (response.status === 403) {
    return new SallaAuthError(
      ERROR_CODES.SALLA_FORBIDDEN,
      `Salla API returned 403 (insufficient scope): ${message}. Enable Orders (Read) in Salla Partners (App Scopes), then reinstall the app.`,
      403,
    );
  }
  return new SallaAuthError(ERROR_CODES.SALLA_API_ERROR, `Salla API returned ${response.status}: ${message}`, 502);
}

/** Pages through the orders of the window, newest first. */
async function fetchOrders(accessToken, fromDate) {
  const startedAt = Date.now();
  const orders = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;

    const url = new URL(SALLA_ORDERS_URL);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(PER_PAGE));
    url.searchParams.set("from_date", fromDate);
    url.searchParams.set("sort_by", "created_at-desc");

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw sallaError(response, result);

    orders.push(...(Array.isArray(result.data) ? result.data : []));

    const totalPages = Number(result.pagination?.totalPages) || 1;
    if (page >= totalPages) return { orders, truncated: false };
  }

  // Left the loop without reaching the last page (time budget or page cap)
  return { orders, truncated: true };
}

/** Only what the UI needs. */
function slimOrder(order) {
  return {
    id: order.id,
    referenceId: order.referenceId,
    createdAt: order.createdAt,
    total: order.total,
    currency: order.currency,
    statusSlug: order.statusSlug,
    statusName: order.statusName,
    paymentMethod: order.paymentMethod,
    isCod: order.isCod,
    isNotShipped: order.isNotShipped,
    customerName: order.customerName,
    phone: order.phone,
    city: order.city,
    items: order.items.slice(0, 6),
    totalQuantity: order.totalQuantity,
    score: order.score,
    reasons: order.reasons.map(({ code, label, points }) => ({ code, label, points })),
  };
}

/**
 * @param {{ method: string, body: any }} request
 */
export async function riskyOrdersRequest({ method, body }) {
  if (method === "OPTIONS") return respond(204);
  if (method !== "POST") return respond(405, { success: false, error: "Method not allowed" });

  let data;
  try {
    data = typeof body === "string" ? JSON.parse(body || "{}") : body || {};
  } catch {
    return respond(400, { success: false, error: "Invalid JSON body" });
  }

  const { token, appId } = data;
  if (!token) return respond(400, { success: false, error: "Token is required" });
  if (!appId) return respond(400, { success: false, error: "App ID is required" });

  const days = Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.floor(Number(data.days)) || DEFAULT_DAYS));

  try {
    const accessToken = await getActiveAccessToken();
    if (!accessToken) {
      throw new SallaAuthError(
        ERROR_CODES.CONFIG_MISSING,
        "Server is missing configuration: SALLA_ACCESS_TOKEN (or install the app via the Salla webhook so it can be fetched automatically)",
        500,
      );
    }

    const verification = await verifyEmbeddedToken({ token, appId });
    if (!verification.result?.success) {
      throw new SallaAuthError(
        ERROR_CODES.EMBEDDED_TOKEN_INVALID,
        "Embedded session could not be verified. Reopen the app from the Salla dashboard.",
        401,
      );
    }

    const now = Date.now();
    const { orders: rawOrders, truncated } = await fetchOrders(accessToken, isoDay(now - days * DAY_MS));
    const analysis = analyzeOrders(rawOrders);

    const recent = analysis.orders
      .filter((order) => !order.createdAt || order.createdAt >= now - RETURN_DAYS * DAY_MS)
      .slice(0, MAX_RETURNED)
      .map(slimOrder);

    return respond(200, {
      success: true,
      data: {
        orders: recent,
        cityStats: analysis.cityStats,
        stats: analysis.stats,
        windowDays: days,
        fetched: rawOrders.length,
        truncated,
        generatedAt: now,
      },
    });
  } catch (error) {
    logError("riskyOrdersRequest", error);
    if (error instanceof SallaAuthError) {
      return respond(error.status, { success: false, error: error.message, code: error.code });
    }
    return respond(500, { success: false, error: "تعذر تحليل الطلبات حالياً، حاول مرة أخرى" });
  }
}
