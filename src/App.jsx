import { useEffect, useCallback, useRef } from "react";
import { useTheme } from "./contexts/ThemeContext.jsx";
import { useAppBootstrap } from "./hooks/useAppBootstrap.js";
import { useIframeAutoBootstrap } from "./hooks/useIframeAutoBootstrap.js";
import { useProducts } from "./hooks/useProducts.js";
import { ToastProvider, useToast } from "./contexts/ToastContext.jsx";
import { ThemeProvider } from "./contexts/ThemeContext.jsx";
import Header from "./components/Header.jsx";
import StatusBar from "./components/StatusBar.jsx";
import ProductsSales from "./components/ProductsSales.jsx";
import IncentivesDashboard from "./components/Incentives/IncentivesDashboard.jsx";

function AppContent() {
  const { setTheme } = useTheme();
  const { showToast } = useToast();
  const hasShownConnectedToast = useRef(false);

  const handleSdkThemeChange = useCallback(
    (newTheme) => {
      setTheme(newTheme);
    },
    [setTheme],
  );

  const { isReady, layout, token, verifyStatus, error, bootstrap } =
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

  // Show toast on initial connection (once only) and sync host theme
  useEffect(() => {
    if (isReady && layout && !hasShownConnectedToast.current) {
      hasShownConnectedToast.current = true;
      showToast("Connected to Salla dashboard", "success");
      if (layout.theme) {
        setTheme(layout.theme);
      }
    }
  }, [isReady, layout, showToast, setTheme]);

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
    <div className="app">
      <Header />
      <StatusBar
        isConnected={isReady}
        parentOrigin={parentOrigin}
        iframeMode={iframeMode}
      />
      <main className="main-content">
        <div className="dashboard-grid">
          <IncentivesDashboard />
          <div className="grid-full">
            {notice ? (
              <div className="panel products-state">{notice}</div>
            ) : (
              <ProductsSales
                products={products}
                totalSold={totalSold}
                isLoading={isLoading}
                error={productsError}
                onReload={reload}
                onUpdateProduct={handleUpdateProduct}
              />
            )}
          </div>
        </div>
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
