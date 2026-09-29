import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OpportunityCard from "../OpportunityCard.jsx";
import { OPPORTUNITY_TYPES } from "../../../utils/copilotEngine.js";

const sampleProduct = {
  id: 1,
  name: "ساعة فاخرة",
  price: 200,
  soldQuantity: 15,
  quantity: 20,
  mainImage: "https://example.com/watch.jpg",
  category: "إكسسوارات",
};

describe("OpportunityCard", () => {
  it("renders null if opportunity is not provided", () => {
    const { container } = render(<OpportunityCard opportunity={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders opportunity details and applies price update on click", async () => {
    const user = userEvent.setup();
    const onApplyPrice = vi.fn().mockResolvedValue({ success: true });
    const onDismiss = vi.fn();

    const opp = {
      id: "price_opt_1",
      type: OPPORTUNITY_TYPES.PRICE_OPTIMIZATION,
      badge: "فرصة تعظيم الأرباح",
      priority: "high",
      product: sampleProduct,
      currentPrice: 200,
      suggestedPrice: 212,
      priceDiff: 12,
      projectedGain: 144,
      rationale: "المنتج عليه طلب مرتفع وسعره يسمح برفع هامشي",
      actionType: "update_price",
      actionLabel: "تطبيق السعر المقترح (212 ر.س)",
    };

    render(
      <OpportunityCard
        opportunity={opp}
        onApplyPrice={onApplyPrice}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText("ساعة فاخرة")).toBeInTheDocument();
    expect(screen.getByText("فرصة تعظيم الأرباح")).toBeInTheDocument();
    expect(screen.getByText(/عائد متوقع: \+144/)).toBeInTheDocument();

    const applyBtn = screen.getByRole("button", {
      name: /تطبيق السعر المقترح/,
    });
    await user.click(applyBtn);

    expect(onApplyPrice).toHaveBeenCalledWith(1, 212);

    const dismissBtn = screen.getByRole("button", { name: /تخطي/ });
    await user.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledWith("price_opt_1");
  });

  it("triggers SEO modal open when clicking preview_copy button", async () => {
    const user = userEvent.setup();
    const onOpenSeoModal = vi.fn();

    const opp = {
      id: "seo_copy_1",
      type: OPPORTUNITY_TYPES.SEO_COPYWRITING,
      badge: "تحسين السيو والوصف الذكي",
      priority: "medium",
      product: sampleProduct,
      rationale: "الوصف الحالي ضعيف",
      actionType: "preview_copy",
      actionLabel: "معاينة ونسخ المحتوى الذكي",
    };

    render(
      <OpportunityCard opportunity={opp} onOpenSeoModal={onOpenSeoModal} />,
    );

    const previewBtn = screen.getByRole("button", {
      name: /معاينة ونسخ المحتوى/,
    });
    await user.click(previewBtn);

    expect(onOpenSeoModal).toHaveBeenCalledWith(opp);
  });
});
