/**
 * Order risk engine: scores cash-on-delivery (COD) orders before they ship.
 *
 * Pure functions with no I/O, shared by the server (which fetches the orders
 * from Salla and scores them) and the UI (which only applies the sensitivity
 * thresholds to the returned scores).
 *
 * Every signal is explained with a reason, so the merchant sees WHY an order
 * is risky and not just a number.
 *
 *   score 0-100  =  sum of the signals below (a trusted history lowers it)
 *   COD orders keep their full score; prepaid orders are scaled down, since
 *   a customer who already paid cannot refuse the parcel.
 */

export const LEVELS = { HIGH: "high", MEDIUM: "medium", LOW: "low" };

/** "Sensitivity" presets: the score at which an order becomes medium / high risk. */
export const SENSITIVITY = {
  strict: { medium: 25, high: 50 },
  balanced: { medium: 35, high: 60 },
  relaxed: { medium: 45, high: 70 },
};

// Order statuses (Salla slugs)
const RETURNED = new Set(["restored", "restoring"]);
const DELIVERED = new Set(["completed", "delivered"]);
const CANCELED = new Set(["canceled"]);
// Not shipped yet: the moment when confirming a risky order still saves money
const NOT_SHIPPED = new Set([
  "under_review",
  "in_progress",
  "payment_pending",
  "waiting_for_payment_confirmation",
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_CITY_ORDERS = 5; // closed COD orders needed before a city rate means anything
const MIN_COD_FOR_MEDIAN = 5;

/* ─── Normalizing a Salla order ─────────────────────────────────────── */

const toNumber = (value) => {
  const amount = typeof value === "object" && value !== null ? value.amount : value;
  const number = Number(amount);
  return Number.isFinite(number) ? number : 0;
};

function parseOrderDate(date) {
  if (!date) return 0;
  const text = typeof date === "string" ? date : date.date;
  if (!text) return 0;
  // Salla sends store-local time (almost always Riyadh, UTC+3)
  const offset = !date.timezone || date.timezone === "Asia/Riyadh" ? "+03:00" : "Z";
  const ms = Date.parse(`${text.replace(" ", "T").slice(0, 19)}${offset}`);
  return Number.isFinite(ms) ? ms : 0;
}

const digitsOnly = (value) => String(value ?? "").replace(/\D/g, "");

/**
 * Keep only what the engine and the UI need from a raw Salla order.
 */
export function normalizeOrder(raw) {
  const customer = raw.customer || {};
  const code = digitsOnly(customer.mobile_code);
  const local = digitsOnly(customer.mobile).replace(/^0+/, "");
  const method = String(raw.payment_method || "").toLowerCase();
  const items = Array.isArray(raw.items)
    ? raw.items.map((item) => ({
        name: item.name || "",
        quantity: Math.max(0, Number(item.quantity) || 0),
      }))
    : [];

  return {
    id: raw.id,
    referenceId: raw.reference_id ?? raw.id,
    createdAt: parseOrderDate(raw.date),
    total: toNumber(raw.total),
    currency: raw.total?.currency || "",
    statusSlug: raw.status?.slug || "",
    statusName: raw.status?.name || "",
    paymentMethod: method,
    isCod: method === "cod" || method.includes("cash_on_delivery"),
    customerId: customer.id ?? null,
    customerName: [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim(),
    localPhone: local,
    phone: local ? `${code}${local}` : "",
    city: String(customer.city || "").trim(),
    items,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    maxQuantity: items.reduce((max, item) => Math.max(max, item.quantity), 0),
  };
}

export const isNotShipped = (order) => NOT_SHIPPED.has(order.statusSlug);

const customerKey = (order) => (order.customerId ? `c:${order.customerId}` : order.localPhone ? `p:${order.localPhone}` : null);

/* ─── Context built from the whole order history ────────────────────── */

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Statistics every order is compared against: customer history, per-city
 * return rate, typical COD order value and orders per phone number.
 *
 * @param {ReturnType<typeof normalizeOrder>[]} orders
 */
export function buildContext(orders) {
  const customers = new Map();
  const cities = new Map();
  const phones = new Map();

  for (const order of orders) {
    const key = customerKey(order);
    if (key) {
      const list = customers.get(key) || [];
      list.push(order);
      customers.set(key, list);
    }
    if (order.localPhone) {
      const list = phones.get(order.localPhone) || [];
      list.push(order);
      phones.set(order.localPhone, list);
    }

    // City return rate, from COD orders whose outcome is known
    if (order.isCod && order.city) {
      const outcomeKnown = DELIVERED.has(order.statusSlug) || RETURNED.has(order.statusSlug) || CANCELED.has(order.statusSlug);
      if (outcomeKnown) {
        const stat = cities.get(order.city) || { city: order.city, closed: 0, returned: 0, canceled: 0 };
        stat.closed += 1;
        if (RETURNED.has(order.statusSlug)) stat.returned += 1;
        if (CANCELED.has(order.statusSlug)) stat.canceled += 1;
        cities.set(order.city, stat);
      }
    }
  }

  const cityStats = [...cities.values()]
    .map((stat) => ({ ...stat, rate: stat.closed ? (stat.returned + stat.canceled * 0.5) / stat.closed : 0 }))
    .sort((a, b) => b.rate - a.rate);

  const codTotals = orders.filter((o) => o.isCod && o.total > 0).map((o) => o.total);

  return {
    customers,
    phones,
    cityRate: new Map(cityStats.filter((s) => s.closed >= MIN_CITY_ORDERS).map((s) => [s.city, s.rate])),
    cityStats,
    medianCodTotal: codTotals.length >= MIN_COD_FOR_MEDIAN ? median(codTotals) : 0,
  };
}

/* ─── Signals ───────────────────────────────────────────────────────── */

function looksFakePhone(local) {
  if (!local) return true;
  if (local.length < 8 || local.length > 12) return true;
  if (/^(\d)\1+$/.test(local)) return true; // 5555555555
  if (/(\d)\1{6,}/.test(local)) return true; // seven or more identical digits in a row
  if ("0123456789012".includes(local.slice(-7)) || "9876543210987".includes(local.slice(-7))) return true;
  return false;
}

/**
 * Score one order. Returns the reasons that were triggered, with their points.
 *
 * @param {ReturnType<typeof normalizeOrder>} order
 * @param {ReturnType<typeof buildContext>} ctx
 */
export function scoreOrder(order, ctx) {
  const reasons = [];
  const add = (code, label, points) => reasons.push({ code, label, points });

  // The customer's other orders (the order itself excluded)
  const key = customerKey(order);
  const others = (key ? ctx.customers.get(key) || [] : []).filter((o) => o.id !== order.id);
  const earlier = others.filter((o) => o.createdAt && o.createdAt < order.createdAt);
  const delivered = earlier.filter((o) => DELIVERED.has(o.statusSlug)).length;
  const returned = others.filter((o) => RETURNED.has(o.statusSlug)).length;
  const canceled = others.filter((o) => CANCELED.has(o.statusSlug)).length;

  if (earlier.length === 0) add("new_customer", "عميل جديد لا توجد له طلبات سابقة", 20);
  else if (delivered === 0) add("no_delivered", "لم يستلم أي طلب سابق بنجاح", 10);

  if (returned > 0) add("prior_returns", `مرتجع سابق (${returned})`, Math.min(45, 30 + (returned - 1) * 15));
  if (canceled > 0) add("prior_cancels", `طلبات ملغاة سابقاً (${canceled})`, Math.min(20, canceled * 10));
  if (delivered >= 2 && returned === 0) add("trusted", `عميل موثوق: ${delivered} طلبات سابقة مستلمة`, -25);

  if (ctx.medianCodTotal > 0 && order.total > 0) {
    const ratio = order.total / ctx.medianCodTotal;
    if (ratio >= 3.5) add("very_high_value", `قيمة الطلب ${ratio.toFixed(1)} ضعف المعتاد`, 25);
    else if (ratio >= 2) add("high_value", `قيمة الطلب ${ratio.toFixed(1)} ضعف المعتاد`, 12);
  }

  if (order.maxQuantity >= 10) add("bulk_quantity", `كمية كبيرة من منتج واحد (${order.maxQuantity} قطعة)`, 25);
  else if (order.maxQuantity >= 5) add("bulk_quantity", `كمية كبيرة من منتج واحد (${order.maxQuantity} قطع)`, 12);

  const rate = order.city ? ctx.cityRate.get(order.city) : undefined;
  if (rate !== undefined) {
    const percent = Math.round(rate * 100);
    if (rate >= 0.4) add("risky_city", `مرتجعات مرتفعة في ${order.city} بنسبة ${percent}%`, 25);
    else if (rate >= 0.25) add("risky_city", `مرتجعات أعلى من المعتاد في ${order.city} بنسبة ${percent}%`, 15);
  }

  // Many orders from the same number in a short time
  if (order.localPhone && order.createdAt) {
    const nearby = (ctx.phones.get(order.localPhone) || []).filter(
      (o) => o.id !== order.id && Math.abs(o.createdAt - order.createdAt) <= DAY_MS,
    ).length;
    if (nearby >= 2) add("rapid_orders", `${nearby + 1} طلبات من نفس الرقم خلال 24 ساعة`, 20);
    else if (nearby === 1) add("rapid_orders", "طلبان من نفس الرقم خلال 24 ساعة", 10);
  }

  if (looksFakePhone(order.localPhone)) add("bad_phone", "رقم الجوال يبدو غير حقيقي أو ناقصاً", 20);
  if (!order.city) add("missing_city", "المدينة غير محددة", 10);

  let score = reasons.reduce((sum, r) => sum + r.points, 0);
  if (!order.isCod) {
    score = Math.round(score * 0.3);
    add("prepaid", "مدفوع مسبقاً، لا يمكن رفض استلامه", 0);
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Strongest signals first
  reasons.sort((a, b) => b.points - a.points);
  return { score, reasons };
}

/* ─── Levels and recommended action ─────────────────────────────────── */

/** @param {number} score @param {{ medium: number, high: number }} thresholds */
export function levelFor(score, thresholds = SENSITIVITY.balanced) {
  if (score >= thresholds.high) return LEVELS.HIGH;
  if (score >= thresholds.medium) return LEVELS.MEDIUM;
  return LEVELS.LOW;
}

export const ACTIONS = {
  [LEVELS.HIGH]: "اتصل بالعميل وأكّد قبل الشحن، وفكّر في طلب دفع مقدم أو عربون",
  [LEVELS.MEDIUM]: "أكّد الطلب والعنوان برسالة واتساب قبل الشحن",
  [LEVELS.LOW]: "اشحن بشكل عادي",
};

/* ─── Whole-store analysis ──────────────────────────────────────────── */

/**
 * Score every order against the store's own history.
 *
 * @param {object[]} rawOrders - orders as returned by Salla's List Orders
 * @returns {{ orders: object[], cityStats: object[], stats: object }}
 */
export function analyzeOrders(rawOrders) {
  const orders = rawOrders.map(normalizeOrder);
  const ctx = buildContext(orders);

  const scored = orders
    .map((order) => {
      const { score, reasons } = scoreOrder(order, ctx);
      return { ...order, score, reasons, isNotShipped: isNotShipped(order) };
    })
    .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt);

  const cod = orders.filter((o) => o.isCod);
  const closedCod = cod.filter((o) => DELIVERED.has(o.statusSlug) || RETURNED.has(o.statusSlug));
  const returnedCod = closedCod.filter((o) => RETURNED.has(o.statusSlug));

  return {
    orders: scored,
    cityStats: ctx.cityStats.filter((s) => s.closed >= MIN_CITY_ORDERS).slice(0, 8),
    stats: {
      totalOrders: orders.length,
      codOrders: cod.length,
      codShare: orders.length ? cod.length / orders.length : 0,
      returnRate: closedCod.length ? returnedCod.length / closedCod.length : 0,
      closedCodOrders: closedCod.length,
      medianCodTotal: ctx.medianCodTotal,
    },
  };
}

/**
 * Counts and money at stake for a list of scored orders, at a given sensitivity.
 */
export function summarize(scoredOrders, thresholds = SENSITIVITY.balanced) {
  const summary = { high: 0, medium: 0, low: 0, highAmount: 0, mediumAmount: 0 };
  for (const order of scoredOrders) {
    const level = levelFor(order.score, thresholds);
    summary[level] += 1;
    if (level === LEVELS.HIGH) summary.highAmount += order.total;
    if (level === LEVELS.MEDIUM) summary.mediumAmount += order.total;
  }
  return summary;
}
