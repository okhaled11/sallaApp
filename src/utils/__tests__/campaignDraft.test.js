import { describe, it, expect } from "vitest";
import {
  createDraft,
  draftFromSnapshot,
  rankCandidates,
  suggestProductIds,
  toPreviewCampaign,
} from "../campaignDraft.js";

const NOW = new Date("2030-01-01T00:00:00Z").getTime();
const product = (id, overrides = {}) => ({
  id,
  name: `P${id}`,
  price: 100,
  salePrice: null,
  currency: "SAR",
  quantity: 10,
  soldQuantity: 5,
  ...overrides,
});

describe("campaignDraft", () => {
  it("creates a draft ending in 3 days", () => {
    const draft = createDraft(NOW);
    expect(draft.productIds).toEqual([]);
    expect(draft.discountPercent).toBe(20);
    expect(new Date(draft.endsAt).getTime()).toBe(NOW + 3 * 24 * 3600_000);
  });

  it("restores a draft from a published snapshot", () => {
    const snapshot = {
      discountPercent: 35,
      endsAt: new Date(NOW + 3600_000).toISOString(),
      design: { title: "Hi" },
      trigger: { frequency: "day" },
      products: [{ id: 4 }, { id: 9 }],
    };
    const draft = draftFromSnapshot(snapshot, NOW);
    expect(draft.productIds).toEqual([4, 9]);
    expect(draft.discountPercent).toBe(35);
    expect(draft.design.title).toBe("Hi");
    expect(draft.design.buttonText).toBeTruthy();
    expect(draft.trigger).toEqual({ delaySeconds: 3, frequency: "day" });
  });

  it("replaces an expired end date when restoring", () => {
    const draft = draftFromSnapshot(
      { endsAt: new Date(NOW - 1).toISOString(), products: [] },
      NOW,
    );
    expect(new Date(draft.endsAt).getTime()).toBeGreaterThan(NOW);
  });

  it("ranks never-sold products with stock first, by stock value", () => {
    const ranked = rankCandidates([
      product(1, { soldQuantity: 3 }),
      product(2, { soldQuantity: 0, quantity: 2 }),
      product(3, { soldQuantity: 0, quantity: 20 }),
      product(4, { soldQuantity: 0, quantity: 0 }), // out of stock: not idle
      product(5, { soldQuantity: 1 }),
    ]);
    expect(ranked.map((p) => p.id)).toEqual([3, 2, 4, 5, 1]);
  });

  it("suggests the idle products with the most stock value", () => {
    expect(
      suggestProductIds(
        [
          product(1, { soldQuantity: 0, quantity: 1 }),
          product(2, { soldQuantity: 0, quantity: 50 }),
          product(3, { soldQuantity: 9 }),
          product(4, { soldQuantity: 0, quantity: null }), // unlimited counts as idle
        ],
        2,
      ),
    ).toEqual([2, 1]);
  });

  it("builds the preview in the same shape the storefront receives", () => {
    const preview = toPreviewCampaign(
      { ...createDraft(NOW), productIds: [2], discountPercent: 50 },
      [product(1), product(2, { price: 80 })],
    );
    expect(preview.products).toEqual([
      expect.objectContaining({ id: 2, price: 80, finalPrice: 40 }),
    ]);
    expect(preview.design.title).toBeTruthy();
  });
});
