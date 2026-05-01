-- Migracion: hardening + bloqueo de sesiones anonimas
-- Equivalente a 10_security_hardening.sql + 11_block_anonymous_sessions.sql
-- Idempotente.

-- ---- Hardening ----
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
drop policy if exists "auth_update_informes_partes"       on storage.objects;
create policy "auth_update_informes_partes"
on storage.objects for update to authenticated
using  (bucket_id = 'informes-partes')
with check (bucket_id = 'informes-partes');
drop policy if exists "dev_public_delete_informes_partes" on storage.objects;
drop policy if exists "auth_delete_informes_partes"       on storage.objects;
create policy "auth_delete_informes_partes"
on storage.objects for delete to authenticated
using (bucket_id = 'informes-partes');

-- ---- Bloqueo de sesiones anonimas ----
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
