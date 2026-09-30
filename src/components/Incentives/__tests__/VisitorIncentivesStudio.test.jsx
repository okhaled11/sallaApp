import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VisitorIncentivesStudio from "../VisitorIncentivesStudio.jsx";

const mockProducts = [
  { id: 1, name: "عطر مروان الملكي", price: 320 },
  { id: 2, name: "عود كمبودي معتق", price: 540 },
];

describe("VisitorIncentivesStudio", () => {
  it("renders the hero card and initial visitors table", () => {
    render(<VisitorIncentivesStudio products={mockProducts} />);

    expect(
      screen.getByText(/تحويل الزوار المترددين إلى مشترين حقيقيين/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/عبدالله الشمري/i)).toBeInTheDocument();
    expect(screen.getByText(/سجل الزوار المترددين/i)).toBeInTheDocument();
  });

  it("filters visitors using search input", async () => {
    const user = userEvent.setup();
    render(<VisitorIncentivesStudio products={mockProducts} />);

    const searchInput = screen.getByPlaceholderText(/بحث بالاسم أو المدينة/i);
    await user.type(searchInput, "جدة");

    expect(screen.getByText(/جدة/i)).toBeInTheDocument();
  });

  it("switches to the customizer sub-tab", async () => {
    const user = userEvent.setup();
    render(<VisitorIncentivesStudio products={mockProducts} />);

    const customizerTab = screen.getByRole("tab", {
      name: /شروط الزيارات وتخصيص المودال/i,
    });
    await user.click(customizerTab);

    expect(
      screen.getByText(/قواعد التشغيل وتخصيص النافذة المنبثقة/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/عدد مرات الدخول المطلوبة لإظهار الخصم/i),
    ).toBeInTheDocument();
  });

  it("switches to the preview sub-tab and displays the storefront modal", async () => {
    const user = userEvent.setup();
    render(<VisitorIncentivesStudio products={mockProducts} />);

    const previewTab = screen.getByRole("tab", {
      name: /المعاينة الحية ومحاكاة الدخول/i,
    });
    await user.click(previewTab);

    expect(
      screen.getByText(/معاينة مباشرة ومحاكاة دخول العميل/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/سعداء بزيارتك المتكررة لمتجرنا/i),
    ).toBeInTheDocument();
  });

  it("switches to script sub-tab and enables copying", async () => {
    const user = userEvent.setup();
    const handleToast = vi.fn();
    render(
      <VisitorIncentivesStudio
        products={mockProducts}
        onShowToast={handleToast}
      />,
    );

    const scriptTab = screen.getByRole("tab", {
      name: /كود التثبيت في متجر سلة/i,
    });
    await user.click(scriptTab);

    expect(
      screen.getByText(/كود تثبيت الإضافة في واجهة متجر سلة/i),
    ).toBeInTheDocument();

    const copyBtn = screen.getByRole("button", { name: /نسخ كود التتبع/i });
    await user.click(copyBtn);
    expect(handleToast).toHaveBeenCalledWith(
      expect.stringContaining("تم نسخ كود التتبع"),
      "success",
    );
  });
});
