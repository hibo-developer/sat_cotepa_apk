-- Actualizar funciones RLS de storage para soportar rutas legibles
-- Formato nuevo: YYYY/MM/SAT-{ot}/parte-{id}/{tipo}-{idx}_{ts}.{ext}
-- Mantiene compatibilidad con formato antiguo: clienteId/tecnicoId/ordenId/nombreArchivo

create or replace function private_sat.fn_storage_ruta_orden_valida(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  ot_re constant text := '^(SAT|PEM)-\d{6}-\d{2}$';
  cliente_id_text text;
  tecnico_id_text text;
  orden_id_text text;
  ot_numero text;
  tecnico_actual_id uuid;
  orden_tecnico_id uuid;
begin
  if not private_sat.fn_es_sesion_no_anon_sat() then
    return false;
  end if;

  if object_name is null or btrim(object_name) = '' or object_name like '/%' or object_name like '%..%' then
    return false;
  end if;

  -- Formato nuevo legible: YYYY/MM/SAT-{ot}/parte-{id}/{tipo}-{idx}_{ts}.{ext}
  if array_length(string_to_array(object_name, '/'), 1) = 5 then
    declare
      yyyy text;
      mm text;
      ot_parte text;
      parte_carpeta text;
      nombre_archivo text;
    begin
      yyyy := split_part(object_name, '/', 1);
      mm := split_part(object_name, '/', 2);
      ot_parte := split_part(object_name, '/', 3);
      parte_carpeta := split_part(object_name, '/', 4);
      nombre_archivo := split_part(object_name, '/', 5);

      -- Validar formato de cada parte
      if not yyyy ~ '^\d{4}$' then return false; end if;
      if not mm ~ '^\d{2}$' then return false; end if;
      if not ot_parte ~ ot_re then return false; end if;
      if not parte_carpeta ~ '^parte-[a-zA-Z0-9\-_]+$' then return false; end if;
      if nombre_archivo = '' then return false; end if;

      -- Validar acceso por OT
      ot_numero := ot_parte;

      select o.tecnico_id into orden_tecnico_id
      from public.ordenes_trabajo o
      where o.numero_ticket = ot_numero;

      if not found then return false; end if;

      if private_sat.fn_es_oficina_o_admin_sat() then
        return true;
      end if;

      tecnico_actual_id := private_sat.fn_tecnico_actual_sat_id();
      return tecnico_actual_id is not null
        and tecnico_actual_id = orden_tecnico_id
        and private_sat.fn_es_tecnico_de_orden_sat((select id from public.ordenes_trabajo where numero_ticket = ot_numero));
    end;
  end if;

  -- Formato antiguo con UUIDs: clienteId/tecnicoId/ordenId/nombreArchivo
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

-- Actualizar función para validar rutas de firma
create or replace function private_sat.fn_storage_ruta_firma_valida(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  ot_re constant text := '^(SAT|PEM)-\d{6}-\d{2}$';
  cliente_id_text text;
  tecnico_id_text text;
  ot_numero text;
  tecnico_actual_id uuid;
  orden_tecnico_id uuid;
begin
  if not private_sat.fn_es_sesion_no_anon_sat() then
    return false;
  end if;

  if object_name is null or btrim(object_name) = '' or object_name like '/%' or object_name like '%..%' then
    return false;
  end if;

  -- Formato nuevo legible: YYYY/MM/SAT-{ot}/parte-{id}/firma-cliente-{idx}_{ts}.{ext}
  if array_length(string_to_array(object_name, '/'), 1) = 5 then
    declare
      yyyy text;
      mm text;
      ot_parte text;
      parte_carpeta text;
      nombre_archivo text;
    begin
      yyyy := split_part(object_name, '/', 1);
      mm := split_part(object_name, '/', 2);
      ot_parte := split_part(object_name, '/', 3);
      parte_carpeta := split_part(object_name, '/', 4);
      nombre_archivo := split_part(object_name, '/', 5);

      -- Validar formato
      if not yyyy ~ '^\d{4}$' then return false; end if;
      if not mm ~ '^\d{2}$' then return false; end if;
      if not ot_parte ~ ot_re then return false; end if;
      if not parte_carpeta ~ '^parte-[a-zA-Z0-9\-_]+$' then return false; end if;
      if not nombre_archivo like 'firma-cliente%' then return false; end if;

      -- Validar acceso por OT
      ot_numero := ot_parte;

      select o.tecnico_id into orden_tecnico_id
      from public.ordenes_trabajo o
      where o.numero_ticket = ot_numero;

      if not found then return false; end if;

      if private_sat.fn_es_oficina_o_admin_sat() then
        return true;
      end if;

      tecnico_actual_id := private_sat.fn_tecnico_actual_sat_id();
      return tecnico_actual_id is not null
        and tecnico_actual_id = orden_tecnico_id;
    end;
  end if;

  -- Formato antiguo: clienteId/tecnicoId/nombreArchivo
  if array_length(string_to_array(object_name, '/'), 1) <> 3 then
    return false;
  end if;

  cliente_id_text := split_part(object_name, '/', 1);
  tecnico_id_text := split_part(object_name, '/', 2);

  if cliente_id_text !~* uuid_re or tecnico_id_text !~* uuid_re then
    return false;
  end if;

  if split_part(object_name, '/', 3) = '' then
    return false;
  end if;

  if not exists (select 1 from public.clientes c where c.id = cliente_id_text::uuid) then
    return false;
  end if;

  if not exists (select 1 from public.tecnicos t where t.id = tecnico_id_text::uuid) then
    return false;
  end if;

  if private_sat.fn_es_oficina_o_admin_sat() then
    return true;
  end if;

  tecnico_actual_id := private_sat.fn_tecnico_actual_sat_id();
  return tecnico_actual_id is not null
    and tecnico_actual_id = tecnico_id_text::uuid;
end;
$$;

revoke all on function private_sat.fn_storage_ruta_firma_valida(text) from public, anon;
grant execute on function private_sat.fn_storage_ruta_firma_valida(text) to authenticated;

comment on function private_sat.fn_storage_ruta_orden_valida(text) is 'Valida rutas de storage para ordenes (fotos e informes) soportando formato legible YYYY/MM/SAT-{ot}/... y formato antiguo con UUIDs';
comment on function private_sat.fn_storage_ruta_firma_valida(text) is 'Valida rutas de storage para firmas soportando formato legible YYYY/MM/SAT-{ot}/.../firma-cliente-... y formato antiguo con UUIDs';
