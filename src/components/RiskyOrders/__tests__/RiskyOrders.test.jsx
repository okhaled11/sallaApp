import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RiskyOrders from "../RiskyOrders.jsx";
import { fetchRiskyOrders } from "../../../utils/ordersApi.js";

vi.mock("../../../utils/ordersApi.js", () => ({ fetchRiskyOrders: vi.fn() }));

const order = (id, over = {}) => ({
  id,
  referenceId: 9000 + id,
  createdAt: Date.now() - 3 * 3600 * 1000,
  total: 200,
  currency: "SAR",
  statusSlug: "under_review",
  statusName: "قيد المراجعة",
  paymentMethod: "cod",
  isCod: true,
  isNotShipped: true,
  customerName: `عميل ${id}`,
  phone: `96655000${id}00`,
  city: "الرياض",
  items: [{ name: "فستان", quantity: 1 }],
  totalQuantity: 1,
  score: 0,
  reasons: [],
  ...over,
});

const DATA = {
  orders: [
    order(1, { score: 85, reasons: [{ code: "new_customer", label: "عميل جديد لا توجد له طلبات سابقة", points: 20 }, { code: "bad_phone", label: "رقم الجوال يبدو غير حقيقي أو ناقصاً", points: 20 }] }),
    order(2, { score: 40, reasons: [{ code: "high_value", label: "قيمة الطلب 2.5× المعتاد", points: 12 }] }),
    order(3, { score: 5 }),
    order(4, { score: 90, statusSlug: "delivered", statusName: "تم التوصيل", isNotShipped: false }),
  ],
  cityStats: [{ city: "جدة", closed: 8, returned: 4, canceled: 0, rate: 0.5 }],
  stats: { totalOrders: 20, codOrders: 15, codShare: 0.75, returnRate: 0.1, closedCodOrders: 10, medianCodTotal: 150 },
  windowDays: 60,
  fetched: 20,
  truncated: false,
  generatedAt: Date.now(),
};

const renderPanel = (props = {}) => render(<RiskyOrders token="tok" currency="SAR" {...props} />);
const cards = () => screen.getAllByRole("listitem").filter((li) => li.classList.contains("risk-order"));

describe("RiskyOrders", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchRiskyOrders.mockReset();
    fetchRiskyOrders.mockResolvedValue({ success: true, data: DATA });
  });

  it("shows unshipped orders riskiest first, with the reasons", async () => {
    renderPanel();
    await screen.findByText("عميل 1");
    const list = cards();
    expect(list).toHaveLength(3); // the delivered order is hidden by default
    expect(list[0]).toHaveTextContent("عميل 1");
    expect(list[0]).toHaveTextContent("عميل جديد لا توجد له طلبات سابقة");
    expect(list[0]).toHaveTextContent("اتصل بالعميل وأكّد قبل الشحن");
    expect(list[2]).toHaveTextContent("عميل 3");
  });

  it("counts what needs attention in the KPI cards", async () => {
    renderPanel();
    await screen.findByText("عميل 1");
    expect(screen.getByText("تحتاج اتصالاً الآن").parentElement).toHaveTextContent("1");
    expect(screen.getByText("تحتاج تأكيد واتساب").parentElement).toHaveTextContent("1");
    expect(screen.getByText("نسبة الدفع عند الاستلام").parentElement).toHaveTextContent("75%");
  });

  it("filters by level and can include shipped orders", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("عميل 1");

    await user.click(screen.getByRole("button", { name: "خطر مرتفع" }));
    expect(cards()).toHaveLength(1);

    await user.click(screen.getByRole("checkbox", { name: /لم تُشحن فقط/ }));
    expect(cards()).toHaveLength(2); // the delivered order has a high score too
  });

  it("changes the level with the sensitivity setting", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("عميل 1");
    await user.selectOptions(screen.getByLabelText("الحساسية"), "strict");
    // score 40 is now a high-risk order
    expect(screen.getByText("تحتاج اتصالاً الآن").parentElement).toHaveTextContent("2");
  });

  it("searches by name or phone", async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByText("عميل 1");
    await user.type(screen.getByLabelText("بحث في الطلبات"), "عميل 2");
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toHaveTextContent("عميل 2");
  });

  it("links to a call and a pre-filled WhatsApp message", async () => {
    renderPanel();
    await screen.findByText("عميل 1");
    const first = within(cards()[0]);
    expect(first.getByRole("link", { name: "اتصال" })).toHaveAttribute("href", "tel:+96655000100");
    const wa = first.getByRole("link", { name: "واتساب" });
    expect(wa.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/96655000100\?text=/);
    expect(decodeURIComponent(wa.getAttribute("href"))).toContain("9001");
  });

  it("remembers a confirmed order and stops counting it", async () => {
    const user = userEvent.setup();
    const onShowToast = vi.fn();
    const { unmount } = renderPanel({ onShowToast });
    await screen.findByText("عميل 1");

    await user.click(within(cards()[0]).getByRole("button", { name: "تم التأكيد" }));
    expect(onShowToast).toHaveBeenCalledWith(expect.stringContaining("9001"), "success");
    expect(screen.getByText("تحتاج اتصالاً الآن").parentElement).toHaveTextContent("0");
    expect(cards()[2]).toHaveTextContent("عميل 1"); // sinks to the bottom

    unmount();
    renderPanel();
    await screen.findByText("عميل 1");
    expect(cards()[2]).toHaveTextContent("تم التأكيد");
    expect(within(cards()[2]).getByRole("button", { name: "إلغاء التأكيد" })).toBeInTheDocument();
  });

  it("lists the cities with the most returns", async () => {
    renderPanel();
    await screen.findByText("عميل 1");
    const section = screen.getByLabelText("المدن الأعلى مرتجعات");
    expect(section).toHaveTextContent("جدة");
    expect(section).toHaveTextContent("50%");
  });

  it("shows the server's reason and lets the merchant retry", async () => {
    const user = userEvent.setup();
    fetchRiskyOrders.mockResolvedValueOnce({ success: false, error: "Salla API returned 403 (insufficient scope)" });
    renderPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent("insufficient scope");

    await user.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(screen.getByText("عميل 1")).toBeInTheDocument());
    expect(fetchRiskyOrders).toHaveBeenCalledTimes(2);
  });

  it("explains when there is no dashboard session", async () => {
    renderPanel({ token: null });
    expect(await screen.findByRole("alert")).toHaveTextContent("افتح التطبيق من لوحة تحكم سلة");
    expect(fetchRiskyOrders).not.toHaveBeenCalled();
  });

  it("tells the merchant when nothing is waiting to ship", async () => {
    fetchRiskyOrders.mockResolvedValue({ success: true, data: { ...DATA, orders: [DATA.orders[3]] } });
    renderPanel();
    expect(await screen.findByText(/لا توجد طلبات بانتظار الشحن/)).toBeInTheDocument();
  });
});
