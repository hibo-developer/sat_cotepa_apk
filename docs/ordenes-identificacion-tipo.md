# Identificación visual del tipo de orden (Avería vs PEM)

## Objetivo

Hacer visible en la lista de órdenes si cada orden es:

- Avería
- PEM · Montaje
- PEM · Puesta en marcha

## Implementación

La identificación se implementa en la vista de listado de órdenes:

- [ListaOrdenesView.jsx](file:///c:/sat_cotepa_apk/src/views/ListaOrdenesView.jsx)

Se añade una etiqueta (badge) junto al número de ticket en cada tarjeta de orden:

- Texto:
  - Avería
  - PEM · Montaje
  - PEM · Puesta en marcha
- Color:
  - Avería: gama roja
  - PEM Montaje: gama índigo
  - PEM Puesta en marcha: gama púrpura
- Icono:
  - Avería: llave inglesa
  - Montaje: martillo
  - Puesta en marcha: cohete

La etiqueta se renderiza con `flex-wrap` para mantener responsividad en pantallas pequeñas.

## Fuente de datos

La vista consume `orden.tipoOrden` (normalizado en `useOrdenes`) que proviene de `ordenes_trabajo.tipo_orden` en Supabase.

## Verificación

- Verificar que todas las tarjetas muestren el badge.
- Confirmar que las órdenes PEM muestran “PEM · …” y las de avería “Avería”.
- Confirmar que el badge no rompe el layout en móvil y desktop (usa `flex-wrap`).

