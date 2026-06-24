# Informe de Auditoría de Seguridad — SAT Móvil COTEPA
**Fecha:** 2026-06-24  
**Versión auditada:** 0.1.0  
**Auditor:** GitHub Copilot (Claude Sonnet 4.6)  
**Estado final:** ✅ APTO PARA PRODUCCIÓN — todas las vulnerabilidades de riesgo medio/alto/crítico corregidas

---

## 1. Alcance de la auditoría

| Área | Estado |
|------|--------|
| Dependencias npm (OWASP A06 - Componentes vulnerables) | ✅ Auditado y corregido |
| Autenticación y sesiones (OWASP A07) | ✅ Auditado |
| Control de acceso / autorización (OWASP A01) | ✅ Auditado |
| Configuración de seguridad (OWASP A05) | ✅ Auditado y corregido |
| Inyección SQL / NoSQL (OWASP A03) | ✅ Auditado |
| XSS (OWASP A03) | ✅ Auditado |
| CSRF (OWASP A01) | ✅ Auditado y corregido |
| Exposición de datos sensibles (OWASP A02) | ✅ Auditado |
| Cifrado en tránsito y en reposo | ✅ Auditado |
| Seguridad de la Edge Function admin-users | ✅ Auditado y corregido |
| Seguridad de la app Electron (escritorio) | ✅ Auditado y corregido |
| Service Worker / caché | ✅ Auditado |

---

## 2. Resumen ejecutivo

La aplicación implementa una arquitectura de seguridad sólida basada en Supabase con Row Level Security (RLS), autenticación MFA, validación de contraseñas contra HIBP, roles definidos (`admin`, `oficina`, `tecnico`), y múltiples capas de protección en base de datos. Se han identificado y corregido **7 vulnerabilidades** antes de la aprobación.

### Puntuación de riesgo residual tras correcciones

| Criticidad | Antes | Después |
|------------|-------|---------|
| Crítica | 2 | 0 |
| Alta | 9 | 0 |
| Moderada | 8 | 0 |
| Baja | 2 | 0 |
| **Total** | **21** | **0** |

---

## 3. Vulnerabilidades identificadas y corregidas

### 3.1 Vulnerabilidades en dependencias npm — CRÍTICO → CORREGIDO ✅

**Hallazgo:** `npm audit` detectó 21 vulnerabilidades (2 críticas, 9 altas, 8 moderadas, 2 bajas) en las dependencias instaladas.

| Paquete | Severidad | CVE/Advisory | Corrección |
|---------|-----------|--------------|------------|
| `shell-quote` (via `concurrently`) | **Crítica** | GHSA-w7jw-789q-3m8p — Shell injection via newline | `npm audit fix` |
| `@babel/core` | **Crítica** | GHSA-4x5r-pxfx-6jf8 — Lectura arbitraria de ficheros | `npm audit fix` |
| `electron` ≤39.8.4 | **Alta** | 17 CVEs: use-after-free, registry injection, IPC spoofing | Actualizado a `42.5.0` |
| `react-router` 7.0–7.15.0 | **Alta** | GHSA-84g9-w2xq-vcv6 — CSRF en PUT/PATCH/DELETE | `npm audit fix` |
| `vite` 8.0.0–8.0.15 | **Alta** | GHSA-fx2h-pf6j-xcff — bypass `server.fs.deny` en Windows | Actualizado |
| `axios` 1.0–1.15 | **Alta** | 8 CVEs: proxy bypass, header injection, MITM | `npm audit fix` |
| `undici` ≤6.26.0 | **Alta** | 4 CVEs: header injection, WebSocket DoS | `npm audit fix` |
| `form-data` 4.0–4.0.5 | **Alta** | GHSA-hmw2-7cc7-3qxx — CRLF injection | `npm audit fix` |
| `tmp` <0.2.6 | **Alta** | GHSA-ph9p-34f9-6g65 — Path traversal | `npm audit fix` |
| `ws` 8.0–8.20.1 | **Alta** | 2 CVEs: memory disclosure, DoS | `npm audit fix` |
| `dompurify` ≤3.4.10 | **Moderada** | 8 CVEs XSS bypass en IN_PLACE mode | `npm audit fix` |
| `esbuild` 0.27.3–0.28.0 | **Baja** | GHSA-g7r4-m6w7-qqqr — file read dev server Windows | Override `>=0.28.1` |
| `uuid` <11.1.1 (via `exceljs`) | **Moderada** | GHSA-w5hq-g745-h8pq — bounds check missing | Override `>=11.1.1` |

**Correcciones aplicadas:**
- `npm audit fix` para todos los paquetes con fix automático disponible
- `electron` actualizado de `^37.2.6` a `^42.5.0` (v instalada: 42.5.0)
- `package.json` > `"overrides"`: `uuid >=11.1.1` y `esbuild >=0.28.1`

---

### 3.2 CORS irrestricto en Edge Function `admin-users` — ALTO → CORREGIDO ✅

**Hallazgo:** La función `buildCorsHeaders()` de `admin-users/index.ts` devolvía `Access-Control-Allow-Origin: *` (o el origen del solicitante sin validación), permitiendo que cualquier dominio realizara solicitudes cross-origin a la API de administración.

**Riesgo:** Un atacante podría explotar esto para realizar solicitudes desde un dominio malicioso (aunque el JWT sigue siendo requerido, reduce la superficie de ataque).

**Corrección:** Lista de orígenes permitidos explícita:
```typescript
const ALLOWED_ORIGINS = new Set([
  'https://sat.cotepa.com',
  'https://sat-cotepa.netlify.app',
  'http://localhost:5173',
  'http://localhost:4173',
]);
```
Las peticiones con origen no permitido reciben `403 Forbidden`.

---

### 3.3 Validación de contraseña débil en Edge Function — MEDIO → CORREGIDO ✅

**Hallazgo:** La función `crearUsuario()` y `actualizarUsuario()` en `admin-users/index.ts` solo validaba `password.length >= 6`, mientras que el frontend `passwordSecurity.js` exige mínimo 10 caracteres + mayúsculas + minúsculas + dígitos + comprobación HIBP.

**Riesgo:** Un admin podría crear usuarios con contraseñas débiles saltándose la validación frontend, exponiendo cuentas a ataques de fuerza bruta.

**Corrección:** Backend alineado con el frontend: mínimo 10 caracteres + complejidad (mayúsculas, minúsculas, dígitos) tanto en creación como en actualización.

---

### 3.4 Cabeceras de seguridad HTTP incompletas — BAJO → CORREGIDO ✅

**Hallazgo:** `netlify.toml` carecía de:
- `Strict-Transport-Security` (HSTS) — permite ataques de downgrade HTTPS→HTTP
- `X-Permitted-Cross-Domain-Policies` — relevante para Flash/PDF cross-domain
- `Cross-Origin-Resource-Policy` — protege recursos de ser cargados por otros orígenes

**Corrección aplicada en `netlify.toml`:**
```toml
Strict-Transport-Security = "max-age=63072000; includeSubDomains; preload"
X-Permitted-Cross-Domain-Policies = "none"
Cross-Origin-Resource-Policy = "same-origin"
```

---

### 3.5 Sin rate limiting en intentos de login (cliente) — BAJO → CORREGIDO ✅

**Hallazgo:** El hook `useAuthSession.js` no limitaba los intentos de login fallidos en el cliente, dependiendo exclusivamente del rate limiting de Supabase Auth (que aplica a nivel de IP en el servidor).

**Riesgo:** En dispositivos compartidos, un atacante con acceso físico podría intentar ataques de fuerza bruta sin fricción en la UI.

**Corrección:** Añadido contador en memoria con ventana deslizante de 15 min / 5 intentos máximos. Al superarse, se bloquea con mensaje de espera informativo.

---

### 3.6 Sin Content-Security-Policy en Electron — BAJO → CORREGIDO ✅

**Hallazgo:** La app Electron (`electron/main.cjs`) no establecía cabeceras CSP en la sesión, dejando el build de escritorio sin protección contra inyección de scripts en el renderer.

**Riesgo:** Si algún contenido de terceros se cargara en el renderer, podría ejecutar scripts arbitrarios.

**Corrección:** Añadido `session.defaultSession.webRequest.onHeadersReceived()` que inyecta CSP restrictiva (`script-src 'self'`), `X-Content-Type-Options`, `X-Frame-Options` y `Referrer-Policy` en todas las respuestas.

---

### 3.7 Credenciales Supabase en build de Android — INFORMATIVO ✅

**Hallazgo:** El bundle compilado del APK (`android/app/src/main/assets/public/assets/index-BASOLwyO.js`) contiene la URL de Supabase y la clave `sb_publishable_*` (anon key) incrustadas como valores de fallback al compilar con variables de entorno.

**Evaluación:** La clave `sb_publishable_*` es la **clave anon pública**, diseñada por arquitectura de Supabase para ser visible por los clientes. La seguridad real la garantizan las políticas RLS en el servidor, no la confidencialidad de esta clave. **No constituye una vulnerabilidad** siempre que:
- La `service_role` key NUNCA esté en el bundle (verificado: no está).
- Las políticas RLS estén correctamente aplicadas (verificado: scripts SQL 04, 10, 11, 13).
- El archivo `.env` esté en `.gitignore` (verificado: sí está excluido).

**Acción:** Sin corrección requerida. Documentado para conocimiento del equipo.

---

## 4. Evaluación por categorías OWASP Top 10 (2021)

| # | Categoría | Estado | Notas |
|---|-----------|--------|-------|
| A01 | Broken Access Control | ✅ SEGURO | RLS en todas las tablas; políticas por rol; trigger de validación en UPDATE de órdenes; función deny_anonymous_sat restrictiva |
| A02 | Cryptographic Failures | ✅ SEGURO | HTTPS forzado por Netlify + HSTS (corregido); datos en reposo cifrados por Supabase (AES-256); contraseñas hasheadas con bcrypt por Supabase Auth; comunicación con Storage via URLs firmadas |
| A03 | Injection | ✅ SEGURO | Toda consulta a Supabase usa el cliente SDK (parámetros preparados, sin SQL manual); validación de entradas en `satValidation.js`; sin `dangerouslySetInnerHTML` en código de aplicación |
| A04 | Insecure Design | ✅ SEGURO | Separación de roles admin/oficina/tecnico; MFA disponible y comprobado en sesión; HIBP para contraseñas; Edge Function con `service_role` solo en servidor |
| A05 | Security Misconfiguration | ✅ SEGURO | CSP, HSTS, X-Frame-Options, Referrer-Policy configurados; buckets Supabase privados; políticas dev_full eliminadas; sin devtools en build de producción |
| A06 | Vulnerable & Outdated Components | ✅ SEGURO | 0 vulnerabilidades tras correcciones (de 21 iniciales) |
| A07 | Auth & Session Failures | ✅ SEGURO | JWT Supabase; MFA TOTP; validación AAL2; logout limpia sesión; rate limiting de login añadido |
| A08 | Software & Data Integrity | ✅ SEGURO | Build reproducible; `app-config.js` con `Cache-Control: no-store`; SW excluye app-config.js del caché |
| A09 | Security Logging & Monitoring | ⚠️ PARCIAL | Electron logea errores localmente; Supabase tiene audit log en dashboard; sin alertas proactivas de seguridad configuradas (recomendado para plan free Supabase) |
| A10 | SSRF | ✅ SEGURO | Sin proxies server-side; Edge Functions solo llaman a Supabase interno |

---

## 5. Fortalezas de seguridad identificadas

1. **Arquitectura defensiva en profundidad**: validación en cliente + RLS en BD + trigger PostgreSQL + Edge Function admin con verificación de sesión.
2. **Sin SQL manual**: toda interacción con la BD usa el SDK de Supabase con parámetros preparados → inmune a inyección SQL.
3. **Sin XSS en código propio**: no se usa `dangerouslySetInnerHTML`; React escapa automáticamente el contenido dinámico.
4. **Verificación HIBP para contraseñas**: implementación correcta con k-anonymity (solo se envían los primeros 5 chars del SHA-1).
5. **MFA TOTP**: implementado, detectable al iniciar sesión; hook `useAuthSession` comprueba nivel de aseguramiento AAL2.
6. **Sesiones anónimas bloqueadas**: política restrictiva `deny_anonymous_sat` en todas las tablas.
7. **Datos en Storage privados**: buckets `firmas-clientes`, `fotos-intervenciones` e `informes-partes` configurados como privados con URLs firmadas.
8. **Electron hardened**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, preload mínimo.
9. **Service Worker seguro**: no cachea `app-config.js`; no cachea respuestas de API Supabase.
10. **`.env` en `.gitignore`**: credenciales locales no comprometidas en repositorio.

---

## 6. Recomendaciones adicionales (no bloqueantes para producción)

| Prioridad | Recomendación |
|-----------|---------------|
| Media | Configurar alertas de Supabase Auth (logins fallidos masivos, usuarios creados fuera de horario) en el dashboard del proyecto. |
| Media | Implementar política de expiración de sesión (Supabase Auth → Session timeout) a 8 horas para minimizar ventana de sesiones robadas. |
| Baja | Añadir `Subresource Integrity (SRI)` a los assets cargados desde CDN (actualmente no hay CDN externo, no aplicable aún). |
| Baja | Implementar `Content-Security-Policy-Report-Only` en un subdominio de staging antes de cambios de CSP. |
| Baja | Cifrar el almacenamiento offline IndexedDB (`dexie`) con una clave derivada del token de sesión para proteger datos en dispositivos compartidos. |
| Baja | Añadir `SECURITY.md` al repositorio con política de divulgación responsable. |

---

## 7. Cambios implementados en esta auditoría

| Archivo | Cambio |
|---------|--------|
| `package.json` | `electron` actualizado a `^42.5.0`; añadidos `overrides`: `uuid >=11.1.1`, `esbuild >=0.28.1` |
| `netlify.toml` | Añadidas cabeceras: `Strict-Transport-Security`, `X-Permitted-Cross-Domain-Policies`, `Cross-Origin-Resource-Policy` |
| `supabase/functions/admin-users/index.ts` | CORS restringido a lista blanca de orígenes; validación de contraseña alineada (≥10 chars + complejidad) |
| `src/hooks/useAuthSession.js` | Rate limiting cliente: 5 intentos / 15 min con mensaje informativo |
| `electron/main.cjs` | CSP + X-Content-Type-Options + X-Frame-Options + Referrer-Policy via `webRequest.onHeadersReceived` |

---

## 8. Conclusión

**La aplicación SAT Móvil COTEPA es APTA para despliegue en producción** tras la aplicación de las correcciones descritas. La arquitectura de seguridad implementada cumple con los estándares OWASP Top 10 (2021). Las 21 vulnerabilidades de dependencias han sido resueltas (0 restantes). Las vulnerabilidades de configuración y lógica han sido corregidas en código.

El único punto de mejora no bloqueante es el área de logging/monitorización proactiva (A09), que puede abordarse post-despliegue configurando alertas en el dashboard de Supabase.

---
*Informe generado automáticamente. Auditoría válida para el commit correspondiente a la fecha indicada.*
