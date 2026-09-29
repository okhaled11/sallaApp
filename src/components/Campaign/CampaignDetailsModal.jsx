import { useState, useEffect, useRef } from "react";
import Icon from "../Icon.jsx";
import Button from "../forms/Button.jsx";
import {
  generateMarketingCopy,
  generateSallaInstructions,
} from "../../utils/campaignEngine.js";

const numberFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});
const percentFormat = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 1,
});

export default function CampaignDetailsModal({
  isOpen,
  onClose,
  campaign,
  currency = "ر.س",
  onApplyToStore,
  isApplying = false,
  onSaveToActive,
  isSaved = false,
  showToast,
}) {
  const modalRef = useRef(null);
  const [activeTab, setActiveTab] = useState("preview"); // 'preview' | 'copy' | 'guide' | 'finance'
  const [copyTab, setCopyTab] = useState("whatsapp"); // 'whatsapp' | 'social' | 'banner'
  const [copiedKey, setCopiedKey] = useState(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !campaign) return null;

  const marketingCopies = generateMarketingCopy(campaign, currency);
  const sallaGuide = generateSallaInstructions(campaign);

  const handleCopyText = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    if (showToast) {
      showToast("تم نسخ النص الإعلاني إلى الحافظة بنجاح!", "success");
    }
    setTimeout(() => {
      setCopiedKey(null);
    }, 2500);
  };

  const resolvedCurrency = currency || "ر.س";

  return (
    <div
      className="report-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="report-modal-content campaign-modal-content"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-modal-title"
      >
        {/* Header */}
        <div className="report-modal-header campaign-modal-header">
          <div className="campaign-modal-title-wrap">
            <span className="stats-icon-badge campaign-icon-badge">
              <Icon name="sparkles" size={20} />
            </span>
            <div>
              <h2 id="campaign-modal-title" className="report-modal-title">
                {campaign.title}
              </h2>
              <span className="panel-subtitle">
                {campaign.badgeText} • كود الخصم:{" "}
                <code>{campaign.suggestedCode || "PROMO"}</code>
              </span>
            </div>
          </div>
          <button
            type="button"
            className="report-modal-close"
            onClick={onClose}
            aria-label="إغلاق"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="campaign-modal-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "preview"}
            className={`stats-tab-btn ${activeTab === "preview" ? "active" : ""}`}
            onClick={() => setActiveTab("preview")}
          >
            <Icon name="bag" size={14} />
            معاينة واجهة المتجر
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "copy"}
            className={`stats-tab-btn ${activeTab === "copy" ? "active" : ""}`}
            onClick={() => setActiveTab("copy")}
          >
            <Icon name="copy" size={14} />
            النصوص الإعلانية الجاهزة
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "finance"}
            className={`stats-tab-btn ${activeTab === "finance" ? "active" : ""}`}
            onClick={() => setActiveTab("finance")}
          >
            <Icon name="analytics" size={14} />
            الجدوى المالية وهامش الربح
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "guide"}
            className={`stats-tab-btn ${activeTab === "guide" ? "active" : ""}`}
            onClick={() => setActiveTab("guide")}
          >
            <Icon name="checklist" size={14} />
            خطوات التفعيل في سلة
          </button>
        </div>

        {/* Modal Body */}
        <div className="campaign-modal-body">
          {/* TAB 1: STOREFRONT PREVIEW */}
          {activeTab === "preview" && (
            <div className="preview-tab-pane">
              <div className="preview-section-title">
                <h4>محاكاة ظهور العرض لعملاء المتجر</h4>
                <p>هكذا سيظهر العرض المحفز للزبائن لزيادة معدل الشراء وإتمام الطلب</p>
              </div>

              {/* Announcement Bar Mockup */}
              <div className="storefront-mockup-wrapper">
                <div className="storefront-bar-label">
                  <span>شريط إعلانات المتجر العلوي (Announcement Bar)</span>
                </div>
                <div className="storefront-bar-preview">
                  <div className="storefront-bar-badge">
                    <Icon name="flash" size={14} />
                    عرض خاص
                  </div>
                  <span className="storefront-bar-text">
                    {marketingCopies.banner}
                  </span>
                  <button
                    type="button"
                    className="storefront-bar-cta"
                    onClick={() =>
                      handleCopyText(
                        campaign.suggestedCode || "PROMO",
                        "banner-code",
                      )
                    }
                  >
                    نسخ الكود
                  </button>
                </div>
              </div>

              {/* Offer Card Mockup */}
              <div className="storefront-card-preview">
                <div className="storefront-card-header">
                  <span className="storefront-pill-highlight">
                    <Icon name="gift" size={14} />
                    {campaign.badgeText}
                  </span>
                  <span className="storefront-save-badge">
                    وفر {numberFormat.format(campaign.savingsAmount)}{" "}
                    {resolvedCurrency}
                  </span>
                </div>

                <div className="storefront-bundle-items">
                  {campaign.products?.map((p, idx) => (
                    <div key={p.id} className="storefront-item-row">
                      <div className="storefront-item-avatar">
                        {p.main_image || p.image ? (
                          <img src={p.main_image || p.image} alt={p.name} />
                        ) : (
                          <Icon name="package" size={18} />
                        )}
                      </div>
                      <div className="storefront-item-info">
                        <strong>{p.name}</strong>
                        <span className="storefront-item-orig">
                          {numberFormat.format(p.price)} {resolvedCurrency}
                        </span>
                      </div>
                      {idx < campaign.products.length - 1 && (
                        <div className="storefront-plus-sign">+</div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="storefront-card-footer">
                  <div className="storefront-pricing">
                    <span className="old-total">
                      {numberFormat.format(campaign.originalPrice)}{" "}
                      {resolvedCurrency}
                    </span>
                    <span className="new-total">
                      {numberFormat.format(campaign.discountedPrice)}{" "}
                      {resolvedCurrency}
                    </span>
                  </div>
                  <button type="button" className="storefront-btn-buy">
                    <Icon name="bag" size={16} />
                    إضافة العرض للسلة
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MARKETING COPY */}
          {activeTab === "copy" && (
            <div className="copy-tab-pane">
              <div className="copy-subtabs" role="tablist">
                <button
                  type="button"
                  className={`copy-subtab-btn ${copyTab === "whatsapp" ? "active" : ""}`}
                  onClick={() => setCopyTab("whatsapp")}
                >
                  رسالة واتساب / SMS
                </button>
                <button
                  type="button"
                  className={`copy-subtab-btn ${copyTab === "social" ? "active" : ""}`}
                  onClick={() => setCopyTab("social")}
                >
                  منشور إنستقرام وسناب شات
                </button>
                <button
                  type="button"
                  className={`copy-subtab-btn ${copyTab === "banner" ? "active" : ""}`}
                  onClick={() => setCopyTab("banner")}
                >
                  نص شريط الإعلانات
                </button>
              </div>

              <div className="copy-content-box">
                <pre className="copy-text-area">
                  {marketingCopies[copyTab]}
                </pre>
                <div className="copy-actions-row">
                  <Button
                    variant="primary"
                    onClick={() =>
                      handleCopyText(marketingCopies[copyTab], copyTab)
                    }
                  >
                    <Icon
                      name={copiedKey === copyTab ? "checkBadge" : "copy"}
                      size={16}
                    />
                    {copiedKey === copyTab ? "تم النسخ!" : "نسخ النص الإعلاني"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: FINANCIAL BREAKDOWN */}
          {activeTab === "finance" && (
            <div className="finance-tab-pane">
              <div className="finance-summary-grid">
                <div className="stat-card">
                  <span className="stat-card-title">السعر الأصلي</span>
                  <div className="stat-card-value">
                    {numberFormat.format(campaign.originalPrice)}{" "}
                    <small>{resolvedCurrency}</small>
                  </div>
                </div>

                <div className="stat-card">
                  <span className="stat-card-title">سعر العرض المخفض</span>
                  <div className="stat-card-value stat-val-success">
                    {numberFormat.format(campaign.discountedPrice)}{" "}
                    <small>{resolvedCurrency}</small>
                  </div>
                </div>

                <div className="stat-card">
                  <span className="stat-card-title">قيمة التوفير للعميل</span>
                  <div className="stat-card-value">
                    {numberFormat.format(campaign.savingsAmount)}{" "}
                    <small>{resolvedCurrency}</small>
                    <span className="stat-badge">
                      {campaign.discountPercent}%
                    </span>
                  </div>
                </div>

                {campaign.estimatedMargin !== null && (
                  <div className="stat-card">
                    <span className="stat-card-title">هامش الربح المتوقع</span>
                    <div className="stat-card-value">
                      {percentFormat.format(campaign.estimatedMargin)}
                    </div>
                  </div>
                )}

                {campaign.unlockedCapital && (
                  <div className="stat-card">
                    <span className="stat-card-title">السيولة المستردة</span>
                    <div className="stat-card-value stat-val-info">
                      {numberFormat.format(campaign.unlockedCapital)}{" "}
                      <small>{resolvedCurrency}</small>
                    </div>
                  </div>
                )}
              </div>

              <div className="finance-table-wrap">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>المنتج</th>
                      <th>السعر الفردي</th>
                      <th>سعر التكلفة</th>
                      <th>المخزون المتوفر</th>
                      <th>المبيعات السابقة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaign.products?.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          {p.sku && <small className="sku-tag"> ({p.sku})</small>}
                        </td>
                        <td>
                          {numberFormat.format(p.price)} {resolvedCurrency}
                        </td>
                        <td>
                          {p.cost_price
                            ? `${numberFormat.format(p.cost_price)} ${resolvedCurrency}`
                            : "غير مسجل"}
                        </td>
                        <td>{p.quantity ?? "—"}</td>
                        <td>{p.sold_quantity ?? 0} قطعة</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: SALLA SETUP GUIDE */}
          {activeTab === "guide" && (
            <div className="guide-tab-pane">
              <div className="guide-alert-box">
                <Icon name="help" size={20} />
                <div>
                  <strong>خطوات تفعيل العرض في متجرك على منصة سلة</strong>
                  <p>
                    يمكنك إعداد الكوبون أو العرض في لوحة تحكم سلة باتباع الخطوات
                    التالية:
                  </p>
                </div>
              </div>

              <ol className="salla-steps-list">
                {sallaGuide.map((step, i) => (
                  <li key={i} className="salla-step-item">
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="report-modal-footer campaign-modal-footer">
          <div className="footer-left-actions">
            {campaign.canApplyDirectly && onApplyToStore && (
              <Button
                variant="success"
                disabled={isApplying}
                onClick={() => onApplyToStore(campaign)}
              >
                <Icon name="checkBadge" size={16} />
                {isApplying
                  ? "جارٍ تحديث السعر في سلة..."
                  : "تطبيق السعر المخفض في المتجر الآن"}
              </Button>
            )}

            {onSaveToActive && (
              <Button
                variant={isSaved ? "default" : "accent"}
                onClick={() => onSaveToActive(campaign)}
              >
                <Icon name="sparkles" size={16} />
                {isSaved ? "محفوظ في العروض النشطة ✓" : "حفظ في العروض النشطة"}
              </Button>
            )}
          </div>

          <Button variant="default" onClick={onClose}>
            إغلاق
          </Button>
        </div>
      </div>
    </div>
  );
}
