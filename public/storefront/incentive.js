/**
 * Salla Frequent Visitor Retention & Ably Realtime Presence Script
 * Target Store: "apptest"
 */
(function() {
  "use strict";

  var CONFIG = {"enabled":false,"minVisits":3,"timeWindowMinutes":60,"headline":"سعداء بزيارتك المتكررة لمتجرنا! ✨","message":"لاحظنا اهتمامك بمنتجاتنا المميزة! يسعدنا تقديم خصم حصري لتكمل طلبك وتستمتع بتجربة تسوق فريدة.","couponCode":"","couponCaption":"كود الخصم الحصري لك:","discountType":"percentage","discountValue":15,"ctaText":"تطبيق الخصم وإكمال الطلب 🛍️","dismissText":"متابعة التصفح","giftEmoji":"🎁","showCountdown":true,"countdownMinutes":15,"accentColor":"#73fcd7","primaryColor":"#004d5b","enableRealtimePresence":true,"showLiveCounterBadge":false,"tokenEndpoint":"https://live-visitor-counter-backend.vercel.app/api/presence-token","ablyCdn":"https://cdn.ably.com/lib/ably.min-2.js","triggerMode":"auto"};
  var RULES = [];
  var REMOTE = true;
  var APP_ORIGIN = '';
  var DATA_STORE = '';
  try {
    var selfScript = document.currentScript;
    if (selfScript && selfScript.src) APP_ORIGIN = new URL(selfScript.src).origin;
    if (selfScript) DATA_STORE = selfScript.getAttribute('data-store') || '';
  } catch (e) {}
  var TARGET_STORE_ID = REMOTE ? (window._salla_target_store_id || DATA_STORE || '') : "apptest";
  if (!REMOTE && !CONFIG.enabled && (!RULES || !RULES.length)) return;

  function loadScript(src) {
    return new Promise(function(resolve, reject) {
      if (window.Ably) return resolve();
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function getProductInfo() {
    var pId = null;
    var pName = "";
    try {
      if (window.salla && window.salla.config && window.salla.config.product) {
        pId = window.salla.config.product.id;
        pName = window.salla.config.product.name || "";
      }
      if (!pId && window.sallaProduct) {
        pId = window.sallaProduct.id;
        pName = window.sallaProduct.name || "";
      }
      if (!pId) {
        var match = location.pathname.match(/\/p(\d+)/);
        if (match) pId = match[1];
      }
      if (!pId) {
        var match2 = location.pathname.match(/\/products\/([^\/?#]+)/i);
        if (match2) pId = match2[1];
      }
      if (!pId) {
        var el = document.querySelector('[data-product-id], meta[property="product:id"], [data-model-id]');
        if (el) pId = el.getAttribute('data-product-id') || el.getAttribute('content') || el.getAttribute('data-model-id');
      }
      if (!pName) {
        var h1 = document.querySelector("h1.product-title, .product-details__title, .product__title, h1");
        if (h1 && (location.pathname.indexOf("/p") !== -1 || location.pathname.indexOf("/product") !== -1 || pId)) pName = (h1.innerText || "").trim();
      }
      if (!pName && (location.pathname.indexOf('/p') !== -1 || location.pathname.indexOf('/product') !== -1)) {
        pName = document.title ? document.title.split("-")[0].trim() : "";
      }
    } catch (e) {}
    var isProd = Boolean(pId || location.pathname.indexOf('/p') !== -1 || location.pathname.indexOf('/product') !== -1);
    return { id: pId ? String(pId) : (isProd ? "prod" : null), name: pName || "", isProduct: isProd };
  }

  function getCategoryInfo() {
    var cId = null;
    var cName = "";
    try {
      if (window.salla && window.salla.config && window.salla.config.category) {
        cId = window.salla.config.category.id;
        cName = window.salla.config.category.name || "";
      }
      var catMatch = location.pathname.match(/\/(c|category|categories)\/([^\/?#]+)/i);
      if (catMatch) {
        if (!cId) cId = catMatch[2];
        if (!cName) {
          var h1 = document.querySelector(".category-title, h1.page-title, h1");
          cName = h1 ? (h1.innerText || "").trim() : decodeURIComponent(catMatch[2]).replace(/[-_]/g, " ");
        }
      }
    } catch (e) {}
    return { id: cId ? String(cId) : null, name: cName || "" };
  }

  function getCartInfo() {
    var hasItems = false;
    var count = 0;
    try {
      if (window.salla && window.salla.cart && typeof window.salla.cart.getCount === 'function') {
        count = window.salla.cart.getCount();
      }
      var badge = document.querySelector(".cart-badge, .cart-count, [data-cart-count], .s-cart-summary__count");
      if (badge) {
        var num = parseInt(badge.innerText.trim(), 10);
        if (!isNaN(num) && num > 0) count = num;
      }
      if (location.pathname.indexOf("/cart") !== -1) hasItems = true;
      if (count > 0) hasItems = true;
      var stCart = localStorage.getItem("_salla_cart_has_items_" + storeId);
      if (stCart === "1" || stCart === "true") hasItems = true;
    } catch (e) {}
    return { hasItems: hasItems, count: count };
  }

  var hasStarted = false;
  function startTracking() {
    if (hasStarted) return;
    hasStarted = true;

    // Determine Store ID (Priority: Configured target -> Twilight SDK -> Hostname -> Fallback)
    var detectedStoreId =
      (typeof salla !== "undefined" && salla.config && salla.config.get &&
        (salla.config.get("store.id") || salla.config.get("store.username") || salla.config.get("store_id"))) ||
      (window.salla && window.salla.config &&
        (window.salla.config.store?.id || window.salla.config.store?.username)) ||
      (function() {
        var h = (location.hostname || "").toLowerCase();
        var m = h.match(/^([a-z0-9-_]+)\.(salla\.sa|preview\.salla\.sa|dev\.salla\.sa)$/);
        if (m && m[1] && m[1] !== "www") return m[1];
        if (h.indexOf("salla.sa") !== -1) {
          var seg = (location.pathname || "").split("/").filter(Boolean)[0];
          if (seg && !seg.match(/^(ar|en|cart|checkout|products|p|c)$/i)) return seg;
        }
        return null;
      })() ||
      "apptest";

    var storeId = String(TARGET_STORE_ID || detectedStoreId);

    console.log("%c[Salla-Incentives] 🟢 نظام تتبع الزوار نشط للمتجر: " + storeId, "background:#004d5b;color:#73fcd7;font-weight:bold;padding:4px 8px;border-radius:4px;");

    var STORAGE_KEY = "_salla_visits_" + storeId;
    var MODAL_SHOWN_KEY = "_salla_modal_shown_" + storeId;
    var CONFIG_STORAGE_KEY = "_salla_incentive_config_" + storeId;
    var now = Date.now();
    var pInfo = getProductInfo();
    var productId = pInfo.id;
    var productName = pInfo.name;
    var isProductPage = pInfo.isProduct;
    var catInfo = getCategoryInfo();
    var categoryId = catInfo.id;
    var categoryName = catInfo.name;
    var cartInfo = getCartInfo();
    var pVisits = 0;
    var catVisits = 0;

    // Robust Persistent visitor UUID per device/browser so repeat visits accumulate
    var VISITOR_STORAGE_KEY = "_salla_vid";
    var clientId = "";
    try { clientId = localStorage.getItem(VISITOR_STORAGE_KEY); } catch (e) {}
    if (!clientId) {
      try {
        var cookieMatch = document.cookie.match(/(?:^|;\s*)_salla_vid=([^;]+)/);
        if (cookieMatch && cookieMatch[1]) clientId = decodeURIComponent(cookieMatch[1]);
      } catch (e) {}
    }
    if (!clientId) {
      try { clientId = localStorage.getItem("_salla_visitor_uuid_" + storeId); } catch (e) {}
    }
    if (!clientId) {
      try {
        if (window.salla && window.salla.config && window.salla.config.user && window.salla.config.user.id) {
          clientId = "usr_" + window.salla.config.user.id;
        }
      } catch (e) {}
    }
    if (!clientId) {
      clientId = "vis_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    }
    try { localStorage.setItem(VISITOR_STORAGE_KEY, clientId); } catch (e) {}
    try { localStorage.setItem("_salla_visitor_uuid_" + storeId, clientId); } catch (e) {}
    try {
      document.cookie = "_salla_vid=" + encodeURIComponent(clientId) + ";path=/;max-age=31536000;SameSite=Lax" + (location.protocol === "https:" ? ";Secure" : "");
    } catch (e) {}

    // Expose reset helper for testing in browser console
    window.resetSallaVisits = function() {
      try {
        localStorage.removeItem(STORAGE_KEY);
        var toRem = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && (k.indexOf("_salla_pvisits_") === 0 || k.indexOf("_salla_catvisits_") === 0 || k.indexOf("_salla_cart_") === 0)) toRem.push(k);
        }
        toRem.forEach(function(k) { localStorage.removeItem(k); });
        var sRem = [];
        for (var j = 0; j < sessionStorage.length; j++) {
          var sk = sessionStorage.key(j);
          if (sk && (sk.indexOf("_salla_modal_shown_") === 0 || sk.indexOf(MODAL_SHOWN_KEY) === 0)) sRem.push(sk);
        }
        sRem.forEach(function(sk) { sessionStorage.removeItem(sk); });
        console.log("%c[Salla-Incentives] 🔄 تم تصفير جميع العدادات وقواعد التحفيز بنجاح! حدّث الصفحة للبدء من جديد.", "color:#00b259;font-weight:bold;");
      } catch (e) {}
    };

    // Dynamically load latest customizer config saved from the dashboard
    var ACTIVE_CONFIG = Object.assign({}, CONFIG);
    try {
      var rawCustom = localStorage.getItem(CONFIG_STORAGE_KEY) || localStorage.getItem("_salla_incentive_config");
      if (rawCustom) {
        var parsedCustom = JSON.parse(rawCustom);
        ACTIVE_CONFIG = Object.assign({}, ACTIVE_CONFIG, parsedCustom);
      }
    } catch (e) {}

    var windowMs = (ACTIVE_CONFIG.timeWindowMinutes || 60) * 60 * 1000;

    // Count one visit per browsing session; a page reload must not add a visit.
    var SESSION_KEY = '_salla_sess_' + storeId;
    var LAST_SEEN_KEY = '_salla_lastseen_' + storeId;
    var SESSION_GAP_MS = 30 * 60 * 1000;
    var prevLastSeen = 0;
    try { prevLastSeen = parseInt(localStorage.getItem(LAST_SEEN_KEY), 10) || 0; } catch (e) {}
    var isNewVisit = true;
    try { isNewVisit = !sessionStorage.getItem(SESSION_KEY) || (prevLastSeen > 0 && (now - prevLastSeen) > SESSION_GAP_MS); } catch (e) {}
    try { sessionStorage.setItem(SESSION_KEY, '1'); localStorage.setItem(LAST_SEEN_KEY, String(now)); } catch (e) {}
    var isReload = false;
    try { var navEntry = performance.getEntriesByType && performance.getEntriesByType('navigation')[0]; isReload = !!(navEntry && navEntry.type === 'reload'); } catch (e) {}

    // Record visitor entry & filter within time window
    var history = [];
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) history = JSON.parse(raw);
    } catch (e) { history = []; }

    history = history.filter(function(ts) { return (now - ts) <= windowMs; });
    if (isNewVisit || history.length === 0) history.push(now);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } catch (e) {}

    // Record product visits if on a product page
    if (productId || isProductPage) {
      var pKey = productId || "current_prod";
      var P_STORE_KEY = "_salla_pvisits_" + storeId + "_" + pKey;
      var pHist = [];
      try {
        var rawP = localStorage.getItem(P_STORE_KEY);
        if (rawP) pHist = JSON.parse(rawP);
      } catch (e) { pHist = []; }
      pHist = pHist.filter(function(ts) { return (now - ts) <= (120 * 60 * 1000); });
      if (!isReload || pHist.length === 0) pHist.push(now);
      try { localStorage.setItem(P_STORE_KEY, JSON.stringify(pHist)); } catch (e) {}
      pVisits = pHist.length;
    }

    // Record category visits if on a category page
    if (categoryId || categoryName) {
      var cKey = categoryId || "cat";
      var C_STORE_KEY = "_salla_catvisits_" + storeId + "_" + cKey;
      var cHist = [];
      try {
        var rawC = localStorage.getItem(C_STORE_KEY);
        if (rawC) cHist = JSON.parse(rawC);
      } catch (e) { cHist = []; }
      cHist = cHist.filter(function(ts) { return (now - ts) <= (120 * 60 * 1000); });
      if (!isReload || cHist.length === 0) cHist.push(now);
      try { localStorage.setItem(C_STORE_KEY, JSON.stringify(cHist)); } catch (e) {}
      catVisits = cHist.length;
    }

    // Record cart activity
    try {
      if (location.pathname.indexOf("/cart") !== -1 || cartInfo.hasItems) {
        localStorage.setItem("_salla_cart_has_items_" + storeId, "1");
        localStorage.setItem("_salla_cart_last_active_" + storeId, String(now));
      }
      if (location.pathname.indexOf("/orders") !== -1 || location.pathname.indexOf("/thank-you") !== -1) {
        localStorage.removeItem("_salla_cart_has_items_" + storeId);
      }
      document.addEventListener("click", function(e) {
        var t = e.target;
        if (t && (t.closest("salla-add-product-button") || t.closest(".btn-add-to-cart") || t.closest("[data-add-to-cart]"))) {
          localStorage.setItem("_salla_cart_has_items_" + storeId, "1");
          localStorage.setItem("_salla_cart_last_active_" + storeId, String(Date.now()));
        }
      }, true);
    } catch (e) {}

    // Sync into merchant dashboard real visitors log (cross-tab)
    try {
      var DASH_LOG_KEY = "_salla_frequent_visitors_log";
      var rawLog = localStorage.getItem(DASH_LOG_KEY);
      var dashList = rawLog ? JSON.parse(rawLog) : [];
      var existingV = dashList.find(function(item) { return item.id === clientId || (item.city === "متصفح حقيقي" && !item.purchasesCount); });
      if (existingV) {
        existingV.id = clientId;
        existingV.name = "زائر متجر سلة (#" + clientId.slice(-4) + ")";
        existingV.visitCount = Math.max(existingV.visitCount || 1, history.length);
        existingV.visitTimestamps = history;
        existingV.isOnline = true;
        existingV.lastVisitedAgo = "متصل الآن (واجهة المتجر)";
        existingV.timeSpanText = existingV.visitCount + " زيارات خلال وقت متقارب";
        if (productId) {
          existingV.viewedProducts = existingV.viewedProducts || [];
          var pLabel = "منتج رقم " + productId;
          if (existingV.viewedProducts.indexOf(pLabel) === -1) existingV.viewedProducts.push(pLabel);
        }
        if (existingV.visitCount >= (ACTIVE_CONFIG.minVisits || 3)) {
          existingV.status = "qualified";
        }
      } else {
        dashList.unshift({
          id: clientId,
          name: "زائر متجر سلة (#" + clientId.slice(-4) + ")",
          visitorType: "guest",
          city: "متصفح حقيقي",
          device: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? "جوال (سلة)" : "متصفح ويب",
          visitCount: history.length || 1,
          isOnline: true,
          visitTimestamps: history,
          purchasesCount: 0,
          cartItemsCount: 0,
          cartValue: 0,
          viewedProducts: [productId ? "منتج رقم " + productId : "تصفح المتجر"],
          status: (history.length >= (ACTIVE_CONFIG.minVisits || 3)) ? "qualified" : "watching",
          lastVisitedAgo: "متصل الآن",
          timeSpanText: history.length + " زيارات خلال وقت متقارب"
        });
      }
      var firstTestSeen = false;
      dashList = dashList.filter(function(item) {
        if (item.city === "متصفح حقيقي" && !item.purchasesCount) {
          if (firstTestSeen) return false;
          firstTestSeen = true;
        }
        return true;
      });
      localStorage.setItem(DASH_LOG_KEY, JSON.stringify(dashList.slice(0, 50)));
    } catch (e) {}

    var visitCount = history.length;
    console.log("%c[Salla-Incentives] 👤 معرف الزائر: " + clientId + " | الزيارات المسجلة: " + visitCount + " / " + (ACTIVE_CONFIG.minVisits || 3), "color:#007580;font-weight:bold;font-size:11px;");
    if (visitCount >= (ACTIVE_CONFIG.minVisits || 3)) {
      console.log("%c[Salla-Incentives] 🎯 الزائر وصل للحد الأدنى (مؤهل للخصم)! جارٍ إظهار النافذة المنبثقة...", "color:#e53e3e;font-weight:bold;");
    }
    var hasPurchased = document.cookie.indexOf("salla_has_ordered=1") !== -1;

    // Cart snapshot (count + total) so the studio can show the real cart value.
    var cartSnap = { count: 0, total: 0 };
    var presenceUpdater = null;
    function cartNumber(v) {
      if (v && typeof v === 'object') v = (v.amount != null ? v.amount : (v.total != null ? v.total : v.value));
      if (typeof v === 'number') return isFinite(v) ? v : 0;
      var s = String(v == null ? '' : v).replace(/[٠-٩]/g, function(d) { return d.charCodeAt(0) - 1632; }).replace(/[^0-9.]/g, '');
      var n = parseFloat(s);
      return isNaN(n) ? 0 : n;
    }
    var lastCartPayload = null;
    function snapFromCartObject(c) {
      if (!c || typeof c !== 'object') return null;
      var items = c.items || c.products;
      var count = parseInt(c.count != null ? c.count : (c.items_count != null ? c.items_count : (Array.isArray(items) ? items.length : 0)), 10) || 0;
      var total = cartNumber(c.total != null ? c.total : (c.sub_total != null ? c.sub_total : c.grand_total));
      return { count: count, total: total };
    }
    function readCartSnapshot() {
      var snap = { count: 0, total: 0, known: false };
      var sources = [lastCartPayload];
      try { if (window.salla && window.salla.storage && window.salla.storage.get) sources.push(window.salla.storage.get('cart')); } catch (e) {}
      for (var si = 0; si < sources.length; si++) {
        var s = snapFromCartObject(sources[si]);
        if (s && (s.count || s.total)) { snap.count = s.count; snap.total = s.total; snap.known = true; break; }
      }
      if (!snap.count) snap.count = getCartInfo().count || 0;
      return snap;
    }
    function refreshCart() {
      var next = readCartSnapshot();
      if (next.count === cartSnap.count && next.total === cartSnap.total) return;
      cartSnap = { count: next.count, total: next.total };
      console.log('%c[Salla-Incentives] 🛒 السلة: ' + cartSnap.count + ' منتج | الإجمالي ' + cartSnap.total, 'color:#007580;font-weight:bold;');
      try {
        if (next.known) localStorage.setItem('_salla_cart_has_items_' + storeId, next.count > 0 ? '1' : '0');
        var lg = JSON.parse(localStorage.getItem(DASH_LOG_KEY) || '[]');
        for (var li = 0; li < lg.length; li++) {
          if (lg[li].id === clientId) { lg[li].cartItemsCount = cartSnap.count; lg[li].cartValue = cartSnap.total; }
        }
        localStorage.setItem(DASH_LOG_KEY, JSON.stringify(lg));
      } catch (e) {}
      if (presenceUpdater) presenceUpdater();
    }
    function fetchLatestCart() {
      try {
        var api = window.salla && window.salla.cart && window.salla.cart.api;
        var req = api && typeof api.latest === 'function' ? api.latest() : null;
        if (req && typeof req.then === 'function') {
          req.then(function(res) {
            var c = res && (res.data && res.data.cart ? res.data.cart : (res.cart || res.data || res));
            if (snapFromCartObject(c)) { lastCartPayload = c; refreshCart(); }
          }).catch(function() {});
        }
      } catch (e) {}
    }
    window.sallaIncentivesDebugCart = function() {
      var st = null;
      try { st = window.salla && window.salla.storage && window.salla.storage.get && window.salla.storage.get('cart'); } catch (e) {}
      console.log('salla.storage cart:', st);
      console.log('last cart payload:', lastCartPayload);
      console.log('snapshot sent to dashboard:', cartSnap);
    };
    cartSnap = (function() { var c = readCartSnapshot(); return { count: c.count, total: c.total }; })();
    setTimeout(function() { fetchLatestCart(); refreshCart(); }, 1500);
    setInterval(refreshCart, 8000);
    setInterval(fetchLatestCart, 20000);
    try {
      if (window.salla && window.salla.event) {
        window.salla.event.on('cart::updated', function(p) { lastCartPayload = (p && p.data && p.data.cart) ? p.data.cart : p; setTimeout(refreshCart, 200); });
        window.salla.event.on('cart::item.added', function() { setTimeout(fetchLatestCart, 800); });
        window.salla.event.on('cart::item.deleted', function() { setTimeout(fetchLatestCart, 800); });
      }
    } catch (e) {}

    // Connect to Ably Realtime Presence
    loadScript(ACTIVE_CONFIG.ablyCdn || 'https://cdn.ably.com/lib/ably.min-2.js')
      .then(function() {
        var realtime = new Ably.Realtime({
          clientId: clientId,
          authCallback: function(_tokenParams, callback) {
            fetch(ACTIVE_CONFIG.tokenEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ storeId: storeId, productId: productId, clientId: clientId, tokenParams: _tokenParams || {} })
            })
              .then(function(res) { return res.json(); })
              .then(function(req) { callback(null, req); })
              .catch(function(err) { callback(err, null); });
          }
        });

        var storeChannel = realtime.channels.get("presence:store:" + storeId);
        storeChannel.presence.enter({
          clientId: clientId,
          visitCount: visitCount,
          isQualified: visitCount >= (ACTIVE_CONFIG.minVisits || 3),
          productId: productId,
          pathname: location.pathname,
          cartItemsCount: cartSnap.count,
          cartValue: cartSnap.total,
          timestamp: now
        }).then(function() {
          console.log("%c[Salla-Incentives] 📡 تم إرسال حالة التواجد (Presence Active) للقناة: presence:store:" + storeId, "color:#00b259;font-weight:bold;");
        }).catch(function(err) {
          console.warn("[Salla-Incentives] presence.enter error:", err);
        });

        presenceUpdater = function() {
          try {
            var up = storeChannel.presence.update({
              clientId: clientId,
              visitCount: history.length,
              productId: productId,
              pathname: location.pathname,
              cartItemsCount: cartSnap.count,
              cartValue: cartSnap.total,
              timestamp: Date.now()
            });
            if (up && up.catch) up.catch(function() {});
          } catch (e) {}
        };
        // Periodically refresh presence heartbeat every 25 seconds
        setInterval(presenceUpdater, 25000);
      })
      .catch(function(err) {
        console.warn("[Salla-Incentives] Ably load error:", err);
      });

    // Evaluate active multi-rules in priority order
    var ACTIVE_RULES = [].concat(RULES || []);
    if (!REMOTE) try {
      var rawCustomRules = localStorage.getItem("_salla_incentive_rules_v2");
      if (rawCustomRules) {
        var parsedRules = JSON.parse(rawCustomRules);
        if (Array.isArray(parsedRules) && parsedRules.length > 0) ACTIVE_RULES = parsedRules;
      }
    } catch (e) {}

    // A rule is shown only when enabled AND its coupon is activated in Salla.
    function isRuleLive(rule) {
      if (!rule || !rule.enabled || !rule.trigger) return false;
      var inc = rule.incentive || {};
      if (inc.type === 'custom' || !inc.couponCode) return true;
      return inc.isCreatedInSalla === true;
    }

    var matchedRule = null;
    for (var rIdx = 0; rIdx < ACTIVE_RULES.length; rIdx++) {
      var r = ACTIVE_RULES[rIdx];
      if (!isRuleLive(r)) continue;
      var rId = r.id || ('rule_' + rIdx);
      var rShownKey = "_salla_modal_shown_" + storeId + "_" + rId;
      var isRShown = false;
      try { isRShown = sessionStorage.getItem(rShownKey) === "true"; } catch (e) {}
      if (isRShown) continue;
      var t = r.trigger;
      var tType = t.type;
      if (tType === 'product_visits' && (productId || isProductPage)) {
        var rTargetId = t.productId ? String(t.productId).trim() : null;
        var rTargetName = t.productName ? t.productName.toLowerCase().trim() : '';
        var isAnyP = !rTargetId && (!rTargetName || rTargetName === "أي منتج" || rTargetName === "جميع المنتجات" || t.productTargetScope === "all");
        var prodMatches = isAnyP;
        if (rTargetId && (rTargetId === String(productId))) prodMatches = true;
        if (rTargetName && !isAnyP && productName && productName.toLowerCase().indexOf(rTargetName) !== -1) prodMatches = true;
        var reqPVisits = parseInt(t.minVisits, 10) || 2;
        if (prodMatches && pVisits >= reqPVisits) {
          matchedRule = r;
          break;
        }
      } else if (tType === 'category_visits' && (categoryId || categoryName)) {
        var rCatName = t.categoryName ? t.categoryName.toLowerCase().trim() : '';
        var isAnyC = !rCatName || rCatName === "أي فئة" || rCatName === "جميع الفئات";
        var catMatches = isAnyC;
        if (!isAnyC && categoryName && categoryName.toLowerCase().indexOf(rCatName) !== -1) catMatches = true;
        var reqCVisits = parseInt(t.minVisits, 10) || 2;
        if (catMatches && catVisits >= reqCVisits) {
          matchedRule = r;
          break;
        }
      } else if (tType === 'cart_abandon') {
        // Only when the visitor returns after leaving: a new visit, cart still has items,
        // away for at least the configured window, and not on the cart/checkout pages.
        var cInfo = getCartInfo();
        var onCartFlow = location.pathname.indexOf('/cart') !== -1 || location.pathname.indexOf('/checkout') !== -1;
        var waitWindow = parseInt(t.timeWindowMinutes, 10) || 0;
        var awayMin = prevLastSeen > 0 ? (now - prevLastSeen) / (60 * 1000) : 0;
        if (isNewVisit && cInfo.hasItems && !onCartFlow && prevLastSeen > 0 && awayMin >= waitWindow) {
          matchedRule = r;
          break;
        }
      } else if (tType === 'store_visits') {
        var reqVisits = parseInt(t.minVisits, 10) || (ACTIVE_CONFIG.minVisits || 3);
        if (visitCount >= reqVisits) {
          matchedRule = r;
          break;
        }
      }
    }

    var shouldTrigger = !!matchedRule;

    var isManualMode = ACTIVE_CONFIG.triggerMode === 'manual';
    if (shouldTrigger && !hasPurchased && !isManualMode) {
      console.log("%c[Salla-Incentives] 🎯 تطابقت قاعدة التحفيز: " + (matchedRule ? matchedRule.name : "الزيارات المتكررة") + "! جارٍ إظهار النافذة...", "color:#00b259;font-weight:bold;font-size:12px;");
      setTimeout(function() { showIncentiveModal(matchedRule); }, 1500);
    }

    // Offers pushed by the merchant from the studio (manual mode, or an extra nudge in auto mode).
    function checkForOffer() {
      if (!REMOTE || !APP_ORIGIN || document.hidden) return;
      fetch(APP_ORIGIN + '/api/incentive-offers?store=' + encodeURIComponent(storeId) + '&client=' + encodeURIComponent(clientId))
        .then(function(r) { return r.json(); })
        .then(function(res) {
          var offer = res && res.success && res.data;
          if (offer && offer.rule) showIncentiveModal(offer.rule);
        })
        .catch(function() {});
    }
    setTimeout(checkForOffer, 2000);
    setInterval(checkForOffer, 15000);

    function showIncentiveModal(rule) {
      var modalRuleId = (rule && rule.id) ? rule.id : "default";
      sessionStorage.setItem("_salla_modal_shown_" + storeId + "_" + modalRuleId, "true");
      sessionStorage.setItem(MODAL_SHOWN_KEY, "true");
      var existing = document.getElementById("salla-freq-visitor-modal");
      if (existing) existing.remove();

      var activeCoupon = (rule && rule.incentive && rule.incentive.couponCode) || ACTIVE_CONFIG.couponCode;
      var primaryCol   = (rule && rule.modal && rule.modal.primaryColor)       || ACTIVE_CONFIG.primaryColor || '#004d5b';
      var accentCol    = (rule && rule.modal && rule.modal.accentColor)        || ACTIVE_CONFIG.accentColor  || '#73fcd7';
      var emoji        = (rule && rule.modal && rule.modal.giftIcon)           ? '🎁' : (ACTIVE_CONFIG.giftEmoji || '🎁');
      var caption      = (rule && rule.modal && rule.modal.couponCaption)     || ACTIVE_CONFIG.couponCaption || 'كود الخصم الحصري لك:';
      var headline     = (rule && rule.modal && rule.modal.headline)          || ACTIVE_CONFIG.headline;
      var message      = (rule && rule.modal && rule.modal.message)           || ACTIVE_CONFIG.message;
      var ctaText      = (rule && rule.modal && rule.modal.ctaText)           || ACTIVE_CONFIG.ctaText;
      var dismissText  = (rule && rule.modal && rule.modal.dismissText)       || ACTIVE_CONFIG.dismissText;
      var incType      = (rule && rule.incentive && rule.incentive.type)      || 'coupon_discount';
      var discType     = (rule && rule.incentive && rule.incentive.discountType) || ACTIVE_CONFIG.discountType || 'percentage';
      var discVal      = (rule && rule.incentive && rule.incentive.discountValue !== undefined) ? rule.incentive.discountValue : (ACTIVE_CONFIG.discountValue || 15);

      var targetLabel = productName || (rule && rule.trigger && rule.trigger.productName) || '';
      if (targetLabel && targetLabel !== "أي منتج" && targetLabel !== "جميع المنتجات") {
        headline = headline.replace(/{product_name}|{product}/gi, targetLabel);
        message  = message.replace(/{product_name}|{product}/gi, targetLabel);
      } else {
        headline = headline.replace(/{product_name}|{product}/gi, "هذا المنتج");
        message  = message.replace(/{product_name}|{product}/gi, "هذا المنتج");
      }

      var badgeText = incType === 'free_shipping' ? 'توصيل مجاني 🚚' : (incType === 'free_product' ? 'هدية مجانية 🎁' : ('خصم ' + discVal + (discType === 'fixed' ? ' ر.س' : '%')));
      var overlay = document.createElement("div");
      overlay.id = "salla-freq-visitor-modal";
      overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,30,36,0.65);backdrop-filter:blur(5px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:PingARLT,system-ui,sans-serif;direction:rtl;";

      var card = document.createElement("div");
      card.style.cssText = "background:#ffffff;border-radius:20px;max-width:440px;width:100%;box-shadow:0 20px 45px rgba(0,77,91,0.25);border:2px solid " + accentCol + ";overflow:hidden;animation:popIn 0.3s cubic-bezier(0.16,1,0.3,1);";

      card.innerHTML = '<div style="background:' + primaryCol + ';padding:24px 20px;text-align:center;color:#ffffff;position:relative;">' +
        '<button id="salla-modal-close" style="position:absolute;top:14px;left:14px;background:none;border:none;color:#ffffff;font-size:20px;cursor:pointer;opacity:0.8;">✕</button>' +
        '<div style="width:52px;height:52px;border-radius:50%;background:' + accentCol + ';color:' + primaryCol + ';display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:12px;font-weight:bold;">' + emoji + '</div>' +
        '<h3 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#ffffff;">' + headline + "</h3>" +
        '<p style="margin:0;font-size:13px;opacity:0.92;line-height:1.5;color:#ffffff;">' + message + "</p>" +
        '</div>' +
        '<div style="padding:20px;background:#f8f8f8;text-align:center;">' +
        '<div style="background:#ffffff;border:2px dashed ' + primaryCol + ';border-radius:12px;padding:12px;margin-bottom:16px;">' +
        '<span style="font-size:12px;color:#374151;font-weight:600;display:block;margin-bottom:4px;">' + caption + "</span>" +
        '<span style="font-size:22px;font-weight:800;letter-spacing:2px;color:' + primaryCol + ';font-family:monospace;">' + activeCoupon + "</span>" +
        '<span style="display:inline-block;background:' + accentCol + ';color:' + primaryCol + ';font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;margin-right:8px;">' + badgeText + "</span>" +
        (targetLabel ? '<div style="margin-top:6px;font-size:12px;font-weight:700;color:' + primaryCol + ';">🎯 خاص بمنتج: ' + targetLabel + '</div>' : '') +
        '</div>' +
        '<button id="salla-modal-apply" style="width:100%;padding:14px;background:' + primaryCol + ';color:#ffffff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,77,91,0.25);">' +
        ctaText +
        '</button>' +
        '<button id="salla-modal-dismiss" style="margin-top:10px;background:none;border:none;color:#374151;font-size:13px;font-weight:600;cursor:pointer;text-decoration:underline;">' +
        dismissText +
        '</button>' +
        '</div>';

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      function dismiss() { overlay.remove(); }
      document.getElementById("salla-modal-close").onclick = dismiss;
      document.getElementById("salla-modal-dismiss").onclick = dismiss;

      document.getElementById("salla-modal-apply").onclick = function() {
        try {
          localStorage.setItem("_salla_auto_coupon_" + storeId, activeCoupon);
          localStorage.setItem("_salla_auto_coupon", activeCoupon);
          navigator.clipboard.writeText(activeCoupon);
        } catch (e) {}
        dismiss();

        var applyReq = applySallaCoupon(activeCoupon);
        if (applyReq && typeof applyReq.then === 'function') {
          applyReq.then(function(res) {
            console.log('[Salla-Incentives] addCoupon response:', res);
            try {
              localStorage.removeItem("_salla_auto_coupon_" + storeId);
              localStorage.removeItem("_salla_auto_coupon");
            } catch (e) {}
            var pill = document.getElementById("salla-active-discount-pill");
            if (pill) pill.remove();
            showToast("✅ تم تطبيق كود الخصم (" + activeCoupon + ") على سلتك");
            if (location.pathname.indexOf("/cart") !== -1) setTimeout(function() { location.reload(); }, 900);
          }).catch(function(err) {
            console.warn('[Salla-Incentives] addCoupon rejected:', err);
            var why = couponErrorText(err);
            if (cartSnap.count > 0 || getCartInfo().count > 0) {
              showToast("⚠️ لم تقبل سلة الكود (" + activeCoupon + ")" + (why ? ": " + why : "") + ". تم نسخ الكود، الصقه في خانة الكوبون.");
            } else {
              showToast("🎉 تم حفظ العرض، وسيُطبّق تلقائياً عند إضافة أول منتج إلى السلة.");
              showFloatingPill(activeCoupon, discVal);
            }
          });
        } else {
          showToast("تم نسخ الكود (" + activeCoupon + "). الصقه في خانة الكوبون داخل السلة.");
          showFloatingPill(activeCoupon, discVal);
        }
      };
    }

    // Twilight exposes salla.cart.addCoupon (applyCoupon does not exist).
    function applySallaCoupon(code) {
      var c = window.salla && window.salla.cart;
      if (!c) return null;
      var fn = c.addCoupon || c.applyCoupon;
      if (typeof fn !== 'function') return null;
      try { return fn.call(c, code); } catch (e) { return null; }
    }
    function couponErrorText(err) {
      try {
        var d = err && err.response && err.response.data;
        var m = d && ((d.error && d.error.message) || d.message);
        return String(m || (err && err.message) || '');
      } catch (e) { return ''; }
    }

    // Helper: Show floating notification toast
    function showToast(msg) {
      var existing = document.getElementById("salla-incentive-toast");
      if (existing) existing.remove();
      var toast = document.createElement("div");
      toast.id = "salla-incentive-toast";
      toast.style.cssText = "position:fixed;top:24px;left:50%;transform:translateX(-50%);background:#004d5b;color:#ffffff;padding:14px 24px;border-radius:12px;box-shadow:0 12px 35px rgba(0,0,0,0.3);z-index:9999999;font-family:PingARLT,system-ui,sans-serif;font-size:14px;font-weight:bold;display:flex;align-items:center;gap:10px;border:2px solid #73fcd7;direction:rtl;";
      toast.innerHTML = "<span>" + msg + "</span>";
      document.body.appendChild(toast);
      setTimeout(function() {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.4s ease";
        setTimeout(function() { toast.remove(); }, 400);
      }, 5000);
    }

    // Helper: Show floating discount pill while browsing
    function showFloatingPill(coupon, discountVal) {
      var existing = document.getElementById("salla-active-discount-pill");
      if (existing) existing.remove();
      var pill = document.createElement("div");
      pill.id = "salla-active-discount-pill";
      pill.style.cssText = "position:fixed;bottom:24px;right:24px;background:#004d5b;color:#73fcd7;padding:10px 18px;border-radius:50px;box-shadow:0 8px 30px rgba(0,0,0,0.25);z-index:999998;font-family:PingARLT,system-ui,sans-serif;font-size:13px;font-weight:bold;display:flex;align-items:center;gap:10px;border:1.5px solid #73fcd7;direction:rtl;cursor:default;";
      pill.innerHTML = "<span>🏷️ كود الخصم (" + coupon + ") مفعّل لطلبك القادم (خصم " + discountVal + "%)!</span>" +
        '<button id="salla-pill-close" style="background:none;border:none;color:#ffffff;font-size:16px;cursor:pointer;padding:0 2px;opacity:0.8;">✕</button>';
      document.body.appendChild(pill);
      var closeBtn = document.getElementById("salla-pill-close");
      if (closeBtn) {
        closeBtn.onclick = function() { pill.remove(); };
      }
    }

    // Auto-apply discount to first item added to cart
    function tryApplyAutoDiscount() {
      var pendingCoupon = localStorage.getItem("_salla_auto_coupon_" + storeId) || localStorage.getItem("_salla_auto_coupon");
      if (!pendingCoupon) return;

      // 1. Try Salla Twilight Cart JS API
      var cartReq = applySallaCoupon(pendingCoupon);
      if (cartReq && typeof cartReq.then === 'function') {
        cartReq.then(function(res) {
          console.log('[Salla-Incentives] addCoupon response:', res);
          showToast("✅ تم تطبيق كود الخصم (" + pendingCoupon + ") بنجاح على سلتك!");
          localStorage.removeItem("_salla_auto_coupon_" + storeId);
          localStorage.removeItem("_salla_auto_coupon");
          var pill = document.getElementById("salla-active-discount-pill");
          if (pill) pill.remove();
          if (location.pathname.indexOf("/cart") !== -1) setTimeout(function() { location.reload(); }, 900);
        }).catch(function(err) {
          console.warn("[Salla-Incentives] ⚠️ لم تقبل سلة الكوبون (" + pendingCoupon + "):", err, couponErrorText(err));
        });
      }

      // 2. Fallback: Auto-fill coupon input on cart page if present
      try {
        var cInput = document.querySelector('input[name="coupon"], input#coupon, input.coupon-input, salla-coupon input');
        if (cInput && !cInput.value) {
          cInput.value = pendingCoupon;
          cInput.dispatchEvent(new Event('input', { bubbles: true }));
          var cBtn = document.querySelector('.btn-apply-coupon, button[type="submit"].apply-coupon, salla-coupon button');
          if (cBtn) cBtn.click();
        }
      } catch (e) {}
    }

    // Check if user already activated discount on previous page
    var currentPending = localStorage.getItem("_salla_auto_coupon_" + storeId) || localStorage.getItem("_salla_auto_coupon");
    if (currentPending) {
      showFloatingPill(currentPending, ACTIVE_CONFIG.discountValue || 15);
      if (location.pathname.indexOf("/cart") !== -1 || (getCartInfo().count > 0)) {
        setTimeout(tryApplyAutoDiscount, 1000);
      }
    }

    // Listen to Twilight cart events
    if (window.salla && window.salla.event) {
      try {
        window.salla.event.on("cart::item.added", function() {
          setTimeout(tryApplyAutoDiscount, 500);
        });
      } catch (e) {}
    }
    if (window.salla && window.salla.cart && window.salla.cart.event && window.salla.cart.event.onItemAdded) {
      try {
        window.salla.cart.event.onItemAdded(function() {
          setTimeout(tryApplyAutoDiscount, 500);
        });
      } catch (e) {}
    }
    document.addEventListener("salla:cart:itemAdded", function() {
      setTimeout(tryApplyAutoDiscount, 500);
    });
    document.addEventListener("cart::item.added", function() {
      setTimeout(tryApplyAutoDiscount, 500);
    });

    // Fallback: Intercept add-to-cart clicks
    document.addEventListener("click", function(e) {
      var target = e.target.closest("button, a, salla-add-product-button, .salla-add-to-cart, [data-salla-add-to-cart]");
      if (!target) return;
      var text = (target.innerText || target.textContent || "").trim();
      var isAddBtn = /أضف للسلة|إضافة للسلة|add to cart/i.test(text) ||
        target.tagName.toLowerCase() === "salla-add-product-button" ||
        target.hasAttribute("data-salla-add-to-cart") ||
        (target.className && typeof target.className === "string" && target.className.indexOf("add-to-cart") !== -1);
      if (isAddBtn) {
        setTimeout(tryApplyAutoDiscount, 1200);
        setTimeout(tryApplyAutoDiscount, 2600);
      }
    }, true);
  }

  // Remote mode: load the latest settings first, then start tracking once.
  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    if (!REMOTE) return startTracking();
    var sid = String(TARGET_STORE_ID || '');
    if (!sid || !APP_ORIGIN) return;
    fetch(APP_ORIGIN + '/api/incentive-config?store=' + encodeURIComponent(sid))
      .then(function(r) { return r.json(); })
      .then(function(res) {
        var d = res && res.success && res.data;
        if (!d) return;
        if (d.config) CONFIG = Object.assign({}, CONFIG, d.config);
        if (Array.isArray(d.rules)) RULES = d.rules;
      })
      .catch(function() {})
      .then(function() {
        if (!CONFIG.enabled && (!RULES || !RULES.length)) return;
        startTracking();
      });
  }

  if (typeof salla !== "undefined" && salla.onReady) {
    try { salla.onReady(boot); } catch (e) {}
  }
  if (document.readyState === "complete" || document.readyState === "interactive") {
    boot();
  } else {
    document.addEventListener("DOMContentLoaded", boot);
    setTimeout(boot, 500);
  }
})();