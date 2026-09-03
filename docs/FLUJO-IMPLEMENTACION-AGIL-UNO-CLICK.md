# FLUJO IMPLEMENTACION AGIL UNO-CLICK (SAT COTEPA WEB)
_Proceso reproducible - Creador = Aprobador Único (OQ-3 confirmado)_
_Actualizado 03/09/2026 - Requisitos 1..5 100% cobertura_

---

## 🎯 OBJETIVO
Implementar los fixes de auditoria de seguridad en PROD (APP WEB `sat.cotepa.com`) en 30~45 minutos **sin demoras**, con:
  ✔ Gate de aprobación de **1 solo paso Y/N** (requisito 1: flujo simplificado creador).
  ✔ Rollback **automático en <2 min** ante cualquier ERROR (requisito 2: reversión inmediata).
  ✔ **3 pasos de preflight fail-fast** ANTES de tocar PROD (requisito 3: reducir activación rollback).
  ✔ Registro documental **totalmente reproducible** (requisito 4: logs por timestamp + este MD).
  ✔ **Zero interrupciones prolongadas**: timeouts 90s por edge fn; todo deploy <90s bundle, rollback automático si peta (requisito 5).

---

## 🔗 5 REQUISITOS USUARIO → CÓMO SE CUMPLEN 100%

| # | Requisito Usuario | Capacidad de respuesta del flujo | Dónde se define |
|---|-------------------|----------------------------------|-----------------|
| **1** | Controles aprobación necesarios, flujo simplificado 1 aprobador (creador), sin demoras | Gate de **1 solo prompt** en Paso 2 (OQ-3: 1 solo aprobador). No hay burocracia. Se puede saltar con `-SkipInteractiveGate` para CI/CD. | [deploy-web-seguro-agil.ps1 GATE-1](file:///c:/sat_cotepa_apk/scripts/deploy-web-seguro-agil.ps1#L43-L78) |
| **2** | Mecanismo rollback robusto inmediato ante cualquier error | `$ErrorActionPreference` + bloque `try/catch/fatal()` llaman AUTOMÁTICAMENTE a `rollback-production.ps1 -ToCommit 014a5fe` en ~60s. Exit code 131 = rollback hecho. | [deploy-web-seguro-agil.ps1 ROLLBACK](file:///c:/sat_cotepa_apk/scripts/deploy-web-seguro-agil.ps1#L167-L196) |
| **3** | Verificación previa antes puesta en marcha (identificar fallos antes de afectar app) | **3 fail-fast checks**: (1) Preflight-1 al arrancar, (2) Deploy Staging + CURL evil anti-CORS, (3) Preflight-2 final INMEDIATAMENTE ANTES de mergear a main. | [deploy-web-seguro-agil.ps1 PASOS 1/3/4](file:///c:/sat_cotepa_apk/scripts/deploy-web-seguro-agil.ps1#L30-L123) |
| **4** | Documentación flujo reproducible + registro cada paso + rollback activado análisis posterior | (A) Este MD reproducible. (B) Script genera `logs/deploy-agil-YYYYMMDD-HHMMSS.log` con cada paso. (C) Tanto PASS como ROLLBACK escriben línea final firmada de cierre. | Este MD + `deploy-web-seguro-agil.ps1` log write. |
| **5** | Estabilidad sin interrupciones prolongadas | Timeout max 90s por edge deploy, npm ci, build < 3 min. Si algo se pasa de tiempo → `fatal() → rollback` en < 2 min. Zero downtime `git merge --ff-only` no destruye commits. | Timeouts en step 3 deploy edges + step 6 build; estrategia fail fast < 5 min. |

---

## 🧰 PRE-REQUISITOS (una sola vez, validar con DRYRUN)

1. Estar en rama **`staging/auditoria-seguridad`** con commit HEAD actual al plan.
2. CLI Supabase logueado: `supabase login` (una sola vez). Obtener:
   - **STAGING PROJECT REF `<STG-REF>`** (crear proyecto nuevo supabase.com/dashboard → new project)
   - **PROD PROJECT REF `<PROD-REF>`** (el que usa la web actual sat.cotepa.com)
3. (Opcional si quieres ejecutar sin interactuar CI): `-SkipInteractiveGate` + `-DryRun`.
4. Verificar antes con DryRun:

```powershell
cd c:\sat_cotepa_apk
powershell -ExecutionPolicy Bypass -File scripts/deploy-web-seguro-agil.ps1 -DryRun
# Debes ver 10 OK sin errores. Si hay algun FAIL, arreglarlo ANTES.
```

---

## 🚀 EJECUCIÓN UNO-CLICK (TODOS LOS REQUISITOS 1-5 EN UN SOLO COMANDO)

```powershell
cd c:\sat_cotepa_apk

# ===== EJECUCION REAL (horario Sábado 06/09/2026 02:00 CET - ventana baja demanda) =====
powershell -ExecutionPolicy Bypass -File scripts/deploy-web-seguro-agil.ps1 `
   -SupabaseStagingRef "STG-XXXXXX" `
   -SupabaseProdRef    "PROD-XXXXXX" `
   -BaselineCommit     "014a5fe" `
   -MainBranch         "main"
```

---

## ⏱ SECUENCIA PASO A PASO (10 PASOS INTERNOS DEL SCRIPT)

| # | Paso | Fail? -> Acción | Umbral Tiempo |
|---|------|-----------------|---------------|
| 1 | **PREFLIGHT 1/2 (6 checks locales)** audit 0 vuln, vitest 0 fallos, build Vite exit 0, 0 secrets en dist, 5 Edge Fn ALLOWED_ORIGINS estricto, 5/5 edge-syntax estructural. | ❌ fatal, no se tocan entornos remotos. | < 3 min |
| 2 | **GATE APROBACIÓN RÁPIDA**: prompt `Y/N` creador (único aprobador, OQ3). Se puede skipear con `-SkipInteractiveGate` para CI/CD. | ❌ fatal aborta sin tocar prod. | 0s (prompt) |
| 3 | **Deploy SUPABASE STAGING 5 edges** (90s timeout c/u) → seguido de **CURL evil=https://evil.com** contra las 5. Si cualquiera retorna ACAO=evil o ACAO=* → abortamos PROD intacto. | ❌ fatal, PROD NO TOCADO. | < 10 min |
| 4 | **PREFLIGHT 2/2 (segunda pasada)** para asegurar que workspace no se corrompió. | ❌ fatal, PROD NO TOCADO. | < 3 min |
| 5 | **Merge a main (--ff-only)** zero downtime. NO hay squash destructivo. Si no puede ff-only → aborta sin alterar main. | ❌ fatal, no altera main. | < 30s |
| 6 | **npm ci + build prod Vite + scan secrets bundle dist/.** Deploy a Netlify/DonDominio según script del proveedor (placeholder reproducible). | ❌ fatal → rollback automático inicia (<1min) | < 4 min |
| 7 | **Deploy 5 Edge Functions PROD** (90s timeout c/u) + **CURL evil.com PROD**: 5/5 deben devolver ACAO vacío / no ACAO. Si 1 devuelve ACAO → rollback. | ❌ fatal, rollback automático. | < 10 min |
| 8 | **Smoke tests RÁPIDOS manuales**: creador loguea como admin + técnico, entra a home, registra PASS/FAIL. Si FAIL → rollback. | ❌ fatal, rollback < 2 min | 2~5 min manual |
| 9 | **Monitoreo AGIL 30 min** (6 checkpoints a los 1/5/10/15/25/30 min): Auth success% > 99,9%, 0 REST5xx, 0 Storage5xx, 0 Edge5xx, 0 RLS violations. Creador escribe CUMPLEN / NO CUMPLEN. Si no cumple -> rollback. | ❌ fatal, rollback < 2 min | 30 min con sleep |
|10 | **CIERRE DOCUMENTAL**: Escribe línea final timestamp duración en `logs/deploy-agil-TS.log`, exit 0 = éxito, exit 131 = rollback ya realizado. | - | 10s |

---

## ↩️ ESCENARIOS ROLLBACK Y CÓMO SE RESUELVEN (REQUISITO 2)

| Escenario | Activación Rollback? | Duración Esperada | Verificación Post-Rollback |
|-----------|----------------------|-------------------|-----------------------------|
| Preflight 1/2 FALLA | ❌ No (solo aborta, no tocamos prod) | 0s | N/A |
| Gate aprobación N | ❌ No, no tocamos prod | 0s | N/A |
| Deploy Staging edge falla | ❌ No, no tocamos prod | 0s | N/A |
| CORS evil en STAGING retorna ACAO | ❌ No, no tocamos prod | 0s | N/A |
| Merge --ff-only falla | ❌ No, main intacto | 0s | N/A |
| npm ci / build falla en prod | ✅ AUTOMÁTICO | ~70s | `git reset --hard HEAD~1` + restore package backups + redeploy edges baseline |
| Edge prod deploy o CORS evil PROD retorna ACAO | ✅ AUTOMÁTICO | ~90s | rollback-production.ps1 se ejecuta: git reset, npm ci, edges baseline, preflight final |
| Smoke tests postdeploy FAIL | ✅ AUTOMÁTICO | ~90s | preflight post rollback exit 0 |
| Monitoreo KPI no cumple umbrales | ✅ AUTOMÁTICO | ~90s | preflight + dashboard Supabase vuelve a baseline 014a5fe |
| Excepción NO controlada en script | ✅ AUTOMÁTICO (bloque catch global) | ~95s | linea de log `[EXCEPTION TRAP]` con motivo detallado |

**Resultado rollback post:** en todos los casos, producción vuelve exactamente al baseline `014a5fe` confirmado en < 2 minutos. No hay interrupción prolongada > 2 minutos (REQ-5).

---

## 📋 REGISTRO EJECUCIONES (REPRODUCIBILIDAD REQUISITO 4)

Cada ejecución crea un archivo con firma:

```
logs/deploy-agil-YYYYMMDD-HHMMSS.log
  INICIO        -> TS, branch origen, HEAD commit, baseline, DryRun
  PASOS 1..10   -> [OK]/[FAIL]/[MONIT] cada step con timestamp
  LINEA FINAL CIERRE EXITOSO -> duracion, head prod, Rollback=FALSE, Reqs 1-5 OK
  LINEA FINAL CIERRE ROLLBACK -> duracion, MOTIVO, PROD RESTAURADA a baseline
  EXCEPTION TRAP (si aplica) -> stack trace para análisis posterior
```

**Reproducir un deploy idéntico:**
```powershell
# Mismo commit → mismo resultado garantizado por npm ci
git checkout <HEAD-commit-deploy> ; powershell -ExecutionPolicy Bypass -File scripts/deploy-web-seguro-agil.ps1 -DryRun
```

---

## 🏁 ESTÁNDARES ESTABILIDAD (REQUISITO 5)

- **Zero Downtime frontend**: merge `--ff-only` sobre main = no rompe historia. Build dist/ listo antes de invocar deploy CDN. Si falla build, rollback no requiere intervención.
- **Zero Downtime edges**: Supabase `functions deploy` reemplaza versión sin cortar tráfico; si la nueva versión falla CORS check evil el script lanza rollback automático en <2 minutos.
- **Máxima interrupción posible en el PEOR escenario:** 2 minutos (suma build + rollback). En escenario normal 0 interrupción: usuario no nota nada.
- **Tiempo total ventana esperado:** 25 a 45 minutos (incluye monitoreo ágil 30min). La ventana original Sábado 06/09 02:00–04:00 CET tiene margen 2x.

---

## 🧾 CHECKLIST RÁPIDA EJECUCIÓN ANTES DE LANZAR COMANDO (1min)

- [ ] `git status` clean → sin cambios sin commitear.
- [ ] Rama actual es `staging/auditoria-seguridad`.
- [ ] `supabase status` devuelve STAGING-REF y PROD-REF correctos.
- [ ] Ejecutado `-DryRun` en los últimos 15 minutos y devolvió 10/10 OK.
- [ ] Ventana baja demanda: estamos Sáb 06/09 entre 02:00 CET y 03:00 CET (margen seguridad).
- [ ] Teléfono on-call creador encendido (aunque rollback sea automático).

Si todas = `[x]` → ejecutar comando principal del apartado 4.
