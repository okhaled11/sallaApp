import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { useTheme } from "./contexts/ThemeContext.jsx";
import { useAppBootstrap } from "./hooks/useAppBootstrap.js";
import { useIframeAutoBootstrap } from "./hooks/useIframeAutoBootstrap.js";
import { useProducts } from "./hooks/useProducts.js";
import { useDashboardChrome } from "./hooks/useDashboardChrome.js";
import { ToastProvider, useToast } from "./contexts/ToastContext.jsx";
import { ThemeProvider } from "./contexts/ThemeContext.jsx";
import StatusBar from "./components/StatusBar.jsx";
import Navbar from "./components/Navigation/Navbar.jsx";
import ContentStudio from "./components/ContentStudio/ContentStudio.jsx";
import VisitorIncentivesStudio from "./components/Incentives/VisitorIncentivesStudio.jsx";
import RiskyOrders from "./components/RiskyOrders/RiskyOrders.jsx";
import TryOnStudio from "./components/TryOn/TryOnStudio.jsx";
import ProductsSales from "./components/ProductsSales.jsx";
import CategoryInsights from "./components/CategoryInsights.jsx";
import ProfitInsights from "./components/ProfitInsights.jsx";
import ActionPlan from "./components/ActionPlan.jsx";
import StoreStatistics from "./components/StoreStatistics.jsx";
import { DEFAULT_LOW_STOCK_LIMIT } from "./utils/categoryInsights.js";
import { calculateCatalogContentStats } from "./utils/contentEngine.js";

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

  const {
    embedded,
    isReady,
    layout,
    token,
    verifiedData,
    verifyStatus,
    error,
    bootstrap,
  } = useAppBootstrap({
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

  const storeId =
    verifiedData?.merchant_id ||
    verifiedData?.store_id ||
    verifiedData?.id ||
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("store")
      : null);

  const [activeTab, setActiveTab] = useState("sales");
  const [lowStockLimit, setLowStockLimit] = useState(DEFAULT_LOW_STOCK_LIMIT);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [editingProductId, setEditingProductId] = useState(null);

  const contentIssuesCount = useMemo(() => {
    return calculateCatalogContentStats(products).needsAttentionCount;
  }, [products]);

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

  const handleDashboardAction = useCallback(
    (actionValue) => {
      if (actionValue === "refresh-products") {
        reload();
      } else if (actionValue === "nav-content") {
        setActiveTab("content");
      } else if (actionValue === "nav-sales") {
        setActiveTab("sales");
      } else if (actionValue === "nav-incentives") {
        setActiveTab("incentives");
      }
    },
    [reload],
  );

  const chromeAction = useMemo(() => {
    if (activeTab === "sales") {
      return {
        title: "تحفيز الزوار والخصومات",
        value: "nav-incentives",
        icon: "hgi hgi-stroke hgi-tag",
        disabled: false,
        extendedActions: [
          {
            title: "تحفيز الزوار والخصومات",
            value: "nav-incentives",
            icon: "hgi hgi-stroke hgi-tag",
            subTitle: "استهداف المتكررين وخصم 3 زيارات",
          },
          {
            title: "ستوديو المحتوى والسيو",
            value: "nav-content",
            icon: "hgi hgi-stroke hgi-sparkles",
            subTitle:
              contentIssuesCount > 0
                ? `${contentIssuesCount} منتجات بحاجة لتحسين`
                : "فحص السيو وجودة المحتوى",
          },
          {
            title: "تحديث البيانات",
            value: "refresh-products",
            icon: "hgi hgi-stroke hgi-refresh",
            subTitle: "إعادة تحميل بيانات المنتجات والمبيعات",
            disabled: isLoading,
          },
        ],
      };
    }
    if (activeTab === "content") {
      return {
        title: "تحفيز الزوار والخصومات",
        value: "nav-incentives",
        icon: "hgi hgi-stroke hgi-tag",
        disabled: false,
        extendedActions: [
          {
            title: "تحفيز الزوار والخصومات",
            value: "nav-incentives",
            icon: "hgi hgi-stroke hgi-tag",
            subTitle: "استهداف المتكررين وخصم 3 زيارات",
          },
          {
            title: "المبيعات والأرباح",
            value: "nav-sales",
            icon: "hgi hgi-stroke hgi-chart-line",
            subTitle: "المؤشرات المالية والمخزون",
          },
          {
            title: "تحديث البيانات",
            value: "refresh-products",
            icon: "hgi hgi-stroke hgi-refresh",
            subTitle: "إعادة تحميل بيانات المنتجات",
            disabled: isLoading,
          },
        ],
      };
    }
    return {
      title: "المبيعات والأرباح",
      value: "nav-sales",
      icon: "hgi hgi-stroke hgi-chart-line",
      disabled: false,
      extendedActions: [
        {
          title: "المبيعات والأرباح",
          value: "nav-sales",
          icon: "hgi hgi-stroke hgi-chart-line",
          subTitle: "المؤشرات المالية والمخزون",
        },
        {
          title: "ستوديو المحتوى والسيو",
          value: "nav-content",
          icon: "hgi hgi-stroke hgi-sparkles",
          subTitle: "تحسين المنتجات والسيو",
        },
        {
          title: "تحديث البيانات",
          value: "refresh-products",
          icon: "hgi hgi-stroke hgi-refresh",
          subTitle: "إعادة تحميل بيانات المنتجات",
          disabled: isLoading,
        },
      ],
    };
  }, [activeTab, isLoading, contentIssuesCount]);

  // Salla Embedded: Page title & primary action bar with extended actions dropdown
  useDashboardChrome({
    embedded,
    enabled: isReady,
    title:
      activeTab === "content"
        ? "ستوديو المحتوى والسيو"
        : activeTab === "risk"
          ? "كاشف الطلبات الخطرة"
          : activeTab === "tryon"
            ? "التجربة الافتراضية"
            : activeTab === "incentives"
            ? "تحفيز الزوار والخصومات الذكية"
            : "المبيعات والأرباح",
    action: chromeAction,
    onAction: handleDashboardAction,
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
      <div className="app-container">
        <main className="main-content">
          {notice ? (
            <div className="panel products-state">{notice}</div>
          ) : (
            <>
              <Navbar
                activeTab={activeTab}
                onTabChange={setActiveTab}
                contentIssuesCount={contentIssuesCount}
              />
              {activeTab === "sales" ? (
                <>
                  {!productsError && products.length > 0 && (
                    <>
                      <StoreStatistics
                        products={products}
                        currency={layout?.currency}
                        onEditProduct={handleEditProduct}
                        onSelectCategory={handleSelectCategory}
                        selectedCategoryId={categoryFilter?.id ?? null}
                      />
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
                    </>
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
              ) : activeTab === "content" ? (
                <ContentStudio products={products} />
              ) : activeTab === "risk" ? (
                <RiskyOrders
                  token={token}
                  currency={layout?.currency || "SAR"}
                  onShowToast={showToast}
                />
              ) : activeTab === "tryon" ? (
                <TryOnStudio
                  products={products}
                  token={token}
                  storeId={storeId}
                  onShowToast={showToast}
                />
              ) : (
                <VisitorIncentivesStudio
                  products={products}
                  token={token}
                  currency={layout?.currency || "SAR"}
                  storeId={storeId}
                  onShowToast={showToast}
                />
              )}
            </>
          )}
        </main>
      </div>
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
