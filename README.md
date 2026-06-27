# SAT Móvil COTEPA — Desktop + Android + Supabase

Aplicación de gestión de Servicio de Asistencia Técnica (SAT) orientada a **desktop (Electron)** y **móvil Android (Capacitor)**. Gestiona órdenes de trabajo, partes de trabajo, inventario de materiales, clientes y equipos, con roles diferenciados (`admin`, `oficina`, `tecnico`), firma digital del cliente, generación de informes PDF, exportaciones Excel/ZIP y **soporte offline-first** mediante Dexie (IndexedDB).

---

## Funcionalidades actuales

| Módulo | Descripción |
|---|---|
| Órdenes de trabajo | Alta, edición, cierre y seguimiento de estados (`pendiente`, `en_proceso`, `pausado`, `cerrada`) |
| Parte de trabajo | Registro de desplazamiento, intervención, materiales usados, firma del cliente y fotos |
| Informes PDF | Generación automática y subida a Supabase Storage al cerrar un parte |
| Inventario | Control de stock de materiales con descuento al usar en partes |
| Clientes & Equipos | CRUD completo con búsqueda y vinculación a órdenes |
| Exportaciones | Descarga de órdenes en Excel y ZIP con adjuntos |
| Roles y seguridad | RLS en Supabase, políticas por rol, bloqueo de sesiones anónimas |
| Offline-first | Cola de mutaciones y partes pendientes en IndexedDB, sincronización automática al recuperar red |
| Admin | Gestión de usuarios, asignación de roles vía Edge Functions |

---

## Plataformas de distribución

- **Desktop**: instalador `.exe` (NSIS) y portable via Electron Builder
- **Android**: APK / AAB via Capacitor + Gradle

---

## Requisitos

- Node.js 20+
- Proyecto Supabase operativo (PostgreSQL + Auth + Storage + Edge Functions)
- Para Android: Android Studio + JDK 17+

---

## Arranque rápido

```bash
npm install
npm run dev
```

PowerShell (entorno Windows del proyecto):

```powershell
npm run dev:pwsh
```

---

## Scripts clave

| Script | Descripción |
|---|---|
| `npm run build:pwsh` | Compila frontend |
| `npm run build:desktop:pwsh` | Empaqueta instalador Windows (NSIS) |
| `npm run build:desktop:portable:pwsh` | Empaqueta versión portable |
| `npm run build:apk:pwsh` | Build APK Android |
| `npm run preflight:prod:pwsh` | Valida prerequisitos de salida a producción |
| `npm run release:check:pwsh` | Build + preflight de producción |

---

## Variables de entorno

1. Copia `.env.example` a `.env`.
2. Define:

```env
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
```

> El flujo de informes usa Supabase Storage para almacenar PDFs. No hay envío automático de correo integrado (disponible como Edge Function `send-sat-email` preparada pero no activada por defecto).

---

## Base de datos y seguridad

### Migraciones versionadas (orden en Supabase SQL Editor)

1. `supabase/migrations/20260423000000_create_schema_sat.sql`
2. `supabase/migrations/20260423100000_seed_data.sql` *(solo pruebas)*
3. `supabase/migrations/20260423200000_storage_buckets.sql`
4. `supabase/migrations/20260606000000_add_updated_at_ordenes_trabajo.sql`
5. `supabase/migrations/20260606010000_add_client_coords_and_gps_history.sql`
6. `supabase/migrations/20260501000000_security_hardening_block_anon.sql`
7. `supabase/migrations/20260501010000_lint_fixes_security.sql`
8. `supabase/migrations/20260501020000_lint_perf_initplan_and_multiple_permissive.sql`
9. `supabase/migrations/20260501030000_fk_covering_indexes.sql`
10. `supabase/migrations/20260501040000_drop_redundant_deny_anonymous.sql`
11. `supabase/migrations/20260501050000_move_security_definer_to_private_schema.sql`
12. `supabase/migrations/20260501060000_storage_select_policies.sql`
13. `supabase/migrations/20260620000000_harden_storage_path_policies.sql`
14. `supabase/migrations/20260620010000_restrict_tecnicos_select_for_tecnicos.sql`

### Scripts legacy (referencia, no ejecutar si ya se aplicaron las migraciones)

`supabase/01_schema_sat.sql` → `supabase/13_apply_and_verify_security.sql`

Documentación de validación: `docs/checklist-validacion-roles.md` y `docs/checklist-validacion-seguridad-supabase.md`.

---

## Producción (go-live)

1. Ejecuta `npm run release:check:pwsh`.
2. Verifica acceso real por rol (`admin`, `oficina`, `tecnico`).
3. Valida login/logout, alta/edición/cierre de órdenes y descarga de informes.
4. Verifica exportaciones Excel/ZIP con datos reales.
5. Ejecuta checklist de `docs/checklist-produccion.md`.

---

## Offline-first (producción)

- Cola de mutaciones en `pending_actions` con **deduplicación por OT** (si editas varias veces la misma OT offline, se consolida).
- Procesado automático con **reintentos y backoff** al recuperar conexión.
- Conflictos “oficina vs técnico” resueltos por **timestamp (updated_at vs clientUpdatedAt)** y registro en `sync_conflicts` (IndexedDB).
- Requisito: aplicar la migración `20260606000000_add_updated_at_ordenes_trabajo.sql` para habilitar `updated_at`.
- Tracking: aplicar `20260606010000_add_client_coords_and_gps_history.sql` para guardar coordenadas de clientes y el histórico GPS por OT.

### Tracking en segundo plano (Android)

- La app puede iniciar un **foreground service** para registrar puntos GPS cada 5 min aunque la app quede en segundo plano.
- Los puntos se guardan localmente y se vuelcan a la cola `pending_gps` cuando la app vuelve al primer plano o hay conexión.

### Android release (keystore)

- El build `release` ya no usa la firma `debug` como fallback. Si falta la firma de producción, Gradle falla de forma explícita.
- Puedes generar un keystore nuevo en Windows con `powershell -ExecutionPolicy Bypass -File .\scripts\create-android-keystore.ps1`.
- Configura la firma release con variables de entorno o propiedades de Gradle:
- `KEYSTORE_FILE` o `RELEASE_KEYSTORE_FILE`: ruta al keystore. Si no se define, se usa `sat-release.keystore` en la raíz del repo.
- `KEYSTORE_PASSWORD` o `RELEASE_KEYSTORE_PASSWORD`: contraseña del keystore.
- `KEY_PASSWORD` o `RELEASE_KEY_PASSWORD`: contraseña de la clave.
- `KEY_ALIAS` o `RELEASE_KEY_ALIAS`: alias de la clave. Por defecto `sat-key`.
- Ejemplo PowerShell:

```powershell
$env:KEYSTORE_FILE="C:\secure\sat-release.keystore"
$env:KEYSTORE_PASSWORD="***"
$env:KEY_PASSWORD="***"
$env:KEY_ALIAS="sat-key"
npm run build:apk:pwsh
```

### Windows desktop: firma interna gratis para uso corporativo

- Si el `setup.exe` se usa solo en PCs gestionados por Cotepa, puede firmarse con un certificado interno gratuito en lugar de comprar una firma publica.
- Esta opcion mejora la integridad y la identificacion del instalador dentro de la empresa, pero no sustituye una firma publica para equipos externos o distribucion general.
- Flujo recomendado:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create-windows-internal-code-signing-cert.ps1
```

- Esto genera:
- un certificado publico `.cer` para repartir confianza en los PCs de Cotepa;
- un `.pfx` con clave privada para firmar el instalador.
- En cada PC corporativo, o por GPO/Intune, importa el `.cer`:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-windows-internal-signing-trust.ps1 `
  -CertificatePath "C:\secure\cotepa-code-signing\COTEPA-Internal-Code-Signing.cer" `
  -Scope LocalMachine
```

- Luego compila el instalador:

```powershell
npm run build:desktop:pwsh
```

- Y firmalo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sign-desktop-installer.ps1 `
  -InstallerPath "C:\app_sat - copia\release\2026-06-20_1520\SAT-Movil-COTEPA-Setup-0.1.0-x64.exe" `
  -PfxPath "C:\secure\cotepa-code-signing\COTEPA-Internal-Code-Signing.pfx"
```

- Requisito tecnico:
- `signtool.exe` debe estar instalado mediante Windows SDK o App Certification Kit.
- Si no esta instalado, el script de firma lo indicara con un error claro.
- Limitacion:
- esta firma interna solo sera confiable en equipos que tengan importado el `.cer` en `Trusted Root` y `Trusted Publishers`.

### Checklist QA (offline/sync)

- Editar OT con el móvil sin conexión → aparece “Cambios pendientes de sincronizar” y al volver internet se sincroniza solo.
- Editar OT offline (técnico) y editar la misma OT online desde oficina → al volver internet, verificar que gana el último timestamp y que se registra conflicto.
- Cerrar parte offline (fotos + firma) → se encola y se envía al reconectar.
- Forzar cierre de la app con cambios pendientes → reabrir con internet y comprobar que se drena la cola.

---

## Tests

```bash
npm test
```

---

## Trazabilidad UX

- Refactor de navegación por secciones, barra fija y retorno rápido:
- `docs/navegacion-secciones-ux-2026-06-27.md`

---

## Estructura principal

```
src/
  views/         # Pantallas: AccesoView, ListaOrdenesView, ParteTrabajoView,
                 #            ClientesView, InventarioView, AdminView
  services/      # Acceso a Supabase y lógica SAT (órdenes, partes, inventario,
                 #            clientes, equipos, auth, offline, PDF...)
  hooks/         # useOrdenes, useAuthSession, useDebounce
  components/    # NavbarInferior, ToastEstado, IndicadorSync, CambiarPasswordModal
scripts/         # Automatizaciones PowerShell de build y verificación
supabase/        # SQL de esquema, roles, hardening, storage y migraciones
electron/        # Main process, preload y afterPack para la app desktop
android/         # Proyecto Capacitor/Gradle para Android
```
