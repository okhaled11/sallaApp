import { useState, useMemo, useCallback } from "react";
import Icon from "../Icon.jsx";
import StorefrontModalPreview from "./StorefrontModalPreview.jsx";
import {
  DEFAULT_INCENTIVE_CONFIG,
  generateMockFrequentVisitors,
  generateStorefrontTrackingScript,
  checkVisitorEligibility,
} from "../../utils/visitorIncentives.js";

/**
 * VisitorIncentivesStudio:
 * Detects frequent store visitors who haven't purchased and provides
 * a fully customizable storefront discount modal when they visit 3 times in close intervals.
 */
export default function VisitorIncentivesStudio({
  products = [],
  currency = "SAR",
  onShowToast,
}) {
  const [activeSubTab, setActiveSubTab] = useState("visitors"); // visitors | customizer | preview | script
  const [config, setConfig] = useState(DEFAULT_INCENTIVE_CONFIG);
  const [visitors, setVisitors] = useState(() =>
    generateMockFrequentVisitors(products),
  );
  const [filterType, setFilterType] = useState("all"); // all | qualified | watching | converted
  const [searchQuery, setSearchQuery] = useState("");
  const [simulationStep, setSimulationStep] = useState(0); // 0 = idle, 1, 2, 3 = show modal
  const [isSimulating, setIsSimulating] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);

  // Update visitors eligibility based on current config
  const qualifiedCount = useMemo(() => {
    return visitors.filter((v) => checkVisitorEligibility(v, config)).length;
  }, [visitors, config]);

  const convertedCount = useMemo(() => {
    return visitors.filter((v) => v.status === "converted").length;
  }, [visitors]);

  const filteredVisitors = useMemo(() => {
    return visitors.filter((v) => {
      const matchesSearch =
        v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.city.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (filterType === "qualified") {
        return checkVisitorEligibility(v, config);
      }
      if (filterType === "converted") {
        return v.status === "converted";
      }
      if (filterType === "watching") {
        return v.visitCount < config.minVisits && v.purchasesCount === 0;
      }
      return true;
    });
  }, [visitors, filterType, searchQuery, config]);

  // Form field updater
  const handleConfigChange = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  // Trigger instant manual discount for a visitor from the list
  const handleOfferDirectDiscount = (visitor) => {
    setVisitors((prev) =>
      prev.map((v) =>
        v.id === visitor.id
          ? {
              ...v,
              status: "offered",
              timeSpanText: `${v.visitCount} زيارات - تم إرسال كود ${config.couponCode} فوراً!`,
            }
          : v,
      ),
    );
    onShowToast?.(
      `تم إرسال كود الخصم (${config.couponCode}) إلى ${visitor.name}`,
      "success",
    );
  };

  // Copy tracking script to clipboard
  const handleCopyScript = () => {
    const script = generateStorefrontTrackingScript(config);
    navigator.clipboard?.writeText?.(script);
    setScriptCopied(true);
    onShowToast?.("تم نسخ كود التتبع لواجهة المتجر بنجاح", "success");
    setTimeout(() => setScriptCopied(false), 2500);
  };

  // Run 3-visits simulation sequence
  const startSimulation = useCallback(() => {
    setIsSimulating(true);
    setSimulationStep(1);

    setTimeout(() => {
      setSimulationStep(2);
      setTimeout(() => {
        setSimulationStep(3); // 3rd visit triggers modal!
        setIsSimulating(false);
      }, 1500);
    }, 1500);
  }, []);

  const resetSimulation = () => {
    setSimulationStep(0);
    setIsSimulating(false);
  };

  return (
    <div className="visitor-incentives-view">
      {/* Top Hero Overview Banner */}
      <div className="incentives-hero-card">
        <div className="incentives-hero-content">
          <div className="incentives-hero-badge">
            <Icon name="sparkles" size={16} />
            <span>نظام استعادة وتحفيز الزوار المتكررين في متجر سلة</span>
          </div>
          <h2 className="incentives-hero-title">
            تحويل الزوار المترددين إلى مشترين حقيقيين 🎯
          </h2>
          <p className="incentives-hero-desc">
            رصد تلقائي للعملاء الذين يترددون على متجرك ({config.minVisits} مرات
            في وقت متقارب) دون إتمام الشراء، مع إطلاق نافذة منبثقة مخصصة تمنحهم
            كود خصم حصري لتشجيعهم على الشراء فوراً.
          </p>
        </div>

        {/* Global Campaign Toggle */}
        <div className="incentives-hero-toggle-card">
          <div className="toggle-info-row">
            <span className="toggle-label">حالة النافذة في المتجر:</span>
            <span
              className={`toggle-status-badge ${
                config.enabled ? "active" : "inactive"
              }`}
            >
              {config.enabled ? "مفعلة وتعمل بالمتجر" : "معطلة مؤقتاً"}
            </span>
          </div>
          <button
            type="button"
            className={`btn-toggle-campaign ${config.enabled ? "on" : "off"}`}
            onClick={() => handleConfigChange("enabled", !config.enabled)}
            aria-pressed={config.enabled}
          >
            {config.enabled ? "تعطيل الحملة" : "تفعيل الحملة الآن"}
          </button>
        </div>
      </div>

      {/* KPI Counters Bar */}
      <div className="incentives-kpi-grid">
        <div className="kpi-mini-card">
          <div className="kpi-mini-icon primary">
            <Icon name="view" size={20} />
          </div>
          <div className="kpi-mini-body">
            <span className="kpi-mini-val">{visitors.length}</span>
            <span className="kpi-mini-lbl">إجمالي الزوار المتكررين</span>
          </div>
        </div>

        <div className="kpi-mini-card">
          <div className="kpi-mini-icon secondary">
            <Icon name="tag" size={20} />
          </div>
          <div className="kpi-mini-body">
            <span className="kpi-mini-val">{qualifiedCount}</span>
            <span className="kpi-mini-lbl">
              مؤهلون للخصم ({config.minVisits}+ زيارات دون شراء)
            </span>
          </div>
        </div>

        <div className="kpi-mini-card">
          <div className="kpi-mini-icon success">
            <Icon name="checkCircle" size={20} />
          </div>
          <div className="kpi-mini-body">
            <span className="kpi-mini-val">{convertedCount}</span>
            <span className="kpi-mini-lbl">أتموا الشراء بعد الخصم 🎉</span>
          </div>
        </div>

        <div className="kpi-mini-card">
          <div className="kpi-mini-icon warning">
            <Icon name="coins" size={20} />
          </div>
          <div className="kpi-mini-body">
            <span className="kpi-mini-val">
              {config.couponCode} ({config.discountValue}%)
            </span>
            <span className="kpi-mini-lbl">الكود النشط للزوار</span>
          </div>
        </div>
      </div>

      {/* Studio Sub-Navigation Tabs */}
      <div className="studio-tabs-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeSubTab === "visitors"}
          className={`studio-tab-btn ${
            activeSubTab === "visitors" ? "active" : ""
          }`}
          onClick={() => setActiveSubTab("visitors")}
        >
          <Icon name="view" size={16} />
          <span>سجل الزوار المترددين ({visitors.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSubTab === "customizer"}
          className={`studio-tab-btn ${
            activeSubTab === "customizer" ? "active" : ""
          }`}
          onClick={() => setActiveSubTab("customizer")}
        >
          <Icon name="fileEdit" size={16} />
          <span>شروط الزيارات وتخصيص المودال</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSubTab === "preview"}
          className={`studio-tab-btn ${
            activeSubTab === "preview" ? "active" : ""
          }`}
          onClick={() => setActiveSubTab("preview")}
        >
          <Icon name="sparkles" size={16} />
          <span>المعاينة الحية ومحاكاة الدخول</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeSubTab === "script"}
          className={`studio-tab-btn ${
            activeSubTab === "script" ? "active" : ""
          }`}
          onClick={() => setActiveSubTab("script")}
        >
          <Icon name="copy" size={16} />
          <span>كود التثبيت في متجر سلة</span>
        </button>
      </div>

      {/* SUB-TAB 1: Visitors Intelligence Table */}
      {activeSubTab === "visitors" && (
        <div className="panel studio-panel">
          <div className="panel-header">
            <div>
              <span className="panel-title">
                من هم الزوار الذين يترددون على متجرك دون شراء؟
              </span>
              <span className="panel-subtitle">
                قائمة مفصلة بسلوك الزوار، عدد مرات تكرار الزيارة، وسلات
                المشتريات المتروكة
              </span>
            </div>

            {/* Filter buttons */}
            <div className="visitors-filter-group">
              <input
                type="text"
                placeholder="بحث بالاسم أو المدينة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-visitor-search"
              />

              <button
                type="button"
                className={`filter-btn ${filterType === "all" ? "active" : ""}`}
                onClick={() => setFilterType("all")}
              >
                الكل ({visitors.length})
              </button>
              <button
                type="button"
                className={`filter-btn ${
                  filterType === "qualified" ? "active" : ""
                }`}
                onClick={() => setFilterType("qualified")}
              >
                مؤهلون للخصم ({qualifiedCount})
              </button>
              <button
                type="button"
                className={`filter-btn ${
                  filterType === "converted" ? "active" : ""
                }`}
                onClick={() => setFilterType("converted")}
              >
                تم الشراء ({convertedCount})
              </button>
            </div>
          </div>

          <div className="table-responsive">
            <table className="doc-table visitors-table">
              <thead>
                <tr>
                  <th>الزائر / العميل</th>
                  <th>عدد الزيارات</th>
                  <th>الفارق الزمني والنشاط</th>
                  <th>المنتجات المشاهدة</th>
                  <th>قيمة السلة</th>
                  <th>حالة العرض</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {filteredVisitors.map((visitor) => {
                  const isQualified = checkVisitorEligibility(visitor, config);

                  return (
                    <tr
                      key={visitor.id}
                      className={isQualified ? "row-qualified" : ""}
                    >
                      <td>
                        <div className="visitor-identity-cell">
                          <span className="visitor-name">{visitor.name}</span>
                          <span className="visitor-sub-info">
                            {visitor.city} • {visitor.device}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div className="visit-counter-pill">
                          <span className="count-number">
                            {visitor.visitCount}
                          </span>
                          <span className="count-text">مرات</span>
                        </div>
                      </td>

                      <td>
                        <div className="activity-cell">
                          <span className="activity-desc">
                            {visitor.timeSpanText}
                          </span>
                          <span className="activity-ago">
                            آخر نشاط: {visitor.lastVisitedAgo}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div className="viewed-products-list">
                          {visitor.viewedProducts.map((pName, idx) => (
                            <span key={idx} className="viewed-tag">
                              {pName}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td>
                        {visitor.cartValue > 0 ? (
                          <span className="cart-val-tag">
                            {visitor.cartValue} {currency} (
                            {visitor.cartItemsCount} عناصر)
                          </span>
                        ) : (
                          <span className="cart-empty-tag">تصفح فقط</span>
                        )}
                      </td>

                      <td>
                        {visitor.status === "converted" ? (
                          <span className="visitor-status-tag converted">
                            ✅ اشترى بعد العرض
                          </span>
                        ) : visitor.status === "offered" ? (
                          <span className="visitor-status-tag offered">
                            📩 تم عرض المودال
                          </span>
                        ) : isQualified ? (
                          <span className="visitor-status-tag qualified">
                            🎯 مؤهل لخصم الـ {config.minVisits} زيارات
                          </span>
                        ) : (
                          <span className="visitor-status-tag watching">
                            ⏳ بانتظار الزيارة الثالثة
                          </span>
                        )}
                      </td>

                      <td>
                        <button
                          type="button"
                          className="btn-trigger-action"
                          onClick={() => handleOfferDirectDiscount(visitor)}
                          disabled={visitor.status === "converted"}
                          title="عرض النافذة فوراً للزائر وتطبيق الخصم"
                        >
                          {visitor.status === "converted"
                            ? "مكتمل"
                            : "تفعيل الخصم 🎁"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: Rules Builder & Modal Customizer */}
      {activeSubTab === "customizer" && (
        <div className="panel studio-panel">
          <div className="panel-header">
            <div>
              <span className="panel-title">
                قواعد التشغيل وتخصيص النافذة المنبثقة (Modal Customizer)
              </span>
              <span className="panel-subtitle">
                تحكم في شروط الاستهداف وكافة نصوص وألوان كود الخصم في متجرك
              </span>
            </div>
          </div>

          <div className="customizer-form-grid">
            {/* Rule 1: Frequency trigger */}
            <div className="form-section-card">
              <h4 className="section-card-title">
                1. قاعدة عدد الزيارات والتوقيت
              </h4>
              <p className="section-card-desc">
                حدد كم مرة يجب أن يزور العميل متجرك وفي أي فترة زمنية ليعتبر
                زائراً متكرراً.
              </p>

              <div className="form-field-group">
                <label htmlFor="minVisitsInput" className="form-label">
                  عدد مرات الدخول المطلوبة لإظهار الخصم:
                </label>
                <div className="input-number-wrap">
                  <input
                    id="minVisitsInput"
                    type="number"
                    min="2"
                    max="10"
                    value={config.minVisits}
                    onChange={(e) =>
                      handleConfigChange(
                        "minVisits",
                        parseInt(e.target.value, 10) || 3,
                      )
                    }
                    className="form-input"
                  />
                  <span className="input-unit">زيارات في وقت متقارب</span>
                </div>
              </div>

              <div className="form-field-group">
                <label htmlFor="timeWindowInput" className="form-label">
                  الإطار الزمني لتقارب الزيارات:
                </label>
                <select
                  id="timeWindowInput"
                  value={config.timeWindowMinutes}
                  onChange={(e) =>
                    handleConfigChange(
                      "timeWindowMinutes",
                      parseInt(e.target.value, 10),
                    )
                  }
                  className="form-select"
                >
                  <option value={15}>خلال 15 دقيقة (تقارب سريع جداً)</option>
                  <option value={30}>خلال 30 دقيقة (جلسة تصفح واحدة)</option>
                  <option value={60}>خلال ساعة واحدة (موصى به)</option>
                  <option value={180}>خلال 3 ساعات</option>
                  <option value={1440}>خلال 24 ساعة (نفس اليوم)</option>
                </select>
              </div>

              <div className="rule-badge-note">
                <Icon name="checkCircle" size={16} />
                <span>
                  الشرط الحالي: إذا دخل الزائر {config.minVisits} مرات خلال{" "}
                  {config.timeWindowMinutes} دقيقة ولم يسبق له الشراء، تنبثق
                  النافذة فوراً.
                </span>
              </div>
            </div>

            {/* Rule 2: Modal Content & Discount Customizer */}
            <div className="form-section-card">
              <h4 className="section-card-title">
                2. تخصيص محتوى وكود خصم النافذة
              </h4>
              <p className="section-card-desc">
                اكتب العنوان والنص المقنع الذي يشجع العميل على إتمام الشراء.
              </p>

              <div className="form-field-group">
                <label htmlFor="headlineInput" className="form-label">
                  عنوان النافذة (العنوان الجذاب):
                </label>
                <input
                  id="headlineInput"
                  type="text"
                  value={config.headline}
                  onChange={(e) =>
                    handleConfigChange("headline", e.target.value)
                  }
                  className="form-input"
                  placeholder="سعداء بزيارتك المتكررة..."
                />
              </div>

              <div className="form-field-group">
                <label htmlFor="messageInput" className="form-label">
                  نص الرسالة التشجيعية:
                </label>
                <textarea
                  id="messageInput"
                  rows="3"
                  value={config.message}
                  onChange={(e) =>
                    handleConfigChange("message", e.target.value)
                  }
                  className="form-textarea"
                />
              </div>

              <div className="form-row-dual">
                <div className="form-field-group">
                  <label htmlFor="couponInput" className="form-label">
                    كود الخصم في متجر سلة:
                  </label>
                  <input
                    id="couponInput"
                    type="text"
                    value={config.couponCode}
                    onChange={(e) =>
                      handleConfigChange(
                        "couponCode",
                        e.target.value.toUpperCase(),
                      )
                    }
                    className="form-input font-mono"
                    placeholder="SPECIAL3X"
                  />
                </div>

                <div className="form-field-group">
                  <label htmlFor="discountValInput" className="form-label">
                    نسبة الخصم (%):
                  </label>
                  <input
                    id="discountValInput"
                    type="number"
                    min="5"
                    max="90"
                    value={config.discountValue}
                    onChange={(e) =>
                      handleConfigChange(
                        "discountValue",
                        parseInt(e.target.value, 10) || 15,
                      )
                    }
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-field-group">
                <label htmlFor="ctaInput" className="form-label">
                  نص زر الشراء (CTA):
                </label>
                <input
                  id="ctaInput"
                  type="text"
                  value={config.ctaText}
                  onChange={(e) =>
                    handleConfigChange("ctaText", e.target.value)
                  }
                  className="form-input"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: Live Preview & 3-Visits Simulation */}
      {activeSubTab === "preview" && (
        <div className="panel studio-panel">
          <div className="panel-header">
            <div>
              <span className="panel-title">
                معاينة مباشرة ومحاكاة دخول العميل (Storefront Live Test)
              </span>
              <span className="panel-subtitle">
                جرب بنفسك كيف يرى العميل المتجر وكيف تظهر النافذة التلقائية عند
                الزيارة الثالثة
              </span>
            </div>

            <div className="preview-action-controls">
              <button
                type="button"
                className="btn-run-simulation"
                onClick={startSimulation}
                disabled={isSimulating}
              >
                <Icon name="sparkles" size={16} />
                <span>
                  {isSimulating
                    ? "جارٍ تشغيل محاكاة الزيارات..."
                    : "بدء محاكاة دخول زائر 3 مرات 🚀"}
                </span>
              </button>

              {simulationStep > 0 && (
                <button
                  type="button"
                  className="btn-reset-simulation"
                  onClick={resetSimulation}
                >
                  إعادة تعيين المحاكاة
                </button>
              )}
            </div>
          </div>

          {/* Simulation Status Steps Indicator */}
          {simulationStep > 0 && (
            <div className="simulation-stepper-box">
              <div className="stepper-title">حالة محاكاة الزائر في المتجر:</div>
              <div className="stepper-track">
                <div
                  className={`step-item ${simulationStep >= 1 ? "done" : ""}`}
                >
                  <span className="step-num">1</span>
                  <span className="step-txt">
                    الزيارة الأولى: تصفح الصفحة الرئيسية
                  </span>
                </div>
                <div className="step-divider" />
                <div
                  className={`step-item ${simulationStep >= 2 ? "done" : ""}`}
                >
                  <span className="step-num">2</span>
                  <span className="step-txt">
                    الزيارة الثانية: العودة بعد 3 دقائق ومقارنة المنتجات
                  </span>
                </div>
                <div className="step-divider" />
                <div
                  className={`step-item ${
                    simulationStep >= 3 ? "active-trigger" : ""
                  }`}
                >
                  <span className="step-num">3</span>
                  <span className="step-txt">
                    الزيارة الثالثة (الآن): تحقق الشرط وانبثاق المودال! 🎁
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Storefront Mockup Frame */}
          <div className="storefront-mockup-frame">
            <div className="storefront-browser-bar">
              <div className="browser-dots">
                <span className="dot red" />
                <span className="dot yellow" />
                <span className="dot green" />
              </div>
              <div className="browser-address">
                https://store.salla.sa/products
              </div>
            </div>

            {/* Embedded Storefront Preview Viewport */}
            <div className="storefront-viewport">
              {/* Background Mock Storefront Content */}
              <div className="mock-store-content">
                <div className="mock-nav">
                  <div className="mock-logo">متجرنا الرسمي</div>
                  <div className="mock-links">الرئيسية • المنتجات • العروض</div>
                </div>

                <div className="mock-products-grid">
                  {(products.slice(0, 3).length > 0
                    ? products.slice(0, 3)
                    : [
                        { id: 1, name: "عطر فاخر", price: 290 },
                        { id: 2, name: "ساعة أنيقة", price: 450 },
                        { id: 3, name: "حقيبة جلدية", price: 320 },
                      ]
                  ).map((p) => (
                    <div key={p.id} className="mock-product-card">
                      <div className="mock-prod-img" />
                      <div className="mock-prod-name">{p.name}</div>
                      <div className="mock-prod-price">
                        {p.price || 199} {currency}
                      </div>
                      <button type="button" className="mock-add-cart">
                        إضافة للسلة
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* The Interactive Pop-up Modal */}
              <StorefrontModalPreview
                config={config}
                isLiveSimulation={simulationStep === 3}
                onApplyDiscount={(code) => {
                  onShowToast?.(
                    `تم تطبيق كود الخصم (${code}) بنجاح!`,
                    "success",
                  );
                }}
                onClose={() => setSimulationStep(0)}
              />
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: Storefront Twilight Script Code */}
      {activeSubTab === "script" && (
        <div className="panel studio-panel">
          <div className="panel-header">
            <div>
              <span className="panel-title">
                كود تثبيت الإضافة في واجهة متجر سلة (Twilight Integration)
              </span>
              <span className="panel-subtitle">
                انسخ هذا الكود وضعه في إعدادات متجرك بسلة ليعمل التتبع وظهور
                النافذة تلقائياً
              </span>
            </div>

            <button
              type="button"
              className="btn-copy-script"
              onClick={handleCopyScript}
            >
              <Icon name="copy" size={16} />
              <span>
                {scriptCopied ? "تم النسخ بنجاح! ✓" : "نسخ كود التتبع"}
              </span>
            </button>
          </div>

          <div className="script-instructions-box">
            <h4 className="instructions-title">
              خطوات التفعيل في 3 خطوات بسيطة:
            </h4>
            <ol className="instructions-steps">
              <li>
                افتح لوحة تحكم سلة الخاصة بمتجرك:{" "}
                <strong>إعدادات المتجر</strong> &gt;{" "}
                <strong>تخصيص الروابط والأكواد</strong> (Custom Code).
              </li>
              <li>
                اختر تبويب <strong>أكواد التتبع المخصصة (أكواد إضافية)</strong>،
                أو ضعه داخل قالب <strong>Twilight</strong> الخاص بك.
              </li>
              <li>
                الصق الكود البرمجي أدناه واضغط <strong>حفظ</strong>. سيبدأ
                النظام فوراً برصد الزوار وإطلاق النافذة المخصصة عند زيارتهم
                الثالثة!
              </li>
            </ol>
          </div>

          <div className="code-block-container">
            <pre className="code-snippet-box">
              <code>{generateStorefrontTrackingScript(config)}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
