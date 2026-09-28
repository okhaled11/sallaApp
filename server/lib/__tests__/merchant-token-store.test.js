import { describe, it, expect, vi, beforeEach } from "vitest";

// Minimal in-memory Redis with the commands the store uses
const fakeRedis = vi.hoisted(() => {
  const data = new Map();
  const expiries = new Map();
  const alive = (key) => {
    const expiry = expiries.get(key);
    if (expiry && expiry <= Date.now()) {
      data.delete(key);
      expiries.delete(key);
    }
    return data.has(key);
  };
  return {
    data,
    reset() {
      data.clear();
      expiries.clear();
    },
    get: vi.fn(async (key) => (alive(key) ? data.get(key) : null)),
    set: vi.fn(async (key, value, options = {}) => {
      if (options.nx && alive(key)) return null;
      data.set(key, value);
      if (options.px) expiries.set(key, Date.now() + options.px);
      else expiries.delete(key);
      return "OK";
    }),
    del: vi.fn(async (key) => (data.delete(key) ? 1 : 0)),
    // Only the compare-and-delete lock release script is used
    eval: vi.fn(async (_script, [key], [owner]) => {
      if (alive(key) && data.get(key) === owner) {
        data.delete(key);
        return 1;
      }
      return 0;
    }),
  };
});

vi.mock("../redis.js", () => ({ getRedis: () => fakeRedis }));

import {
  upsertMerchantToken,
  getMerchantToken,
  deleteMerchantToken,
  withLockedMerchantToken,
} from "../merchant-token-store.js";
import { ERROR_CODES } from "../errors.js";

const TOKENS_KEY = "salla:merchant:42:tokens";
const LOCK_KEY = "salla:merchant:42:lock";

describe("merchant-token-store (Redis)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeRedis.reset();
  });

  it("inserts a merchant's tokens", async () => {
    const expiresAt = new Date("2030-01-01T00:00:00Z");
    await upsertMerchantToken({
      merchantId: "42",
      accessToken: "at",
      refreshToken: "rt",
      expiresAt,
      scope: "products.read_write",
    });

    const row = await getMerchantToken("42");
    expect(row).toMatchObject({
      merchantId: "42",
      accessToken: "at",
      refreshToken: "rt",
      expiresAt,
      scope: "products.read_write",
    });
    expect(row.updatedAt).toBeInstanceOf(Date);
    // Lock released after the write
    expect(fakeRedis.data.has(LOCK_KEY)).toBe(false);
  });

  it("replaces an existing merchant's tokens (reinstall)", async () => {
    const base = { merchantId: "42", expiresAt: new Date(), scope: null };
    await upsertMerchantToken({
      ...base,
      accessToken: "a1",
      refreshToken: "r1",
    });
    await upsertMerchantToken({
      ...base,
      accessToken: "a2",
      refreshToken: "r2",
    });

    const row = await getMerchantToken("42");
    expect(row.accessToken).toBe("a2");
    expect(row.refreshToken).toBe("r2");
  });

  it("reads rows stored as already-deserialized objects", async () => {
    fakeRedis.data.set(TOKENS_KEY, {
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    await expect(getMerchantToken("42")).resolves.toMatchObject({
      accessToken: "at",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      scope: null,
      updatedAt: null,
    });
  });

  it("returns null for an unknown merchant", async () => {
    await expect(getMerchantToken("7")).resolves.toBe(null);
  });

  it("deletes a merchant's tokens", async () => {
    fakeRedis.data.set(TOKENS_KEY, "{}");
    await deleteMerchantToken("42");
    expect(fakeRedis.data.has(TOKENS_KEY)).toBe(false);
  });

  it("holds an expiring lock while the callback runs and saves", async () => {
    await upsertMerchantToken({
      merchantId: "42",
      accessToken: "old",
      refreshToken: "old-rt",
      expiresAt: new Date(0),
    });

    const result = await withLockedMerchantToken("42", async (row, save) => {
      expect(row.refreshToken).toBe("old-rt");
      expect(fakeRedis.data.has(LOCK_KEY)).toBe(true);
      await save({
        accessToken: "new",
        refreshToken: "new-rt",
        expiresAt: new Date("2030-01-01T00:00:00Z"),
      });
      return "done";
    });

    expect(result).toBe("done");
    const lockCall = fakeRedis.set.mock.calls.find(([key]) => key === LOCK_KEY);
    expect(lockCall[2]).toMatchObject({ nx: true, px: expect.any(Number) });
    expect(fakeRedis.data.has(LOCK_KEY)).toBe(false);
    expect((await getMerchantToken("42")).refreshToken).toBe("new-rt");
  });

  it("runs concurrent callbacks one at a time", async () => {
    const events = [];
    const task = (name) =>
      withLockedMerchantToken("42", async () => {
        events.push(`${name}:start`);
        await new Promise((resolve) => setTimeout(resolve, 20));
        events.push(`${name}:end`);
      });

    await Promise.all([task("a"), task("b")]);

    expect(events).toHaveLength(4);
    expect(events[0].split(":")[0]).toBe(events[1].split(":")[0]);
    expect(events[2].split(":")[0]).toBe(events[3].split(":")[0]);
  });

  it("releases the lock when the callback fails", async () => {
    await expect(
      withLockedMerchantToken("42", async () => {
        throw new Error("boom");
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.STORAGE_ERROR });
    expect(fakeRedis.data.has(LOCK_KEY)).toBe(false);
  });

  it("does not release a lock owned by someone else", async () => {
    await withLockedMerchantToken("42", async () => {
      // Simulate our lock expiring and another request taking it
      fakeRedis.data.set(LOCK_KEY, "someone-else");
    });
    expect(fakeRedis.data.get(LOCK_KEY)).toBe("someone-else");
  });

  it("wraps Redis errors without leaking details", async () => {
    fakeRedis.get.mockRejectedValueOnce(
      new Error("401 Unauthorized token=abc"),
    );
    const error = await getMerchantToken("42").catch((e) => e);
    expect(error.code).toBe(ERROR_CODES.STORAGE_ERROR);
    expect(error.message).not.toContain("abc");
  });
});
