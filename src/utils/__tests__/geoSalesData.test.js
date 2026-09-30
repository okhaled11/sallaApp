import { describe, it, expect } from "vitest";
import { GEO_HUBS, calculateGeoSales } from "../geoSalesData.js";

describe("geoSalesData", () => {
  it("defines standard regional hubs with coordinates and metadata", () => {
    expect(GEO_HUBS.length).toBeGreaterThan(5);
    const riyadh = GEO_HUBS.find((h) => h.id === "riyadh");
    expect(riyadh).toBeDefined();
    expect(riyadh.name).toBe("الرياض");
    expect(riyadh.country).toBe("السعودية");
    expect(typeof riyadh.x).toBe("number");
    expect(typeof riyadh.y).toBe("number");
  });

  it("calculates geographic distribution with empty products", () => {
    const result = calculateGeoSales([]);
    expect(result.regions).toHaveLength(GEO_HUBS.length);
    expect(result.summary.totalCities).toBe(GEO_HUBS.length);
    expect(result.summary.totalCountries).toBeGreaterThan(1);
    expect(result.summary.totalRevenue).toBeGreaterThan(0);
  });

  it("distributes sales and derives top products from catalog", () => {
    const mockProducts = [
      { id: "p1", name: "قهوة مختصة", regularPrice: 60, soldQuantity: 100 },
      { id: "p2", name: "تمر سكري فاخر", regularPrice: 40, soldQuantity: 80 },
      { id: "p3", name: "مبخرة ذكية", regularPrice: 120, soldQuantity: 50 },
    ];

    const result = calculateGeoSales(mockProducts);
    expect(result.regions[0].revenue).toBeGreaterThan(0);
    expect(result.regions[0].ordersCount).toBeGreaterThan(0);
    expect(result.regions[0].averageOrderValue).toBeGreaterThan(0);
    expect(result.regions[0].topProducts.length).toBeGreaterThan(0);
    expect(result.summary.topCityName).toBe("الرياض");
  });
});
