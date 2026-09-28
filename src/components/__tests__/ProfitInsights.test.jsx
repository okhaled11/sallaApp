import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProfitInsights from "../ProfitInsights.jsx";

const base = { currency: "SAR", salePrice: null, categories: [] };
const products = [
  {
    ...base,
    id: 1,
    name: "Oud Oil",
    price: 200,
    costPrice: 50,
    soldQuantity: 5,
  },
  { ...base, id: 2, name: "Musk", price: 100, costPrice: 95, soldQuantity: 50 },
  {
    ...base,
    id: 3,
    name: "Amber",
    price: 100,
    costPrice: 120,
    soldQuantity: 2,
  },
  {
    ...base,
    id: 4,
    name: "Bakhoor",
    price: 30,
    costPrice: null,
    soldQuantity: 9,
  },
];

const section = (name) =>
  screen.getByRole("heading", { name }).closest("section");

describe("ProfitInsights", () => {
  it("shows estimated profit, average margin and cost coverage", () => {
    render(<ProfitInsights products={products} />);
    // 750 + 250 - 40
    expect(screen.getByText("960 SAR")).toBeInTheDocument();
    // 960 / (1000 + 5000 + 200)
    expect(screen.getByText("15%")).toBeInTheDocument();
    expect(
      screen.getByText("3 of 4 products have a cost price"),
    ).toBeInTheDocument();
  });

  it("lists who earns the most with their margin", () => {
    render(<ProfitInsights products={products} />);
    const items = within(section(/Earns the most/)).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Oud Oil");
    expect(items[0]).toHaveTextContent("75%");
    expect(items[0]).toHaveTextContent("750 SAR");
    expect(items[1]).toHaveTextContent("Musk");
  });

  it("flags thin margins and losses", () => {
    render(<ProfitInsights products={products} />);
    const thin = within(section(/Thin margins/));
    expect(thin.getByText("loses 20 SAR/unit")).toBeInTheDocument();
    expect(thin.getByText("5 SAR/unit")).toBeInTheDocument();
  });

  it("asks for missing cost prices and opens the product to edit", async () => {
    const onEditProduct = vi.fn();
    render(
      <ProfitInsights products={products} onEditProduct={onEditProduct} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Add cost for Bakhoor" }),
    );
    expect(onEditProduct).toHaveBeenCalledWith(
      expect.objectContaining({ id: 4 }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Edit price of Amber" }),
    );
    expect(onEditProduct).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 3 }),
    );
  });

  it("explains what to do when no product has a cost", () => {
    render(
      <ProfitInsights
        products={[{ ...products[3] }]}
        onEditProduct={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Add cost prices to see which products earn the most."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  describe("show more", () => {
    const earnersList = () =>
      within(section(/Earns the most/)).getByRole("list");

    it("expands to every product with a cost and collapses back", async () => {
      render(<ProfitInsights products={products} />);
      // Collapsed: only products that make a profit
      expect(
        within(earnersList()).queryByText("Amber"),
      ).not.toBeInTheDocument();

      const button = screen.getByRole("button", {
        name: "Show more (all 3 with cost)",
      });
      expect(button).toHaveAttribute("aria-expanded", "false");
      await userEvent.click(button);

      const rows = within(earnersList()).getAllByRole("listitem");
      expect(rows.map((row) => row.textContent)).toEqual([
        expect.stringContaining("Oud Oil"),
        expect.stringContaining("Musk"),
        expect.stringContaining("Amber"),
      ]);
      expect(within(rows[2]).getByText("-40 SAR")).toHaveClass(
        "profit-negative",
      );
      // Products without a cost are not in this list
      expect(
        within(earnersList()).queryByText("Bakhoor"),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Show less" }));
      expect(within(earnersList()).getAllByRole("listitem")).toHaveLength(2);
    });

    it("shows the top 5 first when many products have a cost", async () => {
      const many = Array.from({ length: 8 }, (_, i) => ({
        ...base,
        id: 100 + i,
        name: `Item ${i + 1}`,
        price: 100,
        costPrice: 50,
        soldQuantity: 10 - i,
      }));
      render(<ProfitInsights products={many} />);

      expect(within(earnersList()).getAllByRole("listitem")).toHaveLength(5);
      await userEvent.click(
        screen.getByRole("button", { name: "Show more (all 8 with cost)" }),
      );
      expect(within(earnersList()).getAllByRole("listitem")).toHaveLength(8);
    });

    it("hides the button when everything is already shown", () => {
      render(<ProfitInsights products={products.slice(0, 2)} />);
      expect(
        screen.queryByRole("button", { name: /Show more/ }),
      ).not.toBeInTheDocument();
    });

    it("lists products with a cost even when none makes a profit", () => {
      render(<ProfitInsights products={[products[2], products[3]]} />);
      expect(within(earnersList()).getByText("Amber")).toBeInTheDocument();
      expect(
        screen.queryByText(/Add cost prices to see/),
      ).not.toBeInTheDocument();
    });
  });
});
