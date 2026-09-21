export type AppNavegacion = 'waze' | 'google' | 'sygic' | 'system';

const NAV_PREF_KEY = 'nav_app_pref';
const APPS_VALIDAS: AppNavegacion[] = ['waze', 'google', 'sygic', 'system'];

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
): { web: string } {
  const destino = resolverDestino(lat, lng, direccion);
  const direccionEncoded = encodeURIComponent(destino.direccion);
  const tieneCoords = destino.lat != null && destino.lng != null;

  if (app === 'waze') {
    if (tieneCoords) {
      return {
        web: `https://waze.com/ul?ll=${destino.lat},${destino.lng}&navigate=yes`,
      };
    }
    return {
      web: `https://waze.com/ul?q=${direccionEncoded}&navigate=yes`,
    };
  }

  if (app === 'google') {
    if (tieneCoords) {
      return {
        web: `https://www.google.com/maps/dir/?api=1&destination=${destino.lat},${destino.lng}`,
      };
    }
    return {
      web: `https://www.google.com/maps?q=${direccionEncoded}`,
    };
  }

  if (app === 'sygic') {
    if (tieneCoords) {
      return {
        web: `https://maps.sygic.com/?start=0,0&end=${destino.lat},${destino.lng}`,
      };
    }
    return {
      web: `https://maps.sygic.com/?q=${direccionEncoded}`,
    };
  }

  if (tieneCoords) {
    return {
      web: `https://www.google.com/maps?q=${destino.lat},${destino.lng}`,
    };
  }

  return {
    web: `https://www.google.com/maps?q=${direccionEncoded}`,
  };
}

export async function getAppsNavegacionDisponibles(): Promise<AppNavegacion[]> {
  return ['google', 'waze', 'system'];
}

export async function navegarA(
  lat: number | null,
  lng: number | null,
  direccion: string,
  app: AppNavegacion,
) {
  const urls = construirUrls(lat, lng, direccion, app);

  window.open(urls.web, '_blank', 'noopener,noreferrer');
}

export async function guardarPreferenciaNav(app: AppNavegacion) {
  window.localStorage.setItem(`CapacitorStorage.${NAV_PREF_KEY}`, app);
}

export async function getPreferenciaNav(): Promise<AppNavegacion | null> {
  // Preserve the key used by the former Preferences web adapter.
  const value = window.localStorage.getItem(`CapacitorStorage.${NAV_PREF_KEY}`);
  return APPS_VALIDAS.includes(value as AppNavegacion) ? (value as AppNavegacion) : null;
}
