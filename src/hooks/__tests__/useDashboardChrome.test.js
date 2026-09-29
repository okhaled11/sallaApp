import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDashboardChrome } from "../useDashboardChrome.js";

const action = {
  title: "Refresh",
  value: "refresh-products",
  icon: "hgi hgi-stroke hgi-refresh",
};

function makeEmbedded() {
  const listeners = [];
  const unsubscribe = vi.fn();
  return {
    listeners,
    unsubscribe,
    page: { setTitle: vi.fn() },
    nav: {
      setAction: vi.fn(),
      clearAction: vi.fn(),
      onActionClick: vi.fn((cb) => {
        listeners.push(cb);
        return unsubscribe;
      }),
    },
  };
}

describe("useDashboardChrome", () => {
  let embedded;

  beforeEach(() => {
    embedded = makeEmbedded();
  });

  it("does nothing before the app is ready", () => {
    renderHook(() =>
      useDashboardChrome({ embedded, enabled: false, title: "T", action }),
    );
    expect(embedded.page.setTitle).not.toHaveBeenCalled();
    expect(embedded.nav.setAction).not.toHaveBeenCalled();
  });

  it("sets the page title through the SDK", () => {
    renderHook(() =>
      useDashboardChrome({ embedded, enabled: true, title: "Product Sales" }),
    );
    expect(embedded.page.setTitle).toHaveBeenCalledWith("Product Sales");
  });

  it("sets the nav action and calls onAction on its click only", () => {
    const onAction = vi.fn();
    renderHook(() =>
      useDashboardChrome({
        embedded,
        enabled: true,
        title: "T",
        action,
        onAction,
      }),
    );

    expect(embedded.nav.setAction).toHaveBeenCalledWith({
      ...action,
      disabled: false,
    });

    embedded.listeners[0]("something-else");
    expect(onAction).not.toHaveBeenCalled();
    embedded.listeners[0]("refresh-products");
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("uses the latest onAction without re-registering", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ onAction }) =>
        useDashboardChrome({ embedded, enabled: true, action, onAction }),
      { initialProps: { onAction: first } },
    );
    rerender({ onAction: second });

    embedded.listeners[0]("refresh-products");
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    expect(embedded.nav.setAction).toHaveBeenCalledTimes(1);
  });

  it("updates the action when it is disabled", () => {
    const { rerender } = renderHook(
      ({ disabled }) =>
        useDashboardChrome({
          embedded,
          enabled: true,
          action: { ...action, disabled },
        }),
      { initialProps: { disabled: false } },
    );
    rerender({ disabled: true });
    expect(embedded.nav.setAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: true }),
    );
  });

  it("clears the action and unsubscribes on unmount", () => {
    const { unmount } = renderHook(() =>
      useDashboardChrome({ embedded, enabled: true, action }),
    );
    unmount();
    expect(embedded.unsubscribe).toHaveBeenCalled();
    expect(embedded.nav.clearAction).toHaveBeenCalled();
  });
});
