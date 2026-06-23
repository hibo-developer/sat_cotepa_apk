-- Auditoria de kilometraje facturable tras la normalizacion.
-- Ejecutar por bloques en el SQL Editor de Supabase.

-- ============================================================
-- 1) ORDENES CON DIFERENCIA SIGNIFICATIVA VS VALOR ESPERADO
--    Umbral actual: 5%
-- ============================================================
with constantes as (
  select
    39.4415::double precision as cotepa_lat,
    -0.3820::double precision as cotepa_lng,
    6371000::double precision as radio_tierra_m,
    1.3::double precision as factor_rodeo,
    5::numeric as umbral_pct
),
esperado as (
  select
    ot.id,
    ot.numero_ticket,
    ot.cliente_id,
    c.nombre as cliente_nombre,
    ot.fecha_fin,
    ot.km_desplazamiento_facturables as km_actual,
    round(
      ((
        (
          2 * k.radio_tierra_m * atan2(
            sqrt(
              power(sin(radians(c.lat - k.cotepa_lat) / 2), 2) +
              cos(radians(k.cotepa_lat)) * cos(radians(c.lat)) *
              power(sin(radians(c.lng - k.cotepa_lng) / 2), 2)
            ),
            sqrt(
              1 - (
                power(sin(radians(c.lat - k.cotepa_lat) / 2), 2) +
                cos(radians(k.cotepa_lat)) * cos(radians(c.lat)) *
                power(sin(radians(c.lng - k.cotepa_lng) / 2), 2)
              )
            )
          )
        ) * k.factor_rodeo * 2
      ) / 1000)::numeric
    , 2) as km_esperado,
    k.umbral_pct
  from public.ordenes_trabajo ot
  join public.clientes c on c.id = ot.cliente_id
  cross join constantes k
  where c.lat is not null
    and c.lng is not null
    and ot.km_desplazamiento_facturables is not null
),
diferencias as (
  select
    *,
    round(abs(km_actual - km_esperado), 2) as delta_km,
    case
      when km_esperado > 0
        then round(((abs(km_actual - km_esperado) / km_esperado) * 100)::numeric, 2)
      else null
    end as delta_pct
  from esperado
)
select
  id,
  numero_ticket,
  cliente_id,
  cliente_nombre,
  fecha_fin,
  km_actual,
  km_esperado,
  delta_km,
  delta_pct
from diferencias
where delta_pct is not null
  and delta_pct > umbral_pct
order by delta_pct desc, fecha_fin desc nulls last;


-- ============================================================
-- 2) CLIENTES SIN COORDENADAS
-- ============================================================
select
  c.id,
  c.nombre,
  c.direccion,
  c.telefono,
  c.email,
  count(ot.id) as ordenes_relacionadas
from public.clientes c
left join public.ordenes_trabajo ot on ot.cliente_id = c.id
where c.lat is null
   or c.lng is null
group by c.id, c.nombre, c.direccion, c.telefono, c.email
order by ordenes_relacionadas desc, c.nombre asc;


-- ============================================================
-- 3) CLIENTES CON VARIACION INTERNA ALTA EN SUS KILOMETROS
--    Detecta posibles historicos incoherentes aunque ya esten guardados.
--    Umbral actual: 5%
-- ============================================================
with resumen as (
  select
    c.id as cliente_id,
    c.nombre as cliente_nombre,
    count(*) filter (where ot.km_desplazamiento_facturables is not null) as total_ordenes_con_km,
    min(ot.km_desplazamiento_facturables) as km_min,
    max(ot.km_desplazamiento_facturables) as km_max,
    round(avg(ot.km_desplazamiento_facturables)::numeric, 2) as km_media
  from public.clientes c
  join public.ordenes_trabajo ot on ot.cliente_id = c.id
  group by c.id, c.nombre
),
variacion as (
  select
    *,
    round((km_max - km_min)::numeric, 2) as amplitud_km,
    case
      when km_media > 0
        then round((((km_max - km_min) / km_media) * 100)::numeric, 2)
      else null
    end as amplitud_pct
  from resumen
  where total_ordenes_con_km >= 2
)
select
  cliente_id,
  cliente_nombre,
  total_ordenes_con_km,
  km_min,
  km_max,
  km_media,
  amplitud_km,
  amplitud_pct
from variacion
where amplitud_pct is not null
  and amplitud_pct > 5
order by amplitud_pct desc, total_ordenes_con_km desc, cliente_nombre asc;


-- ============================================================
-- 4) MUESTRA RAPIDA DE ORDENES RECIENTES
-- ============================================================
select
  ot.id,
  ot.numero_ticket,
  c.nombre as cliente_nombre,
  ot.km_desplazamiento_facturables,
  ot.fecha_fin
from public.ordenes_trabajo ot
join public.clientes c on c.id = ot.cliente_id
order by ot.fecha_fin desc nulls last
limit 50;
