import { describe, it, expect, beforeEach } from "vitest";
import {
  buildTelUrl,
  buildWhatsAppUrl,
  formatMoney,
  formatPercent,
  loadConfirmed,
  matchesSearch,
  saveConfirmed,
  timeAgo,
} from "../riskUi.js";

const order = {
  referenceId: 4321,
  total: 349.6,
  currency: "SAR",
  phone: "966557123456",
  customerName: "سارة أحمد",
  city: "جدة",
};

describe("riskUi", () => {
  beforeEach(() => localStorage.clear());

  it("builds a WhatsApp link with the confirmation message", () => {
    const url = buildWhatsAppUrl(order);
    expect(url.startsWith("https://wa.me/966557123456?text=")).toBe(true);
    const text = decodeURIComponent(url.split("text=")[1]);
    expect(text).toContain("سارة");
    expect(text).toContain("4321");
    expect(text).toContain("350 SAR");
    expect(text).toContain("جدة");
  });

  it("has no contact links without a phone number", () => {
    expect(buildWhatsAppUrl({ ...order, phone: "" })).toBeNull();
    expect(buildTelUrl({ ...order, phone: "" })).toBeNull();
    expect(buildTelUrl(order)).toBe("tel:+966557123456");
  });

  it("formats money, percentages and ages", () => {
    expect(formatMoney(1234.4, "SAR")).toBe("1,234 SAR");
    expect(formatPercent(0.256)).toBe("26%");
    const now = Date.parse("2026-08-10T12:00:00Z");
    expect(timeAgo(now - 30_000, now)).toBe("الآن");
    expect(timeAgo(now - 25 * 60_000, now)).toBe("منذ 25 دقيقة");
    expect(timeAgo(now - 2 * 3_600_000, now)).toBe("منذ ساعتين");
    expect(timeAgo(now - 5 * 3_600_000, now)).toBe("منذ 5 ساعات");
    expect(timeAgo(now - 3 * 86_400_000, now)).toBe("منذ 3 أيام");
    expect(timeAgo(0, now)).toBe("");
  });

  it("searches by name, phone, order number and city", () => {
    expect(matchesSearch(order, "")).toBe(true);
    expect(matchesSearch(order, "سارة")).toBe(true);
    expect(matchesSearch(order, "557123")).toBe(true);
    expect(matchesSearch(order, "4321")).toBe(true);
    expect(matchesSearch(order, "جدة")).toBe(true);
    expect(matchesSearch(order, "الرياض")).toBe(false);
  });

  it("remembers confirmed orders on this browser", () => {
    expect(loadConfirmed().size).toBe(0);
    saveConfirmed(new Set([1, 2]));
    expect([...loadConfirmed()]).toEqual([1, 2]);
  });

  it("survives corrupted storage", () => {
    localStorage.setItem("_salla_risk_confirmed_v1", "{not json");
    expect(loadConfirmed().size).toBe(0);
  });
});
