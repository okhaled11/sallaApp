import { useId, useMemo, useState } from "react";
import { Coins, TrendingDown, CircleHelp } from "lucide-react";
import Button from "./forms/Button.jsx";
import { buildProfitInsights } from "../utils/profitInsights.js";

const numberFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});
const percentFormat = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 0,
});

const MAX_MISSING_LISTED = 3;

function formatMoney(amount, currency) {
  return `${numberFormat.format(amount)} ${currency || ""}`.trim();
}

function MarginBadge({ margin }) {
  if (margin === null) return null;
  const tone = margin < 0 ? "loss" : margin < 0.15 ? "thin" : "good";
  return (
    <span className={`margin-badge margin-badge-${tone}`}>
      {percentFormat.format(margin)}
    </span>
  );
}

/**
 * Profit card: estimated profit, average margin, who earns the money,
 * thin margins, and products still missing a cost price.
 */
export default function ProfitInsights({ products, onEditProduct }) {
  const titleId = useId();
  const insights = useMemo(() => buildProfitInsights(products), [products]);
  const currency = products.find((p) => p.currency)?.currency;
  const {
    totalProfit,
    averageMargin,
    coverage,
    leaders,
    ranked,
    lowMargin,
    missingCost,
  } = insights;
  const withCostCount = products.length - missingCost.length;
  const listId = useId();
  const [showAll, setShowAll] = useState(false);
  // Collapsed: top earners. Expanded: every product with a cost price.
  // If nothing makes a profit yet, show every product with a cost directly.
  const canExpand = leaders.length > 0 && ranked.length > leaders.length;
  const visibleRows = showAll || leaders.length === 0 ? ranked : leaders;

  return (
    <section className="panel profit-panel" aria-labelledby={titleId}>
      <div className="panel-header">
        <div>
          <h2 id={titleId} className="panel-title">
            Profit
          </h2>
          <span className="panel-subtitle">
            Estimated: current price − cost, × units sold
          </span>
        </div>
      </div>

      <div className="profit-body">
        <div className="profit-tiles">
          <div className="summary-tile">
            <span className="summary-label">Est. profit</span>
            <span className="summary-value">
              {withCostCount ? formatMoney(totalProfit, currency) : "—"}
            </span>
          </div>
          <div className="summary-tile">
            <span className="summary-label">Avg. margin</span>
            <span className="summary-value">
              {averageMargin === null
                ? "—"
                : percentFormat.format(averageMargin)}
            </span>
          </div>
        </div>

        <div className="profit-coverage">
          <div className="category-share-bar" aria-hidden="true">
            <span style={{ width: `${coverage * 100}%` }} />
          </div>
          <span>
            {withCostCount} of {products.length} products have a cost price
          </span>
        </div>

        <section className="category-section">
          <h3 className="category-section-title">
            <Coins size={14} /> Earns the most
          </h3>
          {visibleRows.length ? (
            <>
              <ol
                id={listId}
                className={`category-top-list ${showAll ? "profit-list-expanded" : ""}`}
              >
                {visibleRows.map(({ product, totalProfit: profit, margin }) => (
                  <li key={product.id}>
                    <span className="category-item-name">{product.name}</span>
                    <MarginBadge margin={margin} />
                    <span
                      className={`category-item-detail ${profit < 0 ? "profit-negative" : ""}`}
                    >
                      {formatMoney(profit, currency)}
                    </span>
                  </li>
                ))}
              </ol>
              {canExpand && (
                <button
                  type="button"
                  className="link-button profit-show-more"
                  aria-expanded={showAll}
                  aria-controls={listId}
                  onClick={() => setShowAll((value) => !value)}
                >
                  {showAll
                    ? "Show less"
                    : `Show more (all ${ranked.length} with cost)`}
                </button>
              )}
            </>
          ) : (
            <p className="category-empty">
              Add cost prices to see which products earn the most.
            </p>
          )}
        </section>

        {lowMargin.length > 0 && (
          <section className="category-section">
            <h3 className="category-section-title">
              <TrendingDown size={14} /> Thin margins
            </h3>
            <ul className="category-alert-items">
              {lowMargin.map(({ product, margin, unitProfit }) => (
                <li key={product.id}>
                  <span className="category-item-name">{product.name}</span>
                  <MarginBadge margin={margin} />
                  <span className="category-item-detail">
                    {unitProfit < 0
                      ? `loses ${formatMoney(-unitProfit, currency)}/unit`
                      : `${formatMoney(unitProfit, currency)}/unit`}
                  </span>
                  {onEditProduct && (
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => onEditProduct(product)}
                      aria-label={`Edit price of ${product.name}`}
                    >
                      Edit
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {missingCost.length > 0 && (
          <section className="category-section">
            <h3 className="category-section-title">
              <CircleHelp size={14} /> Missing cost ({missingCost.length})
            </h3>
            <ul className="category-alert-items">
              {missingCost.slice(0, MAX_MISSING_LISTED).map((product) => (
                <li key={product.id}>
                  <span className="category-item-name">{product.name}</span>
                  {onEditProduct && (
                    <Button
                      size="small"
                      onClick={() => onEditProduct(product)}
                      aria-label={`Add cost for ${product.name}`}
                    >
                      Add cost
                    </Button>
                  )}
                </li>
              ))}
              {missingCost.length > MAX_MISSING_LISTED && (
                <li className="category-more">
                  +{missingCost.length - MAX_MISSING_LISTED} more
                </li>
              )}
            </ul>
          </section>
        )}
      </div>
    </section>
  );
}
