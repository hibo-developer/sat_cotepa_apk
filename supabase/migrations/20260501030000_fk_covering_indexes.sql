-- Migracion: indices que cubren foreign keys (lint 0001 unindexed_foreign_keys).
-- Mejora joins, eliminacion de filas referenciadas y planes de consultas con filtros por FK.
-- Idempotente: usa "if not exists".
-- Se crean concurrentemente NO es posible dentro de migracion transaccional;
-- se usan creates normales (la cantidad de datos actual es baja).

create index if not exists idx_equipos_cliente_id
  on public.equipos (cliente_id);

create index if not exists idx_materiales_orden_orden_id
  on public.materiales_orden (orden_id);

create index if not exists idx_ordenes_trabajo_cliente_id
  on public.ordenes_trabajo (cliente_id);

create index if not exists idx_ordenes_trabajo_equipo_id
  on public.ordenes_trabajo (equipo_id);

create index if not exists idx_ordenes_trabajo_tecnico_id
  on public.ordenes_trabajo (tecnico_id);
