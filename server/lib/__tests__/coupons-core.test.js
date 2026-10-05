import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCouponRequest } from "../coupons-core.js";

const json = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(payload),
});

describe("coupons-core", () => {
  let fetchMock;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.SALLA_ACCESS_TOKEN = "env_token";
    fetchMock = vi.fn(async (url, opts) => {
      if (opts?.method === "POST") return json(200, { data: { id: 99, code: "SAVE10" } });
      if (String(url).includes("/store/info")) return json(200, { data: { name: "متجر" } });
      return json(200, { data: [{ code: "SAVE10" }] });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    delete process.env.SALLA_ACCESS_TOKEN;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const sentPayload = () => JSON.parse(fetchMock.mock.calls.find(([, o]) => o?.method === "POST")[1].body);

  it("creates an active percentage coupon with the cleaned-up code", async () => {
    const res = await createCouponRequest({
      method: "POST",
      body: JSON.stringify({ code: " save10 ", discount_type: "percentage", discount_value: 10 }),
    });
    expect(res.statusCode).toBe(200);
    expect(sentPayload()).toMatchObject({ code: "SAVE10", type: "percentage", amount: 10, status: "active" });
    expect(sentPayload().products_include).toBeUndefined();
  });

  it("maps free shipping to the free_shipping flag", async () => {
    await createCouponRequest({
      method: "POST",
      body: JSON.stringify({ code: "ship", discount_type: "free_shipping" }),
    });
    expect(sentPayload()).toMatchObject({ type: "fixed", free_shipping: true });
  });
});
