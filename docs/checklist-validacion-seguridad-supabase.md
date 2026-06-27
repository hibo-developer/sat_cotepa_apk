# Checklist rapido de validacion de seguridad (Supabase)

Usar despues de ejecutar [supabase/13_apply_and_verify_security.sql](../supabase/13_apply_and_verify_security.sql) en SQL Editor.

Si usas migraciones versionadas, aplicar tambien `supabase/migrations/20260620000000_harden_storage_path_policies.sql` para endurecer las rutas de `storage.objects`.
Aplicar tambien `supabase/migrations/20260620010000_restrict_tecnicos_select_for_tecnicos.sql` para que un tecnico solo vea su propio registro en `public.tecnicos`.

## 1. Resultado SQL obligatorio

- [ ] Bloque 3.1 devuelve 0 filas.
- [ ] Bloque 3.2 devuelve 0 filas.
- [ ] Bloque 3.3 devuelve 0 filas.
- [ ] Bloque 3.4 devuelve 1 fila con `public.fn_es_sesion_no_anon_sat`.
- [ ] Las subidas/borrados en Storage quedan limitados a la ruta valida esperada por bucket (`cliente/tecnico/...`) y no solo por `bucket_id`.

## 2. Configuracion Auth (manual)

- [ ] Authentication > Settings > Leaked Password Protection: activado.
- [ ] Authentication > Settings > Signups: deshabilitados si el alta es controlada por admin/oficina.
- [ ] Authentication > Settings > Password security: longitud minima 10 o superior, con mayusculas/minusculas/digitos (alineado con `src/services/passwordSecurity.js`).
- [ ] Authentication > Settings > Email confirmations: activado para cuentas reales.
- [ ] Si no esta disponible por plan (p. ej. Free), registrar excepcion de riesgo y aplicar mitigaciones:
	- Seguir [docs/checklist-auth-produccion-plan-free.md](checklist-auth-produccion-plan-free.md).
- [ ] Authentication > Providers: confirmar que no hay acceso anonimo habilitado para el entorno productivo.

## 3. Prueba funcional corta por rol

- [ ] `admin` inicia sesion y accede a datos esperados.
- [ ] `oficina` inicia sesion y accede a datos esperados.
- [ ] `tecnico` inicia sesion y solo accede a ordenes permitidas.

## 4. Criterio de cierre

- [ ] No hay hallazgos en SQL (1-3 en cero) y funcion guardia presente (3.4 en uno).
- [ ] Leaked Password Protection activado, o excepcion aprobada con mitigaciones aplicadas cuando el plan no lo permita.
- [ ] Flujo login/acceso por roles validado sin errores de permisos.
