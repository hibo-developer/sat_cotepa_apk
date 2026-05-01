-- Seed de datos demo SAT
begin;

with cliente_1 as (
  insert into clientes (nombre, direccion, telefono, email)
  values ('Demo SAT - Panaderia Centro', 'Calle Mayor 12, Madrid', '910000111', 'panaderia.demo@sat.local')
  returning id
), cliente_2 as (
  insert into clientes (nombre, direccion, telefono, email)
  values ('Demo SAT - Clinica Norte', 'Avenida Europa 50, Madrid', '910000222', 'clinica.demo@sat.local')
  returning id
), tecnico_1 as (
  insert into tecnicos (nombre, especialidad, activo)
  values ('Demo SAT - Laura Gomez', 'Refrigeracion', true)
  returning id
), tecnico_2 as (
  insert into tecnicos (nombre, especialidad, activo)
  values ('Demo SAT - Carlos Ruiz', 'Electromecanica', true)
  returning id
), equipo_1 as (
  insert into equipos (cliente_id, nombre, marca, modelo, numero_serie, ultima_revision)
  select id, 'Horno Convencional', 'BakerPro', 'BP-900', 'SAT-DEMO-001', current_date - interval '90 days'
  from cliente_1
  returning id, cliente_id
), equipo_2 as (
  insert into equipos (cliente_id, nombre, marca, modelo, numero_serie, ultima_revision)
  select id, 'Autoclave', 'MediSteam', 'MS-210', 'SAT-DEMO-002', current_date - interval '40 days'
  from cliente_2
  returning id, cliente_id
), orden_1 as (
  insert into ordenes_trabajo (
    cliente_id,
    equipo_id,
    tecnico_id,
    descripcion_averia,
    estado,
    prioridad,
    fecha_inicio
  )
  select
    e1.cliente_id,
    e1.id,
    t1.id,
    'No alcanza temperatura de consigna',
    'pendiente',
    'alta',
    now() - interval '2 days'
  from equipo_1 e1
  cross join tecnico_1 t1
  returning id
), orden_2 as (
  insert into ordenes_trabajo (
    cliente_id,
    equipo_id,
    tecnico_id,
    descripcion_averia,
    estado,
    prioridad,
    fecha_inicio,
    tareas_realizadas,
    fecha_fin,
    foto_url
  )
  select
    e2.cliente_id,
    e2.id,
    t2.id,
    'Fuga de vapor en junta principal',
    'finalizado',
    'media',
    now() - interval '5 days',
    'Sustitucion de junta, prueba de estanqueidad y calibracion final',
    now() - interval '4 days',
    'https://example.com/demo-cierre.jpg'
  from equipo_2 e2
  cross join tecnico_2 t2
  returning id
)
insert into materiales_orden (orden_id, nombre_material, cantidad, precio_unitario)
select o1.id, 'Resistencia 220V', 1, 49.90 from orden_1 o1
union all
select o1.id, 'Kit limpieza horno', 1, 18.50 from orden_1 o1
union all
select o2.id, 'Junta alta temperatura', 2, 12.75 from orden_2 o2;

commit;
