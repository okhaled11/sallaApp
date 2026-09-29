import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("../../utils/productsApi.js", () => ({
  campaignRequest: vi.fn(),
}));

import { useCampaign } from "../useCampaign.js";
import { campaignRequest } from "../../utils/productsApi.js";

describe("useCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not load before the app is ready", () => {
    renderHook(() => useCampaign("tok", false));
    expect(campaignRequest).not.toHaveBeenCalled();
  });

  it("loads the saved campaign", async () => {
    campaignRequest.mockResolvedValue({
      success: true,
      data: { campaign: { enabled: true } },
    });
    const { result } = renderHook(() => useCampaign("tok", true));
    await waitFor(() =>
      expect(result.current.campaign).toEqual({ enabled: true }),
    );
    expect(campaignRequest).toHaveBeenCalledWith("tok", "get");
    expect(result.current.isLoading).toBe(false);
  });

  it("publishes and stops", async () => {
    campaignRequest.mockResolvedValue({
      success: true,
      data: { campaign: null },
    });
    const { result } = renderHook(() => useCampaign("tok", true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    campaignRequest.mockResolvedValue({
      success: true,
      data: { campaign: { enabled: true, discountPercent: 30 } },
    });
    let outcome;
    await act(async () => {
      outcome = await result.current.publish({ discountPercent: 30 });
    });
    expect(outcome).toEqual({ success: true });
    expect(campaignRequest).toHaveBeenLastCalledWith("tok", "save", {
      discountPercent: 30,
    });
    expect(result.current.campaign.discountPercent).toBe(30);

    campaignRequest.mockResolvedValue({
      success: true,
      data: { campaign: { enabled: false } },
    });
    await act(async () => {
      await result.current.stop();
    });
    expect(campaignRequest).toHaveBeenLastCalledWith("tok", "stop", undefined);
    expect(result.current.campaign.enabled).toBe(false);
  });

  it("exposes errors", async () => {
    campaignRequest.mockResolvedValue({
      success: true,
      data: { campaign: null },
    });
    const { result } = renderHook(() => useCampaign("tok", true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    campaignRequest.mockResolvedValue({
      success: false,
      error: "Missing scope",
    });
    let outcome;
    await act(async () => {
      outcome = await result.current.publish({});
    });
    expect(outcome).toEqual({ success: false, error: "Missing scope" });
    expect(result.current.error).toBe("Missing scope");
  });
});
