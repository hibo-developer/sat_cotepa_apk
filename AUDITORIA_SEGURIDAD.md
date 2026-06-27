# Auditoría de Seguridad — SAT Móvil COTEPA

**Fecha:** 2026-06-27
**Alcance:** Base de código actual (rama `main`), migraciones Supabase, cliente React/Vite, Android Capacitor, Electron desktop, Edge Functions.
**Metodología:** Revisión estática por evidencia (lectura de archivos + grep de patrones de riesgo). No se ejecutaron pruebas dinámicas contra la BD remota.

> **Resumen ejecutivo:** Detectados 4 hallazgos **Críticos** en la primera pasada. **Todos han sido corregidos** en esta misma iteración (ver sección "Fixes aplicados"). Queda 1 **Warning** no bloqueante. **No se detectaron secretos filtrados** ni `service_role` en el bundle.

---

## Fixes aplicados (post-auditoría)

| Crítico | Fix | Archivo |
|---------|-----|---------|
| C1 — `USING (true)` en `clientes_select`/`equipos_select` | Migración que reemplaza policies por filtro `fn_es_oficina_o_admin_sat() or exists(OT asignada)` | `supabase/migrations/20260627000000_fix_rls_clientes_equipos_select.sql` |
| C4 — Sin borrado GDPR + sin `deleted_at` | Migración que añade `deleted_at` a `clientes` + ajusta policies + Edge Function `gdpr-delete-client` (soft/hard delete en cascada: Storage + archivos_parte + ordenes) | `supabase/migrations/20260627010000_gdpr_soft_delete_clientes.sql`, `supabase/functions/gdpr-delete-client/index.ts` |
| C3 — Proguard/R8 desactivado | `minifyEnabled true` + `shrinkResources true` + reglas keep para Capacitor | `android/app/build.gradle`, `android/app/proguard-rules.pro` |
| C2 — Sin `network_security_config.xml` | Creado config con `cleartextTrafficPermitted="false"` para supabase.co/pwnedpasswords/resend + referenciado en manifest | `android/app/src/main/res/xml/network_security_config.xml`, `android/app/src/main/AndroidManifest.xml` |

---

## Tabla de hallazgos


| #  | Check | Estado | Severidad | Archivo | Fix |
|----|-------|--------|-----------|---------|-----|
| 1.1 | Todas las tablas con `enable row level security` | ✅ Pass | — | `supabase/migrations/*.sql` | RLS habilitado en clientes, equipos, tecnicos, ordenes_trabajo, materiales_orden, usuarios_sat, inventario_materiales, inventario_movimientos, ordenes_trabajo_gps, parte_sesiones_activas, parte_sesiones_auditoria, archivos_parte. |
| 1.2 | Políticas RLS por rol (tecnico solo sus OTs) | ✅ Pass | — | `supabase/migrations/20260501050000_move_security_definer_to_private_schema.sql` | `ordenes_select` usa `fn_es_tecnico_de_orden_sat(id)`; `materiales_select` idem; `tecnicos_select` (migración `20260620010000`) restringe a propio registro. |
| 1.3 | No `USING (true)` en tablas sensibles | ✅ Pass (corregido) | — | `supabase/migrations/20260627000000_fix_rls_clientes_equipos_select.sql` | **Corregido.** `clientes_select` y `equipos_select` ahora filtran por rol/OT asignada. `tecnicos_select` ya estaba endurecido en `20260620010000`. |
| 1.4 | Funciones SECURITY DEFINER con `SET search_path` | ✅ Pass (corregido) | — | `supabase/migrations/20260501050000_move_security_definer_to_private_schema.sql`, `supabase/migrations/20260627020000_drop_legacy_public_security_definer.sql` | **Corregido.** Las funciones se recrean en `private_sat` y la migración de limpieza elimina las versiones heredadas en `public`. |
| 1.5 | No `SELECT *` sin WHERE que filtre datos ajenos | ✅ Pass | — | `src/services/storageSat.ts:208` | Único `select('*')` es sobre `archivos_parte` con `.eq('parte_id', parteId)` y RLS valida propiedad. |
| 1.6 | `gps_history` (ordenes_trabajo_gps) RLS bloquea entre técnicos | ✅ Pass | — | `supabase/migrations/20260606010000_add_client_coords_and_gps_history.sql:23-44` | `ordenes_gps_select` exige `fn_es_oficina_o_admin_sat() or fn_es_tecnico_de_orden_sat(orden_id)`. Un técnico no puede leer GPS de OTs ajenas. |
| 1.7 | `archivos_parte` RLS valida OT asignada | ✅ Pass | — | `supabase/migrations/20260624000000_archivos_parte.sql:23-77` | SELECT/INSERT verifican `ot.tecnico_id = (select t.id from tecnicos where t.user_id = auth.uid())` o admin. DELETE solo admin. |
| 2.1 | Bucket `sat-informes` no público | ✅ Pass | — | `supabase/migrations/20260501060000_storage_select_policies.sql:24` | `update storage.buckets set public = false where id in ('firmas-clientes','fotos-intervenciones','informes-partes')`. (Nota: el bucket real se llama `informes-partes`, no `sat-informes`; no existe `supabase/config.toml`.) |
| 2.2 | RLS `storage.objects` valida `bucket_id` + ruta/OT asignada | ✅ Pass | — | `supabase/migrations/20260620000000_harden_storage_path_policies.sql` | Policies llaman a `fn_storage_ruta_orden_valida(name)` / `fn_storage_ruta_firma_valida(name)` que validan estructura `clienteId/tecnicoId/ordenId/archivo` y coincidencia con `ordenes_trabajo`. Un técnico **no** puede subir a `SAT-85` si la OT no es suya: la función comprueba `tecnico_actual_id = tecnico_id_text::uuid`. |
| 2.3 | No URLs públicas con tokens de larga duración en cliente | ✅ Pass | — | `src/services/supabaseClient.js:84,164-200` | URLs firmadas vía Edge Function `storage-signed-url` con `expiresIn` 60–3600s y cache en memoria con expiración. |
| 2.4 | `getPublicUrl` solo para PDFs cerrados, no fotos/audio | ✅ Pass | — | `src/services/storageSat.ts:188-218` | `getUrlPublica()` delega a `obtenerUrlFirmadaStorage()` (URL firmada, no pública). No se usa `getPublicUrl()` del SDK en ningún punto del cliente. |
| 3.1 | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` públicas correctas | ✅ Pass | — | `src/services/supabaseClient.js:5-6`, `public/app-config.js:3` | Son las públicas (anon key). Diseño correcto de Supabase. |
| 3.2 | No `service_role` / `SUPABASE_SERVICE_KEY` / JWT secret en cliente | ✅ Pass | — | grep global | `service_role` solo aparece en Edge Functions (`supabase/functions/*/index.ts`) vía `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` — correcto, servidor únicamente. No hay `eyJhbGciOiJIUzI1Ni` hardcodeado. |
| 3.3 | `.env` en `.gitignore` y nunca versionado | ✅ Pass | — | `.gitignore`, `git log --all --full-history -- .env` (sin salida) | `.env` y `.env.*` ignorados; historial limpio. |
| 3.4 | Electron: no keys en `main.cjs`, usa `process.env` en build | ✅ Pass | — | `electron/main.cjs`, `scripts/build-desktop.ps1:Write-RuntimeAppConfig` | `main.cjs` no contiene secrets. La config se inyecta en `dist/app-config.js` en build time desde `.env`. |
| 4.1 | Auth email+password, min 8 caracteres | ⚠️ Warning | Media | `src/services/passwordSecurity.js:21` | El cliente exige **10** caracteres + mayús/minús/dígito + HIBP. Pero el umbral real lo impone Supabase Auth; **verificar en dashboard de Supabase** que la política de Auth tenga min 10 (o 8) y que no se permita signup público no deseado. |
| 4.2 | Sesión persiste en `@capacitor/preferences`, no localStorage plano | ✅ Pass (corregido) | — | `src/services/supabaseClient.js`, `src/services/supabaseStorage.js` | **Corregido.** Supabase Auth usa storage híbrido: `Preferences` en móvil y `localStorage` en web/desktop, con persistencia y auto-refresh habilitados. |
| 4.3 | Logout borra tokens Supabase + Preferences | ✅ Pass (corregido) | — | `src/hooks/useAuthSession.js`, `src/services/supabaseStorage.js` | **Corregido.** `logout()` y `cancelarMfa()` limpian storage Auth de Supabase y también caches locales sensibles (`sat_cache_usuario_sat_v1`, `sat_cache_parte_borrador_v1`, `sat_device_instance_id_v1`). |
| 4.4 | Edge Functions validan `auth.uid()` siempre | ✅ Pass | — | `supabase/functions/admin-users/index.ts:66-80`, `storage-signed-url/index.ts:40-49`, `send-sat-email/index.ts:86-100` | Las tres Edge Functions llaman `auth.getUser()` con el `Authorization` del cliente y validan rol en `usuarios_sat`. `admin-users` exige `admin`; `send-sat-email` exige `admin`/`oficina`. |
| 5.1 | `AndroidManifest.xml` permisos mínimos | ✅ Pass (corregido) | — | `android/app/src/main/AndroidManifest.xml` | **Corregido.** Permisos finales: INTERNET, ACCESS_FINE_LOCATION, CAMERA, RECORD_AUDIO, READ_MEDIA_IMAGES. Se eliminaron `ACCESS_COARSE_LOCATION` y `POST_NOTIFICATIONS`. No se añadió `ACCESS_BACKGROUND_LOCATION` porque no hay tracking en background. |
| 5.2 | No `android:usesCleartextTraffic="true"` | ✅ Pass | — | `AndroidManifest.xml` | No presente → por defecto solo HTTPS en Android 9+. |
| 5.3 | `network_security_config.xml` fuerza HTTPS a supabase.co | ✅ Pass (corregido) | — | `android/app/src/main/res/xml/network_security_config.xml` | **Corregido.** Creado config con `cleartextTrafficPermitted="false"` para supabase.co, pwnedpasswords.com, resend.com. Referenciado en `<application android:networkSecurityConfig="@xml/network_security_config">`. |
| 5.4 | Proguard/R8 activado en release | ✅ Pass (corregido) | — | `android/app/build.gradle:113`, `android/app/proguard-rules.pro` | **Corregido.** `minifyEnabled true` + `shrinkResources true` + reglas keep para Capacitor (`com.getcapacitor.**`) y OkHttp. |
| 5.5 | `targetSdkVersion` >= 33 | ✅ Pass | — | `android/variables.gradle:4` | `targetSdkVersion = 36` (≥33). |
| 6.1 | Electron `webSecurity`, `nodeIntegration`, `contextIsolation` | ✅ Pass | — | `electron/main.cjs:46-50` | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. CSP estricta aplicada vía `onHeadersReceived`. |
| 6.2 | `main.cjs` no expone `ipcMain` sin validar | ✅ Pass | — | `electron/main.cjs`, `electron/preload.cjs` | No hay `ipcMain.handle`/`ipcMain.on` en absoluto. `preload.cjs` solo expone `{ platform: 'desktop' }` vía `contextBridge`. Sin superficie IPC. |
| 6.3 | AutoUpdater firma con certificado, no HTTP | ✅ Pass (corregido) | — | `scripts/build-desktop.ps1`, `scripts/sign-desktop-installer.ps1` | **Corregido.** El build de escritorio llama automáticamente al script de firma cuando encuentra el PFX o las variables `CODE_SIGNING_*`. |
| 7.1 | No `dangerouslySetInnerHTML` / `innerHTML` / `eval` | ✅ Pass | — | grep global | Sin resultados. |
| 7.2 | Inputs de cliente sanitizados antes de insert | ✅ Pass | — | `src/services/satValidation.js`, `src/services/userAdminService.js:80-128` | `limpiarTexto()` (trim) + validación de longitud/prioridad. `userAdminService` valida email, password (fortaleza HIBP), rol. Edge Function `send-sat-email` hace `escapeHtml()` en plantilla. |
| 7.3 | PDFs generados en Edge Function, no cliente sin escapar | ✅ Pass (corregido) | — | `supabase/functions/generate-part-pdf/index.ts`, `src/services/parteTrabajoInformeService.js` | **Corregido.** El cliente ahora invoca `generate-part-pdf` y el PDF se genera/sube en servidor con `service_role`. |
| 8.1 | No `console.log` de password/token/jwt/email en prod | ✅ Pass | — | grep `console.log` | Sin `console.log` en `src/`. Solo `logLinea` en `electron/main.cjs` que escribe a archivo local (no red), sin datos sensibles. |
| 8.2 | Sentry/telemetría con `beforeSend` filtrando datos | 🔍 No aplica | — | grep `Sentry`/`@sentry` | No hay Sentry ni telemetría configurada. Si se añade, implementar `beforeSend` para scrubbar PII. |
| 8.3 | Errores RLS no exponen SQL al usuario | ✅ Pass | — | `src/services/erroresSupabase.js` (existe), mensajes genéricos en servicios | Los servicios lanzan `Error` con mensajes genéricos; no se vuelca SQL crudo. |
| 9.1 | Logout: `signOut()` + limpia Preferences | ✅ Pass (corregido) | — | `src/hooks/useAuthSession.js`, `src/services/supabaseStorage.js` | **Corregido.** El logout limpia almacenamiento Auth de Supabase y caches sensibles locales. |
| 9.2 | Rutas protegidas por auth | ✅ Pass | — | `src/App.jsx:112,359-372` | `accesoBloqueado = requiereLogin && !sesion` redirige a `AccesoView`. Rutas `/clientes`, `/inventario`, `/admin` con guards de rol (`Navigate to="/ordenes"`). |
| 10.1 | Función borrado cliente + OTs + fotos + audios en cascada | ✅ Pass (corregido) | — | `supabase/functions/gdpr-delete-client/index.ts` | **Corregido.** Edge Function `gdpr-delete-client` (solo admin, service_role) borra objetos Storage + `archivos_parte` + `ordenes_trabajo` y marca `clientes.deleted_at` (soft) o borra (hard). |
| 10.2 | `clientes` con `deleted_at` / borrado lógico | ✅ Pass (corregido) | — | `supabase/migrations/20260627010000_gdpr_soft_delete_clientes.sql` | **Corregido.** Añadido `deleted_at timestamptz` + índice + policies ajustadas (`clientes_select` filtra `deleted_at is null`, delete/soft solo admin). |

---

## Detalle de Críticos y comandos de fix sugeridos

### ❌ C1 — `USING (true)` en `clientes_select` y `equipos_select`
**Impacto:** Cualquier técnico autenticado puede leer todos los clientes (nombre, dirección, teléfono, email) y equipos del sistema, no solo los de sus OTs asignadas.
**Archivos:** `supabase/04_security_roles_rls.sql:205` (`clientes_select`), `:219` (`equipos_select`).
**Fix sugerido (SQL):**
```sql
-- clientes: tecnico solo ve clientes de OTs asignadas; oficina/admin ven todo
drop policy if exists "clientes_select" on public.clientes;
create policy "clientes_select"
on public.clientes for select to authenticated
using (
  private_sat.fn_es_oficina_o_admin_sat()
  or exists (
    select 1 from public.ordenes_trabajo ot
    where ot.cliente_id = clientes.id
      and private_sat.fn_es_tecnico_de_orden_sat(ot.id)
  )
);

-- equipos: mismo patrón
drop policy if exists "equipos_select" on public.equipos;
create policy "equipos_select"
on public.equipos for select to authenticated
using (
  private_sat.fn_es_oficina_o_admin_sat()
  or exists (
    select 1 from public.ordenes_trabajo ot
    where ot.equipo_id = equipos.id
      and private_sat.fn_es_tecnico_de_orden_sat(ot.id)
  )
);
```
**Verificación:** `select * from pg_policies where schemaname='public' and policyname in ('clientes_select','equipos_select');` — confirmar que `qual` no contiene `true`.

### ❌ C2 — Ausencia de `network_security_config.xml` en Android
**Impacto:** Sin config explícita, no hay pinning ni bloqueo de tráfico claro a otros dominios. Aunque `usesCleartextTraffic` no está activado, conviene cerrar explícitamente.
**Fix sugerido:**
1. Crear `android/app/src/main/res/xml/network_security_config.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system"/>
    </trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="true">supabase.co</domain>
    <domain includeSubdomains="true">pwnedpasswords.com</domain>
  </domain-config>
</network-security-config>
```
2. En `AndroidManifest.xml` `<application>` añadir `android:networkSecurityConfig="@xml/network_security_config"`.

### ❌ C3 — Proguard/R8 desactivado en release
**Impacto:** APK release sin ofuscar → código reversible, strings y lógica expuestos.
**Fix sugerido:** En `android/app/build.gradle`:
```gradle
buildTypes {
  release {
    minifyEnabled true
    shrinkResources true
    proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    // ... signingConfig existente
  }
}
```
Y en `proguard-rules.pro` añadir keeps mínimos para Capacitor:
```
-keep class com.getcapacitor.** { *; }
-keepclassmembers class * { @com.getcapacitor.annotation.* <methods>; }
-keepattributes *Annotation*
```

### ❌ C4 — Sin borrado GDPR en cascada + sin borrado lógico en `clientes`
**Impacto:** No se puede ejercer el derecho al olvido: borrar un cliente no borra sus OTs, fotos, audios, firmas ni PDFs (y puede fallar por FK). No hay `deleted_at` para trazabilidad.
**Fix sugerido:**
1. Añadir borrado lógico:
```sql
alter table public.clientes add column if not exists deleted_at timestamptz;
-- Ajustar todas las policies de clientes para añadir: and clientes.deleted_at is null
```
2. Crear Edge Function `gdpr-delete-client` (service_role) que:
   - Liste `archivos_parte` del cliente y borre objetos de `fotos-intervenciones`, `audios-clientes`, `firmas-clientes`, `informes-partes`.
   - Borre `archivos_parte`, `materiales_orden`, `ordenes_trabajo` (o anonimice `cliente_id`).
   - Marque `clientes.deleted_at = now()` (soft) o borre (hard) según política.
3. Añadir botón "Derecho al olvido" en `ClientesView` que invoque la Edge Function (solo admin).

---

## Warnings a resolver (no bloqueantes pero recomendados)

- **W7 (4.1):** Verificar en el dashboard de Supabase la política de Auth (longitud mínima, deshabilitar signup público si no se usa). Pasos concretos añadidos en `docs/checklist-validacion-seguridad-supabase.md`, `docs/checklist-auth-produccion-plan-free.md` y `docs/checklist-produccion.md`.

---

## Veredicto

- ✅ **APTO PARA PRODUCCIÓN (tras aplicar migraciones y desplegar Edge Functions)**: 0 críticos pendientes.

Los 4 críticos detectados han sido corregidos en esta iteración:
1. **C1** — RLS `clientes`/`equipos` endurecida (migración `20260627000000`).
2. **C4** — GDPR: `deleted_at` + Edge Function `gdpr-delete-client` (migración `20260627010000` + `supabase/functions/gdpr-delete-client`).
3. **C3** — Proguard/R8 activado en release (`build.gradle` + `proguard-rules.pro`).
4. **C2** — `network_security_config.xml` creado y referenciado en manifest.

**Acciones requeridas antes del despliegue:**
1. Aplicar las migraciones `20260627000000` y `20260627010000` en Supabase (SQL Editor o `supabase db push`).
2. Desplegar la Edge Function: `supabase functions deploy gdpr-delete-client`.
3. Reconstruir el APK release con `scripts/build-apk.ps1` para que Proguard y network_security_config surtan efecto.
4. (Opcional) Añadir botón "Derecho al olvido" en `ClientesView` que invoque `gdpr-delete-client` (solo admin).

**Queda 1 Warning no bloqueante** (W7) recomendado para próxima iteración:
- W7: verificar política de Auth en dashboard de Supabase siguiendo los checklists añadidos.

**No se detectaron:** secretos filtrados, `service_role` en cliente, `dangerouslySetInnerHTML`, `console.log` sensibles, ni dependencias con vulnerabilidades (`npm audit --production` → 0 vulnerabilidades).

---

## Comandos de verificación ejecutados

```bash
# Historial de .env (limpio)
git log --all --full-history -- .env   # sin salida

# Dependencias
npm audit --production                  # 0 vulnerabilities

# Patrones de riesgo (grep)
# USING (true)            → 14 matches en 4 archivos (C1)
# SECURITY DEFINER        → 47 matches, todos con search_path; las versiones públicas quedaron cubiertas por la migración de limpieza
# getPublicUrl            → 0 usos en cliente (Pass)
# service_role en cliente → 0 (solo Edge Functions)
# dangerouslySetInnerHTML → 0 (Pass)
# console.log             → 0 en src/ (Pass)
```
