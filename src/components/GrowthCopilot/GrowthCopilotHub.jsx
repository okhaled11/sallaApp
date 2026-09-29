import { useState, useMemo, useCallback } from "react";
import Icon from "../Icon.jsx";
import OpportunityCard from "./OpportunityCard.jsx";
import SeoCopyModal from "./SeoCopyModal.jsx";
import {
  analyzeCatalog,
  OPPORTUNITY_TYPES,
} from "../../utils/copilotEngine.js";

/**
 * GrowthCopilotHub - AI Growth Copilot & Catalog Enhancer for Salla Merchants
 */
export default function GrowthCopilotHub({
  products = [],
  currency = "SAR",
  onUpdateProduct,
  onEditProduct,
}) {
  const [activeFilter, setActiveFilter] = useState("all");
  const [dismissedIds, setDismissedIds] = useState(new Set());
  const [activeSeoModalOpp, setActiveSeoModalOpp] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Run catalog analysis
  const { opportunities: allOpportunities, summary } = useMemo(
    () => analyzeCatalog(products),
    [products],
  );

  // Filter out dismissed
  const visibleOpportunities = useMemo(() => {
    return allOpportunities.filter((opp) => !dismissedIds.has(opp.id));
  }, [allOpportunities, dismissedIds]);

  // Apply category & search filters
  const filteredOpportunities = useMemo(() => {
    let list = visibleOpportunities;

    if (activeFilter === "price") {
      list = list.filter(
        (o) => o.type === OPPORTUNITY_TYPES.PRICE_OPTIMIZATION,
      );
    } else if (activeFilter === "seo") {
      list = list.filter((o) => o.type === OPPORTUNITY_TYPES.SEO_COPYWRITING);
    } else if (activeFilter === "margin") {
      list = list.filter((o) => o.type === OPPORTUNITY_TYPES.MARGIN_DEFENSE);
    } else if (activeFilter === "inventory") {
      list = list.filter(
        (o) =>
          o.type === OPPORTUNITY_TYPES.DEADSTOCK_REVIVAL ||
          o.type === OPPORTUNITY_TYPES.STOCK_URGENCY,
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (o) =>
          o.product?.name?.toLowerCase().includes(q) ||
          o.badge?.toLowerCase().includes(q) ||
          o.rationale?.toLowerCase().includes(q),
      );
    }

    return list;
  }, [visibleOpportunities, activeFilter, searchQuery]);

  const handleDismiss = useCallback((id) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  }, []);

  const handleResetDismissed = useCallback(() => {
    setDismissedIds(new Set());
  }, []);

  const handleApplyPrice = useCallback(
    async (productId, newPrice) => {
      if (!onUpdateProduct) return;
      const res = await onUpdateProduct(productId, { price: newPrice });
      return res;
    },
    [onUpdateProduct],
  );

  if (!products || products.length === 0) {
    return null;
  }

  const { totalProjectedGain, healthScore, breakdown } = summary;

  return (
    <section
      className="copilot-hub-section"
      aria-label="مساعد النمو الذكي والذكاء الاصطناعي"
    >
      {/* Copilot Header */}
      <header className="copilot-header">
        <div className="copilot-header-brand">
          <div className="copilot-logo-glow">
            <Icon name="sparkles" size={24} />
          </div>
          <div>
            <div className="copilot-title-row">
              <h2 className="copilot-main-title">مساعد النمو الذكي للكتالوج</h2>
              <span className="copilot-ai-chip">
                <span className="copilot-pulse-dot" />
                AI Copilot Live
              </span>
            </div>
            <p className="copilot-subtitle">
              تحليل مباشر للكتالوج واكتشاف فرص تعظيم الأرباح، تحسين السيو،
              وحماية الهوامش الربحية.
            </p>
          </div>
        </div>

        {/* Quick Metrics Bar */}
        <div className="copilot-kpi-bar">
          <div className="copilot-kpi-card highlight-card">
            <span className="copilot-kpi-label">أرباح إضافية متوقعة</span>
            <div className="copilot-kpi-val text-success">
              +{totalProjectedGain.toLocaleString()} {currency}
            </div>
            <span className="copilot-kpi-hint">من خلال تطبيق التوصيات</span>
          </div>

          <div className="copilot-kpi-card">
            <span className="copilot-kpi-label">فرص نمو مكتشفة</span>
            <div className="copilot-kpi-val text-primary">
              {visibleOpportunities.length}
            </div>
            <span className="copilot-kpi-hint">
              {dismissedIds.size > 0 && `(تم إنجاز/تخطي ${dismissedIds.size})`}
            </span>
          </div>

          <div className="copilot-kpi-card">
            <span className="copilot-kpi-label">مؤشر جودة الكتالوج</span>
            <div className="copilot-kpi-val text-score">
              {healthScore}
              <small>/100</small>
            </div>
            <div className="copilot-progress-track">
              <div
                className="copilot-progress-fill"
                style={{ width: `${healthScore}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Quick Prompts Bar / Prompt Pills */}
      <div className="copilot-prompts-bar">
        <span className="copilot-prompts-label">
          <Icon name="idea" size={15} /> أسئلة وتوصيات سريعة:
        </span>
        <button
          type="button"
          className={`copilot-prompt-pill ${activeFilter === "price" ? "active" : ""}`}
          onClick={() => setActiveFilter(activeFilter === "price" ? "all" : "price")}
        >
          💰 فرص رفع الأسعار ({breakdown.priceOptimization})
        </button>
        <button
          type="button"
          className={`copilot-prompt-pill ${activeFilter === "margin" ? "active" : ""}`}
          onClick={() => setActiveFilter(activeFilter === "margin" ? "all" : "margin")}
        >
          🛡️ حماية الهامش والبيع بخسارة ({breakdown.marginDefense})
        </button>
        <button
          type="button"
          className={`copilot-prompt-pill ${activeFilter === "seo" ? "active" : ""}`}
          onClick={() => setActiveFilter(activeFilter === "seo" ? "all" : "seo")}
        >
          ✨ نصوص السيو والوصف الذكي ({breakdown.seoCopywriting})
        </button>
        <button
          type="button"
          className={`copilot-prompt-pill ${activeFilter === "inventory" ? "active" : ""}`}
          onClick={() =>
            setActiveFilter(activeFilter === "inventory" ? "all" : "inventory")
          }
        >
          📦 البضائع الراكدة ومخاطر النفاد (
          {breakdown.deadstockRevival + breakdown.stockUrgency})
        </button>
      </div>

      {/* Filter Tabs & Search */}
      <div className="copilot-toolbar">
        <div className="copilot-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "all"}
            className={`copilot-tab ${activeFilter === "all" ? "active" : ""}`}
            onClick={() => setActiveFilter("all")}
          >
            جميع التوصيات ({visibleOpportunities.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "price"}
            className={`copilot-tab ${activeFilter === "price" ? "active" : ""}`}
            onClick={() => setActiveFilter("price")}
          >
            الأرباح والتسعير ({breakdown.priceOptimization})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "seo"}
            className={`copilot-tab ${activeFilter === "seo" ? "active" : ""}`}
            onClick={() => setActiveFilter("seo")}
          >
            السيو والمحتوى ({breakdown.seoCopywriting})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "margin"}
            className={`copilot-tab ${activeFilter === "margin" ? "active" : ""}`}
            onClick={() => setActiveFilter("margin")}
          >
            حماية الهامش ({breakdown.marginDefense})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeFilter === "inventory"}
            className={`copilot-tab ${activeFilter === "inventory" ? "active" : ""}`}
            onClick={() => setActiveFilter("inventory")}
          >
            المخزون ({breakdown.deadstockRevival + breakdown.stockUrgency})
          </button>
        </div>

        <div className="copilot-search-wrap">
          <input
            type="search"
            className="copilot-search-input"
            placeholder="بحث في توصيات المساعد الذكي..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="بحث في توصيات المساعد الذكي"
          />
        </div>
      </div>

      {/* Cards Grid */}
      {filteredOpportunities.length > 0 ? (
        <div className="copilot-cards-grid">
          {filteredOpportunities.map((opp) => (
            <OpportunityCard
              key={opp.id}
              opportunity={opp}
              currency={currency}
              onApplyPrice={handleApplyPrice}
              onOpenSeoModal={setActiveSeoModalOpp}
              onEditProduct={onEditProduct}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      ) : (
        <div className="copilot-empty-state">
          <div className="copilot-empty-icon">
            <Icon name="checkBadge" size={40} />
          </div>
          <h4 className="copilot-empty-title">
            {searchQuery
              ? "لا توجد نتائج مطابقة لبحثك"
              : dismissedIds.size > 0 && visibleOpportunities.length === 0
                ? "رائع! لقد راجعت جميع التوصيات الذكية لكتالوجك"
                : "كتالوجك في أفضل حالاته حالياً!"}
          </h4>
          <p className="copilot-empty-desc">
            {searchQuery
              ? "جرب البحث بكلمة أخرى أو تصفح الأقسام المقترحة أعلاه."
              : "يقوم المساعد الذكي بفحص المبيعات والأسعار بانتظام وسيقترح عليك فرصاً جديدة تلقائياً."}
          </p>
          {dismissedIds.size > 0 && (
            <button
              type="button"
              className="btn btn-secondary copilot-reset-dismissed-btn"
              onClick={handleResetDismissed}
            >
              <Icon name="sparkles" size={16} />
              <span>إعادة عرض التوصيات التي تم تخطيها ({dismissedIds.size})</span>
            </button>
          )}
        </div>
      )}

      {/* SEO Copy Modal */}
      <SeoCopyModal
        isOpen={Boolean(activeSeoModalOpp)}
        opportunity={activeSeoModalOpp}
        onClose={() => setActiveSeoModalOpp(null)}
        onEditProduct={onEditProduct}
      />
    </section>
  );
}
