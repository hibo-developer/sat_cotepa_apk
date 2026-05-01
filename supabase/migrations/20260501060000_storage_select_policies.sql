-- Migracion: restaurar policies SELECT en storage.objects para los
-- buckets de SAT.
--
-- Contexto:
--   La migracion 20260501000000_security_hardening_block_anon.sql elimino
--   las policies "dev_public_read_*" y "auth_read_*" de los buckets
--   firmas-clientes, fotos-intervenciones e informes-partes pero no
--   creo nuevas policies SELECT para usuarios autenticados.
--
--   Sin SELECT, el flujo `upsert: true` del SDK de Storage falla al
--   reemplazar un fichero existente (por ejemplo al regenerar el PDF
--   del informe desde "Editar parte completo (admin)"). Supabase
--   reporta el fallo como:
--     "No se pudo subir el PDF a Storage: new row violates row-level
--      security policy"
--
--   Esta migracion crea policies SELECT restringidas a authenticated
--   no-anonimo, manteniendo el endurecimiento (anon sigue sin acceso
--   directo a storage.objects; los buckets son `public:true` por lo
--   que la URL publica via CDN sigue funcionando para descargas).

-- firmas-clientes
drop policy if exists "auth_select_firmas_clientes" on storage.objects;
create policy "auth_select_firmas_clientes"
on storage.objects for select to authenticated
using (
  bucket_id = 'firmas-clientes'
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

-- fotos-intervenciones
drop policy if exists "auth_select_fotos_intervenciones" on storage.objects;
create policy "auth_select_fotos_intervenciones"
on storage.objects for select to authenticated
using (
  bucket_id = 'fotos-intervenciones'
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

-- informes-partes
drop policy if exists "auth_select_informes_partes" on storage.objects;
create policy "auth_select_informes_partes"
on storage.objects for select to authenticated
using (
  bucket_id = 'informes-partes'
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);
