import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

vi.mock("../merchant-token-store.js", () => ({
  upsertMerchantToken: vi.fn(),
  deleteMerchantToken: vi.fn(),
}));

import {
  handleSallaWebhook,
  verifyWebhookRequest,
  parseExpires,
} from "../salla-webhook-core.js";
import {
  upsertMerchantToken,
  deleteMerchantToken,
} from "../merchant-token-store.js";

const SECRET = "webhook-secret-123";

const authorizePayload = (overrides = {}) => ({
  event: "app.store.authorize",
  merchant: 1234509876,
  created_at: "2022-12-31 12:31:25",
  data: {
    access_token: "ory_at_merchant_access",
    expires: 1634819484,
    refresh_token: "ory_rt_merchant_refresh",
    scope: "settings.read products.read_write offline_access",
    token_type: "bearer",
    ...overrides,
  },
});

function signedRequest(payload, { secret = SECRET, rawBody } = {}) {
  const body = rawBody ?? JSON.stringify(payload);
  return {
    method: "POST",
    headers: {
      "X-Salla-Security-Strategy": "Signature",
      "X-Salla-Signature": createHmac("sha256", secret)
        .update(body)
        .digest("hex"),
    },
    rawBody: body,
  };
}

const parse = (res) => ({ ...res, json: JSON.parse(res.body) });

describe("salla-webhook-core", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SALLA_WEBHOOK_SECRET = SECRET;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.SALLA_WEBHOOK_SECRET;
    vi.restoreAllMocks();
  });

  describe("app.store.authorize", () => {
    it("stores the merchant tokens", async () => {
      const res = parse(
        await handleSallaWebhook(signedRequest(authorizePayload())),
      );

      expect(res.statusCode).toBe(200);
      expect(upsertMerchantToken).toHaveBeenCalledWith({
        merchantId: "1234509876",
        accessToken: "ory_at_merchant_access",
        refreshToken: "ory_rt_merchant_refresh",
        expiresAt: new Date(1634819484 * 1000),
        scope: "settings.read products.read_write offline_access",
      });
    });

    it("upserts again on reinstall of the same merchant", async () => {
      await handleSallaWebhook(signedRequest(authorizePayload()));
      await handleSallaWebhook(
        signedRequest(
          authorizePayload({
            access_token: "ory_at_second",
            refresh_token: "ory_rt_second",
          }),
        ),
      );

      expect(upsertMerchantToken).toHaveBeenCalledTimes(2);
      expect(upsertMerchantToken.mock.calls[1][0]).toMatchObject({
        merchantId: "1234509876",
        accessToken: "ory_at_second",
        refreshToken: "ory_rt_second",
      });
    });

    it("never returns or logs token values", async () => {
      const res = await handleSallaWebhook(signedRequest(authorizePayload()));

      expect(res.body).not.toMatch(/ory_(at|rt)_/);
      const logs = JSON.stringify([
        console.log.mock.calls,
        console.warn.mock.calls,
        console.error.mock.calls,
      ]);
      expect(logs).not.toMatch(/ory_(at|rt)_/);
    });

    it("rejects a payload without tokens", async () => {
      const payload = authorizePayload();
      delete payload.data.refresh_token;
      const res = await handleSallaWebhook(signedRequest(payload));
      expect(res.statusCode).toBe(400);
      expect(upsertMerchantToken).not.toHaveBeenCalled();
    });

    it("returns 500 (so Salla retries) when storage fails", async () => {
      upsertMerchantToken.mockRejectedValueOnce(new Error("connection lost"));
      const res = parse(
        await handleSallaWebhook(signedRequest(authorizePayload())),
      );
      expect(res.statusCode).toBe(500);
      expect(res.json.error).toBe("Internal server error");
    });
  });

  it("deletes tokens on app.uninstalled", async () => {
    const res = await handleSallaWebhook(
      signedRequest({ event: "app.uninstalled", merchant: 1234509876 }),
    );
    expect(res.statusCode).toBe(200);
    expect(deleteMerchantToken).toHaveBeenCalledWith("1234509876");
  });

  it("acknowledges and ignores other events", async () => {
    const res = parse(
      await handleSallaWebhook(
        signedRequest({ event: "order.created", merchant: 1 }),
      ),
    );
    expect(res.statusCode).toBe(200);
    expect(res.json.ignored).toBe(true);
    expect(upsertMerchantToken).not.toHaveBeenCalled();
  });

  describe("security", () => {
    it("rejects an invalid signature", async () => {
      const res = await handleSallaWebhook(
        signedRequest(authorizePayload(), { secret: "wrong-secret" }),
      );
      expect(res.statusCode).toBe(401);
      expect(upsertMerchantToken).not.toHaveBeenCalled();
    });

    it("rejects a tampered body", async () => {
      const request = signedRequest(authorizePayload());
      request.rawBody = request.rawBody.replace("1234509876", "999");
      const res = await handleSallaWebhook(request);
      expect(res.statusCode).toBe(401);
    });

    it("rejects requests without a security strategy", async () => {
      const res = await handleSallaWebhook({
        method: "POST",
        headers: {},
        rawBody: JSON.stringify(authorizePayload()),
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects everything when SALLA_WEBHOOK_SECRET is not set", () => {
      delete process.env.SALLA_WEBHOOK_SECRET;
      const request = signedRequest(authorizePayload());
      expect(verifyWebhookRequest(request).valid).toBe(false);
    });

    it("accepts the Token strategy with the configured token", () => {
      const rawBody = JSON.stringify(authorizePayload());
      expect(
        verifyWebhookRequest({
          headers: {
            "x-salla-security-strategy": "Token",
            authorization: SECRET,
          },
          rawBody,
        }).valid,
      ).toBe(true);
      expect(
        verifyWebhookRequest({
          headers: {
            "x-salla-security-strategy": "Token",
            authorization: "Bearer nope",
          },
          rawBody,
        }).valid,
      ).toBe(false);
    });

    it("accepts a signature over the re-serialized JSON (Salla sample)", () => {
      const payload = authorizePayload();
      const pretty = JSON.stringify(payload, null, 2);
      const request = signedRequest(payload); // signed over compact JSON
      expect(
        verifyWebhookRequest({
          headers: request.headers,
          rawBody: pretty,
          parsedBody: payload,
        }).valid,
      ).toBe(true);
    });
  });

  it("rejects non-POST and invalid JSON", async () => {
    expect((await handleSallaWebhook({ method: "GET" })).statusCode).toBe(405);
    expect(
      (await handleSallaWebhook({ method: "POST", headers: {}, rawBody: "{" }))
        .statusCode,
    ).toBe(400);
  });

  it("parses expires as a Unix timestamp", () => {
    expect(parseExpires(1634819484)).toEqual(new Date(1634819484000));
    expect(parseExpires("1634819484")).toEqual(new Date(1634819484000));
    expect(parseExpires(1634819484000)).toEqual(new Date(1634819484000));
    expect(parseExpires(undefined, 5)).toEqual(new Date(5));
  });
});
