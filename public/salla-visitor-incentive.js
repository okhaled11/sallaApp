/**
 * Salla Frequent Visitor Retention & Ably Realtime Incentive Modal Script
 * Standalone JavaScript file (can be loaded via <script src="..."> or imported directly)
 */
(function () {
  "use strict";

  var CONFIG = {
    enabled: true,
    minVisits: 3,
    timeWindowMinutes: 60,
    headline: "سعداء بزيارتك المتكررة لمتجرنا! ✨",
    message:
      "لاحظنا اهتمامك بمنتجاتنا المميزة! يسعدنا تقديم خصم حصري لتكمل طلبك وتستمتع بتجربة تسوق فريدة.",
    couponCode: "SPECIAL3X",
    couponCaption: "كود الخصم الحصري لك:",
    discountType: "percentage",
    discountValue: 15,
    ctaText: "تطبيق الخصم وإكمال الطلب 🛍️",
    dismissText: "متابعة التصفح",
    giftEmoji: "🎁",
    showCountdown: true,
    countdownMinutes: 15,
    accentColor: "#73fcd7",
    primaryColor: "#004d5b",
    enableRealtimePresence: true,
    showLiveCounterBadge: false,
    tokenEndpoint:
      "https://live-visitor-counter-backend.vercel.app/api/presence-token",
    ablyCdn: "https://cdn.ably.com/lib/ably.min-2.js",
  };

  if (!CONFIG.enabled) return;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Ably) return resolve();
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function getProductIdFromUrl() {
    var match = location.pathname.match(/\/p(\d+)/);
    return match ? match[1] : null;
  }

  var hasStarted = false;
  function startTracking() {
    if (hasStarted) return;
    hasStarted = true;

    var TARGET_STORE_ID =
      (typeof window !== "undefined" && window._salla_target_store_id) ||
      "apptest";
    var detectedStoreId =
      (typeof salla !== "undefined" &&
        salla.config &&
        salla.config.get &&
        (salla.config.get("store.id") ||
          salla.config.get("store.username") ||
          salla.config.get("store_id"))) ||
      (window.salla &&
        window.salla.config &&
        (window.salla.config.store?.id ||
          window.salla.config.store?.username)) ||
      (function () {
        var h = (location.hostname || "").toLowerCase();
        var m = h.match(
          /^([a-z0-9-_]+)\.(salla\.sa|preview\.salla\.sa|dev\.salla\.sa)$/,
        );
        if (m && m[1] && m[1] !== "www") return m[1];
        if (h.indexOf("salla.sa") !== -1) {
          var seg = (location.pathname || "").split("/").filter(Boolean)[0];
          if (seg && !seg.match(/^(ar|en|cart|checkout|products|p|c)$/i))
            return seg;
        }
        return null;
      })() ||
      "apptest";

    var storeId = String(TARGET_STORE_ID || detectedStoreId);

    console.log(
      "%c[Salla-Incentives] 🟢 نظام تتبع الزوار نشط للمتجر: " + storeId,
      "background:#004d5b;color:#73fcd7;font-weight:bold;padding:4px 8px;border-radius:4px;",
    );

    var STORAGE_KEY = "_salla_visits_" + storeId;
    var MODAL_SHOWN_KEY = "_salla_modal_shown_" + storeId;
    var CONFIG_STORAGE_KEY = "_salla_incentive_config_" + storeId;
    var productId = getProductIdFromUrl();

    // Persistent visitor UUID per device/browser so repeat visits accumulate
    var CLIENT_UUID_KEY = "_salla_visitor_uuid_" + storeId;
    var clientId = "";
    try {
      clientId = localStorage.getItem(CLIENT_UUID_KEY);
    } catch (e) {}
    if (!clientId) {
      clientId =
        "vis_" +
        Math.random().toString(36).slice(2, 8) +
        Date.now().toString(36).slice(-4);
      try {
        localStorage.setItem(CLIENT_UUID_KEY, clientId);
      } catch (e) {}
    }

    // Expose reset helper for testing
    window.resetSallaVisits = function () {
      try {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(MODAL_SHOWN_KEY);
        console.log(
          "%c[Salla-Incentives] 🔄 تم تصفير عداد الزيارات بنجاح! حدّث الصفحة للبدء من الزيارة 1.",
          "color:#00b259;font-weight:bold;",
        );
      } catch (e) {}
    };

    // Dynamically load latest customizer config saved from the dashboard
    var ACTIVE_CONFIG = Object.assign({}, CONFIG);
    try {
      var rawCustom =
        localStorage.getItem(CONFIG_STORAGE_KEY) ||
        localStorage.getItem("_salla_incentive_config");
      if (rawCustom) {
        var parsedCustom = JSON.parse(rawCustom);
        ACTIVE_CONFIG = Object.assign({}, ACTIVE_CONFIG, parsedCustom);
      }
    } catch (e) {}

    var windowMs = (ACTIVE_CONFIG.timeWindowMinutes || 60) * 60 * 1000;

    // Record visitor entry & filter within time window
    var history = [];
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) history = JSON.parse(raw);
    } catch (e) {
      history = [];
    }

    history = history.filter(function (ts) {
      return now - ts <= windowMs;
    });
    history.push(now);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      // ignore
    }

    // Sync into merchant dashboard real visitors log
    try {
      var DASH_LOG_KEY = "_salla_frequent_visitors_log";
      var rawLog = localStorage.getItem(DASH_LOG_KEY);
      var dashList = rawLog ? JSON.parse(rawLog) : [];
      var existingV = dashList.find(function (item) {
        return item.id === clientId;
      });
      if (existingV) {
        existingV.visitCount = history.length;
        existingV.visitTimestamps = history;
        existingV.isOnline = true;
        existingV.lastVisitedAgo = "متصل الآن (واجهة المتجر)";
        existingV.timeSpanText = history.length + " زيارات خلال وقت متقارب";
        if (history.length >= (ACTIVE_CONFIG.minVisits || 3)) {
          existingV.status = "qualified";
        }
      } else {
        dashList.unshift({
          id: clientId,
          name: "زائر متجر سلة (#" + clientId.slice(-4) + ")",
          visitorType: "guest",
          city: "متصفح حقيقي",
          device: /Mobile|Android|iPhone/i.test(navigator.userAgent)
            ? "جوال (سلة)"
            : "متصفح ويب",
          visitCount: 1,
          isOnline: true,
          visitTimestamps: history,
          purchasesCount: 0,
          cartItemsCount: 0,
          cartValue: 0,
          viewedProducts: [productId ? "منتج رقم " + productId : "تصفح المتجر"],
          status: "watching",
          lastVisitedAgo: "متصل الآن",
          timeSpanText: "زيارة أولى بالمتجر",
        });
      }
      localStorage.setItem(DASH_LOG_KEY, JSON.stringify(dashList.slice(0, 50)));
    } catch (e) {
      // ignore
    }

    var visitCount = history.length;
    var hasPurchased = document.cookie.indexOf("salla_has_ordered=1") !== -1;
    var alreadyShown = sessionStorage.getItem(MODAL_SHOWN_KEY);

    // Connect to Ably Realtime Presence
    loadScript(
      ACTIVE_CONFIG.ablyCdn || "https://cdn.ably.com/lib/ably.min-2.js",
    )
      .then(function () {
        var realtime = new Ably.Realtime({
          authCallback: function (_tokenParams, callback) {
            fetch(ACTIVE_CONFIG.tokenEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                storeId: storeId,
                productId: productId,
                clientId: clientId,
                tokenParams: _tokenParams || {},
              }),
            })
              .then(function (res) {
                return res.json();
              })
              .then(function (req) {
                callback(null, req);
              })
              .catch(function (err) {
                callback(err, null);
              });
          },
        });

        var storeChannel = realtime.channels.get("presence:store:" + storeId);
        storeChannel.presence
          .enter({
            clientId: clientId,
            visitCount: visitCount,
            isQualified: visitCount >= (ACTIVE_CONFIG.minVisits || 3),
            productId: productId,
            pathname: location.pathname,
            timestamp: now,
          })
          .then(function () {
            console.log(
              "%c[Salla-Incentives] 📡 تم إرسال حالة التواجد (Presence Active) للقناة: presence:store:" +
                storeId,
              "color:#00b259;font-weight:bold;",
            );
          })
          .catch(function (err) {
            console.warn("[Salla-Incentives] presence.enter error:", err);
          });

        setInterval(function () {
          try {
            storeChannel.presence.update({
              clientId: clientId,
              visitCount: history.length,
              pathname: location.pathname,
              timestamp: Date.now(),
            });
          } catch (e) {}
        }, 25000);
      })
      .catch(function (err) {
        console.warn("[Salla-Incentives] Ably load error:", err);
      });

    // Check if visitor entered 3 times in close proximity without buying
    if (
      visitCount >= (ACTIVE_CONFIG.minVisits || 3) &&
      !hasPurchased &&
      !alreadyShown
    ) {
      setTimeout(function () {
        showIncentiveModal();
      }, 1800);
    }

    function showIncentiveModal(customCoupon) {
      sessionStorage.setItem(MODAL_SHOWN_KEY, "true");
      var existing = document.getElementById("salla-freq-visitor-modal");
      if (existing) existing.remove();

      var activeCoupon = customCoupon || ACTIVE_CONFIG.couponCode;
      var primaryCol = ACTIVE_CONFIG.primaryColor || "#004d5b";
      var accentCol = ACTIVE_CONFIG.accentColor || "#73fcd7";
      var emoji = ACTIVE_CONFIG.giftEmoji || "🎁";
      var caption = ACTIVE_CONFIG.couponCaption || "كود الخصم الحصري لك:";

      var overlay = document.createElement("div");
      overlay.id = "salla-freq-visitor-modal";
      overlay.style.cssText =
        "position:fixed;inset:0;background:rgba(0,30,36,0.65);backdrop-filter:blur(5px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:PingARLT,system-ui,sans-serif;direction:rtl;";

      var card = document.createElement("div");
      card.style.cssText =
        "background:#ffffff;border-radius:20px;max-width:440px;width:100%;box-shadow:0 20px 45px rgba(0,77,91,0.25);border:2px solid " +
        accentCol +
        ";overflow:hidden;animation:popIn 0.3s cubic-bezier(0.16,1,0.3,1);";

      card.innerHTML =
        '<div style="background:' +
        primaryCol +
        ';padding:24px 20px;text-align:center;color:#ffffff;position:relative;">' +
        '<button id="salla-modal-close" style="position:absolute;top:14px;left:14px;background:none;border:none;color:#ffffff;font-size:20px;cursor:pointer;opacity:0.8;">✕</button>' +
        '<div style="width:52px;height:52px;border-radius:50%;background:' +
        accentCol +
        ";color:" +
        primaryCol +
        ';display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:12px;font-weight:bold;">' +
        emoji +
        "</div>" +
        '<h3 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#ffffff;">' +
        ACTIVE_CONFIG.headline +
        "</h3>" +
        '<p style="margin:0;font-size:13px;opacity:0.92;line-height:1.5;color:#ffffff;">' +
        ACTIVE_CONFIG.message +
        "</p>" +
        "</div>" +
        '<div style="padding:20px;background:#f8f8f8;text-align:center;">' +
        '<div style="background:#ffffff;border:2px dashed ' +
        primaryCol +
        ';border-radius:12px;padding:12px;margin-bottom:16px;">' +
        '<span style="font-size:12px;color:#374151;font-weight:600;display:block;margin-bottom:4px;">' +
        caption +
        "</span>" +
        '<span style="font-size:22px;font-weight:800;letter-spacing:2px;color:' +
        primaryCol +
        ';font-family:monospace;">' +
        activeCoupon +
        "</span>" +
        '<span style="display:inline-block;background:' +
        accentCol +
        ";color:" +
        primaryCol +
        ';font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;margin-right:8px;">خصم ' +
        ACTIVE_CONFIG.discountValue +
        "%</span>" +
        "</div>" +
        '<button id="salla-modal-apply" style="width:100%;padding:14px;background:' +
        primaryCol +
        ';color:#ffffff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,77,91,0.25);">' +
        ACTIVE_CONFIG.ctaText +
        "</button>" +
        '<button id="salla-modal-dismiss" style="margin-top:10px;background:none;border:none;color:#374151;font-size:13px;font-weight:600;cursor:pointer;text-decoration:underline;">' +
        ACTIVE_CONFIG.dismissText +
        "</button>" +
        "</div>";

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      function dismiss() {
        overlay.remove();
      }
      document.getElementById("salla-modal-close").onclick = dismiss;
      document.getElementById("salla-modal-dismiss").onclick = dismiss;

      document.getElementById("salla-modal-apply").onclick = function () {
        // Save pending coupon for auto-application on first add-to-cart
        try {
          localStorage.setItem("_salla_auto_coupon_" + storeId, activeCoupon);
          localStorage.setItem("_salla_auto_coupon", activeCoupon);
          navigator.clipboard.writeText(activeCoupon);
        } catch (e) {}

        // Attempt background coupon application if cart already has items
        if (
          window.salla &&
          window.salla.cart &&
          window.salla.cart.applyCoupon
        ) {
          window.salla.cart.applyCoupon(activeCoupon).catch(function () {});
        }

        // Close modal without redirecting to cart
        dismiss();

        // Show celebratory toast and persistent floating discount pill
        showToast(
          "🎉 تم تفعيل خصمك بنجاح! سيُطبّق تلقائياً على أول منتج تضيفه إلى السلة.",
        );
        showFloatingPill(activeCoupon, ACTIVE_CONFIG.discountValue || 15);
      };
    }

    // Helper: Show floating notification toast
    function showToast(msg) {
      var existing = document.getElementById("salla-incentive-toast");
      if (existing) existing.remove();
      var toast = document.createElement("div");
      toast.id = "salla-incentive-toast";
      toast.style.cssText =
        "position:fixed;top:24px;left:50%;transform:translateX(-50%);background:#004d5b;color:#ffffff;padding:14px 24px;border-radius:12px;box-shadow:0 12px 35px rgba(0,0,0,0.3);z-index:9999999;font-family:PingARLT,system-ui,sans-serif;font-size:14px;font-weight:bold;display:flex;align-items:center;gap:10px;border:2px solid #73fcd7;direction:rtl;";
      toast.innerHTML = "<span>" + msg + "</span>";
      document.body.appendChild(toast);
      setTimeout(function () {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.4s ease";
        setTimeout(function () {
          toast.remove();
        }, 400);
      }, 5000);
    }

    // Helper: Show floating discount pill while browsing
    function showFloatingPill(coupon, discountVal) {
      var existing = document.getElementById("salla-active-discount-pill");
      if (existing) existing.remove();
      var pill = document.createElement("div");
      pill.id = "salla-active-discount-pill";
      pill.style.cssText =
        "position:fixed;bottom:24px;right:24px;background:#004d5b;color:#73fcd7;padding:10px 18px;border-radius:50px;box-shadow:0 8px 30px rgba(0,0,0,0.25);z-index:999998;font-family:PingARLT,system-ui,sans-serif;font-size:13px;font-weight:bold;display:flex;align-items:center;gap:10px;border:1.5px solid #73fcd7;direction:rtl;cursor:default;";
      pill.innerHTML =
        "<span>🏷️ كود الخصم (" +
        coupon +
        ") مفعّل لطلبك القادم (خصم " +
        discountVal +
        "%)!</span>" +
        '<button id="salla-pill-close" style="background:none;border:none;color:#ffffff;font-size:16px;cursor:pointer;padding:0 2px;opacity:0.8;">✕</button>';
      document.body.appendChild(pill);
      var closeBtn = document.getElementById("salla-pill-close");
      if (closeBtn) {
        closeBtn.onclick = function () {
          pill.remove();
        };
      }
    }

    // Auto-apply discount to first item added to cart
    function tryApplyAutoDiscount() {
      var pendingCoupon =
        localStorage.getItem("_salla_auto_coupon_" + storeId) ||
        localStorage.getItem("_salla_auto_coupon");
      if (!pendingCoupon) return;

      if (window.salla && window.salla.cart && window.salla.cart.applyCoupon) {
        window.salla.cart
          .applyCoupon(pendingCoupon)
          .then(function () {
            console.log(
              "%c[Salla-Incentives] 🏷️ تم تطبيق الخصم تلقائياً على أول منتج في السلة بنجاح!",
              "color:#00b259;font-weight:bold;",
            );
            showToast(
              "✅ تم تطبيق كود الخصم (" +
                pendingCoupon +
                ") تلقائياً على أول منتج في سلتك!",
            );
            localStorage.removeItem("_salla_auto_coupon_" + storeId);
            localStorage.removeItem("_salla_auto_coupon");
            var pill = document.getElementById("salla-active-discount-pill");
            if (pill) pill.remove();
          })
          .catch(function (err) {
            console.warn("[Salla-Incentives] auto-applyCoupon:", err);
          });
      }
    }

    // Check if user already activated discount on previous page
    var currentPending =
      localStorage.getItem("_salla_auto_coupon_" + storeId) ||
      localStorage.getItem("_salla_auto_coupon");
    if (currentPending) {
      showFloatingPill(currentPending, ACTIVE_CONFIG.discountValue || 15);
    }

    // Listen to Twilight cart events
    if (window.salla && window.salla.event) {
      try {
        window.salla.event.on("cart::item.added", function () {
          setTimeout(tryApplyAutoDiscount, 500);
        });
      } catch (e) {}
    }
    if (
      window.salla &&
      window.salla.cart &&
      window.salla.cart.event &&
      window.salla.cart.event.onItemAdded
    ) {
      try {
        window.salla.cart.event.onItemAdded(function () {
          setTimeout(tryApplyAutoDiscount, 500);
        });
      } catch (e) {}
    }
    document.addEventListener("salla:cart:itemAdded", function () {
      setTimeout(tryApplyAutoDiscount, 500);
    });
    document.addEventListener("cart::item.added", function () {
      setTimeout(tryApplyAutoDiscount, 500);
    });

    // Fallback: Intercept add-to-cart clicks
    document.addEventListener(
      "click",
      function (e) {
        var target = e.target.closest(
          "button, a, salla-add-product-button, .salla-add-to-cart, [data-salla-add-to-cart]",
        );
        if (!target) return;
        var text = (target.innerText || target.textContent || "").trim();
        var isAddBtn =
          /أضف للسلة|إضافة للسلة|add to cart/i.test(text) ||
          target.tagName.toLowerCase() === "salla-add-product-button" ||
          target.hasAttribute("data-salla-add-to-cart") ||
          (target.className &&
            typeof target.className === "string" &&
            target.className.indexOf("add-to-cart") !== -1);
        if (isAddBtn) {
          setTimeout(tryApplyAutoDiscount, 1200);
          setTimeout(tryApplyAutoDiscount, 2600);
        }
      },
      true,
    );
  }

  if (typeof salla !== "undefined" && salla.onReady) {
    try {
      salla.onReady(startTracking);
    } catch (e) {}
  }
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    startTracking();
  } else {
    document.addEventListener("DOMContentLoaded", startTracking);
    setTimeout(startTracking, 500);
  }
})();
