import { useState, useCallback } from "react";
import Icon from "../Icon.jsx";
import StorefrontModalPreview from "./StorefrontModalPreview.jsx";
import {
  createBlankRule,
  getDefaultRules,
  getTriggerLabel,
  getIncentiveLabel,
  saveIncentiveRules,
  loadIncentiveRules,
} from "../../utils/visitorIncentives.js";
import { createSallaCoupon } from "../../utils/couponsApi.js";

const INCENTIVE_COLORS = {
  coupon_discount: { bg: "#dbeafe", text: "#1d4ed8", icon: "percent", fg: "#60a5fa" },
  free_shipping:   { bg: "#d1fae5", text: "#065f46", icon: "bag", fg: "#34d399" },
  free_product:    { bg: "#fef3c7", text: "#92400e", icon: "gift", fg: "#fbbf24" },
  custom:          { bg: "#ede9fe", text: "#5b21b6", icon: "sparkles", fg: "#a78bfa" },
};

const TRIGGER_COLORS = {
  store_visits:    { bg: "#e0f2fe", text: "#0369a1", fg: "#38bdf8" },
  product_visits:  { bg: "#fce7f3", text: "#9d174d", fg: "#f472b6" },
  category_visits: { bg: "#fef3c7", text: "#92400e", fg: "#fbbf24" },
  cart_abandon:    { bg: "#fee2e2", text: "#b91c1c", fg: "#f87171" },
};

const COLOR_PRESETS = [
  { name: "سلة الأصلي",    primary: "#004d5b", accent: "#73fcd7" },
  { name: "أزرق ملكي",    primary: "#1e40af", accent: "#93c5fd" },
  { name: "بنفسجي فاخر",  primary: "#6d28d9", accent: "#a78bfa" },
  { name: "أخضر نعناع",   primary: "#065f46", accent: "#6ee7b7" },
  { name: "برتقالي دافئ", primary: "#92400e", accent: "#fcd34d" },
  { name: "وردي عصري",    primary: "#9d174d", accent: "#f9a8d4" },
];

const ICON_OPTIONS = [
  { name: "gift", label: "هدية" }, { name: "sparkles", label: "بريق" },
  { name: "tag",  label: "خصم"  }, { name: "flash",    label: "سريع" },
  { name: "bag",  label: "تسوق" }, { name: "star",     label: "مميز" },
  { name: "coins",label: "مكافأة"},{ name: "percent",  label: "نسبة" },
  { name: "cart", label: "سلة"  }, { name: "shoppingBag", label: "حقيبة" },
];

/* ─── Rule Card ─────────────────────────────────────────── */
function RuleCard({
  rule,
  index,
  onEdit,
  onDelete,
  onToggle,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  onSyncCoupon,
  isSyncingCoupon,
}) {
  const ic = INCENTIVE_COLORS[rule.incentive.type] || INCENTIVE_COLORS.coupon_discount;
  const tc = TRIGGER_COLORS[rule.trigger.type]     || TRIGGER_COLORS.store_visits;
  return (
    <div className={`irm-rule-card${!rule.enabled ? " irm-rule-disabled" : ""}`}>
      <div className="irm-card-side">
        <span className="irm-priority-badge">#{index + 1}</span>
        <div className="irm-move-btns">
          <button type="button" onClick={onMoveUp}   disabled={isFirst} className="irm-move-btn"><Icon name="analyticsUp" size={13} /></button>
          <button type="button" onClick={onMoveDown} disabled={isLast}  className="irm-move-btn"><Icon name="trendDown"   size={13} /></button>
        </div>
      </div>
      <div className="irm-card-body">
        <div className="irm-card-header-row">
          <span className="irm-rule-name">{rule.name}</span>
          <div className="irm-card-badges">
            <span className="irm-type-badge" style={{ background: tc.bg, color: tc.text }}>{getTriggerLabel(rule.trigger.type)}</span>
            <span className="irm-type-badge" style={{ background: ic.bg, color: ic.text }}><Icon name={ic.icon} size={11}/>{getIncentiveLabel(rule.incentive.type)}</span>
          </div>
        </div>
        <div className="irm-card-meta">
          {rule.trigger.type === "store_visits"    && <span className="irm-meta-chip"><Icon name="users"  size={12}/>{rule.trigger.minVisits} زيارات خلال {rule.trigger.timeWindowMinutes} دقيقة</span>}
          {rule.trigger.type === "product_visits"  && (
            <span className={`irm-meta-chip ${rule.trigger.productName ? "product" : ""}`}>
              <Icon name="tag" size={12}/>
              {rule.trigger.productName ? `منتج: "${rule.trigger.productName}" (${rule.trigger.minVisits}×)` : `${rule.trigger.minVisits}× لأي منتج بالمتجر`}
            </span>
          )}
          {rule.trigger.type === "cart_abandon"    && <span className="irm-meta-chip"><Icon name="cart"   size={12}/>سلة متروكة منذ {rule.trigger.timeWindowMinutes} دقيقة</span>}
          {rule.trigger.type === "category_visits" && <span className="irm-meta-chip"><Icon name="filter" size={12}/>فئة: {rule.trigger.categoryName || "غير محددة"}</span>}
          {rule.incentive.type === "coupon_discount" && <span className="irm-meta-chip highlight"><Icon name="tag" size={12}/>{rule.incentive.couponCode} — خصم {rule.incentive.discountValue}{rule.incentive.discountType === "percentage" ? "%" : " ر.س"}</span>}
          {rule.incentive.type === "free_shipping"   && <span className="irm-meta-chip highlight"><Icon name="bag"  size={12}/>{rule.incentive.couponCode} — توصيل مجاني</span>}
          {rule.incentive.type === "free_product"    && <span className="irm-meta-chip highlight"><Icon name="gift" size={12}/>{rule.incentive.couponCode} — منتج مجاني</span>}
          {rule.incentive.type !== "custom" && rule.incentive.couponCode && (
            rule.incentive.isCreatedInSalla ? (
              <span className="irm-meta-chip salla-synced" title="تم إنشاء وتفعيل هذا الكوبون كقسيمة شراء حقيقية في متجر سلة">
                <Icon name="checkCircle" size={12}/> مفعل بسلة ✓
              </span>
            ) : (
              <button
                type="button"
                className="irm-sync-coupon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onSyncCoupon?.(rule);
                }}
                disabled={isSyncingCoupon}
                title="إنشاء وتفعيل هذه القسيمة في متجر سلة الآن"
              >
                <Icon name={isSyncingCoupon ? "refresh" : "flash"} size={11}/>
                {isSyncingCoupon ? "جاري التفعيل..." : "تفعيل بسلة ⚡"}
              </button>
            )
          )}
        </div>
      </div>
      <div className="irm-card-actions">
        <button type="button" className={`irm-toggle-btn ${rule.enabled ? "on" : "off"}`} onClick={onToggle}><span className="irm-toggle-knob"/></button>
        <button type="button" className="irm-action-btn edit"   onClick={onEdit}><Icon name="edit"  size={15}/></button>
        <button type="button" className="irm-action-btn delete" onClick={onDelete}><Icon name="trash" size={15}/></button>
      </div>
    </div>
  );
}

/* ─── Product Target Selector ───────────────────────────── */
function ProductTargetSelector({ trigger, products = [], onChange, onApplyAutoText }) {
  const isSpecific = Boolean(trigger.productTargetScope === "specific" || trigger.productId || trigger.productName);
  const [isChanging, setIsChanging] = useState(!trigger.productName && !trigger.productId);
  const [search, setSearch] = useState("");
  const [manualMode, setManualMode] = useState(false);

  const filteredProducts = (products || []).filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.id && String(p.id).includes(q)) ||
      (p.sku && String(p.sku).toLowerCase().includes(q))
    );
  });

  const selectedProduct = (products || []).find((p) => String(p.id) === String(trigger.productId)) || (trigger.productName ? {
    id: trigger.productId,
    name: trigger.productName,
    price: trigger.productPrice,
    image: trigger.productImage,
  } : null);

  const handleSelectProduct = (p) => {
    onChange({
      productTargetScope: "specific",
      productId: p.id,
      productName: p.name,
      productPrice: p.price,
      productImage: p.image || null,
    });
    setIsChanging(false);
  };

  const handleSetScope = (scope) => {
    if (scope === "all") {
      onChange({
        productTargetScope: "all",
        productId: null,
        productName: "",
        productPrice: null,
        productImage: null,
      });
      setIsChanging(false);
    } else {
      onChange({ productTargetScope: "specific" });
      setIsChanging(true);
    }
  };

  return (
    <div className="irm-form-group">
      <label className="irm-label">نطاق تطبيق الزيارات على المنتجات</label>

      {/* Scope segmented buttons */}
      <div className="irm-scope-toggle">
        <button
          type="button"
          className={`irm-scope-btn ${!isSpecific ? "active" : ""}`}
          onClick={() => handleSetScope("all")}
        >
          <span className="irm-scope-title">
            <Icon name="view" size={14} />
            أي منتج بالمتجر
          </span>
          <span className="irm-scope-hint">يظهر العرض عند تكرار زيارة أي منتج من قبل الزائر</span>
        </button>

        <button
          type="button"
          className={`irm-scope-btn ${isSpecific ? "active" : ""}`}
          onClick={() => handleSetScope("specific")}
        >
          <span className="irm-scope-title">
            <Icon name="tag" size={14} />
            منتج محدد من المتجر
          </span>
          <span className="irm-scope-hint">يظهر العرض فقط عند تكرار زيارة هذا المنتج بالذات</span>
        </button>
      </div>

      {/* If Specific product selected and NOT in changing mode */}
      {isSpecific && !isChanging && selectedProduct && (
        <div className="irm-selected-product-card">
          <div className="irm-prod-thumb">
            {selectedProduct.image ? (
              <img src={selectedProduct.image} alt={selectedProduct.name} />
            ) : (
              <Icon name="box" size={24} />
            )}
          </div>
          <div className="irm-prod-details">
            <span className="irm-prod-title">{selectedProduct.name}</span>
            <span className="irm-prod-meta">
              {selectedProduct.price ? `${selectedProduct.price} ر.س` : ""}
              {selectedProduct.id ? ` · معرّف #${selectedProduct.id}` : ""}
            </span>
          </div>
          <div className="irm-prod-actions">
            <button
              type="button"
              className="irm-btn-change-prod"
              onClick={() => setIsChanging(true)}
            >
              تغيير المنتج
            </button>
            <button
              type="button"
              className="irm-btn-autofill-text"
              title="تحديث عنوان ورسالة النافذة باسم هذا المنتج"
              onClick={() => onApplyAutoText?.(selectedProduct)}
            >
              <Icon name="sparkles" size={12} />
              صياغة العرض للمنتج
            </button>
          </div>
        </div>
      )}

      {/* If in product selection mode */}
      {isSpecific && (isChanging || !selectedProduct) && (
        <div className="irm-prod-search-box">
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              className="irm-input"
              placeholder="ابحث في منتجات متجرك بالاسم أو المعرّف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {selectedProduct && (
              <button
                type="button"
                className="irm-btn-cancel"
                style={{ padding: "8px 12px", whiteSpace: "nowrap" }}
                onClick={() => setIsChanging(false)}
              >
                إلغاء
              </button>
            )}
          </div>

          {products && products.length > 0 ? (
            <div className="irm-prod-picker-list">
              {filteredProducts.slice(0, 10).map((p) => {
                const isCur = String(p.id) === String(trigger.productId);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`irm-prod-picker-item ${isCur ? "selected" : ""}`}
                    onClick={() => handleSelectProduct(p)}
                  >
                    <div className="irm-prod-thumb" style={{ width: "36px", height: "36px" }}>
                      {p.image ? <img src={p.image} alt={p.name} /> : <Icon name="box" size={18} />}
                    </div>
                    <div style={{ flex: 1, textAlign: "right" }}>
                      <div style={{ fontSize: "13px", fontWeight: "700" }}>{p.name}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                        {p.price ? `${p.price} ر.س` : ""} · #{p.id}
                      </div>
                    </div>
                    {isCur && <span style={{ color: "#00b259", fontWeight: "bold" }}>✓ محدد</span>}
                  </button>
                );
              })}
              {filteredProducts.length === 0 && (
                <div style={{ padding: "14px", textAlign: "center", fontSize: "12px", color: "var(--text-secondary)" }}>
                  لم يتم العثور على منتجات مطابقة للبحث
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginTop: "8px" }}>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "0 0 6px" }}>
                أدخل اسم المنتج ومعرفه مباشرة:
              </p>
              <div className="irm-form-row">
                <input
                  className="irm-input"
                  placeholder="اسم المنتج (مثال: عطر مسك)"
                  value={trigger.productName || ""}
                  onChange={(e) => onChange({ productName: e.target.value, productTargetScope: "specific" })}
                />
                <input
                  className="irm-input irm-input-mono"
                  placeholder="رقم المنتج (اختياري ID)"
                  value={trigger.productId || ""}
                  onChange={(e) => onChange({ productId: e.target.value, productTargetScope: "specific" })}
                />
              </div>
            </div>
          )}

          {/* Toggle manual entry if products are available */}
          {products && products.length > 0 && (
            <div style={{ marginTop: "6px" }}>
              <button
                type="button"
                style={{ background: "none", border: "none", color: "var(--salla-primary)", fontSize: "11.5px", cursor: "pointer", textDecoration: "underline" }}
                onClick={() => setManualMode(!manualMode)}
              >
                {manualMode ? "إخفاء الإدخال اليدوي" : "أو إدخال اسم المنتج يدوياً (بدون القائمة)"}
              </button>
              {manualMode && (
                <div className="irm-form-row" style={{ marginTop: "6px" }}>
                  <input
                    className="irm-input"
                    placeholder="اسم المنتج..."
                    value={trigger.productName || ""}
                    onChange={(e) => onChange({ productName: e.target.value, productTargetScope: "specific" })}
                  />
                  <input
                    className="irm-input irm-input-mono"
                    placeholder="معرّف المنتج (ID)..."
                    value={trigger.productId || ""}
                    onChange={(e) => onChange({ productId: e.target.value, productTargetScope: "specific" })}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Rule Editor Panel ─────────────────────────────────── */
function RuleEditorPanel({ rule, products, token, onShowToast, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(rule)));
  const [tab, setTab] = useState("trigger");
  const [isSyncingSalla, setIsSyncingSalla] = useState(false);

  const setT = (k, v) => setDraft((d) => ({ ...d, trigger:  { ...d.trigger,  [k]: v } }));
  const setTriggerFields = (fields) => setDraft((d) => ({ ...d, trigger: { ...d.trigger, ...fields } }));
  const setI = (k, v) => setDraft((d) => ({ ...d, incentive: { ...d.incentive, [k]: v } }));
  const setM = (k, v) => setDraft((d) => ({ ...d, modal:    { ...d.modal,    [k]: v } }));

  const handleCreateCouponInSalla = async () => {
    const code = draft.incentive.couponCode;
    if (!code || !code.trim()) {
      onShowToast?.("يرجى إدخال كود الكوبون أولاً", "warning");
      return;
    }
    setIsSyncingSalla(true);
    try {
      const res = await createSallaCoupon(token, {
        code: code.trim().toUpperCase(),
        name: draft.name || `قسيمة ${code}`,
        discount_type: draft.incentive.discountType || (draft.incentive.type === "free_shipping" ? "free_shipping" : "percentage"),
        discount_value: Number(draft.incentive.discountValue) || 15,
        free_shipping: Boolean(draft.incentive.type === "free_shipping" || draft.incentive.freeShippingThreshold > 0),
      });
      if (res.success) {
        setI("isCreatedInSalla", true);
        if (res.coupon?.id) {
          setI("sallaCouponId", res.coupon.id);
        }
        onShowToast?.(
          res.alreadyExists
            ? `الكوبون (${code}) مفعل بالفعل في متجرك بسلة`
            : res.message || `تم تفعيل القسيمة (${code}) في متجر سلة بنجاح!`,
          "success"
        );
      } else {
        onShowToast?.(res.error || "فشل إنشاء القسيمة في سلة", "error");
      }
    } catch {
      onShowToast?.("حدث خطأ أثناء الاتصال بسلة", "error");
    } finally {
      setIsSyncingSalla(false);
    }
  };

  const handleApplyProductAutoText = (prod) => {
    if (!prod?.name) return;
    setDraft((d) => ({
      ...d,
      modal: {
        ...d.modal,
        headline: `عرض خاص على ${prod.name}! ✨`,
        message: `لاحظنا اهتمامك بمنتج "${prod.name}" وتكرار زيارتك له! يسعدنا تقديم كود خصم حصري لتكمل طلبك وتستمتع به الآن.`,
        couponCaption: `كوبون خصم لـ ${prod.name}:`,
      },
    }));
  };

  const prevConfig = {
    headline: draft.modal.headline, message: draft.modal.message,
    ctaText: draft.modal.ctaText,   dismissText: draft.modal.dismissText,
    couponCaption: draft.modal.couponCaption,
    couponCode: draft.incentive.couponCode || "SALLA-CODE",
    discountValue: draft.incentive.discountValue || 0,
    discountType: draft.incentive.discountType || "percentage",
    incentiveType: draft.incentive.type || "coupon_discount",
    productName: draft.trigger.productName || null,
    primaryColor: draft.modal.primaryColor, accentColor: draft.modal.accentColor,
    giftIcon: draft.modal.giftIcon, showCountdown: draft.modal.showCountdown,
    countdownMinutes: draft.modal.countdownMinutes,
  };

  return (
    <div className="irm-editor-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="irm-editor-panel">
        {/* Header */}
        <div className="irm-editor-header">
          <div className="irm-editor-title-row">
            <Icon name="fileEdit" size={20}/>
            <div>
              <p className="irm-editor-subtitle">محرر القاعدة</p>
              <input className="irm-rule-name-input" value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="اسم القاعدة..."/>
            </div>
          </div>
          <button type="button" className="irm-editor-close-btn" onClick={onCancel}><Icon name="close" size={18}/></button>
        </div>

        {/* Sub-tabs */}
        <div className="irm-editor-tabs">
          {[["trigger","target","شرط التفعيل"],["incentive","gift","نوع المكافأة"],["modal","layout","تصميم النافذة"]].map(([k,ic,lbl]) => (
            <button key={k} type="button" className={`irm-editor-tab${tab===k?" active":""}`} onClick={() => setTab(k)}>
              <Icon name={ic} size={14}/>{lbl}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="irm-editor-body">
          <div className="irm-editor-form-col">

            {/* ── Trigger tab ── */}
            {tab === "trigger" && (
              <div className="irm-form-section">
                <div className="irm-form-group">
                  <label className="irm-label">نوع الشرط</label>
                  <div className="irm-trigger-grid">
                    {[
                      ["store_visits",    "users",  "زيارات المتجر",     "عندما يزور الزبون المتجر عدة مرات"],
                      ["product_visits",  "view",   "زيارات منتج معين",  "عندما يزور نفس المنتج عدة مرات"],
                      ["category_visits", "filter", "زيارات فئة محددة",  "عندما يتصفح فئة معينة بتكرار"],
                      ["cart_abandon",    "cart",   "سلة متروكة",         "عندما يترك الزبون سلة مشترياته"],
                    ].map(([val, ico, lbl, desc]) => {
                      const c = TRIGGER_COLORS[val];
                      return (
                        <button key={val} type="button"
                          className={`irm-trigger-option${draft.trigger.type===val?" selected":""}`}
                          style={draft.trigger.type===val ? {borderColor:c.fg, background:c.fg+"1f"} : {}}
                          onClick={() => setT("type", val)}
                        >
                          <span style={{color:c.fg}}><Icon name={ico} size={22}/></span>
                          <span className="irm-trigger-label">{lbl}</span>
                          <span className="irm-trigger-desc">{desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {draft.trigger.type === "product_visits" && (
                  <ProductTargetSelector
                    trigger={draft.trigger}
                    products={products}
                    onChange={setTriggerFields}
                    onApplyAutoText={handleApplyProductAutoText}
                  />
                )}

                {draft.trigger.type === "category_visits" && (
                  <div className="irm-form-group">
                    <label className="irm-label">اسم الفئة</label>
                    <input className="irm-input" placeholder="مثال: عطور، ساعات..." value={draft.trigger.categoryName} onChange={(e) => setT("categoryName", e.target.value)}/>
                  </div>
                )}

                {draft.trigger.type !== "cart_abandon" && (
                  <div className="irm-form-group">
                    <label className="irm-label">عدد الزيارات<span className="irm-val-badge">{draft.trigger.minVisits} زيارات</span></label>
                    <input type="range" min={1} max={10} step={1} className="irm-range" value={draft.trigger.minVisits} onChange={(e) => setT("minVisits", Number(e.target.value))}/>
                    <div className="irm-range-labels"><span>1</span><span>10</span></div>
                  </div>
                )}

                <div className="irm-form-group">
                  <label className="irm-label">
                    نافذة الوقت
                    <span className="irm-val-badge">
                      {draft.trigger.timeWindowMinutes >= 60 ? `${Math.round(draft.trigger.timeWindowMinutes/60)} ساعة` : `${draft.trigger.timeWindowMinutes} دقيقة`}
                    </span>
                  </label>
                  <input type="range" min={10} max={1440} step={10} className="irm-range" value={draft.trigger.timeWindowMinutes} onChange={(e) => setT("timeWindowMinutes", Number(e.target.value))}/>
                  <div className="irm-range-labels"><span>10 د</span><span>24 س</span></div>
                </div>
              </div>
            )}

            {/* ── Incentive tab ── */}
            {tab === "incentive" && (
              <div className="irm-form-section">
                <div className="irm-form-group">
                  <label className="irm-label">نوع المكافأة</label>
                  <div className="irm-incentive-grid">
                    {[
                      ["coupon_discount","percent",  "كود خصم",      "نسبة % أو مبلغ ثابت"],
                      ["free_shipping",  "bag",       "توصيل مجاني", "شحن مجاني بكود"],
                      ["free_product",   "gift",      "منتج مجاني",  "هدية مع الطلب"],
                      ["custom",         "sparkles",  "مخصص",        "رسالة ومحتوى حر"],
                    ].map(([val, ico, lbl, desc]) => {
                      const c = INCENTIVE_COLORS[val];
                      return (
                        <button key={val} type="button"
                          className={`irm-incentive-option${draft.incentive.type===val?" selected":""}`}
                          style={draft.incentive.type===val ? {borderColor:c.fg, background:c.fg+"1f"} : {}}
                          onClick={() => setI("type", val)}
                        >
                          <span style={{color:c.fg}}><Icon name={ico} size={26}/></span>
                          <span className="irm-inc-label">{lbl}</span>
                          <span className="irm-inc-desc">{desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="irm-form-group">
                  <label className="irm-label">كود الكوبون</label>
                  <input className="irm-input irm-input-mono" value={draft.incentive.couponCode}
                    onChange={(e) => setI("couponCode", e.target.value.toUpperCase())} placeholder="SAVE20" maxLength={20}/>
                </div>

                {draft.incentive.type !== "custom" && draft.incentive.couponCode && (
                  <div className="irm-salla-coupon-box">
                    <div className="irm-salla-coupon-info">
                      <Icon name={draft.incentive.isCreatedInSalla ? "checkCircle" : "flash"} size={18} />
                      <div>
                        <strong>
                          {draft.incentive.isCreatedInSalla
                            ? "القسيمة مفعلة وجاهزة في متجر سلة ✓"
                            : "تفعيل قسيمة الشراء الحقيقية في متجر سلة"}
                        </strong>
                        <p>
                          {draft.incentive.isCreatedInSalla
                            ? `تم ربط الكود (${draft.incentive.couponCode}) كقسيمة شراء حقيقية في متجرك بسلة.`
                            : "اضغط الزر لإنشاء القسيمة الحقيقية في متجر سلة ليعمل الخصم مباشرة عند الشراء."}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`irm-btn-salla-sync ${draft.incentive.isCreatedInSalla ? "synced" : ""}`}
                      onClick={handleCreateCouponInSalla}
                      disabled={isSyncingSalla}
                    >
                      <Icon name={isSyncingSalla ? "refresh" : "flash"} size={14} />
                      {isSyncingSalla
                        ? "جاري التفعيل..."
                        : draft.incentive.isCreatedInSalla
                        ? "إعادة مزامنة مع سلة ✓"
                        : "تفعيل القسيمة في متجر سلة ⚡"}
                    </button>
                  </div>
                )}

                {draft.incentive.type === "coupon_discount" && (
                  <>
                    <div className="irm-form-group">
                      <label className="irm-label">نوع الخصم</label>
                      <div className="irm-seg-ctrl">
                        <button type="button" className={draft.incentive.discountType==="percentage"?"active":""} onClick={() => setI("discountType","percentage")}>نسبة %</button>
                        <button type="button" className={draft.incentive.discountType==="fixed"?"active":""}      onClick={() => setI("discountType","fixed")}>مبلغ ثابت ر.س</button>
                      </div>
                    </div>
                    <div className="irm-form-group">
                      <label className="irm-label">قيمة الخصم<span className="irm-val-badge">{draft.incentive.discountValue}{draft.incentive.discountType==="percentage"?"%":" ر.س"}</span></label>
                      <input type="range" min={5} max={draft.incentive.discountType==="percentage"?80:500} step={5} className="irm-range"
                        value={draft.incentive.discountValue} onChange={(e) => setI("discountValue", Number(e.target.value))}/>
                    </div>
                  </>
                )}

                {draft.incentive.type === "free_shipping" && (
                  <div className="irm-form-group">
                    <label className="irm-label">حد التوصيل المجاني (0 = بلا حد)<span className="irm-val-badge">{draft.incentive.freeShippingThreshold} ر.س</span></label>
                    <input type="range" min={0} max={500} step={25} className="irm-range"
                      value={draft.incentive.freeShippingThreshold} onChange={(e) => setI("freeShippingThreshold", Number(e.target.value))}/>
                  </div>
                )}
              </div>
            )}

            {/* ── Modal tab ── */}
            {tab === "modal" && (
              <div className="irm-form-section">
                <div className="irm-form-group"><label className="irm-label">عنوان النافذة</label><input className="irm-input" value={draft.modal.headline} onChange={(e)=>setM("headline",e.target.value)}/></div>
                <div className="irm-form-group"><label className="irm-label">نص الرسالة</label><textarea className="irm-textarea" rows={3} value={draft.modal.message} onChange={(e)=>setM("message",e.target.value)}/></div>
                <div className="irm-form-row">
                  <div className="irm-form-group"><label className="irm-label">نص زر الاستجابة</label><input className="irm-input" value={draft.modal.ctaText} onChange={(e)=>setM("ctaText",e.target.value)}/></div>
                  <div className="irm-form-group"><label className="irm-label">نص الإغلاق</label><input className="irm-input" value={draft.modal.dismissText} onChange={(e)=>setM("dismissText",e.target.value)}/></div>
                </div>
                <div className="irm-form-group"><label className="irm-label">عنوان الكوبون</label><input className="irm-input" value={draft.modal.couponCaption} onChange={(e)=>setM("couponCaption",e.target.value)}/></div>

                <div className="irm-form-group">
                  <label className="irm-label">لوحة الألوان</label>
                  <div className="irm-color-presets">
                    {COLOR_PRESETS.map((p) => (
                      <button key={p.name} type="button" title={p.name}
                        className={`irm-color-chip${draft.modal.primaryColor===p.primary?" active":""}`}
                        style={{background:`linear-gradient(135deg, ${p.primary} 50%, ${p.accent} 50%)`}}
                        onClick={() => { setM("primaryColor",p.primary); setM("accentColor",p.accent); }}/>
                    ))}
                  </div>
                </div>

                <div className="irm-form-row">
                  <div className="irm-form-group">
                    <label className="irm-label">لون رئيسي</label>
                    <div className="irm-color-input-row">
                      <input type="color" className="irm-color-swatch" value={draft.modal.primaryColor} onChange={(e)=>setM("primaryColor",e.target.value)}/>
                      <input className="irm-input irm-input-mono" value={draft.modal.primaryColor} onChange={(e)=>setM("primaryColor",e.target.value)} maxLength={7}/>
                    </div>
                  </div>
                  <div className="irm-form-group">
                    <label className="irm-label">لون مميز</label>
                    <div className="irm-color-input-row">
                      <input type="color" className="irm-color-swatch" value={draft.modal.accentColor} onChange={(e)=>setM("accentColor",e.target.value)}/>
                      <input className="irm-input irm-input-mono" value={draft.modal.accentColor} onChange={(e)=>setM("accentColor",e.target.value)} maxLength={7}/>
                    </div>
                  </div>
                </div>

                <div className="irm-form-group">
                  <label className="irm-label">أيقونة الهدية</label>
                  <div className="irm-icon-picker">
                    {ICON_OPTIONS.map((ico) => (
                      <button key={ico.name} type="button" title={ico.label}
                        className={`irm-icon-btn${draft.modal.giftIcon===ico.name?" active":""}`}
                        onClick={() => setM("giftIcon", ico.name)}
                      ><Icon name={ico.name} size={20}/></button>
                    ))}
                  </div>
                </div>

                <div className="irm-form-group irm-toggle-row">
                  <label className="irm-label">العداد التنازلي</label>
                  <button type="button" className={`irm-toggle-btn ${draft.modal.showCountdown?"on":"off"}`} onClick={()=>setM("showCountdown",!draft.modal.showCountdown)}>
                    <span className="irm-toggle-knob"/>
                  </button>
                </div>
                {draft.modal.showCountdown && (
                  <div className="irm-form-group">
                    <label className="irm-label">مدة العرض<span className="irm-val-badge">{draft.modal.countdownMinutes} دقيقة</span></label>
                    <input type="range" min={5} max={60} step={5} className="irm-range" value={draft.modal.countdownMinutes} onChange={(e)=>setM("countdownMinutes",Number(e.target.value))}/>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="irm-editor-preview-col">
            <div className="irm-preview-label"><Icon name="sparkles" size={13}/>معاينة مباشرة</div>
            <StorefrontModalPreview config={prevConfig} onClose={()=>{}} onApplyDiscount={()=>{}}/>
          </div>
        </div>

        {/* Footer */}
        <div className="irm-editor-footer">
          <button type="button" className="irm-btn-cancel" onClick={onCancel}><Icon name="close" size={15}/>إلغاء</button>
          <button type="button" className="irm-btn-save"   onClick={() => onSave(draft)}><Icon name="checkCircle" size={15}/>حفظ القاعدة</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Export ───────────────────────────────────────── */
export default function IncentiveRulesManager({ products = [], token = null, onShowToast }) {
  const [rules, setRules] = useState(() => loadIncentiveRules());
  const [editingRule, setEditingRule] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [syncingRuleId, setSyncingRuleId] = useState(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  const persistRules = useCallback((updated) => {
    setRules(updated);
    saveIncentiveRules(updated);
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(
          new CustomEvent("salla-incentive-rules-updated", { detail: updated }),
        );
      } catch {}
    }
  }, []);

  const handleSaveRule = (savedDraft) => {
    persistRules(isCreating ? [...rules, savedDraft] : rules.map((r) => r.id === savedDraft.id ? savedDraft : r));
    setEditingRule(null);
    setIsCreating(false);
    onShowToast?.(`تم حفظ القاعدة "${savedDraft.name}" بنجاح`, "success");
  };

  const handleDeleteRule = (id) => {
    const rule = rules.find((r) => r.id === id);
    if (!rule || !window.confirm(`هل تريد حذف "${rule.name}"؟`)) return;
    persistRules(rules.filter((r) => r.id !== id));
    onShowToast?.("تم حذف القاعدة", "info");
  };

  const handleMoveUp   = (i) => { if (i === 0) return; const a=[...rules]; [a[i-1],a[i]]=[a[i],a[i-1]]; persistRules(a); };
  const handleMoveDown = (i) => { if (i===rules.length-1) return; const a=[...rules]; [a[i],a[i+1]]=[a[i+1],a[i]]; persistRules(a); };

  const handleSyncSingleCoupon = async (rule) => {
    if (rule.incentive?.type === "custom") return;
    const code = rule.incentive?.couponCode;
    if (!code) {
      onShowToast?.("القاعدة لا تحتوي على كود كوبون", "warning");
      return;
    }
    setSyncingRuleId(rule.id);
    try {
      const res = await createSallaCoupon(token, {
        code: code.trim().toUpperCase(),
        name: rule.name || `قسيمة ${code}`,
        discount_type: rule.incentive.discountType || (rule.incentive.type === "free_shipping" ? "free_shipping" : "percentage"),
        discount_value: Number(rule.incentive.discountValue) || 15,
        free_shipping: Boolean(rule.incentive.type === "free_shipping" || rule.incentive.freeShippingThreshold > 0),
      });
      if (res.success) {
        const updated = rules.map((r) =>
          r.id === rule.id
            ? {
                ...r,
                incentive: {
                  ...r.incentive,
                  isCreatedInSalla: true,
                  sallaCouponId: res.coupon?.id || r.incentive.sallaCouponId,
                },
              }
            : r
        );
        persistRules(updated);
        onShowToast?.(
          res.alreadyExists
            ? `الكوبون (${code}) مفعل بالفعل في متجرك بسلة`
            : res.message || `تم تفعيل القسيمة (${code}) في متجر سلة بنجاح!`,
          "success"
        );
      } else {
        onShowToast?.(res.error || `فشل تفعيل القسيمة (${code})`, "error");
      }
    } catch {
      onShowToast?.(`حدث خطأ أثناء تفعيل القسيمة (${code})`, "error");
    } finally {
      setSyncingRuleId(null);
    }
  };

  const handleSyncAllCoupons = async () => {
    const couponRules = rules.filter((r) => r.enabled && r.incentive?.type !== "custom" && r.incentive?.couponCode);
    if (couponRules.length === 0) {
      onShowToast?.("لا توجد قواعد نشطة تحتوي على كوبونات للمزامنة", "info");
      return;
    }
    setIsSyncingAll(true);
    let successCount = 0;
    let failCount = 0;
    let updatedRules = [...rules];

    for (const r of couponRules) {
      try {
        const res = await createSallaCoupon(token, {
          code: r.incentive.couponCode.trim().toUpperCase(),
          name: r.name || `قسيمة ${r.incentive.couponCode}`,
          discount_type: r.incentive.discountType || (r.incentive.type === "free_shipping" ? "free_shipping" : "percentage"),
          discount_value: Number(r.incentive.discountValue) || 15,
          free_shipping: Boolean(r.incentive.type === "free_shipping" || r.incentive.freeShippingThreshold > 0),
        });
        if (res.success) {
          successCount++;
          updatedRules = updatedRules.map((item) =>
            item.id === r.id
              ? {
                  ...item,
                  incentive: {
                    ...item.incentive,
                    isCreatedInSalla: true,
                    sallaCouponId: res.coupon?.id || item.incentive.sallaCouponId,
                  },
                }
              : item
          );
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }
    persistRules(updatedRules);
    setIsSyncingAll(false);
    if (failCount === 0) {
      onShowToast?.(`تم تفعيل جميع القسائم (${successCount}) في متجر سلة بنجاح! ⚡`, "success");
    } else {
      onShowToast?.(`تم تفعيل ${successCount} قسيمة، وتعذر تفعيل ${failCount}`, "warning");
    }
  };

  const enabledCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="irm-container">
      {editingRule && (
        <RuleEditorPanel
          rule={editingRule}
          products={products}
          token={token}
          onShowToast={onShowToast}
          onSave={handleSaveRule}
          onCancel={() => { setEditingRule(null); setIsCreating(false); }}
        />
      )}

      <div className="irm-header">
        <div>
          <h3 className="irm-title"><Icon name="flash" size={18}/>قواعد التحفيز الذكية</h3>
          <p className="irm-subtitle">أنشئ قواعد مستقلة تُطلق نوافذ خصم مختلفة بناءً على سلوك كل زائر</p>
        </div>
        <div className="irm-header-stats">
          <span className="irm-stat-chip"><Icon name="activity" size={13}/>{enabledCount} نشطة</span>
          <span className="irm-stat-chip secondary"><Icon name="checklist" size={13}/>{rules.length} إجمالي</span>
        </div>
      </div>

      <div className="irm-how-it-works">
        <span className="irm-how-step"><Icon name="target"   size={13}/>حدد الشرط</span><span className="irm-arrow">←</span>
        <span className="irm-how-step"><Icon name="gift"     size={13}/>اختر المكافأة</span><span className="irm-arrow">←</span>
        <span className="irm-how-step"><Icon name="layout"   size={13}/>صمم النافذة</span><span className="irm-arrow">←</span>
        <span className="irm-how-step"><Icon name="sparkles" size={13}/>تظهر تلقائياً</span>
      </div>

      <div className="irm-actions-bar">
        <button type="button" className="irm-btn-add" onClick={() => { setEditingRule(createBlankRule()); setIsCreating(true); }}>
          <Icon name="flash" size={16}/>إضافة قاعدة جديدة
        </button>
        <button type="button" className="irm-btn-sync-all" onClick={handleSyncAllCoupons} disabled={isSyncingAll}>
          <Icon name={isSyncingAll ? "refresh" : "cloudUpload"} size={14}/>
          {isSyncingAll ? "جاري مزامنة القسائم..." : "تفعيل جميع القسائم في سلة ⚡"}
        </button>
        <button type="button" className="irm-btn-reset" onClick={() => {
          if (!window.confirm("هل تريد استعادة القواعد الافتراضية؟")) return;
          persistRules(getDefaultRules());
          onShowToast?.("تم استعادة القواعد الافتراضية", "info");
        }}>
          <Icon name="refresh" size={14}/>استعادة الافتراضي
        </button>
      </div>

      <div className="irm-rules-list">
        {rules.length === 0 ? (
          <div className="irm-empty-state">
            <Icon name="target" size={40}/>
            <h4>لا توجد قواعد بعد</h4>
            <p>أضف قاعدتك الأولى لبدء تحفيز زوار متجرك تلقائياً</p>
            <button type="button" className="irm-btn-add" onClick={() => { setEditingRule(createBlankRule()); setIsCreating(true); }}>
              <Icon name="flash" size={15}/>إضافة القاعدة الأولى
            </button>
          </div>
        ) : rules.map((rule, i) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            index={i}
            isFirst={i===0}
            isLast={i===rules.length-1}
            onEdit={() => { setEditingRule(rule); setIsCreating(false); }}
            onDelete={() => handleDeleteRule(rule.id)}
            onToggle={() => persistRules(rules.map((r) => r.id===rule.id ? {...r,enabled:!r.enabled} : r))}
            onMoveUp={() => handleMoveUp(i)}
            onMoveDown={() => handleMoveDown(i)}
            onSyncCoupon={handleSyncSingleCoupon}
            isSyncingCoupon={syncingRuleId === rule.id}
          />
        ))}
      </div>

      <div className="irm-info-footer">
        <Icon name="help" size={13}/>
        <span>القواعد تُطبَّق بالترتيب — الأولى في القائمة لها أعلى أولوية. اضغط "تفعيل بسلة ⚡" لإنشاء القسيمة ككود شراء حقيقي في متجرك.</span>
      </div>
    </div>
  );
}

