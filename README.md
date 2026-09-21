# SAT Móvil COTEPA — Web + Supabase

Aplicación de gestión de Servicio de Asistencia Técnica (SAT) para **navegadores web en ordenador, móvil y tablet**. Gestiona órdenes de trabajo, partes de trabajo, inventario de materiales, clientes y equipos, con roles diferenciados (`admin`, `oficina`, `tecnico`), firma digital del cliente, generación de informes PDF, exportaciones Excel/ZIP y **soporte offline-first** mediante Dexie (IndexedDB).

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

- **Web**: aplicación React compilada con Vite y publicada desde GitHub.

---

## Requisitos

- Node.js 24 LTS
- Proyecto Supabase operativo (PostgreSQL + Auth + Storage + Edge Functions)

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
```
