import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StoreStatistics from "../StoreStatistics.jsx";

const mockProducts = [
  {
    id: 1,
    name: "قهوة مختصة",
    price: 60,
    costPrice: 30,
    soldQuantity: 100,
    quantity: 20,
    currency: "SAR",
    categories: [{ id: "cat1", name: "مشروبات" }],
  },
  {
    id: 2,
    name: "كوب سيراميك",
    price: 40,
    costPrice: 50, // Loss maker
    soldQuantity: 10,
    quantity: 5,
    currency: "SAR",
    categories: [{ id: "cat2", name: "أدوات" }],
  },
  {
    id: 3,
    name: "فلتر قهوة",
    price: 25,
    costPrice: null, // Missing cost
    soldQuantity: 50,
    quantity: 15,
    currency: "SAR",
    categories: [{ id: "cat2", name: "أدوات" }],
  },
];

describe("StoreStatistics", () => {
  it("renders the main heading and KPI values", () => {
    render(<StoreStatistics products={mockProducts} currency="SAR" />);

    expect(
      screen.getByRole("heading", { name: /إحصائيات المتجر ومحركات الأرباح/i }),
    ).toBeInTheDocument();

    // Check KPI titles
    expect(screen.getByText("إجمالي المبيعات")).toBeInTheDocument();
    expect(screen.getByText("صافي الربح المتوقع")).toBeInTheDocument();
    expect(screen.getByText("القسم الأعلى أرباحاً")).toBeInTheDocument();
  });

  it("renders top profit drivers and calls onEditProduct when edit clicked", async () => {
    const handleEdit = vi.fn();
    render(
      <StoreStatistics
        products={mockProducts}
        currency="SAR"
        onEditProduct={handleEdit}
      />,
    );

    expect(screen.getByText("قهوة مختصة")).toBeInTheDocument();

    const editBtns = screen.getAllByRole("button", { name: "تعديل" });
    expect(editBtns.length).toBeGreaterThan(0);
    await userEvent.click(editBtns[0]);
    expect(handleEdit).toHaveBeenCalledWith(mockProducts[0]);
  });

  it("switches tabs between overview, profit drivers, and categories", async () => {
    render(<StoreStatistics products={mockProducts} currency="SAR" />);

    const driversTab = screen.getByRole("tab", { name: /الأكثر ربحية/i });
    await userEvent.click(driversTab);
    expect(driversTab).toHaveClass("active");

    const categoriesTab = screen.getByRole("tab", { name: /أرباح الأقسام/i });
    await userEvent.click(categoriesTab);
    expect(categoriesTab).toHaveClass("active");
  });

  it("renders profit loss alert for loss-making products", () => {
    render(<StoreStatistics products={mockProducts} currency="SAR" />);

    expect(screen.getByText(/منتجات تُباع بخسارة مالية/i)).toBeInTheDocument();
    expect(screen.getByText("كوب سيراميك")).toBeInTheDocument();
  });
});
