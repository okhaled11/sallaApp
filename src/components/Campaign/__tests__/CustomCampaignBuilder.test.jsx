import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CustomCampaignBuilder from "../CustomCampaignBuilder.jsx";

describe("CustomCampaignBuilder", () => {
  const sampleProducts = [
    { id: "p1", name: "منتج تجريبي 1", price: 100, cost_price: 50, sku: "SKU1" },
    { id: "p2", name: "منتج تجريبي 2", price: 200, cost_price: 120, sku: "SKU2" },
  ];

  it("renders product chips and form controls", () => {
    render(
      <CustomCampaignBuilder
        products={sampleProducts}
        currency="SAR"
        onSaveCampaign={vi.fn()}
      />,
    );

    expect(screen.getByText(/منشئ العروض والحملات المخصص/i)).toBeInTheDocument();
    expect(screen.getByText("منتج تجريبي 1")).toBeInTheDocument();
    expect(screen.getByText("منتج تجريبي 2")).toBeInTheDocument();
  });

  it("updates simulation when product is selected and saves campaign", async () => {
    const handleSave = vi.fn();
    const user = userEvent.setup();

    render(
      <CustomCampaignBuilder
        products={sampleProducts}
        currency="SAR"
        onSaveCampaign={handleSave}
      />,
    );

    // Click on product 1 chip
    const chip1 = screen.getByText("منتج تجريبي 1");
    await user.click(chip1);

    expect(screen.getByText(/تم اختيار/i)).toBeInTheDocument();

    // Click Save button
    const saveBtn = screen.getByRole("button", {
      name: /حفظ وإضافة إلى العروض النشطة/i,
    });
    await user.click(saveBtn);

    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        originalPrice: 100,
        discountedPrice: 80, // default 20%
        discountPercent: 20,
      }),
    );
  });
});
