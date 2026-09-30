import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContentEnhancerModal from "../ContentEnhancerModal.jsx";
import { analyzeProductContent } from "../../../utils/contentEngine.js";

describe("ContentEnhancerModal", () => {
  const mockAnalysis = analyzeProductContent({
    id: 10,
    name: "ساعة يد كلاسيكية أنيقة فاخرة",
    image: "https://example.com/watch.jpg",
    sku: "WATCH-001",
    categories: [{ id: 1, name: "إكسسوارات" }],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window.navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    });
  });

  it("renders product name, status and score", () => {
    render(<ContentEnhancerModal analysis={mockAnalysis} onClose={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "ساعة يد كلاسيكية أنيقة فاخرة" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/100\/100/i)).toBeInTheDocument();
    expect(screen.getByText("SKU: WATCH-001")).toBeInTheDocument();
  });

  it("renders Google SERP preview with meta title and path", () => {
    render(<ContentEnhancerModal analysis={mockAnalysis} onClose={vi.fn()} />);

    expect(screen.getByText("معاينة الظهور في بحث Google")).toBeInTheDocument();
    expect(
      screen.getByText(/https:\/\/store\.salla\.sa\/products\//i),
    ).toBeInTheDocument();
  });

  it("copies catchy title and shows toast message", async () => {
    const user = userEvent.setup();
    const showToast = vi.fn();
    const writeSpy = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(window.navigator, "clipboard", {
      value: {
        writeText: writeSpy,
      },
      writable: true,
      configurable: true,
    });

    render(
      <ContentEnhancerModal
        analysis={mockAnalysis}
        onClose={vi.fn()}
        showToast={showToast}
      />,
    );

    const copyBtn = screen.getByRole("button", { name: /نسخ العنوان/i });
    await user.click(copyBtn);

    expect(writeSpy).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "تم النسخ إلى الحافظة بنجاح",
      "success",
    );
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(
      <ContentEnhancerModal analysis={mockAnalysis} onClose={handleClose} />,
    );

    const closeBtn = screen.getByLabelText("إغلاق");
    await user.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
