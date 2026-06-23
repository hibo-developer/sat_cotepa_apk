-- Normaliza km_desplazamiento_facturables con una lógica estable:
-- origen fijo en Cotepa + distancia geodésica * 1.3 + ida y vuelta.
-- Revisar primero en un entorno de staging.

begin;

alter table public.ordenes_trabajo
  add column if not exists km_desplazamiento_facturables numeric(10,2);

with constantes as (
  select
    39.4415::double precision as cotepa_lat,
    -0.3820::double precision as cotepa_lng,
    6371000::double precision as radio_tierra_m,
    1.3::double precision as factor_rodeo
),
distancias as (
  select
    ot.id,
    round(
      (
        (
          2 * c.radio_tierra_m * atan2(
            sqrt(
              power(sin(radians(cl.lat - c.cotepa_lat) / 2), 2) +
              cos(radians(c.cotepa_lat)) * cos(radians(cl.lat)) *
              power(sin(radians(cl.lng - c.cotepa_lng) / 2), 2)
            ),
            sqrt(
              1 - (
                power(sin(radians(cl.lat - c.cotepa_lat) / 2), 2) +
                cos(radians(c.cotepa_lat)) * cos(radians(cl.lat)) *
                power(sin(radians(cl.lng - c.cotepa_lng) / 2), 2)
              )
            )
          )
        ) * c.factor_rodeo * 2
      ) / 1000
    ::numeric
    , 2) as km_normalizados
  from public.ordenes_trabajo ot
  join public.clientes cl on cl.id = ot.cliente_id
  cross join constantes c
  where cl.lat is not null
    and cl.lng is not null
)
update public.ordenes_trabajo ot
set km_desplazamiento_facturables = d.km_normalizados
from distancias d
where d.id = ot.id;

commit;
