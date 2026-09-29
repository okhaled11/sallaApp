import { useId, useMemo, useState } from "react";
import {
  ListChecks,
  PackagePlus,
  Tag,
  Receipt,
  Snowflake,
  TrendingDown,
} from "lucide-react";
import Button from "./forms/Button.jsx";
import { buildActionPlan, idleStockValue } from "../utils/actionPlan.js";

const numberFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

const COLLAPSED_COUNT = 5;

const FILTERS = [
  { id: "all", label: "All", types: null },
  { id: "stock", label: "Stock", types: ["restock", "dead-stock"] },
  { id: "pricing", label: "Pricing", types: ["loss", "thin-margin"] },
  { id: "data", label: "Data", types: ["missing-cost"] },
];

const TYPE_ICONS = {
  restock: PackagePlus,
  loss: TrendingDown,
  "thin-margin": Tag,
  "missing-cost": Receipt,
  "dead-stock": Snowflake,
};

// What the "Fix" button does in the edit form, spelled out for the merchant
const FIX_LABELS = {
  restock: "Update stock",
  loss: "Fix price",
  "thin-margin": "Fix price",
  "missing-cost": "Add cost",
  "dead-stock": "Lower price",
};

/**
 * Action plan: a prioritized to-do list built from sales, stock and profit.
 * Every action opens the product's edit form in the list below.
 */
export default function ActionPlan({ products, lowStockLimit, onEditProduct }) {
  const titleId = useId();
  const listId = useId();
  const [filter, setFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);

  const actions = useMemo(
    () => buildActionPlan(products, { lowStockLimit }),
    [products, lowStockLimit],
  );
  const idleValue = useMemo(() => idleStockValue(products), [products]);
  const currency = products.find((p) => p.currency)?.currency ?? "";

  const types = FILTERS.find((f) => f.id === filter).types;
  const filtered = types
    ? actions.filter((action) => types.includes(action.type))
    : actions;
  const visible = showAll ? filtered : filtered.slice(0, COLLAPSED_COUNT);
  const counts = {
    critical: actions.filter((a) => a.severity === "critical").length,
    warning: actions.filter((a) => a.severity === "warning").length,
  };

  return (
    <section className="panel action-panel" aria-labelledby={titleId}>
      <div className="panel-header">
        <div>
          <h2 id={titleId} className="panel-title">
            <ListChecks size={16} className="panel-title-icon" />
            Action plan
          </h2>
          <span className="panel-subtitle">
            What to do next, most urgent first
          </span>
        </div>
      </div>

      <div className="action-body">
        <div className="action-tiles">
          <div className="action-tile action-tile-critical">
            <span className="action-tile-value">{counts.critical}</span>
            <span className="action-tile-label">Urgent</span>
          </div>
          <div className="action-tile action-tile-warning">
            <span className="action-tile-value">{counts.warning}</span>
            <span className="action-tile-label">Soon</span>
          </div>
          <div className="action-tile">
            <span className="action-tile-value">
              {numberFormat.format(idleValue)}
              <small> {currency}</small>
            </span>
            <span className="action-tile-label">In never-sold stock</span>
          </div>
        </div>

        <div
          className="segmented action-filters"
          role="group"
          aria-label="Filter actions"
        >
          {FILTERS.map((option) => {
            const count = option.types
              ? actions.filter((a) => option.types.includes(a.type)).length
              : actions.length;
            return (
              <button
                key={option.id}
                type="button"
                className={`segmented-button ${filter === option.id ? "is-active" : ""}`}
                aria-pressed={filter === option.id}
                onClick={() => {
                  setFilter(option.id);
                  setShowAll(false);
                }}
              >
                {option.label} <span className="segmented-count">{count}</span>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <p className="action-empty">
            {actions.length === 0
              ? "Nothing to fix — your store looks healthy."
              : "Nothing to do in this group."}
          </p>
        ) : (
          <ol id={listId} className="action-list">
            {visible.map((action) => {
              const Icon = TYPE_ICONS[action.type];
              return (
                <li
                  key={action.id}
                  className={`action-item action-${action.severity}`}
                >
                  <span className="action-icon" aria-hidden="true">
                    <Icon size={16} />
                  </span>
                  <div className="action-text">
                    <span className="action-title">
                      {action.title}
                      <span className="visually-hidden">
                        {" "}
                        ({action.severity})
                      </span>
                    </span>
                    <span className="action-product">
                      {action.product.name}
                    </span>
                    <span className="action-reason">{action.reason}</span>
                  </div>
                  {onEditProduct && (
                    <Button
                      size="small"
                      onClick={() => onEditProduct(action.product)}
                      aria-label={`${FIX_LABELS[action.type]}: ${action.product.name}`}
                    >
                      {FIX_LABELS[action.type]}
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {filtered.length > COLLAPSED_COUNT && (
          <button
            type="button"
            className="link-button profit-show-more"
            aria-expanded={showAll}
            aria-controls={listId}
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? "Show less" : `Show all ${filtered.length} actions`}
          </button>
        )}
      </div>
    </section>
  );
}
