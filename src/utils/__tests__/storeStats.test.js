import { describe, it, expect } from "vitest";
import { buildStoreStats } from "../storeStats.js";

const mockProduct = (id, overrides = {}) => ({
  id,
  name: `Product ${id}`,
  price: 100,
  salePrice: null,
  costPrice: 60,
  soldQuantity: 10,
  quantity: 5,
  categories: [{ id: "cat1", name: "Electronics" }],
  ...overrides,
});

describe("buildStoreStats", () => {
  it("calculates basic KPIs correctly", () => {
    const products = [
      mockProduct(1, { price: 100, costPrice: 60, soldQuantity: 10 }), // revenue: 1000, profit: 400
      mockProduct(2, { price: 200, costPrice: 120, soldQuantity: 5 }), // revenue: 1000, profit: 400
    ];

    const stats = buildStoreStats(products);

    expect(stats.kpis.totalRevenue).toBe(2000);
    expect(stats.kpis.totalProfit).toBe(800);
    expect(stats.kpis.totalSoldUnits).toBe(15);
    expect(stats.kpis.overallMargin).toBeCloseTo(0.4);
    expect(stats.kpis.productsCount).toBe(2);
    expect(stats.kpis.withCostCount).toBe(2);
    expect(stats.kpis.costCoverage).toBe(100);
  });

  it("identifies top profit drivers and computes profit share", () => {
    const products = [
      mockProduct(1, { price: 100, costPrice: 50, soldQuantity: 10 }), // profit: 500
      mockProduct(2, { price: 300, costPrice: 100, soldQuantity: 10 }), // profit: 2000
      mockProduct(3, { price: 50, costPrice: 40, soldQuantity: 10 }), // profit: 100
    ];

    const stats = buildStoreStats(products, { topDriversCount: 2 });

    expect(stats.topProfitDrivers).toHaveLength(2);
    expect(stats.topProfitDrivers[0].product.id).toBe(2);
    expect(stats.topProfitDrivers[0].totalProfit).toBe(2000);
    // Total positive profits = 2600. Driver 1 share = (2000 / 2600) * 100 = ~76.92%
    expect(stats.topProfitDrivers[0].profitShare).toBeCloseTo(76.92, 1);
  });

  it("identifies loss makers and thin margins", () => {
    const products = [
      mockProduct(1, { price: 80, costPrice: 100, soldQuantity: 5 }), // Loss: -100
      mockProduct(2, { price: 100, costPrice: 90, soldQuantity: 10 }), // Thin: 10% margin
      mockProduct(3, { price: 100, costPrice: 50, soldQuantity: 10 }), // Healthy: 50%
    ];

    const stats = buildStoreStats(products);

    expect(stats.lossMakers).toHaveLength(1);
    expect(stats.lossMakers[0].product.id).toBe(1);
    expect(stats.totalLoss).toBe(100);

    expect(stats.thinMargins).toHaveLength(1);
    expect(stats.thinMargins[0].product.id).toBe(2);
  });

  it("calculates category profit breakdown and top category", () => {
    const products = [
      mockProduct(1, {
        price: 100,
        costPrice: 50,
        soldQuantity: 10,
        categories: [{ id: "catA", name: "Fashion" }],
      }),
      mockProduct(2, {
        price: 200,
        costPrice: 100,
        soldQuantity: 20,
        categories: [{ id: "catB", name: "Tech" }],
      }),
    ];

    const stats = buildStoreStats(products);

    expect(stats.categoryProfitBreakdown).toHaveLength(2);
    expect(stats.topCategory.id).toBe("catB");
    expect(stats.topCategory.profit).toBe(2000);
  });

  it("calculates dead stock value and missing cost top sellers", () => {
    const products = [
      mockProduct(1, { price: 50, soldQuantity: 0, quantity: 10 }), // Idle stock: 500
      mockProduct(2, { price: 100, costPrice: null, soldQuantity: 25 }), // Missing cost top seller
    ];

    const stats = buildStoreStats(products);

    expect(stats.kpis.idleStockCount).toBe(1);
    expect(stats.kpis.idleStockValue).toBe(500);
    expect(stats.missingCostTopSellers).toHaveLength(1);
    expect(stats.missingCostTopSellers[0].id).toBe(2);
  });
});
