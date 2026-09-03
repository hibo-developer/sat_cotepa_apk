# Checklist Aprobacion Produccion - Implementacion Seguridad H2-2026 SAT COTEPA

## METADATOS
| Campo | Valor (rellenar por responsable implementacion) |
|-------|-----------------------------------------------|
| **Responsable Implementacion** | `_____Nombre_____` (firmar: `__________`) |
| **Aprobador 1 (Seguridad/Unico Aprobador Designado)** | `_____Nombre_____` (firmar: `__________`) |
| **Fecha** | `dd/mm/yyyy` |
| **Rama de staging** | `staging/auditoria-seguridad` |
| **Commit baseline (pre-fixes)** | `014a5fe` sec(step-0): baseline |
| **Commit final staging a desplegar** | `__________` (hash HEAD) |
| **Ventana baja demanda confirmada** | `SABADO 06/09/2026 02:00 - 04:00 CET` |
| **Proyecto Supabase Staging REF** | `__________` (crear proyecto staging OQ-1) |
| **Proyecto Supabase Produccion REF** | `__________` |

---

## BLOQUE 1. STAGING COMPLETADO - CHECKLIST PRE-GATE
_(marcar con `[x]` y adjuntar evidencia en columna)._

| ID | Item (Acceptance Criteria) | Pass/Fail | Evidencia (ruta log / output) |
|----|-----------------------------|-----------|-------------------------------|
| AC-1 | `npm audit --production` retorna 0 vulnerabilidades | `[ ]` | `logs/05-preflight-*-audit.log` |
| AC-2 | `react-router-dom` >= 7.18.2 instalado | `[ ]` | `npm ls react-router-dom` |
| AC-3 | 5/5 Edge Functions comparten CORS whitelist estricta identica | `[ ]` | Grep ALLOWED_ORIGINS count=5 / origin||* count=0 |
| AC-4 | Smoke tests funcionales 3 roles (admin/oficina/tecnico) x 8 escenarios en Staging | `[ ]` | `logs/07-smoke-tests-staging.md` |
| AC-5 | Vitest 0 fallos (25/25) | `[ ]` | `logs/05-preflight-*-vitest.log` |
| AC-6 | Build Vite exit 0 + 0 secretos hardcodeados en `dist/` | `[ ]` | `logs/05-preflight-build.log` + secrets-scan.log |
| AC-7 | CURL evil.com contra 5 Edge Functions en STAGING rechaza ACAO (403/sin header) | `[ ]` | `logs/07-curl-cors-evil-staging.log` |
| AC-8 | Scripts rollback staging y produccion existen + dry-run ejecutados | `[ ]` | `rollback-staging -DryRun` exit 0 |
| SM-1 | Hardening Android Gradle: GradleException sin firma | `[x]` | diff commit 1bfbfef |
| SM-2 | Android Manifest sin requestLegacyExternalStorage | `[x]` | diff commit 1bfbfef |

> **Resultado Staging (marcar):** `[ ] LISTO PARA GATE PRODUCCION` | `[ ] BLOQUEADO (motivo: _______)`

---

## BLOQUE 2. GATES PRODUCCION (5 GATES - HARD CHECKS)
**IMPORTANTE:** Ningún gate posterior se abre sin que el anterior esté firmado.

### GATE 1. Verificar Staging Sano + Commit Hash
- Preflight staging ejecutado en ultimo commit del dia antes de la ventana: exit 0 `[ ]`
- Commit hash final staging = `__________` (firmar responsable): `__________`
- Firmado Aprobador (gate 1 superado): `__________` Fecha: `__/__`

### GATE 2. Aprobadores firman (documental)
- Aprobador 1 (unico designado) revisa checklist BLOQUE 1 y manifiesta conformidad:
  - Firma: `__________`  Fecha/Hora: `__/__  __:__`
  - Observaciones: `____________________`

### GATE 3. Ventana horaria + plan rollback confirmado
- Es SABADO 06/09/2026 entre 02:00-04:00 CET (baja demanda): `[ ]`
- Ventana reservada: `[ ]`  |  Duracion disponible: 2h |
- Estrategia Rollback automatico + manual compartida al equipo ops: `[ ]`
- Contacto on-call disponible durante 4h postdeploy: `__________` (movil: `____`)
- Firmado aprobador gate 3: `__________`  Hora: `__:__`

### GATE 4. Ejecutar Deploy Produccion
_(Se ejecuta DENTRO de la ventana baja demanda)._
1. `[ ]` Merge staging/auditoria-seguridad a rama prod (commit hash: `______`)
2. `[ ]` Build Vite prod + 0 secrets en dist/ (scan)
3. `[ ]` Deploy frontend bundle sat.cotepa.com (o Netlify)
4. `[ ]` Deploy 5x Edge Functions Supabase PROD via CLI
5. `[ ]` CURL CORS evil.com PROD bloquea 5/5 (log: `logs/09-curl-cors-evil-production.log`)
6. `[ ]` Smoke test login admin + tecnico REAL (sin tocar datos)
- Timestamp inicio ventana: `__:__` | Fin deploy: `__:__` | Duracion deploy: `_____` s
- Responsable deploy (firma): `__________`  (OK `[ ]` / ROLLBACK INICIADO `[ ]`)

### GATE 5. Monitoreo 4h Postproduccion + Cierre
Cada 30 min, registrar estado en tabla abajo. 0 RLS violations esperado, 0 5xx REST/Storage, Auth success > 99.9%.

| Tiempo (CET) | Auth success% | REST 5xx | Storage 5xx | Edge Fn 5xx | RLS viol. | Observaciones | Firmado |
|--------------|---------------|----------|-------------|-------------|-----------|---------------|---------|
| 02:15 (T+0)  |               |          |             |             |           |               |         |
| 03:00 (T+45) |               |          |             |             |           |               |         |
| 04:00 (T+105)|               |          |             |             |           |               |         |
| 05:00 (T+165)|               |          |             |             |           |               |         |
| 06:00 (T+225)|               |          |             |             |           |               |         |

**Fin Monitoreo (T+240) 06:00 CET** - Cierre proceso:
- Sin incidentes y checklist completo: MARCAR IMPLEMENTACION EXITOSA `[ ]`
- Con incidentes (no criticos sin impacto): MARCAR EXITOSA CON OBS `[ ]` (notas adjuntas)
- Con rollback: MARCAR FALLIDA + activar sec rollback `[ ]` (informe detalle al final)
- Firma cierre Aprobador: `__________`  Fecha 06/09/2026 Hora: `__:__`
