import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIncentiveSettings, STORAGE_KEY } from "../useIncentiveSettings.js";

describe("useIncentiveSettings", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("starts with defaults", () => {
    const { result } = renderHook(() => useIncentiveSettings());
    expect(result.current.settings.freeShipping).toEqual({
      enabled: true,
      threshold: 200,
    });
    expect(result.current.settings.coupon.code).toBe("ZAWWID10");
  });

  it("updates a section and saves it to localStorage", () => {
    const { result } = renderHook(() => useIncentiveSettings());

    act(() => {
      result.current.updateSection("freeShipping", { threshold: 350 });
    });

    expect(result.current.settings.freeShipping).toEqual({
      enabled: true,
      threshold: 350,
    });
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(stored.freeShipping.threshold).toBe(350);
  });

  it("loads saved settings and fills in missing fields with defaults", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ coupon: { code: "SAVE20" } }),
    );

    const { result } = renderHook(() => useIncentiveSettings());

    expect(result.current.settings.coupon.code).toBe("SAVE20");
    expect(result.current.settings.coupon.display).toBe("inline");
    expect(result.current.settings.lowStock.threshold).toBe(5);
  });

  it("falls back to defaults when storage is corrupt", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    const { result } = renderHook(() => useIncentiveSettings());
    expect(result.current.settings.freeShipping.threshold).toBe(200);
  });

  it("keeps working when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const { result } = renderHook(() => useIncentiveSettings());
    act(() => {
      result.current.updateSection("lowStock", { threshold: 9 });
    });
    expect(result.current.settings.lowStock.threshold).toBe(9);
  });

  it("resets to defaults", () => {
    const { result } = renderHook(() => useIncentiveSettings());
    act(() => {
      result.current.updateSection("coupon", { enabled: false });
    });
    act(() => {
      result.current.resetSettings();
    });
    expect(result.current.settings.coupon.enabled).toBe(true);
  });
});
