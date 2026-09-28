import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Readable } from "stream";
import { createHmac } from "crypto";
import { introspectEmbeddedToken } from "../verify-token-core.js";

vi.mock("../merchant-token-store.js", () => ({
  upsertMerchantToken: vi.fn(),
  deleteMerchantToken: vi.fn(),
}));

import vercelWebhookHandler from "../../../api/webhooks/salla.js";
import { upsertMerchantToken } from "../merchant-token-store.js";

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(payload),
});

describe("introspectEmbeddedToken", () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ENV;
  });

  it("returns the merchant ID from Salla's introspection", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: { merchant_id: 1234509876, user_id: 5, exp: "2030-01-01" },
      }),
    );

    await expect(
      introspectEmbeddedToken({ token: "embedded", appId: "app-1" }),
    ).resolves.toEqual({ verified: true, merchantId: "1234509876" });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.salla.dev/exchange-authority/v1/introspect");
    expect(options.headers["S-Source"]).toBe("app-1");
    expect(JSON.parse(options.body)).toMatchObject({
      token: "embedded",
      env: "prod",
    });
  });

  it("uses the dev service when ENV=dev", async () => {
    process.env.ENV = "dev";
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, data: {} }));
    await introspectEmbeddedToken({ token: "t", appId: "a" });
    expect(fetchMock.mock.calls[0][0]).toMatch(
      /exchange-authority-service-dev.*\/introspect$/,
    );
  });

  it("is not verified when Salla rejects the token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { success: false }));
    await expect(
      introspectEmbeddedToken({ token: "bad", appId: "a" }),
    ).resolves.toEqual({ verified: false, merchantId: null });
  });
});

describe("Vercel webhook handler (api/webhooks/salla.js)", () => {
  beforeEach(() => {
    process.env.SALLA_WEBHOOK_SECRET = "secret";
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.SALLA_WEBHOOK_SECRET;
    vi.restoreAllMocks();
  });

  it("verifies the signature over the raw request stream", async () => {
    // Deliberately non-canonical JSON: only the raw bytes match the signature
    const rawBody =
      '{"event":"app.store.authorize","merchant":42,"data":{"access_token":"at","refresh_token":"rt","expires":1634819484,"scope":"s"}}  ';
    const req = Readable.from([Buffer.from(rawBody)]);
    req.method = "POST";
    req.headers = {
      "x-salla-security-strategy": "Signature",
      "x-salla-signature": createHmac("sha256", "secret")
        .update(rawBody)
        .digest("hex"),
    };

    const res = {
      headers: {},
      setHeader(key, value) {
        this.headers[key] = value;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      send(body) {
        this.body = body;
      },
    };

    await vercelWebhookHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(upsertMerchantToken).toHaveBeenCalledWith(
      expect.objectContaining({ merchantId: "42", accessToken: "at" }),
    );
  });
});
