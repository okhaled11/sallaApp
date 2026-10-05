import { describe, it, expect } from "vitest";
import {
  LEVELS,
  SENSITIVITY,
  analyzeOrders,
  buildContext,
  levelFor,
  normalizeOrder,
  scoreOrder,
  summarize,
} from "../orderRisk.js";

let nextId = 1;

/** A raw Salla order; override only what the test cares about. */
function raw({
  id = nextId++,
  customerId = id,
  mobile = 500000000 + id * 137, // distinct, realistic-looking numbers
  city = "الرياض",
  method = "cod",
  status = "under_review",
  total = 100,
  items = [{ name: "منتج", quantity: 1 }],
  day = 1,
  hour = 12,
} = {}) {
  return {
    id,
    reference_id: 1000 + id,
    total: { amount: total, currency: "SAR" },
    date: {
      date: `2026-08-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:00:00.000000`,
      timezone: "Asia/Riyadh",
    },
    status: { slug: status, name: status },
    payment_method: method,
    customer: { id: customerId, first_name: "عميل", last_name: String(customerId), mobile, mobile_code: "+966", city },
    items,
  };
}

/** Scores one order inside a store history. */
function scoreIn(history, target) {
  const orders = [...history, target].map(normalizeOrder);
  const ctx = buildContext(orders);
  return scoreOrder(orders[orders.length - 1], ctx);
}

const codes = (result) => result.reasons.map((r) => r.code);

// 12 ordinary delivered COD orders (so the store has a typical order value)
const baseline = () =>
  Array.from({ length: 12 }, (_, i) => raw({ status: "delivered", total: 100, day: 1 + (i % 5), customerId: 9000 + i }));

describe("normalizeOrder", () => {
  it("builds the international phone, detects COD and sums quantities", () => {
    const order = normalizeOrder(
      raw({ id: 5, mobile: 557123456, items: [{ name: "a", quantity: 2 }, { name: "b", quantity: 3 }] }),
    );
    expect(order.phone).toBe("966557123456");
    expect(order.isCod).toBe(true);
    expect(order.totalQuantity).toBe(5);
    expect(order.maxQuantity).toBe(3);
    expect(order.currency).toBe("SAR");
  });

  it("reads the store-local date (Riyadh, UTC+3)", () => {
    expect(normalizeOrder(raw({ day: 2, hour: 3 })).createdAt).toBe(Date.parse("2026-08-02T00:00:00Z"));
  });

  it("treats card payments as prepaid", () => {
    expect(normalizeOrder(raw({ method: "credit_card" })).isCod).toBe(false);
  });
});

describe("scoreOrder", () => {
  it("flags a new customer buying a lot, with a fake number and no city", () => {
    const risky = raw({
      customerId: 777,
      mobile: 5555555555,
      city: "",
      total: 900,
      items: [{ name: "فستان", quantity: 15 }],
    });
    const result = scoreIn(baseline(), risky);
    expect(codes(result)).toEqual(
      expect.arrayContaining(["new_customer", "very_high_value", "bulk_quantity", "bad_phone", "missing_city"]),
    );
    expect(levelFor(result.score)).toBe(LEVELS.HIGH);
    expect(result.reasons[0].points).toBeGreaterThanOrEqual(result.reasons[1].points); // strongest first
  });

  it("keeps an ordinary returning customer low and credits the history", () => {
    const history = [
      ...baseline(),
      raw({ customerId: 42, mobile: 551234567, status: "delivered", day: 1 }),
      raw({ customerId: 42, mobile: 551234567, status: "delivered", day: 2 }),
    ];
    const result = scoreIn(history, raw({ customerId: 42, mobile: 551234567, day: 5 }));
    expect(codes(result)).toContain("trusted");
    expect(levelFor(result.score)).toBe(LEVELS.LOW);
    expect(result.score).toBe(0);
  });

  it("penalizes a customer who returned an order before", () => {
    const history = [...baseline(), raw({ customerId: 55, mobile: 552345678, status: "restored", day: 1 })];
    const result = scoreIn(history, raw({ customerId: 55, mobile: 552345678, day: 5 }));
    expect(codes(result)).toContain("prior_returns");
    expect(result.score).toBeGreaterThanOrEqual(30);
  });

  it("uses a city's return rate only once it has enough closed orders", () => {
    const jeddah = (status, i) => raw({ city: "جدة", status, customerId: 8000 + i });
    const few = [jeddah("restored", 1), jeddah("restored", 2), jeddah("delivered", 3)];
    expect(codes(scoreIn([...baseline(), ...few], raw({ city: "جدة" })))).not.toContain("risky_city");

    const many = [1, 2, 3, 4].map((i) => jeddah("restored", i)).concat([5, 6].map((i) => jeddah("delivered", i)));
    expect(codes(scoreIn([...baseline(), ...many], raw({ city: "جدة" })))).toContain("risky_city");
  });

  it("notices several orders from the same number within a day", () => {
    const same = { customerId: 66, mobile: 553456789 };
    const history = [...baseline(), raw({ ...same, day: 5, hour: 9 }), raw({ ...same, day: 5, hour: 10 })];
    const result = scoreIn(history, raw({ ...same, day: 5, hour: 11 }));
    expect(codes(result)).toContain("rapid_orders");
  });

  it("scales a prepaid order down", () => {
    const base = { customerId: 777, mobile: 5555555555, city: "", items: [{ name: "x", quantity: 12 }] };
    const cod = scoreIn(baseline(), raw(base));
    const prepaid = scoreIn(baseline(), raw({ ...base, method: "credit_card" }));
    expect(prepaid.score).toBeLessThan(cod.score * 0.5);
    expect(codes(prepaid)).toContain("prepaid");
  });

  it("never leaves the 0-100 range", () => {
    const history = [
      ...baseline(),
      raw({ customerId: 3, mobile: 5555555555, status: "restored" }),
      raw({ customerId: 3, mobile: 5555555555, status: "restored" }),
      raw({ customerId: 3, mobile: 5555555555, status: "canceled" }),
    ];
    const result = scoreIn(history, raw({ customerId: 3, mobile: 5555555555, city: "", total: 5000, items: [{ name: "x", quantity: 30 }] }));
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe("levels and summary", () => {
  it("maps scores to levels by sensitivity", () => {
    expect(levelFor(55, SENSITIVITY.balanced)).toBe(LEVELS.MEDIUM);
    expect(levelFor(55, SENSITIVITY.strict)).toBe(LEVELS.HIGH);
    expect(levelFor(55, SENSITIVITY.relaxed)).toBe(LEVELS.MEDIUM);
    expect(levelFor(20, SENSITIVITY.balanced)).toBe(LEVELS.LOW);
  });

  it("summarizes counts and the money at stake", () => {
    const summary = summarize([
      { score: 80, total: 500 },
      { score: 40, total: 200 },
      { score: 5, total: 100 },
    ]);
    expect(summary).toMatchObject({ high: 1, medium: 1, low: 1, highAmount: 500, mediumAmount: 200 });
  });
});

describe("analyzeOrders", () => {
  it("scores the history, marks unshipped orders and reports store stats", () => {
    const rawOrders = [...baseline(), raw({ customerId: 777, mobile: 5555555555, total: 900, items: [{ name: "x", quantity: 15 }] })];
    const { orders, stats } = analyzeOrders(rawOrders);
    expect(orders[0].score).toBeGreaterThan(orders[orders.length - 1].score); // riskiest first
    expect(orders[0].isNotShipped).toBe(true);
    expect(stats.codOrders).toBe(13);
    expect(stats.returnRate).toBe(0);
  });

  it("returns a city list only for cities with enough data", () => {
    const rawOrders = [
      ...[1, 2, 3, 4, 5].map((i) => raw({ city: "الدمام", status: i <= 2 ? "restored" : "delivered" })),
      raw({ city: "أبها", status: "restored" }),
    ];
    const { cityStats } = analyzeOrders(rawOrders);
    expect(cityStats.map((c) => c.city)).toEqual(["الدمام"]);
    expect(cityStats[0].rate).toBeCloseTo(0.4);
  });

  it("copes with an empty list", () => {
    const { orders, stats } = analyzeOrders([]);
    expect(orders).toEqual([]);
    expect(stats.codShare).toBe(0);
  });
});
