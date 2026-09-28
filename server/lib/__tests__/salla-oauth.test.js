import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { refreshAccessToken, SALLA_TOKEN_URL } from "../salla-oauth.js";
import { ERROR_CODES } from "../errors.js";

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(payload),
});

describe("salla-oauth refreshAccessToken", () => {
  let fetchMock;

  beforeEach(() => {
    process.env.SALLA_CLIENT_ID = "client-id";
    process.env.SALLA_CLIENT_SECRET = "super-secret-value";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    delete process.env.SALLA_CLIENT_ID;
    delete process.env.SALLA_CLIENT_SECRET;
    vi.unstubAllGlobals();
  });

  it("posts the documented refresh_token grant as form data", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        access_token: "ory_at_new",
        refresh_token: "ory_rt_new",
        expires_in: 1209599,
        scope: "products.read_write offline_access",
        token_type: "bearer",
      }),
    );

    const before = Date.now();
    const tokens = await refreshAccessToken("ory_rt_old");

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(SALLA_TOKEN_URL);
    expect(url).toBe("https://accounts.salla.sa/oauth2/token");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(Object.fromEntries(new URLSearchParams(options.body))).toEqual({
      grant_type: "refresh_token",
      client_id: "client-id",
      client_secret: "super-secret-value",
      refresh_token: "ory_rt_old",
    });

    expect(tokens.accessToken).toBe("ory_at_new");
    expect(tokens.refreshToken).toBe("ory_rt_new");
    expect(tokens.scope).toBe("products.read_write offline_access");
    expect(tokens.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 1209599 * 1000,
    );
  });

  it("fails clearly (without secrets) when Salla rejects the refresh token", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        error: "invalid_grant",
        error_description: "refresh token ory_rt_old was revoked",
      }),
    );

    const error = await refreshAccessToken("ory_rt_old").catch((e) => e);
    expect(error.code).toBe(ERROR_CODES.TOKEN_REFRESH_FAILED);
    expect(error.status).toBe(401);
    expect(error.message).toMatch(/invalid_grant/);
    expect(error.message).toMatch(/reinstall/i);
    expect(error.message).not.toContain("ory_rt_old");
    expect(error.message).not.toContain("super-secret-value");
  });

  it("reports network failures as refresh failures", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    await expect(refreshAccessToken("ory_rt_old")).rejects.toMatchObject({
      code: ERROR_CODES.TOKEN_REFRESH_FAILED,
      status: 502,
    });
  });

  it("requires client credentials", async () => {
    delete process.env.SALLA_CLIENT_SECRET;
    const error = await refreshAccessToken("ory_rt_old").catch((e) => e);
    expect(error.code).toBe(ERROR_CODES.CONFIG_MISSING);
    expect(error.message).toContain("SALLA_CLIENT_SECRET");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
