import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchProducts } from "../productsApi.js";

describe("fetchProducts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts token and app id to the products function", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: { products: [] } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchProducts("tok");

    expect(result.success).toBe(true);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/products");
    expect(JSON.parse(options.body)).toMatchObject({ token: "tok" });
  });

  it("returns error result when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await fetchProducts("tok");
    expect(result).toEqual({ success: false, error: "offline" });
  });
});
