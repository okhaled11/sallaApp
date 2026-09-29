import { useState, useMemo } from "react";
import Icon from "../Icon.jsx";
import Button from "../forms/Button.jsx";
import { calculateCampaignImpact } from "../../utils/campaignEngine.js";

const numberFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});
const percentFormat = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 1,
});

export default function CustomCampaignBuilder({
  products = [],
  currency = "ر.س",
  onSaveCampaign,
  onCancel,
}) {
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [discountType, setDiscountType] = useState("percent"); // 'percent' | 'fixed' | 'bogo'
  const [discountValue, setDiscountValue] = useState(20);
  const [campaignTitle, setCampaignTitle] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const resolvedCurrency = currency || "ر.س";

  // Filter products for selector
  const availableProducts = useMemo(() => {
    if (!searchTerm.trim()) return products.slice(0, 20);
    const term = searchTerm.toLowerCase();
    return products.filter(
      (p) =>
        p.name?.toLowerCase().includes(term) ||
        p.sku?.toLowerCase().includes(term),
    );
  }, [products, searchTerm]);

  const selectedProducts = useMemo(() => {
    return products.filter((p) => selectedProductIds.includes(p.id));
  }, [products, selectedProductIds]);

  // Handle product toggle
  const toggleProduct = (productId) => {
    setSelectedProductIds((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId);
      }
      if (prev.length >= 4) return prev; // max 4 products in bundle
      return [...prev, productId];
    });
  };

  // Real-time calculation
  const impact = useMemo(() => {
    if (selectedProducts.length === 0) {
      return {
        originalPrice: 0,
        discountedPrice: 0,
        savingsAmount: 0,
        discountPercent: 0,
        estimatedMargin: null,
      };
    }

    if (discountType === "bogo" && selectedProducts.length >= 1) {
      // BOGO: 2nd item at 50%
      const p = selectedProducts[0];
      const unit = Number(p.price) || 0;
      const cost = Number(p.cost_price) || 0;
      const orig = unit * 2;
      const promo = unit * 1.5;
      const sav = orig - promo;
      const m = cost > 0 ? (promo - cost * 2) / promo : null;
      return {
        originalPrice: orig,
        discountedPrice: promo,
        savingsAmount: sav,
        discountPercent: 25,
        estimatedMargin: m ? Math.round(m * 100) / 100 : null,
      };
    }

    return calculateCampaignImpact({
      products: selectedProducts,
      discountType,
      discountValue,
    });
  }, [selectedProducts, discountType, discountValue]);

  const handleSave = (e) => {
    e.preventDefault();
    if (selectedProducts.length === 0) return;

    const title =
      campaignTitle.trim() ||
      (selectedProducts.length > 1
        ? `حزمة توفير: ${selectedProducts.map((p) => p.name).join(" + ")}`
        : `عرض خاص على ${selectedProducts[0].name}`);

    const code =
      couponCode.trim().toUpperCase() ||
      `PROMO${impact.discountPercent || "SPECIAL"}`;

    const newCampaign = {
      id: `custom-${Date.now()}`,
      type: selectedProducts.length > 1 ? "bundle" : "custom",
      badgeText:
        selectedProducts.length > 1 ? "حزمة مخصصة" : "تخفيض مخصص",
      title,
      description: `عرض ترويجي مخصص بنسبة خصم ${impact.discountPercent}% على ${selectedProducts.length} منتج.`,
      urgency: "medium",
      products: selectedProducts,
      originalPrice: impact.originalPrice,
      discountedPrice: impact.discountedPrice,
      discountPercent: impact.discountPercent,
      savingsAmount: impact.savingsAmount,
      estimatedMargin: impact.estimatedMargin,
      unlockedCapital: null,
      suggestedCode: code,
      canApplyDirectly: selectedProducts.length === 1 && discountType !== "bogo",
      isCustom: true,
      createdAt: new Date().toISOString(),
    };

    onSaveCampaign(newCampaign);
  };

  return (
    <div className="custom-builder-container">
      <div className="builder-header">
        <div>
          <h3 className="builder-title">
            <Icon name="sparkles" size={18} />
            منشئ العروض والحملات المخصص
          </h3>
          <span className="panel-subtitle">
            حدد المنتجات ونوع الخصم وشاهد فوراً الجدوى وهامش الربح المتوقع
          </span>
        </div>
      </div>

      <form onSubmit={handleSave} className="builder-grid">
        {/* Left Column: Form Controls */}
        <div className="builder-form-col">
          {/* Step 1: Select products */}
          <div className="builder-section">
            <label className="builder-label">
              1. اختر المنتجات المستهدفة بالعرض (بحد أقصى 4 منتجات)
            </label>
            <div className="builder-search-wrap">
              <input
                type="text"
                placeholder="بحث باسم المنتج أو الـ SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field builder-search-input"
              />
            </div>

            <div className="builder-product-selector">
              {availableProducts.map((prod) => {
                const isSelected = selectedProductIds.includes(prod.id);
                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => toggleProduct(prod.id)}
                    className={`builder-product-chip ${isSelected ? "selected" : ""}`}
                  >
                    <span className="chip-check">
                      <Icon
                        name={isSelected ? "checkBadge" : "package"}
                        size={14}
                      />
                    </span>
                    <span className="chip-name">{prod.name}</span>
                    <span className="chip-price">
                      {numberFormat.format(prod.price)} {resolvedCurrency}
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedProductIds.length > 0 && (
              <div className="builder-selected-summary">
                تم اختيار <strong>{selectedProductIds.length}</strong> منتج للعرض
              </div>
            )}
          </div>

          {/* Step 2: Choose discount type & value */}
          <div className="builder-section">
            <label className="builder-label">2. حدد نوع العرض والخصم</label>
            <div className="segmented builder-discount-tabs">
              <button
                type="button"
                className={`segmented-button ${discountType === "percent" ? "is-active" : ""}`}
                onClick={() => setDiscountType("percent")}
              >
                نسبة مئوية (%)
              </button>
              <button
                type="button"
                className={`segmented-button ${discountType === "fixed" ? "is-active" : ""}`}
                onClick={() => setDiscountType("fixed")}
              >
                مبلغ ثابت ({resolvedCurrency})
              </button>
              <button
                type="button"
                className={`segmented-button ${discountType === "bogo" ? "is-active" : ""}`}
                onClick={() => setDiscountType("bogo")}
              >
                اشتري 1 واحصل على الثاني بـ 50%
              </button>
            </div>

            {discountType !== "bogo" && (
              <div className="builder-input-row">
                <label className="input-label">
                  قيمة الخصم ({discountType === "percent" ? "%" : resolvedCurrency}):
                </label>
                <input
                  type="number"
                  min="1"
                  max={discountType === "percent" ? "80" : "5000"}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(Number(e.target.value))}
                  className="input-field builder-number-input"
                />
              </div>
            )}
          </div>

          {/* Step 3: Campaign Title & Code */}
          <div className="builder-section">
            <label className="builder-label">3. تفاصيل الكوبون والتسمية</label>
            <div className="builder-inputs-group">
              <input
                type="text"
                placeholder="عنوان العرض (مثال: عروض الجمعة الذهبية)"
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                className="input-field"
              />
              <input
                type="text"
                placeholder="كود الخصم (مثال: SAVE20)"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                className="input-field"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Live Simulation Card */}
        <div className="builder-sim-col">
          <div className="simulation-card">
            <div className="simulation-card-header">
              <Icon name="analytics" size={16} />
              <h4>محاكاة الجدوى المالية للعرض</h4>
            </div>

            <div className="simulation-body">
              <div className="simulation-metric-row">
                <span>إجمالي السعر الأصلي:</span>
                <strong>
                  {numberFormat.format(impact.originalPrice)} {resolvedCurrency}
                </strong>
              </div>

              <div className="simulation-metric-row sim-promo-row">
                <span>سعر العرض للعميل:</span>
                <strong className="sim-promo-value">
                  {numberFormat.format(impact.discountedPrice)} {resolvedCurrency}
                </strong>
              </div>

              <div className="simulation-metric-row">
                <span>قيمة التوفير للعميل:</span>
                <span className="sim-save-tag">
                  وفر {numberFormat.format(impact.savingsAmount)} {resolvedCurrency}{" "}
                  ({impact.discountPercent}%)
                </span>
              </div>

              <div className="simulation-metric-row">
                <span>هامش الربح المتوقع:</span>
                <span
                  className={`sim-margin-tag ${
                    impact.estimatedMargin !== null && impact.estimatedMargin < 0.15
                      ? "loss"
                      : "good"
                  }`}
                >
                  {impact.estimatedMargin !== null
                    ? percentFormat.format(impact.estimatedMargin)
                    : "غير محدد (التكلفة غير مسجلة)"}
                </span>
              </div>
            </div>

            <div className="simulation-actions">
              <Button
                variant="primary"
                type="submit"
                disabled={selectedProducts.length === 0}
              >
                <Icon name="sparkles" size={16} />
                حفظ وإضافة إلى العروض النشطة
              </Button>
              {onCancel && (
                <Button variant="default" type="button" onClick={onCancel}>
                  إلغاء
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
