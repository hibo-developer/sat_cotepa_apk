import Dexie from 'dexie';

// Base de datos local para soporte offline-first.
// - cache_ordenes: snapshot de las órdenes obtenidas del backend (clave: id remoto).
// - pending_actions: cola de mutaciones pendientes de sincronizar con Supabase.
// - meta: pares clave/valor (p.ej. timestamp de la última sincronización).
const db = new Dexie('sat_offline_v1');

db.version(1).stores({
  cache_ordenes: 'id, estado, updated_at',
  pending_actions: '++id, tipo, ordenId, createdAt',
  meta: 'clave',
});

export default db;
