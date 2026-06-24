alter table public.ordenes_trabajo
  add column if not exists tipo_orden text not null default 'averia'
    check (tipo_orden in ('averia', 'montaje', 'puesta_en_marcha'));

alter table public.ordenes_trabajo
  add column if not exists pem_data jsonb not null default '{}'::jsonb;

alter table public.ordenes_trabajo
  add column if not exists fecha_instalacion date;

create index if not exists idx_ordenes_trabajo_tipo_orden on public.ordenes_trabajo(tipo_orden);

