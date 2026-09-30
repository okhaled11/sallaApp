import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VisitorIncentivesStudio from "../VisitorIncentivesStudio.jsx";
import { generateMockFrequentVisitors } from "../../../utils/visitorIncentives.js";

const mockProducts = [
  { id: 1, name: "عطر مروان الملكي", price: 320 },
  { id: 2, name: "عود كمبودي معتق", price: 540 },
];

describe("VisitorIncentivesStudio", () => {
  it("renders the hero card and empty state by default when no visitors are stored", () => {
    render(
      <VisitorIncentivesStudio products={mockProducts} initialVisitors={[]} />,
    );

    expect(
      screen.getByText(/تحويل الزوار المترددين إلى مشترين حقيقيين/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/لا توجد زيارات مسجلة بعد في متجرك/i),
    ).toBeInTheDocument();
  });

  it("filters visitors using search input when visitors are present", async () => {
    const user = userEvent.setup();
    const sampleVisitors = generateMockFrequentVisitors(mockProducts);

    render(
      <VisitorIncentivesStudio
        products={mockProducts}
        initialVisitors={sampleVisitors}
      />,
    );

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

  it("displays the Ably Realtime presence channel and filters online visitors", async () => {
    const user = userEvent.setup();
    const sampleVisitors = generateMockFrequentVisitors(mockProducts);
    render(
      <VisitorIncentivesStudio
        products={mockProducts}
        initialVisitors={sampleVisitors}
      />,
    );

    // Channel presence indicator
    expect(screen.getByText(/قناة الربط الحي/i)).toBeInTheDocument();
    expect(screen.getByTitle(/قناة Ably Presence/i)).toBeInTheDocument();

    // Click online filter
    const onlineFilterBtn = screen.getByRole("button", {
      name: /متصل الآن/i,
    });
    await user.click(onlineFilterBtn);

    // Online indicators should be visible
    expect(screen.getAllByText(/متصل الآن/i).length).toBeGreaterThan(0);
  });

  it("clears visitors when clicking the clear log button", async () => {
    const user = userEvent.setup();
    const sampleVisitors = generateMockFrequentVisitors(mockProducts);
    const handleToast = vi.fn();

    render(
      <VisitorIncentivesStudio
        products={mockProducts}
        initialVisitors={sampleVisitors}
        onShowToast={handleToast}
      />,
    );

    const clearBtn = screen.getByRole("button", { name: /مسح السجل/i });
    await user.click(clearBtn);

    expect(handleToast).toHaveBeenCalledWith(
      expect.stringContaining("تم مسح سجل الزيارات"),
      "info",
    );
    expect(
      screen.getByText(/لا توجد زيارات مسجلة بعد في متجرك/i),
    ).toBeInTheDocument();
  });

  it("allows merchant to customize snippet text and design from the dashboard and save", async () => {
    const user = userEvent.setup();
    const handleToast = vi.fn();

    render(
      <VisitorIncentivesStudio
        products={mockProducts}
        onShowToast={handleToast}
      />,
    );

    const customizerTab = screen.getByRole("tab", {
      name: /شروط الزيارات وتخصيص المودال/i,
    });
    await user.click(customizerTab);

    // Edit headline
    const headlineInput = screen.getByLabelText(/عنوان النافذة/i);
    await user.clear(headlineInput);
    await user.type(headlineInput, "عرض خاص لزائرنا الغالي!");

    // Edit coupon caption
    const captionInput = screen.getByLabelText(/النص التوضيحي فوق كود الخصم/i);
    await user.clear(captionInput);
    await user.type(captionInput, "استخدم الكود عند الدفع:");

    // Edit coupon code
    const couponInput = screen.getByLabelText(/كود الخصم في متجر سلة/i);
    await user.clear(couponInput);
    await user.type(couponInput, "VIP50");

    // Select a Hugeicon (e.g. flash icon for "عرض سريع")
    const flashIconBtn = screen.getByRole("button", {
      name: /عرض سريع/i,
    });
    await user.click(flashIconBtn);

    // Select a preset color palette chip (e.g. بنفسجي فاخر)
    const violetChip = screen.getByRole("button", { name: /بنفسجي فاخر/i });
    await user.click(violetChip);

    // Click Save Settings button
    const saveBtn = screen.getByRole("button", {
      name: /حفظ التعديلات وتحديث المتجر/i,
    });
    await user.click(saveBtn);

    expect(handleToast).toHaveBeenCalledWith(
      expect.stringContaining("تم حفظ إعدادات التصميم والنصوص"),
      "success",
    );

    // Live preview should reflect the new customized headline and caption
    expect(screen.getByText("عرض خاص لزائرنا الغالي!")).toBeInTheDocument();
    expect(screen.getByText("استخدم الكود عند الدفع:")).toBeInTheDocument();
  });
});
