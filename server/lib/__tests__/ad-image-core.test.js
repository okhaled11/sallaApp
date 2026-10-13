import { describe, it, expect } from "vitest";
import { buildPrompt, FORMATS, STYLES, adImageRequest } from "../ad-image-core.js";

describe("buildPrompt", () => {
  it("uses the chosen style and keeps the product unchanged", () => {
    const prompt = buildPrompt({ style: "luxury", productName: "ساعة" });
    expect(prompt).toContain(STYLES.luxury);
    expect(prompt).toContain("EXACTLY as photographed");
    expect(prompt).toContain("ساعة");
  });

  it("falls back to the white studio style and trims the merchant note", () => {
    const prompt = buildPrompt({ style: "nope", note: "  على طاولة خشبية  " });
    expect(prompt).toContain(STYLES.studio);
    expect(prompt).toContain("على طاولة خشبية");
  });
});

describe("formats", () => {
  it("maps to Gemini aspect ratios", () => {
    expect(FORMATS).toMatchObject({ square: "1:1", portrait: "4:5", story: "9:16", wide: "16:9" });
  });
});

describe("adImageRequest", () => {
  it("rejects non-POST requests and missing credentials", async () => {
    expect((await adImageRequest({ method: "GET" })).statusCode).toBe(405);
    const res = await adImageRequest({ method: "POST", body: JSON.stringify({ productId: 1 }) });
    expect(res.statusCode).toBe(400);
  });
});
