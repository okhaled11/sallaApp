import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCouponRequest } from "../coupons-core.js";

const json = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(payload),
});

describe("coupons-core: gift coupon", () => {
  let fetchMock;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.SALLA_ACCESS_TOKEN = "env_token";
    fetchMock = vi.fn(async (url, opts) => {
      if (opts?.method === "POST") return json(200, { data: { id: 99, code: "GIFT1" } });
      if (String(url).includes("/store/info")) return json(200, { data: { name: "متجر" } });
      return json(200, { data: [{ code: "GIFT1" }] });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    delete process.env.SALLA_ACCESS_TOKEN;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const sentPayload = () => JSON.parse(fetchMock.mock.calls.find(([, o]) => o?.method === "POST")[1].body);

  it("creates a 100% coupon restricted to the gift product, once per customer", async () => {
    const res = await createCouponRequest({
      method: "POST",
      body: JSON.stringify({
        code: "gift1",
        discount_type: "percentage",
        discount_value: 100,
        gift_product_id: 1626467363,
      }),
    });
    expect(res.statusCode).toBe(200);
    const payload = sentPayload();
    expect(payload).toMatchObject({
      code: "GIFT1",
      type: "percentage",
      amount: 100,
      free_shipping: false,
      products_include: ["1626467363"],
      usage_limit: 100000,
      usage_limit_per_user: 1,
    });
    expect(payload.usage_limit_per_user).toBeLessThan(payload.usage_limit);
  });

  it("rejects a non-numeric gift product id", async () => {
    const res = await createCouponRequest({
      method: "POST",
      body: JSON.stringify({ code: "gift1", gift_product_id: "abc" }),
    });
    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not restrict products for a normal coupon", async () => {
    await createCouponRequest({
      method: "POST",
      body: JSON.stringify({ code: "save10", discount_type: "percentage", discount_value: 10 }),
    });
    expect(sentPayload().products_include).toBeUndefined();
  });
});
