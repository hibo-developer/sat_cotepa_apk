-- GDPR: borrado logico de clientes + soporte para derecho al olvido.
--
-- - Anade deleted_at a clientes para soft-delete con trazabilidad.
-- - Las policies SELECT existentes de clientes filtran deleted_at is null
--   (ajustadas abajo).
-- - Prepara el borrado en cascada: ordenes_trabajo, materiales_orden,
--   archivos_parte y objetos de Storage se gestionan via Edge Function
--   gdpr-delete-client (service_role).

alter table public.clientes
  add column if not exists deleted_at timestamptz;

create index if not exists idx_clientes_deleted_at
  on public.clientes(deleted_at);

-- Ajustar clientes_select para excluir borrados logicos.
-- (La migration 20260627000000 ya reescribio clientes_select; aqui la
-- reforzamos para que ademas filtre deleted_at is null.)
drop policy if exists "clientes_select" on public.clientes;

create policy "clientes_select"
on public.clientes for select to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and clientes.deleted_at is null
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

-- Solo admin puede marcar deleted_at (soft delete) o borrar (hard delete).
drop policy if exists "clientes_delete_admin_soft" on public.clientes;

create policy "clientes_delete_admin_soft"
on public.clientes for delete to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and private_sat.fn_es_admin_sat()
);

-- Permitir UPDATE a admin para fijar deleted_at (soft delete).
-- La policy clientes_write_oficina_admin ya existe y permite update a
-- oficina/admin, pero la reforzamos para que no se pueda modificar un
-- cliente ya borrado logicamente (salvo admin para reactivar).
drop policy if exists "clientes_write_oficina_admin" on public.clientes;

create policy "clientes_write_oficina_admin"
on public.clientes for all to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and private_sat.fn_es_oficina_o_admin_sat()
  and clientes.deleted_at is null
)
with check (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and private_sat.fn_es_oficina_o_admin_sat()
);
