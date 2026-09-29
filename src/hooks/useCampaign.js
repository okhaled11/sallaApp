import { useCallback, useEffect, useState } from "react";
import { campaignRequest } from "../utils/productsApi.js";

/**
 * useCampaign - The store's promo popup campaign (saved in App Settings).
 *
 * @param {string|null} token - Embedded token
 * @param {boolean} enabled - Load once the app is ready
 * @returns {{ campaign: object|null, isLoading: boolean, isSaving: boolean,
 *   error: string|null, publish: function, stop: function }}
 */
export function useCampaign(token, enabled = true) {
  const [campaign, setCampaign] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !token) return;
    let cancelled = false;
    setIsLoading(true);
    campaignRequest(token, "get").then((result) => {
      if (cancelled) return;
      if (result.success) setCampaign(result.data?.campaign ?? null);
      else setError(result.error || "Failed to load the campaign");
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token, enabled]);

  const run = useCallback(
    async (action, draft) => {
      if (!token) return { success: false, error: "No token" };
      setIsSaving(true);
      setError(null);
      const result = await campaignRequest(token, action, draft);
      setIsSaving(false);
      if (result.success) {
        setCampaign(result.data?.campaign ?? null);
        return { success: true };
      }
      const message = result.error || "Something went wrong";
      setError(message);
      return { success: false, error: message };
    },
    [token],
  );

  const publish = useCallback((draft) => run("save", draft), [run]);
  const stop = useCallback(() => run("stop"), [run]);

  return { campaign, isLoading, isSaving, error, publish, stop };
}
