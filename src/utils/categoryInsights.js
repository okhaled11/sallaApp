/**
 * Per-category sales and stock insights, computed from the products list.
 *
 * A product in several categories counts in each of them.
 * Products without a category are grouped under "Uncategorized".
 */

import { weightedMargin } from "./profitInsights.js";

export const UNCATEGORIZED_ID = "uncategorized";
export const DEFAULT_LOW_STOCK_LIMIT = 5;

// quantity === null means unlimited stock
export const isOutOfStock = (product) => product.quantity === 0;

export const isRunningLow = (product, limit) =>
  product.quantity !== null &&
  product.quantity !== undefined &&
  product.quantity > 0 &&
  product.quantity <= limit;

const bySoldDesc = (a, b) => b.soldQuantity - a.soldQuantity;

/**
 * @param {Array} products - Products from /api/products
 * @param {{ lowStockLimit?: number, topCount?: number }} [options]
 * @returns {Array<{
 *   id: string, name: string, productCount: number, totalSold: number,
 *   salesShare: number, margin: number|null, topSellers: Array, runningLow: Array,
 *   outOfStock: Array, neverSold: Array
 * }>} Categories sorted by units sold (best first)
 */
export function buildCategoryInsights(
  products,
  { lowStockLimit = DEFAULT_LOW_STOCK_LIMIT, topCount = 3 } = {},
) {
  const groups = new Map();

  for (const product of products) {
    const categories = product.categories?.length
      ? product.categories
      : [{ id: UNCATEGORIZED_ID, name: "Uncategorized" }];

    for (const category of categories) {
      const id = String(category.id);
      if (!groups.has(id)) {
        groups.set(id, { id, name: category.name, products: [] });
      }
      groups.get(id).products.push(product);
    }
  }

  const storeSold = products.reduce((sum, p) => sum + p.soldQuantity, 0);

  return [...groups.values()]
    .map((group) => {
      const totalSold = group.products.reduce(
        (sum, p) => sum + p.soldQuantity,
        0,
      );
      return {
        id: group.id,
        name: group.name,
        productCount: group.products.length,
        totalSold,
        salesShare: storeSold ? totalSold / storeSold : 0,
        // Revenue-weighted, only products with a cost price
        margin: weightedMargin(group.products),
        topSellers: group.products
          .filter((p) => p.soldQuantity > 0)
          .sort(bySoldDesc)
          .slice(0, topCount),
        // Fewest left first; among equals, the faster seller is more urgent
        runningLow: group.products
          .filter((p) => isRunningLow(p, lowStockLimit))
          .sort((a, b) => a.quantity - b.quantity || bySoldDesc(a, b)),
        // Best sellers first: those are the costliest to have out of stock
        outOfStock: group.products.filter(isOutOfStock).sort(bySoldDesc),
        neverSold: group.products.filter((p) => p.soldQuantity === 0),
      };
    })
    .sort((a, b) => b.totalSold - a.totalSold || a.name.localeCompare(b.name));
}
