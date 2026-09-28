/**
 * Cart incentives on the storefront product page.
 *
 * Loaded on the Salla store through an App Snippet:
 *   <script src="https://YOUR-APP-DOMAIN/storefront/incentives.js" defer></script>
 *
 * Reads the settings the merchant saved in the app (GET /api/incentives on
 * the same domain as this script) and shows, above the add-to-cart button:
 * free shipping bar, countdown, remaining stock, and the coupon.
 *
 * To choose the position, add <div id="zawwid-incentives"></div> to the theme.
 */
(function () {
  "use strict";

  var ROOT_ID = "zawwid-incentives";
  var POPUP_CLOSED_KEY = "zawwid-incentives:popup-closed";
  var SALLA_WAIT_MS = 10000;

  var script =
    document.currentScript ||
    document.querySelector('script[src*="storefront/incentives.js"]');
  if (!script) return;
  var API_URL = new URL("/api/incentives", script.src).href;

  // ---------- helpers ----------

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function money(amount) {
    try {
      return window.salla.money(amount);
    } catch (e) {
      return String(amount);
    }
  }

  function toNumber(value) {
    if (value && typeof value === "object") value = value.amount;
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  // Cart payloads differ between SDK calls and events
  function readCartTotal(payload) {
    var candidates = [
      payload,
      payload && payload.data,
      payload && payload.cart,
      payload && payload.data && payload.data.cart,
    ];
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (!c) continue;
      var total = toNumber(c.sub_total);
      if (total === null) total = toNumber(c.total);
      if (total !== null) return total;
    }
    return null;
  }

  function sessionGet(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function sessionSet(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch (e) {
      /* storage blocked: the popup just shows again next page */
    }
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function formatRemaining(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var days = Math.floor(total / 86400);
    var time = [
      Math.floor((total % 86400) / 3600),
      Math.floor((total % 3600) / 60),
      total % 60,
    ]
      .map(pad)
      .join(":");
    return days > 0 ? days + "d " + time : time;
  }

  // ---------- page detection ----------

  function isProductPage(salla) {
    try {
      if (salla.url && typeof salla.url.is_page === "function") {
        return salla.url.is_page("product.single");
      }
      var slug = salla.config.get("page.slug");
      if (slug) return slug === "product.single";
    } catch (e) {
      /* older SDK: fall back to the URL */
    }
    // Salla product URLs end with /p<id>; cards on other pages don't count
    return /\/p\d+\/?$/.test(window.location.pathname);
  }

  function getProductId(salla) {
    var id = null;
    try {
      id = salla.config.get("page.id");
    } catch (e) {
      /* fall back below */
    }
    if (!id) {
      var button = document.querySelector("salla-add-product-button[product-id]");
      id = button && button.getAttribute("product-id");
    }
    if (!id) {
      var match = window.location.pathname.match(/\/p(\d+)\/?$/);
      id = match && match[1];
    }
    return id;
  }

  function mountRoot() {
    var existing = document.getElementById(ROOT_ID);
    if (existing) return existing;

    var root = el("div");
    root.id = ROOT_ID;
    var form = document.querySelector("form.product-form");
    var button = document.querySelector("salla-add-product-button");
    if (form) form.insertBefore(root, form.firstChild);
    else if (button) button.parentNode.insertBefore(root, button);
    else (document.querySelector("main") || document.body).appendChild(root);
    return root;
  }

  // ---------- widgets ----------

  function freeShippingWidget(threshold) {
    var box = el("div", "zi-box");
    var text = el("p", "zi-shipping-text");
    var bar = el("div", "zi-bar");
    var fill = el("span");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", "الشحن المجاني");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", String(threshold));
    bar.appendChild(fill);
    box.appendChild(text);
    box.appendChild(bar);

    function update(total) {
      var remaining = Math.max(0, threshold - total);
      bar.setAttribute("aria-valuenow", String(Math.min(total, threshold)));
      fill.style.width = Math.min(total / threshold, 1) * 100 + "%";
      text.textContent = "";
      if (remaining > 0) {
        text.appendChild(document.createTextNode("باقي "));
        text.appendChild(el("strong", "", money(remaining)));
        text.appendChild(document.createTextNode(" وتحصل على شحن مجاني"));
        box.classList.remove("zi-done");
      } else {
        text.textContent = "مبروك! طلبك مؤهل للشحن المجاني";
        box.classList.add("zi-done");
      }
    }

    update(0);
    return { node: box, update: update };
  }

  function countdownWidget(endsAt) {
    var end = new Date(endsAt).getTime();
    if (!(end > Date.now())) return null;

    var node = el("p", "zi-countdown", "ينتهي العرض خلال ");
    var time = el("time", "zi-countdown-time");
    time.setAttribute("dir", "ltr");
    node.appendChild(time);

    function tick() {
      var remaining = end - Date.now();
      if (remaining <= 0) {
        clearInterval(timer);
        node.remove();
        return;
      }
      time.textContent = formatRemaining(remaining);
    }
    var timer = setInterval(tick, 1000);
    tick();
    return node;
  }

  function couponWidget(coupon, floating) {
    var card = el("div", "zi-coupon" + (floating ? " zi-coupon-floating" : ""));
    var info = el("div");
    info.appendChild(el("span", "zi-coupon-label", "كوبون لك"));
    if (coupon.text) info.appendChild(el("p", "zi-coupon-text", coupon.text));

    var copy = el("button", "zi-coupon-code", coupon.code);
    copy.type = "button";
    copy.title = "نسخ الكود";
    copy.addEventListener("click", function () {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(coupon.code).then(function () {
        copy.textContent = "تم النسخ";
        setTimeout(function () {
          copy.textContent = coupon.code;
        }, 1500);
      }, function () {});
    });

    card.appendChild(info);
    card.appendChild(copy);

    if (floating) {
      var close = el("button", "zi-coupon-close", "×");
      close.type = "button";
      close.setAttribute("aria-label", "إغلاق");
      close.addEventListener("click", function () {
        card.remove();
        sessionSet(POPUP_CLOSED_KEY, coupon.code);
      });
      card.appendChild(close);
    }
    return card;
  }

  // ---------- render ----------

  function watchCartTotal(salla, onTotal) {
    var cart = salla.cart || {};
    var events = cart.event || {};
    function handle(payload) {
      var total = readCartTotal(payload);
      if (total !== null) onTotal(total);
    }

    ["onUpdated", "onItemAdded", "onItemDeleted", "onItemUpdated"].forEach(
      function (name) {
        if (typeof events[name] === "function") events[name](handle);
      },
    );
    if (typeof cart.details === "function") {
      Promise.resolve(cart.details()).then(handle, function () {});
    }
  }

  function render(salla, settings) {
    var root = mountRoot();
    root.setAttribute("dir", "rtl");
    root.setAttribute("lang", "ar");
    root.textContent = "";

    if (settings.freeShipping && settings.freeShipping.enabled) {
      var shipping = freeShippingWidget(settings.freeShipping.threshold);
      root.appendChild(shipping.node);
      watchCartTotal(salla, shipping.update);
    }

    if (settings.countdown && settings.countdown.enabled) {
      var countdown = countdownWidget(settings.countdown.endsAt);
      if (countdown) root.appendChild(countdown);
    }

    var lowStock = settings.lowStock;
    var productId = getProductId(salla);
    if (lowStock && lowStock.enabled && productId && salla.product &&
        typeof salla.product.getDetails === "function") {
      var stockSlot = el("p", "zi-low-stock");
      stockSlot.hidden = true;
      root.appendChild(stockSlot);
      Promise.resolve(salla.product.getDetails(productId)).then(
        function (response) {
          var product = (response && response.data) || response || {};
          var quantity = toNumber(product.quantity);
          // null = unlimited stock; 0 = sold out (the theme already says so)
          if (quantity !== null && quantity > 0 && quantity <= lowStock.threshold) {
            stockSlot.textContent =
              quantity === 1 ? "باقي قطعة واحدة بس!" : "باقي " + quantity + " قطع بس!";
            stockSlot.hidden = false;
          }
        },
        function () {},
      );
    }

    var coupon = settings.coupon;
    if (coupon && coupon.enabled && coupon.code) {
      if (coupon.display === "popup") {
        if (sessionGet(POPUP_CLOSED_KEY) !== coupon.code) {
          document.body.appendChild(couponWidget(coupon, true));
        }
      } else {
        root.appendChild(couponWidget(coupon, false));
      }
    }
  }

  // ---------- styles ----------

  function injectStyles() {
    if (document.getElementById(ROOT_ID + "-style")) return;
    var style = el("style");
    style.id = ROOT_ID + "-style";
    style.textContent = [
      "#" + ROOT_ID + "{display:grid;gap:10px;margin:0 0 16px;font:inherit;color:inherit}",
      "#" + ROOT_ID + ":empty{display:none}",
      ".zi-box{padding:12px;border:1px solid rgba(0,0,0,.08);border-radius:10px;background:rgba(0,0,0,.02)}",
      ".zi-shipping-text{margin:0 0 8px;font-size:.9rem}",
      ".zi-done .zi-shipping-text{color:#059669;font-weight:600}",
      ".zi-bar{height:8px;border-radius:999px;background:rgba(0,0,0,.08);overflow:hidden}",
      ".zi-bar span{display:block;height:100%;border-radius:inherit;background:var(--color-primary,#059669);transition:width .4s ease}",
      ".zi-done .zi-bar span{background:#059669}",
      ".zi-countdown{margin:0;padding:10px 12px;border-radius:10px;background:#fef2f2;color:#b91c1c;font-size:.9rem}",
      ".zi-countdown-time{font-weight:700;font-variant-numeric:tabular-nums}",
      ".zi-low-stock{margin:0;color:#c2410c;font-weight:600;font-size:.9rem}",
      ".zi-coupon{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px dashed var(--color-primary,#059669);border-radius:10px;background:#fff;color:#111}",
      ".zi-coupon-label{font-size:.75rem;opacity:.7}",
      ".zi-coupon-text{margin:2px 0 0;font-size:.9rem}",
      ".zi-coupon-code{flex:none;padding:8px 12px;border:0;border-radius:8px;background:var(--color-primary,#059669);color:#fff;font:inherit;font-weight:700;letter-spacing:.05em;cursor:pointer}",
      ".zi-coupon-floating{position:fixed;inset-block-end:16px;inset-inline-start:16px;z-index:9999;max-width:min(360px,calc(100vw - 32px));padding-inline-end:36px;box-shadow:0 10px 30px rgba(0,0,0,.18)}",
      ".zi-coupon-close{position:absolute;top:6px;inset-inline-end:8px;border:0;background:none;font-size:1.25rem;line-height:1;cursor:pointer;color:inherit}",
    ].join("\n");
    document.head.appendChild(style);
  }

  // ---------- boot ----------

  function start(salla) {
    if (!isProductPage(salla)) return;

    fetch(API_URL)
      .then(function (response) {
        return response.json();
      })
      .then(function (result) {
        var settings = result && result.success && result.data && result.data.settings;
        if (!settings) return; // nothing published yet
        injectStyles();
        render(salla, settings);
      })
      .catch(function () {
        /* the store page works fine without incentives */
      });
  }

  // The snippet can run before the theme loads the salla SDK
  var waited = 0;
  (function waitForSalla() {
    var salla = window.salla;
    if (salla && typeof salla.onReady === "function") {
      salla.onReady(function () {
        start(salla);
      });
    } else if (waited < SALLA_WAIT_MS) {
      waited += 200;
      setTimeout(waitForSalla, 200);
    }
  })();
})();
