import { useState } from "react";
import Icon from "../Icon.jsx";
import { OPPORTUNITY_TYPES } from "../../utils/copilotEngine.js";

/**
 * OpportunityCard - Individual AI recommendation card with 1-click actions
 */
export default function OpportunityCard({
  opportunity,
  currency = "SAR",
  onApplyPrice,
  onOpenSeoModal,
  onEditProduct,
  onDismiss,
}) {
  const [isApplying, setIsApplying] = useState(false);

  if (!opportunity) return null;

  const {
    id,
    type,
    badge,
    priority,
    product,
    currentPrice,
    suggestedPrice,
    priceDiff,
    projectedGain,
    trappedCapital,
    quantity,
    rationale,
    actionType,
    actionLabel,
  } = opportunity;

  const handleApply = async () => {
    if (actionType === "update_price" && suggestedPrice && onApplyPrice) {
      setIsApplying(true);
      try {
        await onApplyPrice(product.id, suggestedPrice);
      } finally {
        setIsApplying(false);
      }
    } else if (actionType === "preview_copy" && onOpenSeoModal) {
      onOpenSeoModal(opportunity);
    } else if (actionType === "edit_product" && onEditProduct) {
      onEditProduct(product);
    }
  };

  const getPriorityClass = () => {
    if (priority === "urgent") return "priority-urgent";
    if (priority === "high") return "priority-high";
    return "priority-medium";
  };

  const getTypeIcon = () => {
    switch (type) {
      case OPPORTUNITY_TYPES.PRICE_OPTIMIZATION:
        return "coins";
      case OPPORTUNITY_TYPES.SEO_COPYWRITING:
        return "magic";
      case OPPORTUNITY_TYPES.MARGIN_DEFENSE:
        return "alert";
      case OPPORTUNITY_TYPES.DEADSTOCK_REVIVAL:
        return "snow";
      case OPPORTUNITY_TYPES.STOCK_URGENCY:
        return "outOfStock";
      default:
        return "sparkles";
    }
  };

  return (
    <article
      className={`copilot-opp-card ${getPriorityClass()}`}
      data-testid={`copilot-card-${id}`}
    >
      <div className="copilot-card-header">
        <div className="copilot-badge-group">
          <span className={`copilot-type-badge badge-${type}`}>
            <Icon name={getTypeIcon()} size={14} />
            <span>{badge}</span>
          </span>
          {priority === "urgent" && (
            <span className="copilot-urgent-tag">عاجل ⚠️</span>
          )}
        </div>

        <button
          type="button"
          className="copilot-dismiss-btn"
          onClick={() => onDismiss && onDismiss(id)}
          title="تخطي هذه التوصية"
          aria-label="تخطي"
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className="copilot-card-product-info">
        {product?.mainImage ? (
          <img
            src={product.mainImage}
            alt={product.name}
            className="copilot-product-thumb"
            loading="lazy"
          />
        ) : (
          <div className="copilot-product-thumb-placeholder">
            <Icon name="package" size={20} />
          </div>
        )}

        <div className="copilot-product-details">
          <h4 className="copilot-product-title" title={product?.name}>
            {product?.name}
          </h4>
          <div className="copilot-product-meta">
            {product?.category && (
              <span className="copilot-meta-item">
                {typeof product.category === "string"
                  ? product.category
                  : product.category.name}
              </span>
            )}
            <span className="copilot-meta-item">
              السعر الحالي:{" "}
              <strong>
                {currentPrice} {currency}
              </strong>
            </span>
            <span className="copilot-meta-item">
              المبيعات: <strong>{product?.soldQuantity || 0}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Rationale explanation */}
      <div className="copilot-rationale-box">
        <p className="copilot-rationale-text">{rationale}</p>
      </div>

      {/* Financial or performance highlights */}
      <div className="copilot-card-metrics">
        {projectedGain > 0 && (
          <div className="copilot-metric-pill gain">
            <Icon name="analyticsUp" size={14} />
            <span>
              عائد متوقع: +{projectedGain.toLocaleString()} {currency}
            </span>
          </div>
        )}

        {suggestedPrice && (
          <div className="copilot-metric-pill suggested">
            <span>السعر المقترح:</span>
            <strong>
              {suggestedPrice} {currency}
            </strong>
            {priceDiff && priceDiff > 0 && (
              <span className="copilot-pill-diff">
                (+{priceDiff.toFixed(2)} {currency})
              </span>
            )}
          </div>
        )}

        {trappedCapital > 0 && (
          <div className="copilot-metric-pill warning">
            <span>سيولة محبوسة:</span>
            <strong>
              {trappedCapital.toLocaleString()} {currency} ({quantity} قطعة)
            </strong>
          </div>
        )}
      </div>

      {/* Action buttons footer */}
      <div className="copilot-card-actions">
        {actionType === "update_price" && (
          <button
            type="button"
            className="btn btn-primary copilot-action-btn"
            onClick={handleApply}
            disabled={isApplying}
          >
            {isApplying ? (
              <span>جاري التطبيق...</span>
            ) : (
              <>
                <Icon name="checkBadge" size={16} />
                <span>{actionLabel}</span>
              </>
            )}
          </button>
        )}

        {actionType === "preview_copy" && (
          <button
            type="button"
            className="btn btn-primary copilot-action-btn"
            onClick={handleApply}
          >
            <Icon name="magic" size={16} />
            <span>{actionLabel}</span>
          </button>
        )}

        {actionType === "edit_product" && (
          <button
            type="button"
            className="btn btn-primary copilot-action-btn"
            onClick={handleApply}
          >
            <Icon name="edit" size={16} />
            <span>{actionLabel}</span>
          </button>
        )}

        {onEditProduct && actionType !== "edit_product" && (
          <button
            type="button"
            className="btn btn-secondary copilot-edit-btn"
            onClick={() => onEditProduct(product)}
            title="تعديل المنتج يدوياً"
          >
            <Icon name="edit" size={14} />
            <span>تعديل يدوي</span>
          </button>
        )}
      </div>
    </article>
  );
}
