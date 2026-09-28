import { describe, it, expect } from "vitest";
import { buildActionPlan, idleStockValue } from "../actionPlan.js";

const product = (id, overrides = {}) => ({
  id,
  name: `P${id}`,
  price: 100,
  salePrice: null,
  costPrice: 60,
  quantity: 50,
  soldQuantity: 10,
  categories: [],
  ...overrides,
});

const typesOf = (actions) => actions.map((a) => `${a.type}:${a.product.id}`);

describe("buildActionPlan", () => {
  it("returns nothing for a healthy store", () => {
    expect(buildActionPlan([product(1), product(2)])).toEqual([]);
  });

  it("asks to restock best sellers that ran out or are running low", () => {
    const actions = buildActionPlan([
      product(1, { quantity: 0, soldQuantity: 30 }),
      product(2, { quantity: 3, soldQuantity: 12 }),
      // Out of stock but never sold: not worth restocking
      product(3, { quantity: 0, soldQuantity: 0 }),
      // Unlimited stock never runs out
      product(4, { quantity: null, soldQuantity: 99 }),
    ]);

    expect(typesOf(actions)).toEqual(["restock:1", "restock:2"]);
    expect(actions[0]).toMatchObject({
      severity: "critical",
      title: "Restock now",
      reason: "Out of stock · sold 30",
    });
    expect(actions[1]).toMatchObject({
      severity: "warning",
      reason: "Only 3 left · sold 12",
    });
  });

  it("respects the running-low limit", () => {
    const products = [product(1, { quantity: 8 })];
    expect(buildActionPlan(products, { lowStockLimit: 5 })).toEqual([]);
    expect(typesOf(buildActionPlan(products, { lowStockLimit: 10 }))).toEqual([
      "restock:1",
    ]);
  });

  it("flags losses as critical and thin margins on sellers as warnings", () => {
    const actions = buildActionPlan([
      product(1, { costPrice: 120, soldQuantity: 4 }),
      product(2, { costPrice: 95, soldQuantity: 20 }),
      // Thin margin but never sold: not a priority
      product(3, { costPrice: 95, soldQuantity: 0, quantity: 0 }),
    ]);

    expect(typesOf(actions)).toEqual(["loss:1", "thin-margin:2"]);
    expect(actions[0]).toMatchObject({
      severity: "critical",
      reason: "Loses 20 per unit",
    });
    expect(actions[1]).toMatchObject({
      severity: "warning",
      reason: "Only 5% margin · sold 20",
    });
  });

  it("asks for the cost of products that sell", () => {
    const actions = buildActionPlan([
      product(1, { costPrice: null, soldQuantity: 7 }),
      product(2, { costPrice: null, soldQuantity: 0, quantity: 0 }),
    ]);
    expect(typesOf(actions)).toEqual(["missing-cost:1"]);
    expect(actions[0].severity).toBe("info");
  });

  it("suggests discounting stock that never sold, biggest value first", () => {
    const actions = buildActionPlan([
      product(1, { soldQuantity: 0, quantity: 2 }),
      product(2, { soldQuantity: 0, quantity: 30, salePrice: 80 }),
    ]);
    expect(typesOf(actions)).toEqual(["dead-stock:2", "dead-stock:1"]);
    expect(actions[0].impact).toBe(2400);
  });

  it("orders by severity, then impact", () => {
    const actions = buildActionPlan([
      product(1, { soldQuantity: 0, quantity: 100 }), // info
      product(2, { quantity: 2, soldQuantity: 5 }), // warning
      product(3, { quantity: 0, soldQuantity: 3 }), // critical
      product(4, { quantity: 0, soldQuantity: 40 }), // critical, bigger
    ]);
    expect(actions.map((a) => a.severity)).toEqual([
      "critical",
      "critical",
      "warning",
      "info",
    ]);
    expect(actions[0].product.id).toBe(4);
  });

  it("gives every action a unique id", () => {
    const actions = buildActionPlan([
      product(1, { quantity: 0, costPrice: 150, soldQuantity: 3 }),
    ]);
    expect(typesOf(actions)).toEqual(["restock:1", "loss:1"]);
    expect(new Set(actions.map((a) => a.id)).size).toBe(2);
  });
});

describe("idleStockValue", () => {
  it("sums the retail value of in-stock products that never sold", () => {
    expect(
      idleStockValue([
        product(1, { soldQuantity: 0, quantity: 3 }), // 300
        product(2, { soldQuantity: 0, quantity: 2, salePrice: 50 }), // 100
        product(3, { soldQuantity: 0, quantity: null }), // unlimited: skip
        product(4, { soldQuantity: 5, quantity: 10 }), // sells: skip
      ]),
    ).toBe(400);
  });
});
