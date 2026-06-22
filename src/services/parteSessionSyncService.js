import { Capacitor } from '@capacitor/core';
import { obtenerClienteSupabase, tieneConfiguracionSupabase } from './supabaseClient';

const DEVICE_INSTANCE_KEY = 'sat_device_instance_id_v1';
const CHANNEL_PREFIX = 'sat-parte-sync';

function clonarJsonSeguro(valor, fallback) {
  if (valor == null) return fallback;
  try {
    return JSON.parse(JSON.stringify(valor));
  } catch {
    return fallback;
  }
}

function obtenerArchivoFotoSesionParte(foto) {
  if (!foto || typeof foto !== 'object') {
    return null;
  }
  return foto.archivo || foto.file || foto;
}

function obtenerCategoriaFotoSesionParte(foto) {
  const categoria = foto?.categoria || foto?.category || null;
  return typeof categoria === 'string' && categoria.trim() ? categoria.trim() : null;
}

function normalizarDescriptorFotoSesionParte(foto, indice) {
  const archivo = obtenerArchivoFotoSesionParte(foto);
  if (!archivo || typeof archivo !== 'object') {
    return null;
  }

  const nombre = typeof archivo.name === 'string' && archivo.name.trim()
    ? archivo.name
    : `foto-${indice + 1}.jpg`;
  const size = Number.isFinite(Number(archivo.size)) ? Number(archivo.size) : null;
  const type = typeof archivo.type === 'string' && archivo.type.trim() ? archivo.type : 'image/jpeg';

  return {
    categoria: obtenerCategoriaFotoSesionParte(foto),
    nombre,
    size,
    type,
  };
}

function leerArchivoComoDataUrl(archivo) {
  if (!archivo || typeof FileReader === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(archivo);
    } catch {
      resolve(null);
    }
  });
}

function dataUrlABlob(dataUrl, type) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return null;
  }

  const [header, payload] = dataUrl.split(',', 2);
  if (!header || !payload) {
    return null;
  }

  const mime = header.match(/^data:([^;]+)/i)?.[1] || type || 'application/octet-stream';

  try {
    if (header.includes(';base64')) {
      const base64ToBinary = typeof atob === 'function'
        ? atob
        : (value) => Buffer.from(value, 'base64').toString('binary');
      const binary = base64ToBinary(payload);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new Blob([bytes], { type: mime });
    }

    return new Blob([decodeURIComponent(payload)], { type: mime });
  } catch {
    return null;
  }
}

export function obtenerDeviceInstanceId() {
  if (typeof window === 'undefined') {
    return 'server';
  }

  try {
    const actual = localStorage.getItem(DEVICE_INSTANCE_KEY);
    if (actual) {
      return actual;
    }
    const nuevo = crypto?.randomUUID?.() || `inst-${Date.now()}`;
    localStorage.setItem(DEVICE_INSTANCE_KEY, nuevo);
    return nuevo;
  } catch {
    return `inst-${Date.now()}`;
  }
}

export function resolverPlataformaParteSync() {
  if (typeof window !== 'undefined' && window.process?.versions?.electron) {
    return 'desktop';
  }
  if (Capacitor.isNativePlatform()) {
    return Capacitor.getPlatform() || 'native';
  }
  return 'web';
}

export function esSesionParteAbierta(sesion) {
  return Boolean(sesion && (sesion.estado === 'draft' || sesion.estado === 'active'));
}

export function tieneProgresoSesionParte({
  formulario,
  desplazamiento,
  intervension,
  seguimientoTiempo,
  materialesSeleccionados,
  fotosIntervencion,
  firmaClienteDataUrl,
}) {
  const texto =
    (formulario?.cliente_nombre || '')
    || (formulario?.equipo_nombre || '')
    || (formulario?.descripcion_problema || '')
    || (formulario?.tareas_realizadas_libre || '')
    || (formulario?.materialesTexto || '')
    || (formulario?.nombre_firmante || '');

  return Boolean(
    formulario?.orden_id
    || formulario?.cliente_id
    || formulario?.equipo_id
    || formulario?.tecnico_id
    || String(texto).trim()
    || desplazamiento?.inicioIso
    || desplazamiento?.finIso
    || intervension?.inicioIso
    || intervension?.finIso
    || seguimientoTiempo?.inicioIso
    || seguimientoTiempo?.finIso
    || (Array.isArray(materialesSeleccionados) && materialesSeleccionados.length > 0)
    || (Array.isArray(fotosIntervencion) && fotosIntervencion.length > 0)
    || (firmaClienteDataUrl || '').trim()
  );
}

export function construirSnapshotSesionParte({
  formulario,
  desplazamiento,
  intervension,
  seguimientoTiempo,
  materialesSeleccionados,
  pendienteGeoIntervension,
  firmaClienteDataUrl,
  fotosIntervencion,
}) {
  return {
    formulario: clonarJsonSeguro(formulario, {}),
    desplazamiento: clonarJsonSeguro(desplazamiento, null),
    intervension: clonarJsonSeguro(intervension, null),
    seguimientoTiempo: clonarJsonSeguro(seguimientoTiempo, null),
    materialesSeleccionados: clonarJsonSeguro(materialesSeleccionados, []),
    pendienteGeoIntervension: Boolean(pendienteGeoIntervension),
    firmaClienteDisponible: Boolean((firmaClienteDataUrl || '').trim()),
    firmaClienteDataUrl: (firmaClienteDataUrl || '').trim(),
    fotosIntervencion: Array.isArray(fotosIntervencion)
      ? fotosIntervencion
        .map((foto, indice) => normalizarDescriptorFotoSesionParte(foto, indice))
        .filter(Boolean)
      : [],
    updatedAt: new Date().toISOString(),
  };
}

export async function serializarFotosSesionParte(fotosIntervencion) {
  if (!Array.isArray(fotosIntervencion) || fotosIntervencion.length === 0) {
    return [];
  }

  const serializadas = await Promise.all(
    fotosIntervencion.map(async (foto, indice) => {
      const descriptor = normalizarDescriptorFotoSesionParte(foto, indice);
      const archivo = obtenerArchivoFotoSesionParte(foto);
      const dataUrl = await leerArchivoComoDataUrl(archivo);
      if (!descriptor || !dataUrl) {
        return null;
      }
      return {
        ...descriptor,
        dataUrl,
      };
    }),
  );

  return serializadas.filter(Boolean);
}

export async function rehidratarFotosSesionParte(fotosSerializadas) {
  if (!Array.isArray(fotosSerializadas) || fotosSerializadas.length === 0) {
    return [];
  }

  return fotosSerializadas
    .map((foto, indice) => {
      const blob = dataUrlABlob(foto?.dataUrl, foto?.type);
      if (!blob) {
        return null;
      }

      const nombre = typeof foto?.nombre === 'string' && foto.nombre.trim()
        ? foto.nombre
        : `foto-${indice + 1}.jpg`;
      const type = typeof foto?.type === 'string' && foto.type.trim() ? foto.type : blob.type || 'image/jpeg';
      const archivo = typeof File === 'function'
        ? new File([blob], nombre, { type, lastModified: Date.now() })
        : Object.assign(blob, { name: nombre, type, lastModified: Date.now() });

      archivo.categoria = obtenerCategoriaFotoSesionParte(foto);
      return archivo;
    })
    .filter(Boolean);
}

function normalizarRespuestaSesion(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  return data;
}

export async function reclamarSesionParteActiva({ ordenId = null, snapshot = {}, estado = 'draft' }) {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase.rpc('fn_claim_parte_sesion_sat', {
    p_device_instance_id: obtenerDeviceInstanceId(),
    p_platform: resolverPlataformaParteSync(),
    p_orden_id: ordenId || null,
    p_snapshot: snapshot || {},
    p_estado: estado,
  });

  if (error) {
    throw new Error(`No se pudo sincronizar la sesión activa del parte: ${error.message}`);
  }

  return normalizarRespuestaSesion(data);
}

export async function cerrarSesionParteActiva({ reason = 'submitted', snapshot = {} } = {}) {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase.rpc('fn_close_parte_sesion_sat', {
    p_device_instance_id: obtenerDeviceInstanceId(),
    p_reason: reason,
    p_snapshot: snapshot || {},
  });

  if (error) {
    throw new Error(`No se pudo cerrar la sesión activa del parte: ${error.message}`);
  }

  return normalizarRespuestaSesion(data);
}

export async function obtenerSesionParteActivaActual() {
  if (!tieneConfiguracionSupabase()) {
    return null;
  }
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase.rpc('fn_get_parte_sesion_activa_sat');
  if (error) {
    throw new Error(`No se pudo consultar la sesión activa del parte: ${error.message}`);
  }
  return normalizarRespuestaSesion(data);
}

export function suscribirSesionesParteUsuario({ userId, onEvent }) {
  if (!tieneConfiguracionSupabase() || !userId) {
    return () => {};
  }

  const supabase = obtenerClienteSupabase();
  const channel = supabase
    .channel(`${CHANNEL_PREFIX}:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'parte_sesiones_activas',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onEvent?.(payload);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel).catch(() => {});
  };
}

export async function emitirNotificacionSesionParte({ titulo, descripcion }) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  try {
    let permission = window.Notification.permission;
    if (permission === 'default') {
      permission = await window.Notification.requestPermission();
    }
    if (permission !== 'granted') {
      return false;
    }
    const notification = new window.Notification(titulo, {
      body: descripcion || '',
      tag: 'sat-parte-session-sync',
      renotify: true,
    });
    window.setTimeout(() => notification.close(), 5000);
    return true;
  } catch {
    return false;
  }
}
