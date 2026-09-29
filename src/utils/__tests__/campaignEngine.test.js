import { describe, it, expect } from "vitest";
import {
  generateSmartCampaignRecommendations,
  calculateCampaignImpact,
  generateMarketingCopy,
  generateSallaInstructions,
} from "../campaignEngine.js";

describe("campaignEngine", () => {
  const sampleProducts = [
    {
      id: "prod-1",
      name: "عطر ملوكي فاخر",
      price: 200,
      cost_price: 100,
      quantity: 50,
      sold_quantity: 45,
      category_id: 1,
      currency: "SAR",
    },
    {
      id: "prod-2",
      name: "بخور مروكي طبيعي",
      price: 150,
      cost_price: 80,
      quantity: 30,
      sold_quantity: 5,
      category_id: 1,
      currency: "SAR",
    },
    {
      id: "prod-3",
      name: "معطر جو مسك",
      price: 80,
      cost_price: 30,
      quantity: 25,
      sold_quantity: 0,
      category_id: 2,
      currency: "SAR",
    },
    {
      id: "prod-4",
      name: "مبخرة ذكية",
      price: 300,
      cost_price: 150,
      quantity: 12,
      sold_quantity: 18,
      category_id: 2,
      currency: "SAR",
    },
  ];

  describe("generateSmartCampaignRecommendations", () => {
    it("returns empty array for empty or invalid products", () => {
      expect(generateSmartCampaignRecommendations([])).toEqual([]);
      expect(generateSmartCampaignRecommendations(null)).toEqual([]);
    });

    it("generates clearance recommendation for dead stock product", () => {
      const recs = generateSmartCampaignRecommendations(sampleProducts);
      const clearance = recs.find((r) => r.type === "clearance");

      expect(clearance).toBeDefined();
      expect(clearance.products[0].id).toBe("prod-3");
      expect(clearance.discountPercent).toBeGreaterThan(0);
      expect(clearance.discountedPrice).toBeLessThan(clearance.originalPrice);
      expect(clearance.unlockedCapital).toBeGreaterThan(0);
      expect(clearance.canApplyDirectly).toBe(true);
    });

    it("generates bundle recommendation pairing hero with companion", () => {
      const recs = generateSmartCampaignRecommendations(sampleProducts);
      const bundle = recs.find((r) => r.type === "bundle");

      expect(bundle).toBeDefined();
      expect(bundle.heroProduct.id).toBe("prod-1"); // highest sold_quantity
      expect(bundle.products.length).toBe(2);
      expect(bundle.discountedPrice).toBeLessThan(bundle.originalPrice);
      expect(bundle.savingsAmount).toBeGreaterThan(0);
    });

    it("generates volume BOGO recommendation for top seller", () => {
      const recs = generateSmartCampaignRecommendations(sampleProducts);
      const volume = recs.find((r) => r.type === "volume");

      expect(volume).toBeDefined();
      expect(volume.targetProduct.id).toBe("prod-1");
      expect(volume.discountPercent).toBe(25);
      expect(volume.savingsAmount).toBe(100); // 200 * 2 = 400 original, promo 300
    });

    it("generates flash sale recommendation for high margin product", () => {
      const recs = generateSmartCampaignRecommendations(sampleProducts);
      const flash = recs.find((r) => r.type === "flash");

      expect(flash).toBeDefined();
      expect(flash.discountPercent).toBe(15);
      expect(flash.canApplyDirectly).toBe(true);
    });
  });

  describe("calculateCampaignImpact", () => {
    it("calculates percentage discount impact correctly", () => {
      const result = calculateCampaignImpact({
        products: [
          { price: 100, cost_price: 50 },
          { price: 200, cost_price: 100 },
        ],
        discountType: "percent",
        discountValue: 20,
      });

      expect(result.originalPrice).toBe(300);
      expect(result.discountedPrice).toBe(240);
      expect(result.savingsAmount).toBe(60);
      expect(result.discountPercent).toBe(20);
      expect(result.estimatedMargin).toBe(0.38);
    });

    it("calculates fixed amount discount impact correctly", () => {
      const result = calculateCampaignImpact({
        products: [{ price: 100, cost_price: 40 }],
        discountType: "fixed",
        discountValue: 25,
      });

      expect(result.originalPrice).toBe(100);
      expect(result.discountedPrice).toBe(75);
      expect(result.savingsAmount).toBe(25);
      expect(result.discountPercent).toBe(25);
    });
  });

  describe("generateMarketingCopy", () => {
    it("generates formatted WhatsApp, Social, and Banner copies", () => {
      const campaign = {
        title: "عرض العطور الفاخرة",
        originalPrice: 200,
        discountedPrice: 160,
        savingsAmount: 40,
        discountPercent: 20,
        suggestedCode: "PERFUME20",
        badgeText: "خصم حصري",
        products: [{ name: "عطر ملوكي" }],
      };

      const copy = generateMarketingCopy(campaign, "ر.س");
      expect(copy.whatsapp).toContain("عرض العطور الفاخرة");
      expect(copy.whatsapp).toContain("PERFUME20");
      expect(copy.whatsapp).toContain("160");
      expect(copy.social).toContain("عطر ملوكي");
      expect(copy.social).toContain("#سلة");
      expect(copy.banner).toContain("PERFUME20");
    });

    it("handles null gracefully", () => {
      expect(generateMarketingCopy(null)).toEqual({
        whatsapp: "",
        social: "",
        banner: "",
      });
    });
  });

  describe("generateSallaInstructions", () => {
    it("returns setup instructions for clearance and bundle campaigns", () => {
      const clearanceInstructions = generateSallaInstructions({
        type: "clearance",
        discountPercent: 25,
        suggestedCode: "CLEAR25",
        products: [{ name: "معطر جو" }],
      });
      expect(clearanceInstructions.length).toBeGreaterThan(0);
      expect(clearanceInstructions[1]).toContain("CLEAR25");

      const bundleInstructions = generateSallaInstructions({
        type: "bundle",
        discountPercent: 15,
        discountedPrice: 280,
        products: [{ name: "عطر" }, { name: "بخور" }],
      });
      expect(bundleInstructions.length).toBeGreaterThan(0);
      expect(bundleInstructions[2]).toContain("280");
    });

    it("returns empty array for null", () => {
      expect(generateSallaInstructions(null)).toEqual([]);
    });
  });
});
