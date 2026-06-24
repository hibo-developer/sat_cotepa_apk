import Dexie from 'dexie';

// Base de datos local para soporte offline-first.
// - cache_ordenes: snapshot de las órdenes obtenidas del backend (clave: id remoto).
// - pending_actions: cola de mutaciones de órdenes (actualizar / eliminar).
// - pending_partes: partes finalizados completos a enviar cuando haya red
//   (incluyen Blobs de fotos y dataURL de firma, payload de formulario y
//   nombres de cliente/equipo/técnico para generar el informe).
// - meta: pares clave/valor (p.ej. timestamp de la última sincronización).
const db = new Dexie('sat_offline_v1');

db.version(1).stores({
  cache_ordenes: 'id, estado, updated_at',
  pending_actions: '++id, tipo, ordenId, createdAt',
  meta: 'clave',
});

db.version(2).stores({
  cache_ordenes: 'id, estado, updated_at',
  pending_actions: '++id, tipo, ordenId, createdAt',
  pending_partes: '++id, createdAt, intentos',
  meta: 'clave',
});

db.version(3).stores({
  cache_ordenes: 'id, estado, updated_at',
  pending_actions: '++id, tipo, ordenId, createdAt',
  pending_partes: '++id, createdAt, intentos',
  sync_conflicts: '++id, ordenId, createdAt',
  meta: 'clave',
});

db.version(4).stores({
  cache_ordenes: 'id, estado, updated_at',
  pending_actions: '++id, tipo, ordenId, createdAt',
  pending_partes: '++id, createdAt, intentos',
  pending_gps: '++id, ordenId, createdAt',
  sync_conflicts: '++id, ordenId, createdAt',
  meta: 'clave',
});

db.version(5).stores({
  cache_ordenes: 'id, estado, updated_at',
  pending_actions: '++id, tipo, ordenId, createdAt',
  pending_partes: '++id, createdAt, intentos',
  pending_gps: '++id, ordenId, createdAt',
  pending_audio: '++id, ot_id, timestamp, created_at',
  sync_conflicts: '++id, ordenId, createdAt',
  meta: 'clave',
});

export default db;
