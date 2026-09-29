import { useEffect, useRef } from "react";
import Icon from "./Icon.jsx";
import Button from "./forms/Button.jsx";
import { generateProfitCsv, downloadFile } from "../utils/reportExport.js";

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

export default function StoreReportModal({
  isOpen,
  onClose,
  products = [],
  stats,
  currency = "SAR",
}) {
  const modalRef = useRef(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const {
    kpis,
    topProfitDrivers,
    categoryProfitBreakdown,
    lossMakers,
    totalLoss,
    missingCostTopSellers,
  } = stats;

  const currentDate = new Date().toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const csvData = generateProfitCsv(products, currency);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadFile(csvData, `تقرير-أرباح-المتجر-${dateStr}.csv`);
  };

  return (
    <div className="report-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="report-modal-content"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
      >
        {/* Actions bar (hidden in print) */}
        <div className="report-modal-actions no-print">
          <div className="report-actions-left">
            <Button variant="primary" onClick={handlePrint}>
              <Icon name="printer" size={16} />
              طباعة / حفظ كـ PDF
            </Button>
            <Button variant="default" onClick={handleExportCsv}>
              <Icon name="download" size={16} />
              تصدير ملف Excel (CSV)
            </Button>
          </div>
          <button
            type="button"
            className="btn-icon report-close-btn"
            onClick={onClose}
            aria-label="إغلاق التقرير"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Printable Document Content */}
        <div className="report-document-body" id="printable-profit-report">
          {/* Document Header */}
          <div className="doc-header">
            <div className="doc-header-main">
              <div className="doc-badge">
                <Icon name="analytics" size={18} />
                <span>تقرير رسمي</span>
              </div>
              <h1 id="report-modal-title" className="doc-title">
                تقرير الأداء المالي وربحية المتجر
              </h1>
              <p className="doc-subtitle">
                تحليل شامل للإيرادات، هوامش الربح، والمحركات الأساسية للدخل
              </p>
            </div>
            <div className="doc-meta">
              <div className="doc-meta-item">
                <span className="doc-meta-label">تاريخ التقرير:</span>
                <span className="doc-meta-value">{currentDate}</span>
              </div>
              <div className="doc-meta-item">
                <span className="doc-meta-label">إجمالي المنتجات:</span>
                <span className="doc-meta-value">{products.length} منتج</span>
              </div>
              <div className="doc-meta-item">
                <span className="doc-meta-label">العملة:</span>
                <span className="doc-meta-value">{currency}</span>
              </div>
            </div>
          </div>

          {/* Executive Summary Cards */}
          <div className="doc-summary-grid">
            <div className="doc-summary-card">
              <span className="doc-summary-label">إجمالي المبيعات</span>
              <span className="doc-summary-num">
                {formatMoney(kpis.totalRevenue, currency)}
              </span>
              <span className="doc-summary-sub">
                {numberFormat.format(kpis.totalSoldUnits)} وحدة مباعة
              </span>
            </div>

            <div className="doc-summary-card highlight">
              <span className="doc-summary-label">صافي الأرباح المحققة</span>
              <span className="doc-summary-num profit-num">
                {kpis.withCostCount > 0
                  ? formatMoney(kpis.totalProfit, currency)
                  : "—"}
              </span>
              <span className="doc-summary-sub">
                متوسط الهامش:{" "}
                {kpis.overallMargin !== null
                  ? percentFormat.format(kpis.overallMargin)
                  : "—"}
              </span>
            </div>

            <div className="doc-summary-card">
              <span className="doc-summary-label">تغطية أسعار التكلفة</span>
              <span className="doc-summary-num">
                {percentFormat.format(kpis.costCoverage / 100)}
              </span>
              <span className="doc-summary-sub">
                {kpis.withCostCount} من {kpis.productsCount} منتج محدد تكلفته
              </span>
            </div>

            <div className="doc-summary-card">
              <span className="doc-summary-label">رأس المال الراكد</span>
              <span className="doc-summary-num">
                {formatMoney(kpis.idleStockValue, currency)}
              </span>
              <span className="doc-summary-sub">
                في {kpis.idleStockCount} منتج بلا مبيعات
              </span>
            </div>
          </div>

          {/* Table: Top Profit Drivers */}
          <div className="doc-section">
            <h2 className="doc-section-title">
              1. المحركات الرئيسية للأرباح (أعلى المنتجات توليداً للدخل)
            </h2>
            <div className="doc-table-wrapper">
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>اسم المنتج</th>
                    <th>سعر البيع</th>
                    <th>التكلفة</th>
                    <th>ربح القطعة</th>
                    <th>هامش الربح</th>
                    <th>المباع</th>
                    <th>صافي الربح</th>
                    <th>المساهمة</th>
                  </tr>
                </thead>
                <tbody>
                  {topProfitDrivers.map((driver, index) => (
                    <tr key={driver.product.id}>
                      <td className="doc-td-rank">{index + 1}</td>
                      <td className="doc-td-name">{driver.product.name}</td>
                      <td>{formatMoney(driver.product.price, currency)}</td>
                      <td>{formatMoney(driver.product.costPrice, currency)}</td>
                      <td>+{formatMoney(driver.unitProfit, currency)}</td>
                      <td>{percentFormat.format(driver.margin)}</td>
                      <td>{driver.soldQuantity}</td>
                      <td className="doc-td-profit">
                        +{formatMoney(driver.totalProfit, currency)}
                      </td>
                      <td>{percentFormat.format(driver.profitShare / 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Table: Category Breakdown */}
          <div className="doc-section">
            <h2 className="doc-section-title">
              2. توزيع الأرباح حسب أقسام المتجر
            </h2>
            <div className="doc-table-wrapper">
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>اسم القسم</th>
                    <th>عدد المنتجات</th>
                    <th>الوحدات المباعة</th>
                    <th>إجمالي الإيرادات</th>
                    <th>صافي الأرباح</th>
                    <th>هامش الربح</th>
                    <th>نسبة المساهمة</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryProfitBreakdown.map((cat) => (
                    <tr key={cat.id}>
                      <td className="doc-td-name">{cat.name}</td>
                      <td>{cat.productCount}</td>
                      <td>{cat.totalSold}</td>
                      <td>{formatMoney(cat.revenue, currency)}</td>
                      <td className="doc-td-profit">
                        {cat.profit > 0 ? "+" : ""}
                        {formatMoney(cat.profit, currency)}
                      </td>
                      <td>
                        {cat.margin !== null
                          ? percentFormat.format(cat.margin)
                          : "—"}
                      </td>
                      <td>{percentFormat.format(cat.profitShare / 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section: Risk & Leakage Audit */}
          {(lossMakers.length > 0 || missingCostTopSellers.length > 0) && (
            <div className="doc-section page-break-inside-avoid">
              <h2 className="doc-section-title">
                3. تدقيق تسريب الأرباح والفرص الضائعة
              </h2>

              {lossMakers.length > 0 && (
                <div className="doc-audit-box doc-audit-danger">
                  <strong>
                    ⚠️ تنبيه: {lossMakers.length} منتجات تباع بخسارة تسببت في
                    نزيف أرباح قدره {formatMoney(totalLoss, currency)}:
                  </strong>
                  <ul>
                    {lossMakers.map((lm) => (
                      <li key={lm.product.id}>
                        {lm.product.name}: سعر البيع{" "}
                        {formatMoney(lm.product.price, currency)} مقابل تكلفة{" "}
                        {formatMoney(lm.product.costPrice, currency)} (خسارة{" "}
                        {formatMoney(Math.abs(lm.totalProfit), currency)})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {missingCostTopSellers.length > 0 && (
                <div className="doc-audit-box doc-audit-info">
                  <strong>
                    ℹ️ منتجات نشطة في المبيعات بدون سعر تكلفة محدد:
                  </strong>
                  <p>
                    {missingCostTopSellers
                      .slice(0, 5)
                      .map((p) => `${p.name} (${p.soldQuantity} مبيعات)`)
                      .join("، ")}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Document Footer */}
          <div className="doc-footer">
            <p>
              تم استخراج وتوليد هذا التقرير تلقائياً عبر تطبيق تحليلات الأرباح
              لمتجر سلة.
            </p>
            <p className="doc-footer-meta">
              تاريخ الطباعة: {new Date().toLocaleString("ar-SA")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
