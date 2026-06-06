import { Capacitor, registerPlugin } from '@capacitor/core';

const ExternalNavigation = registerPlugin('ExternalNavigation');

function getPlugin() {
  if (!Capacitor.isNativePlatform()) return null;
  if (Capacitor.getPlatform() !== 'android') return null;
  return ExternalNavigation || null;
}

export async function abrirGoogleMaps({ lat = null, lng = null, address = '' } = {}) {
  const plugin = getPlugin();
  if (!plugin) return { disponible: false, opened: false };

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const tieneCoords =
    Number.isFinite(latNum) &&
    Number.isFinite(lngNum) &&
    !(latNum === 0 && lngNum === 0);

  const payload = {};
  if (tieneCoords) {
    payload.lat = latNum;
    payload.lng = lngNum;
  } else if (address) {
    payload.address = String(address);
  }

  const rsp = await plugin.openGoogleMaps(payload);
  return { disponible: true, opened: Boolean(rsp?.opened) };
}
