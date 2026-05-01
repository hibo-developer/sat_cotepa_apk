-- Limpieza de datos de prueba SAT
-- Elimina solo registros creados por scripts demo/pruebas

begin;

with clientes_demo as (
  select id
  from clientes
  where nombre like 'Demo SAT - %'
     or nombre like 'Cliente Prueba SAT %'
     or nombre like 'Cliente Tiempo Columna %'
), tecnicos_demo as (
  select id
  from tecnicos
  where nombre like 'Demo SAT - %'
     or nombre = 'Tecnico Prueba'
     or nombre = 'Tecnico Tiempo Columna'
), equipos_demo as (
  select id
  from equipos
  where numero_serie like 'SAT-DEMO-%'
     or nombre = 'Equipo Prueba'
     or nombre = 'Equipo Tiempo Columna'
     or cliente_id in (select id from clientes_demo)
), ordenes_demo as (
  select id
  from ordenes_trabajo
  where cliente_id in (select id from clientes_demo)
     or equipo_id in (select id from equipos_demo)
     or tecnico_id in (select id from tecnicos_demo)
     or descripcion_averia in ('No enfria correctamente', 'No alcanza temperatura de consigna', 'Fuga de vapor en junta principal', 'Prueba tiempo en columna')
)
delete from materiales_orden
where orden_id in (select id from ordenes_demo);

delete from ordenes_trabajo
where id in (select id from ordenes_demo);

delete from equipos
where id in (select id from equipos_demo);

delete from tecnicos
where id in (select id from tecnicos_demo);

delete from clientes
where id in (select id from clientes_demo);

commit;
