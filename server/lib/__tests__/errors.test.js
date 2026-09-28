import { describe, it, expect, afterEach } from "vitest";
import { redact, toLoggable, requireEnv, ERROR_CODES } from "../errors.js";

describe("errors", () => {
  afterEach(() => {
    delete process.env.SALLA_CLIENT_SECRET;
    delete process.env.DATABASE_URL;
  });

  it("redacts Salla tokens, bearer headers and DB credentials", () => {
    const text = redact(
      'token ory_at_abc.def and ory_rt_xyz, Authorization: Bearer abc123, postgres://u:p@host/db, "refresh_token":"r1"',
    );
    expect(text).not.toMatch(/ory_at_abc|ory_rt_xyz|abc123|u:p@|r1"/);
    expect(text).toContain("[REDACTED]");
  });

  it("redacts configured secret values", () => {
    process.env.SALLA_CLIENT_SECRET = "my-client-secret";
    process.env.DATABASE_URL = "postgres://a:b@c/d";
    expect(redact("secret=my-client-secret url=postgres://a:b@c/d")).toBe(
      "secret=[REDACTED] url=[REDACTED]",
    );
  });

  it("produces a loggable summary without secrets", () => {
    const error = new Error("failed with ory_at_leaky");
    error.code = "X";
    expect(toLoggable(error)).toEqual({
      name: "Error",
      code: "X",
      status: undefined,
      message: "failed with [REDACTED]",
    });
  });

  it("names (not values of) missing env vars", () => {
    process.env.SALLA_CLIENT_SECRET = "value";
    try {
      requireEnv("SALLA_CLIENT_SECRET", "DATABASE_URL");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error.code).toBe(ERROR_CODES.CONFIG_MISSING);
      expect(error.message).toBe(
        "Server is missing configuration: DATABASE_URL",
      );
    }
  });
});
