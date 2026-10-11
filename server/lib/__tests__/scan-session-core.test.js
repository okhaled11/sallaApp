import { describe, it, expect } from "vitest";
import {
  buildSallaPayload,
  sanitizeDraft,
  scanSessionRequest,
  validateProduct,
} from "../scan-session-core.js";

const post = (body, headers = {}) =>
  scanSessionRequest({ method: "POST", body: JSON.stringify(body), headers });

describe("sanitizeDraft", () => {
  it("cleans colors and limits lists", () => {
    const draft = sanitizeDraft({
      name: "  حقيبة ",
      colors: [{ name: "أحمر", hex: "#FF0000" }, { name: "x", hex: "bad" }, { name: "", hex: "#000000" }],
      sizes: ["S", "", "M"],
    });
    expect(draft.name).toBe("حقيبة");
    expect(draft.colors).toEqual([
      { name: "أحمر", hex: "#ff0000" },
      { name: "x", hex: "#9ca3af" },
    ]);
    expect(draft.sizes).toEqual(["S", "M"]);
  });

  it("tolerates garbage", () => {
    expect(sanitizeDraft(null).colors).toEqual([]);
  });
});

describe("validateProduct", () => {
  it("requires name and positive price", () => {
    expect(validateProduct({ name: "", price: 10 }).error).toBeTruthy();
    expect(validateProduct({ name: "a", price: 0 }).error).toBeTruthy();
    expect(validateProduct({ name: "a", price: 10, quantity: 1.5 }).error).toBeTruthy();
  });

  it("accepts a valid product", () => {
    const { value } = validateProduct({ name: "a", price: "25.5", quantity: "3", categoryIds: [1, "x", 2] });
    expect(value).toMatchObject({ name: "a", price: 25.5, quantity: 3, status: "sale", categoryIds: [1, 2] });
  });
});

describe("buildSallaPayload", () => {
  it("marks the first image default and omits empty optionals", () => {
    const { value } = validateProduct({ name: "a", price: 10, quantity: 1 });
    const payload = buildSallaPayload(value, ["https://x/1", "https://x/2"]);
    expect(payload.images[0]).toMatchObject({ original: "https://x/1", default: true, sort: 0 });
    expect(payload.images[1].default).toBe(false);
    expect(payload).not.toHaveProperty("cost_price");
    expect(payload).not.toHaveProperty("categories");
  });
});

describe("scanSessionRequest", () => {
  it("rejects unknown actions and bad methods", async () => {
    expect((await post({ action: "nope" })).statusCode).toBe(400);
    expect((await scanSessionRequest({ method: "PUT" })).statusCode).toBe(405);
  });

  it("rejects malformed sessions", async () => {
    const res = await post({ action: "join", sid: "bad", phoneKey: "x" });
    expect(res.statusCode).toBe(403);
  });

  it("serves 404 for unknown images and 400 for malformed ids", async () => {
    expect((await scanSessionRequest({ method: "GET", query: { img: "zz" } })).statusCode).toBe(400);
    expect(
      (await scanSessionRequest({ method: "GET", query: { img: "a".repeat(32) } })).statusCode,
    ).toBe(404);
  });
});
