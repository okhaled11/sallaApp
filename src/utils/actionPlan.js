/**
 * Action plan: turns the sales, stock and profit signals into a short,
 * prioritized to-do list for the merchant.
 *
 * Order: severity — critical (money being lost now) > warning (will cost
 * money soon) > info (missing data / slow capital) — then action type, then
 * impact. Impact is only compared within one type, since each type measures
 * it differently (units sold, money lost, stock value).
 */
import { isOutOfStock, isRunningLow } from "./categoryInsights.js";
import {
  productProfit,
  sellingPrice,
  DEFAULT_LOW_MARGIN,
} from "./profitInsights.js";

export const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

// Can't sell what isn't on the shelf, so stock comes first
const TYPE_RANK = {
  restock: 0,
  loss: 1,
  "thin-margin": 2,
  "missing-cost": 3,
  "dead-stock": 4,
};

/**
 * @returns {Array<{ id: string, type: string, severity: string, product: object, title: string, reason: string, impact: number }>}
 */
export function buildActionPlan(
  products,
  { lowStockLimit = 5, lowMargin = DEFAULT_LOW_MARGIN } = {},
) {
  const actions = [];
  const add = (type, severity, product, title, reason, impact) =>
    actions.push({
      id: `${type}-${product.id}`,
      type,
      severity,
      product,
      title,
      reason,
      impact,
    });

  for (const product of products) {
    const sold = product.soldQuantity;
    const profit = productProfit(product);

    // Stock: only products that actually sell are worth restocking
    if (sold > 0 && isOutOfStock(product)) {
      add(
        "restock",
        "critical",
        product,
        "Restock now",
        `Out of stock · sold ${sold}`,
        sold,
      );
    } else if (sold > 0 && isRunningLow(product, lowStockLimit)) {
      add(
        "restock",
        "warning",
        product,
        "Restock soon",
        `Only ${product.quantity} left · sold ${sold}`,
        sold / product.quantity,
      );
    }

    // Pricing
    if (profit && profit.unitProfit < 0) {
      add(
        "loss",
        "critical",
        product,
        "Selling at a loss",
        `Loses ${Math.abs(profit.unitProfit).toLocaleString()} per unit`,
        Math.abs(profit.unitProfit) * Math.max(sold, 1),
      );
    } else if (
      profit &&
      profit.margin !== null &&
      profit.margin < lowMargin &&
      sold > 0
    ) {
      add(
        "thin-margin",
        "warning",
        product,
        "Raise the price",
        `Only ${Math.round(profit.margin * 100)}% margin · sold ${sold}`,
        sold,
      );
    }

    // Data: profit can't be measured without a cost
    if (!profit && sold > 0) {
      add(
        "missing-cost",
        "info",
        product,
        "Add the cost",
        `Sold ${sold} · profit unknown`,
        sold,
      );
    }

    // Capital: stock that never sold
    if (sold === 0 && product.quantity > 0) {
      const value = (sellingPrice(product) ?? 0) * product.quantity;
      add(
        "dead-stock",
        "info",
        product,
        "Discount idle stock",
        `Never sold · ${product.quantity} in stock`,
        value,
      );
    }
  }

  return actions.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      TYPE_RANK[a.type] - TYPE_RANK[b.type] ||
      b.impact - a.impact,
  );
}

/**
 * Retail value of stock that has never sold (money sitting on the shelf).
 */
export function idleStockValue(products) {
  return products.reduce((sum, product) => {
    if (product.soldQuantity !== 0 || !(product.quantity > 0)) return sum;
    return sum + (sellingPrice(product) ?? 0) * product.quantity;
  }, 0);
}
