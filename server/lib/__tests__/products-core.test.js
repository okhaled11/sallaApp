import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  productsRequest,
  updateProductRequest,
  validateProductChanges,
  mapProduct,
} from "../products-core.js";
import { ERROR_CODES } from "../errors.js";

const ACCESS_TOKEN = "ory_at_env_access_token";

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(payload),
});

const withJson = (res) => ({
  ...res,
  json: res.body ? JSON.parse(res.body) : undefined,
});

const call = (body, method = "POST") =>
  productsRequest({ method, body: JSON.stringify(body) }).then(withJson);

const callUpdate = (body) =>
  updateProductRequest({ method: "POST", body: JSON.stringify(body) }).then(
    withJson,
  );

// First fetch is always the embedded token verification
const verified = () => jsonResponse(200, { success: true, data: {} });

describe("products-core", () => {
  let fetchMock;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.SALLA_ACCESS_TOKEN = ACCESS_TOKEN;
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
        categories: [
          { id: 11, name: "Men", parent_id: 0, status: "active" },
          { id: 12, name: "Shirts" },
        ],
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
      salePrice: null,
      costPrice: null,
      categories: [
        { id: 11, name: "Men" },
        { id: 12, name: "Shirts" },
      ],
    });
  });

  it("maps missing quantity as unlimited (null)", () => {
    expect(mapProduct({ id: 1, quantity: null }).quantity).toBe(null);
    expect(mapProduct({ id: 1 }).quantity).toBe(null);
  });

  it("maps unlimited_quantity as unlimited even if quantity is set", () => {
    expect(
      mapProduct({ id: 1, quantity: 0, unlimited_quantity: true }).quantity,
    ).toBe(null);
  });

  it("maps cost price and an active sale price", () => {
    expect(
      mapProduct({
        id: 1,
        price: { amount: 100, currency: "SAR" },
        sale_price: { amount: 80, currency: "SAR" },
        cost_price: 45,
      }),
    ).toMatchObject({ price: 100, salePrice: 80, costPrice: 45 });

    // cost_price may also come as { amount }
    expect(mapProduct({ id: 1, cost_price: { amount: 12 } }).costPrice).toBe(
      12,
    );
  });

  it("ignores empty sale price and unset (0) cost price", () => {
    expect(
      mapProduct({
        id: 1,
        price: { amount: 100 },
        sale_price: { amount: 0 },
        cost_price: 0,
      }),
    ).toMatchObject({ salePrice: null, costPrice: null });

    // A "sale" that isn't cheaper is not a discount
    expect(
      mapProduct({ id: 1, price: { amount: 100 }, sale_price: { amount: 120 } })
        .salePrice,
    ).toBe(null);
  });

  it("maps missing or invalid categories to an empty list", () => {
    expect(mapProduct({ id: 1 }).categories).toEqual([]);
    expect(
      mapProduct({ id: 1, categories: [null, { name: "no id" }] }).categories,
    ).toEqual([]);
  });

  it("handles CORS preflight and rejects other methods", async () => {
    expect((await call({}, "OPTIONS")).statusCode).toBe(204);
    expect((await call({}, "GET")).statusCode).toBe(405);
  });

  it("requires token and app id", async () => {
    expect((await call({ appId: "a" })).statusCode).toBe(400);
    expect((await call({ token: "t" })).statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails clearly when SALLA_ACCESS_TOKEN is missing", async () => {
    delete process.env.SALLA_ACCESS_TOKEN;
    const res = await call({ token: "t", appId: "a" });
    expect(res.statusCode).toBe(500);
    expect(res.json).toEqual({
      success: false,
      error:
        "Server is missing configuration: SALLA_ACCESS_TOKEN (or install the app via the Salla webhook so it can be fetched automatically)",
      code: ERROR_CODES.CONFIG_MISSING,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not require DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    fetchMock
      .mockResolvedValueOnce(verified())
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: [], pagination: {} }),
      );
    const res = await call({ token: "t", appId: "a" });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toMatch(/DATABASE_URL/);
  });

  it("returns 401 when the embedded token is invalid", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { success: false }));
    const res = await call({ token: "bad", appId: "a" });
    expect(res.statusCode).toBe(401);
    expect(res.json.code).toBe(ERROR_CODES.EMBEDDED_TOKEN_INVALID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("verifies the embedded token, not SALLA_ACCESS_TOKEN", async () => {
    fetchMock
      .mockResolvedValueOnce(verified())
      .mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: [], pagination: {} }),
      );

    await call({ token: "embedded-token", appId: "app-1" });

    const [verifyUrl, verifyOptions] = fetchMock.mock.calls[0];
    expect(verifyUrl).toMatch(/exchange-authority\/v1\/verify$/);
    expect(JSON.parse(verifyOptions.body).token).toBe("embedded-token");
    expect(verifyOptions.headers["s-source"]).toBe("app-1");
  });

  it("uses SALLA_ACCESS_TOKEN, fetches all pages and sorts by sold quantity", async () => {
    fetchMock
      .mockResolvedValueOnce(verified())
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
    expect(productsOptions.headers.Authorization).toBe(
      `Bearer ${ACCESS_TOKEN}`,
    );
    expect(fetchMock.mock.calls[2][0]).toContain("page=2");
  });

  it("never returns the access token to the frontend", async () => {
    fetchMock.mockResolvedValueOnce(verified()).mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        data: [{ id: 1, name: "A", sold_quantity: 1 }],
        pagination: {},
      }),
    );

    const res = await call({ token: "t", appId: "a" });
    expect(res.body).not.toContain(ACCESS_TOKEN);
  });

  it("explains an invalid or expired SALLA_ACCESS_TOKEN (401)", async () => {
    fetchMock.mockResolvedValueOnce(verified()).mockResolvedValueOnce(
      jsonResponse(401, {
        success: false,
        error: { message: "The access token is invalid" },
      }),
    );

    const res = await call({ token: "t", appId: "a" });
    expect(res.statusCode).toBe(401);
    expect(res.json.code).toBe(ERROR_CODES.SALLA_UNAUTHORIZED);
    expect(res.json.error).toMatch(/SALLA_ACCESS_TOKEN is invalid or expired/);
    expect(res.json.error).toMatch(/redeploy/);
  });

  it("returns a clear insufficient-scope error on 403", async () => {
    fetchMock.mockResolvedValueOnce(verified()).mockResolvedValueOnce(
      jsonResponse(403, {
        success: false,
        error: { message: "Unauthorized scope" },
      }),
    );

    const res = await call({ token: "t", appId: "a" });
    expect(res.statusCode).toBe(403);
    expect(res.json.code).toBe(ERROR_CODES.SALLA_FORBIDDEN);
    expect(res.json.error).toMatch(/insufficient scope/);
  });

  it("hides unexpected internal errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
    const res = await call({ token: "t", appId: "a" });
    expect(res.statusCode).toBe(500);
    expect(res.json.error).toBe("Internal server error");
  });

  describe("validateProductChanges", () => {
    it("accepts price and quantity", () => {
      expect(
        validateProductChanges({ productId: 5, price: 10.5, quantity: 3 }),
      ).toEqual({ changes: { price: 10.5, quantity: 3 } });
    });

    it("maps costPrice to Salla's cost_price", () => {
      expect(validateProductChanges({ productId: 5, costPrice: 42.5 })).toEqual(
        { changes: { cost_price: 42.5 } },
      );
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
      [{ productId: 5, costPrice: -1 }, /Cost price/],
      [{ productId: 5, costPrice: "9" }, /Cost price/],
      [{ productId: 5 }, /Nothing to update/],
    ])("rejects %j", (input, message) => {
      expect(validateProductChanges(input).error).toMatch(message);
    });
  });

  describe("updateProductRequest", () => {
    it("rejects invalid changes before calling Salla", async () => {
      fetchMock.mockResolvedValueOnce(verified());
      const res = await callUpdate({
        token: "t",
        appId: "a",
        productId: 5,
        price: -1,
      });
      expect(res.statusCode).toBe(400);
      // Only the embedded token verification call
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

    it("sends a partial PUT with SALLA_ACCESS_TOKEN", async () => {
      fetchMock.mockResolvedValueOnce(verified()).mockResolvedValueOnce(
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
      expect(res.body).not.toContain(ACCESS_TOKEN);

      const [url, options] = fetchMock.mock.calls[1];
      expect(url).toBe("https://api.salla.dev/admin/v2/products/5");
      expect(options.method).toBe("PUT");
      expect(options.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
      expect(JSON.parse(options.body)).toEqual({ price: 120, quantity: 7 });
    });

    it("forwards Salla scope errors", async () => {
      fetchMock.mockResolvedValueOnce(verified()).mockResolvedValueOnce(
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
      expect(res.json.error).toMatch(/Missing products.read_write scope/);
    });
  });
});
