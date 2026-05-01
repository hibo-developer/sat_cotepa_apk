-- =============================================================
-- 12_verify_no_anonymous_policies.sql
-- Verificacion de seguridad. NO modifica datos.
-- Estado actualizado tras migraciones 20260501000000..20260501050000.
--
-- Resultados esperados:
--   3.1 -> 0 filas (no debe haber policies para anon/public en public)
--   3.2 -> 0 filas (no debe haber policies para anon en storage.objects)
--   3.3 -> 0 filas (todas las tablas SAT tienen RLS habilitada)
--   3.4 -> 5 filas (las 5 funciones de seguridad estan en private_sat)
--   3.5 -> 0 filas (no quedan funciones SECURITY DEFINER con prefijo fn_*_sat en public)
--   3.6 -> 0 filas (anon no tiene EXECUTE en private_sat ni publica)
--   3.7 -> 0 filas (toda policy PERMISSIVE incluye check de is_anonymous)
-- =============================================================

-- -------------------------------------------------------------
-- 3.1 Politicas en public dirigidas al rol anon o public
-- -------------------------------------------------------------
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and (
    'anon'   = any(roles)
    or 'public' = any(roles)
  );

-- -------------------------------------------------------------
-- 3.2 Politicas en storage.objects dirigidas al rol anon
-- -------------------------------------------------------------
select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and 'anon' = any(roles);

-- -------------------------------------------------------------
-- 3.3 Tablas SAT con RLS deshabilitada
-- -------------------------------------------------------------
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
    'inventario_materiales',
    'inventario_movimientos'
  )
  and c.relrowsecurity = false;

-- -------------------------------------------------------------
-- 3.4 Funciones de seguridad presentes en private_sat
-- -------------------------------------------------------------
select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as funcion
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private_sat'
  and p.proname in (
    'fn_rol_actual_sat',
    'fn_es_admin_sat',
    'fn_es_oficina_o_admin_sat',
    'fn_es_tecnico_de_orden_sat',
    'fn_es_sesion_no_anon_sat'
  )
order by 1;

-- -------------------------------------------------------------
-- 3.5 Confirmar que YA NO existen en public
-- -------------------------------------------------------------
select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as funcion_publica
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'fn_rol_actual_sat',
    'fn_es_admin_sat',
    'fn_es_oficina_o_admin_sat',
    'fn_es_tecnico_de_orden_sat',
    'fn_es_sesion_no_anon_sat'
  );

-- -------------------------------------------------------------
-- 3.6 Permisos EXECUTE para anon en funciones de seguridad
-- -------------------------------------------------------------
select n.nspname as schema,
       p.proname as funcion,
       r.rolname as rol
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) ac on true
join pg_roles r on r.oid = ac.grantee
where ac.privilege_type = 'EXECUTE'
  and r.rolname = 'anon'
  and p.proname in (
    'fn_rol_actual_sat',
    'fn_es_admin_sat',
    'fn_es_oficina_o_admin_sat',
    'fn_es_tecnico_de_orden_sat',
    'fn_es_sesion_no_anon_sat',
    'fn_validar_edicion_tecnico_orden_sat'
  );

-- -------------------------------------------------------------
-- 3.7 Cobertura: cada policy PERMISSIVE debe contener la barrera
--     "is_anonymous = false" en su USING o WITH CHECK.
--     Lista las que NO la tienen (idealmente 0 filas).
-- -------------------------------------------------------------
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'usuarios_sat',
    'clientes',
    'equipos',
    'tecnicos',
    'ordenes_trabajo',
    'materiales_orden',
    'inventario_materiales',
    'inventario_movimientos'
  )
  and (permissive = 'PERMISSIVE' or permissive is null)
  and (
    coalesce(qual, '')       not ilike '%is_anonymous%'
    and coalesce(with_check, '') not ilike '%is_anonymous%'
  );
