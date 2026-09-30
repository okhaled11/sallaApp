import { describe, it, expect } from "vitest";
import {
  generateSlug,
  generateKeywords,
  generateCopywritingSuggestions,
  analyzeProductContent,
  calculateCatalogContentStats,
} from "../contentEngine.js";

describe("contentEngine", () => {
  describe("generateSlug", () => {
    it("generates clean slug with text and id", () => {
      const slug = generateSlug("عطر مسك الفاخر", 101);
      expect(slug).toBe("عطر-مسك-الفاخر-101");
    });

    it("handles fallback when text is empty", () => {
      expect(generateSlug("", 42)).toBe("product-42");
      expect(generateSlug(null)).toBe("product-item");
    });
  });

  describe("generateKeywords", () => {
    it("extracts keywords from name and categories", () => {
      const product = {
        name: "ساعة يد كلاسيكية أنيقة",
        categories: [{ name: "إكسسوارات رجالية" }],
      };
      const keywords = generateKeywords(product);
      expect(keywords).toContain("ساعة");
      expect(keywords).toContain("إكسسوارات رجالية");
      expect(keywords).toContain("شراء اونلاين");
    });
  });

  describe("generateCopywritingSuggestions", () => {
    it("generates catchy title, meta description, bullet points and social text", () => {
      const suggestions = generateCopywritingSuggestions({
        name: "قهوة مختصة إثيوبية",
        categories: [{ name: "المشروبات" }],
      });
      expect(suggestions.catchyTitle).toContain("قهوة مختصة إثيوبية");
      expect(suggestions.metaDescription).toContain("المشروبات");
      expect(suggestions.bulletPoints.length).toBeGreaterThan(0);
      expect(suggestions.socialShareText).toContain("#المشروبات");
    });
  });

  describe("analyzeProductContent", () => {
    it("returns critical score when product is invalid", () => {
      const result = analyzeProductContent(null);
      expect(result.score).toBe(0);
      expect(result.status).toBe("critical");
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it("scores 100 when product has optimal image, title, sku, and category", () => {
      const product = {
        id: 1,
        name: "حقيبة جلدية فاخرة ومقاومة للماء",
        image: "https://example.com/bag.jpg",
        sku: "BAG-001",
        categories: [{ id: 10, name: "حقائب" }],
      };

      const result = analyzeProductContent(product);
      expect(result.score).toBe(100);
      expect(result.status).toBe("excellent");
      expect(result.issues).toHaveLength(0);
      expect(result.checklist.hasImage).toBe(true);
      expect(result.checklist.optimalTitle).toBe(true);
      expect(result.checklist.hasSku).toBe(true);
      expect(result.checklist.isCategorized).toBe(true);
    });

    it("penalizes missing image, short title, missing sku, and missing category", () => {
      const product = {
        id: 2,
        name: "شاي",
        image: null,
        sku: "",
        categories: [],
      };

      const result = analyzeProductContent(product);
      // image: 0, title "شاي" (3 chars): +5, sku: 0, cat: 0 => total: 5
      expect(result.score).toBe(5);
      expect(result.status).toBe("critical");
      expect(result.issues.some((i) => i.type === "missing_image")).toBe(true);
      expect(result.issues.some((i) => i.type === "title_too_short")).toBe(
        true,
      );
      expect(result.issues.some((i) => i.type === "missing_sku")).toBe(true);
      expect(result.issues.some((i) => i.type === "uncategorized")).toBe(true);
    });

    it("awards partial points for medium-length title", () => {
      const product = {
        id: 3,
        name: "كوب سيراميك", // 11 chars -> 18 points
        image: "https://example.com/cup.jpg", // 30
        sku: "CUP-1", // 20
        categories: [{ id: 1, name: "أكواب" }], // 20
      };

      const result = analyzeProductContent(product);
      expect(result.score).toBe(88);
      expect(result.status).toBe("excellent");
      expect(result.issues.some((i) => i.type === "short_title")).toBe(true);
    });
  });

  describe("calculateCatalogContentStats", () => {
    it("handles empty products array gracefully", () => {
      const stats = calculateCatalogContentStats([]);
      expect(stats.totalProducts).toBe(0);
      expect(stats.averageScore).toBe(0);
      expect(stats.analyzedProducts).toEqual([]);
    });

    it("aggregates content statistics across multiple products", () => {
      const products = [
        {
          id: 1,
          name: "منتج متكامل ومثالي للمتجر الإلكتروني",
          image: "img1.png",
          sku: "SKU1",
          categories: [{ id: 1, name: "تصنيف 1" }],
        },
        {
          id: 2,
          name: "قلم",
          image: null,
          sku: null,
          categories: [],
        },
      ];

      const stats = calculateCatalogContentStats(products);
      expect(stats.totalProducts).toBe(2);
      expect(stats.missingImagesCount).toBe(1);
      expect(stats.missingSkuCount).toBe(1);
      expect(stats.uncategorizedCount).toBe(1);
      expect(stats.needsAttentionCount).toBe(1);
      expect(stats.readyCount).toBe(1);
      expect(stats.averageScore).toBeGreaterThan(0);
    });
  });
});
