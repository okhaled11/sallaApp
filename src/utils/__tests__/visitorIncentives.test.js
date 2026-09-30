import { describe, it, expect } from "vitest";
import {
  DEFAULT_INCENTIVE_CONFIG,
  checkVisitorEligibility,
  generateMockFrequentVisitors,
  generateStorefrontTrackingScript,
} from "../visitorIncentives.js";

describe("visitorIncentives", () => {
  it("provides valid default configuration", () => {
    expect(DEFAULT_INCENTIVE_CONFIG.minVisits).toBe(3);
    expect(DEFAULT_INCENTIVE_CONFIG.timeWindowMinutes).toBe(60);
    expect(DEFAULT_INCENTIVE_CONFIG.couponCode).toBe("SPECIAL3X");
    expect(DEFAULT_INCENTIVE_CONFIG.enabled).toBe(true);
  });

  describe("checkVisitorEligibility", () => {
    const now = Date.now();

    it("returns false if config is disabled", () => {
      const visitor = {
        visitTimestamps: [now - 1000, now - 2000, now - 3000],
        purchasesCount: 0,
      };
      expect(
        checkVisitorEligibility(visitor, {
          ...DEFAULT_INCENTIVE_CONFIG,
          enabled: false,
        }),
      ).toBe(false);
    });

    it("returns false if visitor has already made a purchase", () => {
      const visitor = {
        visitTimestamps: [now - 1000, now - 2000, now - 3000],
        purchasesCount: 1,
      };
      expect(checkVisitorEligibility(visitor, DEFAULT_INCENTIVE_CONFIG)).toBe(
        false,
      );
    });

    it("returns true when visitor has >= minVisits within the time window", () => {
      const visitor = {
        visitTimestamps: [
          now - 5 * 60 * 1000, // 5 min ago
          now - 15 * 60 * 1000, // 15 min ago
          now - 25 * 60 * 1000, // 25 min ago
        ],
        purchasesCount: 0,
      };
      expect(checkVisitorEligibility(visitor, DEFAULT_INCENTIVE_CONFIG)).toBe(
        true,
      );
    });

    it("returns false if visits fall outside the time window", () => {
      const visitor = {
        visitTimestamps: [
          now - 5 * 60 * 1000,
          now - 70 * 60 * 1000, // 70 min ago (outside 60m window)
          now - 80 * 60 * 1000,
        ],
        purchasesCount: 0,
      };
      expect(checkVisitorEligibility(visitor, DEFAULT_INCENTIVE_CONFIG)).toBe(
        false,
      );
    });
  });

  describe("generateMockFrequentVisitors", () => {
    it("generates visitors list with qualified candidates", () => {
      const mockProducts = [
        { id: 1, name: "عطر مروان" },
        { id: 2, name: "قهوة مختصة" },
      ];
      const visitors = generateMockFrequentVisitors(mockProducts);
      expect(visitors.length).toBeGreaterThan(0);

      const qualified = visitors.filter((v) => v.status === "qualified");
      expect(qualified.length).toBeGreaterThanOrEqual(2);
      expect(qualified[0].visitCount).toBeGreaterThanOrEqual(3);
      expect(qualified[0].purchasesCount).toBe(0);
    });
  });

  describe("generateStorefrontTrackingScript", () => {
    it("outputs valid script containing configured coupon and threshold", () => {
      const script = generateStorefrontTrackingScript({
        ...DEFAULT_INCENTIVE_CONFIG,
        couponCode: "SAVE20NOW",
        minVisits: 3,
      });

      expect(script).toContain("SAVE20NOW");
      expect(script).toContain("CONFIG.minVisits");
      expect(script).toContain("localStorage");
    });
  });
});
