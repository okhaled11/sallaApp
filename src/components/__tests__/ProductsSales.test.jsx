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
      screen.getByText("No products match your search."),
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
});
