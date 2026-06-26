import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { Preferences } from '@capacitor/preferences';

export type AppNavegacion = 'waze' | 'google' | 'sygic' | 'system';

const NAV_PREF_KEY = 'nav_app_pref';
const APPS_VALIDAS: AppNavegacion[] = ['waze', 'google', 'sygic', 'system'];

function esAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function esDesktopOWeb(): boolean {
  if (typeof window !== 'undefined' && window.process?.versions?.electron) {
    return true;
  }
  return !esAndroid();
}

function normalizarDireccion(direccion: string | null | undefined): string {
  return String(direccion || '').trim();
}

function resolverDestino(lat: number | null | undefined, lng: number | null | undefined, direccion: string) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  const tieneCoords =
    Number.isFinite(latNum)
    && Number.isFinite(lngNum)
    && !(latNum === 0 && lngNum === 0);

  return {
    lat: tieneCoords ? latNum : null,
    lng: tieneCoords ? lngNum : null,
    direccion: normalizarDireccion(direccion),
  };
}

function construirUrls(
  lat: number | null,
  lng: number | null,
  direccion: string,
  app: AppNavegacion,
): { native: string; web: string } {
  const destino = resolverDestino(lat, lng, direccion);
  const direccionEncoded = encodeURIComponent(destino.direccion);
  const tieneCoords = destino.lat != null && destino.lng != null;

  if (app === 'waze') {
    if (tieneCoords) {
      return {
        native: `waze://?ll=${destino.lat},${destino.lng}&navigate=yes`,
        web: `https://waze.com/ul?ll=${destino.lat},${destino.lng}&navigate=yes`,
      };
    }
    return {
      native: `waze://?q=${direccionEncoded}&navigate=yes`,
      web: `https://waze.com/ul?q=${direccionEncoded}&navigate=yes`,
    };
  }

  if (app === 'google') {
    if (tieneCoords) {
      return {
        native: `comgooglemaps://?daddr=${destino.lat},${destino.lng}&directionsmode=driving`,
        web: `https://www.google.com/maps/dir/?api=1&destination=${destino.lat},${destino.lng}`,
      };
    }
    return {
      native: `comgooglemaps://?q=${direccionEncoded}&directionsmode=driving`,
      web: `https://www.google.com/maps?q=${direccionEncoded}`,
    };
  }

  if (app === 'sygic') {
    if (tieneCoords) {
      return {
        native: `com.sygic.aura://coordinate|${destino.lng}|${destino.lat}|drive`,
        web: `https://maps.sygic.com/?start=0,0&end=${destino.lat},${destino.lng}`,
      };
    }
    return {
      native: `com.sygic.aura://search?q=${direccionEncoded}`,
      web: `https://maps.sygic.com/?q=${direccionEncoded}`,
    };
  }

  if (tieneCoords) {
    const q = encodeURIComponent(`${destino.lat},${destino.lng}(${destino.direccion})`);
    return {
      native: `geo:${destino.lat},${destino.lng}?q=${q}`,
      web: `https://www.google.com/maps?q=${destino.lat},${destino.lng}`,
    };
  }

  return {
    native: `geo:0,0?q=${direccionEncoded}`,
    web: `https://www.google.com/maps?q=${direccionEncoded}`,
  };
}

export async function getAppsNavegacionDisponibles(): Promise<AppNavegacion[]> {
  if (esDesktopOWeb()) {
    return ['google', 'waze', 'system'];
  }

  if (!esAndroid()) {
    return ['system'];
  }

  const candidatas: Array<{ app: AppNavegacion; url: string }> = [
    { app: 'waze', url: 'waze://' },
    { app: 'google', url: 'comgooglemaps://' },
    { app: 'sygic', url: 'com.sygic.aura://' },
  ];

  const disponibles: AppNavegacion[] = [];

  for (const candidata of candidatas) {
    try {
      const respuesta = await AppLauncher.canOpenUrl({ url: candidata.url });
      if (respuesta.value) {
        disponibles.push(candidata.app);
      }
    } catch {
      // Ignorar detecciones fallidas y continuar con el resto.
    }
  }

  disponibles.push('system');
  return disponibles;
}

export async function navegarA(
  lat: number | null,
  lng: number | null,
  direccion: string,
  app: AppNavegacion,
) {
  const urls = construirUrls(lat, lng, direccion, app);

  if (esDesktopOWeb()) {
    window.open(urls.web, '_blank', 'noopener,noreferrer');
    return;
  }

  try {
    await AppLauncher.openUrl({ url: urls.native });
  } catch {
    if (app === 'system') {
      throw new Error('No se pudo abrir la navegación del sistema.');
    }
    await AppLauncher.openUrl({ url: urls.web });
  }
}

export async function guardarPreferenciaNav(app: AppNavegacion) {
  await Preferences.set({
    key: NAV_PREF_KEY,
    value: app,
  });
}

export async function getPreferenciaNav(): Promise<AppNavegacion | null> {
  const { value } = await Preferences.get({ key: NAV_PREF_KEY });
  return APPS_VALIDAS.includes(value as AppNavegacion) ? (value as AppNavegacion) : null;
}
