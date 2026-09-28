import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IncentivePreview from "../IncentivePreview.jsx";
import { createDefaultSettings } from "../incentiveDefaults.js";

function renderPreview(overrides = {}) {
  const settings = createDefaultSettings();
  for (const [section, patch] of Object.entries(overrides)) {
    settings[section] = { ...settings[section], ...patch };
  }
  return render(<IncentivePreview settings={settings} />);
}

describe("IncentivePreview", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the cart total and how much is left for free shipping", () => {
    renderPreview();
    expect(screen.getByText("155 ر.س")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "155",
    );
  });

  it("fills the bar when add-ons are added and resets", async () => {
    renderPreview();
    await userEvent.click(screen.getByRole("button", { name: /علبة هدية/ }));
    expect(screen.getByText("195 ر.س")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /بخور معطر/ }));
    expect(screen.getByText("220 ر.س")).toBeInTheDocument();
    expect(
      screen.getByText("مبروك! طلبك مؤهل للشحن المجاني"),
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "200",
    );

    await userEvent.click(screen.getByRole("button", { name: "إعادة" }));
    expect(screen.getByText("155 ر.س")).toBeInTheDocument();
  });

  it("uses the configured free shipping threshold", () => {
    renderPreview({ freeShipping: { threshold: 300 } });
    expect(screen.getByText("145")).toBeInTheDocument();
    expect(screen.getByText("300 ر.س")).toBeInTheDocument();
  });

  it("hides disabled incentives", () => {
    renderPreview({
      freeShipping: { enabled: false },
      countdown: { enabled: false },
      coupon: { enabled: false },
      lowStock: { enabled: false },
    });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/ينتهي العرض/)).not.toBeInTheDocument();
    expect(screen.queryByText("ZAWWID10")).not.toBeInTheDocument();
    expect(screen.queryByText(/قطع بس/)).not.toBeInTheDocument();
  });

  it("ticks the countdown and shows when the offer ended", () => {
    vi.useFakeTimers();
    const now = new Date("2030-01-01T10:00:00Z").getTime();
    vi.setSystemTime(now);

    renderPreview({
      countdown: { endsAt: new Date(now + 3_661_000).toISOString() },
    });
    expect(screen.getByText("01:01:01")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("01:01:00")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3_700_000);
    });
    expect(screen.getByText("انتهى العرض")).toBeInTheDocument();
  });

  it("shows remaining stock only at or below the threshold", () => {
    const { unmount } = renderPreview({ lowStock: { threshold: 5 } });
    expect(screen.getByText("باقي 3 قطع بس من بخور معطر!")).toBeInTheDocument();
    unmount();

    renderPreview({ lowStock: { threshold: 2 } });
    expect(screen.queryByText(/قطع بس/)).not.toBeInTheDocument();
  });

  it("copies the coupon code", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    renderPreview();

    await user.click(screen.getByRole("button", { name: "ZAWWID10" }));

    expect(writeText).toHaveBeenCalledWith("ZAWWID10");
    expect(screen.getByText("تم النسخ")).toBeInTheDocument();
  });

  it("shows a closable floating coupon in popup mode", async () => {
    renderPreview({ coupon: { display: "popup" } });
    expect(screen.getByText("ZAWWID10")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "إغلاق" }));
    expect(screen.queryByText("ZAWWID10")).not.toBeInTheDocument();
  });
});
