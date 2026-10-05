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
});
