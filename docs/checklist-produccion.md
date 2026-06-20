# Checklist de Produccion SAT

## 1. Seguridad y acceso

- [ ] Ejecutar apoyo de cierre en `docs/checklist-validacion-seguridad-supabase.md`.
- [ ] `supabase/04_security_roles_rls.sql` aplicado en entorno objetivo.
- [ ] `supabase/10_security_hardening.sql` aplicado en entorno objetivo.
- [ ] `supabase/11_block_anonymous_sessions.sql` aplicado en entorno objetivo.
- [ ] `supabase/migrations/20260620000000_harden_storage_path_policies.sql` aplicado en entorno objetivo.
- [ ] `supabase/migrations/20260620010000_restrict_tecnicos_select_for_tecnicos.sql` aplicado en entorno objetivo.
- [ ] `supabase/12_verify_no_anonymous_policies.sql` ejecutado sin hallazgos (bloques 1-3 en 0 filas).
- [ ] Alternativa: `supabase/13_apply_and_verify_security.sql` ejecutado completo en una sola pasada.
- [ ] Leaked Password Protection activado, o excepcion aprobada siguiendo [docs/checklist-auth-produccion-plan-free.md](checklist-auth-produccion-plan-free.md) si el plan de Supabase no lo incluye.
- [ ] Usuarios reales creados en Auth y asignados en `public.usuarios_sat`.
- [ ] Tecnicos vinculados correctamente en `public.tecnicos.user_id`.
- [ ] Sin acceso anonimo a datos de negocio.

## 2. Configuracion

- [ ] `.env` de produccion con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` validos.
- [ ] `npm run preflight:prod:pwsh` finaliza en OK.

## 3. Flujos funcionales

- [ ] Login/logout correcto.
- [ ] Alta y edicion de ordenes desde rol admin/oficina.
- [ ] Rol tecnico solo opera ordenes permitidas.
- [ ] Registro de parte con firma y evidencias.
- [ ] Generacion y descarga de informe PDF.
- [ ] Exportaciones Excel (KPI y ordenes) y ZIP de informes.

## 4. Catalogos y administracion

- [ ] CRUD de clientes/equipos/materiales validado con paginacion.
- [ ] Vista Admin: CRUD de usuarios y roles validado.
- [ ] Admin asignable como tecnico en ordenes/partes.

## 5. Publicacion

- [ ] `npm run build:pwsh` sin errores.
- [ ] Build desktop (`npm run build:desktop:pwsh`) generado y probado en maquina limpia.
- [ ] APK (`npm run build:apk:pwsh`) instalada y validada.
- [ ] APK `release` firmada con keystore de producción real; si falta keystore/secretos, el build debe fallar y no usar firma `debug`.
- [ ] Plan de respaldo y rollback definido.

## 6. Operacion

- [ ] Checklist de incidencias y soporte documentado.
- [ ] Responsable de despliegue y ventana de publicacion definida.
- [ ] Monitoreo de errores en primera semana de salida.
