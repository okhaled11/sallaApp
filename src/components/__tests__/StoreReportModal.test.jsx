import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StoreReportModal from "../StoreReportModal.jsx";

const mockProducts = [
  {
    id: 1,
    name: "قهوة كولومبية",
    price: 60,
    costPrice: 30,
    soldQuantity: 10,
    quantity: 5,
    categories: [{ name: "مشروبات" }],
  },
];

const mockStats = {
  kpis: {
    totalRevenue: 600,
    totalProfit: 300,
    overallMargin: 0.5,
    totalSoldUnits: 10,
    productsCount: 1,
    withCostCount: 1,
    costCoverage: 100,
    idleStockValue: 0,
    idleStockCount: 0,
  },
  topProfitDrivers: [
    {
      product: mockProducts[0],
      totalProfit: 300,
      margin: 0.5,
      profitShare: 100,
      soldQuantity: 10,
      unitProfit: 30,
    },
  ],
  categoryProfitBreakdown: [
    {
      id: "1",
      name: "مشروبات",
      productCount: 1,
      totalSold: 10,
      revenue: 600,
      profit: 300,
      margin: 0.5,
      profitShare: 100,
    },
  ],
  lossMakers: [],
  totalLoss: 0,
  missingCostTopSellers: [],
};

describe("StoreReportModal", () => {
  it("does not render when isOpen is false", () => {
    render(
      <StoreReportModal
        isOpen={false}
        onClose={vi.fn()}
        products={mockProducts}
        stats={mockStats}
      />,
    );
    expect(
      screen.queryByText(/تقرير الأداء المالي وربحية المتجر/i),
    ).not.toBeInTheDocument();
  });

  it("renders report content when isOpen is true", () => {
    render(
      <StoreReportModal
        isOpen={true}
        onClose={vi.fn()}
        products={mockProducts}
        stats={mockStats}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: /تقرير الأداء المالي وربحية المتجر/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("قهوة كولومبية")).toBeInTheDocument();
    expect(screen.getByText("مشروبات")).toBeInTheDocument();
  });

  it("triggers print when print button is clicked", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(
      <StoreReportModal
        isOpen={true}
        onClose={vi.fn()}
        products={mockProducts}
        stats={mockStats}
      />,
    );

    const printBtn = screen.getByRole("button", { name: /طباعة/i });
    await userEvent.click(printBtn);
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("calls onClose when close button is clicked", async () => {
    const handleClose = vi.fn();
    render(
      <StoreReportModal
        isOpen={true}
        onClose={handleClose}
        products={mockProducts}
        stats={mockStats}
      />,
    );

    const closeBtn = screen.getByRole("button", { name: /إغلاق التقرير/i });
    await userEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalled();
  });
});
