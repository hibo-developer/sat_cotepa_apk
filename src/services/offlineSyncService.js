// =====================================================================
// Servicio de sincronización offline-first.
//
// Estrategia:
// - Las lecturas usan caché local IndexedDB (Dexie). Cuando hay red, el
//   hook hace un fetch al backend en background y refresca la caché.
// - Las escrituras se intentan online primero. Si falla por red u offline,
//   se encolan en `pending_actions` y la UI sigue funcionando con datos
//   optimistas. Al volver la conexión se procesa la cola.
//
// Acciones soportadas en cola (v1):
//  - actualizar  : actualizar campos editables de una orden (no finalizadas)
//  - eliminar    : borrado lógico/físico de una orden
//
// Las acciones que requieren subir ficheros (fotos, firma, PDF) se mantienen
// online-only para evitar perder evidencias. El indicador UI lo refleja.
// =====================================================================

import db from './offlineDb';
import {
  actualizarOrdenTrabajo,
  eliminarOrdenTrabajo,
} from './workOrderService';

const ACCIONES_SOPORTADAS = new Set(['actualizar', 'eliminar']);

const oyentes = new Set();

function notificar() {
  contarPendientes()
    .then((n) => oyentes.forEach((cb) => {
      try { cb({ pendientes: n, online: estaOnline() }); } catch { /* noop */ }
    }))
    .catch(() => { /* noop */ });
}

export function suscribirseEstadoSync(callback) {
  oyentes.add(callback);
  notificar();
  return () => { oyentes.delete(callback); };
}

export function estaOnline() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

// ---------------------------------------------------------------------
// Caché de lectura
// ---------------------------------------------------------------------

export async function reemplazarCacheOrdenes(ordenes) {
  if (!Array.isArray(ordenes)) return;
  await db.transaction('rw', db.cache_ordenes, db.meta, async () => {
    await db.cache_ordenes.clear();
    if (ordenes.length) {
      await db.cache_ordenes.bulkPut(
        ordenes.map((o) => ({ ...o, updated_at: o.updated_at || new Date().toISOString() })),
      );
    }
    await db.meta.put({ clave: 'ultimaSync', valor: new Date().toISOString() });
  });
}

export async function obtenerOrdenesCacheadas() {
  try {
    return await db.cache_ordenes.toArray();
  } catch {
    return [];
  }
}

export async function obtenerUltimaSincronizacion() {
  try {
    const meta = await db.meta.get('ultimaSync');
    return meta?.valor || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Cola de mutaciones
// ---------------------------------------------------------------------

export async function encolarAccion({ tipo, ordenId, payload }) {
  if (!ACCIONES_SOPORTADAS.has(tipo)) {
    throw new Error(`Acción "${tipo}" no soportada en modo offline.`);
  }
  await db.pending_actions.add({
    tipo,
    ordenId,
    payload: payload ?? null,
    createdAt: new Date().toISOString(),
  });
  notificar();
}

export async function contarPendientes() {
  try {
    return await db.pending_actions.count();
  } catch {
    return 0;
  }
}

export async function listarPendientes() {
  try {
    return await db.pending_actions.orderBy('id').toArray();
  } catch {
    return [];
  }
}

let procesandoCola = false;

async function ejecutarAccionRemota(accion) {
  if (accion.tipo === 'actualizar') {
    await actualizarOrdenTrabajo(accion.ordenId, accion.payload || {});
    return;
  }
  if (accion.tipo === 'eliminar') {
    await eliminarOrdenTrabajo(accion.ordenId);
    return;
  }
  throw new Error(`Acción "${accion.tipo}" desconocida.`);
}

export async function procesarCola() {
  if (procesandoCola || !estaOnline()) return { procesadas: 0, restantes: await contarPendientes() };
  procesandoCola = true;
  let procesadas = 0;

  try {
    const pendientes = await listarPendientes();
    for (const accion of pendientes) {
      try {
        await ejecutarAccionRemota(accion);
        await db.pending_actions.delete(accion.id);
        procesadas += 1;
      } catch (err) {
        // Si falla una acción, paramos para preservar el orden y reintentar luego.
        console.warn('[sync] acción pendiente falló, reintento posterior:', err?.message || err);
        break;
      }
    }
  } finally {
    procesandoCola = false;
    notificar();
  }

  return { procesadas, restantes: await contarPendientes() };
}

// ---------------------------------------------------------------------
// Wrappers que la UI puede usar como "intent": online si se puede, encolar si no.
// ---------------------------------------------------------------------

export async function intentarActualizarOrden(idOrden, datos) {
  if (estaOnline()) {
    try {
      const resultado = await actualizarOrdenTrabajo(idOrden, datos);
      // Aprovechamos para drenar lo que pudiera quedar pendiente.
      procesarCola().catch(() => { /* noop */ });
      return { offline: false, resultado };
    } catch (err) {
      // Si el error es claramente de red, encolamos. Si es validación, propagamos.
      if (esErrorRed(err)) {
        await encolarAccion({ tipo: 'actualizar', ordenId: idOrden, payload: datos });
        return { offline: true };
      }
      throw err;
    }
  }
  await encolarAccion({ tipo: 'actualizar', ordenId: idOrden, payload: datos });
  return { offline: true };
}

export async function intentarEliminarOrden(idOrden) {
  if (estaOnline()) {
    try {
      const resultado = await eliminarOrdenTrabajo(idOrden);
      procesarCola().catch(() => { /* noop */ });
      return { offline: false, resultado };
    } catch (err) {
      if (esErrorRed(err)) {
        await encolarAccion({ tipo: 'eliminar', ordenId: idOrden });
        return { offline: true };
      }
      throw err;
    }
  }
  await encolarAccion({ tipo: 'eliminar', ordenId: idOrden });
  return { offline: true };
}

function esErrorRed(err) {
  if (!err) return false;
  const mensaje = String(err.message || err).toLowerCase();
  return (
    mensaje.includes('failed to fetch')
    || mensaje.includes('networkerror')
    || mensaje.includes('network error')
    || mensaje.includes('load failed')
    || mensaje.includes('fetch failed')
    || mensaje.includes('timeout')
    || mensaje.includes('offline')
  );
}

// ---------------------------------------------------------------------
// Listener global: al recuperar conexión, drenamos la cola.
// ---------------------------------------------------------------------

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    procesarCola().catch(() => { /* noop */ });
    notificar();
  });
  window.addEventListener('offline', () => {
    notificar();
  });
}
