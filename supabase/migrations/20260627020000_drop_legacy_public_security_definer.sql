-- Limpieza defensiva de funciones SECURITY DEFINER heredadas en schema public.
--
-- La migracion 20260501050000 ya recrea estas funciones en private_sat y
-- elimina las versiones public. Este archivo refuerza el estado para evitar
-- que queden restos en bases donde se haya aplicado parcialmente el hardening.

drop function if exists public.fn_validar_edicion_tecnico_orden_sat();
drop function if exists public.fn_es_tecnico_de_orden_sat(uuid);
drop function if exists public.fn_es_oficina_o_admin_sat();
drop function if exists public.fn_es_admin_sat();
drop function if exists public.fn_rol_actual_sat();
