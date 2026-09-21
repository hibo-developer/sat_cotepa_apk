export const authStorageSupabase = {
  async getItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  async setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {}
  },

  async removeItem(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {}
  },
};

export async function limpiarStorageAuthSupabase() {
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
