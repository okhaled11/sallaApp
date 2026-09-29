import { useState, useCallback } from "react";
import Icon from "../Icon.jsx";

/**
 * SeoCopyModal - AI Marketing & SEO Copy Preview Modal
 */
export default function SeoCopyModal({
  isOpen,
  opportunity,
  onClose,
  onEditProduct,
}) {
  const [copiedKey, setCopiedKey] = useState(null);

  const copyToClipboard = useCallback(async (text, key) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // ignore clipboard error
    }
  }, []);

  if (!isOpen || !opportunity) return null;

  const { product, copyData } = opportunity;
  const {
    hookTitle = "",
    marketingDescription = "",
    benefits = [],
    metaDescription = "",
    seoKeywords = [],
    targetAudience = "",
  } = copyData || {};

  const handleCopyAll = () => {
    const fullText = `
العنوان التسويقي:
${hookTitle}

الوصف التسويقي:
${marketingDescription}

أهم المميزات:
${benefits.map((b) => `- ${b}`).join("\n")}

وصف الميتا (SEO):
${metaDescription}

الكلمات المفتاحية:
${seoKeywords.join(", ")}
    `.trim();

    copyToClipboard(fullText, "all");
  };

  return (
    <div
      className="copilot-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="seo-modal-title"
    >
      <div className="copilot-modal-backdrop" onClick={onClose} />
      <div className="copilot-modal-dialog">
        <header className="copilot-modal-header">
          <div className="copilot-modal-title-wrap">
            <span className="copilot-ai-icon-bubble">
              <Icon name="sparkles" size={18} />
            </span>
            <div>
              <h3 id="seo-modal-title" className="copilot-modal-title">
                النصوص التسويقية والسيو الذكي
              </h3>
              <p className="copilot-modal-subtitle">
                مُولد ومُحسّن بالذكاء الاصطناعي لمنتج:{" "}
                <strong>{product?.name}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="copilot-modal-close-btn"
            onClick={onClose}
            aria-label="إغلاق"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="copilot-modal-body">
          {/* Hook Headline */}
          <div className="copilot-copy-section">
            <div className="copilot-section-header">
              <label className="copilot-field-label">
                العنوان الجذاب (Hook Headline)
              </label>
              <button
                type="button"
                className="copilot-copy-btn"
                onClick={() => copyToClipboard(hookTitle, "hook")}
              >
                <Icon
                  name={copiedKey === "hook" ? "checkBadge" : "copy"}
                  size={14}
                />
                <span>{copiedKey === "hook" ? "تم النسخ!" : "نسخ العنوان"}</span>
              </button>
            </div>
            <div className="copilot-copy-box highlight-text">{hookTitle}</div>
          </div>

          {/* Marketing Description */}
          <div className="copilot-copy-section">
            <div className="copilot-section-header">
              <label className="copilot-field-label">الوصف الترويجي المقترح</label>
              <button
                type="button"
                className="copilot-copy-btn"
                onClick={() => copyToClipboard(marketingDescription, "desc")}
              >
                <Icon
                  name={copiedKey === "desc" ? "checkBadge" : "copy"}
                  size={14}
                />
                <span>{copiedKey === "desc" ? "تم النسخ!" : "نسخ الوصف"}</span>
              </button>
            </div>
            <div className="copilot-copy-box">{marketingDescription}</div>
          </div>

          {/* Benefits */}
          {benefits.length > 0 && (
            <div className="copilot-copy-section">
              <label className="copilot-field-label">
                نقاط القوة والمميزات المقنعة للعميل
              </label>
              <ul className="copilot-benefits-list">
                {benefits.map((item, idx) => (
                  <li key={idx} className="copilot-benefit-item">
                    <span className="copilot-bullet">✦</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* SEO Meta & Keywords */}
          <div className="copilot-two-cols">
            <div className="copilot-copy-section">
              <div className="copilot-section-header">
                <label className="copilot-field-label">
                  وصف الميتا لمحركات البحث (SEO Meta)
                </label>
                <button
                  type="button"
                  className="copilot-copy-btn"
                  onClick={() => copyToClipboard(metaDescription, "meta")}
                >
                  <Icon
                    name={copiedKey === "meta" ? "checkBadge" : "copy"}
                    size={14}
                  />
                  <span>{copiedKey === "meta" ? "تم!" : "نسخ"}</span>
                </button>
              </div>
              <div className="copilot-copy-box meta-text">
                {metaDescription}
              </div>
            </div>

            <div className="copilot-copy-section">
              <label className="copilot-field-label">الكلمات المفتاحية المستهدفة</label>
              <div className="copilot-tags-wrap">
                {seoKeywords.map((kw, idx) => (
                  <span key={idx} className="copilot-keyword-tag">
                    #{kw}
                  </span>
                ))}
              </div>
              {targetAudience && (
                <p className="copilot-target-audience">
                  🎯 <strong>الجمهور المستهدف:</strong> {targetAudience}
                </p>
              )}
            </div>
          </div>
        </div>

        <footer className="copilot-modal-footer">
          <div className="copilot-footer-actions">
            <button
              type="button"
              className="btn btn-secondary copilot-copy-all-btn"
              onClick={handleCopyAll}
            >
              <Icon
                name={copiedKey === "all" ? "checkBadge" : "copy"}
                size={16}
              />
              <span>{copiedKey === "all" ? "تم نسخ كل المحتوى!" : "نسخ المحتوى بالكامل"}</span>
            </button>

            {onEditProduct && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onClose();
                  onEditProduct(product);
                }}
              >
                <Icon name="edit" size={16} />
                <span>فتح تعديل المنتج الآن</span>
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
