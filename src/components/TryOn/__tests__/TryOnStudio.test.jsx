import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const fetchTryOnItems = vi.fn();
const publishTryOnItems = vi.fn();
vi.mock("../../../utils/tryOnApi.js", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchTryOnItems: (...a) => fetchTryOnItems(...a),
  publishTryOnItems: (...a) => publishTryOnItems(...a),
}));

import TryOnStudio from "../TryOnStudio.jsx";

const products = [
  { id: 1, name: "نظارة شمسية", image: null },
  { id: 2, name: "حقيبة جلد", image: null },
];
const published = {
  productId: "1",
  name: "نظارة شمسية",
  image: "data:image/png;base64,AAAA",
  scale: 2.1,
  offsetY: 0,
  enabled: true,
};

describe("TryOnStudio", () => {
  beforeEach(() => {
    fetchTryOnItems.mockReset();
    publishTryOnItems.mockReset();
    fetchTryOnItems.mockResolvedValue({ success: true, items: [published] });
  });

  it("marks products that already have try-on enabled", async () => {
    render(<TryOnStudio products={products} token="t" storeId="42" />);
    await waitFor(() => expect(screen.getByText("مفعّل")).toBeInTheDocument());
    expect(fetchTryOnItems).toHaveBeenCalledWith("42");
  });

  it("filters the product list by search", async () => {
    const user = userEvent.setup();
    render(<TryOnStudio products={products} token="t" storeId="42" />);
    await user.type(screen.getByPlaceholderText("ابحث عن منتج..."), "حقيبة");
    expect(screen.queryByText("نظارة شمسية")).not.toBeInTheDocument();
    expect(screen.getByText("حقيبة جلد")).toBeInTheDocument();
  });

  it("shows the tuner for a configured product and publishes changes", async () => {
    const user = userEvent.setup();
    publishTryOnItems.mockResolvedValue({ success: true, persisted: true });
    const onShowToast = vi.fn();
    render(<TryOnStudio products={products} token="t" storeId="42" onShowToast={onShowToast} />);
    await waitFor(() => expect(screen.getByText("مفعّل")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: "حفظ ونشر" })).toBeDisabled();
    await user.click(screen.getByText("نظارة شمسية"));
    await user.click(screen.getByRole("button", { name: "إيقاف التجربة لهذا المنتج" }));
    await user.click(screen.getByRole("button", { name: "حفظ ونشر" }));

    await waitFor(() =>
      expect(publishTryOnItems).toHaveBeenCalledWith({ token: "t", storeId: "42", items: [] }),
    );
    expect(onShowToast).toHaveBeenCalledWith("تم نشر التجربة الافتراضية في متجرك", "success");
  });

  it("explains when the store id is unknown and disables publishing", async () => {
    render(<TryOnStudio products={products} token="t" storeId={null} />);
    expect(screen.getByText(/تعذر تحديد معرّف المتجر/)).toBeInTheDocument();
    expect(fetchTryOnItems).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "حفظ ونشر" })).toBeDisabled();
  });

  describe("product types", () => {
    const openProduct = async (user, name) => {
      render(<TryOnStudio products={products} token="t" storeId="42" onShowToast={vi.fn()} />);
      await waitFor(() => expect(fetchTryOnItems).toHaveBeenCalled());
      await user.click(screen.getByText(name));
    };

    it("offers all product types including automatic virtual makeup", async () => {
      const user = userEvent.setup();
      await openProduct(user, "حقيبة جلد");
      const select = screen.getByLabelText("نوع المنتج");
      const labels = Array.from(select.querySelectorAll("option")).map((o) => o.textContent);
      expect(labels).toEqual([
        "نظارات",
        "أقراط / حلق",
        "قبعة / كاب / إيشارب راس",
        "سلسلة / عقد",
        "أحمر شفاه",
        "أحمر خدود / بلاشر",
        "ظلال عيون / آيشادو",
        "آيلاينر / محدد عيون",
      ]);
    });

    it("treats a saved item without a type as glasses", async () => {
      const user = userEvent.setup();
      render(<TryOnStudio products={products} token="t" storeId="42" />);
      await waitFor(() => expect(screen.getByText("مفعّل")).toBeInTheDocument());
      await user.click(screen.getByText("نظارة شمسية"));
      expect(screen.getByLabelText("نوع المنتج")).toHaveValue("glasses");
    });

    it("activates lipstick without an image and publishes its colour options", async () => {
      const user = userEvent.setup();
      publishTryOnItems.mockResolvedValue({ success: true, persisted: true });
      await openProduct(user, "حقيبة جلد");
      await user.selectOptions(screen.getByLabelText("نوع المنتج"), "lipstick");
      await user.click(screen.getByRole("button", { name: "تفعيل أحمر الشفاه لهذا المنتج" }));

      expect(screen.getByLabelText("لون الأحمر")).toHaveValue("#c2185b");
      await user.click(screen.getByRole("button", { name: "حفظ ونشر" }));

      await waitFor(() => expect(publishTryOnItems).toHaveBeenCalled());
      const sent = publishTryOnItems.mock.calls[0][0].items;
      expect(sent).toHaveLength(2);
      expect(sent[1]).toMatchObject({
        productId: "2",
        type: "lipstick",
        image: "",
        color: "#c2185b",
        opacity: 0.7,
        finish: "matte",
      });
    });

    it("blocks publishing when an image type has no image yet", async () => {
      const user = userEvent.setup();
      await openProduct(user, "نظارة شمسية");
      await waitFor(() => expect(screen.getByLabelText("نوع المنتج")).toHaveValue("glasses"));
      // Lipstick (no image) -> back to hat (needs an image): the item is incomplete.
      await user.selectOptions(screen.getByLabelText("نوع المنتج"), "lipstick");
      await user.selectOptions(screen.getByLabelText("نوع المنتج"), "hat");

      expect(screen.getByText(/بحاجة لرفع صورة قبل النشر/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "حفظ ونشر" })).toBeDisabled();
    });

    it("shows earrings-only controls", async () => {
      const user = userEvent.setup();
      await openProduct(user, "نظارة شمسية");
      expect(screen.queryByText("عكس الصورة للأذن الأخرى")).not.toBeInTheDocument();
      await user.selectOptions(screen.getByLabelText("نوع المنتج"), "earrings");
      expect(screen.getByText("عكس الصورة للأذن الأخرى")).toBeInTheDocument();
      expect(screen.getByText(/البعد عن الأذن/)).toBeInTheDocument();
    });
  });
});
