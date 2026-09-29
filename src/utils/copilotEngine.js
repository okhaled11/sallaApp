/**
 * copilotEngine.js
 *
 * Intelligent Catalog & Growth Copilot Engine for Salla merchants.
 * Discovers revenue opportunities, pricing optimizations, SEO marketing copy,
 * margin defenses, and stock liquidation strategies.
 */

import { productProfit, sellingPrice } from "./profitInsights.js";

/**
 * Opportunity Types
 */
export const OPPORTUNITY_TYPES = {
  PRICE_OPTIMIZATION: "price_optimization",
  SEO_COPYWRITING: "seo_copywriting",
  MARGIN_DEFENSE: "margin_defense",
  DEADSTOCK_REVIVAL: "deadstock_revival",
  STOCK_URGENCY: "stock_urgency",
};

/**
 * Clean numeric value helper
 */
function toNum(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Suggest a psychology-optimized price (.00 or .99 or rounded to nearest SAR)
 */
export function calculatePsychologicalPrice(price) {
  const p = toNum(price);
  if (p <= 0) return 0;
  if (p < 20) {
    // Round to .99 or integer
    return Math.round(p);
  }
  // For larger items, suggest ending in .00 or .99
  const floorVal = Math.floor(p);
  return floorVal + 0.99;
}

/**
 * Deterministic, high-converting Arabic & English marketing copy generator
 */
export function generateProductCopy(product) {
  const name = product?.name?.trim() || "المنتج المميز";
  const category =
    typeof product?.category === "string"
      ? product.category
      : product?.category?.name || "المتجر";
  const sold = toNum(product?.soldQuantity);

  // Dynamic catchy hooks based on performance
  let hookTitle = "";
  if (sold > 20) {
    hookTitle = `الأكثر طلباً: ${name} بجودة استثنائية وسعر مميز!`;
  } else if (sold > 5) {
    hookTitle = `الاختيار الأذكى: ${name} لإطلالة وتجربة لا تُنسى`;
  } else {
    hookTitle = `جديدنا الحصري: ${name} مصمم خصيصاً ليناسب احتياجاتك`;
  }

  const benefits = [
    `جودة عالية ومضمونة تمنحك قيمة حقيقية تدوم طويلاً.`,
    `تصميم أنيق ومدروس يجمع بين العملية والجمال في كل تفصيلة.`,
    `مثالي للاستخدام اليومي أو كهدية فاخرة لمن تحب.`,
    `شحن سريع مع ضمان الرضا وخدمة عملاء متواصلة على مدار الساعة.`,
  ];

  const marketingDescription = `${name} هو خيارك الأمثل في قسم ${category}. تم تصميمه بعناية فائقة ليلبي أعلى معايير الجودة والأناقة، مع تركيز كامل على تقديم تجربة استثنائية تناسب ذوقك الرفيع. احصل عليه الآن بسعر لا يُعوّض ضمن تشكيلتنا المختارة!`;

  const metaDescription = `تسوق الآن ${name} بأفضل سعر من قسم ${category}. جودة عالية، توصيل سريع، وخيارات دفع آمنة تناسبك تماماً.`;

  // Keywords & SEO tags
  const sanitizedName = name.replace(/[^\w\u0600-\u06FF\s]/g, "");
  const nameKeywords = sanitizedName.split(/\s+/).filter((w) => w.length > 2);
  const seoKeywords = Array.from(
    new Set([
      ...nameKeywords,
      category,
      "عروض حصرية",
      "أفضل جودة",
      "تسوق أونلاين",
      "متجر سلة",
      "شحن سريع",
    ]),
  ).slice(0, 7);

  return {
    hookTitle,
    marketingDescription,
    benefits,
    metaDescription,
    seoKeywords,
    targetAudience: `رواد قسم ${category} الباحثين عن أعلى قيمة وجودة بأفضل سعر.`,
  };
}

/**
 * Scan products catalog and return actionable growth opportunities & catalog health stats
 *
 * @param {Array} products - Store products
 * @param {Object} [options]
 * @param {number} [options.minSalesForPriceUpside=5]
 * @returns {Object} Catalog audit & growth opportunities
 */
export function analyzeCatalog(products = [], options = {}) {
  if (!Array.isArray(products) || products.length === 0) {
    return {
      opportunities: [],
      summary: {
        totalOpportunities: 0,
        totalProjectedGain: 0,
        healthScore: 100,
        breakdown: {
          priceOptimization: 0,
          seoCopywriting: 0,
          marginDefense: 0,
          deadstockRevival: 0,
          stockUrgency: 0,
        },
      },
    };
  }

  const { minSalesForPriceUpside = 5 } = options;
  const opportunities = [];

  let totalProjectedGain = 0;
  let productsWithCost = 0;
  let productsWithStockIssue = 0;
  let productsWithLowSales = 0;

  for (const product of products) {
    const currentPrice = sellingPrice(product) || product.price || 0;
    const sold = toNum(product.soldQuantity);
    const quantity = toNum(product.quantity, 0); // -1 is unlimited
    const isUnlimited = product.quantity === -1;
    const profitData = productProfit(product);
    const hasCost = product.costPrice != null;

    if (hasCost) productsWithCost++;
    if (quantity === 0 && !isUnlimited) productsWithStockIssue++;
    if (sold === 0) productsWithLowSales++;

    // 1. Price Optimization: High-selling items with room for a modest price increase (+5% to +8%)
    if (sold >= minSalesForPriceUpside && currentPrice > 0) {
      // Suggest a 5% to 7% increase rounded psychological price
      const rawSuggested = currentPrice * 1.06;
      const suggestedPrice = Math.round(rawSuggested);

      if (suggestedPrice > currentPrice) {
        const priceDiff = suggestedPrice - currentPrice;
        // Conservative projection: assume 80% sales velocity continues
        const projectedMonthlyGain = Math.round(priceDiff * (sold * 0.8));

        opportunities.push({
          id: `price_opt_${product.id}`,
          type: OPPORTUNITY_TYPES.PRICE_OPTIMIZATION,
          badge: "فرصة تعظيم الأرباح",
          priority: "high",
          product,
          currentPrice,
          suggestedPrice,
          priceDiff,
          projectedGain: projectedMonthlyGain,
          rationale: `المنتج يحقق مبيعات مرتفعة (${sold} قطعة مباعة) مع استقرار في الطلب. رفع السعر بمقدار ${priceDiff.toFixed(
            2,
          )} ر.س (+${Math.round((priceDiff / currentPrice) * 100)}%) سيحقق أرباحاً إضافية متوقعة دون التأثير سلباً على معدل الإقبال.`,
          actionType: "update_price",
          actionLabel: `تطبيق السعر المقترح (${suggestedPrice} ر.س)`,
        });
        totalProjectedGain += projectedMonthlyGain;
      }
    }

    // 2. Margin Defense: Products with known cost having low or negative margin
    if (profitData && profitData.margin !== null) {
      if (profitData.margin < 0.12 && currentPrice > 0) {
        const targetMargin = 0.25; // Target 25% margin
        const cost = product.costPrice;
        const suggestedMinPrice = Math.ceil(cost / (1 - targetMargin));

        if (suggestedMinPrice > currentPrice) {
          const diff = suggestedMinPrice - currentPrice;
          const projectedGain = Math.round(diff * Math.max(sold, 1));

          opportunities.push({
            id: `margin_def_${product.id}`,
            type: OPPORTUNITY_TYPES.MARGIN_DEFENSE,
            badge:
              profitData.margin <= 0 ? "تنبيه بيع بخسارة" : "حماية هامش الربح",
            priority: profitData.margin <= 0 ? "urgent" : "high",
            product,
            currentPrice,
            suggestedPrice: suggestedMinPrice,
            currentMargin: Math.round(profitData.margin * 100),
            targetMargin: 25,
            projectedGain,
            rationale:
              profitData.margin <= 0
                ? `هذا المنتج يباع بسعر يقل عن تكلفته الحقيقية (خسارة ${(currentPrice - cost).toFixed(2)} ر.س للوحدة). تم حساب سعر عادل مقترح لاستعادة الهامش الإيجابي.`
                : `هامش الربح الحالي ضعيف جداً (${Math.round(
                    profitData.margin * 100,
                  )}%). رفع السعر إلى ${suggestedMinPrice} ر.س يضمن هامشاً آمناً بنسبة 25%.`,
            actionType: "update_price",
            actionLabel: `تعديل السعر الآمن (${suggestedMinPrice} ر.س)`,
          });
          totalProjectedGain += projectedGain;
        }
      }
    }

    // 3. SEO & Content Optimization: Good products that can sell much more with better copy
    // Generate copy recommendation for products needing a boost
    const copyData = generateProductCopy(product);
    if (sold >= 1 && (!product.description || product.description.length < 50)) {
      opportunities.push({
        id: `seo_copy_${product.id}`,
        type: OPPORTUNITY_TYPES.SEO_COPYWRITING,
        badge: "تحسين السيو والوصف الذكي",
        priority: "medium",
        product,
        copyData,
        projectedGain: 0,
        rationale: `وصف المنتج الحالي قصير أو غير مستغل تسويقياً. تم توليد وصف تسويقي احترافي بكلمات مفتاحية مستهدفة لمحركات البحث لزيادة معدل التحويل وظهور المنتج.`,
        actionType: "preview_copy",
        actionLabel: "معاينة ونسخ المحتوى الذكي",
      });
    }

    // 4. Deadstock Revival: High inventory with low or 0 sales
    if (!isUnlimited && quantity >= 10 && sold <= 1) {
      // Recommend 15% discount or clearance strategy
      const discountedPrice = Math.max(1, Math.round(currentPrice * 0.85));
      const trappedCapital = Math.round(currentPrice * quantity);

      opportunities.push({
        id: `deadstock_${product.id}`,
        type: OPPORTUNITY_TYPES.DEADSTOCK_REVIVAL,
        badge: "إنعاش البضاعة الراكدة",
        priority: "medium",
        product,
        currentPrice,
        suggestedPrice: discountedPrice,
        trappedCapital,
        quantity,
        projectedGain: Math.round(trappedCapital * 0.6),
        rationale: `يوجد ${quantity} قطعة راكدة مجمدة سيولة بقيمة تقريبية ${trappedCapital} ر.س. تخفيض السعر مؤقتاً إلى ${discountedPrice} ر.س سيعيد تحريك المبيعات وتحرير الكاش.`,
        actionType: "update_price",
        actionLabel: `تطبيق سعر التصفية (${discountedPrice} ر.س)`,
      });
    }

    // 5. Stock Urgency: Best sellers with critical stock level
    if (!isUnlimited && quantity > 0 && quantity <= 4 && sold >= 8) {
      opportunities.push({
        id: `urgency_${product.id}`,
        type: OPPORTUNITY_TYPES.STOCK_URGENCY,
        badge: "خطر نفاد منتج نجم",
        priority: "urgent",
        product,
        remainingStock: quantity,
        projectedGain: 0,
        rationale: `المنتج يحقق مبيعات قوية (${sold} قطعة) والمخزون المتبقي (${quantity} قطع فقط) مهدد بالنفاد السريع. يُنصح بإعادة طلب المخزون فوراً لتجنب فقدان المبيعات.`,
        actionType: "edit_product",
        actionLabel: "تحديث المخزون وتوريد كمية",
      });
    }
  }

  // Sort opportunities: urgent first, then high, then highest projected gain
  const priorityScore = { urgent: 3, high: 2, medium: 1 };
  opportunities.sort((a, b) => {
    const pDiff =
      (priorityScore[b.priority] || 0) - (priorityScore[a.priority] || 0);
    if (pDiff !== 0) return pDiff;
    return (b.projectedGain || 0) - (a.projectedGain || 0);
  });

  // Calculate Health Score (0 - 100)
  // Factors: Cost coverage (30%), In-stock healthy balance (35%), Active moving catalog (35%)
  const totalCount = products.length;
  const costRatio = totalCount > 0 ? productsWithCost / totalCount : 1;
  const stockRatio =
    totalCount > 0 ? (totalCount - productsWithStockIssue) / totalCount : 1;
  const movingRatio =
    totalCount > 0 ? (totalCount - productsWithLowSales) / totalCount : 1;

  const rawScore = costRatio * 30 + stockRatio * 35 + movingRatio * 35;
  const healthScore = Math.max(10, Math.min(100, Math.round(rawScore)));

  // Category counts
  const breakdown = {
    priceOptimization: opportunities.filter(
      (o) => o.type === OPPORTUNITY_TYPES.PRICE_OPTIMIZATION,
    ).length,
    seoCopywriting: opportunities.filter(
      (o) => o.type === OPPORTUNITY_TYPES.SEO_COPYWRITING,
    ).length,
    marginDefense: opportunities.filter(
      (o) => o.type === OPPORTUNITY_TYPES.MARGIN_DEFENSE,
    ).length,
    deadstockRevival: opportunities.filter(
      (o) => o.type === OPPORTUNITY_TYPES.DEADSTOCK_REVIVAL,
    ).length,
    stockUrgency: opportunities.filter(
      (o) => o.type === OPPORTUNITY_TYPES.STOCK_URGENCY,
    ).length,
  };

  return {
    opportunities,
    summary: {
      totalOpportunities: opportunities.length,
      totalProjectedGain,
      healthScore,
      breakdown,
    },
  };
}
