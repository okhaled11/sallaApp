import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import { sallaWebhookRequest } from "../webhook-core.js";
import { getActiveAccessToken, clearStoredToken } from "../salla-tokens-core.js";

const sign = (body, secret) => crypto.createHmac("sha256", secret).update(body).digest("hex");
const authorize = (extra = {}) =>
  JSON.stringify({
    event: "app.store.authorize",
    merchant: 1,
    data: { access_token: "tok_1", refresh_token: "r1", expires: 9999999999, ...extra },
  });

describe("webhook-core", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(async () => {
    delete process.env.SALLA_WEBHOOK_SECRET;
    delete process.env.SALLA_ACCESS_TOKEN;
    await clearStoredToken();
    vi.restoreAllMocks();
  });

  it("stores the token from app.store.authorize and uses it", async () => {
    const res = await sallaWebhookRequest({ method: "POST", body: authorize(), headers: {} });
    expect(res.statusCode).toBe(200);
    expect(await getActiveAccessToken()).toBe("tok_1");
  });

  it("falls back to SALLA_ACCESS_TOKEN when nothing is stored", async () => {
    process.env.SALLA_ACCESS_TOKEN = "env_token";
    expect(await getActiveAccessToken()).toBe("env_token");
  });

  it("clears the token on app.uninstalled", async () => {
    await sallaWebhookRequest({ method: "POST", body: authorize(), headers: {} });
    await sallaWebhookRequest({
      method: "POST",
      body: JSON.stringify({ event: "app.uninstalled" }),
      headers: {},
    });
    expect(await getActiveAccessToken()).toBeNull();
  });

  it("verifies the signature against the raw body (PHP-style escaped slashes)", async () => {
    process.env.SALLA_WEBHOOK_SECRET = "shh";
    // Salla (PHP) escapes "/" as "\/"; JSON.stringify of the parsed body would not reproduce it.
    const raw = authorize({ note: "a\\/b" });
    const bad = await sallaWebhookRequest({
      method: "POST",
      body: raw,
      headers: { "x-salla-signature": "nope" },
    });
    expect(bad.statusCode).toBe(401);
    const ok = await sallaWebhookRequest({
      method: "POST",
      body: raw,
      headers: { "x-salla-signature": sign(raw, "shh") },
    });
    expect(ok.statusCode).toBe(200);
  });

  it("rejects non-POST and allows OPTIONS", async () => {
    expect((await sallaWebhookRequest({ method: "GET", body: "" })).statusCode).toBe(405);
    expect((await sallaWebhookRequest({ method: "OPTIONS", body: "" })).statusCode).toBe(204);
  });
});
