import Icon from "../Icon.jsx";
import Button from "../forms/Button.jsx";

const numberFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});
const percentFormat = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 0,
});

const TYPE_CONFIG = {
  clearance: {
    icon: "snow",
    badgeClass: "badge-clearance",
    actionLabel: "تطبيق الخصم في المتجر",
  },
  bundle: {
    icon: "gift",
    badgeClass: "badge-bundle",
    actionLabel: "تفاصيل الحزمة",
  },
  volume: {
    icon: "discount",
    badgeClass: "badge-volume",
    actionLabel: "تفاصيل عرض الكمية",
  },
  flash: {
    icon: "flash",
    badgeClass: "badge-flash",
    actionLabel: "تفعيل الخصم الخاطف",
  },
  custom: {
    icon: "sparkles",
    badgeClass: "badge-custom",
    actionLabel: "تفاصيل العرض",
  },
};

export default function CampaignCard({
  campaign,
  currency = "ر.س",
  onViewDetails,
  onQuickCopy,
  onApplyToStore,
  isApplying = false,
}) {
  const config = TYPE_CONFIG[campaign.type] || TYPE_CONFIG.custom;
  const isDirectApplicable = campaign.canApplyDirectly && onApplyToStore;

  const resolvedCurrency = currency || "ر.س";

  return (
    <article className={`campaign-card campaign-card-${campaign.type || "default"}`}>
      <div className="campaign-card-header">
        <div className="campaign-badge-wrap">
          <span className={`campaign-type-badge ${config.badgeClass}`}>
            <Icon name={config.icon} size={14} />
            {campaign.badgeText}
          </span>
          {campaign.suggestedCode && (
            <span className="campaign-code-tag">
              كود: <code>{campaign.suggestedCode}</code>
            </span>
          )}
        </div>
        {campaign.urgency === "high" && (
          <span className="campaign-urgency-badge" title="أولوية مرتفعة لسرعة تحرير السيولة">
            <Icon name="fire" size={13} />
            أولوية مرتفعة
          </span>
        )}
      </div>

      <div className="campaign-card-body">
        <h3 className="campaign-card-title">{campaign.title}</h3>
        <p className="campaign-card-desc">{campaign.description}</p>

        {/* Products thumbnails / summary */}
        <div className="campaign-products-preview">
          {campaign.products?.map((prod) => (
            <div key={prod.id} className="campaign-product-item">
              {prod.main_image || prod.image ? (
                <img
                  src={prod.main_image || prod.image}
                  alt={prod.name}
                  className="campaign-product-thumb"
                  loading="lazy"
                />
              ) : (
                <div className="campaign-product-thumb placeholder">
                  <Icon name="package" size={16} />
                </div>
              )}
              <span className="campaign-product-name" title={prod.name}>
                {prod.name}
              </span>
            </div>
          ))}
        </div>

        {/* Financial Metrics Strip */}
        <div className="campaign-metrics-strip">
          <div className="metric-pill price-pill">
            <span className="metric-old-price">
              {numberFormat.format(campaign.originalPrice)} {resolvedCurrency}
            </span>
            <span className="metric-new-price">
              {numberFormat.format(campaign.discountedPrice)} {resolvedCurrency}
            </span>
          </div>

          <div className="metric-pill savings-pill">
            <span className="metric-label">التوفير</span>
            <span className="metric-value">
              {numberFormat.format(campaign.savingsAmount)} {resolvedCurrency} (
              {campaign.discountPercent}%)
            </span>
          </div>

          {campaign.estimatedMargin !== null && (
            <div className="metric-pill margin-pill">
              <span className="metric-label">هامش الربح</span>
              <span
                className={`metric-margin-value ${
                  campaign.estimatedMargin < 0.15 ? "thin" : "good"
                }`}
              >
                {percentFormat.format(campaign.estimatedMargin)}
              </span>
            </div>
          )}

          {campaign.unlockedCapital && (
            <div className="metric-pill capital-pill">
              <span className="metric-label">سيولة مستردة</span>
              <span className="metric-value">
                {numberFormat.format(campaign.unlockedCapital)} {resolvedCurrency}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="campaign-card-actions">
        <Button
          variant="primary"
          size="small"
          onClick={() => onViewDetails(campaign)}
        >
          <Icon name="sparkles" size={14} />
          معاينة وتخصيص
        </Button>

        <Button
          variant="default"
          size="small"
          onClick={() => onQuickCopy(campaign)}
          title="نسخ نص الإعلان لواتساب وشبكات التواصل"
        >
          <Icon name="copy" size={14} />
          نسخ الإعلان
        </Button>

        {isDirectApplicable && (
          <Button
            variant="success"
            size="small"
            disabled={isApplying}
            onClick={() => onApplyToStore(campaign)}
            title="تحديث سعر بيع المنتج مباشرة في سلة"
          >
            <Icon name="checkBadge" size={14} />
            {isApplying ? "جارٍ التحديث..." : "تطبيق السعر في المتجر"}
          </Button>
        )}
      </div>
    </article>
  );
}
