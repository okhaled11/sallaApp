import { describe, it, expect } from "vitest";
import {
  analyzeCatalog,
  generateProductCopy,
  calculatePsychologicalPrice,
  OPPORTUNITY_TYPES,
} from "../copilotEngine.js";

describe("copilotEngine", () => {
  describe("calculatePsychologicalPrice", () => {
    it("returns 0 for non-positive values", () => {
      expect(calculatePsychologicalPrice(0)).toBe(0);
      expect(calculatePsychologicalPrice(-5)).toBe(0);
      expect(calculatePsychologicalPrice("invalid")).toBe(0);
    });

    it("rounds smaller numbers below 20", () => {
      expect(calculatePsychologicalPrice(12.4)).toBe(12);
      expect(calculatePsychologicalPrice(18.8)).toBe(19);
    });

    it("formats higher prices with .99 charm pricing", () => {
      expect(calculatePsychologicalPrice(45.5)).toBe(45.99);
      expect(calculatePsychologicalPrice(120)).toBe(120.99);
    });
  });

  describe("generateProductCopy", () => {
    it("generates structured copy with fallback for empty product", () => {
      const copy = generateProductCopy(null);
      expect(copy).toHaveProperty("hookTitle");
      expect(copy).toHaveProperty("marketingDescription");
      expect(copy).toHaveProperty("benefits");
      expect(copy.benefits.length).toBeGreaterThan(0);
      expect(copy).toHaveProperty("seoKeywords");
      expect(copy.seoKeywords.length).toBeGreaterThan(0);
      expect(copy).toHaveProperty("metaDescription");
    });

    it("customizes hook and descriptions for bestsellers", () => {
      const product = {
        name: "عطر اللافندر الفاخر",
        category: { name: "العطور" },
        price: 150,
        soldQuantity: 35,
      };
      const copy = generateProductCopy(product);
      expect(copy.hookTitle).toContain("الأكثر طلباً");
      expect(copy.hookTitle).toContain("عطر اللافندر الفاخر");
      expect(copy.marketingDescription).toContain("العطور");
      expect(copy.seoKeywords).toContain("عطر");
    });
  });

  describe("analyzeCatalog", () => {
    it("handles empty or invalid products cleanly", () => {
      const res = analyzeCatalog([]);
      expect(res.opportunities).toEqual([]);
      expect(res.summary.totalOpportunities).toBe(0);
      expect(res.summary.healthScore).toBe(100);

      const nullRes = analyzeCatalog(null);
      expect(nullRes.opportunities).toEqual([]);
    });

    it("identifies price optimization opportunity for high-selling products", () => {
      const products = [
        {
          id: 101,
          name: "قهوة مختصة كولومبية",
          price: 50,
          soldQuantity: 15,
          quantity: 20,
        },
      ];

      const { opportunities, summary } = analyzeCatalog(products);
      expect(summary.totalOpportunities).toBeGreaterThan(0);

      const opt = opportunities.find(
        (o) => o.type === OPPORTUNITY_TYPES.PRICE_OPTIMIZATION,
      );
      expect(opt).toBeDefined();
      expect(opt.suggestedPrice).toBeGreaterThan(50);
      expect(opt.projectedGain).toBeGreaterThan(0);
      expect(opt.actionType).toBe("update_price");
    });

    it("identifies margin defense for products with low or negative profit margin", () => {
      const products = [
        {
          id: 102,
          name: "شاحن سريع",
          price: 30,
          costPrice: 28, // margin is ~6.6% (< 12%)
          soldQuantity: 4,
          quantity: 10,
        },
      ];

      const { opportunities } = analyzeCatalog(products);
      const opt = opportunities.find(
        (o) => o.type === OPPORTUNITY_TYPES.MARGIN_DEFENSE,
      );
      expect(opt).toBeDefined();
      expect(opt.suggestedPrice).toBeGreaterThan(30);
      expect(opt.priority).toBe("high");
    });

    it("flags urgent warning for products selling at a loss", () => {
      const products = [
        {
          id: 103,
          name: "كابل USB",
          price: 15,
          costPrice: 20, // Negative margin
          soldQuantity: 2,
          quantity: 5,
        },
      ];

      const { opportunities } = analyzeCatalog(products);
      const opt = opportunities.find(
        (o) => o.type === OPPORTUNITY_TYPES.MARGIN_DEFENSE,
      );
      expect(opt).toBeDefined();
      expect(opt.priority).toBe("urgent");
      expect(opt.badge).toContain("خسارة");
    });

    it("identifies deadstock revival opportunity", () => {
      const products = [
        {
          id: 104,
          name: "حقيبة سفر قديمة",
          price: 200,
          quantity: 15,
          soldQuantity: 0,
        },
      ];

      const { opportunities } = analyzeCatalog(products);
      const opt = opportunities.find(
        (o) => o.type === OPPORTUNITY_TYPES.DEADSTOCK_REVIVAL,
      );
      expect(opt).toBeDefined();
      expect(opt.suggestedPrice).toBeLessThan(200);
      expect(opt.trappedCapital).toBe(3000);
    });

    it("identifies stock urgency for best sellers running low", () => {
      const products = [
        {
          id: 105,
          name: "سماعات بلوتوث برو",
          price: 250,
          quantity: 3,
          soldQuantity: 20,
        },
      ];

      const { opportunities } = analyzeCatalog(products);
      const opt = opportunities.find(
        (o) => o.type === OPPORTUNITY_TYPES.STOCK_URGENCY,
      );
      expect(opt).toBeDefined();
      expect(opt.priority).toBe("urgent");
    });

    it("calculates healthScore properly reflecting catalog health", () => {
      const healthyProducts = [
        {
          id: 1,
          name: "منتج صحي 1",
          price: 100,
          costPrice: 50,
          quantity: 10,
          soldQuantity: 5,
        },
        {
          id: 2,
          name: "منتج صحي 2",
          price: 80,
          costPrice: 40,
          quantity: 15,
          soldQuantity: 10,
        },
      ];

      const res = analyzeCatalog(healthyProducts);
      expect(res.summary.healthScore).toBeGreaterThanOrEqual(80);
    });
  });
});
