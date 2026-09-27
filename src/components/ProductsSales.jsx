import { useMemo, useState } from "react";
import { Package, RefreshCw } from "lucide-react";
import Button from "./forms/Button.jsx";

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

export default function ProductsSales({
  products,
  totalSold,
  isLoading,
  error,
  onReload,
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)),
    );
  }, [products, query]);

  const maxSold = products.reduce((max, p) => Math.max(max, p.soldQuantity), 0);
  const bestSeller = products[0]?.soldQuantity > 0 ? products[0] : null;

  return (
    <div className="panel products-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Product Sales</h2>
          <span className="panel-subtitle">
            How many times each product in your store has been sold
          </span>
        </div>
        <div className="panel-actions">
          <Button onClick={onReload} disabled={isLoading}>
            <RefreshCw size={16} />
            Refresh
          </Button>
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
          </div>

          {filtered.length === 0 ? (
            <div className="products-state">
              {products.length === 0
                ? "No products found in this store."
                : "No products match your search."}
            </div>
          ) : (
            <ul className="products-list">
              {filtered.map((product) => (
                <li key={product.id} className="product-row">
                  <div className="product-thumb">
                    {product.image ? (
                      <img src={product.image} alt="" loading="lazy" />
                    ) : (
                      <Package size={20} />
                    )}
                  </div>
                  <div className="product-info">
                    <span className="product-name">{product.name}</span>
                    <span className="product-meta">
                      {product.sku ? `SKU ${product.sku} · ` : ""}
                      {formatPrice(product.price, product.currency)}
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
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
