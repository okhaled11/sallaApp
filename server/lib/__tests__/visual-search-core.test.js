import { describe, it, expect } from "vitest";
import { buildPrompt, isSearchable, pickMatches, visualSearchRequest } from "../visual-search-core.js";

const products = [
  { id: 1, name: "عباية سوداء", price: 200, salePrice: 150, currency: "SAR", image: "https://x/1.jpg", url: "https://s/1", categories: [{ name: "عبايات" }] },
  { id: 2, name: "حقيبة جلد", price: 99, salePrice: null, currency: "SAR", image: null, url: null, categories: [] },
];

describe("isSearchable", () => {
  it("hides hidden and out-of-stock products", () => {
    expect(isSearchable({ status: "hidden", quantity: 5 })).toBe(false);
    expect(isSearchable({ status: "sale", quantity: 0 })).toBe(false);
    expect(isSearchable({ status: "sale", quantity: 3 })).toBe(true);
    expect(isSearchable({ status: "sale", quantity: null })).toBe(true);
  });
});

describe("pickMatches", () => {
  it("keeps only real ids, removes duplicates and uses the sale price", () => {
    const out = pickMatches(
      { matches: [{ id: "1", reason: "نفس اللون" }, { id: 1 }, { id: "999" }, { id: 2 }] },
      products,
    );
    expect(out.map((m) => m.id)).toEqual([1, 2]);
    expect(out[0]).toMatchObject({ price: 150, oldPrice: 200, reason: "نفس اللون" });
    expect(out[1].oldPrice).toBeNull();
  });

  it("returns an empty list for bad AI output", () => {
    expect(pickMatches(null, products)).toEqual([]);
    expect(pickMatches({ matches: "x" }, products)).toEqual([]);
  });
});

describe("buildPrompt", () => {
  it("lists every product with its category", () => {
    const prompt = buildPrompt(products);
    expect(prompt).toContain("1 | عباية سوداء | عبايات");
    expect(prompt).toContain("2 | حقيبة جلد");
  });
});

describe("visualSearchRequest", () => {
  it("rejects non-POST and invalid images", async () => {
    expect((await visualSearchRequest({ method: "GET" })).statusCode).toBe(405);
    const bad = await visualSearchRequest({ method: "POST", body: JSON.stringify({ image: "nope" }) });
    expect(bad.statusCode).toBe(400);
  });
});
