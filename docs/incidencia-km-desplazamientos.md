# Incidencia: discrepancias de kilometraje por cliente

## Síntoma

Para un mismo cliente y un trayecto aparentemente equivalente se estaban registrando kilometrajes distintos en fechas diferentes.

## Causa raíz

La discrepancia provenía de dos factores combinados:

1. El cálculo tomaba como destino la geolocalización capturada en el móvil al iniciar la intervención o finalizar el desplazamiento, en lugar de usar las coordenadas fijas del cliente cuando ya estaban guardadas.
2. El cálculo dependía de una fuente externa de rutas y de un fallback alternativo, lo que permitía diferencias entre ejecuciones aunque el cliente fuera el mismo.

## Corrección aplicada

1. El kilometraje facturable usa ahora una referencia estable:
   - origen fijo en `Cotepa S.L., Paiporta`
   - destino fijo en las coordenadas del cliente, si existen
   - geolocalización capturada solo para auditoría y contraste
2. El cálculo facturable pasa a ser determinista:
   - distancia geodésica
   - factor de rodeo estable `1.3`
   - facturación de ida y vuelta
3. Se añade una validación de consistencia contra el histórico del cliente:
   - si la variación supera el `5%`, la interfaz muestra una advertencia
4. Se añade instrumentación temporal de depuración para contrastar:
   - GPS capturado
   - coordenadas guardadas del cliente
   - destino realmente usado para facturación
   - kilómetros persistidos

## Archivos modificados

- `src/views/ParteTrabajoView.jsx`
- `src/services/parteTrabajoService.js`
- `src/services/distanciaClienteService.js`
- `src/services/distanciaClienteService.test.js`
- `supabase/normalize_km_desplazamiento_facturables.sql`

## Normalización histórica

Para recalcular los registros previos con la nueva lógica estable, ejecutar:

- `supabase/normalize_km_desplazamiento_facturables.sql`

## Nota operativa

Si un cliente no tiene `lat/lng` guardados, el sistema sigue usando la geolocalización capturada en ese momento y lo indica en el mensaje de la interfaz. Para garantizar consistencia total, conviene completar coordenadas en la ficha del cliente.
