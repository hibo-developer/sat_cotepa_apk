-- Endurece las policies de storage.objects para que no baste con conocer
-- el bucket: la ruta debe cumplir la estructura esperada y, para tecnicos,
-- quedar acotada a su tecnico/orden.

create schema if not exists private_sat;

create or replace function private_sat.fn_tecnico_actual_sat_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select t.id
  from public.tecnicos t
  where t.user_id = auth.uid()
    and coalesce(t.activo, true) = true
  limit 1;
$$;

revoke all on function private_sat.fn_tecnico_actual_sat_id() from public, anon;
grant execute on function private_sat.fn_tecnico_actual_sat_id() to authenticated;

create or replace function private_sat.fn_storage_ruta_firma_valida(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  cliente_id_text text;
  tecnico_id_text text;
  tecnico_actual_id uuid;
begin
  if not private_sat.fn_es_sesion_no_anon_sat() then
    return false;
  end if;

  if object_name is null or btrim(object_name) = '' or object_name like '/%' or object_name like '%..%' then
    return false;
  end if;

  if array_length(string_to_array(object_name, '/'), 1) <> 3 then
    return false;
  end if;

  cliente_id_text := split_part(object_name, '/', 1);
  tecnico_id_text := split_part(object_name, '/', 2);

  if cliente_id_text !~* uuid_re or tecnico_id_text !~* uuid_re or split_part(object_name, '/', 3) = '' then
    return false;
  end if;

  if not exists (
    select 1
    from public.clientes c
    where c.id = cliente_id_text::uuid
  ) then
    return false;
  end if;

  if not exists (
    select 1
    from public.tecnicos t
    where t.id = tecnico_id_text::uuid
  ) then
    return false;
  end if;

  if private_sat.fn_es_oficina_o_admin_sat() then
    return true;
  end if;

  tecnico_actual_id := private_sat.fn_tecnico_actual_sat_id();
  return tecnico_actual_id is not null and tecnico_actual_id = tecnico_id_text::uuid;
end;
$$;

revoke all on function private_sat.fn_storage_ruta_firma_valida(text) from public, anon;
grant execute on function private_sat.fn_storage_ruta_firma_valida(text) to authenticated;

create or replace function private_sat.fn_storage_ruta_orden_valida(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  cliente_id_text text;
  tecnico_id_text text;
  orden_id_text text;
  tecnico_actual_id uuid;
begin
  if not private_sat.fn_es_sesion_no_anon_sat() then
    return false;
  end if;

  if object_name is null or btrim(object_name) = '' or object_name like '/%' or object_name like '%..%' then
    return false;
  end if;

  if array_length(string_to_array(object_name, '/'), 1) <> 4 then
    return false;
  end if;

  cliente_id_text := split_part(object_name, '/', 1);
  tecnico_id_text := split_part(object_name, '/', 2);
  orden_id_text := split_part(object_name, '/', 3);

  if cliente_id_text !~* uuid_re
     or tecnico_id_text !~* uuid_re
     or orden_id_text !~* uuid_re
     or split_part(object_name, '/', 4) = '' then
    return false;
  end if;

  if not exists (
    select 1
    from public.ordenes_trabajo o
    where o.id = orden_id_text::uuid
      and o.cliente_id = cliente_id_text::uuid
      and o.tecnico_id = tecnico_id_text::uuid
  ) then
    return false;
  end if;

  if private_sat.fn_es_oficina_o_admin_sat() then
    return true;
  end if;

  tecnico_actual_id := private_sat.fn_tecnico_actual_sat_id();
  return tecnico_actual_id is not null
    and tecnico_actual_id = tecnico_id_text::uuid
    and private_sat.fn_es_tecnico_de_orden_sat(orden_id_text::uuid);
end;
$$;

revoke all on function private_sat.fn_storage_ruta_orden_valida(text) from public, anon;
grant execute on function private_sat.fn_storage_ruta_orden_valida(text) to authenticated;

-- firmas-clientes
drop policy if exists "auth_insert_firmas_clientes" on storage.objects;
create policy "auth_insert_firmas_clientes"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'firmas-clientes'
  and private_sat.fn_storage_ruta_firma_valida(name)
);

drop policy if exists "auth_update_firmas_clientes" on storage.objects;
create policy "auth_update_firmas_clientes"
on storage.objects for update to authenticated
using (
  bucket_id = 'firmas-clientes'
  and private_sat.fn_storage_ruta_firma_valida(name)
)
with check (
  bucket_id = 'firmas-clientes'
  and private_sat.fn_storage_ruta_firma_valida(name)
);

drop policy if exists "auth_delete_firmas_clientes" on storage.objects;
create policy "auth_delete_firmas_clientes"
on storage.objects for delete to authenticated
using (
  bucket_id = 'firmas-clientes'
  and private_sat.fn_es_admin_sat()
  and private_sat.fn_storage_ruta_firma_valida(name)
);

-- fotos-intervenciones
drop policy if exists "auth_insert_fotos_intervenciones" on storage.objects;
create policy "auth_insert_fotos_intervenciones"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'fotos-intervenciones'
  and private_sat.fn_storage_ruta_orden_valida(name)
);

drop policy if exists "auth_update_fotos_intervenciones" on storage.objects;
create policy "auth_update_fotos_intervenciones"
on storage.objects for update to authenticated
using (
  bucket_id = 'fotos-intervenciones'
  and private_sat.fn_storage_ruta_orden_valida(name)
)
with check (
  bucket_id = 'fotos-intervenciones'
  and private_sat.fn_storage_ruta_orden_valida(name)
);

drop policy if exists "auth_delete_fotos_intervenciones" on storage.objects;
create policy "auth_delete_fotos_intervenciones"
on storage.objects for delete to authenticated
using (
  bucket_id = 'fotos-intervenciones'
  and private_sat.fn_es_admin_sat()
  and private_sat.fn_storage_ruta_orden_valida(name)
);

-- informes-partes
drop policy if exists "auth_insert_informes_partes" on storage.objects;
create policy "auth_insert_informes_partes"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'informes-partes'
  and private_sat.fn_storage_ruta_orden_valida(name)
);

drop policy if exists "auth_update_informes_partes" on storage.objects;
create policy "auth_update_informes_partes"
on storage.objects for update to authenticated
using (
  bucket_id = 'informes-partes'
  and private_sat.fn_storage_ruta_orden_valida(name)
)
with check (
  bucket_id = 'informes-partes'
  and private_sat.fn_storage_ruta_orden_valida(name)
);

drop policy if exists "auth_delete_informes_partes" on storage.objects;
create policy "auth_delete_informes_partes"
on storage.objects for delete to authenticated
using (
  bucket_id = 'informes-partes'
  and private_sat.fn_es_admin_sat()
  and private_sat.fn_storage_ruta_orden_valida(name)
);
