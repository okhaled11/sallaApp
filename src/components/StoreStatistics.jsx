import { useId, useMemo, useState } from "react";
import Icon from "./Icon.jsx";
import Button from "./forms/Button.jsx";
import { buildStoreStats } from "../utils/storeStats.js";

const numberFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});
const percentFormat = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 1,
});

function formatMoney(amount, currency) {
  if (amount === null || amount === undefined || isNaN(amount)) return "—";
  return `${numberFormat.format(amount)} ${currency || ""}`.trim();
}

function MarginBadge({ margin }) {
  if (margin === null || margin === undefined) return null;
  const tone = margin < 0 ? "loss" : margin < 0.15 ? "thin" : "good";
  return (
    <span className={`margin-badge margin-badge-${tone}`}>
      {percentFormat.format(margin)}
    </span>
  );
}

export default function StoreStatistics({
  products = [],
  currency = "",
  onEditProduct,
  onSelectCategory,
  selectedCategoryId = null,
}) {
  const titleId = useId();
  const [activeTab, setActiveTab] = useState("all"); // 'all' | 'drivers' | 'categories' | 'risks'

  const stats = useMemo(() => buildStoreStats(products), [products]);
  const {
    kpis,
    topProfitDrivers,
    categoryProfitBreakdown,
    topCategory,
    lossMakers,
    totalLoss,
    missingCostTopSellers,
  } = stats;

  const resolvedCurrency =
    currency || products.find((p) => p.currency)?.currency || "";

  return (
    <section className="panel store-stats-panel" aria-labelledby={titleId}>
      {/* Header */}
      <div className="store-stats-header">
        <div className="store-stats-header-info">
          <div className="store-stats-title-wrap">
            <div className="stats-icon-badge">
              <Icon name="analytics" size={20} />
            </div>
            <div>
              <h2 id={titleId} className="panel-title store-stats-title">
                إحصائيات المتجر ومحركات الأرباح
              </h2>
              <span className="panel-subtitle">
                تحليل شامل للإيرادات، المنتجات الأكثر ربحية، ومصادر الدخل
              </span>
            </div>
          </div>
        </div>

        {/* View Tabs */}
        <div className="store-stats-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "all"}
            className={`stats-tab-btn ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            نظرة شاملة
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "drivers"}
            className={`stats-tab-btn ${activeTab === "drivers" ? "active" : ""}`}
            onClick={() => setActiveTab("drivers")}
          >
            الأكثر ربحية ({topProfitDrivers.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "categories"}
            className={`stats-tab-btn ${activeTab === "categories" ? "active" : ""}`}
            onClick={() => setActiveTab("categories")}
          >
            أرباح الأقسام
          </button>
          {(lossMakers.length > 0 || missingCostTopSellers.length > 0) && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "risks"}
              className={`stats-tab-btn stats-tab-alert ${activeTab === "risks" ? "active" : ""}`}
              onClick={() => setActiveTab("risks")}
            >
              فرص وتنبيهات (
              {lossMakers.length + (missingCostTopSellers.length > 0 ? 1 : 0)})
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="store-stats-kpi-grid">
        {/* KPI 1: Revenue */}
        <div className="stats-kpi-card">
          <div className="stats-kpi-header">
            <span className="stats-kpi-title">إجمالي المبيعات</span>
            <div className="stats-kpi-icon revenue-icon">
              <Icon name="coins" size={18} />
            </div>
          </div>
          <div className="stats-kpi-value">
            {formatMoney(kpis.totalRevenue, resolvedCurrency)}
          </div>
          <div className="stats-kpi-footer">
            <span className="stats-kpi-sub">
              تم بيع <strong>{numberFormat.format(kpis.totalSoldUnits)}</strong>{" "}
              وحدة
            </span>
          </div>
        </div>

        {/* KPI 2: Net Profit */}
        <div className="stats-kpi-card highlight-profit">
          <div className="stats-kpi-header">
            <span className="stats-kpi-title">صافي الربح المتوقع</span>
            <div className="stats-kpi-icon profit-icon">
              <Icon name="analyticsUp" size={18} />
            </div>
          </div>
          <div className="stats-kpi-value profit-number">
            {kpis.withCostCount > 0
              ? formatMoney(kpis.totalProfit, resolvedCurrency)
              : "—"}
          </div>
          <div className="stats-kpi-footer">
            <span className="stats-kpi-sub">
              متوسط الهامش:{" "}
              {kpis.overallMargin !== null ? (
                <MarginBadge margin={kpis.overallMargin} />
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>

        {/* KPI 3: Top Category */}
        <div className="stats-kpi-card">
          <div className="stats-kpi-header">
            <span className="stats-kpi-title">القسم الأعلى أرباحاً</span>
            <div className="stats-kpi-icon trophy-icon">
              <Icon name="trophy" size={18} />
            </div>
          </div>
          <div className="stats-kpi-value">
            {topCategory ? topCategory.name : "—"}
          </div>
          <div className="stats-kpi-footer">
            <span className="stats-kpi-sub">
              {topCategory
                ? `${formatMoney(topCategory.profit, resolvedCurrency)} (${percentFormat.format(topCategory.profitShare / 100)})`
                : "لا توجد بيانات"}
            </span>
          </div>
        </div>

        {/* KPI 4: Idle Capital */}
        <div className="stats-kpi-card">
          <div className="stats-kpi-header">
            <span className="stats-kpi-title">رأس المال في المخزون الراكد</span>
            <div className="stats-kpi-icon idle-icon">
              <Icon name="snow" size={18} />
            </div>
          </div>
          <div className="stats-kpi-value">
            {formatMoney(kpis.idleStockValue, resolvedCurrency)}
          </div>
          <div className="stats-kpi-footer">
            <span className="stats-kpi-sub">
              في <strong>{kpis.idleStockCount}</strong> منتج بلا أي مبيعات
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Panels */}
      <div className="store-stats-details">
        {/* Section: Top Profit Drivers */}
        {(activeTab === "all" || activeTab === "drivers") && (
          <div className="stats-subpanel profit-drivers-subpanel">
            <div className="subpanel-header">
              <div className="subpanel-title-wrap">
                <Icon name="trophy" size={16} className="text-accent" />
                <h3 className="subpanel-title">
                  محركات الأرباح: المنتجات الأكثر تحقيقاً للأرباح
                </h3>
              </div>
              <span className="subpanel-tag">
                المنتجات التي تجلب معظم صافي دخل المتجر
              </span>
            </div>

            {topProfitDrivers.length > 0 ? (
              <div className="drivers-list">
                {topProfitDrivers.map((driver, index) => (
                  <div key={driver.product.id} className="driver-item">
                    <div className="driver-rank-badge">{index + 1}</div>
                    <div className="driver-main-info">
                      <div className="driver-name-row">
                        <span className="driver-product-name">
                          {driver.product.name}
                        </span>
                        <MarginBadge margin={driver.margin} />
                      </div>
                      <div className="driver-share-bar-container">
                        <div
                          className="driver-share-bar"
                          style={{
                            width: `${Math.min(driver.profitShare, 100)}%`,
                          }}
                        />
                      </div>
                      <div className="driver-meta">
                        <span>
                          بيع منه: <strong>{driver.soldQuantity}</strong> وحدة
                        </span>
                        <span>·</span>
                        <span>
                          ربح القطعة:{" "}
                          <strong>
                            {formatMoney(driver.unitProfit, resolvedCurrency)}
                          </strong>
                        </span>
                        <span>·</span>
                        <span className="driver-share-text">
                          يمثل{" "}
                          <strong>
                            {percentFormat.format(driver.profitShare / 100)}
                          </strong>{" "}
                          من إجمالي أرباح المتجر
                        </span>
                      </div>
                    </div>

                    <div className="driver-profit-col">
                      <span className="driver-profit-val">
                        +{formatMoney(driver.totalProfit, resolvedCurrency)}
                      </span>
                      {onEditProduct && (
                        <button
                          type="button"
                          className="driver-edit-btn"
                          onClick={() => onEditProduct(driver.product)}
                          title="تعديل المنتج"
                        >
                          تعديل
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-stats-state">
                <Icon name="invoice" size={24} />
                <p>
                  لم يتم تحديد أسعار التكلفة للمنتجات حتى الآن لحساب أرباحها.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Section: Category Profit Breakdown */}
        {(activeTab === "all" || activeTab === "categories") && (
          <div className="stats-subpanel category-breakdown-subpanel">
            <div className="subpanel-header">
              <div className="subpanel-title-wrap">
                <Icon name="barChart" size={16} className="text-accent" />
                <h3 className="subpanel-title">مساهمة الأقسام في الأرباح</h3>
              </div>
              <span className="subpanel-tag">
                مقارنة صافي الأرباح وهوامش الربح عبر الأقسام
              </span>
            </div>

            {categoryProfitBreakdown.length > 0 ? (
              <div className="category-profit-list">
                {categoryProfitBreakdown.map((cat) => {
                  const isSelected = selectedCategoryId === cat.id;
                  return (
                    <div
                      key={cat.id}
                      className={`cat-profit-row ${isSelected ? "selected-row" : ""}`}
                      onClick={() => onSelectCategory && onSelectCategory(cat)}
                      role={onSelectCategory ? "button" : undefined}
                      tabIndex={onSelectCategory ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (
                          onSelectCategory &&
                          (e.key === "Enter" || e.key === " ")
                        ) {
                          e.preventDefault();
                          onSelectCategory(cat);
                        }
                      }}
                    >
                      <div className="cat-profit-info">
                        <div className="cat-profit-name-row">
                          <span className="cat-name">{cat.name}</span>
                          <span className="cat-units-meta">
                            {cat.productCount} منتج · {cat.totalSold} مبيعات
                          </span>
                        </div>
                        <div className="cat-progress-track">
                          <div
                            className="cat-progress-fill"
                            style={{
                              width: `${Math.max(
                                4,
                                Math.min(cat.profitShare, 100),
                              )}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="cat-profit-numbers">
                        <div className="cat-profit-total">
                          {cat.profit > 0 ? "+" : ""}
                          {formatMoney(cat.profit, resolvedCurrency)}
                        </div>
                        <MarginBadge margin={cat.margin} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-stats-state">
                <p>لا توجد بيانات أقسام متاحة.</p>
              </div>
            )}
          </div>
        )}

        {/* Section: Risks and Opportunities */}
        {(activeTab === "all" || activeTab === "risks") && (
          <div className="stats-subpanel risks-subpanel">
            <div className="subpanel-header">
              <div className="subpanel-title-wrap">
                <Icon name="alert" size={16} className="text-warning" />
                <h3 className="subpanel-title">
                  تنبيهات تسريب الأرباح والفرص الضائعة
                </h3>
              </div>
            </div>

            {lossMakers.length > 0 && (
              <div className="stats-alert-banner alert-danger">
                <div className="alert-content">
                  <div className="alert-header">
                    <Icon name="trendDown" size={16} />
                    <strong>
                      {lossMakers.length} منتجات تُباع بخسارة مالية!
                    </strong>
                  </div>
                  <p>
                    هذه المنتجات تباع بسعر أقل من تكلفة شرائها، مما تسبب في نزيف
                    أرباح بقيمة{" "}
                    <strong>{formatMoney(totalLoss, resolvedCurrency)}</strong>.
                  </p>
                  <div className="loss-items-list">
                    {lossMakers.slice(0, 3).map((item) => (
                      <div key={item.product.id} className="loss-item-pill">
                        <span>{item.product.name}</span>
                        <span className="loss-badge">
                          خسارة:{" "}
                          {formatMoney(
                            Math.abs(item.totalProfit),
                            resolvedCurrency,
                          )}
                        </span>
                        {onEditProduct && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onEditProduct(item.product)}
                          >
                            تعديل السعر
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {missingCostTopSellers.length > 0 && (
              <div className="stats-alert-banner alert-info">
                <div className="alert-content">
                  <div className="alert-header">
                    <Icon name="invoice" size={16} />
                    <strong>
                      منتجات ذات مبيعات عالية لكن بدون تحديد سعر التكلفة
                    </strong>
                  </div>
                  <p>
                    إدخال سعر التكلفة لهذه المنتجات سيمنحك حساباً دقيقاً بنسبة
                    100% لصافي أرباح متجرك.
                  </p>
                  <div className="missing-cost-pills">
                    {missingCostTopSellers.slice(0, 4).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="missing-cost-tag"
                        onClick={() => onEditProduct && onEditProduct(p)}
                      >
                        {p.name} ({p.soldQuantity} مبيعات) + أضف التكلفة
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {lossMakers.length === 0 && missingCostTopSellers.length === 0 && (
              <div className="stats-all-good-box">
                <Icon name="trophy" size={20} className="text-success" />
                <p>
                  ممتاز! لا توجد منتجات تباع بخسارة، وجميع المنتجات الأكثر
                  مبيعاً مُسعرة التكلفة بدقة.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
