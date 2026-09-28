import { useCallback, useEffect, useMemo, useState } from "react";
import { createDefaultSettings } from "../components/Incentives/incentiveDefaults.js";
import {
  fetchPublishedIncentives,
  saveIncentives,
} from "../utils/incentivesApi.js";

export const STORAGE_KEY = "salla-incentives:v1";

/**
 * Merge stored settings over the defaults, section by section, so new
 * fields added later still get a default value.
 */
function mergeSettings(defaults, stored) {
  if (!stored || typeof stored !== "object") return defaults;
  const merged = {};
  for (const section of Object.keys(defaults)) {
    merged[section] = { ...defaults[section], ...(stored[section] || {}) };
  }
  return merged;
}

function readDraft() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Blocked or corrupt storage: fall back to defaults
    return null;
  }
}

// Same key order on both sides, without server-only fields like updatedAt
const snapshot = (settings) =>
  JSON.stringify(mergeSettings(createDefaultSettings(0), settings));

/**
 * useIncentiveSettings - Cart incentive settings.
 *
 * Edits are a draft kept in this browser (localStorage); `save` publishes
 * them to the server, where the storefront script reads them.
 *
 * @param {string|null} token - Embedded token; loads and saves only when set
 * @returns {{ settings: object, updateSection: function, resetSettings: function, save: function, isSaving: boolean, isDirty: boolean }}
 */
export function useIncentiveSettings(token = null) {
  const [hadDraft] = useState(() => readDraft() !== null);
  const [settings, setSettings] = useState(() =>
    mergeSettings(createDefaultSettings(), readDraft()),
  );
  // Settings live on the storefront: undefined = unknown, null = never saved
  const [published, setPublished] = useState(undefined);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable: settings still work for this session */
    }
  }, [settings]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    fetchPublishedIncentives().then((result) => {
      if (cancelled || !result.success) return;
      const live = result.data?.settings ?? null;
      setPublished(live);
      // A fresh browser starts from what the store shows now
      if (live && !hadDraft) {
        setSettings(mergeSettings(createDefaultSettings(), live));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token, hadDraft]);

  const updateSection = useCallback((section, patch) => {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...patch },
    }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(createDefaultSettings());
  }, []);

  /**
   * Publish the current settings to the storefront.
   *
   * @returns {Promise<{ success: boolean, error?: string }>}
   */
  const save = useCallback(async () => {
    if (!token) return { success: false, error: "No token" };

    setIsSaving(true);
    const sent = settings;
    const result = await saveIncentives(token, sent);
    setIsSaving(false);

    if (!result.success) {
      return { success: false, error: result.error || "Failed to save" };
    }

    const saved = result.data?.settings ?? sent;
    setPublished(saved);
    // Take the server's cleaned-up values unless the merchant kept editing
    setSettings((prev) =>
      prev === sent ? mergeSettings(createDefaultSettings(), saved) : prev,
    );
    return { success: true };
  }, [token, settings]);

  const isDirty = useMemo(
    () => !published || snapshot(settings) !== snapshot(published),
    [settings, published],
  );

  return { settings, updateSection, resetSettings, save, isSaving, isDirty };
}
