import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("../../utils/productsApi.js", () => ({
  fetchProducts: vi.fn(),
  updateProduct: vi.fn(),
}));

import { useProducts } from "../useProducts.js";
import { fetchProducts, updateProduct } from "../../utils/productsApi.js";

describe("useProducts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch when disabled", () => {
    renderHook(() => useProducts("tok", false));
    expect(fetchProducts).not.toHaveBeenCalled();
  });

  it("does not fetch without a token", () => {
    renderHook(() => useProducts(null, true));
    expect(fetchProducts).not.toHaveBeenCalled();
  });

  it("loads products and total sold", async () => {
    fetchProducts.mockResolvedValue({
      success: true,
      data: { products: [{ id: 1, soldQuantity: 4 }], totalSold: 4 },
    });

    const { result } = renderHook(() => useProducts("tok", true));

    await waitFor(() => expect(result.current.products).toHaveLength(1));
    expect(fetchProducts).toHaveBeenCalledWith("tok");
    expect(result.current.totalSold).toBe(4);
    expect(result.current.error).toBe(null);
    expect(result.current.isLoading).toBe(false);
  });

  it("exposes error on failure and can reload", async () => {
    fetchProducts.mockResolvedValue({ success: false, error: "nope" });

    const { result } = renderHook(() => useProducts("tok", true));
    await waitFor(() => expect(result.current.error).toBe("nope"));

    fetchProducts.mockResolvedValue({
      success: true,
      data: { products: [], totalSold: 0 },
    });
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.error).toBe(null);
  });

  it("updates a product in place and keeps sold count", async () => {
    fetchProducts.mockResolvedValue({
      success: true,
      data: {
        products: [
          { id: 1, price: 10, currency: "SAR", quantity: 2, soldQuantity: 4 },
          { id: 2, price: 20, currency: "SAR", quantity: 5, soldQuantity: 1 },
        ],
        totalSold: 5,
      },
    });
    updateProduct.mockResolvedValue({
      success: true,
      data: {
        product: { id: 1, price: 15, currency: "SAR", quantity: 9 },
      },
    });

    const { result } = renderHook(() => useProducts("tok", true));
    await waitFor(() => expect(result.current.products).toHaveLength(2));

    let outcome;
    await act(async () => {
      outcome = await result.current.updateProduct(1, {
        price: 15,
        quantity: 9,
      });
    });

    expect(outcome).toEqual({ success: true });
    expect(updateProduct).toHaveBeenCalledWith("tok", 1, {
      price: 15,
      quantity: 9,
    });
    expect(result.current.products[0]).toMatchObject({
      id: 1,
      price: 15,
      quantity: 9,
      soldQuantity: 4,
    });
    expect(result.current.products[1].price).toBe(20);
  });

  it("returns error and leaves products unchanged when update fails", async () => {
    fetchProducts.mockResolvedValue({
      success: true,
      data: { products: [{ id: 1, price: 10, quantity: 2 }], totalSold: 0 },
    });
    updateProduct.mockResolvedValue({ success: false, error: "denied" });

    const { result } = renderHook(() => useProducts("tok", true));
    await waitFor(() => expect(result.current.products).toHaveLength(1));

    let outcome;
    await act(async () => {
      outcome = await result.current.updateProduct(1, { price: 99 });
    });

    expect(outcome).toEqual({ success: false, error: "denied" });
    expect(result.current.products[0].price).toBe(10);
  });
});
