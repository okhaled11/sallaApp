import { useEffect, useCallback, useRef, useState } from "react";
import { useTheme } from "./contexts/ThemeContext.jsx";
import { useAppBootstrap } from "./hooks/useAppBootstrap.js";
import { useIframeAutoBootstrap } from "./hooks/useIframeAutoBootstrap.js";
import { useProducts } from "./hooks/useProducts.js";
import { useDashboardChrome } from "./hooks/useDashboardChrome.js";
import { ToastProvider, useToast } from "./contexts/ToastContext.jsx";
import { ThemeProvider } from "./contexts/ThemeContext.jsx";
import StatusBar from "./components/StatusBar.jsx";
import ProductsSales from "./components/ProductsSales.jsx";
import CategoryInsights from "./components/CategoryInsights.jsx";
import ProfitInsights from "./components/ProfitInsights.jsx";
import ActionPlan from "./components/ActionPlan.jsx";
import { DEFAULT_LOW_STOCK_LIMIT } from "./utils/categoryInsights.js";

function AppContent() {
  const { setTheme } = useTheme();
  const { showToast } = useToast();
  const hasSyncedTheme = useRef(false);

  const handleSdkThemeChange = useCallback(
    (newTheme) => {
      setTheme(newTheme);
    },
    [setTheme],
  );

  const { embedded, isReady, layout, token, verifyStatus, error, bootstrap } =
    useAppBootstrap({
      debug: true,
      autoInit: false, // We trigger manually after iframe detection
      onThemeChange: handleSdkThemeChange,
    });

  // Detect iframe mode and auto-bootstrap when embedded
  const { iframeMode, parentOrigin, setParentOrigin } =
    useIframeAutoBootstrap(bootstrap);

  const {
    products,
    totalSold,
    isLoading,
    error: productsError,
    reload,
    updateProduct,
  } = useProducts(token, isReady && !!token);

  const [lowStockLimit, setLowStockLimit] = useState(DEFAULT_LOW_STOCK_LIMIT);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [editingProductId, setEditingProductId] = useState(null);

  // "Add cost" / "Edit" in the profit card opens that product's edit form
  const handleEditProduct = useCallback((product) => {
    setCategoryFilter(null);
    setEditingProductId(product.id);
  }, []);

  const handleSelectCategory = useCallback((category) => {
    setCategoryFilter(
      category ? { id: category.id, name: category.name } : null,
    );
  }, []);

  const handleUpdateProduct = useCallback(
    async (productId, changes) => {
      const result = await updateProduct(productId, changes);
      if (result.success) {
        showToast("Product updated", "success");
      }
      return result;
    },
    [updateProduct, showToast],
  );

  // Sync the host theme once on connect (later changes: onThemeChange)
  useEffect(() => {
    if (isReady && layout && !hasSyncedTheme.current) {
      hasSyncedTheme.current = true;
      if (layout.theme) {
        setTheme(layout.theme);
      }
    }
  }, [isReady, layout, setTheme]);

  // No header inside the iframe: title and Refresh live in the dashboard chrome
  useDashboardChrome({
    embedded,
    enabled: isReady,
    title: "Product Sales",
    action: {
      title: "Refresh",
      value: "refresh-products",
      icon: "hgi hgi-stroke hgi-refresh",
      disabled: isLoading,
    },
    onAction: reload,
  });

  // Update parent origin from the first embedded:: message
  useEffect(() => {
    const handleIncomingMessage = (event) => {
      if (!event.data?.event?.startsWith?.("embedded::")) return;
      if (event.origin && event.origin !== window.location.origin) {
        setParentOrigin(event.origin);
      }
    };

    window.addEventListener("message", handleIncomingMessage);
    return () => window.removeEventListener("message", handleIncomingMessage);
  }, [setParentOrigin]);

  let notice = null;
  if (iframeMode === "standalone") {
    notice =
      "Open this app from the Salla merchant dashboard to see your products.";
  } else if (verifyStatus === "failed" || error) {
    notice = `Could not connect to the store: ${error || "token verification failed"}`;
  } else if (!isReady) {
    notice = "Connecting to Salla dashboard...";
  } else if (!token) {
    notice = "No token received from the dashboard, cannot load products.";
  }

  return (
    <div
      className={`app ${iframeMode === "standalone" ? "app-standalone" : ""}`}
    >
      {/* Developer aid only: never shown inside the Salla dashboard */}
      {iframeMode === "standalone" && (
        <StatusBar
          isConnected={isReady}
          parentOrigin={parentOrigin}
          iframeMode={iframeMode}
        />
      )}
      <main className="main-content">
        {notice ? (
          <div className="panel products-state">{notice}</div>
        ) : (
          <>
            {!productsError && products.length > 0 && (
              <div className="insights-grid">
                <CategoryInsights
                  products={products}
                  lowStockLimit={lowStockLimit}
                  onLowStockLimitChange={setLowStockLimit}
                  selectedCategoryId={categoryFilter?.id ?? null}
                  onSelectCategory={handleSelectCategory}
                />
                <div className="insights-side">
                  <ProfitInsights
                    products={products}
                    onEditProduct={handleEditProduct}
                  />
                  <ActionPlan
                    products={products}
                    lowStockLimit={lowStockLimit}
                    onEditProduct={handleEditProduct}
                  />
                </div>
              </div>
            )}
            <ProductsSales
              products={products}
              totalSold={totalSold}
              isLoading={isLoading}
              error={productsError}
              onReload={reload}
              onUpdateProduct={handleUpdateProduct}
              categoryFilter={categoryFilter}
              onClearCategory={() => setCategoryFilter(null)}
              editingId={editingProductId}
              onEditingChange={setEditingProductId}
            />
          </>
        )}
      </main>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
