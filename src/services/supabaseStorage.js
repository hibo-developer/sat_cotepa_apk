import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

function esPlataformaNativa() {
  return Capacitor.isNativePlatform();
}

export const authStorageSupabase = {
  async getItem(key) {
    if (esPlataformaNativa()) {
      const { value } = await Preferences.get({ key });
      return value ?? null;
    }

    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  async setItem(key, value) {
    if (esPlataformaNativa()) {
      await Preferences.set({ key, value });
      return;
    }

    try {
      window.localStorage.setItem(key, value);
    } catch {}
  },

  async removeItem(key) {
    if (esPlataformaNativa()) {
      await Preferences.remove({ key });
      return;
    }

    try {
      window.localStorage.removeItem(key);
    } catch {}
  },
};

export async function limpiarStorageAuthSupabase() {
  if (esPlataformaNativa()) {
    try {
      const { keys } = await Preferences.keys();
      const clavesAuth = keys.filter((key) => key.startsWith('sb-') || key.includes('supabase'));
      await Promise.all(clavesAuth.map((key) => Preferences.remove({ key })));
    } catch {}
    return;
  }

  try {
    const claves = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
        claves.push(key);
      }
    }
    claves.forEach((key) => window.localStorage.removeItem(key));
  } catch {}
}
