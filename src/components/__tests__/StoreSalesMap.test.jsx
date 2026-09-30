import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StoreSalesMap from "../StoreSalesMap.jsx";

const mockProducts = [
  {
    id: "p1",
    name: "سماعة بلوتوث لاسلكية",
    regularPrice: 199,
    soldQuantity: 120,
    category: { id: "c1", name: "إلكترونيات" },
  },
  {
    id: "p2",
    name: "حقيبة ظهر جلدية",
    regularPrice: 250,
    soldQuantity: 80,
    category: { id: "c2", name: "أزياء" },
  },
];

describe("StoreSalesMap Component", () => {
  it("renders the map header and default active city (Riyadh)", () => {
    render(<StoreSalesMap products={mockProducts} currency="ر.س" />);

    expect(
      screen.getByText("خريطة المبيعات والانتشار الجغرافي"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "الرياض", level: 3 }),
    ).toBeInTheDocument();
    expect(screen.getByText("مركز رئيسي")).toBeInTheDocument();
    expect(screen.getByText("إجمالي المبيعات")).toBeInTheDocument();
  });

  it("filters cities by Saudi Arabia or GCC", async () => {
    const user = userEvent.setup();
    render(<StoreSalesMap products={mockProducts} currency="ر.س" />);

    const gccBtn = screen.getByRole("button", { name: /دول الخليج/i });
    await user.click(gccBtn);

    // After filtering by GCC, Dubai should become the active city
    expect(
      screen.getByRole("heading", { name: "دبي", level: 3 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/الإمارات/i)).toBeInTheDocument();
  });

  it("updates city details on pin hover", async () => {
    const user = userEvent.setup();
    render(<StoreSalesMap products={mockProducts} currency="ر.س" />);

    // Hover on Jeddah pin button
    const jeddahPin = screen.getByRole("button", { name: /جدة/i });
    await user.hover(jeddahPin);

    expect(
      screen.getByRole("heading", { name: "جدة", level: 3 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/توصيل سريع - الغربية/i)).toBeInTheDocument();
  });

  it("toggles city selection on pin click", async () => {
    const user = userEvent.setup();
    render(<StoreSalesMap products={mockProducts} currency="ر.س" />);

    const dammamPin = screen.getByRole("button", { name: /الدمام والخبر/i });
    await user.click(dammamPin);

    expect(
      screen.getByRole("heading", { name: "الدمام والخبر", level: 3 }),
    ).toBeInTheDocument();
    expect(screen.getByText("إلغاء التثبيت ✕")).toBeInTheDocument();

    // Click cancel selection
    await user.click(screen.getByText("إلغاء التثبيت ✕"));
    expect(screen.queryByText("إلغاء التثبيت ✕")).not.toBeInTheDocument();
  });

  it("displays top products for the selected city", () => {
    render(<StoreSalesMap products={mockProducts} currency="ر.س" />);
    expect(screen.getByText("سماعة بلوتوث لاسلكية")).toBeInTheDocument();
  });
});
