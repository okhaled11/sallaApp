import { describe, it, expect } from "vitest";
import {
  buildProfitInsights,
  productProfit,
  sellingPrice,
  weightedMargin,
} from "../profitInsights.js";

const product = (id, overrides = {}) => ({
  id,
  name: `P${id}`,
  price: 100,
  salePrice: null,
  costPrice: 60,
  soldQuantity: 10,
  ...overrides,
});

describe("profitInsights", () => {
  it("uses the sale price when there is a discount", () => {
    expect(sellingPrice(product(1))).toBe(100);
    expect(sellingPrice(product(1, { salePrice: 80 }))).toBe(80);
  });

  it("computes unit profit, margin and totals", () => {
    expect(productProfit(product(1))).toEqual({
      unitProfit: 40,
      margin: 0.4,
      totalProfit: 400,
      revenue: 1000,
    });
    expect(productProfit(product(1, { salePrice: 75 }))).toMatchObject({
      unitProfit: 15,
      margin: 0.2,
    });
  });

  it("returns null without a cost or price", () => {
    expect(productProfit(product(1, { costPrice: null }))).toBe(null);
    expect(productProfit(product(1, { price: null }))).toBe(null);
  });

  it("weights the margin by revenue", () => {
    // 40% on 1000 revenue + 10% on 500 revenue = 450 / 1500 = 30%
    expect(
      weightedMargin([
        product(1),
        product(2, { price: 50, costPrice: 45, soldQuantity: 10 }),
        product(3, { costPrice: null }),
      ]),
    ).toBeCloseTo(0.3);
    expect(weightedMargin([product(1, { costPrice: null })])).toBe(null);
  });

  it("summarizes profit, leaders, thin margins and missing costs", () => {
    const insights = buildProfitInsights(
      [
        product(1, { soldQuantity: 10 }), // +400, 40%
        product(2, { price: 200, costPrice: 50, soldQuantity: 5 }), // +750, 75%
        product(3, { costPrice: 95, soldQuantity: 50 }), // +250, 5%
        product(4, { costPrice: 120, soldQuantity: 2 }), // -40, -20%
        product(5, { costPrice: null, soldQuantity: 3 }),
        product(6, { costPrice: null, soldQuantity: 30 }),
      ],
      { lowMargin: 0.15 },
    );

    expect(insights.totalProfit).toBe(400 + 750 + 250 - 40);
    expect(insights.averageMargin).toBeCloseTo(
      1360 / (1000 + 1000 + 5000 + 200),
    );
    expect(insights.coverage).toBeCloseTo(4 / 6);
    expect(insights.leaders.map((row) => row.product.id)).toEqual([2, 1, 3]);
    expect(insights.lowMargin.map((row) => row.product.id)).toEqual([4, 3]);
    expect(insights.missingCost.map((p) => p.id)).toEqual([6, 5]);
    // Every product with a cost, losses last
    expect(insights.ranked.map((row) => row.product.id)).toEqual([2, 1, 3, 4]);
  });

  it("handles a store with no cost prices", () => {
    const insights = buildProfitInsights([product(1, { costPrice: null })]);
    expect(insights.totalProfit).toBe(0);
    expect(insights.averageMargin).toBe(null);
    expect(insights.leaders).toEqual([]);
    expect(insights.coverage).toBe(0);
  });
});
