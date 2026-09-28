import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CategoryInsights from "../CategoryInsights.jsx";

const perfumes = { id: 1, name: "Perfumes" };
const incense = { id: 2, name: "Incense" };

const products = [
  {
    id: 1,
    name: "Oud Oil",
    quantity: 2,
    soldQuantity: 40,
    categories: [perfumes],
  },
  {
    id: 2,
    name: "Musk",
    quantity: 0,
    soldQuantity: 12,
    categories: [perfumes],
  },
  {
    id: 3,
    name: "Amber",
    quantity: 30,
    soldQuantity: 0,
    categories: [perfumes],
  },
  {
    id: 4,
    name: "Bakhoor",
    quantity: null,
    soldQuantity: 5,
    categories: [incense],
  },
];

function renderInsights(props = {}) {
  const handlers = {
    onLowStockLimitChange: vi.fn(),
    onSelectCategory: vi.fn(),
  };
  render(
    <CategoryInsights
      products={products}
      lowStockLimit={5}
      selectedCategoryId={null}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

const card = (name) => screen.getByRole("article", { name });

describe("CategoryInsights", () => {
  it("shows one card per category, best selling first", () => {
    renderInsights();
    const names = screen
      .getAllByRole("article")
      .map((el) => within(el).getByRole("heading", { level: 3 }).textContent);
    expect(names).toEqual(["Perfumes", "Incense"]);
    expect(
      screen.getByText(/2 categories · 2 stock alerts/),
    ).toBeInTheDocument();
  });

  it("shows top sellers and totals for a category", () => {
    renderInsights();
    const perfumesCard = card("Perfumes");
    expect(
      within(perfumesCard).getByText("3 products · 52 sold"),
    ).toBeInTheDocument();
    expect(within(perfumesCard).getByText("91% of sales")).toBeInTheDocument();

    const top = within(perfumesCard).getAllByRole("listitem");
    expect(top[0]).toHaveTextContent("Oud Oil");
    expect(top[0]).toHaveTextContent("40 sold");
  });

  it("shows what is out of stock and running low", () => {
    renderInsights();
    const perfumesCard = card("Perfumes");
    expect(
      within(perfumesCard).getByText(/1 out of stock/),
    ).toBeInTheDocument();
    expect(within(perfumesCard).getByText(/1 running low/)).toBeInTheDocument();
    expect(within(perfumesCard).getByText("2 left")).toBeInTheDocument();
    expect(within(perfumesCard).getByText(/1 never sold/)).toBeInTheDocument();

    expect(
      within(card("Incense")).getByText("All in stock"),
    ).toBeInTheDocument();
  });

  it("changes the running-low limit", async () => {
    const { onLowStockLimitChange } = renderInsights();
    await userEvent.selectOptions(
      screen.getByLabelText("Running low at"),
      "10",
    );
    expect(onLowStockLimitChange).toHaveBeenCalledWith(10);
  });

  it("selects and unselects a category", async () => {
    const { onSelectCategory } = renderInsights();
    await userEvent.click(
      within(card("Incense")).getByRole("button", { name: "View products" }),
    );
    expect(onSelectCategory).toHaveBeenCalledWith(
      expect.objectContaining({ id: "2", name: "Incense" }),
    );
  });

  it("marks the selected category and lets it be cleared", async () => {
    const { onSelectCategory } = renderInsights({ selectedCategoryId: "2" });
    const button = within(card("Incense")).getByRole("button", {
      name: "Showing products",
    });
    expect(button).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(button);
    expect(onSelectCategory).toHaveBeenCalledWith(null);
  });

  it("shows an empty state without products", () => {
    renderInsights({ products: [] });
    expect(screen.getByText("No products to analyze yet.")).toBeInTheDocument();
  });
});
