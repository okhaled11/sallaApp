/**
 * campaignEngine.js
 * Intelligence engine for generating smart promotional campaigns,
 * bundles, clearance deals, and financial impact simulations for Salla stores.
 */

/**
 * Format currency amount safely.
 */
function roundMoney(num) {
  return Math.round((Number(num) || 0) * 100) / 100;
}

/**
 * Calculates estimated profit margin given selling price and cost price.
 */
function calculateMargin(price, cost) {
  if (!cost || cost <= 0 || !price || price <= 0) return null;
  return roundMoney((price - cost) / price);
}

/**
 * Analyze store products and generate prioritized smart campaign recommendations.
 *
 * @param {Array} products - Store products from Salla API
 * @param {Object} options - Custom parameters (e.g. minClearanceStock)
 * @returns {Array} List of smart campaign recommendations
 */
export function generateSmartCampaignRecommendations(products = [], options = {}) {
  if (!Array.isArray(products) || products.length === 0) return [];

  const minClearanceStock = options.minClearanceStock ?? 5;
  const recommendations = [];

  // Sort products by sold_quantity descending
  const sortedBySales = [...products].sort(
    (a, b) => (Number(b.sold_quantity) || 0) - (Number(a.sold_quantity) || 0),
  );

  const topSellers = sortedBySales.filter(
    (p) => (Number(p.sold_quantity) || 0) > 0 && Number(p.price) > 0,
  );

  // 1. CLEARANCE RECOMMENDATION (Dead or slow-moving stock with idle capital)
  const deadStockItems = products.filter((p) => {
    const stock = Number(p.quantity) || 0;
    const sold = Number(p.sold_quantity) || 0;
    const price = Number(p.price) || 0;
    return stock >= minClearanceStock && sold <= 1 && price > 0;
  });

  if (deadStockItems.length > 0) {
    // Pick the item with the highest stock value
    const targetItem = deadStockItems.sort((a, b) => {
      const valA = (Number(a.price) || 0) * (Number(a.quantity) || 0);
      const valB = (Number(b.price) || 0) * (Number(b.quantity) || 0);
      return valB - valA;
    })[0];

    const originalPrice = Number(targetItem.price) || 0;
    const cost = Number(targetItem.cost_price) || 0;
    const stock = Number(targetItem.quantity) || 0;

    // Recommend 25% off, ensuring we don't go below cost + 5% if cost is known
    let discountPercent = 25;
    let promoPrice = roundMoney(originalPrice * (1 - discountPercent / 100));

    if (cost > 0 && promoPrice < cost * 1.05) {
      promoPrice = roundMoney(cost * 1.08);
      discountPercent = Math.max(
        5,
        Math.round(((originalPrice - promoPrice) / originalPrice) * 100),
      );
    }

    const savings = roundMoney(originalPrice - promoPrice);
    const unlockedCapital = roundMoney(promoPrice * stock);
    const marginAfterDiscount = calculateMargin(promoPrice, cost);

    recommendations.push({
      id: `clearance-${targetItem.id}`,
      type: "clearance",
      badgeText: "تصفية مخزون راكد",
      title: `تصفية سريعة: ${targetItem.name}`,
      description: `منتج راكد يتوفر منه ${stock} قطعة بالمخزون. تفعيل خصم ${discountPercent}% يساعد في استرداد سيولة معطلة قدرها ${unlockedCapital} ${targetItem.currency || "ر.س"}.`,
      urgency: "high",
      targetProduct: targetItem,
      products: [targetItem],
      originalPrice,
      discountedPrice: promoPrice,
      discountPercent,
      savingsAmount: savings,
      estimatedMargin: marginAfterDiscount,
      unlockedCapital,
      suggestedCode: `CLEAR${discountPercent}`,
      canApplyDirectly: true,
    });
  }

  // 2. SMART BUNDLE (Pair top seller with complementary or slow-moving item)
  if (topSellers.length >= 1 && products.length >= 2) {
    const hero = topSellers[0];
    // Find companion item: preferably from same category or second item
    const companion =
      products.find(
        (p) =>
          p.id !== hero.id &&
          (p.category_id === hero.category_id ||
            p.category?.id === hero.category?.id ||
            (Number(p.sold_quantity) || 0) < (Number(hero.sold_quantity) || 0)),
      ) || products.find((p) => p.id !== hero.id);

    if (companion) {
      const p1Price = Number(hero.price) || 0;
      const p2Price = Number(companion.price) || 0;
      const totalOriginal = roundMoney(p1Price + p2Price);

      const discountPercent = 15;
      const bundlePrice = roundMoney(totalOriginal * (1 - discountPercent / 100));
      const savings = roundMoney(totalOriginal - bundlePrice);

      const totalCost =
        (Number(hero.cost_price) || 0) + (Number(companion.cost_price) || 0);
      const margin =
        totalCost > 0 ? calculateMargin(bundlePrice, totalCost) : null;

      recommendations.push({
        id: `bundle-${hero.id}-${companion.id}`,
        type: "bundle",
        badgeText: "حزمة توفير ذكية",
        title: `حزمة القوة: ${hero.name} + ${companion.name}`,
        description: `دمج المنتج الأكثر مبيعاً مع منتج مساند يعزز متوسط قيمة الطلب (AOV) ويحقق توفيراً جذاباً للعميل بنسبة ${discountPercent}%.`,
        urgency: "medium",
        products: [hero, companion],
        heroProduct: hero,
        companionProduct: companion,
        originalPrice: totalOriginal,
        discountedPrice: bundlePrice,
        discountPercent,
        savingsAmount: savings,
        estimatedMargin: margin,
        unlockedCapital: null,
        suggestedCode: `BUNDLE${discountPercent}`,
        canApplyDirectly: false,
      });
    }
  }

  // 3. VOLUME TIER / BOGO (Buy 2 get 15% off OR Buy 1 Get 2nd at 50%)
  if (topSellers.length >= 1) {
    const target = topSellers[0];
    const unitPrice = Number(target.price) || 0;
    const cost = Number(target.cost_price) || 0;

    // Buy 2 items: 2nd item at 50% off => total 1.5 * price (25% total discount)
    const twoItemsOriginal = roundMoney(unitPrice * 2);
    const twoItemsPromo = roundMoney(unitPrice * 1.5);
    const savings = roundMoney(twoItemsOriginal - twoItemsPromo);
    const margin = cost > 0 ? calculateMargin(twoItemsPromo, cost * 2) : null;

    recommendations.push({
      id: `volume-${target.id}`,
      type: "volume",
      badgeText: "عرض الكمية (BOGO)",
      title: `اشتري 1 واحصل على الثاني بنصف السعر: ${target.name}`,
      description: `تشجيع الزبائن على شراء قطعتين يزيد حركة دوران المخزون للأكثر طلباً بهامش ربح إجمالي ممتاز.`,
      urgency: "medium",
      targetProduct: target,
      products: [target],
      originalPrice: twoItemsOriginal,
      discountedPrice: twoItemsPromo,
      discountPercent: 25,
      savingsAmount: savings,
      estimatedMargin: margin,
      unlockedCapital: null,
      suggestedCode: `BOGO50`,
      canApplyDirectly: false,
    });
  }

  // 4. FLASH SALE BOOSTER (High margin product with great potential)
  const highMarginItems = products.filter((p) => {
    const price = Number(p.price) || 0;
    const cost = Number(p.cost_price) || 0;
    if (price <= 0 || cost <= 0) return false;
    const m = (price - cost) / price;
    return m >= 0.35 && (Number(p.quantity) || 0) > 3;
  });

  if (highMarginItems.length > 0) {
    const flashItem = highMarginItems[0];
    const originalPrice = Number(flashItem.price) || 0;
    const cost = Number(flashItem.cost_price) || 0;
    const discountPercent = 15;
    const promoPrice = roundMoney(originalPrice * (1 - discountPercent / 100));
    const savings = roundMoney(originalPrice - promoPrice);
    const margin = calculateMargin(promoPrice, cost);

    recommendations.push({
      id: `flash-${flashItem.id}`,
      type: "flash",
      badgeText: "تخفيض خاطف (Flash Sale)",
      title: `خصم خاطف لنهاية الأسبوع: ${flashItem.name}`,
      description: `يتمتع المنتج بهامش ربح قوي، خصم خاطف بنسبة ${discountPercent}% يرفع المبيعات مع الحفاظ على هامش ربح ${Math.round((margin || 0) * 100)}%.`,
      urgency: "medium",
      targetProduct: flashItem,
      products: [flashItem],
      originalPrice,
      discountedPrice: promoPrice,
      discountPercent,
      savingsAmount: savings,
      estimatedMargin: margin,
      unlockedCapital: null,
      suggestedCode: `FLASH${discountPercent}`,
      canApplyDirectly: true,
    });
  }

  return recommendations;
}

/**
 * Calculate financial impact for a custom campaign.
 */
export function calculateCampaignImpact({
  products = [],
  discountType = "percent", // 'percent' | 'fixed'
  discountValue = 10,
}) {
  const originalPrice = roundMoney(
    products.reduce((acc, p) => acc + (Number(p.price) || 0), 0),
  );
  const totalCost = roundMoney(
    products.reduce((acc, p) => acc + (Number(p.cost_price) || 0), 0),
  );

  let discountedPrice = originalPrice;
  let savingsAmount = 0;
  let discountPercent = 0;

  const value = Number(discountValue) || 0;

  if (discountType === "percent") {
    discountPercent = Math.min(90, Math.max(1, value));
    discountedPrice = roundMoney(originalPrice * (1 - discountPercent / 100));
    savingsAmount = roundMoney(originalPrice - discountedPrice);
  } else {
    savingsAmount = Math.min(originalPrice * 0.9, Math.max(1, value));
    discountedPrice = roundMoney(originalPrice - savingsAmount);
    discountPercent =
      originalPrice > 0
        ? Math.round((savingsAmount / originalPrice) * 100)
        : 0;
  }

  const estimatedMargin =
    totalCost > 0 ? calculateMargin(discountedPrice, totalCost) : null;

  return {
    originalPrice,
    discountedPrice,
    savingsAmount,
    discountPercent,
    estimatedMargin,
  };
}

/**
 * Generate marketing copy tailored for WhatsApp, Social Media, and Store Banner.
 */
export function generateMarketingCopy(campaign, currency = "ر.س") {
  if (!campaign) return { whatsapp: "", social: "", banner: "" };

  const title = campaign.title || "عرض خاص ومميز";
  const orig = campaign.originalPrice;
  const promo = campaign.discountedPrice;
  const savings = campaign.savingsAmount;
  const code = campaign.suggestedCode || "PROMO";

  const productNames =
    campaign.products?.map((p) => p.name).join(" + ") || "المنتج";

  // 1. WhatsApp / SMS Format
  const whatsapp =
    `🔥 *${title}* 🔥\n\n` +
    `لا يفوتك العرض الخاص لفترة محدودة على:\n` +
    `✨ *${productNames}*\n\n` +
    `💰 السعر قبل العرض: ~${orig} ${currency}~\n` +
    `⚡ السعر الحالي: *${promo} ${currency}* فقط!\n` +
    `🎁 وفرت معنا: *${savings} ${currency}* (${campaign.discountPercent}% خصم)\n\n` +
    `🏷️ استخدم كود الخصم: *${code}*\n` +
    `🛒 اطلب الآن قبل نفاد الكمية!`;

  // 2. Social Media (Instagram / Snapchat / TikTok)
  const social =
    `✨ عرض حصري لفترة محدودة! ✨\n\n` +
    `احصل على ${productNames} بسعر استثنائي:\n` +
    `💥 ${promo} ${currency} بدلاً من ${orig} ${currency}!\n` +
    `وفر ${savings} ${currency} مباشرة عند الطلب 🛍️\n\n` +
    `كود الخصم: ${code}\n` +
    `الرابط في البايو أو تفضل بزيارة المتجر 👆\n\n` +
    `#سلة #عروض #تخفيضات #خصم #تسوق #متجر_إلكتروني`;

  // 3. Store Announcement Banner
  const banner = `🎉 ${campaign.badgeText}: احصل على ${productNames} بـ ${promo} ${currency} فقط (وفر ${savings} ${currency}) بكود [ ${code} ]`;

  return { whatsapp, social, banner };
}

/**
 * Step-by-step instructions to configure this campaign in the Salla Merchant Dashboard.
 */
export function generateSallaInstructions(campaign) {
  if (!campaign) return [];

  const code = campaign.suggestedCode || "PROMO";

  if (campaign.type === "clearance" || campaign.type === "flash") {
    return [
      `1. انتقل في لوحة تحكم سلة إلى: التسويق > كوبونات التخفيض أو العروض الخاصة.`,
      `2. أنشئ كوبون خصم جديد باسم: ${code}.`,
      `3. اختر نوع الخصم: نسبة مئوية (${campaign.discountPercent}%) أو حدد سعراً مخفضاً مباشراً للمنتج.`,
      `4. حدد المنتج المستهدف: "${campaign.products?.[0]?.name || "المنتج"}".`,
      `5. أو ببساطة: انقر على زر "تطبيق السعر المخفض فوراً" لتحديث سعر البيع في متجرك مباشرة عبر التطبيق.`,
    ];
  }

  if (campaign.type === "bundle") {
    return [
      `1. انتقل في لوحة تحكم سلة إلى: التسويق > العروض الخاصة > اشتر منتج واحصل على منتج.`,
      `2. أو أنشئ حزمة منتجات (Bundle) بالمنتجين: "${campaign.products?.[0]?.name}" و "${campaign.products?.[1]?.name}".`,
      `3. حدد سعر الحزمة الإجمالي: ${campaign.discountedPrice} ر.س (خصم ${campaign.discountPercent}%).`,
      `4. شارك رابط العرض مع نصوص الدعاية الجاهزة في واتساب وشبكات التواصل.`,
    ];
  }

  return [
    `1. في لوحة تحكم سلة: اختر التسويق > كوبونات التخفيض.`,
    `2. ضع كود الخصم: ${code}.`,
    `3. حدد نوع الخصم: نسبة مئوية (${campaign.discountPercent}%).`,
    `4. ضع شرط العرض: كمية المنتج قطعتين أو أكثر.`,
  ];
}
