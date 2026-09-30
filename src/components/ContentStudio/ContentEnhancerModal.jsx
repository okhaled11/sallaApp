import { useState, useCallback } from "react";
import Icon from "../Icon.jsx";

export default function ContentEnhancerModal({
  analysis,
  onClose,
  showToast = () => {},
}) {
  const [copiedField, setCopiedField] = useState(null);

  const handleCopy = useCallback(
    async (text, fieldName) => {
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        }
        setCopiedField(fieldName);
        showToast("تم النسخ إلى الحافظة بنجاح", "success");
        setTimeout(() => setCopiedField(null), 2000);
      } catch {
        showToast("تعذر النسخ تلقائياً", "error");
      }
    },
    [showToast],
  );

  if (!analysis) return null;

  const {
    name,
    sku,
    image,
    score,
    statusLabel,
    checklist,
    issues,
    seo,
    copywriting,
  } = analysis;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="content-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content content-enhancer-modal">
        {/* Modal Header */}
        <div className="content-modal-header">
          <div className="content-modal-title-wrap">
            <div className="content-modal-img">
              {image ? (
                <img src={image} alt={name} />
              ) : (
                <div className="content-img-placeholder">
                  <Icon name="image" size={24} />
                </div>
              )}
            </div>
            <div>
              <div className="content-modal-badge-row">
                <span className={`content-badge ${analysis.status}`}>
                  {statusLabel} • {score}/100
                </span>
                {sku && <span className="sku-tag">SKU: {sku}</span>}
              </div>
              <h2 id="content-modal-title" className="content-modal-heading">
                {name}
              </h2>
            </div>
          </div>
          <button
            type="button"
            className="icon-button close-btn"
            onClick={onClose}
            aria-label="إغلاق"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="content-modal-body">
          {/* Section 1: Checklist & Issues */}
          <div className="content-section">
            <h3 className="section-title">
              <Icon name="checklist" size={16} /> فحص جاهزية المحتوى
            </h3>
            <div className="checklist-grid">
              <div
                className={`checklist-item ${checklist.hasImage ? "passed" : "failed"}`}
              >
                <Icon
                  name={checklist.hasImage ? "checkCircle" : "alert"}
                  size={16}
                />
                <span>الصورة الأساسية</span>
              </div>
              <div
                className={`checklist-item ${checklist.optimalTitle ? "passed" : "failed"}`}
              >
                <Icon
                  name={checklist.optimalTitle ? "checkCircle" : "alert"}
                  size={16}
                />
                <span>طول العنوان وسيو</span>
              </div>
              <div
                className={`checklist-item ${checklist.hasSku ? "passed" : "failed"}`}
              >
                <Icon
                  name={checklist.hasSku ? "checkCircle" : "alert"}
                  size={16}
                />
                <span>رمز التخزين SKU</span>
              </div>
              <div
                className={`checklist-item ${checklist.isCategorized ? "passed" : "failed"}`}
              >
                <Icon
                  name={checklist.isCategorized ? "checkCircle" : "alert"}
                  size={16}
                />
                <span>ربط التصنيف</span>
              </div>
            </div>

            {issues.length > 0 && (
              <div className="issues-alert-box">
                {issues.map((issue, idx) => (
                  <div key={idx} className="issue-row">
                    <Icon name="alert" size={14} className="issue-icon" />
                    <div>
                      <strong>{issue.label}: </strong>
                      <span>{issue.recommendation}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Google SERP Preview */}
          <div className="content-section">
            <div className="section-header-flex">
              <h3 className="section-title">
                <Icon name="globe" size={16} /> معاينة الظهور في بحث Google
              </h3>
              <span className="serp-badge">معاينة مباشرة</span>
            </div>
            <div className="google-serp-preview">
              <div className="serp-url">
                <span className="serp-site-name">متجرك الإلكتروني</span>
                <span className="serp-path">
                  https://store.salla.sa/products/{seo.slug}
                </span>
              </div>
              <div className="serp-title">{seo.metaTitle}</div>
              <div className="serp-snippet">{copywriting.metaDescription}</div>
            </div>
          </div>

          {/* Section 3: AI Copywriting & Enhancements */}
          <div className="content-section">
            <h3 className="section-title">
              <Icon name="sparkles" size={16} /> نصوص تسويقية مقترحة بنقرة زر
            </h3>

            {/* Title Improvement */}
            <div className="suggestion-box">
              <div className="suggestion-label">
                <span>العنوان التسويقي المقترح</span>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => handleCopy(copywriting.catchyTitle, "title")}
                >
                  <Icon
                    name={copiedField === "title" ? "checkCircle" : "copy"}
                    size={14}
                  />
                  <span>
                    {copiedField === "title" ? "تم النسخ" : "نسخ العنوان"}
                  </span>
                </button>
              </div>
              <p className="suggestion-text">{copywriting.catchyTitle}</p>
            </div>

            {/* Meta Description */}
            <div className="suggestion-box">
              <div className="suggestion-label">
                <span>الوصف التسويقي والـ Meta Description</span>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() =>
                    handleCopy(copywriting.metaDescription, "desc")
                  }
                >
                  <Icon
                    name={copiedField === "desc" ? "checkCircle" : "copy"}
                    size={14}
                  />
                  <span>
                    {copiedField === "desc" ? "تم النسخ" : "نسخ الوصف"}
                  </span>
                </button>
              </div>
              <p className="suggestion-text">{copywriting.metaDescription}</p>
            </div>

            {/* Bullet Points */}
            <div className="suggestion-box">
              <div className="suggestion-label">
                <span>أبرز مميزات المنتج (Bullet Points)</span>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() =>
                    handleCopy(
                      copywriting.bulletPoints.map((b) => `• ${b}`).join("\n"),
                      "bullets",
                    )
                  }
                >
                  <Icon
                    name={copiedField === "bullets" ? "checkCircle" : "copy"}
                    size={14}
                  />
                  <span>
                    {copiedField === "bullets" ? "تم النسخ" : "نسخ النقاط"}
                  </span>
                </button>
              </div>
              <ul className="suggestion-bullets">
                {copywriting.bulletPoints.map((point, index) => (
                  <li key={index}>{point}</li>
                ))}
              </ul>
            </div>

            {/* Suggested Keywords / Tags */}
            <div className="suggestion-box">
              <div className="suggestion-label">
                <span>الكلمات المفتاحية وسيو البحث (SEO Keywords)</span>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() =>
                    handleCopy(seo.keywords.join(", "), "keywords")
                  }
                >
                  <Icon
                    name={copiedField === "keywords" ? "checkCircle" : "copy"}
                    size={14}
                  />
                  <span>
                    {copiedField === "keywords" ? "تم النسخ" : "نسخ الكل"}
                  </span>
                </button>
              </div>
              <div className="keywords-wrap">
                {seo.keywords.map((kw, i) => (
                  <span key={i} className="keyword-tag">
                    #{kw}
                  </span>
                ))}
              </div>
            </div>

            {/* Social Share Message */}
            <div className="suggestion-box">
              <div className="suggestion-label">
                <span>رسالة ترويجية جاهزة للواتساب والسوشيال ميديا</span>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() =>
                    handleCopy(copywriting.socialShareText, "social")
                  }
                >
                  <Icon
                    name={copiedField === "social" ? "checkCircle" : "copy"}
                    size={14}
                  />
                  <span>
                    {copiedField === "social" ? "تم النسخ" : "نسخ الرسالة"}
                  </span>
                </button>
              </div>
              <pre className="social-text-preview">
                {copywriting.socialShareText}
              </pre>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="content-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
