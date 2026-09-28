import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { DEMO_CART } from "./incentiveDefaults.js";

const arNumber = new Intl.NumberFormat("en-US");

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function FreeShippingBar({ total, threshold, currency }) {
  const remaining = Math.max(0, threshold - total);
  const progress = threshold > 0 ? Math.min(total / threshold, 1) : 1;

  return (
    <div className="preview-box">
      {remaining > 0 ? (
        <p className="preview-shipping-text">
          باقي <strong>{arNumber.format(remaining)}</strong> {currency} وتحصل
          على شحن مجاني
        </p>
      ) : (
        <p className="preview-shipping-text preview-shipping-done">
          مبروك! طلبك مؤهل للشحن المجاني
        </p>
      )}
      <div
        className="preview-bar"
        role="progressbar"
        aria-label="Free shipping progress"
        aria-valuemin={0}
        aria-valuemax={threshold}
        aria-valuenow={Math.min(total, threshold)}
      >
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="preview-bar-scale">
        <span>0</span>
        <span>
          {arNumber.format(threshold)} {currency}
        </span>
      </div>
    </div>
  );
}

function Countdown({ endsAt }) {
  const [now, setNow] = useState(() => Date.now());
  const end = new Date(endsAt).getTime();
  const remaining = end - now;

  useEffect(() => {
    if (!(end > Date.now())) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [end]);

  if (!Number.isFinite(end) || remaining <= 0) {
    return (
      <p className="preview-countdown preview-countdown-ended">انتهى العرض</p>
    );
  }

  return (
    <p className="preview-countdown">
      ينتهي العرض خلال{" "}
      <time className="preview-countdown-time" dir="ltr">
        {formatRemaining(remaining)}
      </time>
    </p>
  );
}

function CouponCard({ code, text, floating, onClose }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked in this frame: nothing to do */
    }
  };

  return (
    <div
      className={`preview-coupon ${floating ? "preview-coupon-floating" : ""}`}
    >
      <div>
        <span className="preview-coupon-label">كوبون لك</span>
        <p className="preview-coupon-text">{text}</p>
      </div>
      <button
        type="button"
        className="preview-coupon-code"
        onClick={copy}
        title="نسخ الكود"
      >
        {copied ? "تم النسخ" : code}
      </button>
      {floating && (
        <button
          type="button"
          className="preview-coupon-close"
          onClick={onClose}
          aria-label="إغلاق"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * Live preview of the cart incentives on a demo cart (what the customer sees).
 */
export default function IncentivePreview({ settings }) {
  const { freeShipping, countdown, coupon, lowStock } = settings;
  const [added, setAdded] = useState(0);
  const [popupClosed, setPopupClosed] = useState(false);

  const total = DEMO_CART.baseTotal + added;
  const { lowStockItem, currency } = DEMO_CART;
  const showLowStock =
    lowStock.enabled && lowStockItem.stock <= lowStock.threshold;
  const showCoupon = coupon.enabled && coupon.code.trim() !== "";
  const floatingCoupon = coupon.display === "popup";

  // Re-show the popup when the merchant switches it back on
  useEffect(() => {
    setPopupClosed(false);
  }, [coupon.display, coupon.enabled]);

  return (
    <div className="incentive-preview" dir="rtl" lang="ar">
      <div className="preview-cart">
        <div className="preview-cart-header">
          <span>سلتك</span>
          <strong>
            {arNumber.format(total)} {currency}
          </strong>
        </div>

        {freeShipping.enabled && (
          <FreeShippingBar
            total={total}
            threshold={freeShipping.threshold}
            currency={currency}
          />
        )}

        {countdown.enabled && <Countdown endsAt={countdown.endsAt} />}

        <div className="preview-addons">
          {DEMO_CART.addOns.map((item) => (
            <button
              key={item.id}
              type="button"
              className="preview-addon"
              onClick={() => setAdded((value) => value + item.price)}
            >
              {item.name}
              <span className="preview-addon-price">+{item.price}</span>
            </button>
          ))}
          <button
            type="button"
            className="preview-addon preview-addon-reset"
            onClick={() => setAdded(0)}
            disabled={added === 0}
          >
            إعادة
          </button>
        </div>

        {showLowStock && (
          <p className="preview-low-stock">
            باقي {lowStockItem.stock} قطع بس من {lowStockItem.name}!
          </p>
        )}

        {showCoupon && !floatingCoupon && (
          <CouponCard code={coupon.code} text={coupon.text} />
        )}
      </div>

      {showCoupon && floatingCoupon && !popupClosed && (
        <CouponCard
          code={coupon.code}
          text={coupon.text}
          floating
          onClose={() => setPopupClosed(true)}
        />
      )}

      <p className="preview-hint">
        اضغط منتج إضافي عشان يمتلي الشريط · سلة تجريبية
      </p>
    </div>
  );
}
