-- Inventario de repuestos/materiales y vinculacion con materiales_orden
-- Ejecutar despues de 04_security_roles_rls.sql

create table if not exists public.inventario_materiales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  unidad text not null default 'ud',
  stock_actual integer not null default 0 check (stock_actual >= 0),
  precio_ref numeric(10, 2),
  activo boolean not null default true,
  creado_en timestamp with time zone not null default now()
);

alter table public.materiales_orden
  add column if not exists material_id uuid references public.inventario_materiales(id) on delete set null;

create index if not exists idx_inventario_materiales_nombre on public.inventario_materiales (nombre);
create index if not exists idx_materiales_orden_material_id on public.materiales_orden (material_id);

alter table public.inventario_materiales enable row level security;

drop policy if exists "inventario_materiales_select" on public.inventario_materiales;
drop policy if exists "inventario_materiales_write_oficina_admin" on public.inventario_materiales;

create policy "inventario_materiales_select"
on public.inventario_materiales
for select
to authenticated
using (true);

create policy "inventario_materiales_write_oficina_admin"
on public.inventario_materiales
for all
to authenticated
using (public.fn_es_oficina_o_admin_sat())
with check (public.fn_es_oficina_o_admin_sat());
