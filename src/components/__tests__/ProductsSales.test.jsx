import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProductsSales from "../ProductsSales.jsx";

const products = [
  {
    id: 1,
    name: "Blue Shirt",
    sku: "SH-1",
    price: 100,
    currency: "SAR",
    image: null,
    soldQuantity: 12,
  },
  {
    id: 2,
    name: "Red Hat",
    sku: "HT-2",
    price: 50,
    currency: "SAR",
    image: null,
    soldQuantity: 1,
  },
  {
    id: 3,
    name: "Green Bag",
    sku: null,
    price: null,
    currency: null,
    image: null,
    soldQuantity: 0,
  },
];

function renderComponent(props = {}) {
  return render(
    <ProductsSales
      products={products}
      totalSold={13}
      isLoading={false}
      error={null}
      onReload={vi.fn()}
      {...props}
    />,
  );
}

describe("ProductsSales", () => {
  it("shows how many times each product was sold", () => {
    renderComponent();
    expect(screen.getByText("Sold 12 times")).toBeInTheDocument();
    expect(screen.getByText("Sold 1 time")).toBeInTheDocument();
    expect(screen.getByText("Not sold yet")).toBeInTheDocument();
  });

  it("shows summary with totals and best seller", () => {
    renderComponent();
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getAllByText("Blue Shirt")).toHaveLength(2);
  });

  it("filters by name or SKU", async () => {
    renderComponent();
    await userEvent.type(screen.getByLabelText("Search products"), "ht-2");
    expect(screen.getByText("Red Hat")).toBeInTheDocument();
    expect(screen.queryByText("Green Bag")).not.toBeInTheDocument();
  });

  it("shows empty state when search has no match", async () => {
    renderComponent();
    await userEvent.type(screen.getByLabelText("Search products"), "zzz");
    expect(
      screen.getByText("No products match your filters."),
    ).toBeInTheDocument();
  });

  it("shows loading state before first load", () => {
    renderComponent({ products: [], isLoading: true });
    expect(screen.getByText("Loading products...")).toBeInTheDocument();
  });

  it("shows error with retry", async () => {
    const onReload = vi.fn();
    renderComponent({ error: "boom", onReload });
    expect(
      screen.getByText("Failed to load products: boom"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onReload).toHaveBeenCalled();
  });

  it("shows stock status for each product", () => {
    renderComponent({
      products: [
        { ...products[0], quantity: 4 },
        { ...products[1], quantity: 0 },
        { ...products[2], quantity: null },
      ],
    });
    expect(screen.getByText("Stock 4")).toBeInTheDocument();
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
    expect(screen.getByText("Unlimited stock")).toBeInTheDocument();
  });

  it("hides edit buttons when editing is not enabled", () => {
    renderComponent();
    expect(
      screen.queryByRole("button", { name: "Edit Blue Shirt" }),
    ).not.toBeInTheDocument();
  });

  it("opens the edit form and saves changes", async () => {
    const onUpdateProduct = vi.fn().mockResolvedValue({ success: true });
    renderComponent({ onUpdateProduct });

    await userEvent.click(screen.getByRole("button", { name: "Edit Red Hat" }));
    const priceInput = screen.getByLabelText(/Price/);
    await userEvent.clear(priceInput);
    await userEvent.type(priceInput, "75");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onUpdateProduct).toHaveBeenCalledWith(2, { price: 75 });
    expect(screen.queryByLabelText(/Price/)).not.toBeInTheDocument();
  });

  describe("category filter", () => {
    const categorized = [
      { ...products[0], categories: [{ id: 1, name: "Shirts" }] },
      { ...products[1], categories: [{ id: 2, name: "Hats" }] },
      { ...products[2], categories: [] },
    ];

    it("shows only products in the selected category", () => {
      renderComponent({
        products: categorized,
        categoryFilter: { id: "2", name: "Hats" },
      });
      expect(screen.getByText("Red Hat")).toBeInTheDocument();
      expect(screen.queryByText("Green Bag")).not.toBeInTheDocument();
      expect(screen.getAllByText("Blue Shirt")).toHaveLength(1); // best seller tile only
    });

    it("shows uncategorized products for the Uncategorized group", () => {
      renderComponent({
        products: categorized,
        categoryFilter: { id: "uncategorized", name: "Uncategorized" },
      });
      expect(screen.getByText("Green Bag")).toBeInTheDocument();
      expect(screen.queryByText("Red Hat")).not.toBeInTheDocument();
    });

    it("clears the filter from its chip", async () => {
      const onClearCategory = vi.fn();
      renderComponent({
        products: categorized,
        categoryFilter: { id: "2", name: "Hats" },
        onClearCategory,
      });
      await userEvent.click(
        screen.getByRole("button", { name: "Clear category filter Hats" }),
      );
      expect(onClearCategory).toHaveBeenCalled();
    });
  });
});
