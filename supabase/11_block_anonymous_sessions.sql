-- =============================================================
-- 11_block_anonymous_sessions.sql
-- Bloquea sesiones anonimas (auth.users.is_anonymous = true) y
-- elimina cualquier acceso del rol "anon" a tablas de negocio y
-- a storage.objects de los buckets SAT.
-- Idempotente: puede ejecutarse varias veces sin efectos colaterales.
-- Ejecutar en SQL Editor de Supabase, despues de 04 y 10.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Funcion guardia: sesion autenticada y NO anonima
--    Devuelve true solo si auth.uid() existe y el usuario no es
--    anonimo (Supabase marca is_anonymous=true para sign-in anon).
-- -------------------------------------------------------------
create or replace function public.fn_es_sesion_no_anon_sat()
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

revoke all on function public.fn_es_sesion_no_anon_sat() from public;
grant execute on function public.fn_es_sesion_no_anon_sat() to authenticated;

-- -------------------------------------------------------------
-- 2. Endurecer politicas: anteponer condicion "no anonimo" a las
--    politicas existentes. Lo hacemos creando una politica RESTRICTIVE
--    por tabla, que se aplica como AND con todas las permissive.
-- -------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'public.usuarios_sat',
    'public.clientes',
    'public.equipos',
    'public.tecnicos',
    'public.ordenes_trabajo',
    'public.materiales_orden'
  ] loop
    execute format('drop policy if exists "deny_anonymous_sat" on %s', t);
    execute format($f$
      create policy "deny_anonymous_sat"
      on %s
      as restrictive
      for all
      to authenticated
      using (public.fn_es_sesion_no_anon_sat())
      with check (public.fn_es_sesion_no_anon_sat())
    $f$, t);
  end loop;
end
$$;

-- inventario_materiales: aplicar el mismo bloqueo si la tabla existe
do $$
begin
  if to_regclass('public.inventario_materiales') is not null then
    execute 'alter table public.inventario_materiales enable row level security';
    execute 'drop policy if exists "deny_anonymous_sat" on public.inventario_materiales';
    execute $f$
      create policy "deny_anonymous_sat"
      on public.inventario_materiales
      as restrictive
      for all
      to authenticated
      using (public.fn_es_sesion_no_anon_sat())
      with check (public.fn_es_sesion_no_anon_sat())
    $f$;
  end if;
end
$$;

-- -------------------------------------------------------------
-- 3. Eliminar cualquier politica residual dirigida al rol anon en
--    storage.objects para los buckets SAT.
-- -------------------------------------------------------------
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and 'anon' = any(roles)
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end
$$;

-- -------------------------------------------------------------
-- 4. Revocar privilegios del rol anon sobre tablas de negocio.
--    Las tablas siguen accesibles via REST a authenticated por
--    los GRANT estandar de Supabase.
-- -------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'public.usuarios_sat',
    'public.clientes',
    'public.equipos',
    'public.tecnicos',
    'public.ordenes_trabajo',
    'public.materiales_orden'
  ] loop
    execute format('revoke all on %s from anon', t);
  end loop;

  if to_regclass('public.inventario_materiales') is not null then
    execute 'revoke all on public.inventario_materiales from anon';
  end if;
end
$$;
