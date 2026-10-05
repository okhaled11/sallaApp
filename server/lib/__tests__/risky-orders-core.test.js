import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { riskyOrdersRequest } from "../risky-orders-core.js";

const json = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(payload),
});

const sallaOrder = (id, over = {}) => ({
  id,
  reference_id: 5000 + id,
  total: { amount: 100, currency: "SAR" },
  date: { date: new Date().toISOString().slice(0, 10) + " 12:00:00.000000", timezone: "Asia/Riyadh" },
  status: { slug: "under_review", name: "قيد المراجعة" },
  payment_method: "cod",
  customer: { id: id, first_name: "عميل", last_name: String(id), mobile: 500000000 + id * 137, mobile_code: "+966", city: "الرياض" },
  items: [{ name: "منتج", quantity: 1 }],
  ...over,
});

const call = (body) => riskyOrdersRequest({ method: "POST", body: JSON.stringify(body) }).then((res) => ({ ...res, json: res.body ? JSON.parse(res.body) : undefined }));

describe("risky-orders-core", () => {
  let fetchMock;
  let pages;
  let verified;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.SALLA_ACCESS_TOKEN = "env_token";
    verified = true;
    pages = [[sallaOrder(1), sallaOrder(2)]];
    fetchMock = vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("exchange-authority")) return json(200, { success: verified });
      const page = Number(new URL(href).searchParams.get("page"));
      return json(200, { data: pages[page - 1] || [], pagination: { totalPages: pages.length } });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    delete process.env.SALLA_ACCESS_TOKEN;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const ordersCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes("/admin/v2/orders"));

  it("returns scored orders, riskiest first, with their reasons", async () => {
    pages = [[
      sallaOrder(1),
      sallaOrder(2, { customer: { id: 2, first_name: "ع", last_name: "ج", mobile: 5555555555, mobile_code: "+966", city: "" }, items: [{ name: "x", quantity: 12 }] }),
    ]];
    const res = await call({ token: "t", appId: "a" });
    expect(res.statusCode).toBe(200);
    const { orders, stats, truncated } = res.json.data;
    expect(orders.map((o) => o.id)).toEqual([2, 1]);
    expect(orders[0].score).toBeGreaterThan(orders[1].score);
    expect(orders[0].reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["bad_phone", "bulk_quantity"]));
    expect(orders[0].phone).toBe("9665555555555");
    expect(stats.codOrders).toBe(2);
    expect(truncated).toBe(false);
  });

  it("walks every page and asks Salla only for the window's orders", async () => {
    pages = [[sallaOrder(1)], [sallaOrder(2)], [sallaOrder(3)]];
    const res = await call({ token: "t", appId: "a", days: 30 });
    expect(res.json.data.fetched).toBe(3);
    expect(ordersCalls()).toHaveLength(3);
    const first = new URL(String(ordersCalls()[0][0])).searchParams;
    expect(first.get("per_page")).toBe("30");
    expect(first.get("from_date")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(first.get("sort_by")).toBe("created_at-desc");
    expect(res.json.data.windowDays).toBe(30);
  });

  it("clamps the requested window", async () => {
    const res = await call({ token: "t", appId: "a", days: 9999 });
    expect(res.json.data.windowDays).toBe(120);
  });

  it("only sends back the last 30 days but scores with the full history", async () => {
    const old = sallaOrder(9, { date: { date: "2020-01-01 10:00:00.000000", timezone: "Asia/Riyadh" } });
    pages = [[sallaOrder(1), old]];
    const res = await call({ token: "t", appId: "a" });
    expect(res.json.data.orders.map((o) => o.id)).toEqual([1]);
    expect(res.json.data.fetched).toBe(2);
  });

  it("rejects a request without a verified dashboard session", async () => {
    verified = false;
    const res = await call({ token: "t", appId: "a" });
    expect(res.statusCode).toBe(401);
    expect(ordersCalls()).toHaveLength(0);
  });

  it("requires the token and app id", async () => {
    expect((await call({ appId: "a" })).statusCode).toBe(400);
    expect((await call({ token: "t" })).statusCode).toBe(400);
  });

  it("explains a missing Orders scope (403)", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("exchange-authority") ? json(200, { success: true }) : json(403, { error: { message: "forbidden" } }),
    );
    const res = await call({ token: "t", appId: "a" });
    expect(res.statusCode).toBe(403);
    expect(res.json.error).toMatch(/Orders \(Read\)/);
  });

  it("explains an invalid or expired access token (401)", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("exchange-authority") ? json(200, { success: true }) : json(401, {}),
    );
    const res = await call({ token: "t", appId: "a" });
    expect(res.statusCode).toBe(401);
    expect(res.json.error).toMatch(/invalid or expired/);
  });

  it("fails clearly when no Salla access token is available", async () => {
    delete process.env.SALLA_ACCESS_TOKEN;
    const res = await call({ token: "t", appId: "a" });
    expect(res.statusCode).toBe(500);
    expect(res.json.code).toBe("CONFIG_MISSING");
  });

  it("only allows POST", async () => {
    expect((await riskyOrdersRequest({ method: "GET", body: "" })).statusCode).toBe(405);
  });
});
