import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SeoCopyModal from "../SeoCopyModal.jsx";

const sampleOpportunity = {
  id: "seo_1",
  product: { id: 10, name: "عطر الورد الملكي" },
  copyData: {
    hookTitle: "عطر الورد الملكي: فخامة تدوم طويلاً",
    marketingDescription: "عطر فاخر مستخلص من أنقى زهور الورد الطبيعي.",
    benefits: ["ثبات يدوم 24 ساعة", "مكونات طبيعية 100%"],
    metaDescription: "تسوق عطر الورد الملكي بخصم حصري وتوصيل سريع.",
    seoKeywords: ["عطر", "ورد", "عطور فاخرة"],
    targetAudience: "عشاق العطور الراقية",
  },
};

describe("SeoCopyModal", () => {
  it("does not render when isOpen is false", () => {
    const { container } = render(
      <SeoCopyModal isOpen={false} opportunity={sampleOpportunity} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders generated copy fields properly when open", () => {
    render(<SeoCopyModal isOpen={true} opportunity={sampleOpportunity} />);

    expect(screen.getByText("عطر الورد الملكي: فخامة تدوم طويلاً")).toBeInTheDocument();
    expect(screen.getByText("عطر فاخر مستخلص من أنقى زهور الورد الطبيعي.")).toBeInTheDocument();
    expect(screen.getByText("ثبات يدوم 24 ساعة")).toBeInTheDocument();
    expect(screen.getByText("#عطور فاخرة")).toBeInTheDocument();
  });

  it("calls onClose when clicking close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <SeoCopyModal
        isOpen={true}
        opportunity={sampleOpportunity}
        onClose={onClose}
      />,
    );

    const closeBtn = screen.getByRole("button", { name: "إغلاق" });
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("copies content to clipboard and changes button state", async () => {
    const user = userEvent.setup();
    render(<SeoCopyModal isOpen={true} opportunity={sampleOpportunity} />);

    const copyBtn = screen.getByRole("button", { name: /نسخ العنوان/ });
    await user.click(copyBtn);
    expect(screen.getByText("تم النسخ!")).toBeInTheDocument();
  });
});
