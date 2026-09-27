import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  productsRequest,
  updateProductRequest,
  validateProductChanges,
  mapProduct,
} from "../products-core.js";

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(payload),
});

const call = (body, method = "POST") =>
  productsRequest({ method, body: JSON.stringify(body) }).then((res) => ({
    ...res,
    json: res.body ? JSON.parse(res.body) : undefined,
  }));

describe("products-core", () => {
  let fetchMock;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.SALLA_ACCESS_TOKEN = "access";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    delete process.env.SALLA_ACCESS_TOKEN;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps a Salla product", () => {
    expect(
      mapProduct({
        id: 7,
        name: "Shirt",
        sku: "S1",
        status: "sale",
        price: { amount: 99, currency: "SAR" },
        thumbnail: "img.png",
        quantity: 3,
        sold_quantity: 5,
      }),
    ).toEqual({
      id: 7,
      name: "Shirt",
      sku: "S1",
      status: "sale",
      price: 99,
      currency: "SAR",
      image: "img.png",
      quantity: 3,
      soldQuantity: 5,
    });
  });

  it("maps missing quantity as unlimited (null)", () => {
    expect(mapProduct({ id: 1, quantity: null }).quantity).toBe(null);
    expect(mapProduct({ id: 1 }).quantity).toBe(null);
  });

  it("handles CORS preflight and rejects other methods", async () => {
    expect((await call({}, "OPTIONS")).statusCode).toBe(204);
    expect((await call({}, "GET")).statusCode).toBe(405);
  });

  it("requires token and app id", async () => {
    expect((await call({ appId: "a" })).statusCode).toBe(400);
    expect((await call({ token: "t" })).statusCode).toBe(400);
  });

  it("fails clearly when access token is missing", async () => {
    delete process.env.SALLA_ACCESS_TOKEN;
    const res = await call({ token: "t", appId: "a" });
    expect(res.statusCode).toBe(500);
    expect(res.json.error).toMatch(/SALLA_ACCESS_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the embedded token is invalid", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { success: false }));
    const res = await call({ token: "bad", appId: "a" });
    expect(res.statusCode).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches all pages and sorts by sold quantity", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: {} }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: [{ id: 1, name: "A", sold_quantity: 2 }],
          pagination: { currentPage: 1, totalPages: 2 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: [{ id: 2, name: "B", sold_quantity: 9 }],
          pagination: { currentPage: 2, totalPages: 2 },
        }),
      );

    const res = await call({ token: "t", appId: "a" });

    expect(res.statusCode).toBe(200);
    expect(res.json.data.products.map((p) => p.id)).toEqual([2, 1]);
    expect(res.json.data.totalSold).toBe(11);

    const [productsUrl, productsOptions] = fetchMock.mock.calls[1];
    expect(productsUrl).toContain("/admin/v2/products?page=1");
    expect(productsOptions.headers.Authorization).toBe("Bearer access");
    expect(fetchMock.mock.calls[2][0]).toContain("page=2");
  });

  it("forwards Salla API errors", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { success: true }))
      .mockResolvedValueOnce(
        jsonResponse(403, {
          success: false,
          error: { message: "Unauthorized scope" },
        }),
      );

    const res = await call({ token: "t", appId: "a" });
    expect(res.statusCode).toBe(403);
    expect(res.json.error).toBe("Unauthorized scope");
  });

  describe("validateProductChanges", () => {
    it("accepts price and quantity", () => {
      expect(
        validateProductChanges({ productId: 5, price: 10.5, quantity: 3 }),
      ).toEqual({ changes: { price: 10.5, quantity: 3 } });
    });

    it("accepts a single field", () => {
      expect(validateProductChanges({ productId: 5, quantity: 0 })).toEqual({
        changes: { quantity: 0 },
      });
    });

    it.each([
      [{ price: 1 }, /productId/],
      [{ productId: "5", price: 1 }, /productId/],
      [{ productId: 5, price: -1 }, /Price/],
      [{ productId: 5, price: "10" }, /Price/],
      [{ productId: 5, quantity: 1.5 }, /Quantity/],
      [{ productId: 5, quantity: -2 }, /Quantity/],
      [{ productId: 5 }, /Nothing to update/],
    ])("rejects %j", (input, message) => {
      expect(validateProductChanges(input).error).toMatch(message);
    });
  });

  describe("updateProductRequest", () => {
    const callUpdate = (body) =>
      updateProductRequest({ method: "POST", body: JSON.stringify(body) }).then(
        (res) => ({ ...res, json: JSON.parse(res.body) }),
      );

    it("rejects invalid changes before calling Salla", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }));
      const res = await callUpdate({
        token: "t",
        appId: "a",
        productId: 5,
        price: -1,
      });
      expect(res.statusCode).toBe(400);
      // Only the token verification call
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("returns 401 when the embedded token is invalid", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(401, { success: false }));
      const res = await callUpdate({
        token: "bad",
        appId: "a",
        productId: 5,
        price: 10,
      });
      expect(res.statusCode).toBe(401);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("sends a partial PUT and returns the mapped product", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { success: true }))
        .mockResolvedValueOnce(
          jsonResponse(201, {
            success: true,
            data: {
              id: 5,
              name: "Shirt",
              price: { amount: 120, currency: "SAR" },
              quantity: 7,
            },
          }),
        );

      const res = await callUpdate({
        token: "t",
        appId: "a",
        productId: 5,
        price: 120,
        quantity: 7,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json.data.product).toMatchObject({
        id: 5,
        price: 120,
        quantity: 7,
      });

      const [url, options] = fetchMock.mock.calls[1];
      expect(url).toBe("https://api.salla.dev/admin/v2/products/5");
      expect(options.method).toBe("PUT");
      expect(options.headers.Authorization).toBe("Bearer access");
      expect(JSON.parse(options.body)).toEqual({ price: 120, quantity: 7 });
    });

    it("forwards Salla errors", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { success: true }))
        .mockResolvedValueOnce(
          jsonResponse(403, {
            success: false,
            error: { message: "Missing products.read_write scope" },
          }),
        );

      const res = await callUpdate({
        token: "t",
        appId: "a",
        productId: 5,
        quantity: 1,
      });
      expect(res.statusCode).toBe(403);
      expect(res.json.error).toBe("Missing products.read_write scope");
    });
  });
});
