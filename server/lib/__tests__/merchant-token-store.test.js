import { describe, it, expect, vi, beforeEach } from "vitest";

const pgMock = vi.hoisted(() => {
  const client = { query: vi.fn(), release: vi.fn() };
  const pool = {
    query: vi.fn(),
    connect: vi.fn(async () => client),
    on: vi.fn(),
  };
  return { client, pool };
});

vi.mock("pg", () => ({
  default: { Pool: vi.fn(() => pgMock.pool) },
}));

import {
  upsertMerchantToken,
  getMerchantToken,
  deleteMerchantToken,
  withLockedMerchantToken,
} from "../merchant-token-store.js";
import { resetPool } from "../db.js";
import { ERROR_CODES } from "../errors.js";

const sqlOf = (mockFn) => mockFn.mock.calls.map(([sql]) => sql.trim());

describe("merchant-token-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPool();
    process.env.DATABASE_URL = "postgres://user:pw@localhost:5432/db";
    pgMock.pool.query.mockResolvedValue({ rows: [] });
    pgMock.client.query.mockResolvedValue({ rows: [] });
  });

  it("inserts a merchant token with an upsert on merchant_id", async () => {
    const expiresAt = new Date("2030-01-01T00:00:00Z");
    await upsertMerchantToken({
      merchantId: "42",
      accessToken: "at",
      refreshToken: "rt",
      expiresAt,
      scope: "products.read",
    });

    const [sql, params] = pgMock.pool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO salla_merchant_tokens/);
    expect(sql).toMatch(/ON CONFLICT \(merchant_id\) DO UPDATE/);
    expect(sql).toMatch(/refresh_token = EXCLUDED.refresh_token/);
    expect(sql).toMatch(/updated_at\s+= now\(\)/);
    expect(params).toEqual(["42", "at", "rt", expiresAt, "products.read"]);
  });

  it("maps a stored row to camelCase", async () => {
    pgMock.pool.query.mockResolvedValue({
      rows: [
        {
          merchant_id: "42",
          access_token: "at",
          refresh_token: "rt",
          expires_at: "2030-01-01T00:00:00.000Z",
          scope: "s",
          updated_at: "2029-12-01T00:00:00.000Z",
        },
      ],
    });

    await expect(getMerchantToken("42")).resolves.toEqual({
      merchantId: "42",
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      scope: "s",
      updatedAt: new Date("2029-12-01T00:00:00.000Z"),
    });
  });

  it("returns null for an unknown merchant", async () => {
    await expect(getMerchantToken("7")).resolves.toBe(null);
  });

  it("deletes a merchant token", async () => {
    await deleteMerchantToken("42");
    expect(pgMock.pool.query.mock.calls[0][0]).toMatch(
      /DELETE FROM salla_merchant_tokens/,
    );
  });

  it("locks the row with FOR UPDATE and saves inside the transaction", async () => {
    pgMock.client.query.mockImplementation(async (sql) =>
      /FOR UPDATE/.test(sql)
        ? {
            rows: [
              {
                merchant_id: "42",
                access_token: "old",
                refresh_token: "old-rt",
                expires_at: "2000-01-01T00:00:00Z",
                scope: null,
              },
            ],
          }
        : { rows: [] },
    );

    const result = await withLockedMerchantToken("42", async (row, save) => {
      expect(row.refreshToken).toBe("old-rt");
      await save({
        accessToken: "new",
        refreshToken: "new-rt",
        expiresAt: new Date("2030-01-01T00:00:00Z"),
        scope: null,
      });
      return "new";
    });

    expect(result).toBe("new");
    const statements = sqlOf(pgMock.client.query);
    expect(statements[0]).toBe("BEGIN");
    expect(statements[1]).toMatch(/lock_timeout/);
    expect(statements[2]).toMatch(/FOR UPDATE/);
    expect(statements[3]).toMatch(/UPDATE salla_merchant_tokens/);
    expect(pgMock.client.query.mock.calls[3][1]).toEqual([
      "42",
      "new",
      "new-rt",
      new Date("2030-01-01T00:00:00Z"),
      null,
    ]);
    expect(statements[4]).toBe("COMMIT");
    expect(pgMock.client.release).toHaveBeenCalled();
  });

  it("rolls back and releases when the callback fails", async () => {
    const failure = new Error("boom");
    await expect(
      withLockedMerchantToken("42", async () => {
        throw failure;
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.DATABASE_ERROR });

    expect(sqlOf(pgMock.client.query)).toContain("ROLLBACK");
    expect(sqlOf(pgMock.client.query)).not.toContain("COMMIT");
    expect(pgMock.client.release).toHaveBeenCalled();
  });

  it("wraps database errors without leaking the connection string", async () => {
    pgMock.pool.query.mockRejectedValue(
      new Error("connect failed for postgres://user:pw@localhost:5432/db"),
    );
    const error = await getMerchantToken("42").catch((e) => e);
    expect(error.code).toBe(ERROR_CODES.DATABASE_ERROR);
    expect(error.message).not.toContain("pw@");
  });
});
