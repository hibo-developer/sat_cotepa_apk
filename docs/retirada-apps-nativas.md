# Proyecto exclusivamente web

Se retiran Electron y Android/Capacitor, sus dependencias, configuraciones y scripts de empaquetado y firma. Se conserva la aplicación web y su despliegue desde GitHub.

Referencia anterior a la retirada: commit `b7f72365c067778f23121b706fb8a8bec18fd0e4`. El código nativo puede recuperarse desde el historial de Git; no es necesario mantener una segunda copia en el proyecto activo.

La sesión web conserva sus claves de localStorage. Las preferencias de mapas conservan el prefijo `CapacitorStorage.` para que los navegadores existentes sigan leyendo su selección. Las rutas se abren mediante enlaces web. La sincronización identifica esta aplicación como `web`.

Esta retirada no modifica la base de datos, los archivos de Supabase ni el alojamiento. Los informes de auditoría anteriores se conservan como documentación histórica, incluidas sus referencias a las plataformas retiradas.

Validación local: `npm ci`, `npm test` y `npm run build`. Antes de publicar, comprobar en el navegador el acceso, la reapertura de sesión, las rutas a clientes, fotos, firmas, PDF y sincronización de cambios pendientes. La validación con datos reales requiere la configuración de Supabase del entorno de pruebas.
