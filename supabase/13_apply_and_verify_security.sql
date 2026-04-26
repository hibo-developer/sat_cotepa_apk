-- =============================================================
-- 13_apply_and_verify_security.sql
-- Script TODO-EN-UNO para SQL Editor (Supabase)
--
-- Que hace:
-- 1) Aplica hardening de seguridad base (equivalente a 10_security_hardening.sql)
-- 2) Bloquea sesiones anonimas en RLS y Storage (equivalente a 11_block_anonymous_sessions.sql)
-- 3) Ejecuta verificaciones post-hardening (equivalente a 12_verify_no_anonymous_policies.sql)
--
-- Uso recomendado:
-- - Ejecutar con un rol con permisos de administracion.
-- - Revisar los resultados de los SELECT finales.
-- =============================================================

-- ---------------------------------------------------------------
-- PASO 1: hardening base
-- ---------------------------------------------------------------

drop policy if exists "dev_full_clientes"   on public.clientes;
drop policy if exists "dev_full_equipos"    on public.equipos;
drop policy if exists "dev_full_tecnicos"   on public.tecnicos;
drop policy if exists "dev_full_ordenes"    on public.ordenes_trabajo;
drop policy if exists "dev_full_materiales" on public.materiales_orden;

alter table public.clientes                enable row level security;
alter table public.equipos                 enable row level security;
alter table public.tecnicos                enable row level security;
alter table public.ordenes_trabajo         enable row level security;
alter table public.materiales_orden        enable row level security;
alter table public.usuarios_sat            enable row level security;
alter table public.inventario_materiales   enable row level security;

-- Storage: eliminar lecturas por policy para buckets publicos
-- (los objetos publicos se sirven por URL directa)
drop policy if exists "dev_public_read_firmas_clientes" on storage.objects;
drop policy if exists "auth_read_firmas_clientes"       on storage.objects;
drop policy if exists "dev_public_read_fotos_intervenciones" on storage.objects;
drop policy if exists "auth_read_fotos_intervenciones"       on storage.objects;
drop policy if exists "dev_public_read_informes_partes" on storage.objects;
drop policy if exists "auth_read_informes_partes"       on storage.objects;

-- ---------------------------------------------------------------
-- PASO 2: bloquear sesiones anonimas
-- ---------------------------------------------------------------

create or replace function public.fn_es_sesion_no_anon_sat()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

revoke all on function public.fn_es_sesion_no_anon_sat() from public;
grant execute on function public.fn_es_sesion_no_anon_sat() to authenticated;

-- usuarios_sat

drop policy if exists "usuarios_sat_read_self" on public.usuarios_sat;
create policy "usuarios_sat_read_self"
on public.usuarios_sat
for select
to authenticated
using (public.fn_es_sesion_no_anon_sat() and (user_id = auth.uid() or public.fn_es_admin_sat()));

drop policy if exists "usuarios_sat_admin_manage" on public.usuarios_sat;
create policy "usuarios_sat_admin_manage"
on public.usuarios_sat
for all
to authenticated
using (public.fn_es_sesion_no_anon_sat() and public.fn_es_admin_sat())
with check (public.fn_es_sesion_no_anon_sat() and public.fn_es_admin_sat());

-- clientes

drop policy if exists "clientes_select" on public.clientes;
create policy "clientes_select"
on public.clientes
for select
to authenticated
using (public.fn_es_sesion_no_anon_sat());

drop policy if exists "clientes_write_oficina_admin" on public.clientes;
create policy "clientes_write_oficina_admin"
on public.clientes
for all
to authenticated
using (public.fn_es_sesion_no_anon_sat() and public.fn_es_oficina_o_admin_sat())
with check (public.fn_es_sesion_no_anon_sat() and public.fn_es_oficina_o_admin_sat());

-- equipos

drop policy if exists "equipos_select" on public.equipos;
create policy "equipos_select"
on public.equipos
for select
to authenticated
using (public.fn_es_sesion_no_anon_sat());

drop policy if exists "equipos_write_oficina_admin" on public.equipos;
create policy "equipos_write_oficina_admin"
on public.equipos
for all
to authenticated
using (public.fn_es_sesion_no_anon_sat() and public.fn_es_oficina_o_admin_sat())
with check (public.fn_es_sesion_no_anon_sat() and public.fn_es_oficina_o_admin_sat());

-- tecnicos

drop policy if exists "tecnicos_select" on public.tecnicos;
create policy "tecnicos_select"
on public.tecnicos
for select
to authenticated
using (public.fn_es_sesion_no_anon_sat());

drop policy if exists "tecnicos_write_oficina_admin" on public.tecnicos;
create policy "tecnicos_write_oficina_admin"
on public.tecnicos
for all
to authenticated
using (public.fn_es_sesion_no_anon_sat() and public.fn_es_oficina_o_admin_sat())
with check (public.fn_es_sesion_no_anon_sat() and public.fn_es_oficina_o_admin_sat());

-- ordenes

drop policy if exists "ordenes_select" on public.ordenes_trabajo;
create policy "ordenes_select"
on public.ordenes_trabajo
for select
to authenticated
using (
  public.fn_es_sesion_no_anon_sat()
  and (
    public.fn_es_oficina_o_admin_sat()
    or public.fn_es_tecnico_de_orden_sat(id)
  )
);

drop policy if exists "ordenes_update_oficina_admin" on public.ordenes_trabajo;
create policy "ordenes_update_oficina_admin"
on public.ordenes_trabajo
for update
to authenticated
using (public.fn_es_sesion_no_anon_sat() and public.fn_es_oficina_o_admin_sat())
with check (public.fn_es_sesion_no_anon_sat() and public.fn_es_oficina_o_admin_sat());

drop policy if exists "ordenes_update_tecnico_propias" on public.ordenes_trabajo;
create policy "ordenes_update_tecnico_propias"
on public.ordenes_trabajo
for update
to authenticated
using (public.fn_es_sesion_no_anon_sat() and public.fn_es_tecnico_de_orden_sat(id))
with check (public.fn_es_sesion_no_anon_sat() and public.fn_es_tecnico_de_orden_sat(id));

-- materiales_orden

drop policy if exists "materiales_select" on public.materiales_orden;
create policy "materiales_select"
on public.materiales_orden
for select
to authenticated
using (
  public.fn_es_sesion_no_anon_sat()
  and (
    public.fn_es_oficina_o_admin_sat()
    or public.fn_es_tecnico_de_orden_sat(orden_id)
  )
);

drop policy if exists "materiales_write_oficina_admin" on public.materiales_orden;
create policy "materiales_write_oficina_admin"
on public.materiales_orden
for all
to authenticated
using (public.fn_es_sesion_no_anon_sat() and public.fn_es_oficina_o_admin_sat())
with check (public.fn_es_sesion_no_anon_sat() and public.fn_es_oficina_o_admin_sat());

-- inventario_materiales

drop policy if exists "inventario_materiales_select" on public.inventario_materiales;
create policy "inventario_materiales_select"
on public.inventario_materiales
for select
to authenticated
using (public.fn_es_sesion_no_anon_sat());

drop policy if exists "inventario_materiales_write_oficina_admin" on public.inventario_materiales;
create policy "inventario_materiales_write_oficina_admin"
on public.inventario_materiales
for all
to authenticated
using (public.fn_es_sesion_no_anon_sat() and public.fn_es_oficina_o_admin_sat())
with check (public.fn_es_sesion_no_anon_sat() and public.fn_es_oficina_o_admin_sat());

-- Storage: escritura solo authenticated y no anon

-- firmas-clientes

drop policy if exists "dev_public_insert_firmas_clientes" on storage.objects;
drop policy if exists "dev_public_update_firmas_clientes" on storage.objects;
drop policy if exists "dev_public_delete_firmas_clientes" on storage.objects;

drop policy if exists "auth_insert_firmas_clientes" on storage.objects;
create policy "auth_insert_firmas_clientes"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'firmas-clientes'
  and public.fn_es_sesion_no_anon_sat()
);

drop policy if exists "auth_update_firmas_clientes" on storage.objects;
create policy "auth_update_firmas_clientes"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'firmas-clientes'
  and public.fn_es_sesion_no_anon_sat()
)
with check (
  bucket_id = 'firmas-clientes'
  and public.fn_es_sesion_no_anon_sat()
);

drop policy if exists "auth_delete_firmas_clientes" on storage.objects;
create policy "auth_delete_firmas_clientes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'firmas-clientes'
  and public.fn_es_sesion_no_anon_sat()
);

-- fotos-intervenciones

drop policy if exists "dev_public_insert_fotos_intervenciones" on storage.objects;
drop policy if exists "dev_public_update_fotos_intervenciones" on storage.objects;
drop policy if exists "dev_public_delete_fotos_intervenciones" on storage.objects;

drop policy if exists "auth_insert_fotos_intervenciones" on storage.objects;
create policy "auth_insert_fotos_intervenciones"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'fotos-intervenciones'
  and public.fn_es_sesion_no_anon_sat()
);

drop policy if exists "auth_update_fotos_intervenciones" on storage.objects;
create policy "auth_update_fotos_intervenciones"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'fotos-intervenciones'
  and public.fn_es_sesion_no_anon_sat()
)
with check (
  bucket_id = 'fotos-intervenciones'
  and public.fn_es_sesion_no_anon_sat()
);

drop policy if exists "auth_delete_fotos_intervenciones" on storage.objects;
create policy "auth_delete_fotos_intervenciones"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'fotos-intervenciones'
  and public.fn_es_sesion_no_anon_sat()
);

-- informes-partes

drop policy if exists "dev_public_insert_informes_partes" on storage.objects;
drop policy if exists "dev_public_update_informes_partes" on storage.objects;
drop policy if exists "dev_public_delete_informes_partes" on storage.objects;

drop policy if exists "auth_insert_informes_partes" on storage.objects;
create policy "auth_insert_informes_partes"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'informes-partes'
  and public.fn_es_sesion_no_anon_sat()
);

drop policy if exists "auth_update_informes_partes" on storage.objects;
create policy "auth_update_informes_partes"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'informes-partes'
  and public.fn_es_sesion_no_anon_sat()
)
with check (
  bucket_id = 'informes-partes'
  and public.fn_es_sesion_no_anon_sat()
);

drop policy if exists "auth_delete_informes_partes" on storage.objects;
create policy "auth_delete_informes_partes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'informes-partes'
  and public.fn_es_sesion_no_anon_sat()
);

-- ---------------------------------------------------------------
-- PASO 3: verificaciones
-- ---------------------------------------------------------------

-- 3.1 Politicas en tablas de negocio con roles anon/public (esperado: 0 filas)
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'clientes',
    'equipos',
    'inventario_materiales',
    'materiales_orden',
    'ordenes_trabajo',
    'tecnicos',
    'usuarios_sat'
  )
  and (
    array_to_string(roles, ',') ilike '%anon%'
    or array_to_string(roles, ',') ilike '%public%'
  )
order by schemaname, tablename, policyname;

-- 3.2 Politicas authenticated sin guardia no-anon (esperado: 0 filas)
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'clientes',
    'equipos',
    'inventario_materiales',
    'materiales_orden',
    'ordenes_trabajo',
    'tecnicos',
    'usuarios_sat'
  )
  and array_to_string(roles, ',') ilike '%authenticated%'
  and coalesce(qual, '') not ilike '%fn_es_sesion_no_anon_sat%'
  and coalesce(with_check, '') not ilike '%fn_es_sesion_no_anon_sat%'
order by schemaname, tablename, policyname;

-- 3.3 Storage con anon/public o sin guardia (esperado: 0 filas)
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (
    array_to_string(roles, ',') ilike '%anon%'
    or array_to_string(roles, ',') ilike '%public%'
    or (
      array_to_string(roles, ',') ilike '%authenticated%'
      and coalesce(qual, '') not ilike '%fn_es_sesion_no_anon_sat%'
      and coalesce(with_check, '') not ilike '%fn_es_sesion_no_anon_sat%'
    )
  )
order by policyname;

-- 3.4 Confirmar funcion guardia creada (esperado: 1 fila)
select
  n.nspname as schema,
  p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'fn_es_sesion_no_anon_sat';

-- Nota manual: activar "Leaked Password Protection" (si el plan lo permite)
-- Dashboard > Authentication > Settings.
-- Si no esta disponible por plan, documentar excepcion de riesgo y aplicar mitigaciones operativas.
