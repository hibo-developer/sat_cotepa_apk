-- Seguridad de produccion para SAT
-- Ejecutar despues de 01_schema_sat.sql y 03_add_tiempo_empleado_minutos.sql
-- IMPORTANTE: al aplicar este script, la app requiere usuarios autenticados en Supabase.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'rol_sat'
      and n.nspname = 'public'
  ) then
    create type public.rol_sat as enum ('admin', 'oficina', 'tecnico');
  end if;
end
$$;

create table if not exists public.usuarios_sat (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rol public.rol_sat not null default 'tecnico',
  nombre_visible text,
  creado_en timestamp with time zone not null default now()
);

alter table if exists public.tecnicos
  add column if not exists user_id uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tecnicos_user_id_unique'
      and conrelid = 'public.tecnicos'::regclass
  ) then
    alter table public.tecnicos
      add constraint tecnicos_user_id_unique unique (user_id);
  end if;
end
$$;

create or replace function public.fn_rol_actual_sat()
returns public.rol_sat
language sql
stable
security definer
set search_path = public
as $$
  select rol
  from public.usuarios_sat
  where user_id = auth.uid();
$$;

revoke all on function public.fn_rol_actual_sat() from public;
grant execute on function public.fn_rol_actual_sat() to authenticated;

create or replace function public.fn_es_admin_sat()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.fn_rol_actual_sat() = 'admin';
$$;

revoke all on function public.fn_es_admin_sat() from public;
grant execute on function public.fn_es_admin_sat() to authenticated;

create or replace function public.fn_es_oficina_o_admin_sat()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.fn_rol_actual_sat() in ('admin', 'oficina');
$$;

revoke all on function public.fn_es_oficina_o_admin_sat() from public;
grant execute on function public.fn_es_oficina_o_admin_sat() to authenticated;

create or replace function public.fn_es_tecnico_de_orden_sat(orden_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ordenes_trabajo o
    join public.tecnicos t on t.id = o.tecnico_id
    where o.id = orden_id
      and t.user_id = auth.uid()
  );
$$;

revoke all on function public.fn_es_tecnico_de_orden_sat(uuid) from public;
grant execute on function public.fn_es_tecnico_de_orden_sat(uuid) to authenticated;

create or replace function public.fn_validar_edicion_tecnico_orden_sat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rol_actual public.rol_sat;
begin
  rol_actual := public.fn_rol_actual_sat();

  if rol_actual in ('admin', 'oficina') then
    return new;
  end if;

  if rol_actual <> 'tecnico' then
    raise exception 'Sin permisos para editar ordenes';
  end if;

  if not exists (
    select 1
    from public.tecnicos t
    where t.id = old.tecnico_id
      and t.user_id = auth.uid()
  ) then
    raise exception 'Solo puedes editar ordenes asignadas a tu tecnico';
  end if;

  if new.cliente_id <> old.cliente_id
     or new.equipo_id is distinct from old.equipo_id
     or new.tecnico_id <> old.tecnico_id
     or new.prioridad <> old.prioridad
     or new.descripcion_averia <> old.descripcion_averia then
    raise exception 'Como tecnico no puedes modificar cliente, equipo, tecnico, prioridad o descripcion';
  end if;

  if new.estado not in ('en_proceso', 'pausado', 'finalizado') then
    raise exception 'Estado no permitido para tecnico';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_edicion_tecnico_orden_sat on public.ordenes_trabajo;
create trigger trg_validar_edicion_tecnico_orden_sat
before update on public.ordenes_trabajo
for each row
execute function public.fn_validar_edicion_tecnico_orden_sat();

alter table public.usuarios_sat enable row level security;

-- Eliminar politicas abiertas de desarrollo
drop policy if exists "dev_full_clientes" on public.clientes;
drop policy if exists "dev_full_equipos" on public.equipos;
drop policy if exists "dev_full_tecnicos" on public.tecnicos;
drop policy if exists "dev_full_ordenes" on public.ordenes_trabajo;
drop policy if exists "dev_full_materiales" on public.materiales_orden;

-- Limpiar posibles politicas previas de seguridad
drop policy if exists "usuarios_sat_read_self" on public.usuarios_sat;
drop policy if exists "usuarios_sat_admin_manage" on public.usuarios_sat;

drop policy if exists "clientes_select" on public.clientes;
drop policy if exists "clientes_write_oficina_admin" on public.clientes;

drop policy if exists "equipos_select" on public.equipos;
drop policy if exists "equipos_write_oficina_admin" on public.equipos;

drop policy if exists "tecnicos_select" on public.tecnicos;
drop policy if exists "tecnicos_write_oficina_admin" on public.tecnicos;

drop policy if exists "ordenes_select" on public.ordenes_trabajo;
drop policy if exists "ordenes_insert_oficina_admin" on public.ordenes_trabajo;
drop policy if exists "ordenes_update_oficina_admin" on public.ordenes_trabajo;
drop policy if exists "ordenes_update_tecnico_propias" on public.ordenes_trabajo;

drop policy if exists "materiales_select" on public.materiales_orden;
drop policy if exists "materiales_write_oficina_admin" on public.materiales_orden;
drop policy if exists "materiales_insert_tecnico_propias" on public.materiales_orden;

-- Politicas usuarios_sat
create policy "usuarios_sat_read_self"
on public.usuarios_sat
for select
to authenticated
using (user_id = auth.uid() or public.fn_es_admin_sat());

create policy "usuarios_sat_admin_manage"
on public.usuarios_sat
for all
to authenticated
using (public.fn_es_admin_sat())
with check (public.fn_es_admin_sat());

-- Politicas clientes
create policy "clientes_select"
on public.clientes
for select
to authenticated
using (true);

create policy "clientes_write_oficina_admin"
on public.clientes
for all
to authenticated
using (public.fn_es_oficina_o_admin_sat())
with check (public.fn_es_oficina_o_admin_sat());

-- Politicas equipos
create policy "equipos_select"
on public.equipos
for select
to authenticated
using (true);

create policy "equipos_write_oficina_admin"
on public.equipos
for all
to authenticated
using (public.fn_es_oficina_o_admin_sat())
with check (public.fn_es_oficina_o_admin_sat());

-- Politicas tecnicos
create policy "tecnicos_select"
on public.tecnicos
for select
to authenticated
using (true);

create policy "tecnicos_write_oficina_admin"
on public.tecnicos
for all
to authenticated
using (public.fn_es_oficina_o_admin_sat())
with check (public.fn_es_oficina_o_admin_sat());

-- Politicas ordenes
create policy "ordenes_select"
on public.ordenes_trabajo
for select
to authenticated
using (
  public.fn_es_oficina_o_admin_sat()
  or public.fn_es_tecnico_de_orden_sat(id)
);

create policy "ordenes_insert_oficina_admin"
on public.ordenes_trabajo
for insert
to authenticated
with check (public.fn_es_oficina_o_admin_sat());

create policy "ordenes_update_oficina_admin"
on public.ordenes_trabajo
for update
to authenticated
using (public.fn_es_oficina_o_admin_sat())
with check (public.fn_es_oficina_o_admin_sat());

create policy "ordenes_update_tecnico_propias"
on public.ordenes_trabajo
for update
to authenticated
using (public.fn_es_tecnico_de_orden_sat(id))
with check (public.fn_es_tecnico_de_orden_sat(id));

-- Politicas materiales
create policy "materiales_select"
on public.materiales_orden
for select
to authenticated
using (
  public.fn_es_oficina_o_admin_sat()
  or public.fn_es_tecnico_de_orden_sat(orden_id)
);

create policy "materiales_write_oficina_admin"
on public.materiales_orden
for all
to authenticated
using (public.fn_es_oficina_o_admin_sat())
with check (public.fn_es_oficina_o_admin_sat());

create policy "materiales_insert_tecnico_propias"
on public.materiales_orden
for insert
to authenticated
with check (public.fn_es_tecnico_de_orden_sat(orden_id));

-- Asegurar RLS habilitado
alter table public.clientes enable row level security;
alter table public.equipos enable row level security;
alter table public.tecnicos enable row level security;
alter table public.ordenes_trabajo enable row level security;
alter table public.materiales_orden enable row level security;