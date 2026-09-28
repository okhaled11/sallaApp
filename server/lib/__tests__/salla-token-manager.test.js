import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory stand-in for the Postgres table. withLockedMerchantToken runs
// callbacks one at a time, like SELECT ... FOR UPDATE does for one row.
const fakeDb = vi.hoisted(() => {
  const rows = new Map();
  let lockChain = Promise.resolve();
  return {
    rows,
    reset() {
      rows.clear();
      lockChain = Promise.resolve();
    },
    get(id) {
      const row = rows.get(String(id));
      return row ? { ...row } : null;
    },
    lock(id, fn) {
      const run = lockChain.then(() =>
        fn(fakeDb.get(id), async (tokens) => {
          rows.set(String(id), { ...rows.get(String(id)), ...tokens });
        }),
      );
      lockChain = run.catch(() => {});
      return run;
    },
  };
});

vi.mock("../merchant-token-store.js", () => ({
  getMerchantToken: vi.fn(async (id) => fakeDb.get(id)),
  withLockedMerchantToken: vi.fn((id, fn) => fakeDb.lock(id, fn)),
}));

vi.mock("../salla-oauth.js", () => ({
  refreshAccessToken: vi.fn(),
}));

import {
  getValidAccessToken,
  isTokenFresh,
  EXPIRY_BUFFER_MS,
} from "../salla-token-manager.js";
import { refreshAccessToken } from "../salla-oauth.js";
import { withLockedMerchantToken } from "../merchant-token-store.js";
import { ERROR_CODES, SallaAuthError } from "../errors.js";

const HOUR = 60 * 60 * 1000;

function seed(overrides = {}) {
  fakeDb.rows.set("100", {
    merchantId: "100",
    accessToken: "ory_at_old",
    refreshToken: "ory_rt_old",
    expiresAt: new Date(Date.now() + 24 * HOUR),
    scope: "products.read_write offline_access",
    ...overrides,
  });
}

describe("salla-token-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    fakeDb.reset();
  });

  it("isTokenFresh respects the safety buffer", () => {
    const now = Date.now();
    expect(
      isTokenFresh({ accessToken: "a", expiresAt: new Date(now + HOUR) }, now),
    ).toBe(true);
    expect(
      isTokenFresh(
        {
          accessToken: "a",
          expiresAt: new Date(now + EXPIRY_BUFFER_MS - 1000),
        },
        now,
      ),
    ).toBe(false);
    expect(isTokenFresh(null, now)).toBe(false);
  });

  it("reuses a valid token without refreshing or locking", async () => {
    seed();
    await expect(getValidAccessToken(100)).resolves.toBe("ory_at_old");
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(withLockedMerchantToken).not.toHaveBeenCalled();
  });

  it("refreshes an expired token and persists the NEW refresh token", async () => {
    seed({ expiresAt: new Date(Date.now() - HOUR) });
    const newExpiry = new Date(Date.now() + 14 * 24 * HOUR);
    refreshAccessToken.mockResolvedValue({
      accessToken: "ory_at_new",
      refreshToken: "ory_rt_new",
      expiresAt: newExpiry,
      scope: "products.read_write offline_access",
    });

    await expect(getValidAccessToken("100")).resolves.toBe("ory_at_new");

    expect(refreshAccessToken).toHaveBeenCalledWith("ory_rt_old");
    const stored = fakeDb.get("100");
    expect(stored.accessToken).toBe("ory_at_new");
    expect(stored.refreshToken).toBe("ory_rt_new");
    expect(stored.expiresAt).toEqual(newExpiry);
  });

  it("refreshes a token that is about to expire (inside the buffer)", async () => {
    seed({ expiresAt: new Date(Date.now() + 60 * 1000) });
    refreshAccessToken.mockResolvedValue({
      accessToken: "ory_at_new",
      refreshToken: "ory_rt_new",
      expiresAt: new Date(Date.now() + HOUR),
      scope: null,
    });

    await expect(getValidAccessToken("100")).resolves.toBe("ory_at_new");
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it("uses the refresh token only once for concurrent requests", async () => {
    seed({ expiresAt: new Date(Date.now() - HOUR) });
    refreshAccessToken.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        accessToken: "ory_at_new",
        refreshToken: "ory_rt_new",
        expiresAt: new Date(Date.now() + 14 * 24 * HOUR),
        scope: null,
      };
    });

    const results = await Promise.all([
      getValidAccessToken("100"),
      getValidAccessToken("100"),
      getValidAccessToken("100"),
    ]);

    expect(results).toEqual(["ory_at_new", "ory_at_new", "ory_at_new"]);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(refreshAccessToken).toHaveBeenCalledWith("ory_rt_old");
  });

  it("force-refreshes a token Salla rejected, once", async () => {
    seed();
    refreshAccessToken.mockResolvedValue({
      accessToken: "ory_at_new",
      refreshToken: "ory_rt_new",
      expiresAt: new Date(Date.now() + HOUR),
      scope: null,
    });

    await expect(
      getValidAccessToken("100", { rejectedToken: "ory_at_old" }),
    ).resolves.toBe("ory_at_new");

    // A second request that saw the same rejected token reuses the new one
    await expect(
      getValidAccessToken("100", { rejectedToken: "ory_at_old" }),
    ).resolves.toBe("ory_at_new");
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it("reports a merchant with no stored tokens as not authorized", async () => {
    await expect(getValidAccessToken("999")).rejects.toMatchObject({
      code: ERROR_CODES.MERCHANT_NOT_AUTHORIZED,
      status: 403,
    });
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it("handles refresh failure and keeps the stored tokens", async () => {
    seed({ expiresAt: new Date(Date.now() - HOUR) });
    refreshAccessToken.mockRejectedValue(
      new SallaAuthError(
        ERROR_CODES.TOKEN_REFRESH_FAILED,
        "Token refresh failed (invalid_grant). The store must re-authorize the app (reinstall it from the Salla dashboard).",
        401,
      ),
    );

    const error = await getValidAccessToken("100").catch((e) => e);
    expect(error.code).toBe(ERROR_CODES.TOKEN_REFRESH_FAILED);
    expect(error.message).not.toContain("ory_rt_old");

    const stored = fakeDb.get("100");
    expect(stored.refreshToken).toBe("ory_rt_old");
    expect(stored.accessToken).toBe("ory_at_old");
  });

  it("never logs token values", async () => {
    seed({ expiresAt: new Date(Date.now() - HOUR) });
    refreshAccessToken.mockResolvedValue({
      accessToken: "ory_at_new",
      refreshToken: "ory_rt_new",
      expiresAt: new Date(Date.now() + HOUR),
      scope: null,
    });

    await getValidAccessToken("100");

    const logged = JSON.stringify(console.log.mock.calls);
    expect(logged).not.toMatch(/ory_(at|rt)_/);
  });
});
