-- Endurece la lectura de public.tecnicos:
-- - admin/oficina mantienen visibilidad del catalogo completo
-- - tecnico solo puede leer su propio registro asociado

drop policy if exists "tecnicos_select" on public.tecnicos;

create policy "tecnicos_select"
on public.tecnicos for select to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (
    private_sat.fn_es_oficina_o_admin_sat()
    or (
      private_sat.fn_tecnico_actual_sat_id() is not null
      and id = private_sat.fn_tecnico_actual_sat_id()
    )
  )
);
