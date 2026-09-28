import { describe, it, expect } from "vitest";
import {
  buildCategoryInsights,
  isRunningLow,
  isOutOfStock,
  UNCATEGORIZED_ID,
} from "../categoryInsights.js";

const perfumes = { id: 1, name: "Perfumes" };
const incense = { id: 2, name: "Incense" };

const product = (id, overrides = {}) => ({
  id,
  name: `P${id}`,
  quantity: 50,
  soldQuantity: 0,
  categories: [perfumes],
  ...overrides,
});

describe("categoryInsights", () => {
  it("detects running low and out of stock (unlimited is never low)", () => {
    expect(isRunningLow({ quantity: 3 }, 5)).toBe(true);
    expect(isRunningLow({ quantity: 5 }, 5)).toBe(true);
    expect(isRunningLow({ quantity: 6 }, 5)).toBe(false);
    expect(isRunningLow({ quantity: 0 }, 5)).toBe(false);
    expect(isRunningLow({ quantity: null }, 5)).toBe(false);
    expect(isOutOfStock({ quantity: 0 })).toBe(true);
    expect(isOutOfStock({ quantity: null })).toBe(false);
  });

  it("groups by category and sorts categories by units sold", () => {
    const result = buildCategoryInsights([
      product(1, { soldQuantity: 10 }),
      product(2, { soldQuantity: 30, categories: [incense] }),
      product(3, { soldQuantity: 5 }),
    ]);

    expect(result.map((c) => c.name)).toEqual(["Incense", "Perfumes"]);
    expect(result[1]).toMatchObject({
      id: "1",
      productCount: 2,
      totalSold: 15,
    });
    expect(result[1].salesShare).toBeCloseTo(15 / 45);
  });

  it("lists the top sellers per category, skipping unsold products", () => {
    const [category] = buildCategoryInsights(
      [
        product(1, { soldQuantity: 4 }),
        product(2, { soldQuantity: 9 }),
        product(3, { soldQuantity: 0 }),
        product(4, { soldQuantity: 7 }),
        product(5, { soldQuantity: 1 }),
      ],
      { topCount: 3 },
    );

    expect(category.topSellers.map((p) => p.id)).toEqual([2, 4, 1]);
    expect(category.neverSold.map((p) => p.id)).toEqual([3]);
  });

  it("finds what is running out, most urgent first", () => {
    const [category] = buildCategoryInsights(
      [
        product(1, { quantity: 4, soldQuantity: 1 }),
        product(2, { quantity: 2, soldQuantity: 1 }),
        product(3, { quantity: 4, soldQuantity: 20 }),
        product(4, { quantity: 0, soldQuantity: 3 }),
        product(5, { quantity: 0, soldQuantity: 8 }),
        product(6, { quantity: null }),
        product(7, { quantity: 40 }),
      ],
      { lowStockLimit: 5 },
    );

    expect(category.runningLow.map((p) => p.id)).toEqual([2, 3, 1]);
    expect(category.outOfStock.map((p) => p.id)).toEqual([5, 4]);
  });

  it("respects the low stock limit", () => {
    const products = [product(1, { quantity: 8 })];
    expect(
      buildCategoryInsights(products, { lowStockLimit: 5 })[0].runningLow,
    ).toHaveLength(0);
    expect(
      buildCategoryInsights(products, { lowStockLimit: 10 })[0].runningLow,
    ).toHaveLength(1);
  });

  it("counts a product in every category it belongs to", () => {
    const result = buildCategoryInsights([
      product(1, { soldQuantity: 6, categories: [perfumes, incense] }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.totalSold === 6)).toBe(true);
  });

  it("groups products without a category as Uncategorized", () => {
    const [category] = buildCategoryInsights([
      product(1, { categories: [] }),
      product(2, { categories: undefined }),
    ]);
    expect(category).toMatchObject({
      id: UNCATEGORIZED_ID,
      name: "Uncategorized",
      productCount: 2,
    });
  });

  it("returns an empty list for no products", () => {
    expect(buildCategoryInsights([])).toEqual([]);
  });

  it("adds each category's revenue-weighted margin", () => {
    const [withCost, withoutCost] = buildCategoryInsights([
      product(1, { price: 100, costPrice: 60, soldQuantity: 10 }),
      product(2, {
        price: 100,
        costPrice: null,
        soldQuantity: 1,
        categories: [incense],
      }),
    ]);
    expect(withCost.margin).toBeCloseTo(0.4);
    expect(withoutCost.margin).toBe(null);
  });
});
