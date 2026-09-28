import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActionPlan from "../ActionPlan.jsx";

const product = (id, name, overrides = {}) => ({
  id,
  name,
  currency: "SAR",
  price: 100,
  salePrice: null,
  costPrice: 60,
  quantity: 50,
  soldQuantity: 10,
  categories: [],
  ...overrides,
});

const products = [
  product(1, "Oud Oil", { quantity: 0, soldQuantity: 30 }), // restock critical
  product(2, "Musk", { costPrice: 120, soldQuantity: 4 }), // loss critical
  product(3, "Amber", { quantity: 2, soldQuantity: 8 }), // restock warning
  product(4, "Rose", { costPrice: null, soldQuantity: 6 }), // missing cost
  product(5, "Bakhoor", { soldQuantity: 0, quantity: 12 }), // dead stock 1200
];

function renderPlan(props = {}) {
  const onEditProduct = vi.fn();
  render(
    <ActionPlan
      products={products}
      lowStockLimit={5}
      onEditProduct={onEditProduct}
      {...props}
    />,
  );
  return { onEditProduct };
}

const rows = () => within(screen.getByRole("list")).getAllByRole("listitem");

describe("ActionPlan", () => {
  it("summarizes urgent and soon actions and idle stock value", () => {
    renderPlan();
    expect(screen.getByText("Urgent").previousSibling).toHaveTextContent("2");
    expect(screen.getByText("Soon").previousSibling).toHaveTextContent("1");
    expect(
      screen.getByText("In never-sold stock").previousSibling,
    ).toHaveTextContent("1,200 SAR");
  });

  it("lists actions most urgent first", () => {
    renderPlan();
    const items = rows();
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent("Restock now");
    expect(items[0]).toHaveTextContent("Oud Oil");
    expect(items[1]).toHaveTextContent("Selling at a loss");
    expect(items[2]).toHaveTextContent("Restock soon");
  });

  it("opens the product's edit form from an action", async () => {
    const { onEditProduct } = renderPlan();
    await userEvent.click(
      screen.getByRole("button", { name: "Add cost: Rose" }),
    );
    expect(onEditProduct).toHaveBeenCalledWith(
      expect.objectContaining({ id: 4 }),
    );
  });

  it("filters actions by group", async () => {
    renderPlan();
    await userEvent.click(screen.getByRole("button", { name: /Pricing/ }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent("Musk");

    await userEvent.click(screen.getByRole("button", { name: /Stock/ }));
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringContaining("Oud Oil"),
      expect.stringContaining("Amber"),
      expect.stringContaining("Bakhoor"),
    ]);
  });

  it("shows the count per filter", () => {
    renderPlan();
    expect(screen.getByRole("button", { name: /All/ })).toHaveTextContent("5");
    expect(screen.getByRole("button", { name: /Data/ })).toHaveTextContent("1");
  });

  it("shows the first 5 and expands to all", async () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      product(10 + i, `Item ${i + 1}`, { quantity: 0, soldQuantity: 20 - i }),
    );
    renderPlan({ products: many });

    expect(rows()).toHaveLength(5);
    await userEvent.click(
      screen.getByRole("button", { name: "Show all 8 actions" }),
    );
    expect(rows()).toHaveLength(8);
  });

  it("celebrates a healthy store", () => {
    renderPlan({ products: [product(1, "Oud Oil")] });
    expect(
      screen.getByText("Nothing to fix — your store looks healthy."),
    ).toBeInTheDocument();
  });

  it("uses the running-low limit from the category card", () => {
    renderPlan({
      products: [product(1, "Oud Oil", { quantity: 8 })],
      lowStockLimit: 10,
    });
    expect(rows()[0]).toHaveTextContent("Only 8 left");
  });
});
