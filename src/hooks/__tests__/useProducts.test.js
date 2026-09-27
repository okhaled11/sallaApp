import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("../../utils/productsApi.js", () => ({
  fetchProducts: vi.fn(),
}));

import { useProducts } from "../useProducts.js";
import { fetchProducts } from "../../utils/productsApi.js";

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
});
