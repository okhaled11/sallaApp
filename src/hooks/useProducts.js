import { useState, useEffect, useCallback } from "react";
import {
  fetchProducts,
  updateProduct as updateProductApi,
} from "../utils/productsApi.js";

/**
 * useProducts - Load store products with how many times each was sold
 *
 * @param {string|null} token - Embedded token (from useAppBootstrap)
 * @param {boolean} enabled - Fetch only once the app is ready
 * @returns {{ products: Array, totalSold: number, isLoading: boolean, error: string|null, reload: function, updateProduct: function }}
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

  /**
   * Update price and/or quantity, then patch the product in local state.
   * Sold count is kept from the list since it doesn't change on edit.
   *
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  const updateProduct = useCallback(
    async (productId, changes) => {
      if (!token) return { success: false, error: "No token" };

      const result = await updateProductApi(token, productId, changes);

      if (result.success) {
        const updated = result.data?.product || {};
        setProducts((prev) =>
          prev.map((p) =>
            p.id === productId
              ? {
                  ...p,
                  price: updated.price ?? changes.price ?? p.price,
                  currency: updated.currency ?? p.currency,
                  quantity:
                    updated.quantity !== undefined
                      ? updated.quantity
                      : (changes.quantity ?? p.quantity),
                  costPrice:
                    updated.costPrice !== undefined
                      ? updated.costPrice
                      : (changes.costPrice ?? p.costPrice),
                  salePrice:
                    updated.salePrice !== undefined
                      ? updated.salePrice
                      : p.salePrice,
                }
              : p,
          ),
        );
        return { success: true };
      }

      return {
        success: false,
        error: result.error || "Failed to update product",
      };
    },
    [token],
  );

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  return { products, totalSold, isLoading, error, reload, updateProduct };
}
