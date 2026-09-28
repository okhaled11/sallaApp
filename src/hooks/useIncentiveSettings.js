import { useCallback, useEffect, useState } from "react";
import { createDefaultSettings } from "../components/Incentives/incentiveDefaults.js";

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

function loadSettings() {
  const defaults = createDefaultSettings();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? mergeSettings(defaults, JSON.parse(raw)) : defaults;
  } catch {
    // Blocked or corrupt storage: fall back to defaults
    return defaults;
  }
}

/**
 * useIncentiveSettings - Cart incentive settings, kept in this browser
 * (localStorage) for now.
 *
 * @returns {{ settings: object, updateSection: function, resetSettings: function }}
 */
export function useIncentiveSettings() {
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable: settings still work for this session */
    }
  }, [settings]);

  const updateSection = useCallback((section, patch) => {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...patch },
    }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(createDefaultSettings());
  }, []);

  return { settings, updateSection, resetSettings };
}
