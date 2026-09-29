import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CampaignDetailsModal from "../CampaignDetailsModal.jsx";

describe("CampaignDetailsModal", () => {
  const sampleCampaign = {
    id: "bundle-1",
    type: "bundle",
    badgeText: "حزمة توفير ذكية",
    title: "حزمة القوة: عطر + بخور",
    description: "دمج المنتجين الأكثر مبيعاً",
    urgency: "medium",
    products: [
      { id: "p1", name: "عطر فاخر", price: 200, cost_price: 100, quantity: 10, sold_quantity: 50 },
      { id: "p2", name: "بخور طبيعي", price: 100, cost_price: 50, quantity: 15, sold_quantity: 20 },
    ],
    originalPrice: 300,
    discountedPrice: 255,
    discountPercent: 15,
    savingsAmount: 45,
    estimatedMargin: 0.41,
    unlockedCapital: null,
    suggestedCode: "BUNDLE15",
    canApplyDirectly: false,
  };

  const writeTextMock = vi.fn().mockResolvedValue();

  beforeEach(() => {
    writeTextMock.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: writeTextMock,
      },
      configurable: true,
      writable: true,
    });
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <CampaignDetailsModal
        isOpen={false}
        onClose={vi.fn()}
        campaign={sampleCampaign}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders modal header and tabs when isOpen is true", () => {
    render(
      <CampaignDetailsModal
        isOpen={true}
        onClose={vi.fn()}
        campaign={sampleCampaign}
        currency="SAR"
      />,
    );

    expect(screen.getByRole("heading", { name: /حزمة القوة: عطر \+ بخور/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /معاينة واجهة المتجر/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /النصوص الإعلانية الجاهزة/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /الجدوى المالية وهامش الربح/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /خطوات التفعيل في سلة/i })).toBeInTheDocument();
  });

  it("switches to marketing copy tab and copies text", async () => {
    const user = userEvent.setup();
    const writeSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const handleToast = vi.fn();

    render(
      <CampaignDetailsModal
        isOpen={true}
        onClose={vi.fn()}
        campaign={sampleCampaign}
        currency="SAR"
        showToast={handleToast}
      />,
    );

    const copyTabBtn = screen.getByRole("tab", { name: /النصوص الإعلانية الجاهزة/i });
    await user.click(copyTabBtn);

    expect(screen.getByText(/رسالة واتساب \/ SMS/i)).toBeInTheDocument();

    const copyBtn = screen.getByRole("button", { name: /نسخ النص الإعلاني/i });
    await user.click(copyBtn);

    expect(writeSpy).toHaveBeenCalled();
    expect(handleToast).toHaveBeenCalledWith(expect.stringContaining("تم نسخ"), "success");
  });

  it("switches to finance tab and displays breakdown", async () => {
    const user = userEvent.setup();

    render(
      <CampaignDetailsModal
        isOpen={true}
        onClose={vi.fn()}
        campaign={sampleCampaign}
        currency="SAR"
      />,
    );

    const financeTabBtn = screen.getByRole("tab", { name: /الجدوى المالية وهامش الربح/i });
    await user.click(financeTabBtn);

    expect(screen.getByText("السعر الأصلي")).toBeInTheDocument();
    expect(screen.getByText("سعر العرض المخفض")).toBeInTheDocument();
    expect(screen.getByText("عطر فاخر")).toBeInTheDocument();
    expect(screen.getByText("بخور طبيعي")).toBeInTheDocument();
  });

  it("calls onClose when escape key is pressed", () => {
    const handleClose = vi.fn();

    render(
      <CampaignDetailsModal
        isOpen={true}
        onClose={handleClose}
        campaign={sampleCampaign}
      />,
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handleClose).toHaveBeenCalled();
  });
});
