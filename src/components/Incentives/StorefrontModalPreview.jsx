import { useState } from "react";
import Icon from "../Icon.jsx";

/**
 * Interactive Storefront Incentive Modal Preview
 * Matches Salla's exact brand aesthetic and demonstrates how the popup appears
 * to 3x non-purchasing visitors in the merchant's store.
 */
export default function StorefrontModalPreview({
  config,
  onApplyDiscount,
  onClose,
  isLiveSimulation = false,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopyOrApply = () => {
    navigator.clipboard?.writeText?.(config.couponCode);
    setCopied(true);
    onApplyDiscount?.(config.couponCode);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      className={`storefront-modal-backdrop ${
        isLiveSimulation ? "simulation-mode" : "preview-mode"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="storefront-modal-title"
    >
      <div
        className="storefront-modal-card"
        style={{
          borderColor: config.accentColor || "#73fcd7",
        }}
      >
        {/* Header Header Banner */}
        <div
          className="storefront-modal-header"
          style={{
            backgroundColor: config.primaryColor || "#004d5b",
          }}
        >
          {onClose && (
            <button
              type="button"
              className="storefront-modal-close-btn"
              onClick={onClose}
              aria-label="إغلاق النافذة"
            >
              <Icon name="close" size={16} />
            </button>
          )}

          <div
            className="storefront-modal-gift-icon"
            style={{
              backgroundColor: config.accentColor || "#73fcd7",
              color: config.primaryColor || "#004d5b",
            }}
          >
            <Icon name={config.giftIcon || "gift"} size={26} />
          </div>

          <h3 id="storefront-modal-title" className="storefront-modal-headline">
            {(config.headline || "سعداء بزيارتك المتكررة لمتجرنا!")
              .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
              .trim()}
          </h3>
          <p className="storefront-modal-message">
            {config.message ||
              "لاحظنا اهتمامك بمنتجاتنا المميزة! يسعدنا تقديم خصم حصري لتكمل طلبك وتستمتع بتجربة تسوق فريدة."}
          </p>
        </div>

        {/* Modal Body */}
        <div className="storefront-modal-body">
          {/* Coupon Display Box */}
          <div
            className="storefront-coupon-box"
            style={{
              borderColor: config.primaryColor || "#004d5b",
            }}
          >
            <span className="storefront-coupon-caption">
              {config.couponCaption ?? "كود الخصم الحصري لك:"}
            </span>
            <div className="storefront-coupon-row">
              <span
                className="storefront-coupon-code"
                style={{
                  color: config.primaryColor || "#004d5b",
                }}
              >
                {config.couponCode}
              </span>
              <span
                className="storefront-discount-badge"
                style={{
                  backgroundColor: config.accentColor || "#73fcd7",
                  color: config.primaryColor || "#004d5b",
                }}
              >
                خصم {config.discountValue}%
              </span>
            </div>
            {config.showCountdown && (
              <div className="storefront-countdown-hint">
                <span className="countdown-pulse-dot" />
                <span>
                  ينتهي العرض خلال {config.countdownMinutes || 15} دقيقة
                </span>
              </div>
            )}
          </div>

          {/* Action CTA Button */}
          <button
            type="button"
            className="btn-storefront-apply"
            style={{
              backgroundColor: config.primaryColor || "#004d5b",
            }}
            onClick={handleCopyOrApply}
          >
            {copied ? (
              <>
                <Icon name="checkCircle" size={18} />
                <span>تم نسخ الكود وتطبيقه بنجاح!</span>
              </>
            ) : (
              <>
                <Icon name="bag" size={18} />
                <span>
                  {(config.ctaText || "تطبيق الخصم وإكمال الطلب")
                    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
                    .trim()}
                </span>
              </>
            )}
          </button>

          {/* Dismiss button */}
          <button
            type="button"
            className="btn-storefront-dismiss"
            onClick={onClose}
          >
            {config.dismissText ?? "متابعة التصفح"}
          </button>

          {/* Brand trust watermark */}
          <div className="storefront-trust-footer">
            <span>مدعوم من منصة سلة • كود موثوق ومعتمد في سلة المشتريات</span>
          </div>
        </div>
      </div>
    </div>
  );
}
