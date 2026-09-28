import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  incentivesRequest,
  validateSettings,
  setRedisClient,
  SETTINGS_KEY,
} from "../incentives-core.js";
import { ERROR_CODES } from "../errors.js";

const SETTINGS = {
  freeShipping: { enabled: true, threshold: 200 },
  countdown: { enabled: true, endsAt: "2026-10-01T12:00:00.000Z" },
  coupon: { enabled: true, code: "save10", text: " خصم ", display: "popup" },
  lowStock: { enabled: false, threshold: 5 },
};

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(payload),
});

const withJson = (res) => ({
  ...res,
  json: res.body ? JSON.parse(res.body) : undefined,
});

const post = (body) =>
  incentivesRequest({ method: "POST", body: JSON.stringify(body) }).then(
    withJson,
  );

describe("incentives-core", () => {
  let fetchMock;
  let redis;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const store = new Map();
    redis = {
      get: vi.fn(async (key) => store.get(key) ?? null),
      set: vi.fn(async (key, value) => {
        store.set(key, value);
        return "OK";
      }),
    };
    setRedisClient(redis);
  });

  afterEach(() => {
    setRedisClient(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("validateSettings", () => {
    it("cleans up the coupon and keeps known fields only", () => {
      const { settings } = validateSettings({ ...SETTINGS, extra: 1 });
      expect(settings.coupon).toEqual({
        enabled: true,
        code: "SAVE10",
        text: "خصم",
        display: "popup",
      });
      expect(settings).not.toHaveProperty("extra");
    });

    it.each([
      [{ ...SETTINGS, freeShipping: { enabled: true, threshold: 0 } }, /at least 1/],
      [{ ...SETTINGS, countdown: { enabled: true, endsAt: "nope" } }, /Countdown/],
      [{ ...SETTINGS, coupon: { ...SETTINGS.coupon, display: "banner" } }, /Coupon/],
      [{ ...SETTINGS, coupon: { ...SETTINGS.coupon, code: "" } }, /coupon code/],
      [{ ...SETTINGS, lowStock: { enabled: true, threshold: 1.5 } }, /Stock limit/],
      [{ freeShipping: SETTINGS.freeShipping }, /missing a section/],
      [null, /required/],
    ])("rejects invalid settings %#", (input, message) => {
      expect(validateSettings(input).error).toMatch(message);
    });
  });

  it("returns null settings before anything is published", async () => {
    const res = withJson(await incentivesRequest({ method: "GET" }));
    expect(res.statusCode).toBe(200);
    expect(res.json).toEqual({ success: true, data: { settings: null } });
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(res.headers["Cache-Control"]).toMatch(/s-maxage/);
  });

  it("saves settings for a verified session and serves them publicly", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }));

    const res = await post({ token: "t", appId: "a", settings: SETTINGS });
    expect(res.statusCode).toBe(200);
    expect(res.json.data.settings.coupon.code).toBe("SAVE10");
    expect(res.json.data.settings.updatedAt).toBeTruthy();
    expect(redis.set).toHaveBeenCalledWith(SETTINGS_KEY, res.json.data.settings);

    const read = withJson(await incentivesRequest({ method: "GET" }));
    expect(read.json.data.settings.coupon.display).toBe("popup");
  });

  it("refuses to save when the embedded token is not verified", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { success: false }));

    const res = await post({ token: "bad", appId: "a", settings: SETTINGS });
    expect(res.statusCode).toBe(401);
    expect(res.json.code).toBe(ERROR_CODES.EMBEDDED_TOKEN_INVALID);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("rejects invalid settings before verifying the token", async () => {
    const res = await post({
      token: "t",
      appId: "a",
      settings: { ...SETTINGS, lowStock: { enabled: true, threshold: 0 } },
    });
    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires token and appId", async () => {
    expect((await post({ appId: "a", settings: SETTINGS })).statusCode).toBe(400);
    expect((await post({ token: "t", settings: SETTINGS })).statusCode).toBe(400);
  });

  it("reports missing Redis configuration", async () => {
    setRedisClient(null);
    const res = withJson(await incentivesRequest({ method: "GET" }));
    expect(res.statusCode).toBe(500);
    expect(res.json.code).toBe(ERROR_CODES.CONFIG_MISSING);
  });

  it("handles OPTIONS and unsupported methods", async () => {
    expect((await incentivesRequest({ method: "OPTIONS" })).statusCode).toBe(204);
    expect((await incentivesRequest({ method: "DELETE" })).statusCode).toBe(405);
  });

  it("rejects an invalid JSON body", async () => {
    const res = await incentivesRequest({ method: "POST", body: "{nope" });
    expect(res.statusCode).toBe(400);
  });
});
