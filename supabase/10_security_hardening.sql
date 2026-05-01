-- =============================================================
-- 10_security_hardening.sql
-- Elimina politicas "always true" de desarrollo y restringe
-- las politicas de listado de buckets de Storage.
-- Ejecutar en Supabase SQL Editor sobre el proyecto de produccion.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. ELIMINAR politicas dev_full_* (siempre true) en tablas
--    Las politicas restrictivas correctas ya existen desde
--    04_security_roles_rls.sql. Mientras estas convivan, la mas
--    permisiva gana, bloqueando la RLS real.
-- ---------------------------------------------------------------
drop policy if exists "dev_full_clientes"   on public.clientes;
drop policy if exists "dev_full_equipos"    on public.equipos;
drop policy if exists "dev_full_tecnicos"   on public.tecnicos;
drop policy if exists "dev_full_ordenes"    on public.ordenes_trabajo;
drop policy if exists "dev_full_materiales" on public.materiales_orden;

-- ---------------------------------------------------------------
-- 2. ASEGURAR que RLS esta habilitado en todas las tablas
-- ---------------------------------------------------------------
alter table public.clientes          enable row level security;
alter table public.equipos           enable row level security;
alter table public.tecnicos          enable row level security;
alter table public.ordenes_trabajo   enable row level security;
alter table public.materiales_orden  enable row level security;
alter table public.usuarios_sat      enable row level security;

-- ---------------------------------------------------------------
-- 3. STORAGE: eliminar politicas SELECT en buckets publicos.
--    Los buckets publicos sirven archivos por URL directa sin
--    necesitar una politica SELECT. Tener cualquier politica SELECT
--    en storage.objects (aunque sea para 'authenticated') habilita
--    el listado via API de Storage, lo que expone todos los archivos.
--    Se mantienen las politicas de escritura (INSERT/UPDATE/DELETE)
--    restringidas a authenticated.
-- ---------------------------------------------------------------

-- firmas-clientes
drop policy if exists "dev_public_read_firmas_clientes" on storage.objects;
drop policy if exists "auth_read_firmas_clientes"       on storage.objects;

-- Escritura: solo authenticated (quitar acceso anon)
drop policy if exists "dev_public_insert_firmas_clientes" on storage.objects;
drop policy if exists "auth_insert_firmas_clientes"       on storage.objects;
create policy "auth_insert_firmas_clientes"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'firmas-clientes');

drop policy if exists "dev_public_update_firmas_clientes" on storage.objects;
drop policy if exists "auth_update_firmas_clientes"       on storage.objects;
create policy "auth_update_firmas_clientes"
on storage.objects
for update
to authenticated
using  (bucket_id = 'firmas-clientes')
with check (bucket_id = 'firmas-clientes');

drop policy if exists "dev_public_delete_firmas_clientes" on storage.objects;
drop policy if exists "auth_delete_firmas_clientes"       on storage.objects;
create policy "auth_delete_firmas_clientes"
on storage.objects
for delete
to authenticated
using (bucket_id = 'firmas-clientes');

-- fotos-intervenciones
drop policy if exists "dev_public_read_fotos_intervenciones" on storage.objects;
drop policy if exists "auth_read_fotos_intervenciones"       on storage.objects;

drop policy if exists "dev_public_insert_fotos_intervenciones" on storage.objects;
drop policy if exists "auth_insert_fotos_intervenciones"        on storage.objects;
create policy "auth_insert_fotos_intervenciones"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'fotos-intervenciones');

drop policy if exists "dev_public_update_fotos_intervenciones" on storage.objects;
drop policy if exists "auth_update_fotos_intervenciones"        on storage.objects;
create policy "auth_update_fotos_intervenciones"
on storage.objects
for update
to authenticated
using  (bucket_id = 'fotos-intervenciones')
with check (bucket_id = 'fotos-intervenciones');

drop policy if exists "dev_public_delete_fotos_intervenciones" on storage.objects;
drop policy if exists "auth_delete_fotos_intervenciones"        on storage.objects;
create policy "auth_delete_fotos_intervenciones"
on storage.objects
for delete
to authenticated
using (bucket_id = 'fotos-intervenciones');

-- informes-partes
drop policy if exists "dev_public_read_informes_partes" on storage.objects;
drop policy if exists "auth_read_informes_partes"       on storage.objects;

drop policy if exists "dev_public_insert_informes_partes" on storage.objects;
drop policy if exists "auth_insert_informes_partes"        on storage.objects;
create policy "auth_insert_informes_partes"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'informes-partes');

drop policy if exists "dev_public_update_informes_partes" on storage.objects;
drop policy if exists "auth_update_informes_partes"        on storage.objects;
create policy "auth_update_informes_partes"
on storage.objects
for update
to authenticated
using  (bucket_id = 'informes-partes')
with check (bucket_id = 'informes-partes');

drop policy if exists "dev_public_delete_informes_partes" on storage.objects;
drop policy if exists "auth_delete_informes_partes"        on storage.objects;
create policy "auth_delete_informes_partes"
on storage.objects
for delete
to authenticated
using (bucket_id = 'informes-partes');

-- ---------------------------------------------------------------
-- 4. NOTA MANUAL: "Leaked Password Protection Disabled"
--    No se puede activar por SQL. Hacerlo en:
--    Supabase Dashboard > Authentication > Settings >
--    "Enable Leaked Password Protection"
-- ---------------------------------------------------------------
