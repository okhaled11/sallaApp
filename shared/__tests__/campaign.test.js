import { describe, it, expect } from "vitest";
import {
  validateCampaign,
  toCampaignProducts,
  DEFAULT_DESIGN,
  MAX_PRODUCTS,
} from "../campaign.js";

const NOW = new Date("2030-01-01T00:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;

const valid = (overrides = {}) => ({
  productIds: [1, 2],
  discountPercent: 20,
  endsAt: new Date(NOW + 48 * HOUR).toISOString(),
  design: { ...DEFAULT_DESIGN },
  trigger: { delaySeconds: 3, frequency: "session" },
  ...overrides,
});

describe("validateCampaign", () => {
  it("accepts a valid campaign and normalizes it", () => {
    const { campaign, error } = validateCampaign(
      valid({
        productIds: [1, 2, 2],
        design: { ...DEFAULT_DESIGN, title: "  عرض  ", accentColor: "#AABBCC" },
      }),
      NOW,
    );
    expect(error).toBeUndefined();
    expect(campaign.productIds).toEqual([1, 2]);
    expect(campaign.design.title).toBe("عرض");
    expect(campaign.design.accentColor).toBe("#aabbcc");
  });

  it("fills missing design and trigger with defaults", () => {
    const { campaign } = validateCampaign(
      { ...valid(), design: undefined, trigger: undefined },
      NOW,
    );
    expect(campaign.design).toEqual(DEFAULT_DESIGN);
    expect(campaign.trigger).toEqual({ delaySeconds: 3, frequency: "session" });
  });

  it("strips control characters and caps text length", () => {
    const { campaign } = validateCampaign(
      valid({
        design: {
          ...DEFAULT_DESIGN,
          title: "a\u0000b".padEnd(100, "x"),
          message: "line\nbreak",
        },
      }),
      NOW,
    );
    expect(campaign.design.title).toHaveLength(60);
    expect(campaign.design.title.startsWith("a b")).toBe(true);
    expect(campaign.design.message).toBe("line break");
  });

  it.each([
    [{ productIds: [] }, /at least one product/],
    [{ productIds: [1.5] }, /at least one product/],
    [
      { productIds: Array.from({ length: MAX_PRODUCTS + 1 }, (_, i) => i + 1) },
      /up to 6/,
    ],
    [{ discountPercent: 0 }, /1 to 90/],
    [{ discountPercent: 91 }, /1 to 90/],
    [{ discountPercent: 12.5 }, /1 to 90/],
    [{ endsAt: new Date(NOW - 1000).toISOString() }, /future/],
    [{ endsAt: "not a date" }, /future/],
    [{ endsAt: new Date(NOW + 91 * 24 * HOUR).toISOString() }, /90 days/],
    [{ design: { ...DEFAULT_DESIGN, title: "   " } }, /Title/],
    [{ design: { ...DEFAULT_DESIGN, buttonText: "" } }, /Button text/],
    [{ design: { ...DEFAULT_DESIGN, accentColor: "red" } }, /hex color/],
    [{ design: { ...DEFAULT_DESIGN, accentColor: "#fff" } }, /hex color/],
    [{ design: { ...DEFAULT_DESIGN, theme: "neon" } }, /theme/],
    [{ design: { ...DEFAULT_DESIGN, position: "top" } }, /position/],
    [{ trigger: { delaySeconds: 61, frequency: "session" } }, /Delay/],
    [{ trigger: { delaySeconds: 1, frequency: "hourly" } }, /frequency/],
  ])("rejects %j", (patch, message) => {
    expect(validateCampaign(valid(patch), NOW).error).toMatch(message);
  });

  it("rejects a missing campaign", () => {
    expect(validateCampaign(null).error).toMatch(/required/);
  });
});

describe("toCampaignProducts", () => {
  const products = [
    {
      id: 1,
      name: "A",
      image: "a.png",
      url: "https://s/a",
      currency: "SAR",
      price: 100,
      salePrice: null,
    },
    {
      id: 2,
      name: "B",
      image: null,
      url: null,
      currency: "SAR",
      price: 200,
      salePrice: 150,
    },
    { id: 3, name: "C", currency: "SAR", price: null, salePrice: null },
  ];

  it("keeps the chosen order and applies the discount to the current price", () => {
    expect(toCampaignProducts([2, 1, 3, 99], products, 10)).toEqual([
      {
        id: 2,
        name: "B",
        image: null,
        url: null,
        currency: "SAR",
        price: 150,
        finalPrice: 135,
      },
      {
        id: 1,
        name: "A",
        image: "a.png",
        url: "https://s/a",
        currency: "SAR",
        price: 100,
        finalPrice: 90,
      },
      {
        id: 3,
        name: "C",
        image: undefined,
        url: undefined,
        currency: "SAR",
        price: null,
        finalPrice: null,
      },
    ]);
  });

  it("rounds to 2 decimals", () => {
    const [p] = toCampaignProducts([1], [{ ...products[0], price: 33.33 }], 15);
    expect(p.finalPrice).toBe(28.33);
  });
});
