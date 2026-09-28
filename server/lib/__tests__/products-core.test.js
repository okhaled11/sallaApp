import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../verify-token-core.js", async (importOriginal) => ({
  ...(await importOriginal()),
  introspectEmbeddedToken: vi.fn(),
}));

vi.mock("../salla-token-manager.js", () => ({
  getValidAccessToken: vi.fn(),
}));

import {
  productsRequest,
  updateProductRequest,
  validateProductChanges,
  mapProduct,
} from "../products-core.js";
import { introspectEmbeddedToken } from "../verify-token-core.js";
import { getValidAccessToken } from "../salla-token-manager.js";
import { ERROR_CODES, SallaAuthError } from "../errors.js";

const MERCHANT_TOKEN = "ory_at_merchant_secret";

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

describe("products-core", () => {
  let fetchMock;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    introspectEmbeddedToken.mockResolvedValue({
      verified: true,
      merchantId: "1234509876",
    });
    getValidAccessToken.mockResolvedValue(MERCHANT_TOKEN);
  });

  afterEach(() => {
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
    expect(introspectEmbeddedToken).not.toHaveBeenCalled();
  });

  describe("merchant identification", () => {
    it("uses the merchant from Salla's introspection, not the request body", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: [], pagination: {} }),
      );

      await call({ token: "embedded", appId: "app", merchantId: "666" });

      expect(introspectEmbeddedToken).toHaveBeenCalledWith({
        token: "embedded",
        appId: "app",
      });
      expect(getValidAccessToken).toHaveBeenCalledWith("1234509876");
      expect(getValidAccessToken).not.toHaveBeenCalledWith("666");
    });

    it("prefers SALLA_APP_ID over the app_id sent by the browser", async () => {
      process.env.SALLA_APP_ID = "server-app-id";
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { success: true, data: [], pagination: {} }),
      );

      await call({ token: "embedded" });

      expect(introspectEmbeddedToken).toHaveBeenCalledWith({
        token: "embedded",
        appId: "server-app-id",
      });
      delete process.env.SALLA_APP_ID;
    });

    it("returns 401 when the embedded session is not verified", async () => {
      introspectEmbeddedToken.mockResolvedValue({
        verified: false,
        merchantId: null,
      });
      const res = await call({ token: "bad", appId: "a" });
      expect(res.statusCode).toBe(401);
      expect(res.json.code).toBe(ERROR_CODES.EMBEDDED_TOKEN_INVALID);
      expect(getValidAccessToken).not.toHaveBeenCalled();
    });

    it("returns 401 when the merchant cannot be determined", async () => {
      introspectEmbeddedToken.mockResolvedValue({
        verified: true,
        merchantId: null,
      });
      const res = await call({ token: "t", appId: "a" });
      expect(res.statusCode).toBe(401);
      expect(res.json.code).toBe(ERROR_CODES.MERCHANT_UNKNOWN);
    });
  });

  describe("products API", () => {
    it("uses the merchant token, fetches all pages and sorts by sold quantity", async () => {
      fetchMock
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

      const [productsUrl, productsOptions] = fetchMock.mock.calls[0];
      expect(productsUrl).toContain("/admin/v2/products?page=1");
      expect(productsOptions.headers.Authorization).toBe(
        `Bearer ${MERCHANT_TOKEN}`,
      );
      expect(fetchMock.mock.calls[1][0]).toContain("page=2");
    });

    it("never returns the merchant token to the frontend", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, {
          success: true,
          data: [{ id: 1, name: "A", sold_quantity: 1 }],
          pagination: {},
        }),
      );

      const res = await call({ token: "t", appId: "a" });
      expect(res.body).not.toContain(MERCHANT_TOKEN);
      expect(res.body).not.toMatch(/access_token|refresh_token/);
    });

    it("refreshes and retries once when Salla returns 401", async () => {
      getValidAccessToken
        .mockResolvedValueOnce("ory_at_revoked")
        .mockResolvedValueOnce("ory_at_fresh");
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(401, { success: false, error: { message: "invalid" } }),
        )
        .mockResolvedValueOnce(
          jsonResponse(200, { success: true, data: [], pagination: {} }),
        );

      const res = await call({ token: "t", appId: "a" });

      expect(res.statusCode).toBe(200);
      expect(getValidAccessToken).toHaveBeenNthCalledWith(2, "1234509876", {
        rejectedToken: "ory_at_revoked",
      });
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
        "Bearer ory_at_fresh",
      );
    });

    it("returns a clear error when Salla still returns 401", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(401, {
          success: false,
          error: { message: "The access token is invalid" },
        }),
      );

      const res = await call({ token: "t", appId: "a" });
      expect(res.statusCode).toBe(401);
      expect(res.json.code).toBe(ERROR_CODES.SALLA_UNAUTHORIZED);
      expect(res.json.error).toMatch(/Salla API returned 401/);
      expect(res.json.error).toMatch(/Reinstall/);
    });

    it("returns a clear insufficient-scope error on 403", async () => {
      fetchMock.mockResolvedValueOnce(
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

    it.each([
      [
        ERROR_CODES.MERCHANT_NOT_AUTHORIZED,
        "This store has not authorized the app yet.",
        403,
      ],
      [ERROR_CODES.TOKEN_REFRESH_FAILED, "Token refresh failed", 401],
      [
        ERROR_CODES.CONFIG_MISSING,
        "Server is missing configuration: KV_REST_API_URL",
        500,
      ],
    ])(
      "forwards token manager error %s safely",
      async (code, message, status) => {
        getValidAccessToken.mockRejectedValue(
          new SallaAuthError(code, message, status),
        );
        const res = await call({ token: "t", appId: "a" });
        expect(res.statusCode).toBe(status);
        expect(res.json).toEqual({ success: false, error: message, code });
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    it("hides unexpected internal errors", async () => {
      getValidAccessToken.mockRejectedValue(
        new Error("password=hunter2 something broke"),
      );
      const res = await call({ token: "t", appId: "a" });
      expect(res.statusCode).toBe(500);
      expect(res.json.error).toBe("Internal server error");
    });
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
    it("rejects invalid changes before calling Salla", async () => {
      const res = await callUpdate({
        token: "t",
        appId: "a",
        productId: 5,
        price: -1,
      });
      expect(res.statusCode).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns 401 when the embedded session is not verified", async () => {
      introspectEmbeddedToken.mockResolvedValue({
        verified: false,
        merchantId: null,
      });
      const res = await callUpdate({
        token: "bad",
        appId: "a",
        productId: 5,
        price: 10,
      });
      expect(res.statusCode).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends a partial PUT with the merchant token", async () => {
      fetchMock.mockResolvedValueOnce(
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
      expect(res.body).not.toContain(MERCHANT_TOKEN);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.salla.dev/admin/v2/products/5");
      expect(options.method).toBe("PUT");
      expect(options.headers.Authorization).toBe(`Bearer ${MERCHANT_TOKEN}`);
      expect(JSON.parse(options.body)).toEqual({ price: 120, quantity: 7 });
    });

    it("forwards Salla scope errors", async () => {
      fetchMock.mockResolvedValueOnce(
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
