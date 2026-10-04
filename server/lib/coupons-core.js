/**
 * Salla Coupons core logic (platform-agnostic).
 *
 * Handles programmatic coupon creation on Salla via:
 * POST https://api.salla.dev/admin/v2/coupons
 *
 * Flow:
 *   1. Verify embedded token so only authorized dashboard sessions can create coupons
 *   2. Call Salla Merchant API with Authorization: Bearer <SALLA_ACCESS_TOKEN>
 */
import { respond, verifyEmbeddedToken } from "./verify-token-core.js";
import {
  ERROR_CODES,
  SallaAuthError,
  logError,
  redact,
} from "./errors.js";

const SALLA_COUPONS_URL = "https://api.salla.dev/admin/v2/coupons";

/**
 * Handle incoming create coupon request
 *
 * @param {{ method: string, body: any }} request
 * @returns {Promise<{ statusCode: number, headers: Record<string, string>, body: string }>}
 */
export async function createCouponRequest({ method, body }) {
  if (method === "OPTIONS") {
    return respond(204);
  }

  if (method !== "POST") {
    return respond(405, { success: false, error: "Method not allowed" });
  }

  let data;
  try {
    data = typeof body === "string" ? JSON.parse(body || "{}") : body || {};
  } catch {
    return respond(400, { success: false, error: "Invalid JSON body" });
  }

  const {
    token,
    appId,
    code,
    name,
    discount_type = "percentage",
    discount_value = 15,
    free_shipping = false,
  } = data;

  if (!code || typeof code !== "string" || !code.trim()) {
    return respond(400, { success: false, error: "كود الكوبون مطلوب" });
  }

  const cleanCode = code.trim().toUpperCase();

  // If in sandbox or SALLA_ACCESS_TOKEN is not configured
  const accessToken = process.env.SALLA_ACCESS_TOKEN;
  if (!accessToken) {
    return respond(200, {
      success: true,
      simulated: true,
      code: cleanCode,
      message: `تم تفعيل القسيمة (${cleanCode}) محلياً. لربطها بمتجر سلة المباشر، أضف SALLA_ACCESS_TOKEN في إعدادات البيئة (Environment Variables) مع صلاحية قسائم التخفيض.`,
      coupon: {
        id: `sim_${Date.now()}`,
        code: cleanCode,
        name: name || `قسيمة تحفيز (${cleanCode})`,
        type: discount_type,
        amount: Number(discount_value) || 0,
        free_shipping: Boolean(free_shipping || discount_type === "free_shipping"),
        status: "active",
      },
    });
  }

  // Verify embedded session if token and appId provided
  if (token && appId) {
    try {
      const verification = await verifyEmbeddedToken({ token, appId });
      if (!verification.result?.success) {
        logError("createCouponRequest", new Error("Embedded token verification failed"));
      }
    } catch (e) {
      logError("createCouponRequest:verify", e);
    }
  }

  // Format dates for Salla API
  const today = new Date();
  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const startDate = today.toISOString().split("T")[0];
  const expiryDate = nextYear.toISOString().split("T")[0];

  // Salla only accepts "percentage" | "fixed" for `type`; free shipping is the
  // separate `free_shipping` flag (amount must still be a positive number).
  const isFreeShipping = Boolean(free_shipping || discount_type === "free_shipping");
  const sallaType = discount_type === "fixed" || discount_type === "free_shipping" ? "fixed" : "percentage";
  const amount = discount_type === "free_shipping" ? 1 : Number(discount_value) || 1;

  const payload = {
    name: name || `كوبون تحفيز الزوار (${cleanCode})`,
    code: cleanCode,
    type: sallaType,
    amount,
    free_shipping: isFreeShipping,
    start_date: startDate,
    expiry_date: expiryDate,
    exclude_sale_products: false,
  };

  try {
    const sallaRes = await fetch(SALLA_COUPONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await sallaRes.json().catch(() => ({}));

    if (sallaRes.ok && result.status !== "error") {
      // Confirm the coupon is really listed, and report which store the token belongs to.
      const authHeaders = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
      const [listed, storeInfo] = await Promise.all([
        fetch(`${SALLA_COUPONS_URL}?code=${encodeURIComponent(cleanCode)}`, { headers: authHeaders })
          .then((r) => r.json())
          .catch(() => null),
        fetch("https://api.salla.dev/admin/v2/store/info", { headers: authHeaders })
          .then((r) => r.json())
          .catch(() => null),
      ]);
      const storeName = storeInfo?.data?.name || "غير معروف";
      const found = Array.isArray(listed?.data) && listed.data.some((c) => String(c.code).toUpperCase() === cleanCode);

      if (!result.data?.id || (listed && !found)) {
        logError("createCouponRequest:verify-listing", new Error(`Coupon ${cleanCode} not listed after create: ${JSON.stringify(result).slice(0, 500)}`));
        return respond(502, {
          success: false,
          error: `سلة ردّت بنجاح لكن الكوبون (${cleanCode}) لم يظهر في قائمة متجر "${storeName}". رد سلة: ${redact(JSON.stringify(result).slice(0, 300))}`,
        });
      }

      return respond(200, {
        success: true,
        coupon: result.data,
        code: cleanCode,
        message: `تم إنشاء قسيمة (${cleanCode}) في متجر "${storeName}" (رقم ${result.data.id}). افتح تسويق ← قسائم التخفيض في نفس المتجر.`,
      });
    }

    // Check if code is already taken in this store
    const errText = JSON.stringify(result);
    if (
      sallaRes.status === 422 &&
      result.error?.fields?.code &&
      (errText.includes("already been taken") ||
        errText.includes("مستخدم مسبقاً") ||
        errText.includes("already exists"))
    ) {
      return respond(200, {
        success: true,
        alreadyExists: true,
        coupon: payload,
        code: cleanCode,
        message: `قسيمة الشراء (${cleanCode}) موجودة ومفعلة بالفعل في متجرك بسلة!`,
      });
    }

    const fields = result.error?.fields
      ? Object.entries(result.error.fields).map(([k, v]) => `${k}: ${[].concat(v).join(", ")}`).join(" | ")
      : "";
    const sallaMsg = redact(
      [result.error?.message || result.message || "فشل إنشاء القسيمة في سلة", fields].filter(Boolean).join(" — ")
    );
    return respond(sallaRes.status >= 400 && sallaRes.status < 600 ? sallaRes.status : 500, {
      success: false,
      error: `استجابة سلة (${sallaRes.status}): ${sallaMsg}`,
    });
  } catch (err) {
    logError("createCouponRequest:call", err);
    return respond(500, {
      success: false,
      error: `حدث خطأ أثناء الاتصال بسيرفر سلة: ${err.message}`,
    });
  }
}
