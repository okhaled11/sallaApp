import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createOfferRequest } from "../special-offers-core.js";

const json = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(payload),
});

const request = (extra = {}) =>
  createOfferRequest({
    method: "POST",
    body: JSON.stringify({
      token: "t",
      appId: "a",
      name: "اشترِ فستان واحصل على وشاح",
      buy_product_id: 111,
      gift_product_id: 222,
      ...extra,
    }),
  });

describe("special-offers-core", () => {
  let fetchMock;
  let verifyOk;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.SALLA_ACCESS_TOKEN = "env_token";
    verifyOk = true;
    fetchMock = vi.fn(async (url, opts) => {
      if (String(url).includes("exchange-authority")) {
        return json(200, { success: verifyOk, data: {} });
      }
      return json(200, { data: { id: 555, status: "active" } });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    delete process.env.SALLA_ACCESS_TOKEN;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const sallaCall = () => fetchMock.mock.calls.find(([url]) => String(url).includes("/specialoffers"));

  it("creates a buy_x_get_y offer with the free-product discount", async () => {
    const res = await request();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).offer.id).toBe(555);
    const [url, opts] = sallaCall();
    expect(opts.method).toBe("POST");
    expect(url).toMatch(/specialoffers$/);
    const body = JSON.parse(opts.body);
    expect(body).toMatchObject({
      offer_type: "buy_x_get_y",
      applied_to: "product",
      buy: { type: "product", quantity: 1, products: [111] },
      get: { type: "product", discount_type: "free-product", quantity: 1, products: [222] },
    });
  });

  it("accepts several buy products and several gift products", async () => {
    await request({ buy_product_ids: [111, 112, 113], gift_product_ids: ["222", "223"], buy_product_id: undefined, gift_product_id: undefined });
    const body = JSON.parse(sallaCall()[1].body);
    expect(body.buy.products).toEqual([111, 112, 113]);
    expect(body.get.products).toEqual([222, 223]);
  });

  it("rejects an invalid id inside the product lists", async () => {
    const res = await request({ buy_product_ids: [111, "abc"], buy_product_id: undefined });
    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("supports buying several pieces to get several free", async () => {
    await request({ buy_quantity: 3, gift_quantity: 2 });
    const body = JSON.parse(sallaCall()[1].body);
    expect(body.buy.quantity).toBe(3);
    expect(body.get.quantity).toBe(2);
  });

  it("falls back to 1 for invalid quantities and caps huge ones", async () => {
    await request({ buy_quantity: "abc", gift_quantity: 5000 });
    const body = JSON.parse(sallaCall()[1].body);
    expect(body.buy.quantity).toBe(1);
    expect(body.get.quantity).toBe(100);
  });

  it("updates the existing offer instead of creating a duplicate", async () => {
    await request({ existing_offer_id: 555 });
    const [url, opts] = sallaCall();
    expect(opts.method).toBe("PUT");
    expect(url).toMatch(/specialoffers\/555$/);
  });

  it("falls back to creating a new offer when the old one no longer exists", async () => {
    fetchMock.mockImplementation(async (url, opts) => {
      if (String(url).includes("exchange-authority")) return json(200, { success: true });
      if (opts?.method === "PUT") return json(404, {});
      return json(200, { data: { id: 777 } });
    });
    const res = await request({ existing_offer_id: 555 });
    expect(JSON.parse(res.body).offer.id).toBe(777);
  });

  it("sends a start date-time that is not in the past (date AND time)", async () => {
    await request();
    const body = JSON.parse(sallaCall()[1].body);
    expect(body.start_date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    // At least "now" in UTC+3, so never behind a Saudi clock
    expect(new Date(body.start_date.replace(" ", "T") + "Z").getTime()).toBeGreaterThan(Date.now() + 3 * 3600 * 1000);
  });

  it("retries with a wider start margin when Salla rejects start_date", async () => {
    let offerCalls = 0;
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("exchange-authority")) return json(200, { success: true });
      offerCalls++;
      return offerCalls === 1
        ? json(422, { error: { message: "alert.invalid_fields", fields: { start_date: ["past"] } } })
        : json(200, { data: { id: 888 } });
    });
    const res = await request();
    expect(res.statusCode).toBe(200);
    expect(offerCalls).toBe(2);
    const starts = fetchMock.mock.calls
      .filter(([url]) => String(url).includes("/specialoffers"))
      .map(([, o]) => new Date(JSON.parse(o.body).start_date.replace(" ", "T") + "Z").getTime());
    expect(starts[1]).toBeGreaterThan(starts[0]);
  });

  it("requires both products", async () => {
    const res = await request({ gift_product_id: "" });
    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unverified app session without calling Salla offers", async () => {
    verifyOk = false;
    const res = await request();
    expect(res.statusCode).toBe(401);
    expect(sallaCall()).toBeUndefined();
  });

  it("surfaces Salla validation errors", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("exchange-authority")) return json(200, { success: true });
      return json(422, { error: { message: "alert.invalid_fields", fields: { "buy.products": ["مطلوب"] } } });
    });
    const res = await request();
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error).toContain("buy.products");
  });
});
