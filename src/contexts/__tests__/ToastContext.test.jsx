import { describe, it, expect, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "../ToastContext.jsx";
import { embedded } from "@salla.sa/embedded-sdk";

vi.mock("@salla.sa/embedded-sdk", () => ({
  embedded: {
    ui: {
      toast: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
      },
    },
  },
}));

function TestConsumer() {
  const { toasts, showToast, removeToast } = useToast();
  return (
    <div>
      <button type="button" onClick={() => showToast("Hello", "info")}>
        Show
      </button>
      <button
        type="button"
        onClick={() => toasts[0] && removeToast(toasts[0].id)}
      >
        Remove first
      </button>
      <ul data-testid="toasts">
        {toasts.map((t) => (
          <li key={t.id} data-testid={`toast-${t.id}`}>
            {t.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

describe("ToastContext", () => {
  it("showToast adds a toast and renders it", async () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getAllByText("Hello").length).toBeGreaterThan(0);
  });

  it("removeToast removes the toast", async () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getAllByText("Hello").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Remove first" }));
    expect(screen.queryAllByText("Hello")).toHaveLength(0);
  });

  it("auto-removes toast after 3 seconds", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(screen.getAllByText("Hello").length).toBeGreaterThan(0);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryAllByText("Hello")).toHaveLength(0);
    vi.useRealTimers();
  });

  it("useToast throws when used outside ToastProvider", () => {
    expect(() => render(<TestConsumer />)).toThrow(
      "useToast must be used within ToastProvider",
    );
  });

  describe("inside the Salla dashboard", () => {
    function HostConsumer({ type }) {
      const { toasts, showToast } = useToast();
      return (
        <>
          <button type="button" onClick={() => showToast("Saved", type)}>
            Show
          </button>
          <span data-testid="local-count">{toasts.length}</span>
        </>
      );
    }

    function renderInIframe(type) {
      const spy = vi.spyOn(window, "parent", "get").mockReturnValue({});
      render(
        <ToastProvider>
          <HostConsumer type={type} />
        </ToastProvider>,
      );
      return spy;
    }

    it("uses the dashboard's native toast (embedded.ui.toast)", async () => {
      const spy = renderInIframe("success");
      try {
        await userEvent.click(screen.getByRole("button", { name: "Show" }));
        expect(embedded.ui.toast.success).toHaveBeenCalledWith("Saved");
        expect(screen.getByTestId("local-count")).toHaveTextContent("0");
      } finally {
        spy.mockRestore();
      }
    });

    it("maps unknown types to info", async () => {
      const spy = renderInIframe("weird");
      try {
        await userEvent.click(screen.getByRole("button", { name: "Show" }));
        expect(embedded.ui.toast.info).toHaveBeenCalledWith("Saved");
      } finally {
        spy.mockRestore();
      }
    });
  });
});
