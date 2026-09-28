import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IncentivesDashboard from "../IncentivesDashboard.jsx";

describe("IncentivesDashboard", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the preview and one card per incentive", () => {
    render(<IncentivesDashboard />);
    expect(screen.getByText("Live preview")).toBeInTheDocument();
    for (const title of [
      "Free shipping bar",
      "Countdown",
      "Discount coupon",
      "Remaining stock",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it("updates the preview when the free shipping threshold changes", async () => {
    render(<IncentivesDashboard />);
    const input = screen.getByLabelText("Free shipping from");

    await userEvent.clear(input);
    await userEvent.type(input, "300");

    expect(screen.getByText("145")).toBeInTheDocument();
  });

  it("flags an invalid threshold and keeps the last valid value", async () => {
    render(<IncentivesDashboard />);
    const input = screen.getByLabelText("Free shipping from");

    await userEvent.clear(input);

    expect(screen.getByRole("alert")).toHaveTextContent(/at least 1/);
    expect(screen.getByText("45")).toBeInTheDocument();
  });

  it("turns an incentive off with its switch", async () => {
    render(<IncentivesDashboard />);
    await userEvent.click(
      screen.getByRole("switch", { name: "Enable Free shipping bar" }),
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Free shipping from")).toBeDisabled();
  });

  it("updates the coupon code in upper case", async () => {
    render(<IncentivesDashboard />);
    const input = screen.getByLabelText("Coupon code");

    await userEvent.clear(input);
    await userEvent.type(input, "save 20");

    expect(input).toHaveValue("SAVE20");
    expect(screen.getByRole("button", { name: "SAVE20" })).toBeInTheDocument();
  });

  it("switches the coupon to floating", async () => {
    render(<IncentivesDashboard />);
    await userEvent.click(screen.getByLabelText("Floating"));
    expect(screen.getByRole("button", { name: "إغلاق" })).toBeInTheDocument();
  });

  it("hides remaining stock when the limit is below the item stock", async () => {
    render(<IncentivesDashboard />);
    expect(screen.getByText(/قطع بس/)).toBeInTheDocument();

    const input = screen.getByLabelText("Show when stock is at or below");
    await userEvent.clear(input);
    await userEvent.type(input, "2");

    expect(screen.queryByText(/قطع بس/)).not.toBeInTheDocument();
  });

  it("disables saving outside the Salla dashboard", () => {
    render(<IncentivesDashboard />);
    expect(
      screen.getByRole("button", { name: /Save changes/ }),
    ).toBeDisabled();
  });

  it("saves the changes to the store", async () => {
    const fetchMock = vi.fn(async (_url, options) => ({
      json: async () =>
        options?.method === "POST"
          ? {
              success: true,
              data: { settings: JSON.parse(options.body).settings },
            }
          : { success: true, data: { settings: null } },
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<IncentivesDashboard token="tok" />);
    await userEvent.click(screen.getByRole("button", { name: /Save changes/ }));

    expect(await screen.findByRole("status")).toHaveTextContent(/Saved/);
    expect(screen.getByRole("button", { name: /Saved/ })).toBeDisabled();
    const [, options] = fetchMock.mock.calls.find(
      ([, opts]) => opts?.method === "POST",
    );
    expect(JSON.parse(options.body).token).toBe("tok");

    vi.unstubAllGlobals();
  });

  it("resets all settings", async () => {
    render(<IncentivesDashboard />);
    await userEvent.click(
      screen.getByRole("switch", { name: "Enable Discount coupon" }),
    );
    expect(screen.queryByText("ZAWWID10")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Reset/ }));
    expect(screen.getByText("ZAWWID10")).toBeInTheDocument();
  });
});
