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
  couponCaption: "كود الخصم الحصري لك:",
  discountType: "percentage", // "percentage" | "fixed"
  discountValue: 15,
  ctaText: "تطبيق الخصم وإكمال الطلب 🛍️",
  dismissText: "متابعة التصفح",
  giftEmoji: "🎁",
  showCountdown: true,
  countdownMinutes: 15,
  accentColor: "#73fcd7",
  primaryColor: "#004d5b",
  enableRealtimePresence: true,
  showLiveCounterBadge: false, // optional social proof live visitor counter badge
  tokenEndpoint:
    "https://live-visitor-counter-backend.vercel.app/api/presence-token",
  ablyCdn: "https://cdn.ably.com/lib/ably.min-2.js",
};

export const INCENTIVE_CONFIG_STORAGE_KEY = "_salla_incentive_config";

/**
 * Loads saved merchant configuration from storage or falls back to defaults
 * @returns {object}
 */
export function loadSavedIncentiveConfig() {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_INCENTIVE_CONFIG;
  }
  try {
    const raw = window.localStorage.getItem(INCENTIVE_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_INCENTIVE_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_INCENTIVE_CONFIG, ...parsed };
  } catch {
    return DEFAULT_INCENTIVE_CONFIG;
  }
}

/**
 * Saves merchant configuration to storage for storefront synchronization
 * @param {object} config
 */
export function saveIncentiveConfig(config) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      INCENTIVE_CONFIG_STORAGE_KEY,
      JSON.stringify(config),
    );
  } catch {
    // ignore
  }
}

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

export const REAL_VISITORS_STORAGE_KEY = "_salla_frequent_visitors_log";

/**
 * Loads real tracked visitors from browser storage
 * @returns {Array<object>}
 */
export function getRealStoredVisitors() {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(REAL_VISITORS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Saves tracked visitors to browser storage
 * @param {Array<object>} visitors
 */
export function saveRealStoredVisitors(visitors) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      REAL_VISITORS_STORAGE_KEY,
      JSON.stringify(visitors),
    );
  } catch {
    // ignore
  }
}

/**
 * Records a real session event for a visitor
 * @param {object} visitorData
 * @returns {Array<object>} Updated list of visitors
 */
export function recordRealVisitorSession(visitorData = {}) {
  const current = getRealStoredVisitors();
  const now = Date.now();
  const id = visitorData.id || `vis_${now.toString(36)}`;
  const existingIndex = current.findIndex((v) => v.id === id);

  let updatedList;
  if (existingIndex >= 0) {
    const existing = current[existingIndex];
    const timestamps = [...(existing.visitTimestamps || []), now];
    const updated = {
      ...existing,
      ...visitorData,
      id,
      visitCount: timestamps.length,
      visitTimestamps: timestamps,
      lastVisitedAgo: "الآن (متصل)",
      isOnline: true,
      status: timestamps.length >= 3 ? "qualified" : existing.status,
      timeSpanText: `${timestamps.length} زيارات خلال وقت متقارب`,
    };
    updatedList = [...current];
    updatedList[existingIndex] = updated;
  } else {
    const newVisitor = {
      id,
      name: visitorData.name || `زائر متجر سلة (#${id.slice(-4)})`,
      visitorType: visitorData.visitorType || "guest",
      city: visitorData.city || "متصفح حقيقي",
      device:
        visitorData.device ||
        (typeof navigator !== "undefined" &&
        /Mobile|Android|iPhone/i.test(navigator.userAgent)
          ? "جوال (سلة)"
          : "متصفح ويب"),
      visitCount: 1,
      isOnline: true,
      visitTimestamps: [now],
      purchasesCount: 0,
      cartItemsCount: visitorData.cartItemsCount || 0,
      cartValue: visitorData.cartValue || 0,
      viewedProducts: visitorData.viewedProducts || ["واجهة المتجر"],
      status: "watching",
      lastVisitedAgo: "الآن (متصل)",
      timeSpanText: "زيارة واحدة (بانتظار الزيارات التالية)",
    };
    updatedList = [newVisitor, ...current];
  }

  saveRealStoredVisitors(updatedList);
  return updatedList;
}

/**
 * Clears real visitor storage
 */
export function clearRealStoredVisitors() {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(REAL_VISITORS_STORAGE_KEY);
  } catch {
    // ignore
  }
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
      isOnline: true,
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
      lastVisitedAgo: "متصل الآن (صفحة المنتج)",
      timeSpanText: "3 زيارات خلال 8 دقائق",
    },
    {
      id: "vis_7214",
      name: "زائر (مجهول)",
      visitorType: "guest",
      city: "جدة",
      device: "Chrome (Windows)",
      visitCount: 4,
      isOnline: true,
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
      lastVisitedAgo: "متصل الآن (سلة المشتريات)",
      timeSpanText: "4 زيارات خلال 25 دقيقة",
    },
    {
      id: "vis_6512",
      name: "سارة القحطاني",
      visitorType: "registered",
      city: "الدمام",
      device: "Samsung Galaxy (Chrome)",
      visitCount: 3,
      isOnline: false,
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
      isOnline: true,
      visitTimestamps: [now - 15 * 60 * 1000, now - 3 * 60 * 1000],
      purchasesCount: 0,
      cartItemsCount: 1,
      cartValue: 95,
      viewedProducts: [getProductTitle(1)],
      status: "watching",
      lastVisitedAgo: "متصل الآن (الرئيسية)",
      timeSpanText: "زيارتان خلال 15 دقيقة (بانتظار الثالثة)",
    },
    {
      id: "vis_4420",
      name: "فهد العتيبي",
      visitorType: "registered",
      city: "المدينة المنورة",
      device: "iPad (Safari)",
      visitCount: 5,
      isOnline: false,
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
      isOnline: false,
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
 * Tracks visitor sessions via Ably Realtime Presence + localStorage and auto-triggers modal after 3 visits.
 * @param {object} config
 * @returns {string}
 */
export function generateStorefrontTrackingScript(
  config = DEFAULT_INCENTIVE_CONFIG,
  targetStoreId = "apptest",
  includeHtmlTags = false,
) {
  const safeConfig = JSON.stringify(config);
  const safeStoreId = JSON.stringify(String(targetStoreId || "apptest"));

  const jsLines = [
    "/**",
    " * Salla Frequent Visitor Retention & Ably Realtime Presence Script",
    " * Target Store: " + safeStoreId,
    " */",
    "(function() {",
    '  "use strict";',
    "",
    "  var CONFIG = " + safeConfig + ";",
    "  var TARGET_STORE_ID = " + safeStoreId + ";",
    "  if (!CONFIG.enabled) return;",
    "",
    "  function loadScript(src) {",
    "    return new Promise(function(resolve, reject) {",
    "      if (window.Ably) return resolve();",
    '      var s = document.createElement("script");',
    "      s.src = src;",
    "      s.onload = resolve;",
    "      s.onerror = reject;",
    "      document.head.appendChild(s);",
    "    });",
    "  }",
    "",
    "  function getProductIdFromUrl() {",
    "    var match = location.pathname.match(/\\/p(\\d+)/);",
    "    return match ? match[1] : null;",
    "  }",
    "",
    "  var hasStarted = false;",
    "  function startTracking() {",
    "    if (hasStarted) return;",
    "    hasStarted = true;",
    "",
    "    // Determine Store ID (Priority: Configured target -> Twilight SDK -> Hostname -> Fallback)",
    "    var detectedStoreId =",
    '      (typeof salla !== "undefined" && salla.config && salla.config.get &&',
    '        (salla.config.get("store.id") || salla.config.get("store.username") || salla.config.get("store_id"))) ||',
    "      (window.salla && window.salla.config &&",
    "        (window.salla.config.store?.id || window.salla.config.store?.username)) ||",
    "      (function() {",
    '        var h = (location.hostname || "").toLowerCase();',
    "        var m = h.match(/^([a-z0-9-_]+)\\.(salla\\.sa|preview\\.salla\\.sa|dev\\.salla\\.sa)$/);",
    '        if (m && m[1] && m[1] !== "www") return m[1];',
    '        if (h.indexOf("salla.sa") !== -1) {',
    '          var seg = (location.pathname || "").split("/").filter(Boolean)[0];',
    "          if (seg && !seg.match(/^(ar|en|cart|checkout|products|p|c)$/i)) return seg;",
    "        }",
    "        return null;",
    "      })() ||",
    '      "apptest";',
    "",
    "    var storeId = String(TARGET_STORE_ID || detectedStoreId);",
    "",
    '    console.log("%c[Salla-Incentives] 🟢 نظام تتبع الزوار نشط للمتجر: " + storeId, "background:#004d5b;color:#73fcd7;font-weight:bold;padding:4px 8px;border-radius:4px;");',
    "",
    '    var STORAGE_KEY = "_salla_visits_" + storeId;',
    '    var MODAL_SHOWN_KEY = "_salla_modal_shown_" + storeId;',
    '    var CONFIG_STORAGE_KEY = "_salla_incentive_config_" + storeId;',
    "    var now = Date.now();",
    "    var productId = getProductIdFromUrl();",
    "",
    "    // Persistent visitor UUID per device/browser so repeat visits accumulate",
    '    var CLIENT_UUID_KEY = "_salla_visitor_uuid_" + storeId;',
    '    var clientId = "";',
    "    try {",
    "      clientId = localStorage.getItem(CLIENT_UUID_KEY);",
    "    } catch (e) {}",
    "    if (!clientId) {",
    '      clientId = "vis_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);',
    "      try {",
    "        localStorage.setItem(CLIENT_UUID_KEY, clientId);",
    "      } catch (e) {}",
    "    }",
    "",
    "    // Expose reset helper for testing in browser console",
    "    window.resetSallaVisits = function() {",
    "      try {",
    "        localStorage.removeItem(STORAGE_KEY);",
    "        sessionStorage.removeItem(MODAL_SHOWN_KEY);",
    '        console.log("%c[Salla-Incentives] 🔄 تم تصفير عداد الزيارات بنجاح! حدّث الصفحة للبدء من الزيارة 1.", "color:#00b259;font-weight:bold;");',
    "      } catch (e) {}",
    "    };",
    "",
    "    // Dynamically load latest customizer config saved from the dashboard",
    "    var ACTIVE_CONFIG = Object.assign({}, CONFIG);",
    "    try {",
    '      var rawCustom = localStorage.getItem(CONFIG_STORAGE_KEY) || localStorage.getItem("_salla_incentive_config");',
    "      if (rawCustom) {",
    "        var parsedCustom = JSON.parse(rawCustom);",
    "        ACTIVE_CONFIG = Object.assign({}, ACTIVE_CONFIG, parsedCustom);",
    "      }",
    "    } catch (e) {}",
    "",
    "    var windowMs = (ACTIVE_CONFIG.timeWindowMinutes || 60) * 60 * 1000;",
    "",
    "    // Record visitor entry & filter within time window",
    "    var history = [];",
    "    try {",
    "      var raw = localStorage.getItem(STORAGE_KEY);",
    "      if (raw) history = JSON.parse(raw);",
    "    } catch (e) { history = []; }",
    "",
    "    history = history.filter(function(ts) { return (now - ts) <= windowMs; });",
    "    history.push(now);",
    "    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch (e) {}",
    "",
    "    // Sync into merchant dashboard real visitors log (cross-tab)",
    "    try {",
    '      var DASH_LOG_KEY = "_salla_frequent_visitors_log";',
    "      var rawLog = localStorage.getItem(DASH_LOG_KEY);",
    "      var dashList = rawLog ? JSON.parse(rawLog) : [];",
    "      var existingV = dashList.find(function(item) { return item.id === clientId; });",
    "      if (existingV) {",
    "        existingV.visitCount = history.length;",
    "        existingV.visitTimestamps = history;",
    "        existingV.isOnline = true;",
    '        existingV.lastVisitedAgo = "متصل الآن (واجهة المتجر)";',
    '        existingV.timeSpanText = history.length + " زيارات خلال وقت متقارب";',
    "        if (history.length >= (ACTIVE_CONFIG.minVisits || 3)) {",
    '          existingV.status = "qualified";',
    "        }",
    "      } else {",
    "        dashList.unshift({",
    "          id: clientId,",
    '          name: "زائر متجر سلة (#" + clientId.slice(-4) + ")",',
    '          visitorType: "guest",',
    '          city: "متصفح حقيقي",',
    '          device: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? "جوال (سلة)" : "متصفح ويب",',
    "          visitCount: 1,",
    "          isOnline: true,",
    "          visitTimestamps: history,",
    "          purchasesCount: 0,",
    "          cartItemsCount: 0,",
    "          cartValue: 0,",
    '          viewedProducts: [productId ? "منتج رقم " + productId : "تصفح المتجر"],',
    '          status: "watching",',
    '          lastVisitedAgo: "متصل الآن",',
    '          timeSpanText: "زيارة أولى بالمتجر"',
    "        });",
    "      }",
    "      localStorage.setItem(DASH_LOG_KEY, JSON.stringify(dashList.slice(0, 50)));",
    "    } catch (e) {}",
    "",
    "    var visitCount = history.length;",
    '    console.log("%c[Salla-Incentives] 👤 معرف الزائر: " + clientId + " | الزيارات المسجلة: " + visitCount + " / " + (ACTIVE_CONFIG.minVisits || 3), "color:#007580;font-weight:bold;font-size:11px;");',
    "    if (visitCount >= (ACTIVE_CONFIG.minVisits || 3)) {",
    '      console.log("%c[Salla-Incentives] 🎯 الزائر وصل للحد الأدنى (مؤهل للخصم)! جارٍ إظهار النافذة المنبثقة...", "color:#e53e3e;font-weight:bold;");',
    "    }",
    '    var hasPurchased = document.cookie.indexOf("salla_has_ordered=1") !== -1;',
    "    var alreadyShown = sessionStorage.getItem(MODAL_SHOWN_KEY);",
    "",
    "    // Connect to Ably Realtime Presence",
    "    loadScript(ACTIVE_CONFIG.ablyCdn || 'https://cdn.ably.com/lib/ably.min-2.js')",
    "      .then(function() {",
    "        var realtime = new Ably.Realtime({",
    "          authCallback: function(_tokenParams, callback) {",
    "            fetch(ACTIVE_CONFIG.tokenEndpoint, {",
    '              method: "POST",',
    '              headers: { "Content-Type": "application/json" },',
    "              body: JSON.stringify({ storeId: storeId, productId: productId, clientId: clientId, tokenParams: _tokenParams || {} })",
    "            })",
    "              .then(function(res) { return res.json(); })",
    "              .then(function(req) { callback(null, req); })",
    "              .catch(function(err) { callback(err, null); });",
    "          }",
    "        });",
    "",
    '        var storeChannel = realtime.channels.get("presence:store:" + storeId);',
    "        storeChannel.presence.enter({",
    "          clientId: clientId,",
    "          visitCount: visitCount,",
    "          isQualified: visitCount >= (ACTIVE_CONFIG.minVisits || 3),",
    "          productId: productId,",
    "          pathname: location.pathname,",
    "          timestamp: now",
    "        }).then(function() {",
    '          console.log("%c[Salla-Incentives] 📡 تم إرسال حالة التواجد (Presence Active) للقناة: presence:store:" + storeId, "color:#00b259;font-weight:bold;");',
    "        }).catch(function(err) {",
    '          console.warn("[Salla-Incentives] presence.enter error:", err);',
    "        });",
    "",
    "        // Periodically refresh presence heartbeat every 25 seconds",
    "        setInterval(function() {",
    "          try {",
    "            storeChannel.presence.update({",
    "              clientId: clientId,",
    "              visitCount: history.length,",
    "              pathname: location.pathname,",
    "              timestamp: Date.now()",
    "            });",
    "          } catch (e) {}",
    "        }, 25000);",
    "      })",
    "      .catch(function(err) {",
    '        console.warn("[Salla-Incentives] Ably load error:", err);',
    "      });",
    "",
    "    // Check if visitor entered 3 times in close proximity without buying",
    "    if (visitCount >= (ACTIVE_CONFIG.minVisits || 3) && !hasPurchased && !alreadyShown) {",
    "      setTimeout(function() { showIncentiveModal(); }, 1800);",
    "    }",
    "",
    "    function showIncentiveModal(customCoupon) {",
    '      sessionStorage.setItem(MODAL_SHOWN_KEY, "true");',
    '      var existing = document.getElementById("salla-freq-visitor-modal");',
    "      if (existing) existing.remove();",
    "",
    "      var activeCoupon = customCoupon || ACTIVE_CONFIG.couponCode;",
    "      var primaryCol = ACTIVE_CONFIG.primaryColor || '#004d5b';",
    "      var accentCol = ACTIVE_CONFIG.accentColor || '#73fcd7';",
    "      var emoji = ACTIVE_CONFIG.giftEmoji || '🎁';",
    '      var caption = ACTIVE_CONFIG.couponCaption || "كود الخصم الحصري لك:";',
    '      var overlay = document.createElement("div");',
    '      overlay.id = "salla-freq-visitor-modal";',
    '      overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,30,36,0.65);backdrop-filter:blur(5px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:PingARLT,system-ui,sans-serif;direction:rtl;";',
    "",
    '      var card = document.createElement("div");',
    '      card.style.cssText = "background:#ffffff;border-radius:20px;max-width:440px;width:100%;box-shadow:0 20px 45px rgba(0,77,91,0.25);border:2px solid " + accentCol + ";overflow:hidden;animation:popIn 0.3s cubic-bezier(0.16,1,0.3,1);";',
    "",
    "      card.innerHTML = '<div style=\"background:' + primaryCol + ';padding:24px 20px;text-align:center;color:#ffffff;position:relative;\">' +",
    '        \'<button id="salla-modal-close" style="position:absolute;top:14px;left:14px;background:none;border:none;color:#ffffff;font-size:20px;cursor:pointer;opacity:0.8;">✕</button>\' +',
    "        '<div style=\"width:52px;height:52px;border-radius:50%;background:' + accentCol + ';color:' + primaryCol + ';display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:12px;font-weight:bold;\">' + emoji + '</div>' +",
    '        \'<h3 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#ffffff;">\' + ACTIVE_CONFIG.headline + "</h3>" +',
    '        \'<p style="margin:0;font-size:13px;opacity:0.92;line-height:1.5;color:#ffffff;">\' + ACTIVE_CONFIG.message + "</p>" +',
    "        '</div>' +",
    "        '<div style=\"padding:20px;background:#f8f8f8;text-align:center;\">' +",
    "        '<div style=\"background:#ffffff;border:2px dashed ' + primaryCol + ';border-radius:12px;padding:12px;margin-bottom:16px;\">' +",
    '        \'<span style="font-size:12px;color:#374151;font-weight:600;display:block;margin-bottom:4px;">\' + caption + "</span>" +',
    "        '<span style=\"font-size:22px;font-weight:800;letter-spacing:2px;color:' + primaryCol + ';font-family:monospace;\">' + activeCoupon + \"</span>\" +",
    "        '<span style=\"display:inline-block;background:' + accentCol + ';color:' + primaryCol + ';font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;margin-right:8px;\">خصم ' + ACTIVE_CONFIG.discountValue + \"%</span>\" +",
    "        '</div>' +",
    "        '<button id=\"salla-modal-apply\" style=\"width:100%;padding:14px;background:' + primaryCol + ';color:#ffffff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,77,91,0.25);\">' +",
    "        ACTIVE_CONFIG.ctaText +",
    "        '</button>' +",
    '        \'<button id="salla-modal-dismiss" style="margin-top:10px;background:none;border:none;color:#374151;font-size:13px;font-weight:600;cursor:pointer;text-decoration:underline;">\' +',
    "        ACTIVE_CONFIG.dismissText +",
    "        '</button>' +",
    "        '</div>';",
    "",
    "      overlay.appendChild(card);",
    "      document.body.appendChild(overlay);",
    "",
    "      function dismiss() { overlay.remove(); }",
    '      document.getElementById("salla-modal-close").onclick = dismiss;',
    '      document.getElementById("salla-modal-dismiss").onclick = dismiss;',
    "",
    '      document.getElementById("salla-modal-apply").onclick = function() {',
    "        try {",
    '          localStorage.setItem("_salla_auto_coupon_" + storeId, activeCoupon);',
    '          localStorage.setItem("_salla_auto_coupon", activeCoupon);',
    "          navigator.clipboard.writeText(activeCoupon);",
    "        } catch (e) {}",
    "",
    "        if (window.salla && window.salla.cart && window.salla.cart.applyCoupon) {",
    "          window.salla.cart.applyCoupon(activeCoupon).catch(function() {});",
    "        }",
    "",
    "        dismiss();",
    '        showToast("🎉 تم تفعيل خصمك بنجاح! سيُطبّق تلقائياً على أول منتج تضيفه إلى السلة.");',
    "        showFloatingPill(activeCoupon, ACTIVE_CONFIG.discountValue || 15);",
    "      };",
    "    }",
    "",
    "    // Helper: Show floating notification toast",
    "    function showToast(msg) {",
    '      var existing = document.getElementById("salla-incentive-toast");',
    "      if (existing) existing.remove();",
    '      var toast = document.createElement("div");',
    '      toast.id = "salla-incentive-toast";',
    '      toast.style.cssText = "position:fixed;top:24px;left:50%;transform:translateX(-50%);background:#004d5b;color:#ffffff;padding:14px 24px;border-radius:12px;box-shadow:0 12px 35px rgba(0,0,0,0.3);z-index:9999999;font-family:PingARLT,system-ui,sans-serif;font-size:14px;font-weight:bold;display:flex;align-items:center;gap:10px;border:2px solid #73fcd7;direction:rtl;";',
    '      toast.innerHTML = "<span>" + msg + "</span>";',
    "      document.body.appendChild(toast);",
    "      setTimeout(function() {",
    '        toast.style.opacity = "0";',
    '        toast.style.transition = "opacity 0.4s ease";',
    "        setTimeout(function() { toast.remove(); }, 400);",
    "      }, 5000);",
    "    }",
    "",
    "    // Helper: Show floating discount pill while browsing",
    "    function showFloatingPill(coupon, discountVal) {",
    '      var existing = document.getElementById("salla-active-discount-pill");',
    "      if (existing) existing.remove();",
    '      var pill = document.createElement("div");',
    '      pill.id = "salla-active-discount-pill";',
    '      pill.style.cssText = "position:fixed;bottom:24px;right:24px;background:#004d5b;color:#73fcd7;padding:10px 18px;border-radius:50px;box-shadow:0 8px 30px rgba(0,0,0,0.25);z-index:999998;font-family:PingARLT,system-ui,sans-serif;font-size:13px;font-weight:bold;display:flex;align-items:center;gap:10px;border:1.5px solid #73fcd7;direction:rtl;cursor:default;";',
    '      pill.innerHTML = "<span>🏷️ كود الخصم (" + coupon + ") مفعّل لطلبك القادم (خصم " + discountVal + "%)!</span>" +',
    '        \'<button id="salla-pill-close" style="background:none;border:none;color:#ffffff;font-size:16px;cursor:pointer;padding:0 2px;opacity:0.8;">✕</button>\';',
    "      document.body.appendChild(pill);",
    '      var closeBtn = document.getElementById("salla-pill-close");',
    "      if (closeBtn) {",
    "        closeBtn.onclick = function() { pill.remove(); };",
    "      }",
    "    }",
    "",
    "    // Auto-apply discount to first item added to cart",
    "    function tryApplyAutoDiscount() {",
    '      var pendingCoupon = localStorage.getItem("_salla_auto_coupon_" + storeId) || localStorage.getItem("_salla_auto_coupon");',
    "      if (!pendingCoupon) return;",
    "",
    "      if (window.salla && window.salla.cart && window.salla.cart.applyCoupon) {",
    "        window.salla.cart.applyCoupon(pendingCoupon).then(function() {",
    '          console.log("%c[Salla-Incentives] 🏷️ تم تطبيق الخصم تلقائياً على أول منتج في السلة بنجاح!", "color:#00b259;font-weight:bold;");',
    '          showToast("✅ تم تطبيق كود الخصم (" + pendingCoupon + ") تلقائياً على أول منتج في سلتك!");',
    '          localStorage.removeItem("_salla_auto_coupon_" + storeId);',
    '          localStorage.removeItem("_salla_auto_coupon");',
    '          var pill = document.getElementById("salla-active-discount-pill");',
    "          if (pill) pill.remove();",
    "        }).catch(function(err) {",
    '          console.warn("[Salla-Incentives] auto-applyCoupon:", err);',
    "        });",
    "      }",
    "    }",
    "",
    "    // Check if user already activated discount on previous page",
    '    var currentPending = localStorage.getItem("_salla_auto_coupon_" + storeId) || localStorage.getItem("_salla_auto_coupon");',
    "    if (currentPending) {",
    "      showFloatingPill(currentPending, ACTIVE_CONFIG.discountValue || 15);",
    "    }",
    "",
    "    // Listen to Twilight cart events",
    "    if (window.salla && window.salla.event) {",
    "      try {",
    '        window.salla.event.on("cart::item.added", function() {',
    "          setTimeout(tryApplyAutoDiscount, 500);",
    "        });",
    "      } catch (e) {}",
    "    }",
    "    if (window.salla && window.salla.cart && window.salla.cart.event && window.salla.cart.event.onItemAdded) {",
    "      try {",
    "        window.salla.cart.event.onItemAdded(function() {",
    "          setTimeout(tryApplyAutoDiscount, 500);",
    "        });",
    "      } catch (e) {}",
    "    }",
    '    document.addEventListener("salla:cart:itemAdded", function() {',
    "      setTimeout(tryApplyAutoDiscount, 500);",
    "    });",
    '    document.addEventListener("cart::item.added", function() {',
    "      setTimeout(tryApplyAutoDiscount, 500);",
    "    });",
    "",
    "    // Fallback: Intercept add-to-cart clicks",
    '    document.addEventListener("click", function(e) {',
    '      var target = e.target.closest("button, a, salla-add-product-button, .salla-add-to-cart, [data-salla-add-to-cart]");',
    "      if (!target) return;",
    '      var text = (target.innerText || target.textContent || "").trim();',
    "      var isAddBtn = /أضف للسلة|إضافة للسلة|add to cart/i.test(text) ||",
    '        target.tagName.toLowerCase() === "salla-add-product-button" ||',
    '        target.hasAttribute("data-salla-add-to-cart") ||',
    '        (target.className && typeof target.className === "string" && target.className.indexOf("add-to-cart") !== -1);',
    "      if (isAddBtn) {",
    "        setTimeout(tryApplyAutoDiscount, 1200);",
    "        setTimeout(tryApplyAutoDiscount, 2600);",
    "      }",
    "    }, true);",
    "  }",
    "",
    '  if (typeof salla !== "undefined" && salla.onReady) {',
    "    try { salla.onReady(startTracking); } catch (e) {}",
    "  }",
    '  if (document.readyState === "complete" || document.readyState === "interactive") {',
    "    startTracking();",
    "  } else {",
    '    document.addEventListener("DOMContentLoaded", startTracking);',
    "    setTimeout(startTracking, 500);",
    "  }",
    "})();",
  ];

  if (includeHtmlTags) {
    return [
      "<!-- Salla Frequent Visitor Retention & Ably Realtime Presence Script -->",
      "<script>",
      ...jsLines,
      "</script>",
    ].join("\n");
  }

  return jsLines.join("\n");
}
