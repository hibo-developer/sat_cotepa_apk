-- Migracion: mover funciones SECURITY DEFINER a schema "private_sat"
-- para eliminar el lint 0029 (Signed-In Users Can Execute SECURITY DEFINER Function).
--
-- Estrategia:
--   1. Crear schema "private_sat" (no expuesto por PostgREST -> no aparece en /rest/v1/rpc).
--   2. Crear copias de las funciones ahi, con grants minimos (authenticated EXECUTE).
--   3. Recrear todas las policies para referenciar private_sat.fn_* en lugar de public.fn_*.
--   4. Drop de las funciones publicas.
--
-- PostgREST por defecto solo expone schemas declarados (publico "public" + lo que se anada
-- en Dashboard > API > Exposed schemas). "private_sat" no se anadira nunca, por lo que
-- las funciones dejan de ser callables via /rest/v1/rpc/* aunque authenticated tenga EXECUTE.

-- =============================================================
-- 1. Schema y funciones en private_sat
-- =============================================================
create schema if not exists private_sat;

revoke all on schema private_sat from public, anon;
grant usage on schema private_sat to authenticated, service_role;

create or replace function private_sat.fn_rol_actual_sat()
returns public.rol_sat
language sql
stable
security definer
set search_path = public, auth
as $$
  select rol
  from public.usuarios_sat
  where user_id = auth.uid();
$$;

revoke all on function private_sat.fn_rol_actual_sat() from public, anon;
grant execute on function private_sat.fn_rol_actual_sat() to authenticated;

create or replace function private_sat.fn_es_admin_sat()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select private_sat.fn_rol_actual_sat() = 'admin';
$$;

revoke all on function private_sat.fn_es_admin_sat() from public, anon;
grant execute on function private_sat.fn_es_admin_sat() to authenticated;

create or replace function private_sat.fn_es_oficina_o_admin_sat()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select private_sat.fn_rol_actual_sat() in ('admin', 'oficina');
$$;

revoke all on function private_sat.fn_es_oficina_o_admin_sat() from public, anon;
grant execute on function private_sat.fn_es_oficina_o_admin_sat() to authenticated;

create or replace function private_sat.fn_es_tecnico_de_orden_sat(orden_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.ordenes_trabajo o
    join public.tecnicos t on t.id = o.tecnico_id
    where o.id = orden_id
      and t.user_id = auth.uid()
  );
$$;

revoke all on function private_sat.fn_es_tecnico_de_orden_sat(uuid) from public, anon;
grant execute on function private_sat.fn_es_tecnico_de_orden_sat(uuid) to authenticated;

create or replace function private_sat.fn_es_sesion_no_anon_sat()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (
      select not coalesce(u.is_anonymous, false)
      from auth.users u
      where u.id = auth.uid()
    ),
    false
  );
$$;

revoke all on function private_sat.fn_es_sesion_no_anon_sat() from public, anon;
grant execute on function private_sat.fn_es_sesion_no_anon_sat() to authenticated;

-- =============================================================
-- 2. Recrear policies usando private_sat.fn_*
-- =============================================================

-- ----- usuarios_sat -----
drop policy if exists "usuarios_sat_read_self"   on public.usuarios_sat;
create policy "usuarios_sat_read_self"
on public.usuarios_sat for select to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (user_id = (select auth.uid()) or private_sat.fn_es_admin_sat())
);

drop policy if exists "usuarios_sat_admin_insert" on public.usuarios_sat;
create policy "usuarios_sat_admin_insert"
on public.usuarios_sat for insert to authenticated
with check (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and private_sat.fn_es_admin_sat()
);

drop policy if exists "usuarios_sat_admin_update" on public.usuarios_sat;
create policy "usuarios_sat_admin_update"
on public.usuarios_sat for update to authenticated
using      (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_admin_sat())
with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_admin_sat());

drop policy if exists "usuarios_sat_admin_delete" on public.usuarios_sat;
create policy "usuarios_sat_admin_delete"
on public.usuarios_sat for delete to authenticated
using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_admin_sat());

-- ----- clientes -----
drop policy if exists "clientes_select" on public.clientes;
create policy "clientes_select"
on public.clientes for select to authenticated
using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "clientes_insert_oficina_admin" on public.clientes;
create policy "clientes_insert_oficina_admin"
on public.clientes for insert to authenticated
with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat());

drop policy if exists "clientes_update_oficina_admin" on public.clientes;
create policy "clientes_update_oficina_admin"
on public.clientes for update to authenticated
using      (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat())
with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat());

drop policy if exists "clientes_delete_oficina_admin" on public.clientes;
create policy "clientes_delete_oficina_admin"
on public.clientes for delete to authenticated
using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat());

-- ----- equipos -----
drop policy if exists "equipos_select" on public.equipos;
create policy "equipos_select"
on public.equipos for select to authenticated
using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "equipos_insert_oficina_admin" on public.equipos;
create policy "equipos_insert_oficina_admin"
on public.equipos for insert to authenticated
with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat());

drop policy if exists "equipos_update_oficina_admin" on public.equipos;
create policy "equipos_update_oficina_admin"
on public.equipos for update to authenticated
using      (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat())
with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat());

drop policy if exists "equipos_delete_oficina_admin" on public.equipos;
create policy "equipos_delete_oficina_admin"
on public.equipos for delete to authenticated
using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat());

-- ----- tecnicos -----
drop policy if exists "tecnicos_select" on public.tecnicos;
create policy "tecnicos_select"
on public.tecnicos for select to authenticated
using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "tecnicos_insert_oficina_admin" on public.tecnicos;
create policy "tecnicos_insert_oficina_admin"
on public.tecnicos for insert to authenticated
with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat());

drop policy if exists "tecnicos_update_oficina_admin" on public.tecnicos;
create policy "tecnicos_update_oficina_admin"
on public.tecnicos for update to authenticated
using      (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat())
with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat());

drop policy if exists "tecnicos_delete_oficina_admin" on public.tecnicos;
create policy "tecnicos_delete_oficina_admin"
on public.tecnicos for delete to authenticated
using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat());

-- ----- ordenes_trabajo -----
drop policy if exists "ordenes_select" on public.ordenes_trabajo;
create policy "ordenes_select"
on public.ordenes_trabajo for select to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (private_sat.fn_es_oficina_o_admin_sat() or private_sat.fn_es_tecnico_de_orden_sat(id))
);

drop policy if exists "ordenes_insert_oficina_admin" on public.ordenes_trabajo;
create policy "ordenes_insert_oficina_admin"
on public.ordenes_trabajo for insert to authenticated
with check (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and private_sat.fn_es_oficina_o_admin_sat()
);

drop policy if exists "ordenes_update" on public.ordenes_trabajo;
create policy "ordenes_update"
on public.ordenes_trabajo for update to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (private_sat.fn_es_oficina_o_admin_sat() or private_sat.fn_es_tecnico_de_orden_sat(id))
)
with check (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (private_sat.fn_es_oficina_o_admin_sat() or private_sat.fn_es_tecnico_de_orden_sat(id))
);

drop policy if exists "ordenes_delete_admin" on public.ordenes_trabajo;
create policy "ordenes_delete_admin"
on public.ordenes_trabajo for delete to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and private_sat.fn_es_admin_sat()
);

-- ----- materiales_orden -----
drop policy if exists "materiales_select" on public.materiales_orden;
create policy "materiales_select"
on public.materiales_orden for select to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (private_sat.fn_es_oficina_o_admin_sat() or private_sat.fn_es_tecnico_de_orden_sat(orden_id))
);

drop policy if exists "materiales_insert" on public.materiales_orden;
create policy "materiales_insert"
on public.materiales_orden for insert to authenticated
with check (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (private_sat.fn_es_oficina_o_admin_sat() or private_sat.fn_es_tecnico_de_orden_sat(orden_id))
);

drop policy if exists "materiales_update_oficina_admin" on public.materiales_orden;
create policy "materiales_update_oficina_admin"
on public.materiales_orden for update to authenticated
using      (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat())
with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat());

drop policy if exists "materiales_delete_oficina_admin" on public.materiales_orden;
create policy "materiales_delete_oficina_admin"
on public.materiales_orden for delete to authenticated
using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat());

-- ----- inventario_materiales -----
do $$
begin
  if to_regclass('public.inventario_materiales') is not null then
    execute 'drop policy if exists "inventario_materiales_select" on public.inventario_materiales';
    execute $f$
      create policy "inventario_materiales_select"
      on public.inventario_materiales for select to authenticated
      using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
    $f$;

    execute 'drop policy if exists "inventario_materiales_insert_oficina_admin" on public.inventario_materiales';
    execute $f$
      create policy "inventario_materiales_insert_oficina_admin"
      on public.inventario_materiales for insert to authenticated
      with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat())
    $f$;

    execute 'drop policy if exists "inventario_materiales_update_oficina_admin" on public.inventario_materiales';
    execute $f$
      create policy "inventario_materiales_update_oficina_admin"
      on public.inventario_materiales for update to authenticated
      using      (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat())
      with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat())
    $f$;

    execute 'drop policy if exists "inventario_materiales_delete_oficina_admin" on public.inventario_materiales';
    execute $f$
      create policy "inventario_materiales_delete_oficina_admin"
      on public.inventario_materiales for delete to authenticated
      using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat())
    $f$;
  end if;
end
$$;

-- ----- inventario_movimientos -----
do $$
begin
  if to_regclass('public.inventario_movimientos') is not null then
    execute 'drop policy if exists "inventario_movimientos_select" on public.inventario_movimientos';
    execute $f$
      create policy "inventario_movimientos_select"
      on public.inventario_movimientos for select to authenticated
      using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
    $f$;

    execute 'drop policy if exists "inventario_movimientos_insert_oficina_admin" on public.inventario_movimientos';
    execute $f$
      create policy "inventario_movimientos_insert_oficina_admin"
      on public.inventario_movimientos for insert to authenticated
      with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat())
    $f$;

    execute 'drop policy if exists "inventario_movimientos_update_oficina_admin" on public.inventario_movimientos';
    execute $f$
      create policy "inventario_movimientos_update_oficina_admin"
      on public.inventario_movimientos for update to authenticated
      using      (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat())
      with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat())
    $f$;

    execute 'drop policy if exists "inventario_movimientos_delete_oficina_admin" on public.inventario_movimientos';
    execute $f$
      create policy "inventario_movimientos_delete_oficina_admin"
      on public.inventario_movimientos for delete to authenticated
      using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and private_sat.fn_es_oficina_o_admin_sat())
    $f$;
  end if;
end
$$;

-- =============================================================
-- 3. Recrear trigger function para que use private_sat.fn_rol_actual_sat
-- =============================================================
create or replace function public.fn_validar_edicion_tecnico_orden_sat()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  rol_actual public.rol_sat;
begin
  rol_actual := private_sat.fn_rol_actual_sat();

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

revoke all on function public.fn_validar_edicion_tecnico_orden_sat() from public, anon, authenticated;

-- =============================================================
-- 4. Drop de las funciones publicas (ya sin dependencias en policies ni en trigger)
-- =============================================================
-- Puede que algun trigger interno todavia llame a public.fn_es_oficina_o_admin_sat etc.;
-- buscamos referencias y avisamos si existen (solo NOTICE, no abortamos).
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosrc ilike any (array[
    '%public.fn_rol_actual_sat%',
    '%public.fn_es_admin_sat%',
    '%public.fn_es_oficina_o_admin_sat%',
    '%public.fn_es_tecnico_de_orden_sat%',
    '%public.fn_es_sesion_no_anon_sat%'
  ])
  and n.nspname not in ('private_sat');
  if v_count > 0 then
    raise notice 'Aun hay % funciones que referencian public.fn_*_sat; revisar manualmente.', v_count;
  end if;
end
$$;

drop function if exists public.fn_es_admin_sat();
drop function if exists public.fn_es_oficina_o_admin_sat();
drop function if exists public.fn_es_tecnico_de_orden_sat(uuid);
drop function if exists public.fn_rol_actual_sat();
drop function if exists public.fn_es_sesion_no_anon_sat();
