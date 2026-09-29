import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CampaignCard from "../CampaignCard.jsx";

describe("CampaignCard", () => {
  const sampleCampaign = {
    id: "clearance-1",
    type: "clearance",
    badgeText: "تصفية مخزون راكد",
    title: "تصفية سريعة: معطر جو",
    description: "تصفية المخزون الراكد لتحرير السيولة",
    urgency: "high",
    products: [{ id: "p1", name: "معطر جو", price: 100 }],
    originalPrice: 100,
    discountedPrice: 75,
    discountPercent: 25,
    savingsAmount: 25,
    estimatedMargin: 0.3,
    unlockedCapital: 1500,
    suggestedCode: "CLEAR25",
    canApplyDirectly: true,
  };

  it("renders campaign title, badge, and financial pills", () => {
    render(<CampaignCard campaign={sampleCampaign} currency="SAR" />);

    expect(screen.getByText("تصفية سريعة: معطر جو")).toBeInTheDocument();
    expect(screen.getByText("تصفية مخزون راكد")).toBeInTheDocument();
    expect(screen.getByText("CLEAR25")).toBeInTheDocument();
    expect(screen.getByText("أولوية مرتفعة")).toBeInTheDocument();
    expect(screen.getByText(/100 SAR/i)).toBeInTheDocument();
    expect(screen.getByText(/75 SAR/i)).toBeInTheDocument();
  });

  it("calls onViewDetails when 'معاينة وتخصيص' button is clicked", async () => {
    const handleView = vi.fn();
    const user = userEvent.setup();

    render(
      <CampaignCard
        campaign={sampleCampaign}
        currency="SAR"
        onViewDetails={handleView}
      />,
    );

    const button = screen.getByRole("button", { name: /معاينة وتخصيص/i });
    await user.click(button);

    expect(handleView).toHaveBeenCalledWith(sampleCampaign);
  });

  it("calls onQuickCopy when 'نسخ الإعلان' button is clicked", async () => {
    const handleCopy = vi.fn();
    const user = userEvent.setup();

    render(
      <CampaignCard
        campaign={sampleCampaign}
        currency="SAR"
        onQuickCopy={handleCopy}
      />,
    );

    const button = screen.getByRole("button", { name: /نسخ الإعلان/i });
    await user.click(button);

    expect(handleCopy).toHaveBeenCalledWith(sampleCampaign);
  });

  it("renders direct apply button and handles click", async () => {
    const handleApply = vi.fn();
    const user = userEvent.setup();

    render(
      <CampaignCard
        campaign={sampleCampaign}
        currency="SAR"
        onApplyToStore={handleApply}
      />,
    );

    const button = screen.getByRole("button", { name: /تطبيق السعر في المتجر/i });
    await user.click(button);

    expect(handleApply).toHaveBeenCalledWith(sampleCampaign);
  });
});
