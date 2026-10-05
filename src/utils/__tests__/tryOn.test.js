import { describe, it, expect } from "vitest";
import { measureVisibleArea } from "../tryOnImage.js";
import { buildTryOnInstallSnippet } from "../tryOnApi.js";

// RGBA buffer of width*height pixels, alpha chosen per pixel by `alphaAt(x, y)`.
function rgba(width, height, alphaAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[(y * width + x) * 4 + 3] = alphaAt(x, y);
  }
  return data;
}

describe("measureVisibleArea", () => {
  it("finds the box around visible pixels and reports transparency", () => {
    const data = rgba(10, 8, (x, y) => (x >= 2 && x <= 6 && y >= 3 && y <= 4 ? 255 : 0));
    expect(measureVisibleArea(data, 10, 8)).toEqual({ x: 2, y: 3, width: 5, height: 2, hasTransparency: true });
  });

  it("ignores near-invisible pixels (anti-alias fringe)", () => {
    const data = rgba(6, 6, (x, y) => (x === 0 && y === 0 ? 5 : x === 3 && y === 3 ? 255 : 0));
    expect(measureVisibleArea(data, 6, 6)).toMatchObject({ x: 3, y: 3, width: 1, height: 1 });
  });

  it("flags a fully opaque image as having no transparency", () => {
    const data = rgba(4, 4, () => 255);
    expect(measureVisibleArea(data, 4, 4)).toMatchObject({ width: 4, height: 4, hasTransparency: false });
  });

  it("returns null for a fully transparent image", () => {
    expect(measureVisibleArea(rgba(4, 4, () => 0), 4, 4)).toBeNull();
  });
});

describe("buildTryOnInstallSnippet", () => {
  it("builds the html tag with the store id", () => {
    expect(buildTryOnInstallSnippet({ origin: "https://app.example", storeId: "42", asHtmlTag: true })).toBe(
      '<script src="https://app.example/storefront/tryon.js" data-store="42" async></script>',
    );
  });

  it("builds the pure-JS loader by default", () => {
    const js = buildTryOnInstallSnippet({ origin: "https://app.example", storeId: "42" });
    expect(js).toContain("https://app.example/storefront/tryon.js");
    expect(js).toContain('setAttribute("data-store","42")');
  });
});
