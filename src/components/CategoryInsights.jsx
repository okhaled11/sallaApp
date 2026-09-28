import { useId, useMemo } from "react";
import { Trophy, AlertTriangle, PackageX, MoonStar } from "lucide-react";
import Button from "./forms/Button.jsx";
import { buildCategoryInsights } from "../utils/categoryInsights.js";

const numberFormat = new Intl.NumberFormat();
const percentFormat = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 0,
});

const LOW_STOCK_OPTIONS = [3, 5, 10, 20];
// Keep cards compact: show the first few names, then "+N more"
const MAX_LISTED = 3;

function ProductNames({ items, detail }) {
  const shown = items.slice(0, MAX_LISTED);
  const rest = items.length - shown.length;
  return (
    <ul className="category-alert-items">
      {shown.map((product) => (
        <li key={product.id}>
          <span className="category-item-name">{product.name}</span>
          {detail && (
            <span className="category-item-detail">{detail(product)}</span>
          )}
        </li>
      ))}
      {rest > 0 && <li className="category-more">+{rest} more</li>}
    </ul>
  );
}

function CategoryCard({ category, onSelect, isSelected }) {
  const titleId = useId();
  const {
    name,
    productCount,
    totalSold,
    salesShare,
    topSellers,
    runningLow,
    outOfStock,
    neverSold,
  } = category;
  const hasAlerts = runningLow.length > 0 || outOfStock.length > 0;

  return (
    <article
      className={`category-card ${isSelected ? "category-card-selected" : ""}`}
      aria-labelledby={titleId}
    >
      <header className="category-card-header">
        <h3 id={titleId} className="category-name">
          {name}
        </h3>
        <span className="category-meta">
          {numberFormat.format(productCount)} products ·{" "}
          {numberFormat.format(totalSold)} sold
        </span>
        <div
          className="category-share"
          title={`${percentFormat.format(salesShare)} of store sales`}
        >
          <div className="category-share-bar" aria-hidden="true">
            <span style={{ width: `${Math.min(salesShare, 1) * 100}%` }} />
          </div>
          <span className="category-share-value">
            {percentFormat.format(salesShare)} of sales
          </span>
        </div>
      </header>

      <section className="category-section">
        <h4 className="category-section-title">
          <Trophy size={14} /> Top sellers
        </h4>
        {topSellers.length ? (
          <ol className="category-top-list">
            {topSellers.map((product) => (
              <li key={product.id}>
                <span className="category-item-name">{product.name}</span>
                <span className="category-item-detail">
                  {numberFormat.format(product.soldQuantity)} sold
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="category-empty">No sales yet</p>
        )}
      </section>

      <section className="category-section">
        <h4 className="category-section-title">
          <AlertTriangle size={14} /> Stock alerts
        </h4>
        {!hasAlerts && <p className="category-empty">All in stock</p>}
        {outOfStock.length > 0 && (
          <div className="category-alert category-alert-out">
            <span className="category-alert-label">
              <PackageX size={14} /> {outOfStock.length} out of stock
            </span>
            <ProductNames items={outOfStock} />
          </div>
        )}
        {runningLow.length > 0 && (
          <div className="category-alert category-alert-low">
            <span className="category-alert-label">
              <AlertTriangle size={14} /> {runningLow.length} running low
            </span>
            <ProductNames
              items={runningLow}
              detail={(product) => `${product.quantity} left`}
            />
          </div>
        )}
        {neverSold.length > 0 && (
          <p className="category-never-sold">
            <MoonStar size={14} /> {neverSold.length} never sold
          </p>
        )}
      </section>

      <footer className="category-card-footer">
        <Button
          size="small"
          variant={isSelected ? "primary" : "default"}
          aria-pressed={isSelected}
          onClick={() => onSelect(isSelected ? null : category)}
        >
          {isSelected ? "Showing products" : "View products"}
        </Button>
      </footer>
    </article>
  );
}

/**
 * Category insights: for each category, best sellers and what is running out.
 */
export default function CategoryInsights({
  products,
  lowStockLimit,
  onLowStockLimitChange,
  selectedCategoryId,
  onSelectCategory,
}) {
  const limitId = useId();
  const categories = useMemo(
    () => buildCategoryInsights(products, { lowStockLimit }),
    [products, lowStockLimit],
  );

  const alertCount = categories.reduce(
    (sum, c) => sum + c.runningLow.length + c.outOfStock.length,
    0,
  );

  return (
    <section
      className="panel category-panel"
      aria-labelledby={`${limitId}-title`}
    >
      <div className="panel-header">
        <div>
          <h2 id={`${limitId}-title`} className="panel-title">
            Category insights
          </h2>
          <span className="panel-subtitle">
            {numberFormat.format(categories.length)} categories ·{" "}
            {numberFormat.format(alertCount)} stock alerts · a product can count
            in more than one category
          </span>
        </div>
        <div className="panel-actions">
          <label htmlFor={limitId} className="category-limit-label">
            Running low at
          </label>
          <select
            id={limitId}
            className="category-limit-select"
            value={lowStockLimit}
            onChange={(e) => onLowStockLimitChange(Number(e.target.value))}
          >
            {LOW_STOCK_OPTIONS.map((value) => (
              <option key={value} value={value}>
                ≤ {value} pcs
              </option>
            ))}
          </select>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="products-state">No products to analyze yet.</div>
      ) : (
        <div className="category-grid">
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              isSelected={selectedCategoryId === category.id}
              onSelect={onSelectCategory}
            />
          ))}
        </div>
      )}
    </section>
  );
}
