import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authStorageSupabase, limpiarStorageAuthSupabase } from './supabaseStorage';
import { getPreferenciaNav, guardarPreferenciaNav, navegarA } from './navegacion';

describe('compatibilidad del navegador tras retirar las apps nativas', () => {
  let entries;
  let open;

  beforeEach(() => {
    entries = new Map();
    open = vi.fn();
    vi.stubGlobal('window', {
      open,
      localStorage: {
        getItem: key => entries.get(key) ?? null,
        setItem: (key, value) => entries.set(key, String(value)),
        removeItem: key => entries.delete(key),
        key: index => [...entries.keys()][index] ?? null,
        get length() { return entries.size; },
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reutiliza la sesión existente y limpia solo los datos de autenticación', async () => {
    entries.set('sb-project-auth-token', 'existing-session');
    entries.set('sat_device_instance_id_v1', 'existing-device');
    entries.set('CapacitorStorage.nav_app_pref', 'waze');
    expect(await authStorageSupabase.getItem('sb-project-auth-token')).toBe('existing-session');
    await authStorageSupabase.setItem('sb-project-auth-token', 'renewed-session');
    expect(await authStorageSupabase.getItem('sb-project-auth-token')).toBe('renewed-session');
    await limpiarStorageAuthSupabase();
    expect(entries.has('sb-project-auth-token')).toBe(false);
    expect(entries.get('sat_device_instance_id_v1')).toBe('existing-device');
    expect(await getPreferenciaNav()).toBe('waze');
  });

  it('conserva la preferencia anterior y abre mapas con coordenadas o dirección', async () => {
    entries.set('CapacitorStorage.nav_app_pref', 'waze');
    expect(await getPreferenciaNav()).toBe('waze');
    await guardarPreferenciaNav('google');
    expect(await getPreferenciaNav()).toBe('google');
    await navegarA(40.4, -3.7, '', 'google');
    expect(open).toHaveBeenLastCalledWith('https://www.google.com/maps/dir/?api=1&destination=40.4,-3.7', '_blank', 'noopener,noreferrer');
    await navegarA(null, null, 'Calle Mayor 1, Madrid', 'waze');
    expect(open).toHaveBeenLastCalledWith('https://waze.com/ul?q=Calle%20Mayor%201%2C%20Madrid&navigate=yes', '_blank', 'noopener,noreferrer');
  });
});
