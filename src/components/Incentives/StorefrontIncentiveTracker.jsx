import { useEffect } from "react";
import { DEFAULT_INCENTIVE_CONFIG } from "../../utils/visitorIncentives.js";

/**
 * StorefrontIncentiveTracker Component
 * Safely runs the storefront visitor tracking and 3-visits discount modal
 * directly inside React/JSX apps without syntax errors.
 */
export default function StorefrontIncentiveTracker({
  config = DEFAULT_INCENTIVE_CONFIG,
}) {
  useEffect(() => {
    if (!config.enabled || typeof window === "undefined") return;

    function loadScript(src) {
      return new Promise((resolve, reject) => {
        if (window.Ably) return resolve();
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    function getProductIdFromUrl() {
      const match = window.location.pathname.match(/\/p(\d+)/);
      return match ? match[1] : null;
    }

    const storeId =
      window.salla?.config?.get?.("store.id") || "salla-store-main";
    const STORAGE_KEY = `_salla_visits_${storeId}`;
    const MODAL_SHOWN_KEY = `_salla_modal_shown_${storeId}`;
    const now = Date.now();
    const windowMs = (config.timeWindowMinutes || 60) * 60 * 1000;
    const productId = getProductIdFromUrl();
    const clientId = `visitor-${Math.random().toString(36).slice(2)}`;

    // Record visitor entry & filter within time window
    let history = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) history = JSON.parse(raw);
    } catch {
      history = [];
    }

    history = history.filter((ts) => now - ts <= windowMs);
    history.push(now);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
      // ignore
    }

    // Sync into dashboard log
    try {
      const DASH_LOG_KEY = "_salla_frequent_visitors_log";
      const rawLog = localStorage.getItem(DASH_LOG_KEY);
      const dashList = rawLog ? JSON.parse(rawLog) : [];
      const existing = dashList.find((item) => item.id === clientId);
      if (existing) {
        existing.visitCount = history.length;
        existing.visitTimestamps = history;
        existing.isOnline = true;
        existing.lastVisitedAgo = "متصل الآن (المتجر)";
        existing.timeSpanText = `${history.length} زيارات خلال وقت متقارب`;
        if (history.length >= (config.minVisits || 3)) {
          existing.status = "qualified";
        }
      } else {
        dashList.unshift({
          id: clientId,
          name: `زائر متجر سلة (#${clientId.slice(-4)})`,
          visitorType: "guest",
          city: "متصفح حقيقي",
          device:
            typeof navigator !== "undefined" &&
            /Mobile|Android|iPhone/i.test(navigator.userAgent)
              ? "جوال (سلة)"
              : "متصفح ويب",
          visitCount: 1,
          isOnline: true,
          visitTimestamps: history,
          purchasesCount: 0,
          cartItemsCount: 0,
          cartValue: 0,
          viewedProducts: [
            productId ? `منتج رقم ${productId}` : "واجهة المتجر",
          ],
          status: "watching",
          lastVisitedAgo: "متصل الآن",
          timeSpanText: "زيارة أولى بالمتجر",
        });
      }
      localStorage.setItem(DASH_LOG_KEY, JSON.stringify(dashList.slice(0, 50)));
    } catch {
      // ignore
    }

    const visitCount = history.length;
    const hasPurchased = document.cookie.indexOf("salla_has_ordered=1") !== -1;
    const alreadyShown = sessionStorage.getItem(MODAL_SHOWN_KEY);

    // Ably Presence connect
    loadScript(config.ablyCdn || "https://cdn.ably.com/lib/ably.min-2.js")
      .then(() => {
        if (!window.Ably) return;
        const realtime = new window.Ably.Realtime({
          authCallback: (params, callback) => {
            fetch(config.tokenEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ storeId, productId, clientId }),
            })
              .then((res) => res.json())
              .then((token) => callback(null, token))
              .catch((err) => callback(err, null));
          },
        });

        const storeChannel = realtime.channels.get(`presence:store:${storeId}`);
        storeChannel.presence
          .enter({
            clientId,
            visitCount,
            isQualified: visitCount >= (config.minVisits || 3),
            productId,
            pathname: window.location.pathname,
            timestamp: now,
          })
          .catch(() => {});
      })
      .catch(() => {});

    // Trigger modal if qualified
    if (
      visitCount >= (config.minVisits || 3) &&
      !hasPurchased &&
      !alreadyShown
    ) {
      const timer = setTimeout(() => {
        showIncentiveModal();
      }, 1500);
      return () => clearTimeout(timer);
    }

    function showIncentiveModal() {
      sessionStorage.setItem(MODAL_SHOWN_KEY, "true");
      const existing = document.getElementById("salla-freq-visitor-modal");
      if (existing) existing.remove();

      const overlay = document.createElement("div");
      overlay.id = "salla-freq-visitor-modal";
      overlay.style.cssText =
        "position:fixed;inset:0;background:rgba(0,30,36,0.65);backdrop-filter:blur(5px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:16px;font-family:PingARLT,system-ui,sans-serif;direction:rtl;";

      const primaryCol = config.primaryColor || "#004d5b";
      const accentCol = config.accentColor || "#73fcd7";
      const emoji = config.giftEmoji || "🎁";
      const caption = config.couponCaption || "كود الخصم الحصري لك:";

      const card = document.createElement("div");
      card.style.cssText = `background:#ffffff;border-radius:20px;max-width:440px;width:100%;box-shadow:0 20px 45px rgba(0,77,91,0.25);border:2px solid ${accentCol};overflow:hidden;animation:popIn 0.3s cubic-bezier(0.16,1,0.3,1);`;

      card.innerHTML = `
        <div style="background:${primaryCol};padding:24px 20px;text-align:center;color:#ffffff;position:relative;">
          <button id="salla-modal-close" style="position:absolute;top:14px;left:14px;background:none;border:none;color:#ffffff;font-size:20px;cursor:pointer;opacity:0.8;">✕</button>
          <div style="width:52px;height:52px;border-radius:50%;background:${accentCol};color:${primaryCol};display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:12px;font-weight:bold;">${emoji}</div>
          <h3 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#ffffff;">${config.headline}</h3>
          <p style="margin:0;font-size:13px;opacity:0.92;line-height:1.5;color:#ffffff;">${config.message}</p>
        </div>
        <div style="padding:20px;background:#f8f8f8;text-align:center;">
          <div style="background:#ffffff;border:2px dashed ${primaryCol};border-radius:12px;padding:12px;margin-bottom:16px;">
            <span style="font-size:12px;color:#374151;font-weight:600;display:block;margin-bottom:4px;">${caption}</span>
            <span style="font-size:22px;font-weight:800;letter-spacing:2px;color:${primaryCol};font-family:monospace;">${config.couponCode}</span>
            <span style="display:inline-block;background:${accentCol};color:${primaryCol};font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;margin-right:8px;">خصم ${config.discountValue}%</span>
          </div>
          <button id="salla-modal-apply" style="width:100%;padding:14px;background:${primaryCol};color:#ffffff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,77,91,0.25);">
            ${config.ctaText}
          </button>
          <button id="salla-modal-dismiss" style="margin-top:10px;background:none;border:none;color:#374151;font-size:13px;font-weight:600;cursor:pointer;text-decoration:underline;">
            ${config.dismissText || "متابعة التصفح"}
          </button>
        </div>
      `;

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      const dismiss = () => overlay.remove();
      document.getElementById("salla-modal-close").onclick = dismiss;
      document.getElementById("salla-modal-dismiss").onclick = dismiss;
      document.getElementById("salla-modal-apply").onclick = function () {
        if (
          window.salla &&
          window.salla.cart &&
          (window.salla.cart.addCoupon || window.salla.cart.applyCoupon)
        ) {
          (window.salla.cart.addCoupon || window.salla.cart.applyCoupon)
            .call(window.salla.cart, config.couponCode)
            .then(() => {
              window.location.href = "/cart";
            })
            .catch(() => {
              navigator.clipboard?.writeText?.(config.couponCode);
              window.location.href = "/cart";
            });
        } else {
          navigator.clipboard?.writeText?.(config.couponCode);
          this.innerText = "تم نسخ الكود! جارٍ التحويل...";
          setTimeout(() => {
            window.location.href = "/cart";
          }, 1000);
        }
      };
    }
  }, [config]);

  return null; // Headless tracker component
}
