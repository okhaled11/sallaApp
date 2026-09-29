import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GrowthCopilotHub from "../GrowthCopilotHub.jsx";

const mockProducts = [
  {
    id: 1,
    name: "سماعات رأس لاسلكية",
    price: 150,
    soldQuantity: 12,
    quantity: 25,
    category: "إلكترونيات",
  },
  {
    id: 2,
    name: "غطاء حماية سيليكون",
    price: 20,
    costPrice: 22, // negative margin
    soldQuantity: 5,
    quantity: 50,
    category: "إكسسوارات",
  },
  {
    id: 3,
    name: "شاحن مغناطيسي نادر",
    price: 100,
    soldQuantity: 0,
    quantity: 30, // deadstock
    category: "إلكترونيات",
  },
];

describe("GrowthCopilotHub", () => {
  it("returns null if products array is empty or null", () => {
    const { container: c1 } = render(<GrowthCopilotHub products={[]} />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(<GrowthCopilotHub products={null} />);
    expect(c2.firstChild).toBeNull();
  });

  it("renders header, KPI metrics, prompt pills, and recommendations", () => {
    render(<GrowthCopilotHub products={mockProducts} currency="SAR" />);

    expect(screen.getByText("مساعد النمو الذكي للكتالوج")).toBeInTheDocument();
    expect(screen.getByText(/أرباح إضافية متوقعة/)).toBeInTheDocument();
    expect(screen.getByText(/مؤشر جودة الكتالوج/)).toBeInTheDocument();
    expect(screen.getByText(/فرص رفع الأسعار/)).toBeInTheDocument();
  });

  it("filters recommendations by clicking prompt pills and filter tabs", async () => {
    const user = userEvent.setup();
    render(<GrowthCopilotHub products={mockProducts} currency="SAR" />);

    const pricePill = screen.getByRole("button", {
      name: /فرص رفع الأسعار/,
    });
    await user.click(pricePill);

    expect(screen.getByText("سماعات رأس لاسلكية")).toBeInTheDocument();
  });

  it("supports search in recommendations", async () => {
    const user = userEvent.setup();
    render(<GrowthCopilotHub products={mockProducts} currency="SAR" />);

    const searchInput = screen.getByPlaceholderText(
      "بحث في توصيات المساعد الذكي...",
    );
    await user.type(searchInput, "غطاء حماية");

    expect(screen.getAllByText("غطاء حماية سيليكون").length).toBeGreaterThan(0);
    expect(screen.queryByText("سماعات رأس لاسلكية")).not.toBeInTheDocument();
  });

  it("handles dismissing and resetting recommendations", async () => {
    const user = userEvent.setup();
    render(<GrowthCopilotHub products={mockProducts} currency="SAR" />);

    const dismissBtns = screen.getAllByRole("button", { name: "تخطي" });
    expect(dismissBtns.length).toBeGreaterThan(0);

    await user.click(dismissBtns[0]);
    // The dismissed counter increases
    expect(screen.getByText(/تم إنجاز\/تخطي 1/)).toBeInTheDocument();
  });
});
