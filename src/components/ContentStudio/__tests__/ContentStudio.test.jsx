import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContentStudio from "../ContentStudio.jsx";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

const mockProducts = [
  {
    id: 1,
    name: "عطر شرقي فاخر وثابت للغاية",
    image: "https://example.com/perfume.jpg",
    sku: "PERF-1",
    categories: [{ id: 10, name: "عطور" }],
  },
  {
    id: 2,
    name: "قلم",
    image: null,
    sku: null,
    categories: [],
  },
];

function renderWithToast(ui) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

describe("ContentStudio", () => {
  it("renders hero title, description and KPI cards", () => {
    renderWithToast(<ContentStudio products={mockProducts} />);

    expect(
      screen.getByRole("heading", { name: "ستوديو جودة المحتوى والسيو" }),
    ).toBeInTheDocument();
    expect(screen.getByText("إجمالي المنتجات المفحوصة")).toBeInTheDocument();
    expect(screen.getByText("منتجات بحاجة لتحسين")).toBeInTheDocument();
  });

  it("filters products based on search input", async () => {
    const user = userEvent.setup();
    renderWithToast(<ContentStudio products={mockProducts} />);

    const searchInput = screen.getByPlaceholderText(
      /ابحث بالاسم أو SKU للتحقق من المحتوى/i,
    );
    await user.type(searchInput, "عطر");

    expect(screen.getByText("عطر شرقي فاخر وثابت للغاية")).toBeInTheDocument();
    expect(screen.queryByText("قلم")).not.toBeInTheDocument();
  });

  it("filters products by clicking filter chips", async () => {
    const user = userEvent.setup();
    renderWithToast(<ContentStudio products={mockProducts} />);

    const missingImageFilterChip = screen.getByRole("button", {
      name: /صور مفقودة/i,
    });
    await user.click(missingImageFilterChip);

    expect(screen.getByText("قلم")).toBeInTheDocument();
    expect(
      screen.queryByText("عطر شرقي فاخر وثابت للغاية"),
    ).not.toBeInTheDocument();
  });

  it("opens ContentEnhancerModal when clicking examine button", async () => {
    const user = userEvent.setup();
    renderWithToast(<ContentStudio products={mockProducts} />);

    const examineButtons = screen.getAllByRole("button", {
      name: /فحص وسيو المحتوى/i,
    });
    await user.click(examineButtons[0]);

    expect(
      screen.getByRole("heading", { name: "فحص جاهزية المحتوى" }),
    ).toBeInTheDocument();
  });
});
