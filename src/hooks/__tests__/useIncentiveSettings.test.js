import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useIncentiveSettings, STORAGE_KEY } from "../useIncentiveSettings.js";
import {
  fetchPublishedIncentives,
  saveIncentives,
} from "../../utils/incentivesApi.js";

vi.mock("../../utils/incentivesApi.js", () => ({
  fetchPublishedIncentives: vi.fn(),
  saveIncentives: vi.fn(),
}));

const PUBLISHED = {
  freeShipping: { enabled: false, threshold: 400 },
  countdown: { enabled: false, endsAt: "2026-10-01T12:00:00.000Z" },
  coupon: { enabled: true, code: "LIVE", text: "", display: "popup" },
  lowStock: { enabled: true, threshold: 3 },
  updatedAt: "2026-09-28T10:00:00.000Z",
};

describe("useIncentiveSettings", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
    fetchPublishedIncentives.mockReset();
    saveIncentives.mockReset();
    fetchPublishedIncentives.mockResolvedValue({
      success: true,
      data: { settings: null },
    });
  });

  it("does not load or save without a token", async () => {
    const { result } = renderHook(() => useIncentiveSettings());
    expect(fetchPublishedIncentives).not.toHaveBeenCalled();

    let outcome;
    await act(async () => {
      outcome = await result.current.save();
    });
    expect(outcome.success).toBe(false);
    expect(saveIncentives).not.toHaveBeenCalled();
  });

  it("starts from the published settings in a fresh browser", async () => {
    fetchPublishedIncentives.mockResolvedValue({
      success: true,
      data: { settings: PUBLISHED },
    });
    const { result } = renderHook(() => useIncentiveSettings("tok"));

    await waitFor(() =>
      expect(result.current.settings.coupon.code).toBe("LIVE"),
    );
    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.updateSection("lowStock", { threshold: 4 });
    });
    expect(result.current.isDirty).toBe(true);
  });

  it("keeps a local draft over the published settings", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ coupon: { code: "DRAFT" } }),
    );
    fetchPublishedIncentives.mockResolvedValue({
      success: true,
      data: { settings: PUBLISHED },
    });
    const { result } = renderHook(() => useIncentiveSettings("tok"));

    await waitFor(() => expect(fetchPublishedIncentives).toHaveBeenCalled());
    expect(result.current.settings.coupon.code).toBe("DRAFT");
    expect(result.current.isDirty).toBe(true);
  });

  it("saves the settings and is clean afterwards", async () => {
    saveIncentives.mockImplementation(async (_token, settings) => ({
      success: true,
      data: { settings: { ...settings, updatedAt: "now" } },
    }));
    const { result } = renderHook(() => useIncentiveSettings("tok"));
    await waitFor(() => expect(fetchPublishedIncentives).toHaveBeenCalled());
    expect(result.current.isDirty).toBe(true);

    let outcome;
    await act(async () => {
      outcome = await result.current.save();
    });

    expect(outcome).toEqual({ success: true });
    expect(saveIncentives).toHaveBeenCalledWith("tok", result.current.settings);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.isSaving).toBe(false);
  });

  it("returns the server error when saving fails", async () => {
    saveIncentives.mockResolvedValue({ success: false, error: "Nope" });
    const { result } = renderHook(() => useIncentiveSettings("tok"));

    let outcome;
    await act(async () => {
      outcome = await result.current.save();
    });
    expect(outcome).toEqual({ success: false, error: "Nope" });
    expect(result.current.isDirty).toBe(true);
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
