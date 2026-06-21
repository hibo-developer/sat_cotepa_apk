# Despliegue Web en Netlify

Guia operativa para publicar la version web de SAT Movil COTEPA en Netlify con la configuracion de seguridad ya incluida en `netlify.toml`.

---

## 1. Alcance

- Esta guia aplica solo a la **version web** del proyecto.
- Netlify sirve el frontend estatico compilado en `dist`.
- Android (Capacitor) y desktop (Electron) no se publican en Netlify.

---

## 2. Requisitos previos

- Repositorio accesible desde Netlify.
- Proyecto Supabase operativo en el entorno objetivo.
- Variables publicas de frontend disponibles:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Seguridad validada en Supabase:
  - `RLS` activa en tablas de negocio.
  - Politicas de Storage aplicadas.
  - Acceso anonimo deshabilitado si no es necesario.
  - Roles `admin`, `oficina` y `tecnico` validados.

Antes de abrir a usuarios finales, revisar tambien `docs/checklist-validacion-seguridad-supabase.md` y `docs/checklist-produccion.md`.

---

## 3. Configuracion del sitio en Netlify

1. Entrar en Netlify.
2. Ir a `Add new site`.
3. Elegir `Import an existing project`.
4. Conectar el proveedor Git correspondiente.
5. Seleccionar el repositorio del proyecto.
6. Elegir la rama de produccion, normalmente `main`.

Netlify deberia detectar automaticamente la configuracion desde `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

Si Netlify pidiera la configuracion manual:

- Build command: `npm run build`
- Publish directory: `dist`

---

## 4. Variables de entorno

En `Site configuration` -> `Environment variables`, crear:

```env
VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<tu-anon-key>
NODE_VERSION=20
```

Notas:

- `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` se exponen al frontend por diseno.
- No introducir secretos de backend en variables `VITE_*`.
- No configurar `SUPABASE_SERVICE_ROLE_KEY` en este sitio web.
- Si cambias valores `VITE_*`, debes lanzar un nuevo deploy para que se reflejen en el build.

---

## 5. Seguridad ya aplicada

El archivo `netlify.toml` ya define:

- `Content-Security-Policy`
- `Permissions-Policy`
- `Referrer-Policy`
- `X-Content-Type-Options`
- `X-Frame-Options`
- `Cross-Origin-Opener-Policy`
- Politicas de cache para `index.html`, `app-config.js`, `manifest.webmanifest`, `sw.js` y `assets`

Consideraciones importantes:

- Se permite conexion a `https://*.supabase.co` y `https://api.pwnedpasswords.com`.
- Se permite `geolocation` y `camera` para no romper el flujo de partes y evidencias.
- `app-config.js` queda con `Cache-Control: no-store`.
- Los assets con hash se sirven con cache larga.

---

## 6. Dominio y HTTPS

Recomendado para produccion:

1. Configurar dominio propio en `Domain management`.
2. Confirmar que el sitio responde por HTTPS.
3. Forzar HTTPS si Netlify muestra una opcion explicita.
4. Evitar usar la URL temporal como direccion principal para usuarios finales.

---

## 7. Despliegue inicial

1. Guardar variables de entorno.
2. Lanzar el primer deploy.
3. Esperar a que finalice el build.
4. Abrir la URL generada por Netlify.
5. Confirmar que carga la pantalla de acceso.

Si el build falla:

- Revisar que `npm run build` funcione en local.
- Revisar variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
- Confirmar que Netlify esta usando Node 20.

---

## 8. Verificacion funcional minima

Tras publicar:

- Login y logout correctos.
- Carga de ordenes sin errores en consola.
- Acceso por rol correcto:
  - `admin`
  - `oficina`
  - `tecnico`
- Alta o edicion de ordenes segun permisos.
- Registro de parte.
- Subida de fotos.
- Geolocalizacion en navegador compatible.
- Generacion y consulta de informes.
- Sin errores CSP ni bloqueos de red a Supabase.

---

## 9. Verificacion tecnica rapida

Abrir DevTools del navegador y comprobar:

- No hay errores `Content Security Policy`.
- No hay errores `403` o `401` inesperados en llamadas a Supabase.
- `app-config.js` devuelve `Cache-Control: no-store`.
- `index.html` devuelve `Cache-Control: public, max-age=0, must-revalidate`.
- Los archivos bajo `/assets/` devuelven cache larga.
- El sitio carga por HTTPS.

---

## 10. Recomendaciones operativas

- Usar una rama o sitio separado para `staging`.
- No usar datos reales en deploy previews publicas.
- Restringir la rama de produccion a una sola fuente de despliegue.
- Validar cambios sensibles en Supabase antes de cada release.
- Mantener una estrategia de rollback a un deploy anterior estable.

---

## 11. Checklist corta de salida

- [ ] `netlify.toml` presente en la raiz del repo.
- [ ] Variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` configuradas.
- [ ] `NODE_VERSION=20` configurado.
- [ ] Build finalizado sin errores.
- [ ] Login verificado.
- [ ] Roles verificados.
- [ ] Fotos y GPS probados.
- [ ] Informes verificados.
- [ ] HTTPS operativo.
- [ ] Checklist de seguridad de Supabase revisado.
