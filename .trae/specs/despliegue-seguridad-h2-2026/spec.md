# Implementación Escalonada Segura de Hallazgos de Seguridad - Product Requirements Document (PRD)

## Overview
- **Summary**: Implementación controlada, por fases y sin interrupciones de las correcciones de seguridad derivadas de la auditoría de ciberseguridad realizada el 2026-09-03 sobre la aplicación web SAT Móvil COTEPA. Se abordarán 3 acciones OBLIGATORIAS (alta severidad: dependencias vulnerables + CORS inconsistente + endurecimiento Auth Supabase) y 5 mejoras de severidad MEDIA, aplicadas primero en un entorno de staging idéntico, con puertas de aprobación, rollback automático/manual y monitoreo continuo antes de tocar producción.
- **Purpose**: Cerrar las brechas de seguridad detectadas (GHSA react-router, tar DoS, brace-expansion DoS, CORS permissivo en 3 Edge Functions, datos offline sin cifrado, rate limit solo cliente, signing condicional Android/Electron) sin generar tiempo de inactividad ni regresiones funcionales.
- **Target Users**: Administradores SAT (gestión de usuarios, borrado GDPR), personal de Oficina (envío de correos, generación de PDFs), Técnicos SAT (consulta de OT, generación de partes offline).

## Goals
1. **G1 — Vulnerabilidades Cerradas**: Las 6 CVEs/GHSAs de `npm audit` quedan con 0 pendientes en `--production`.
2. **G2 — CORS Unificado**: Las 5 Edge Functions comparten la misma whitelist estricta de orígenes.
3. **G3 — Endurecimiento Auth**: Supabase Auth contará con Captcha + política explícita (longitud mínima, signup deshabilitado, rate limit) validados en dashboard y reflejados en checklist del proyecto.
4. **G4 — Staging Idéntico**: Existe una rama `staging/auditoria-seguridad` y un checklist de paso a producción (smoke tests + preflight) que demuestra equivalencia funcional antes y después.
5. **G5 — Cero Interrupciones**: Todas las correcciones son backward compatible; el build de producción compila, la suite de tests (vitest) pasa, y el bundle web no contiene regressions visuales ni funcionales detectables.
6. **G6 — Rollback Automático + Manual**: Cada fase tiene un script de rollback (git reset + npm ci al commit anterior + supabase db revert con SQL de rollback por Edge Function).
7. **G7 — Registro Completo**: Se genera un informe final de implementación (`INFORME_IMPLEMENTACION_SEGURIDAD.md`) con timestamps, responsables, aprobaciones, KPIs de monitorización y cero fallos post-implementación.

## Non-Goals
- **NG-1**: No se añaden nuevas funcionalidades de negocio (nuevas vistas, flujos UX, campos en BD).
- **NG-2**: No se modifican policies RLS existentes ni migraciones aplicadas (las correcciones solo añaden nuevas migraciones o ajustan funciones/Edge Functions que no alteran datos de producción).
- **NG-3**: No se implementa cifrado cliente-sído IndexedDB en esta fase (queda fuera del scope por esfuerzo e impacto; se documenta como mejora futura).
- **NG-4**: No se adquieren certificados de firma de código pago (Electron EV) ni cambios de proveedor.
- **NG-5**: No se activa MFA obligatorio para todos los usuarios (permanece optativo por ahora; solo se valida que esté disponible).
- **NG-6**: No se reestructuran tablas ni datos existentes. Las migraciones son puramente aditivas o de ajuste de funciones SECURITY DEFINER sin cambios estructurales.

## Background & Context
Hallazgos de la auditoría del 2026-09-03 que motivan este proyecto:
- **H1 (Critical/HIGH)**: `tar` ≤7.5.20, `brace-expansion` múltiples versiones con DoS exponencial; `react-router` 7.14.2 (GHSA-qwww-vcr4-c8h2).
- **H3 (MEDIUM)**: CORS `*` en 3 de 5 Edge Functions (`storage-signed-url`, `generate-part-pdf`, `send-sat-email`); `admin-users` y `gdpr-delete-client` ya usan whitelist.
- **M3 (MEDIUM)**: Rate limit de login solo implementado en cliente; dashboard de Supabase Auth sin Captcha ni políticas explícitas configurables por código.
- **M4 (MEDIUM)**: Signup público no deshabilitado de forma verificable en el código (requiere dashboard).
- **M5 (MEDIUM)**: Firma de código Electron (`signAndEditExecutable=false` en build) — se activa cuando hay certificado pero no hay fallback de advertencia.
- **M6 (MEDIUM)**: Build Android release **no falla** cuando falta keystore, solo imprime advertencia.
- **M7 (LOW)**: `requestLegacyExternalStorage="true"` redundante en targetSdk=36.
- Auditoría anterior (2026-06-27) corrigió C1-C4 (RLS clientes/equipos, GDPR, Proguard, network_security_config) — **NO se tocan esos fixes**.

## Functional Requirements
- **FR-1 (Updates Dependencias)**: Script `scripts/apply-security-updates.ps1` que ejecuta `npm audit fix` + actualización manual dirigida de `react-router-dom` a ≥7.18.2, generando automáticamente un `git diff` y un archivo de rollback `rollback-package-json.diff`.
- **FR-2 (CORS Unificado Edge Functions)**: Las 3 Edge Functions pendientes validan el `Origin` contra la misma whitelist estricta que `admin-users` (`ALLOWED_ORIGINS = {https://sat.cotepa.com, https://sat-cotepa.netlify.app, http://localhost:5173, http://localhost:4173}`). Requests sin `Origin` se aceptan por diseño (móvil nativo Capacitor no envía Origin).
- **FR-3 (Scripts de Preflight Staging)**: `scripts/preflight-staging.ps1` ejecuta (1) `npm audit --production` con output 0 vulnerabilidades, (2) `npm run test` (vitest) 0 fallos, (3) `npm run build` sin errores, (4) verificación CORS por `curl -X OPTIONS -H "Origin: https://evil.com"` contra cada Edge Function después de deploy staging, (5) verificación que `service_role` y `SUPABASE_SERVICE_ROLE_KEY` no aparecen en `dist/`.
- **FR-4 (Scripts de Rollback)**: `scripts/rollback-staging.ps1` y `scripts/rollback-production.ps1` que hacen: `git stash` o `git checkout <commit-previo>`, `npm ci`, `supabase functions deploy` a versión anterior guardada, backup de `package-lock.json` timestamped.
- **FR-5 (Checklist Aprobación Producción)**: `docs/checklist-aprobacion-produccion-seguridad.md` con: fecha, responsable, checklist binario (aprobado/rechazado) por cada AC, campo de aprobación firmada, horario de baja demanda seleccionado (ej: 02:00–04:00 CET fin de semana).
- **FR-6 (Informe Final)**: Al concluir, se genera `docs/INFORME_IMPLEMENTACION_SEGURIDAD.md` con logs de cada paso, outputs de `npm audit`, resultados tests, confirmación de 0 fallos en monitoreo 4h post-producción.

## Non-Functional Requirements
- **NFR-1 (Zero Downtime Web Build)**: El build de producción (`npm run build`) tarda <120s y no requiere migraciones BD destructivas. Única migración posible: ajuste de CORS Edge Functions (sin impacto en datos).
- **NFR-2 (Backward Compatibility 100%)**: Ningún cambio puede romper la API cliente existente. Las actualizaciones de react-router/dependencias deben pasar todos los tests existentes y un smoke test manual (login, listar OT, ver parte, cambiar contraseña, activar MFA) en staging con los 3 roles.
- **NFR-3 (Idempotencia)**: Todos los scripts deben ser idempotentes: ejecutarlos 2 veces seguidas produce el mismo resultado sin errores.
- **NFR-4 (Sin Datos PII en logs)**: Los scripts y procesos no loguean tokens, contraseñas, JWTs, ni emails. Outputs de `npm audit` y tests se guardan en `logs/` con 7 días de retención.
- **NFR-5 (Seguridad del propio pipeline)**: Los scripts `.ps1` NO contienen secrets hardcodeados; todo secret viene de `.env`/variables de entorno y `.env` continúa en `.gitignore`.
- **NFR-6 (Tiempo rollback < 10 min)**: El rollback de cada etapa (staging y producción) debe completarse en menos de 10 minutos.
- **NFR-7 (Auditabilidad)**: Cada commit del proyecto de implementación comienza con el prefijo `sec(step-N):` y referencia el ID de la tarea en `tasks.md`.

## Constraints
- **Technical**:
  - Se conservan las versiones mayores de React 19, Vite 8, Supabase 2.49.x — solo bumps de versión parche o menor.
  - No se puede ejecutar `supabase db push` en producción sin aprobación explícita escrita.
  - Edge Functions deben seguir funcionando en Deno runtime de Supabase (no se cambia runtime).
- **Business**:
  - Ventana de mantenimiento: solo horarios de baja demanda (02:00–04:00 CET, sábados o domingos).
  - Se requiere aprobación escrita del Responsable de Seguridad y del Responsable de Operaciones antes de tocar producción.
  - La app debe permanecer disponible durante todo el proceso (staging se valida completamente PRIMERO).
- **Dependencies**:
  - `npm` debe estar disponible en el PATH (PowerShell).
  - CLI de Supabase (`supabase` command) instalado y autenticado.
  - Acceso de lectura/escritura al repo Git y permisos para crear ramas `staging/*` y `hotfix/rollback/*`.

## Assumptions
- **A1**: Existe un proyecto Supabase de staging idéntico (mismo schema, mismos buckets, mismas Edge Functions desplegadas) al que podemos deployar `staging/auditoria-seguridad` sin afectar usuarios reales. Si no existe, el usuario aprobará crearlo como prerequisito.
- **A2**: El usuario cuenta con acceso al dashboard de Supabase para validar manualmente los ajustes de Auth (Captcha, disable signup, min password length). Estos ajustes se confirman por checklist, no se automatizan por API para evitar riesgo.
- **A3**: El repositorio tiene un `origin` Git configurado correctamente y se permite crear commits en una rama nueva.
- **A4**: Los commits de staging deben revisarse en un PR antes del merge a `main`/rama de producción.
- **A5**: El bundle web desplegado usa la estrategia de `app-config.js` con `Cache-Control: no-store` (ya implementada) por lo que el rollback de assets se refleja instantáneamente sin purgar CDN.

## Acceptance Criteria

### AC-1: `npm audit --production` retorna 0 vulnerabilidades
- **Type**: `rule`
- **Given**: El proyecto en staging tiene `package.json` y `package-lock.json` modificados con los fixes.
- **When**: Se ejecuta `npm audit --production --omit=dev`.
- **Then**: El comando sale con código de salida 0 y el reporte muestra `0 vulnerabilities (0 low, 0 moderate, 0 high, 0 critical)`.
- **Pass Condition**: Exit code 0 + string "0 vulnerabilities" presente en stdout.
- **Evidence**: Salida de `scripts/run-npm-audit-and-log.ps1` guardada en `logs/YYYYMMDD-HHMMSS-npm-audit.log`.

### AC-2: `react-router-dom` está actualizado a versión ≥7.18.2
- **Type**: `rule`
- **Given**: `package-lock.json` generado después del fix.
- **When**: Se ejecuta `npm ls react-router-dom react-router`.
- **Then**: Ambas dependencias muestran versión ≥ 7.18.2 y ≥ 7.18.2 respectivamente, sin dedup warnings sobre versiones vulnerables (7.12.0–7.18.1).
- **Pass Condition**: Output de `npm ls` con versiones corregidas y 0 entries en el rango vulnerable.
- **Evidence**: Log `logs/YYYYMMDD-HHMMSS-npm-ls-router.log`.

### AC-3: 5 de 5 Edge Functions usan whitelist CORS estricta idéntica
- **Type**: `rule`
- **Given**: Código fuente de las 5 Edge Functions (`admin-users`, `gdpr-delete-client`, `storage-signed-url`, `generate-part-pdf`, `send-sat-email`) en staging.
- **When**: Se ejecuta `grep` por `ALLOWED_ORIGINS` y `Access-Control-Allow-Origin` en cada `index.ts`.
- **Then**: Las 5 tienen la misma estructura `ALLOWED_ORIGINS = new Set(['https://sat.cotepa.com', 'https://sat-cotepa.netlify.app', 'http://localhost:5173', 'http://localhost:4173'])` y NINGUNA tiene el patrón `origin || '*'` como fallback originAllowed=true.
- **Pass Condition**: Coincidencia exacta en las 5 funciones.
- **Evidence**: Output de `grep -rn "ALLOWED_ORIGINS\|Access-Control-Allow-Origin" supabase/functions/` guardado en `logs/`.

### AC-4: Smoke test funcional en Staging pasa para los 3 roles
- **Type**: `rubric`
- **Dimension**: Cobertura y fiabilidad de los smoke tests manuales en staging (login, listar OT, abrir parte, enviar PDF/email, gestión admin usuarios, activar MFA TOTP, logout, reinicio offline + resync).
- **Scale**: 1–5
- **Anchors**: 1 = tests no ejecutados; 3 = solo 1 rol probado con regresiones menores; 5 = los 3 roles (admin, oficina, técnico) probaron 10 escenarios cada uno sin regresiones.
- **Pass Threshold**: >= 4 (al menos 2 roles probados con cero regresiones y el tercero sin fallos críticos)
- **Evidence**: Checksheet `docs/checklist-aprobacion-produccion-seguridad.md` con casillas marcadas, hora y firma del tester.

### AC-5: Suite de tests unitarios `npm run test` pasa con 0 fallos
- **Type**: `rule`
- **Given**: Rama staging después de los cambios, `npm ci` ejecutado.
- **When**: `npm run test` (vitest run).
- **Then**: El comando retorna exit code 0; 0 tests failed; todos los archivos de test existentes pasan.
- **Pass Condition**: Exit code 0 + cadena "Test Files  passed | Tests  passed" sin ningún "failed".
- **Evidence**: Log `logs/YYYYMMDD-HHMMSS-vitest.log`.

### AC-6: Build Vite de producción (`npm run build`) compila sin errores y sin secretos filtrados
- **Type**: `rule`
- **Given**: Rama staging.
- **When**: `npm run build` + `grep -r "service_role\|SUPABASE_SERVICE_ROLE_KEY\|eyJhbGciOiJIUzI1Ni" dist/ --exclude-dir=assets`.
- **Then**: Build exit code 0, y el grep devuelve 0 resultados (ningún secret en `dist/`).
- **Pass Condition**: Build exit 0 AND grep count == 0.
- **Evidence**: Log build y grep en `logs/`.

### AC-7: CORS malicioso es rechazado en staging para las 5 Edge Functions
- **Type**: `rule`
- **Given**: 5 Edge Functions deployadas en staging Supabase.
- **When**: `curl -X OPTIONS -H "Origin: https://evil-attacker.com" -I "$STAGING_URL/functions/v1/<nombre-funcion>"` para las 5.
- **Then**: Todas responden o bien con HTTP 403 "Origen no permitido", o bien sin header `Access-Control-Allow-Origin`. Ninguna devuelve `Access-Control-Allow-Origin: *` ni `Access-Control-Allow-Origin: https://evil-attacker.com`.
- **Pass Condition**: 5/5 funciones bloquean Origin no autorizado.
- **Evidence**: Output curl guardado en `logs/`.

### AC-8: Scripts de rollback existen, son idempotentes y reversan los cambios en <10 min
- **Type**: `rubric`
- **Dimension**: Completitud y fiabilidad del mecanismo de rollback (staging y producción)
- **Scale**: 1–5
- **Anchors**: 1 = sin scripts rollback; 3 = scripts rollback básicos solo git sin Supabase; 5 = existen `rollback-staging.ps1` y `rollback-production.ps1` con backup automático, `git reset` al commit hash anterior, `npm ci`, rollback SQL/function por Edge Function, y prueba en staging de que rollback funciona en < 10 minutos con 0 errores.
- **Pass Threshold**: >= 4
- **Evidence**: Archivos `scripts/rollback-*.ps1` existen; salida de prueba de rollback en staging con timestamps.

### AC-9: Checklist de aprobación de producción está completo y firmado
- **Type**: `rule`
- **Given**: Todos los AC-1 a AC-8 han pasado en staging.
- **When**: Se revisa `docs/checklist-aprobacion-produccion-seguridad.md`.
- **Then**: Existe fecha de aprobación, responsable (nombre+email), aprobación para cada item (SÍ), horario de baja demanda confirmado, y firma/confirmación de 2 aprobadores (Seguridad + Operaciones).
- **Pass Condition**: 100% checks marcados SÍ + 2 aprobadores.
- **Evidence**: El propio archivo MD con las secciones completadas.

### AC-10: Post-producción 4h sin incidentes (0 errores 5xx, 0 errores RLS, login success rate >99.9%)
- **Type**: `rubric`
- **Dimension**: Estabilidad del entorno de producción durante las 4 horas posteriores al despliegue
- **Scale**: 1–5
- **Anchors**: 1 = incidente crítico (rollback forzoso); 3 = errores menores sin impacto usuario; 5 = 0 errores 5xx Supabase, 0 errores RLS (42501), tasa éxito login >99.9% en logs de Supabase, sin quejas de usuarios.
- **Pass Threshold**: >= 4
- **Evidence**: Capturas de dashboard Supabase (metrics: auth, rest, storage) + `logs/YYYYMMDD-HHMM-postdeploy-monitoring-4h.md`.

### AC-11: Informe final generado con trazabilidad end-to-end
- **Type**: `rule`
- **Given**: Producción establecida y monitoreo 4h completado.
- **When**: Se abre `docs/INFORME_IMPLEMENTACION_SEGURIDAD.md`.
- **Then**: Contiene: commit IDs staging y producción, timestamps inicio/fin, responsables, ACs superados con enlaces a logs, KPIs post-despliegue, declaración explícita "0 fallos en producción después de finalización".
- **Pass Condition**: Todas las secciones informativas completadas con datos reales.
- **Evidence**: El archivo MD existe y está completo.

## Decisiones Aprobadas (Open Questions Resueltas 2026-09-03)
- [x] **OQ-1** (Staging Supabase): **Resuelta: No existe → Se aprueba crearlo.** Procedimiento: validación staging en webapp de preview deploy + Edge Functions desplegadas en staging project Supabase (supone creación del proyecto staging o uso de URL alternativa en netlify). Si no hay proyecto Supabase staging real, las validaciones Edge Functions se hacen en build local + pruebas sintácticas, y el deploy real de Edge Functions se realiza solo en producción durante la ventana aprobada (con rollback inmediato si falla smoke test post-deploy).
- [x] **OQ-2** (Ventana baja demanda): **Resuelta: SÁBADO 06/09/2026 02:00–04:00 CET.** Todo deploy a producción ocurrirá DENTRO de esta ventana exclusivamente.
- [x] **OQ-3** (Cantidad aprobadores): **Resuelta: 1 solo aprobador designado.** Checklist reducido de 2 aprobadores a 1 (suficiente para tamaño del proyecto). El aprobador designado completará la sección "Firma Aprobación Producción" en `docs/checklist-aprobacion-produccion-seguridad.md` antes del deploy.
- [x] **OQ-4** (Bloqueo build Android sin firma → M6): **Resuelta: SÍ, aprobar bloqueo estricto.** Se añade `throw new GradleException` en `android/app/build.gradle`. Builds Android release sin keystore fallarán explícitamente en pipeline CI/CD.
- [x] **OQ-5** (Limpiar `requestLegacyExternalStorage` → M7): **Resuelta: SÍ, incluir.** Se elimina el atributo de `AndroidManifest.xml`.
- **Aclaración operativa adicional del usuario (2026-09-03)**: **En producción SOLAMENTE se utiliza la APLICACIÓN WEB.** Los builds Android y Electron siguen recibiendo los fixes de seguridad por completitud del código, pero NO son parte del despliegue productivo. El monitoreo 4h post-deploy aplica solo al entorno Web + Edge Functions Supabase.
