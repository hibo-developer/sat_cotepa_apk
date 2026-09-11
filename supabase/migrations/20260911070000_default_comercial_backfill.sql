-- Modulo de Comerciales (3/3): alta del comercial predeterminado
-- "Victor Garcia" y asignacion retroactiva a los clientes existentes que
-- no tengan ningun comercial de referencia asociado.
--
-- La misma regla ("si no hay comercial explicito, asignar al predeterminado")
-- se aplica en el codigo de aplicacion (clientesService.js) para altas y
-- ediciones nuevas; este script cubre unicamente los registros historicos.

insert into public.comerciales (nombre, activo, es_predeterminado)
select 'Victor Garcia', true, true
where not exists (
  select 1 from public.comerciales where es_predeterminado
);

-- Asignar el comercial predeterminado a todos los clientes activos que
-- todavia no tengan ningun comercial de referencia.
insert into public.clientes_comerciales (cliente_id, comercial_id)
select c.id, predeterminado.id
from public.clientes c
cross join (
  select id from public.comerciales where es_predeterminado limit 1
) as predeterminado
where c.deleted_at is null
  and not exists (
    select 1 from public.clientes_comerciales cc where cc.cliente_id = c.id
  )
on conflict do nothing;

notify pgrst, 'reload schema';
