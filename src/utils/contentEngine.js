/**
 * Content Quality & SEO Engine
 * Evaluates catalog products on content readiness, media, categorization, and SEO quality.
 * Exclusively focused on content completeness and visibility (not financial or sales data).
 */

/**
 * Generate a URL-friendly slug from a string (supports Arabic and alphanumeric).
 */
export function generateSlug(text, id) {
  if (!text) return `product-${id || "item"}`;
  const clean = text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, "-")
    .replace(/[^\w\u0621-\u064A-]/g, "");
  return clean ? `${clean}-${id || "p"}` : `product-${id || "item"}`;
}

/**
 * Generate smart SEO search tags and keywords from title and categories.
 */
export function generateKeywords(product) {
  const words = (product.name || "")
    .replace(/[^\w\u0621-\u064A\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const categoryNames = Array.isArray(product.categories)
    ? product.categories.map((c) => c.name).filter(Boolean)
    : [];

  const baseKeywords = [
    ...words,
    ...categoryNames,
    "شراء اونلاين",
    "متجر رسمي",
    "توصيل سريع",
  ];

  return Array.from(new Set(baseKeywords)).slice(0, 6);
}

/**
 * Generate AI-assisted Arabic copywriting suggestions for product enhancement.
 */
export function generateCopywritingSuggestions(product) {
  const name = product.name || "المنتج";
  const category = product.categories?.[0]?.name || "المتجر";

  const catchyTitle = `${name} - الخيار الأمثل بجودة استثنائية`;
  const metaDescription = `تسوق ${name} الأصلي من قسم ${category}. تمتع بأفضل معايير الجودة، شحن سريع وتجربة تسوق فريدة ومضمونة عبر متجرنا.`;

  const bulletPoints = [
    `تصميم فريد وعصري صُمم ليلبي احتياجاتك بدقة.`,
    `خامات ممتازة تضمن أعلى مستويات المتانة والموثوقية.`,
    `الخيار المثالي ضمن تصنيف ${category} الأكثر طلباً.`,
    `ضمان الجودة مع خيارات استبدال واسترجاع مرنة وسريعة.`,
  ];

  const socialShareText = `🌟 لا يفوتك ${name} المميز في متجرنا!\nاطلبه الآن وتمتع بشحن سريع وجودة لا تضاهى ✨\n#${category.replace(/\s+/g, "_")} #تسوق_اونلاين`;

  return {
    catchyTitle,
    metaDescription,
    bulletPoints,
    socialShareText,
  };
}

/**
 * Analyze an individual product for content health and SEO readiness.
 */
export function analyzeProductContent(product) {
  if (!product || typeof product !== "object") {
    return {
      id: null,
      score: 0,
      status: "critical",
      issues: [{ type: "invalid", label: "بيانات المنتج غير صالحة", severity: "high" }],
      checklist: { hasImage: false, optimalTitle: false, hasSku: false, isCategorized: false },
      seo: { slug: "product", metaTitle: "منتج", keywords: [] },
      copywriting: generateCopywritingSuggestions({}),
    };
  }

  const issues = [];
  let score = 0;

  // 1. Image Check (30 pts)
  const hasImage = Boolean(product.image && typeof product.image === "string" && product.image.trim().length > 0);
  if (hasImage) {
    score += 30;
  } else {
    issues.push({
      type: "missing_image",
      label: "الصورة الرئيسية للمنتج غير متوفرة",
      recommendation: "أضف صورة عالية الجودة لزيادة ثقة العميل وتحسين الظهور",
      severity: "high",
    });
  }

  // 2. Title Optimization (30 pts)
  const title = (product.name || "").trim();
  const titleLength = title.length;
  let optimalTitle = false;

  if (titleLength >= 15 && titleLength <= 90) {
    score += 30;
    optimalTitle = true;
  } else if (titleLength >= 8 && titleLength < 15) {
    score += 18;
    issues.push({
      type: "short_title",
      label: "عنوان المنتج قصير ويمكن تحسينه",
      recommendation: "العناوين التي تتراوح بين 15 و80 حرفاً تظهر بشكل أفضل في بحث Google",
      severity: "medium",
    });
  } else {
    score += 5;
    issues.push({
      type: "title_too_short",
      label: "عنوان المنتج قصير جداً أو مفقود",
      recommendation: "حدد اسماً دقيقاً ووصفياً للمنتج مع إضافة الكلمات المميزة",
      severity: "high",
    });
  }

  // 3. SKU Identification (20 pts)
  const hasSku = Boolean(product.sku && String(product.sku).trim().length > 0);
  if (hasSku) {
    score += 20;
  } else {
    issues.push({
      type: "missing_sku",
      label: "رمز المنتج (SKU) غير محدد",
      recommendation: "رمز SKU يسهل تنظيم الفواتير والتتبع وإدارة المستودع بدقة",
      severity: "medium",
    });
  }

  // 4. Categorization (20 pts)
  const categories = Array.isArray(product.categories) ? product.categories.filter((c) => c && c.name) : [];
  const isCategorized = categories.length > 0;
  if (isCategorized) {
    score += 20;
  } else {
    issues.push({
      type: "uncategorized",
      label: "المنتج غير مربوط بأي تصنيف",
      recommendation: "ربط المنتج بتصنيف واضح يساعد المشترين في العثور عليه ومحركات البحث في فهمه",
      severity: "medium",
    });
  }

  // Determine overall status label & badge
  let status = "critical";
  let statusLabel = "حرج";
  if (score >= 85) {
    status = "excellent";
    statusLabel = "ممتاز";
  } else if (score >= 65) {
    status = "good";
    statusLabel = "جيد";
  } else if (score >= 45) {
    status = "needs_improvement";
    statusLabel = "بحاجة لتحسين";
  }

  const slug = generateSlug(title, product.id);
  const metaTitle = `${title || "منتج"} | المتجر الرسمي`;
  const keywords = generateKeywords(product);
  const copywriting = generateCopywritingSuggestions(product);

  return {
    id: product.id,
    name: title || "—",
    sku: product.sku || null,
    image: product.image || null,
    categories,
    score,
    status,
    statusLabel,
    issues,
    checklist: {
      hasImage,
      optimalTitle,
      hasSku,
      isCategorized,
    },
    seo: {
      slug,
      metaTitle,
      keywords,
    },
    copywriting,
  };
}

/**
 * Aggregate catalog-wide content metrics for the entire product list.
 */
export function calculateCatalogContentStats(products = []) {
  if (!Array.isArray(products) || products.length === 0) {
    return {
      totalProducts: 0,
      averageScore: 0,
      healthRating: "—",
      needsAttentionCount: 0,
      readyCount: 0,
      missingImagesCount: 0,
      missingSkuCount: 0,
      uncategorizedCount: 0,
      analyzedProducts: [],
    };
  }

  const analyzed = products.map((p) => analyzeProductContent(p));
  const total = analyzed.length;
  const totalScore = analyzed.reduce((sum, item) => sum + item.score, 0);
  const averageScore = Math.round(totalScore / total);

  const missingImagesCount = analyzed.filter((p) => !p.checklist.hasImage).length;
  const missingSkuCount = analyzed.filter((p) => !p.checklist.hasSku).length;
  const uncategorizedCount = analyzed.filter((p) => !p.checklist.isCategorized).length;
  const needsAttentionCount = analyzed.filter((p) => p.score < 80).length;
  const readyCount = analyzed.filter((p) => p.score >= 80).length;

  let healthRating = "يحتاج عناية";
  if (averageScore >= 80) healthRating = "ممتاز";
  else if (averageScore >= 60) healthRating = "جيد";

  return {
    totalProducts: total,
    averageScore,
    healthRating,
    needsAttentionCount,
    readyCount,
    missingImagesCount,
    missingSkuCount,
    uncategorizedCount,
    analyzedProducts: analyzed,
  };
}
