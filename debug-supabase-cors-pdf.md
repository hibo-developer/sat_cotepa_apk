# Debug Session: supabase-cors-pdf
- **Status**: [OPEN]
- **Issue**: Las Edge Functions `storage-signed-url` y `admin-users` siguen fallando por CORS desde `https://sat-cotepa.netlify.app`, y la descarga de informes intenta abrir referencias `sb://` en vez de una URL HTTP/HTTPS utilizable en navegador.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-supabase-cors-pdf.ndjson

## Reproduction Steps
1. Abrir `https://sat-cotepa.netlify.app/#/ordenes`.
2. Intentar descargar un informe PDF desde una orden con informe existente.
3. Observar el `OPTIONS`/`POST` a `storage-signed-url` y el intento de abrir `sb://...`.
4. Abrir `https://sat-cotepa.netlify.app/#/admin`.
5. Observar el `OPTIONS`/`POST` a `admin-users`.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | El gateway de Supabase sigue interceptando el preflight y suprimiendo las cabeceras CORS antes de llegar al handler. | High | Low | Pending |
| B | El cliente intenta abrir el PDF antes de esperar la URL firmada HTTP/HTTPS y cae al valor `sb://` como fallback. | High | Low | Pending |
| C | La función `storage-signed-url` responde error funcional y el frontend cae al esquema `sb://`, pero el navegador lo reporta como fallo de esquema. | Medium | Low | Pending |
| D | El navegador o el service worker está reutilizando respuestas antiguas del frontend y mantiene una ruta de código obsoleta para descargar informes. | Medium | Medium | Pending |
| E | La invocación a `admin-users`/`storage-signed-url` envía cabeceras o método que desencadenan un preflight distinto al esperado. | Medium | Low | Pending |

## Log Evidence
- Evidencia de navegador: el preflight a `admin-users` y `storage-signed-url` fallaba sin `Access-Control-Allow-Origin`.
- Evidencia HTTP pre-fix: `OPTIONS` devolvia `200/204` sin cabeceras CORS visibles.
- Evidencia HTTP intermedia: un `POST` manual a `admin-users` respondio `{"error":"Origen no permitido"}`, confirmando que la whitelist estaba bloqueando el origen web.
- Evidencia HTTP post-fix: `OPTIONS` a `admin-users` y `storage-signed-url` devuelve `Access-Control-Allow-Origin: https://sat-cotepa.netlify.app`, `access-control-allow-methods: POST, OPTIONS` y `access-control-allow-headers: authorization, x-client-info, apikey, content-type`.
- Evidencia funcional post-fix parcial: `POST` manual a `admin-users` devuelve `401 Falta cabecera Authorization` con cabeceras CORS correctas, lo que demuestra que el navegador ya podra recibir respuestas del endpoint.

## Verification Conclusion
- A: CONFIRMED. La whitelist de origen de las funciones edge estaba rechazando el origen web y dejaba el navegador sin CORS util.
- B: CONFIRMED. El cliente intentaba abrir `sb://...` cuando la firma fallaba.
- C: CONFIRMED. `storage-signed-url` podia fallar y el fallback devolvia la referencia original, provocando el error de esquema no soportado.
- D: REJECTED. No hay evidencia de que el problema principal fuera una version obsoleta del frontend; la causa observable estaba en CORS y fallback de URL.
- E: PARTIALLY CONFIRMED. La invocacion del navegador hacia funciones con `Authorization`/`apikey` dispara preflight, por lo que estas funciones deben responder siempre con CORS util.
