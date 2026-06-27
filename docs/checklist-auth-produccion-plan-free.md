# Checklist de Auth para produccion (Supabase plan Free)

Objetivo: reducir riesgo en Auth cuando el proyecto esta en plan Free y no permite activar "Leaked password protection" ni algunas opciones avanzadas de sesiones.

## 1. Decisiones de base

- [ ] Anonymous sign-ins: deshabilitado si no se usa.
- [ ] Si Anonymous sign-ins esta habilitado por necesidad, aplicar barrera explicita en RLS/Storage para bloquear `is_anonymous=true` (ver seccion 3).
- [ ] Proveedores: solo los estrictamente necesarios (deshabilitar el resto).
- [ ] Signups publicos deshabilitados si el alta es controlada por admin/oficina.
- [ ] Confirmacion de email requerida para cuentas reales.

## 2. Contrasenas y MFA (lo mas importante en Free)

- [ ] Password policy endurecida en Auth -> Password security:
  - [ ] Longitud minima aumentada (recomendado: 12 o mas; minimo 10 si hay compatibilidad con usuarios existentes).
  - [ ] Requerir caracteres: digitos + minusculas + mayusculas + simbolos.
- [ ] MFA (TOTP) habilitado en el proyecto.
- [ ] Cuentas operativas (admin/oficina) con MFA activado y validado (login real con MFA).
- [ ] Cuentas de tecnicos: MFA recomendado cuando sea posible.

## 3. Bloqueo de sesiones anonimas (si Anonymous sign-ins esta habilitado)

Meta: que un JWT con `is_anonymous=true` no pueda acceder a datos de negocio ni a Storage.

- [ ] Tablas de negocio: policies `to authenticated` incluyen condicion explicita:
  - [ ] `coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false`
- [ ] Storage (`storage.objects`): policies de lectura/escritura/borrado de buckets SAT incluyen la misma condicion (en `USING` y/o `WITH CHECK` segun el tipo).
- [ ] Verificacion rapida:
  - [ ] No hay policies relevantes sin la condicion anterior en `public.*` ni en `storage.objects`.

## 4. Emails y alta de usuarios

- [ ] Confirmacion de email requerida (evitar cuentas desechables sin verificar).
- [ ] Crear usuarios por invitacion o proceso controlado (especialmente admin/oficina).
- [ ] Revisar plantillas y remitente (evitar suplantacion y mejorar entregabilidad) si se usa correo transaccional.

## 5. Higiene operativa (minimo)

- [ ] Inventario de usuarios (Auth + `public.usuarios_sat`) revisado y consistente.
- [ ] Baja/desactivacion de usuarios inactivos (admin/oficina/tecnicos) con periodicidad definida.
- [ ] Rotacion de credenciales operativas ante cambios de personal o sospecha de compromiso.

## 6. Observabilidad (segun plan)

- [ ] Revisar logs de Auth tras despliegue y ante cualquier incidencia (en Free la retencion es limitada).
- [ ] Procedimiento de respuesta ante incidente definido:
  - [ ] Revocar sesiones del usuario afectado (logout forzado) cuando proceda.
  - [ ] Reset de password y reconfiguracion de MFA.

## 7. Excepcion documentada (plan Free)

- [ ] "Leaked password protection" no disponible en Free: excepcion aprobada.
- [ ] Mitigaciones aplicadas: policy fuerte + MFA + bloqueo de anon + proceso de alta controlado.

