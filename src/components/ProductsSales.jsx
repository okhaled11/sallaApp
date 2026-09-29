import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon.jsx";
import Button from "./forms/Button.jsx";
import ProductEditForm from "./ProductEditForm.jsx";
import { UNCATEGORIZED_ID } from "../utils/categoryInsights.js";
import { productProfit } from "../utils/profitInsights.js";

const percentFormat = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 0,
});

const numberFormat = new Intl.NumberFormat();

function formatPrice(price, currency) {
  if (price === null || price === undefined) return "—";
  return `${numberFormat.format(price)} ${currency || ""}`.trim();
}

function soldLabel(count) {
  if (count === 0) return "Not sold yet";
  if (count === 1) return "Sold 1 time";
  return `Sold ${numberFormat.format(count)} times`;
}

function stockLabel(quantity) {
  if (quantity === null || quantity === undefined) return "Unlimited stock";
  if (quantity === 0) return "Out of stock";
  return `Stock ${numberFormat.format(quantity)}`;
}

function MarginText({ product }) {
  const profit = productProfit(product);
  if (!profit || profit.margin === null) return null;
  return (
    <>
      {" · "}
      <span className={profit.margin < 0.15 ? "category-margin-thin" : ""}>
        {percentFormat.format(profit.margin)} margin
      </span>
    </>
  );
}

export default function ProductsSales({
  products,
  totalSold,
  isLoading,
  error,
  onReload,
  onUpdateProduct,
  categoryFilter = null,
  onClearCategory,
  // Optional: control which row is being edited from outside (e.g. "Add cost")
  editingId: controlledEditingId,
  onEditingChange,
}) {
  const [query, setQuery] = useState("");
  const [localEditingId, setLocalEditingId] = useState(null);
  const isControlled = controlledEditingId !== undefined;
  const editingId = isControlled ? controlledEditingId : localEditingId;
  const setEditingId = (update) => {
    const next = typeof update === "function" ? update(editingId) : update;
    if (isControlled) onEditingChange?.(next);
    else setLocalEditingId(next);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter) {
        const inCategory = p.categories?.length
          ? p.categories.some((c) => String(c.id) === categoryFilter.id)
          : categoryFilter.id === UNCATEGORIZED_ID;
        if (!inCategory) return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q))
      );
    });
  }, [products, query, categoryFilter]);

  // When a row is opened (possibly from another card), make sure it is
  // visible and scrolled into view — once per newly opened row.
  const [revealedId, setRevealedId] = useState(null);
  useEffect(() => {
    if (editingId === null || editingId === undefined) {
      setRevealedId(null);
      return;
    }
    if (revealedId === editingId) return;
    if (!filtered.some((p) => p.id === editingId)) {
      setQuery("");
      return;
    }
    setRevealedId(editingId);
    document
      .getElementById(`product-row-${editingId}`)
      ?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [editingId, filtered, revealedId]);

  const maxSold = products.reduce((max, p) => Math.max(max, p.soldQuantity), 0);
  const bestSeller = products[0]?.soldQuantity > 0 ? products[0] : null;

  return (
    <div className="panel products-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Product Sales</h2>
          <span className="panel-subtitle">
            How many times each product has been sold · edit price and stock
          </span>
        </div>
      </div>

      {error ? (
        <div className="products-state products-error">
          <p>Failed to load products: {error}</p>
          <Button variant="primary" onClick={onReload}>
            Retry
          </Button>
        </div>
      ) : isLoading && products.length === 0 ? (
        <div className="products-state">Loading products...</div>
      ) : (
        <>
          <div className="products-summary">
            <div className="summary-tile">
              <span className="summary-label">Products</span>
              <span className="summary-value">
                {numberFormat.format(products.length)}
              </span>
            </div>
            <div className="summary-tile">
              <span className="summary-label">Total units sold</span>
              <span className="summary-value">
                {numberFormat.format(totalSold)}
              </span>
            </div>
            <div className="summary-tile">
              <span className="summary-label">Best seller</span>
              <span className="summary-value summary-value-text">
                {bestSeller ? bestSeller.name : "—"}
              </span>
            </div>
          </div>

          <div className="products-toolbar">
            <input
              type="search"
              className="products-search"
              placeholder="Search by name or SKU"
              aria-label="Search products"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {categoryFilter && (
              <button
                type="button"
                className="filter-chip"
                onClick={onClearCategory}
                aria-label={`Clear category filter ${categoryFilter.name}`}
              >
                Category: {categoryFilter.name}
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="products-state">
              {products.length === 0
                ? "No products found in this store."
                : "No products match your filters."}
            </div>
          ) : (
            <ul className="products-list">
              {filtered.map((product) => (
                <li
                  key={product.id}
                  id={`product-row-${product.id}`}
                  className="product-row"
                >
                  <div className="product-thumb">
                    {product.image ? (
                      <img src={product.image} alt="" loading="lazy" />
                    ) : (
                      <Icon name="package" size={20} />
                    )}
                  </div>
                  <div className="product-info">
                    <span className="product-name">{product.name}</span>
                    <span className="product-meta">
                      {product.sku ? `SKU ${product.sku} · ` : ""}
                      {formatPrice(product.price, product.currency)}
                      {" · "}
                      <span
                        className={
                          product.quantity === 0 ? "product-out-of-stock" : ""
                        }
                      >
                        {stockLabel(product.quantity)}
                      </span>
                      <MarginText product={product} />
                    </span>
                  </div>
                  <div className="product-sold">
                    <span className="product-sold-count">
                      {soldLabel(product.soldQuantity)}
                    </span>
                    <div className="product-sold-bar" aria-hidden="true">
                      <span
                        style={{
                          width: maxSold
                            ? `${(product.soldQuantity / maxSold) * 100}%`
                            : "0%",
                        }}
                      />
                    </div>
                  </div>
                  {onUpdateProduct && (
                    <Button
                      size="icon"
                      title="Edit price & quantity"
                      aria-label={`Edit ${product.name}`}
                      aria-expanded={editingId === product.id}
                      onClick={() =>
                        setEditingId((id) =>
                          id === product.id ? null : product.id,
                        )
                      }
                    >
                      <Icon name="edit" />
                    </Button>
                  )}
                  {editingId === product.id && (
                    <ProductEditForm
                      product={product}
                      onSave={onUpdateProduct}
                      onCancel={() => setEditingId(null)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
