-- Migracion: separar tiempo empleado en columna propia
-- Ejecutar en Supabase SQL Editor si ya aplicaste 01_schema_sat.sql anteriormente

alter table if exists ordenes_trabajo
add column if not exists tiempo_empleado_minutos integer;

update ordenes_trabajo
set tiempo_empleado_minutos = substring(tareas_realizadas from 'Tiempo empleado:\s*([0-9]+)\s*minutos')::integer
where tiempo_empleado_minutos is null
  and tareas_realizadas ~* 'Tiempo empleado:\s*[0-9]+\s*minutos';
