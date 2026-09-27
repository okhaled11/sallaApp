import { useState, useEffect, useCallback } from "react";
import { fetchProducts } from "../utils/productsApi.js";

/**
 * useProducts - Load store products with how many times each was sold
 *
 * @param {string|null} token - Embedded token (from useAppBootstrap)
 * @param {boolean} enabled - Fetch only once the app is ready
 * @returns {{ products: Array, totalSold: number, isLoading: boolean, error: string|null, reload: function }}
 */
export function useProducts(token, enabled = true) {
  const [products, setProducts] = useState([]);
  const [totalSold, setTotalSold] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    const result = await fetchProducts(token);

    if (result.success) {
      setProducts(result.data?.products || []);
      setTotalSold(result.data?.totalSold || 0);
    } else {
      setError(result.error || "Failed to load products");
    }
    setIsLoading(false);
  }, [token]);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  return { products, totalSold, isLoading, error, reload };
}
