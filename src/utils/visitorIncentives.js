/**
 * Configuration and logic for High-Frequency Visitor Detection & Storefront Incentive Modal
 * Designed for Salla Embedded Apps & Twilight Storefronts.
 */

export const DEFAULT_INCENTIVE_CONFIG = {
  enabled: true,
  minVisits: 3,
  timeWindowMinutes: 60, // visits within this timeframe (e.g., 1 hour)
  headline: "سعداء بزيارتك المتكررة لمتجرنا! ✨",
  message:
    "لاحظنا اهتمامك بمنتجاتنا المميزة! يسعدنا تقديم خصم حصري لتكمل طلبك وتستمتع بتجربة تسوق فريدة.",
  couponCode: "SPECIAL3X",
  discountType: "percentage", // "percentage" | "fixed"
  discountValue: 15,
  ctaText: "تطبيق الخصم وإكمال الطلب 🛍️",
  dismissText: "متابعة التصفح",
  showCountdown: true,
  countdownMinutes: 15,
  accentColor: "#73fcd7",
  primaryColor: "#004d5b",
};

/**
 * Checks whether a visitor qualifies for the incentive modal
 * @param {object} visitor
 * @param {Array<number>} visitor.visitTimestamps - timestamps in ms of recent visits
 * @param {number} visitor.purchasesCount - total orders by this visitor
 * @param {object} config
 * @returns {boolean}
 */
export function checkVisitorEligibility(
  visitor,
  config = DEFAULT_INCENTIVE_CONFIG,
) {
  if (!config.enabled) return false;
  if (!visitor || !Array.isArray(visitor.visitTimestamps)) return false;
  if ((visitor.purchasesCount || 0) > 0) return false;

  const now = Date.now();
  const windowMs = (config.timeWindowMinutes || 60) * 60 * 1000;
  const recentVisits = visitor.visitTimestamps.filter(
    (timestamp) => now - timestamp <= windowMs,
  );

  return recentVisits.length >= (config.minVisits || 3);
}

/**
 * Generates realistic mock visitor tracking data for the merchant dashboard
 * @param {Array} products - Available store products
 * @returns {Array<object>}
 */
export function generateMockFrequentVisitors(products = []) {
  const now = Date.now();
  const getProductTitle = (index) =>
    products[index % (products.length || 1)]?.name || "منتج مميز";

  return [
    {
      id: "vis_9841",
      name: "عبدالله الشمري",
      visitorType: "registered",
      city: "الرياض",
      device: "iPhone (Safari)",
      visitCount: 3,
      visitTimestamps: [
        now - 8 * 60 * 1000,
        now - 4 * 60 * 1000,
        now - 1 * 60 * 1000,
      ],
      purchasesCount: 0,
      cartItemsCount: 2,
      cartValue: 340,
      viewedProducts: [getProductTitle(0), getProductTitle(1)],
      status: "qualified", // qualified | offered | converted | cold
      lastVisitedAgo: "منذ دقيقة",
      timeSpanText: "3 زيارات خلال 8 دقائق",
    },
    {
      id: "vis_7214",
      name: "زائر (مجهول)",
      visitorType: "guest",
      city: "جدة",
      device: "Chrome (Windows)",
      visitCount: 4,
      visitTimestamps: [
        now - 25 * 60 * 1000,
        now - 18 * 60 * 1000,
        now - 10 * 60 * 1000,
        now - 2 * 60 * 1000,
      ],
      purchasesCount: 0,
      cartItemsCount: 1,
      cartValue: 185,
      viewedProducts: [getProductTitle(2)],
      status: "qualified",
      lastVisitedAgo: "منذ دقيقتين",
      timeSpanText: "4 زيارات خلال 25 دقيقة",
    },
    {
      id: "vis_6512",
      name: "سارة القحطاني",
      visitorType: "registered",
      city: "الدمام",
      device: "Samsung Galaxy (Chrome)",
      visitCount: 3,
      visitTimestamps: [
        now - 35 * 60 * 1000,
        now - 20 * 60 * 1000,
        now - 5 * 60 * 1000,
      ],
      purchasesCount: 0,
      cartItemsCount: 0,
      cartValue: 0,
      viewedProducts: [getProductTitle(0), getProductTitle(3)],
      status: "qualified",
      lastVisitedAgo: "منذ 5 دقائق",
      timeSpanText: "3 زيارات خلال 35 دقيقة",
    },
    {
      id: "vis_5109",
      name: "زائر (مجهول)",
      visitorType: "guest",
      city: "مكة المكرمة",
      device: "iPhone (Safari)",
      visitCount: 2,
      visitTimestamps: [now - 15 * 60 * 1000, now - 3 * 60 * 1000],
      purchasesCount: 0,
      cartItemsCount: 1,
      cartValue: 95,
      viewedProducts: [getProductTitle(1)],
      status: "watching",
      lastVisitedAgo: "منذ 3 دقائق",
      timeSpanText: "زيارتان خلال 15 دقيقة (بانتظار الثالثة)",
    },
    {
      id: "vis_4420",
      name: "فهد العتيبي",
      visitorType: "registered",
      city: "المدينة المنورة",
      device: "iPad (Safari)",
      visitCount: 5,
      visitTimestamps: [
        now - 50 * 60 * 1000,
        now - 40 * 60 * 1000,
        now - 28 * 60 * 1000,
        now - 12 * 60 * 1000,
        now - 6 * 60 * 1000,
      ],
      purchasesCount: 0,
      cartItemsCount: 3,
      cartValue: 520,
      viewedProducts: [
        getProductTitle(0),
        getProductTitle(2),
        getProductTitle(3),
      ],
      status: "offered",
      lastVisitedAgo: "منذ 6 دقائق",
      timeSpanText: "5 زيارات خلال 50 دقيقة (تم عرض المودال)",
    },
    {
      id: "vis_3311",
      name: "نورة الدوسري",
      visitorType: "registered",
      city: "الخبر",
      device: "Mac (Safari)",
      visitCount: 3,
      visitTimestamps: [
        now - 55 * 60 * 1000,
        now - 30 * 60 * 1000,
        now - 15 * 60 * 1000,
      ],
      purchasesCount: 1,
      cartItemsCount: 0,
      cartValue: 0,
      viewedProducts: [getProductTitle(1)],
      status: "converted",
      lastVisitedAgo: "منذ 15 دقيقة",
      timeSpanText: "3 زيارات - أتم الشراء بعد الخصم 🎉",
    },
  ];
}

/**
 * Generates the clean JavaScript snippet for the Salla Twilight Storefront
 * Tracks visitor sessions via localStorage and auto-triggers modal after 3 visits.
 * @param {object} config
 * @returns {string}
 */
export function generateStorefrontTrackingScript(
  config = DEFAULT_INCENTIVE_CONFIG,
) {
  const safeConfig = JSON.stringify(config);

  return [
    "<!-- Salla Frequent Visitor Retention & Incentive Modal Script -->",
    "<script>",
    "(function() {",
    "  const CONFIG = " + safeConfig + ";",
    "  if (!CONFIG.enabled) return;",
    "",
    "  const STORAGE_KEY = '_salla_freq_visitor';",
    "  const MODAL_SHOWN_KEY = '_salla_modal_displayed';",
    "  const now = Date.now();",
    "  const windowMs = (CONFIG.timeWindowMinutes || 60) * 60 * 1000;",
    "",
    "  let history = [];",
    "  try {",
    "    const raw = localStorage.getItem(STORAGE_KEY);",
    "    if (raw) history = JSON.parse(raw);",
    "  } catch (e) {",
    "    history = [];",
    "  }",
    "",
    "  history = history.filter(function(ts) { return (now - ts) <= windowMs; });",
    "  history.push(now);",
    "",
    "  try {",
    "    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));",
    "  } catch (e) {}",
    "",
    "  const hasPurchased = document.cookie.indexOf('salla_has_ordered=1') !== -1;",
    "  const alreadyShown = sessionStorage.getItem(MODAL_SHOWN_KEY);",
    "",
    "  if (history.length >= (CONFIG.minVisits || 3) && !hasPurchased && !alreadyShown) {",
    "    setTimeout(showIncentiveModal, 2000);",
    "  }",
    "",
    "  function showIncentiveModal() {",
    "    sessionStorage.setItem(MODAL_SHOWN_KEY, 'true');",
    "    const existing = document.getElementById('salla-freq-visitor-modal');",
    "    if (existing) existing.remove();",
    "",
    "    const overlay = document.createElement('div');",
    "    overlay.id = 'salla-freq-visitor-modal';",
    "    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,30,36,0.65);backdrop-filter:blur(5px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:PingARLT,system-ui,sans-serif;direction:rtl;';",
    "",
    "    const card = document.createElement('div');",
    "    card.style.cssText = 'background:#ffffff;border-radius:18px;max-width:440px;width:100%;box-shadow:0 20px 40px rgba(0,77,91,0.25);border:2px solid #73fcd7;overflow:hidden;';",
    "",
    "    card.innerHTML = '<div style=\"background:#004d5b;padding:24px 20px;text-align:center;color:#ffffff;position:relative;\">' +",
    '      \'<button id="salla-modal-close" style="position:absolute;top:14px;left:14px;background:none;border:none;color:#ffffff;font-size:20px;cursor:pointer;opacity:0.8;">✕</button>\' +',
    "      '<div style=\"width:50px;height:50px;border-radius:50%;background:#73fcd7;color:#004d5b;display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:12px;font-weight:bold;\">🎁</div>' +",
    "      '<h3 style=\"margin:0 0 8px;font-size:18px;font-weight:700;\">' + CONFIG.headline + '</h3>' +",
    "      '<p style=\"margin:0;font-size:13px;opacity:0.9;line-height:1.5;\">' + CONFIG.message + '</p>' +",
    "      '</div>' +",
    "      '<div style=\"padding:20px;background:#f8f8f8;text-align:center;\">' +",
    "      '<div style=\"background:#ffffff;border:2px dashed #004d5b;border-radius:12px;padding:12px;margin-bottom:16px;\">' +",
    "      '<span style=\"font-size:12px;color:#5c6166;display:block;margin-bottom:4px;\">كود الخصم الحصري لك:</span>' +",
    "      '<span style=\"font-size:22px;font-weight:800;letter-spacing:2px;color:#004d5b;font-family:monospace;\">' + CONFIG.couponCode + '</span>' +",
    "      '<span style=\"display:inline-block;background:#73fcd7;color:#004d5b;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;margin-right:8px;\">خصم ' + CONFIG.discountValue + '%</span>' +",
    "      '</div>' +",
    '      \'<button id="salla-modal-apply" style="width:100%;padding:14px;background:#004d5b;color:#ffffff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,77,91,0.25);">\' +',
    "      CONFIG.ctaText +",
    "      '</button>' +",
    '      \'<button id="salla-modal-dismiss" style="margin-top:10px;background:none;border:none;color:#6f757b;font-size:12px;cursor:pointer;text-decoration:underline;">\' +',
    "      CONFIG.dismissText +",
    "      '</button>' +",
    "      '</div>';",
    "",
    "    overlay.appendChild(card);",
    "    document.body.appendChild(overlay);",
    "",
    "    function dismiss() { overlay.remove(); }",
    "    document.getElementById('salla-modal-close').onclick = dismiss;",
    "    document.getElementById('salla-modal-dismiss').onclick = dismiss;",
    "    document.getElementById('salla-modal-apply').onclick = function() {",
    "      if (window.salla && window.salla.cart && window.salla.cart.applyCoupon) {",
    "        window.salla.cart.applyCoupon(CONFIG.couponCode).then(function() {",
    "          window.location.href = '/cart';",
    "        }).catch(function() {",
    "          navigator.clipboard.writeText(CONFIG.couponCode);",
    "          window.location.href = '/cart';",
    "        });",
    "      } else {",
    "        navigator.clipboard.writeText(CONFIG.couponCode);",
    "        this.innerText = 'تم نسخ الكود! جارٍ التحويل...';",
    "        setTimeout(function() { window.location.href = '/cart'; }, 1000);",
    "      }",
    "    };",
    "  }",
    "})();",
    "</script>",
  ].join("\n");
}
