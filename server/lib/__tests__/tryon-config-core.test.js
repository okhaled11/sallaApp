import { describe, it, expect, vi, beforeEach } from "vitest";

const verifyEmbeddedToken = vi.fn();
vi.mock("../verify-token-core.js", () => ({ verifyEmbeddedToken: (...a) => verifyEmbeddedToken(...a) }));

const { tryonConfigRequest, sanitizeItem, TYPES } = await import("../tryon-config-core.js");
const { TRYON_TYPE_IDS } = await import("../../../src/utils/tryOnTypes.js");

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const item = (extra = {}) => ({ productId: "123", name: "نظارة", image: PNG, fit: 1, offsetY: 0.1, ...extra });
const save = (storeId, items, extra = {}) =>
  tryonConfigRequest({
    method: "POST",
    body: JSON.stringify({ token: "t", appId: "a", storeId, items, ...extra }),
  });
const read = async (storeId) => {
  const res = await tryonConfigRequest({ method: "GET", query: { store: storeId } });
  return { res, json: JSON.parse(res.body) };
};

describe("tryon-config-core", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    verifyEmbeddedToken.mockReset();
    verifyEmbeddedToken.mockResolvedValue({ result: { success: true, data: { merchant_id: 1 } } });
  });

  describe("sanitizeItem", () => {
    it("keeps a valid item and clamps placement values", () => {
      expect(sanitizeItem(item({ fit: 99, offsetY: -9 }))).toMatchObject({
        productId: "123",
        fit: 1.6,
        offsetY: -0.5,
        enabled: true,
      });
    });

    it("falls back to defaults for non-numeric placement", () => {
      expect(sanitizeItem(item({ fit: "x", offsetY: undefined }))).toMatchObject({ fit: 1, offsetY: 0 });
    });

    it("rejects remote or script image sources and bad ids", () => {
      expect(sanitizeItem(item({ image: "https://evil.example/a.png" }))).toBeNull();
      expect(sanitizeItem(item({ image: "data:image/svg+xml;base64,AAAA" }))).toBeNull();
      expect(sanitizeItem(item({ image: "javascript:alert(1)" }))).toBeNull();
      expect(sanitizeItem(item({ productId: "../x" }))).toBeNull();
      expect(sanitizeItem(null)).toBeNull();
    });

    it("defaults to glasses and ignores unknown types", () => {
      expect(sanitizeItem(item()).type).toBe("glasses");
      expect(sanitizeItem(item({ type: "spaceship" })).type).toBe("glasses");
    });

    it("knows the same product types as the dashboard", () => {
      expect(TYPES).toEqual(TRYON_TYPE_IDS);
    });

    it("keeps earrings options and defaults mirroring on", () => {
      expect(sanitizeItem(item({ type: "earrings", offsetX: 9 }))).toMatchObject({
        type: "earrings",
        offsetX: 0.5,
        mirror: true,
      });
      expect(sanitizeItem(item({ type: "earrings", mirror: false })).mirror).toBe(false);
    });

    it("accepts lipstick without an image and cleans its options", () => {
      expect(sanitizeItem({ productId: "9", type: "lipstick", color: "#AA1155", opacity: 5, finish: "gloss" })).toMatchObject({
        type: "lipstick",
        image: "",
        color: "#aa1155",
        opacity: 1,
        finish: "gloss",
      });
      expect(sanitizeItem({ productId: "9", type: "lipstick", color: "red; }", opacity: "x", finish: "x" })).toMatchObject({
        color: "#c2185b",
        opacity: 0.7,
        finish: "matte",
      });
    });

    it("never stores an image for lipstick", () => {
      expect(sanitizeItem(item({ type: "lipstick" })).image).toBe("");
    });

    it("still requires an image for every other type", () => {
      for (const type of ["glasses", "earrings", "hat", "necklace"]) {
        expect(sanitizeItem({ productId: "9", type })).toBeNull();
      }
    });

    it("rejects oversized images", () => {
      expect(sanitizeItem(item({ image: `data:image/png;base64,${"A".repeat(151 * 1024)}` }))).toBeNull();
    });
  });

  it("answers CORS preflight", async () => {
    expect((await tryonConfigRequest({ method: "OPTIONS" })).statusCode).toBe(204);
  });

  it("rejects an invalid store id on read", async () => {
    const { res } = await read("bad id!");
    expect(res.statusCode).toBe(400);
  });

  it("returns null data for an unknown store", async () => {
    const { json } = await read("unknown-store");
    expect(json).toEqual({ success: true, data: null });
  });

  it("saves, then serves only enabled items publicly", async () => {
    const res = await save("store-a", [item(), item({ productId: "456", enabled: false })]);
    expect(res.statusCode).toBe(200);
    const { json } = await read("store-a");
    expect(json.data.items.map((i) => i.productId)).toEqual(["123"]);
  });

  it("requires token and appId", async () => {
    const res = await tryonConfigRequest({ method: "POST", body: JSON.stringify({ storeId: "s", items: [] }) });
    expect(res.statusCode).toBe(400);
  });

  it("rejects when any item is invalid, before verifying the token", async () => {
    const res = await save("store-b", [item(), item({ image: "https://x/y.png" })]);
    expect(res.statusCode).toBe(400);
    expect(verifyEmbeddedToken).not.toHaveBeenCalled();
  });

  it("rejects too many items", async () => {
    const res = await save("store-b", Array.from({ length: 21 }, (_, i) => item({ productId: String(i) })));
    expect(res.statusCode).toBe(400);
  });

  it("rejects an invalid session", async () => {
    verifyEmbeddedToken.mockResolvedValue({ result: { success: false } });
    expect((await save("store-c", [item()])).statusCode).toBe(401);
  });

  it("does not let another merchant overwrite a store", async () => {
    await save("store-d", [item()]);
    verifyEmbeddedToken.mockResolvedValue({ result: { success: true, data: { merchant_id: 2 } } });
    expect((await save("store-d", [item({ productId: "999" })])).statusCode).toBe(403);
    const { json } = await read("store-d");
    expect(json.data.items[0].productId).toBe("123");
  });
});
