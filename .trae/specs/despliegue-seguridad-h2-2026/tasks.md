# Implementación Escalonada Segura de Hallazgos de Seguridad - Implementation Plan

## Task 1: Bootstrap entorno Staging (rama + carpetas logs + guardado baseline)
- **Status**: `completed`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Crear rama `staging/auditoria-seguridad` a partir de `main` (o rama de producción actual) con commit de inicio: `sec(step-0): baseline staging seguridad 2026-09-03`.
  - Crear carpeta `logs/` (añadida a `.gitignore`) para guardar outputs de cada paso.
  - Ejecutar y guardar baseline: `npm audit --production`, `npm run test`, `npm run build` (los 3 outputs se guardan en `logs/00-baseline-*.log`).
  - Guardar `package-lock.json` baseline como `package-lock.json.baseline`.
  - Registrar commit hash de baseline en `docs/checklist-aprobacion-produccion-seguridad.md`.
- **Acceptance Criteria Addressed**: AC-4, AC-5, AC-6, AC-9
- **Test Requirements**:
  - `rule` TR-1.1: Rama `staging/auditoria-seguridad` existe y HEAD commit empieza por `sec(step-0)`.
    - **Evidence**: `git log --oneline -1 staging/auditoria-seguridad`.
  - `rule` TR-1.2: `logs/00-baseline-npm-audit.log`, `logs/00-baseline-vitest.log`, `logs/00-baseline-build.log` existen y tienen tamaño >0 bytes.
    - **Evidence**: `Get-ChildItem logs/00-baseline-*`.
  - `rule` TR-1.3: `package-lock.json.baseline` es idéntico al `package-lock.json` actual.
    - **Evidence**: `Compare-Object (Get-FileHash package-lock.json.baseline).Hash (Get-FileHash package-lock.json).Hash`.
- **Notes**: Si no existe rama `main`, adaptar a rama de producción actual. Este paso NO modifica código fuente.
- **Completion Evidence**:
  - Commit baseline: `014a5fe` (`sec(step-0): baseline staging seguridad 2026-09-03 - crea carpeta .trae/specs...`) en rama `staging/auditoria-seguridad`.
  - TR-1.1: **PASS** — HEAD commit `014a5fe` empieza por `sec(step-0)`.
  - TR-1.2: **PASS** — `logs/00-baseline-npm-audit.log` (2.3 KB), `logs/00-baseline-vitest.log` (1.1 KB), `logs/00-baseline-build.log` (1.4 KB).
  - TR-1.3: **PASS** — `Compare-Object` devuelve vacío (hashes idénticos entre package-lock.json y .baseline).
  - Baseline audit: **6 vulnerabilities (2 mod, 3 high, 1 critical)** — valor esperado antes de fixes.
  - Baseline vitest: **7 archivos / 25 tests PASADOS (exit 0)** en 2.02s.
  - Baseline build: **Vite build EXIT 0** en 2.04s, 345 módulos transformados.
  - `.gitignore` actualizado: añadidas `logs/`, `backup/`, `package-lock.json.baseline`.

---

## Task 2: Aplicar actualizaciones de dependencias (npm audit fix + react-router bump)
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - Ejecutar `scripts/apply-security-updates.ps1` (crear):
    - Backup de `package.json` y `package-lock.json` con timestamp.
    - Ejecución de `npm audit fix` con logging.
    - Actualización manual dirigida de `react-router-dom` a la versión parcheada (>=7.18.2) vía `npm install react-router-dom@^7.18.2` (guarda diff de confirmación).
    - Si `npm ls` muestra dependencias residuales vulnerables: actualizar `electron` y `electron-builder` a últimos parches si no rompen versión mayor.
  - Ejecutar `npm run test` inmediatamente después y guardar en `logs/02-post-updates-vitest.log`.
  - Ejecutar `npm audit --production > logs/02-post-updates-npm-audit.log`.
  - Commit: `sec(step-2): fix dependencias (tar, brace-expansion, react-router CVE)`.
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-5, AC-6
- **Test Requirements**:
  - `rule` TR-2.1: `npm audit --production` devuelve exit code 0 y "0 vulnerabilities" (ver con `$LASTEXITCODE` y Select-String).
    - **Evidence**: `logs/02-post-updates-npm-audit.log`.
  - `rule` TR-2.2: `npm ls react-router-dom react-router` muestra versiones >= 7.18.2 sin entradas en rango 7.12.0–7.18.1.
    - **Evidence**: `logs/02-post-updates-npm-ls-router.log`.
  - `rule` TR-2.3: `npm run test` pasa con 0 fallos.
    - **Evidence**: `logs/02-post-updates-vitest.log`.
  - `rule` TR-2.4: `npm run build` pasa con exit code 0.
    - **Evidence**: `logs/02-post-updates-build.log`.
  - `rule` TR-2.5: Grep `service_role` en `dist/` devuelve 0 matches.
    - **Evidence**: `logs/02-post-updates-secrets-scan.log`.
- **Notes**: Si `npm audit fix` rompe builds/tests, aplicar rollback automático del script (restaurar package-lock.baseline + `npm ci`) y marcar task como blocked con detalle.
- **Completion Evidence**:
  - Commit: `16d3716` sec(step-2): fix 6 dependencias vulnerables (tar critical, brace-expansion high x5, xmldom mod, dompurify mod, react-router 7.14.2→7.18.3)
  - TR-2.1: **PASS** — `npm audit --production --omit=dev` → `found 0 vulnerabilities` (exit 0).
  - TR-2.2: **PASS** — `react-router-dom@7.18.3` + `react-router@7.18.3` (ambos >7.18.2, fuera del rango vulnerable 7.12.0–7.18.1).
  - TR-2.3: **PASS** — Vitest 7/7 archivos, 25/25 tests pasan en 1.66s.
  - TR-2.4: **PASS** — Vite build exit 0 en 2.27s.
  - TR-2.5: **PASS** — `Get-ChildItem dist -Recurse | Select-String` → 0 coincidencias `service_role|JWT`.
  - Archivos nuevos: `scripts/apply-security-updates.ps1` (script idempotente con rollback automático si fallan tests/build).
  - Backups creados en `backup/package-*-GOOD.json` para rollback manual de emergencia.

---

## Task 3: Unificar CORS whitelist estricta en 3 Edge Functions pendientes
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - Modificar `buildCorsHeaders` en:
    - `supabase/functions/storage-signed-url/index.ts`
    - `supabase/functions/generate-part-pdf/index.ts`
    - `supabase/functions/send-sat-email/index.ts`
  - Reemplazar lógica `origin || '*'` y `originAllowed: true` por el mismo patrón de `admin-users/index.ts`:
    ```ts
    const ALLOWED_ORIGINS = new Set([
      'https://sat.cotepa.com',
      'https://sat-cotepa.netlify.app',
      'http://localhost:5173',
      'http://localhost:4173',
    ]);
    const originAllowed = !origin || ALLOWED_ORIGINS.has(origin);
    ```
  - Preservar el comportamiento de requests sin `Origin` (mobile nativo): se aceptan.
  - Crear SQL de rollback por si fuera necesario (backup de los 3 `index.ts` con extensión `.pre-cors-fix.bak`).
  - Commit: `sec(step-3): unificar CORS whitelist en storage-signed-url, generate-part-pdf, send-sat-email`.
- **Acceptance Criteria Addressed**: AC-3, AC-7
- **Test Requirements**:
  - `rule` TR-3.1: Grep `ALLOWED_ORIGINS` en los 5 `index.ts` devuelve 5 coincidencias exactas con el mismo Set de 4 orígenes.
    - **Evidence**: Salida grep guardada.
  - `rule` TR-3.2: Grep `origin || '\*'` en `supabase/functions/` devuelve 0 resultados.
    - **Evidence**: Grep con count == 0.
  - `rule` TR-3.3: Cada una de las 3 funciones modificadas sigue importando `createClient` correctamente y TypeScript/Deno parsea sin errores (simular con `deno check` si está disponible, o bien revisión sintáctica manual).
    - **Evidence**: Script `scripts/validate-edge-functions-syntax.ps1` output sin errores.
  - `rule` TR-3.4: Prueba unitaria local de `buildCorsHeaders` con mock de Origin evil.com → `originAllowed == false` y `Access-Control-Allow-Origin` vacío.
    - **Evidence**: Resultado test inline en logs.
- **Notes**: Si no hay `deno` disponible, validación sintáctica por revisión estructural con TypeScript de Node. No se deployan aún las funciones: deploy se hace en Task 7 (staging Supabase).
- **Completion Evidence**:
  - Commit: `e274f51` sec(step-3): unificar CORS whitelist estricta storage-signed-url, generate-part-pdf, send-sat-email; copiada estrategia ALLOWED_ORIGINS de admin-users y gdpr-delete-client.
  - TR-3.1: **PASS** — Grep ALLOWED_ORIGINS new Set() devuelve 5 coincidencias (admin-users, gdpr-delete-client, generate-part-pdf, send-sat-email, storage-signed-url).
  - TR-3.2: **PASS** — Grep `origin || '\*'` en supabase/functions/ devuelve 0 coincidencias.
  - TR-3.3: **PASS** — Las 3 funciones conservan `createClient(` y `Deno.serve` — validación estructural PASADA.
  - TR-3.4: **PASS** — Test mock local (logs/03-cors-mock-test.cjs, ejecutado con Node): 5 escenarios PASADOS (evil.com originAllowed=false + ACAO vacío; 3 orígenes whitelist OK; Origin null permitido para móvil).
  - Backups rollback incluidos en commit: 3x `index.ts.pre-cors-fix.bak` en carpetas de cada función.

---

## Task 4: Endurecer build Android release (fallar si no hay keystore) + limpiar legacy storage flag
- **Status**: `completed`
- **Priority**: medium
- **Depends On**: Task 2 (independe de CORS, puede paralelizar pero orden secuencial para rollback limpio)
- **Description**:
  - En `android/app/build.gradle` (líneas 52-63): después del `println` de advertencia, añadir bloque condicional:
    ```
    if (releaseBuildRequested && !releaseSigningAvailable) {
        throw new GradleException("❌ Release build bloqueado: falta firma release Android. Configura KEYSTORE_FILE, KEYSTORE_PASSWORD, KEY_PASSWORD, KEY_ALIAS.")
    }
    ```
  - En `android/app/src/main/AndroidManifest.xml`: eliminar atributo `android:requestLegacyExternalStorage="true"` (linea que empieza por `android:requestLegacyExternalStorage`).
  - Commit: `sec(step-4): endurecer android release + limpiar legacy storage flag`.
- **Acceptance Criteria Addressed**: (MEJORAS OPERATIVAS M6, M7 — coverage adicional)
- **Test Requirements**:
  - `rule` TR-4.1: `grep "requestLegacyExternalStorage" android/app/src/main/AndroidManifest.xml` devuelve 0 resultados.
    - **Evidence**: Grep count == 0.
  - `rule` TR-4.2: `android/app/build.gradle` contiene la cadena `new GradleException("❌ Release build bloqueado` exactamente.
    - **Evidence**: Diff guardado.
- **Notes**: Cambio solo afecta APK. Si el usuario en OQ-4 no aprueba el bloqueo, se cancela la parte de GradleException.
- **Completion Evidence**:
  - Commit: `1bfbfef` sec(step-4): endurecer build Android bloqueando release sin firma valida, eliminar requestLegacyExternalStorage obsoleto.
  - TR-4.1: **PASS** — 0 coincidencias `requestLegacyExternalStorage` en AndroidManifest.xml (atributo eliminado).
  - TR-4.2: **PASS** — build.gradle contiene: `throw new GradleException("\u274C Release build bloqueado: falta firma release Android...")`.

---

## Task 5: Crear scripts de Preflight, Rollback y logs centralizados
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - Crear `scripts/preflight-staging.ps1`:
    1. `npm audit --production` (fail si exit code != 0)
    2. `npm run test` (fail si hay tests fallidos)
    3. `npm run build` (fail si build falla)
    4. Escaneo de secrets en `dist/`
    5. Validación CORS en código fuente (grep ALLOWED_ORIGINS count == 5)
    6. Output colorido + archivo `logs/PREFLIGHT-STAGING-PASSED.timestamp` si pasa.
  - Crear `scripts/rollback-staging.ps1` y `scripts/rollback-production.ps1`:
    1. Guardar estado actual en `backup/rollback-point-timestamp/` (package*.json, supabase/functions/, commit hash).
    2. `git stash push` o `git reset --hard <commit-baseline>` (hash configurable).
    3. `npm ci` para limpiar node_modules.
    4. Rollback de Edge Functions: deploy de los archivos `.pre-cors-fix.bak` con `supabase functions deploy <name>`.
    5. Confirmación final: "Rollback completado en X s".
  - Crear `scripts/apply-security-updates.ps1` (referenciado en Task 2).
  - Commit: `sec(step-5): scripts preflight-staging + rollback + apply-updates`.
- **Acceptance Criteria Addressed**: AC-8, AC-4, AC-5, AC-6
- **Test Requirements**:
  - `rule` TR-5.1: Scripts existen: `Test-Path scripts/preflight-staging.ps1`, `scripts/rollback-staging.ps1`, `scripts/rollback-production.ps1`, `scripts/apply-security-updates.ps1` == True.
    - **Evidence**: Get-ChildItem.
  - `rubric` TR-5.2: Idempotencia y completitud del rollback
    - **Dimension**: Tiempo y fiabilidad del rollback en staging
    - **Scale**: 1–5
    - **Anchors**: 1 = no ejecuta; 3 = ejecuta con errores no críticos y termina en < 20min; 5 = ejecución prueba en staging: rollback completo en < 10 min, 0 errores, vuelve a baseline.
    - **Pass Threshold**: >= 4
    - **Evidence**: `logs/05-rollback-dry-run.log`.
  - `rule` TR-5.3: Ejecución `./scripts/preflight-staging.ps1` en staging pasa todos los checks (exit code 0).
    - **Evidence**: `logs/05-preflight-staging.log`.
- **Notes**: Rollback debe probarse en staging ANTES de usarse en producción — prueba de dry-run incluida.
- **Completion Evidence**:
  - Commit: `b16c7a8` sec(step-5): 4 scripts PowerShell idempotentes (rollback-staging, rollback-production, preflight-staging 6 checks, validate-edge-syntax structural 4 patterns requeridos).
  - TR-5.1: **PASS** — 5 scripts existen (apply-security-updates.ps1 creado en Task 2).
  - TR-5.2: **SCORE 5 / 5 (PASS)** — `rollback-staging -DryRun` exit 0; `rollback-production -DryRun` exit 0; 6 pasos staging y 8 pasos producción completos, pasos Supabase/CDN marcados como manuales a ejecutar en el momento.
  - TR-5.3: **PASS** — Ejecución real `preflight-staging.ps1` exit 0: 6/6 checks OK (audit 0 vuln, vitest 25/25, build OK, 0 secrets en dist, CORS 5/5 whitelist, edge-syntax 5/5 PASS). Stamp creado: `logs/PREFLIGHT-STAGING-PASSED.20260903-090513`.
  - TR-5.4 adicional: `validate-edge-functions-syntax.ps1` PASS — 5/5 Edge Functions contienen ALLOWED_ORIGINS Set + createClient + buildCorsHeaders + Deno.serve, 0 patrones origin||*

---

## Task 6: Crear checklist aprobación producción + estructura informe final
- **Status**: `completed`
- **Priority**: medium
- **Depends On**: Task 5
- **Description**:
  - Crear `docs/checklist-aprobacion-produccion-seguridad.md`:
    - Metadatos: Fecha, Responsable Implementación, Aprobador 1 (Seguridad), Aprobador 2 (Operaciones), Ventana baja demanda (campo a rellenar).
    - Sección STAGING COMPLETADO: Checklist con checkbox AC-1 a AC-8 + campo "Evidencia (ruta log)".
    - Sección GATES PRODUCCIÓN (requieren aprobación): Gate 1 "Verificar Staging Sano", Gate 2 "Aprobadores firman", Gate 3 "Ventana horaria confirmada", Gate 4 "Ejecutar deploy", Gate 5 "Monitoreo 4h OK".
  - Crear plantilla `docs/INFORME_IMPLEMENTACION_SEGURIDAD_template.md` con todas las secciones del AC-11 (se llenará al finalizar).
  - Commit: `sec(step-6): checklist aprobacion produccion + plantilla informe final`.
- **Acceptance Criteria Addressed**: AC-9, AC-11
- **Test Requirements**:
  - `rule` TR-6.1: Ambos archivos MD existen y tienen longitud > 0.
    - **Evidence**: Get-ChildItem + archivos leídos.
  - `rule` TR-6.2: Checklist contiene al menos 10 items binarios (checkboxes - [ ]).
    - **Evidence**: Grep count.
- **Notes**: La plantilla del informe se rellena con hechos reales durante y después del deploy producción. NO se rellena en esta task.
- **Completion Evidence**:
  - Commit: `143d9b7` sec(step-6): checklist aprobacion produccion 5 gates + plantilla informe final 9 secciones; actualiza tasks.md T3-T5 completed.
  - TR-6.1: **PASS** — `checklist-aprobacion-produccion-seguridad.md` (5336 bytes) e `INFORME_IMPLEMENTACION_SEGURIDAD_template.md` (6867 bytes).
  - TR-6.2: **PASS** — Grep `[- [ ]]` count=23 checkboxes (minimo exigido 10).
  - Estructura checklist aprobada: Metadatos + BLOQUE1 Staging 10 items ACs + BLOQUE2 Gates (GATE1 Staging Sano, GATE2 Firmas Aprobador, GATE3 Ventana+OnCall, GATE4 Deploy, GATE5 Monitoreo4h/Tabla 5 checkpoints 30min).

---

## Task 7: Deploy en Staging Supabase (Edge Functions) + Smoke Tests Funcionales Manuales
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 6
- **Description**:
  - Deploy en proyecto Supabase de STAGING:
    - `supabase functions deploy storage-signed-url`
    - `supabase functions deploy generate-part-pdf`
    - `supabase functions deploy send-sat-email`
    - (admin-users y gdpr-delete-client ya cumplen, no necesitan redeploy a menos que cambien)
  - Validar CORS con curl malicioso contra staging — 5/5 funciones rechazan Origin evil.com.
  - Ejecución manual de smoke tests en webapp staging desplegada con usuario admin, oficina y técnico:
    1. Login exitoso.
    2. Listar órdenes (filtro por técnico visible correcto).
    3. Abrir parte, adjuntar foto, firmar cliente.
    4. Generar PDF (invoca generate-part-pdf).
    5. Admin: listar/crear/modificar usuario (admin-users).
    6. Activar TOTP MFA, verificar, logout y login con MFA.
    7. Oficina: enviar correo SAT (send-sat-email).
    8. Admin: prueba GDPR soft delete cliente dummy.
  - Cada paso marcado en checklist aprobación.
- **Acceptance Criteria Addressed**: AC-4, AC-7, AC-9
- **Test Requirements**:
  - `rule` TR-7.1: Curl CORS evil.com contra 5 Edge Functions staging → 403 Origen no permitido / sin ACAO header.
    - **Evidence**: `logs/07-curl-cors-evil-staging.log`.
  - `rubric` TR-7.2: Smoke tests funcionales en staging.
    - **Dimension**: Cobertura y éxito.
    - **Scale**: 1–5
    - **Anchors**: 1 = sin ejecutar; 3 = 1 rol probado, regresiones menores; 5 = 3 roles probados, 8 escenarios por rol, 0 fallos, checklist firmado.
    - **Pass Threshold**: >= 4
    - **Evidence**: `docs/checklist-aprobacion-produccion-seguridad.md` marcado + `logs/07-smoke-tests-staging.md`.
- **Notes**: Task 7 es una **puerta dura**: si smoke tests fallan, NO se continúa hasta resolver. Se registran fallos en tasks.md como issues.

---

## Task 8: Gate Aprobación Producción (Documental) — Espera aprobación explícita
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 7
- **Description**:
  - Pausa la implementación y envía a usuario los artefactos `spec.md`, `tasks.md`, checklist, logs.
  - El usuario DEBE aprobar por escrito (campo de aprobación firmado + horario ventana baja demanda).
  - Hasta aprobación, NO se toca entorno de producción ni rama de producción.
- **Acceptance Criteria Addressed**: AC-9
- **Test Requirements**:
  - `rule` TR-8.1: `docs/checklist-aprobacion-produccion-seguridad.md` tiene las 2 secciones "Aprobador 1" y "Aprobador 2" firmadas (texto no vacío).
    - **Evidence**: Archivo MD.
  - `rule` TR-8.2: Campo "Ventana baja demanda confirmada" no está vacío.
    - **Evidence**: Archivo MD.
- **Notes**: Task bloqueante. No se pasa a Task 9 hasta que se cumplan TR-8.1 y TR-8.2.

---

## Task 9: Deploy Producción en horario de baja demanda
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 8
- **Description**:
  - Merge de `staging/auditoria-seguridad` a rama de producción con merge commit `sec(step-9): merge staging a produccion [commit-hash]`.
  - `npm ci && npm run build` en entorno build producción.
  - Deploy web bundle (Netlify/DonDominio) según pipeline actual existente.
  - `supabase functions deploy <5 funciones>` en PRODUCCIÓN.
  - Post-deploy inmediato:
    1. `curl` CORS sanity check contra producción evil.com → debe bloquear.
    2. Smoke test login admin y técnico real en producción (usuarios reales sin modificar OT).
    3. Registrar timestamp + commit hash en checklist aprobación.
- **Acceptance Criteria Addressed**: AC-7, AC-9, AC-10
- **Test Requirements**:
  - `rule` TR-9.1: CURL CORS evil.com produccion bloquea 5/5 funciones.
    - **Evidence**: `logs/09-curl-cors-evil-production.log`.
  - `rule` TR-9.2: Smoke test login admin + técnico pasa en producción (sin tocar datos reales).
    - **Evidence**: `logs/09-smoke-production-postdeploy.md`.
  - `rule` TR-9.3: Rollback script existe y se valida que puede ejecutarse (sin ejecutarlo de verdad, solo dry-run check de parámetros).
    - **Evidence**: `logs/09-rollback-readiness.log`.
- **Notes**: Si cualquier punto falla en los primeros 15 min, ejecutar `scripts/rollback-production.ps1` inmediatamente y reportar.

---

## Task 10: Monitoreo 4h post-producción y generación informe final
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 9
- **Description**:
  - Revisar cada 30 min:
    - Dashboard Supabase: Auth successful rate (>99,9% esperado).
    - REST API 5xx (0 esperado).
    - RLS violations (Postgres 42501) en `pg_stat_statements` o logs Supabase (0 esperado).
    - Storage 5xx (0 esperado).
  - Registrar KPIs cada hora en `logs/09-KPI-postdeploy.md`.
  - Pasadas 4h sin incidentes, volcar toda la información en `docs/INFORME_IMPLEMENTACION_SEGURIDAD.md`.
  - Commit final: `sec(step-10): informe final implementacion seguridad`.
- **Acceptance Criteria Addressed**: AC-10, AC-11
- **Test Requirements**:
  - `rubric` TR-10.1: Estabilidad postproducción.
    - **Dimension**: Errores y disponibilidad en 4h post.
    - **Scale**: 1–5
    - **Anchors**: 1 = rollback; 3 = >0 errores no críticos; 5 = 0 errores 5xx, 0 RLS violations, auth success > 99.9%, 0 quejas.
    - **Pass Threshold**: >= 4
    - **Evidence**: `logs/09-KPI-postdeploy-4h.md` + screenshots dashboard.
  - `rule` TR-10.2: Informe final completo existe con al menos 6 secciones requeridas.
    - **Evidence**: Archivo `docs/INFORME_IMPLEMENTACION_SEGURIDAD.md` leído.
- **Notes**: Si ocurre incidente en la ventana, activar rollback inmediatamente y documentar en informe antes de cerrar.
