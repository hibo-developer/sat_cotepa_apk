-- Endurece las policies SELECT de clientes y equipos:
-- - admin/oficina ven todo
-- - tecnico solo ve clientes/equipos de OTs asignadas a el
--
-- Antes: using (true) -> cualquier tecnico autenticado leia TODOS los
-- clientes (nombre, direccion, telefono, email) y equipos.
-- Despues: tecnico solo ve lo vinculado a sus ordenes.

drop policy if exists "clientes_select" on public.clientes;

create policy "clientes_select"
on public.clientes for select to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (
    private_sat.fn_es_oficina_o_admin_sat()
    or exists (
      select 1
      from public.ordenes_trabajo ot
      where ot.cliente_id = clientes.id
        and private_sat.fn_es_tecnico_de_orden_sat(ot.id)
    )
  )
);

drop policy if exists "equipos_select" on public.equipos;

create policy "equipos_select"
on public.equipos for select to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (
    private_sat.fn_es_oficina_o_admin_sat()
    or exists (
      select 1
      from public.ordenes_trabajo ot
      where ot.equipo_id = equipos.id
        and private_sat.fn_es_tecnico_de_orden_sat(ot.id)
    )
  )
);
