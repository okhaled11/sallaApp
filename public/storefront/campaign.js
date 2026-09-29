/**
 * Salla promo campaign popup (storefront script).
 *
 * Loaded into the store by the App Snippet:
 *   <script src="https://YOUR-APP-DOMAIN/storefront/campaign.js" defer></script>
 *
 * 1. Reads the store id from the Twilight SDK: salla.config.get('store.id')
 * 2. Fetches GET <app>/api/storefront-campaign?store=<id>
 * 3. Shows the popup (after the delay, respecting the frequency)
 *
 * The dashboard preview loads this same file with data-mode="preview" and
 * calls window.SallaPromoCampaign.render(...) so both always look the same.
 *
 * Safety: all campaign text is set with textContent (never HTML), links and
 * images must be http(s), styles live in a Shadow DOM.
 */
(function () {
  "use strict";

  var SCRIPT = document.currentScript;
  var ORIGIN = (function () {
    try {
      return new URL(SCRIPT.src).origin;
    } catch (e) {
      return "";
    }
  })();
  var HOST_ID = "salla-promo-campaign";
  var SEEN_KEY = "salla-promo-campaign:seen";
  var STORE_ID_TIMEOUT_MS = 10000;

  var CURRENCY_LABELS = { SAR: "ر.س" };

  var STYLES =
    ":host{all:initial;font-family:inherit}" +
    "*{box-sizing:border-box}" +
    ".overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,26,.55);font-family:inherit;animation:fade .2s ease}" +
    ".overlay.is-preview{position:absolute;z-index:1}" +
    ".overlay.pos-bottom{align-items:flex-end;padding:0}" +
    ".dialog{--bg:#fff;--text:#1d1e20;--muted:#5c6166;--line:#e4e7e9;--soft:#f5f7f7;position:relative;width:100%;max-width:420px;max-height:calc(100% - 16px);overflow:auto;padding:20px;border-radius:16px;background:var(--bg);color:var(--text);box-shadow:0 20px 50px rgba(0,0,0,.25);font-family:inherit;font-size:14px;line-height:1.5;animation:pop .25s ease}" +
    ".pos-bottom .dialog{max-width:560px;border-radius:16px 16px 0 0;animation:rise .25s ease}" +
    ".theme-dark .dialog{--bg:#1d1e20;--text:#f2f4f5;--muted:#b7bcc2;--line:#34373b;--soft:#26282b}" +
    ".close{position:absolute;top:10px;inset-inline-start:10px;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:0;border-radius:50%;background:var(--soft);color:var(--text);font-size:18px;line-height:1;cursor:pointer}" +
    ".badge{display:inline-block;padding:3px 10px;border-radius:999px;background:var(--accent);color:var(--on-accent);font-weight:700;font-size:13px}" +
    ".title{margin:10px 0 4px;font-size:20px;font-weight:700;line-height:1.3}" +
    ".message{margin:0 0 14px;color:var(--muted)}" +
    ".timer{display:flex;gap:8px;margin:0 0 16px}" +
    ".unit{flex:1;padding:8px 4px;border-radius:10px;background:var(--soft);text-align:center}" +
    ".unit b{display:block;font-size:18px;font-variant-numeric:tabular-nums;direction:ltr}" +
    ".unit span{font-size:11px;color:var(--muted)}" +
    ".products{display:flex;flex-direction:column;gap:8px;margin:0 0 16px;padding:0;list-style:none}" +
    ".product{display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--line);border-radius:12px;color:inherit;text-decoration:none}" +
    "a.product:hover{border-color:var(--accent)}" +
    ".thumb{flex-shrink:0;width:48px;height:48px;border-radius:8px;background:var(--soft);object-fit:cover}" +
    ".info{flex:1;min-width:0}" +
    ".name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}" +
    ".prices{display:flex;gap:6px;align-items:baseline;font-size:13px}" +
    ".prices s{color:var(--muted)}" +
    ".prices strong{color:var(--accent-text)}" +
    ".cta{display:block;width:100%;padding:12px;border:0;border-radius:10px;background:var(--accent);color:var(--on-accent);font:inherit;font-weight:700;text-align:center;text-decoration:none;cursor:pointer}" +
    ".cta:hover{filter:brightness(1.08)}" +
    ":focus-visible{outline:2px solid var(--accent);outline-offset:2px}" +
    "@keyframes fade{from{opacity:0}}" +
    "@keyframes pop{from{opacity:0;transform:scale(.96)}}" +
    "@keyframes rise{from{transform:translateY(24px);opacity:0}}" +
    "@media (prefers-reduced-motion:reduce){.overlay,.dialog{animation:none}}";

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function safeUrl(value) {
    // new URL(null, base) would resolve to ".../null"
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      var url = new URL(value, window.location.href);
      return url.protocol === "https:" || url.protocol === "http:"
        ? url.href
        : null;
    } catch (e) {
      return null;
    }
  }

  function isHexColor(value) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  }

  // Black or white text, whichever reads better on the accent color
  function textOn(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255;
    var g = parseInt(hex.slice(3, 5), 16) / 255;
    var b = parseInt(hex.slice(5, 7), 16) / 255;
    var lin = function (c) {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    var luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return luminance > 0.4 ? "#111111" : "#ffffff";
  }

  function formatMoney(amount, currency) {
    if (amount === null || amount === undefined) return "";
    var number = new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
    }).format(amount);
    return number + " " + (CURRENCY_LABELS[currency] || currency || "");
  }

  function splitRemaining(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    return {
      days: Math.floor(total / 86400),
      hours: Math.floor((total % 86400) / 3600),
      minutes: Math.floor((total % 3600) / 60),
      seconds: total % 60,
      total: total,
    };
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------

  /**
   * Render the popup into `root` (a ShadowRoot or element).
   * @param {ShadowRoot|Element} root
   * @param {object} campaign - public campaign from /api/storefront-campaign
   * @param {{ preview?: boolean, onClose?: function, now?: function }} [options]
   * @returns {{ destroy: function, dialog: Element }}
   */
  function render(root, campaign, options) {
    options = options || {};
    var now = options.now || Date.now;
    var design = campaign.design || {};
    var accent = isHexColor(design.accentColor)
      ? design.accentColor
      : "#004d5b";
    var endsAt = new Date(campaign.endsAt).getTime();
    var timers = [];
    var cleanups = [];

    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(el("style", null, STYLES));

    var overlay = el(
      "div",
      "overlay theme-" +
        (design.theme === "dark" ? "dark" : "light") +
        " pos-" +
        (design.position === "bottom" ? "bottom" : "center") +
        (options.preview ? " is-preview" : ""),
    );
    overlay.setAttribute("dir", "rtl");
    overlay.setAttribute("lang", "ar");
    overlay.style.setProperty("--accent", accent);
    overlay.style.setProperty("--on-accent", textOn(accent));
    overlay.style.setProperty(
      "--accent-text",
      design.theme === "dark" && textOn(accent) === "#ffffff"
        ? "#ffffff"
        : accent,
    );

    var dialog = el("div", "dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", options.preview ? "false" : "true");
    dialog.setAttribute("aria-labelledby", "promo-title");
    dialog.setAttribute("aria-describedby", "promo-message");

    function destroy() {
      timers.forEach(clearInterval);
      cleanups.forEach(function (fn) {
        fn();
      });
      while (root.firstChild) root.removeChild(root.firstChild);
    }

    function close() {
      destroy();
      if (options.onClose) options.onClose();
    }

    var closeButton = el("button", "close", "×");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "إغلاق");
    closeButton.addEventListener("click", close);
    dialog.appendChild(closeButton);

    dialog.appendChild(
      el("span", "badge", "خصم " + campaign.discountPercent + "%"),
    );
    var title = el("h2", "title", design.title);
    title.id = "promo-title";
    dialog.appendChild(title);
    var message = el("p", "message", design.message || "");
    message.id = "promo-message";
    dialog.appendChild(message);

    // Countdown
    var timer = el("div", "timer");
    timer.setAttribute("role", "timer");
    timer.setAttribute("aria-label", "ينتهي العرض خلال");
    var units = [
      ["days", "يوم"],
      ["hours", "ساعة"],
      ["minutes", "دقيقة"],
      ["seconds", "ثانية"],
    ].map(function (pair) {
      var box = el("div", "unit");
      var value = el("b");
      box.appendChild(value);
      box.appendChild(el("span", null, pair[1]));
      timer.appendChild(box);
      return { key: pair[0], value: value };
    });
    dialog.appendChild(timer);

    function tick() {
      var left = splitRemaining(endsAt - now());
      units.forEach(function (unit) {
        unit.value.textContent = pad(left[unit.key]);
      });
      if (left.total === 0 && !options.preview) close();
    }
    tick();
    timers.push(setInterval(tick, 1000));

    // Products
    var list = el("ul", "products");
    (campaign.products || []).forEach(function (product) {
      var item = el("li");
      var href = safeUrl(product.url);
      var card = el(href ? "a" : "div", "product");
      if (href) card.href = href;

      var src = safeUrl(product.image);
      var thumb = el(src ? "img" : "span", "thumb");
      if (src) {
        thumb.src = src;
        thumb.alt = "";
        thumb.loading = "lazy";
      }
      card.appendChild(thumb);

      var info = el("div", "info");
      info.appendChild(el("span", "name", product.name));
      var prices = el("div", "prices");
      if (product.finalPrice !== null && product.finalPrice !== undefined) {
        prices.appendChild(
          el("strong", null, formatMoney(product.finalPrice, product.currency)),
        );
        var old = el("s", null, formatMoney(product.price, product.currency));
        old.setAttribute("aria-label", "بدلاً من " + old.textContent);
        prices.appendChild(old);
      }
      info.appendChild(prices);
      card.appendChild(info);
      item.appendChild(card);
      list.appendChild(item);
    });
    dialog.appendChild(list);

    // Call to action: first product with a link, otherwise just close
    var firstUrl = null;
    (campaign.products || []).some(function (p) {
      firstUrl = safeUrl(p.url);
      return Boolean(firstUrl);
    });
    var cta = el(firstUrl ? "a" : "button", "cta", design.buttonText);
    if (firstUrl) cta.href = firstUrl;
    else {
      cta.type = "button";
      cta.addEventListener("click", close);
    }
    dialog.appendChild(cta);

    overlay.appendChild(dialog);
    root.appendChild(overlay);

    if (options.preview) {
      // The dashboard preview must not navigate away
      dialog.addEventListener("click", function (event) {
        if (event.target.closest && event.target.closest("a")) {
          event.preventDefault();
        }
      });
    } else {
      // Click outside closes
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) close();
      });

      // Esc closes; Tab stays inside the dialog
      var onKey = function (event) {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
          return;
        }
        if (event.key !== "Tab") return;
        var focusables = dialog.querySelectorAll("a[href],button");
        if (!focusables.length) return;
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        var active = root.activeElement || document.activeElement;
        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      };
      document.addEventListener("keydown", onKey, true);
      cleanups.push(function () {
        document.removeEventListener("keydown", onKey, true);
      });
      closeButton.focus();
    }

    return { destroy: destroy, dialog: dialog };
  }

  // ---------------------------------------------------------------------
  // Frequency
  // ---------------------------------------------------------------------

  function storageFor(frequency) {
    try {
      return frequency === "session"
        ? window.sessionStorage
        : window.localStorage;
    } catch (e) {
      return null;
    }
  }

  function shouldShow(campaign, now) {
    var frequency = campaign.trigger && campaign.trigger.frequency;
    if (frequency === "always") return true;
    var store = storageFor(frequency);
    if (!store) return true;
    try {
      var seen = JSON.parse(store.getItem(SEEN_KEY) || "null");
      // A republished campaign (new updatedAt) is shown again
      if (!seen || seen.version !== campaign.updatedAt) return true;
      if (frequency === "day") return now - seen.at > 24 * 60 * 60 * 1000;
      return false; // session: already seen in this tab session
    } catch (e) {
      return true;
    }
  }

  function markShown(campaign, now) {
    var frequency = campaign.trigger && campaign.trigger.frequency;
    if (frequency === "always") return;
    var store = storageFor(frequency);
    try {
      if (store) {
        store.setItem(
          SEEN_KEY,
          JSON.stringify({ version: campaign.updatedAt, at: now }),
        );
      }
    } catch (e) {
      /* storage blocked: popup may show again, that's fine */
    }
  }

  // ---------------------------------------------------------------------
  // Storefront boot
  // ---------------------------------------------------------------------

  function readStoreId() {
    try {
      var salla = window.salla;
      var id = salla && salla.config && salla.config.get("store.id");
      return id ? String(id) : null;
    } catch (e) {
      return null;
    }
  }

  function waitForStoreId(timeoutMs) {
    return new Promise(function (resolve) {
      var started = Date.now();
      (function poll() {
        var id = readStoreId();
        if (id || Date.now() - started > timeoutMs) return resolve(id);
        setTimeout(poll, 200);
      })();
    });
  }

  function show(campaign) {
    if (document.getElementById(HOST_ID)) return;
    var host = document.createElement("div");
    host.id = HOST_ID;
    document.body.appendChild(host);
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var previousFocus = document.activeElement;
    render(root, campaign, {
      onClose: function () {
        host.remove();
        if (previousFocus && previousFocus.focus) previousFocus.focus();
      },
    });
    markShown(campaign, Date.now());
  }

  /**
   * @param {{ origin?: string, storeIdTimeoutMs?: number }} [options]
   */
  function boot(options) {
    options = options || {};
    var origin = options.origin || ORIGIN;
    var timeout = options.storeIdTimeoutMs || STORE_ID_TIMEOUT_MS;
    return waitForStoreId(timeout).then(function (storeId) {
      if (!storeId || !origin) return null;
      return fetch(
        origin +
          "/api/storefront-campaign?store=" +
          encodeURIComponent(storeId),
        { credentials: "omit" },
      )
        .then(function (response) {
          return response.ok ? response.json() : null;
        })
        .then(function (payload) {
          var campaign = payload && payload.campaign;
          if (!campaign || new Date(campaign.endsAt).getTime() <= Date.now()) {
            return null;
          }
          if (!shouldShow(campaign, Date.now())) return null;
          var delay = (campaign.trigger && campaign.trigger.delaySeconds) || 0;
          setTimeout(function () {
            show(campaign);
          }, delay * 1000);
          return campaign;
        })
        .catch(function () {
          return null; // Never break the store
        });
    });
  }

  window.SallaPromoCampaign = {
    version: 1,
    render: render,
    boot: boot,
    shouldShow: shouldShow,
    markShown: markShown,
  };

  // Auto-start only when loaded by a <script> tag in the store (the snippet),
  // not in the dashboard preview (data-mode="preview") or when imported.
  var isPreview = SCRIPT && SCRIPT.getAttribute("data-mode") === "preview";
  if (SCRIPT && !isPreview) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }
})();
