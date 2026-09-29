import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SmartCampaignHub from "../SmartCampaignHub.jsx";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

describe("SmartCampaignHub", () => {
  const sampleProducts = [
    {
      id: "prod-1",
      name: "عطر ملوكي فاخر",
      price: 200,
      cost_price: 100,
      quantity: 50,
      sold_quantity: 45,
      category_id: 1,
      currency: "SAR",
    },
    {
      id: "prod-2",
      name: "بخور مروكي",
      price: 150,
      cost_price: 80,
      quantity: 30,
      sold_quantity: 5,
      category_id: 1,
      currency: "SAR",
    },
    {
      id: "prod-3",
      name: "معطر جو مسك",
      price: 80,
      cost_price: 30,
      quantity: 25,
      sold_quantity: 0,
      category_id: 2,
      currency: "SAR",
    },
  ];

  const writeTextMock = vi.fn().mockResolvedValue();

  beforeEach(() => {
    localStorage.clear();
    writeTextMock.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: writeTextMock,
      },
      configurable: true,
      writable: true,
    });
  });

  const renderWithProviders = (ui) => {
    return render(<ToastProvider>{ui}</ToastProvider>);
  };

  it("renders hub header, KPI strip, and recommendation cards", () => {
    renderWithProviders(
      <SmartCampaignHub products={sampleProducts} currency="SAR" />,
    );

    expect(
      screen.getByRole("heading", { name: /مركز العروض والحملات الذكية/i }),
    ).toBeInTheDocument();

    expect(screen.getByText("فرص عروض ذكية مكتشفة")).toBeInTheDocument();
    expect(screen.getByText(/العروض المقترحة/i)).toBeInTheDocument();
  });

  it("switches to custom builder tab when clicked", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <SmartCampaignHub products={sampleProducts} currency="SAR" />,
    );

    const customTabBtn = screen.getByRole("tab", { name: /إنشاء عرض مخصص/i });
    await user.click(customTabBtn);

    expect(screen.getByText(/منشئ العروض والحملات المخصص/i)).toBeInTheDocument();
  });

  it("switches to saved campaigns tab", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <SmartCampaignHub products={sampleProducts} currency="SAR" />,
    );

    const savedTabBtn = screen.getByRole("tab", { name: /العروض النشطة والمحفوظة/i });
    await user.click(savedTabBtn);

    expect(screen.getByText(/لا توجد عروض محفوظة حتى الآن/i)).toBeInTheDocument();
  });

  it("applies product price update to store via onUpdateProduct", async () => {
    const handleUpdate = vi.fn().mockResolvedValue({ success: true });
    const user = userEvent.setup();

    renderWithProviders(
      <SmartCampaignHub
        products={sampleProducts}
        currency="SAR"
        onUpdateProduct={handleUpdate}
      />,
    );

    // Find the direct apply button on clearance card
    const applyBtns = screen.getAllByRole("button", {
      name: /تطبيق السعر في المتجر/i,
    });
    expect(applyBtns.length).toBeGreaterThan(0);

    await user.click(applyBtns[0]);
    expect(handleUpdate).toHaveBeenCalled();
  });
});
