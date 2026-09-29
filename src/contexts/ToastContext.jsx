import { createContext, useContext, useState, useCallback } from "react";
import { embedded } from "@salla.sa/embedded-sdk";

const ToastContext = createContext(null);

const HOST_TOAST_TYPES = ["success", "error", "warning", "info"];

/**
 * Inside the Salla dashboard, show the dashboard's native toast
 * (embedded.ui.toast), as the design guidelines require.
 * @returns {boolean} whether the host showed it
 */
function showHostToast(message, type) {
  const inIframe = typeof window !== "undefined" && window.parent !== window;
  const toast = embedded?.ui?.toast;
  if (!inIframe || !toast) return false;
  const method = HOST_TOAST_TYPES.includes(type) ? type : "info";
  try {
    toast[method](message);
    return true;
  } catch {
    return false;
  }
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "info") => {
    if (showHostToast(message, type)) return null;

    // Fallback outside the dashboard (local development)
    const id = Date.now() + Math.random();
    const toast = { id, message, type };

    setToasts((prev) => [...prev, toast]);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            onClick={() => removeToast(toast.id)}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
