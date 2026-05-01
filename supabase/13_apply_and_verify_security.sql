-- =============================================================
-- 13_apply_and_verify_security.sql (autocontenido)
-- Aplica en una sola pasada: hardening (10) + bloqueo anonimo (11)
-- y ejecuta al final las verificaciones de 12.
-- Idempotente. Pensado para Supabase SQL Editor.
-- =============================================================

-- =============================================================
-- BLOQUE A: HARDENING (equivalente a 10_security_hardening.sql)
-- =============================================================
drop policy if exists "dev_full_clientes"   on public.clientes;
drop policy if exists "dev_full_equipos"    on public.equipos;
drop policy if exists "dev_full_tecnicos"   on public.tecnicos;
drop policy if exists "dev_full_ordenes"    on public.ordenes_trabajo;
drop policy if exists "dev_full_materiales" on public.materiales_orden;

alter table public.clientes          enable row level security;
alter table public.equipos           enable row level security;
alter table public.tecnicos          enable row level security;
alter table public.ordenes_trabajo   enable row level security;
alter table public.materiales_orden  enable row level security;
alter table public.usuarios_sat      enable row level security;

-- Storage: eliminar SELECT y dejar escritura solo para authenticated
update storage.buckets
set public = false
where id in ('firmas-clientes', 'fotos-intervenciones', 'informes-partes');

-- firmas-clientes
drop policy if exists "dev_public_read_firmas_clientes" on storage.objects;
drop policy if exists "auth_read_firmas_clientes"       on storage.objects;
drop policy if exists "dev_public_insert_firmas_clientes" on storage.objects;
drop policy if exists "auth_insert_firmas_clientes"       on storage.objects;
create policy "auth_insert_firmas_clientes"
on storage.objects for insert to authenticated
with check (bucket_id = 'firmas-clientes');
drop policy if exists "dev_public_update_firmas_clientes" on storage.objects;
drop policy if exists "auth_update_firmas_clientes"       on storage.objects;
create policy "auth_update_firmas_clientes"
on storage.objects for update to authenticated
using  (bucket_id = 'firmas-clientes')
with check (bucket_id = 'firmas-clientes');
drop policy if exists "dev_public_delete_firmas_clientes" on storage.objects;
drop policy if exists "auth_delete_firmas_clientes"       on storage.objects;
create policy "auth_delete_firmas_clientes"
on storage.objects for delete to authenticated
using (bucket_id = 'firmas-clientes');

-- fotos-intervenciones
drop policy if exists "dev_public_read_fotos_intervenciones" on storage.objects;
drop policy if exists "auth_read_fotos_intervenciones"       on storage.objects;
drop policy if exists "dev_public_insert_fotos_intervenciones" on storage.objects;
drop policy if exists "auth_insert_fotos_intervenciones"        on storage.objects;
create policy "auth_insert_fotos_intervenciones"
on storage.objects for insert to authenticated
with check (bucket_id = 'fotos-intervenciones');
drop policy if exists "dev_public_update_fotos_intervenciones" on storage.objects;
drop policy if exists "auth_update_fotos_intervenciones"        on storage.objects;
create policy "auth_update_fotos_intervenciones"
on storage.objects for update to authenticated
using  (bucket_id = 'fotos-intervenciones')
with check (bucket_id = 'fotos-intervenciones');
drop policy if exists "dev_public_delete_fotos_intervenciones" on storage.objects;
drop policy if exists "auth_delete_fotos_intervenciones"        on storage.objects;
create policy "auth_delete_fotos_intervenciones"
on storage.objects for delete to authenticated
using (bucket_id = 'fotos-intervenciones');

-- informes-partes
drop policy if exists "dev_public_read_informes_partes" on storage.objects;
drop policy if exists "auth_read_informes_partes"       on storage.objects;
drop policy if exists "dev_public_insert_informes_partes" on storage.objects;
drop policy if exists "auth_insert_informes_partes"        on storage.objects;
create policy "auth_insert_informes_partes"
on storage.objects for insert to authenticated
with check (bucket_id = 'informes-partes');
drop policy if exists "dev_public_update_informes_partes" on storage.objects;
drop policy if exists "auth_update_informes_partes"        on storage.objects;
create policy "auth_update_informes_partes"
on storage.objects for update to authenticated
using  (bucket_id = 'informes-partes')
with check (bucket_id = 'informes-partes');
drop policy if exists "dev_public_delete_informes_partes" on storage.objects;
drop policy if exists "auth_delete_informes_partes"       on storage.objects;
create policy "auth_delete_informes_partes"
on storage.objects for delete to authenticated
using (bucket_id = 'informes-partes');

-- =============================================================
-- BLOQUE B: BLOQUEO ANONIMO (equivalente a 11_block_anonymous_sessions.sql)
-- =============================================================
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

-- =============================================================
-- BLOQUE C: VERIFICACION (equivalente a 12_verify_no_anonymous_policies.sql)
-- 3.1, 3.2, 3.3 deben devolver 0 filas. 3.4 debe devolver 1 fila.
-- =============================================================

-- 3.1 Politicas en public dirigidas al rol anon o public
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and (
    'anon'   = any(roles)
    or 'public' = any(roles)
  );

-- 3.2 Politicas en storage.objects dirigidas al rol anon
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and 'anon' = any(roles);

-- 3.3 Tablas SAT con RLS deshabilitada
select n.nspname as schema, c.relname as tabla, c.relrowsecurity as rls_habilitada
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'usuarios_sat',
    'clientes',
    'equipos',
    'tecnicos',
    'ordenes_trabajo',
    'materiales_orden',
    'inventario_materiales'
  )
  and c.relrowsecurity = false;

-- 3.4 Funcion guardia presente
select n.nspname || '.' || p.proname as funcion
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'fn_es_sesion_no_anon_sat';
