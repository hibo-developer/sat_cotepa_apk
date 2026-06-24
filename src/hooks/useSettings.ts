/**
 * useSettings.ts
 * Hook para gestionar ajustes de la aplicación.
 */

import { useState, useEffect } from 'react';

export interface AppSettings {
  grabarAudioDictado: boolean;
}

const SETTINGS_KEY = 'sat_settings';
const DEFAULT_SETTINGS: AppSettings = {
  grabarAudioDictado: true,
};

export function useSettings(): [AppSettings, (settings: Partial<AppSettings>) => void] {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {
      // Ignorar errores de parseo
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  return [settings, updateSettings];
}

export function getSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // Ignorar
  }
  return DEFAULT_SETTINGS;
}
