/**
 * Profit insights from the products list.
 *
 * Estimates only: sold_quantity is lifetime units and is multiplied by
 * today's price and cost, so past price changes and discounts are not
 * reflected. Products without a cost price are left out of the numbers.
 */

// Margin below this is flagged as "thin"
export const DEFAULT_LOW_MARGIN = 0.15;

/** What the customer pays now: the sale price when there is a discount */
export const sellingPrice = (product) => product.salePrice ?? product.price;

/**
 * @returns {{ unitProfit: number, margin: number|null, totalProfit: number, revenue: number } | null}
 *   null when the cost or the price is unknown
 */
export function productProfit(product) {
  const price = sellingPrice(product);
  if (price === null || price === undefined || product.costPrice == null) {
    return null;
  }
  const unitProfit = price - product.costPrice;
  return {
    unitProfit,
    margin: price > 0 ? unitProfit / price : null,
    totalProfit: unitProfit * product.soldQuantity,
    revenue: price * product.soldQuantity,
  };
}

/**
 * Revenue-weighted margin of a group of products (null if nothing to measure).
 */
export function weightedMargin(products) {
  let profit = 0;
  let revenue = 0;
  for (const product of products) {
    const result = productProfit(product);
    if (!result) continue;
    profit += result.totalProfit;
    revenue += result.revenue;
  }
  return revenue > 0 ? profit / revenue : null;
}

/**
 * @param {Array} products
 * @param {{ lowMargin?: number, topCount?: number }} [options]
 */
export function buildProfitInsights(
  products,
  { lowMargin = DEFAULT_LOW_MARGIN, topCount = 5 } = {},
) {
  const withCost = [];
  const missingCost = [];

  for (const product of products) {
    const result = productProfit(product);
    if (result) withCost.push({ product, ...result });
    else missingCost.push(product);
  }

  const totalProfit = withCost.reduce((sum, row) => sum + row.totalProfit, 0);
  const totalRevenue = withCost.reduce((sum, row) => sum + row.revenue, 0);

  return {
    totalProfit,
    totalRevenue,
    averageMargin: totalRevenue > 0 ? totalProfit / totalRevenue : null,
    coverage: products.length ? withCost.length / products.length : 0,
    // Who actually earns the money (often not the best sellers)
    leaders: withCost
      .filter((row) => row.totalProfit > 0)
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, topCount),
    // Thin margins and losses, worst first
    lowMargin: withCost
      .filter((row) => row.margin !== null && row.margin < lowMargin)
      .sort((a, b) => a.margin - b.margin),
    // Best sellers first: their cost matters most for the totals
    missingCost: missingCost.sort((a, b) => b.soldQuantity - a.soldQuantity),
  };
}
