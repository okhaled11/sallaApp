import { describe, it, expect, vi } from "vitest";
import {
  escapeCsvCell,
  generateProfitCsv,
  downloadFile,
} from "../reportExport.js";

describe("reportExport", () => {
  it("escapes CSV cells with commas, quotes, and newlines properly", () => {
    expect(escapeCsvCell("Simple")).toBe("Simple");
    expect(escapeCsvCell("Name, with comma")).toBe('"Name, with comma"');
    expect(escapeCsvCell('With "quotes"')).toBe('"With ""quotes"""');
    expect(escapeCsvCell(null)).toBe("");
  });

  it("generates CSV with correct headers and rows", () => {
    const products = [
      {
        id: 101,
        name: "قهوة عربية",
        price: 50,
        costPrice: 20,
        soldQuantity: 10,
        quantity: 15,
        categories: [{ name: "مشروبات" }],
      },
    ];

    const csv = generateProfitCsv(products, "SAR");

    expect(csv.startsWith("\uFEFF")).toBe(true); // UTF-8 BOM present
    expect(csv).toContain("معرف المنتج");
    expect(csv).toContain("قهوة عربية");
    expect(csv).toContain("مشروبات");
    expect(csv).toContain("50.00");
    expect(csv).toContain("20.00");
    expect(csv).toContain("30.00"); // Unit profit
    expect(csv).toContain("60.0%"); // Margin
    expect(csv).toContain("300.00"); // Total profit
  });

  it("triggers file download through document link creation", () => {
    const appendSpy = vi.spyOn(document.body, "appendChild");
    const removeSpy = vi.spyOn(document.body, "removeChild");

    // Mock URL object
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    global.URL.revokeObjectURL = vi.fn();

    downloadFile("test,data", "report.csv");

    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });
});
