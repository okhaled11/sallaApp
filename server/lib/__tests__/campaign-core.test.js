import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  campaignRequest,
  storefrontCampaignRequest,
  toSallaDate,
  CAMPAIGN_SETTING_KEY,
  DEFAULT_DESIGN,
} from "../campaign-core.js";

const ACCESS_TOKEN = "ory_at_campaign_token";
const HOUR = 60 * 60 * 1000;

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(payload),
});

/**
 * Tiny fake of the Salla API, routed by method + path.
 * `settings` holds the app settings, `offers` the special offers.
 */
function fakeSalla({ settings = {}, verified = true } = {}) {
  const state = {
    settings: { ...settings },
    offers: new Map(),
    nextOfferId: 500,
    calls: [],
  };

  const fetchMock = vi.fn(async (url, options = {}) => {
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : undefined;
    const path = url.replace("https://api.salla.dev/admin/v2", "");
    state.calls.push({ method, path, body, headers: options.headers });

    if (url.includes("exchange-authority")) {
      return jsonResponse(verified ? 200 : 401, { success: verified });
    }
    if (path.startsWith("/products")) {
      return jsonResponse(200, {
        success: true,
        data: [
          {
            id: 1,
            name: "Idle",
            price: { amount: 100, currency: "SAR" },
            quantity: 5,
            sold_quantity: 0,
            urls: { customer: "https://store.test/p1" },
          },
          {
            id: 2,
            name: "Other",
            price: { amount: 80, currency: "SAR" },
            quantity: 5,
            sold_quantity: 9,
          },
        ],
        pagination: {},
      });
    }
    if (path === "/store/info") {
      return jsonResponse(200, { success: true, data: { id: 777 } });
    }
    if (path === "/apps/app-1/settings" && method === "GET") {
      return jsonResponse(200, {
        success: true,
        data: { settings: state.settings },
      });
    }
    if (path === "/apps/app-1/settings" && method === "POST") {
      state.settings = body;
      return jsonResponse(200, { success: true, data: body });
    }
    if (path === "/specialoffers" && method === "POST") {
      const id = state.nextOfferId++;
      state.offers.set(id, { ...body, status: "active" });
      return jsonResponse(201, { success: true, data: { id } });
    }
    const offerMatch = path.match(/^\/specialoffers\/(\d+)(\/status)?$/);
    if (offerMatch) {
      const id = Number(offerMatch[1]);
      if (!state.offers.has(id)) {
        return jsonResponse(404, {
          success: false,
          error: { message: "Not found" },
        });
      }
      if (offerMatch[2]) state.offers.get(id).status = body.status;
      else state.offers.set(id, { ...state.offers.get(id), ...body });
      return jsonResponse(200, { success: true, data: { id } });
    }
    return jsonResponse(500, {
      success: false,
      error: { message: `Unhandled ${method} ${path}` },
    });
  });

  return { state, fetchMock };
}

const draft = (overrides = {}) => ({
  productIds: [1],
  discountPercent: 25,
  endsAt: new Date(Date.now() + 48 * HOUR).toISOString(),
  design: { ...DEFAULT_DESIGN },
  trigger: { delaySeconds: 2, frequency: "day" },
  ...overrides,
});

const call = (body) =>
  campaignRequest({
    method: "POST",
    body: JSON.stringify({ token: "t", appId: "app-1", ...body }),
  }).then((res) => ({ ...res, json: JSON.parse(res.body) }));

describe("campaign-core", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.SALLA_ACCESS_TOKEN = ACCESS_TOKEN;
  });

  afterEach(() => {
    delete process.env.SALLA_ACCESS_TOKEN;
    delete process.env.SALLA_APP_ID;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("formats dates in Saudi local time for Salla", () => {
    expect(toSallaDate("2030-01-01T21:30:00Z")).toBe("2030-01-02T00:30:00");
  });

  describe("POST /api/campaign", () => {
    it("rejects an unverified embedded session", async () => {
      const { fetchMock } = fakeSalla({ verified: false });
      vi.stubGlobal("fetch", fetchMock);
      const res = await call({ action: "get" });
      expect(res.statusCode).toBe(401);
    });

    it("returns null when no campaign was saved", async () => {
      const { fetchMock } = fakeSalla();
      vi.stubGlobal("fetch", fetchMock);
      const res = await call({ action: "get" });
      expect(res.json.data.campaign).toBe(null);
    });

    it("publishes: creates the offer and saves the snapshot in App Settings", async () => {
      const { state, fetchMock } = fakeSalla({
        settings: { other_setting: "keep me" },
      });
      vi.stubGlobal("fetch", fetchMock);

      const res = await call({ action: "save", campaign: draft() });

      expect(res.statusCode).toBe(200);
      const offer = state.offers.get(500);
      expect(offer).toMatchObject({
        offer_type: "percentage",
        applied_to: "product",
        buy: { type: "product", products: [1], min_amount: 0 },
        get: { discount_amount: 25 },
      });

      // Other app settings are preserved (Salla replaces all settings)
      expect(state.settings.other_setting).toBe("keep me");
      const saved = JSON.parse(state.settings[CAMPAIGN_SETTING_KEY]);
      expect(saved).toMatchObject({
        enabled: true,
        storeId: "777",
        offerId: 500,
        discountPercent: 25,
        products: [
          {
            id: 1,
            name: "Idle",
            price: 100,
            finalPrice: 75,
            url: "https://store.test/p1",
          },
        ],
      });

      // Uses the merchant token, never returns it
      const settingsCall = state.calls.find(
        (c) => c.path === "/apps/app-1/settings",
      );
      expect(settingsCall.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
      expect(res.body).not.toContain(ACCESS_TOKEN);
    });

    it("updates the same offer when republishing", async () => {
      const { state, fetchMock } = fakeSalla();
      vi.stubGlobal("fetch", fetchMock);
      await call({ action: "save", campaign: draft() });
      await call({ action: "save", campaign: draft({ discountPercent: 40 }) });

      expect(state.offers.size).toBe(1);
      expect(state.offers.get(500).get.discount_amount).toBe(40);
    });

    it("recreates the offer if the merchant deleted it", async () => {
      const { state, fetchMock } = fakeSalla();
      vi.stubGlobal("fetch", fetchMock);
      await call({ action: "save", campaign: draft() });
      state.offers.clear();

      await call({ action: "save", campaign: draft() });
      expect(state.offers.has(501)).toBe(true);
      expect(JSON.parse(state.settings[CAMPAIGN_SETTING_KEY]).offerId).toBe(
        501,
      );
    });

    it("validates the campaign before touching Salla", async () => {
      const { state, fetchMock } = fakeSalla();
      vi.stubGlobal("fetch", fetchMock);
      const res = await call({
        action: "save",
        campaign: draft({ discountPercent: 0 }),
      });
      expect(res.statusCode).toBe(400);
      expect(state.offers.size).toBe(0);
    });

    it("rejects products that are not in the store", async () => {
      const { state, fetchMock } = fakeSalla();
      vi.stubGlobal("fetch", fetchMock);
      const res = await call({
        action: "save",
        campaign: draft({ productIds: [1, 42] }),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json.error).toMatch(/42/);
      expect(state.offers.size).toBe(0);
    });

    it("stops: deactivates the offer and disables the campaign", async () => {
      const { state, fetchMock } = fakeSalla();
      vi.stubGlobal("fetch", fetchMock);
      await call({ action: "save", campaign: draft() });

      const res = await call({ action: "stop" });
      expect(res.json.data.campaign.enabled).toBe(false);
      expect(state.offers.get(500).status).toBe("inactive");
      expect(JSON.parse(state.settings[CAMPAIGN_SETTING_KEY]).enabled).toBe(
        false,
      );
    });

    it("prefers SALLA_APP_ID for the settings API", async () => {
      process.env.SALLA_APP_ID = "app-1";
      const { fetchMock } = fakeSalla();
      vi.stubGlobal("fetch", fetchMock);
      const res = await call({ action: "get", appId: "from-browser" });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("GET /api/storefront-campaign", () => {
    async function publish(state, fetchMock, overrides) {
      vi.stubGlobal("fetch", fetchMock);
      await call({ action: "save", campaign: draft(overrides) });
    }

    const get = (store) =>
      storefrontCampaignRequest({ method: "GET", query: { store } }).then(
        (res) => ({
          ...res,
          json: res.body ? JSON.parse(res.body) : undefined,
        }),
      );

    beforeEach(() => {
      process.env.SALLA_APP_ID = "app-1";
    });

    it("serves the public campaign for the right store, cached at the edge", async () => {
      const { state, fetchMock } = fakeSalla();
      await publish(state, fetchMock);

      const res = await get("777");
      expect(res.statusCode).toBe(200);
      expect(res.headers["Cache-Control"]).toMatch(/s-maxage=60/);
      expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
      expect(res.json.campaign).toMatchObject({
        discountPercent: 25,
        trigger: { frequency: "day" },
      });
      // No internal ids for shoppers
      expect(res.json.campaign.offerId).toBeUndefined();
      expect(res.json.campaign.storeId).toBeUndefined();
      expect(res.body).not.toContain(ACCESS_TOKEN);
    });

    it("returns null for another store, a stopped or an expired campaign", async () => {
      const { state, fetchMock } = fakeSalla();
      await publish(state, fetchMock);
      expect((await get("123")).json.campaign).toBe(null);

      await call({ action: "stop" });
      expect((await get("777")).json.campaign).toBe(null);

      const saved = JSON.parse(state.settings[CAMPAIGN_SETTING_KEY]);
      state.settings[CAMPAIGN_SETTING_KEY] = JSON.stringify({
        ...saved,
        enabled: true,
        endsAt: new Date(Date.now() - 1000).toISOString(),
      });
      expect((await get("777")).json.campaign).toBe(null);
    });

    it("rejects invalid store ids and other methods", async () => {
      expect((await get("abc")).statusCode).toBe(400);
      const post = await storefrontCampaignRequest({
        method: "POST",
        query: {},
      });
      expect(post.statusCode).toBe(405);
    });

    it("never fails loudly for shoppers", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Salla down")),
      );
      const res = await get("777");
      expect(res.statusCode).toBe(200);
      expect(res.json.campaign).toBe(null);
    });

    it("returns null when not configured", async () => {
      delete process.env.SALLA_APP_ID;
      const res = await get("777");
      expect(res.json.campaign).toBe(null);
    });
  });
});
