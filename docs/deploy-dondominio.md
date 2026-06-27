# Despliegue Web en Dondominio

Guia operativa para publicar la version web de SAT Movil COTEPA en un hosting estatico de Dondominio sin perder el endurecimiento de seguridad que hoy aplica Netlify.

---

## 1. Alcance

- Esta guia aplica solo a la version web servida desde `dist`.
- No aplica a Android ni a desktop.
- El frontend usa `HashRouter`, por lo que **no necesitas reglas de rewrite SPA** en Dondominio.

---

## 2. Que vas a publicar

Sube el contenido de `dist`.

Si quieres preparar una copia separada para Dondominio **sin tocar el despliegue actual de Netlify**, usa:

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/prepare-web-dondominio.ps1
```

Ese script crea una carpeta nueva bajo `release-web-dondominio/` con:

- una copia del `dist` actual
- un `.htaccess` listo para Apache/Dondominio
- un `sw.js` especial para Dondominio que se autodesactiva

No modifica `netlify.toml`, no borra nada de Netlify y no cambia el `dist` ya desplegado.

Lo visible para el navegador incluye:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Eso es correcto en este proyecto. **No** debes publicar nunca:

- `SUPABASE_SERVICE_ROLE_KEY`
- claves privadas
- credenciales SMTP
- tokens de Resend
- secretos de backend en variables `VITE_*`

---

## 3. Cabeceras que debes replicar en Dondominio

Estas son las cabeceras exactas equivalentes a las de `netlify.toml`:

### Globales para todo el sitio

```text
Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; manifest-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://api.pwnedpasswords.com; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; worker-src 'self' blob:
Permissions-Policy: geolocation=(self), camera=(self), microphone=(), payment=(), usb=(), bluetooth=()
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-Permitted-Cross-Domain-Policies: none
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

### Cache por ruta

```text
/: Cache-Control: no-cache, max-age=0, must-revalidate
/index.html: Cache-Control: no-cache, max-age=0, must-revalidate
/app-config.js: Cache-Control: no-store, no-cache, max-age=0, must-revalidate
/manifest.webmanifest: Cache-Control: no-cache, max-age=0, must-revalidate
/sw.js: Cache-Control: no-cache, max-age=0, must-revalidate
/assets/*: Cache-Control: public, max-age=31536000, immutable
```

---

## 4. Ejemplo para Apache (.htaccess)

Si tu hosting de Dondominio corre sobre Apache y permite `.htaccess`, este es el punto de partida:

```apache
<IfModule mod_headers.c>
  Header always set Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; manifest-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://api.pwnedpasswords.com; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; worker-src 'self' blob:"
  Header always set Permissions-Policy "geolocation=(self), camera=(self), microphone=(), payment=(), usb=(), bluetooth=()"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "DENY"
  Header always set X-Permitted-Cross-Domain-Policies "none"
  Header always set Cross-Origin-Opener-Policy "same-origin"
  Header always set Cross-Origin-Resource-Policy "same-origin"
</IfModule>

<IfModule mod_headers.c>
  <FilesMatch "^(index\.html|manifest\.webmanifest|sw\.js)$">
    Header always set Cache-Control "no-cache, max-age=0, must-revalidate"
    Header always unset Expires
  </FilesMatch>

  <Files "app-config.js">
    Header always set Cache-Control "no-store, no-cache, max-age=0, must-revalidate"
    Header always unset Expires
  </Files>
</IfModule>

<IfModule mod_setenvif.c>
  SetEnvIf Request_URI "^/assets/" is_asset_request
</IfModule>

<IfModule mod_headers.c>
  Header always set Cache-Control "public, max-age=31536000, immutable" env=is_asset_request
</IfModule>

<IfModule mod_expires.c>
  ExpiresActive On

  <FilesMatch "^(index\.html|app-config\.js|manifest\.webmanifest|sw\.js)$">
    ExpiresActive Off
  </FilesMatch>

  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType text/javascript "access plus 1 year"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType image/webp "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 1 year"
  ExpiresByType font/woff2 "access plus 1 year"
</IfModule>
```

Este ajuste intenta evitar exactamente el caso visto en producción: un `max-age=604800` global añadido por Apache/hosting incluso cuando tú ya defines `Cache-Control`.

Si Dondominio ignora parte de estas directivas, aplica al menos estas dos reglas:

- `app-config.js` con `no-store`
- `assets/` con cache larga

En este repositorio ya queda preparada una plantilla reutilizable en `deploy/dondominio/.htaccess`.

---

## 5. Verificaciones minimas tras subirlo

1. Abrir `/#/ordenes` y comprobar que carga sin errores.
2. Ver en DevTools que `app-config.js` responde con `Cache-Control: no-store`.
3. Ver que `index.html` y `sw.js` no quedan cacheados agresivamente.
4. Confirmar que los archivos bajo `/assets/` llevan cache larga.
5. Probar login real y revisar que no haya errores CSP en consola.
6. Confirmar que las llamadas a Supabase salen por HTTPS.
7. Confirmar que el `.htaccess` de Dondominio esta realmente aplicado por el servidor.

---

## 6. Riesgo real al publicarlo

Publicar `dist` en Dondominio **no expone secretos nuevos** si mantienes este criterio:

- Solo publicas `SUPABASE_URL` y `SUPABASE_ANON_KEY`
- No publicas secretos de backend
- Mantienes RLS y policies de Storage ya aplicadas en Supabase

El riesgo principal no es la anon key. El riesgo principal es **subirlo sin las cabeceras de seguridad y sin la cache correcta**.

---

## 7. Notas especificas de este proyecto

- El frontend usa `HashRouter` en `src/main.jsx`, asi que no hace falta redirigir rutas a `index.html`.
- `app-config.js` no debe cachearse, porque contiene la configuracion runtime publica.
- Los assets versionados con hash si deben cachearse agresivamente.
- Si cambias `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY`, debes recompilar y volver a subir `dist`.
- En el paquete de Dondominio se sustituye `sw.js` por una version que se autodesregistra y limpia caches. Esto evita que una cache global del hosting mantenga vivo un service worker obsoleto.

---

## 8. Deploy automatico con GitHub Actions (opcional)

El repositorio incluye el workflow `deploy-dondominio.yml` en `.github/workflows/`.

Dispara deploy en:

- push a `main`
- ejecucion manual (`workflow_dispatch`)

Secrets que debes crear en GitHub (`Settings` -> `Secrets and variables` -> `Actions`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `DONDOMINIO_FTP_SERVER`
- `DONDOMINIO_FTP_USERNAME`
- `DONDOMINIO_FTP_PASSWORD`
- `DONDOMINIO_FTP_SERVER_DIR`

Notas:

- Este workflow **no toca Netlify**. Solo publica en Dondominio por FTP.
- El workflow genera `dist`, inyecta `app-config.js`, prepara el paquete Dondominio (`.htaccess` + `sw.js` especial) y luego lo sube.
- Si quieres limitar deploy automatico, cambia el trigger de `push` a una rama distinta o dejalo solo manual.
