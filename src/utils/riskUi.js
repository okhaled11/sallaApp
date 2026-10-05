/**
 * Small presentation helpers for the risky-orders panel (kept pure for testing).
 */
import { LEVELS } from "../../shared/orderRisk.js";

export const LEVEL_META = {
  [LEVELS.HIGH]: { label: "خطر مرتفع", short: "مرتفع", tone: "high" },
  [LEVELS.MEDIUM]: { label: "خطر متوسط", short: "متوسط", tone: "medium" },
  [LEVELS.LOW]: { label: "خطر منخفض", short: "منخفض", tone: "low" },
};

const money = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export const formatMoney = (amount, currency = "") => `${money.format(Math.round(amount || 0))}${currency ? ` ${currency}` : ""}`;

export const formatPercent = (ratio) => `${Math.round((ratio || 0) * 100)}%`;

/** "منذ ساعتين" style label for an order's age. */
export function timeAgo(createdAt, now = Date.now()) {
  if (!createdAt) return "";
  const minutes = Math.max(0, Math.floor((now - createdAt) / 60000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "منذ ساعة" : hours === 2 ? "منذ ساعتين" : `منذ ${hours} ساعات`;
  const days = Math.round(hours / 24);
  return days === 1 ? "منذ يوم" : days === 2 ? "منذ يومين" : `منذ ${days} أيام`;
}

const firstName = (name) => (name || "").trim().split(/\s+/)[0] || "";

/** WhatsApp chat with the order's confirmation message pre-filled. */
export function buildWhatsAppUrl(order) {
  if (!order.phone) return null;
  const name = firstName(order.customerName);
  const lines = [
    `مرحباً${name ? ` ${name}` : ""} 👋`,
    `بخصوص طلبك رقم ${order.referenceId} بقيمة ${formatMoney(order.total, order.currency)}.`,
    `نرجو تأكيد الطلب${order.city ? ` والعنوان (${order.city})` : ""} بالرد على هذه الرسالة ليتم شحنه.`,
    "شكراً لك 🌷",
  ];
  return `https://wa.me/${order.phone}?text=${encodeURIComponent(lines.join("\n"))}`;
}

export const buildTelUrl = (order) => (order.phone ? `tel:+${order.phone}` : null);

/** Keeps the orders the merchant already confirmed, on this browser. */
const CONFIRMED_KEY = "_salla_risk_confirmed_v1";

export function loadConfirmed() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONFIRMED_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function saveConfirmed(ids) {
  try {
    // Only the latest few hundred matter; orders age out of the 30 day view anyway
    localStorage.setItem(CONFIRMED_KEY, JSON.stringify([...ids].slice(-500)));
  } catch {
    // storage unavailable: the choice just lasts for this session
  }
}

/** Matches the search box against name, phone, order number and city. */
export function matchesSearch(order, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [order.customerName, order.phone, String(order.referenceId), order.city].some((field) =>
    String(field || "").toLowerCase().includes(q),
  );
}
