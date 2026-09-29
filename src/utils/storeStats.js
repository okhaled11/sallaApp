import { productProfit, sellingPrice } from "./profitInsights.js";
import { UNCATEGORIZED_ID } from "./categoryInsights.js";

/**
 * Calculates comprehensive store statistics and profit drivers
 * from the list of products.
 *
 * @param {Array} products - Store products array
 * @param {Object} [options]
 * @param {number} [options.topDriversCount=5] - Number of top profitable products to return
 * @returns {Object} Store analytics and profit statistics
 */
export function buildStoreStats(products = [], { topDriversCount = 5 } = {}) {
  let totalRevenue = 0;
  let totalProfit = 0;
  let revenueWithCost = 0;
  let totalSoldUnits = 0;
  let withCostCount = 0;
  let idleStockValue = 0;
  let idleStockCount = 0;
  let outOfStockCount = 0;
  let inStockCount = 0;

  const validProductsWithProfit = [];
  const lossMakers = [];
  const thinMargins = [];
  const missingCostTopSellers = [];

  for (const product of products) {
    const price = sellingPrice(product) || 0;
    const sold = product.soldQuantity || 0;
    const productRevenue = price * sold;
    totalRevenue += productRevenue;
    totalSoldUnits += sold;

    // Stock calculations
    const qty = product.quantity;
    if (qty === 0) {
      outOfStockCount++;
    } else {
      inStockCount++;
      if (sold === 0 && qty && qty > 0) {
        idleStockCount++;
        idleStockValue += price * qty;
      }
    }

    const profitData = productProfit(product);
    if (profitData !== null) {
      withCostCount++;
      totalProfit += profitData.totalProfit;
      revenueWithCost += profitData.revenue;

      const itemData = {
        product,
        unitProfit: profitData.unitProfit,
        margin: profitData.margin,
        totalProfit: profitData.totalProfit,
        revenue: profitData.revenue,
        soldQuantity: sold,
      };

      if (profitData.totalProfit > 0) {
        validProductsWithProfit.push(itemData);
      } else if (profitData.unitProfit < 0) {
        lossMakers.push(itemData);
      }

      if (
        profitData.margin !== null &&
        profitData.margin >= 0 &&
        profitData.margin < 0.15
      ) {
        thinMargins.push(itemData);
      }
    } else {
      if (sold > 0) {
        missingCostTopSellers.push(product);
      }
    }
  }

  // Sort top profit generating products
  validProductsWithProfit.sort((a, b) => b.totalProfit - a.totalProfit);
  const positiveProfitsSum = validProductsWithProfit.reduce(
    (acc, p) => acc + p.totalProfit,
    0,
  );

  const topProfitDrivers = validProductsWithProfit
    .slice(0, topDriversCount)
    .map((item) => ({
      ...item,
      profitShare:
        positiveProfitsSum > 0
          ? (item.totalProfit / positiveProfitsSum) * 100
          : 0,
    }));

  // Loss makers sorted by highest total loss
  lossMakers.sort((a, b) => a.totalProfit - b.totalProfit);
  const totalLoss = lossMakers.reduce(
    (acc, p) => acc + Math.abs(p.totalProfit),
    0,
  );

  // Missing cost top sellers sorted by highest sold
  missingCostTopSellers.sort(
    (a, b) => (b.soldQuantity || 0) - (a.soldQuantity || 0),
  );

  // Category Profit Breakdown
  const categoryGroups = new Map();
  for (const product of products) {
    const categories = product.categories?.length
      ? product.categories
      : [{ id: UNCATEGORIZED_ID, name: "غير مصنف" }];

    const profitData = productProfit(product);

    for (const cat of categories) {
      const id = String(cat.id);
      if (!categoryGroups.has(id)) {
        categoryGroups.set(id, {
          id,
          name: cat.name || "غير مصنف",
          productCount: 0,
          totalSold: 0,
          revenue: 0,
          profit: 0,
          revenueWithCost: 0,
        });
      }

      const group = categoryGroups.get(id);
      group.productCount++;
      const sold = product.soldQuantity || 0;
      group.totalSold += sold;

      const price = sellingPrice(product) || 0;
      group.revenue += price * sold;

      if (profitData !== null) {
        group.profit += profitData.totalProfit;
        group.revenueWithCost += profitData.revenue;
      }
    }
  }

  const categoryProfitBreakdown = Array.from(categoryGroups.values())
    .map((cat) => ({
      ...cat,
      margin: cat.revenueWithCost > 0 ? cat.profit / cat.revenueWithCost : null,
      profitShare:
        positiveProfitsSum > 0 && cat.profit > 0
          ? (cat.profit / positiveProfitsSum) * 100
          : 0,
    }))
    .sort((a, b) => b.profit - a.profit);

  const topCategory =
    categoryProfitBreakdown.length > 0 && categoryProfitBreakdown[0].profit > 0
      ? categoryProfitBreakdown[0]
      : null;

  const productsCount = products.length;
  const overallMargin =
    revenueWithCost > 0 ? totalProfit / revenueWithCost : null;
  const costCoverage =
    productsCount > 0 ? (withCostCount / productsCount) * 100 : 0;

  return {
    kpis: {
      totalRevenue,
      totalProfit,
      overallMargin,
      totalSoldUnits,
      productsCount,
      withCostCount,
      costCoverage,
      idleStockValue,
      idleStockCount,
      inStockCount,
      outOfStockCount,
    },
    topProfitDrivers,
    categoryProfitBreakdown,
    topCategory,
    lossMakers,
    totalLoss,
    thinMargins,
    missingCostTopSellers,
  };
}
