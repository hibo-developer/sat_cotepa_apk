-- Migracion: silenciar lints 0003 (initplan) y 0006 (multiple permissive).
-- - Envolvemos auth.uid() / auth.jwt() en (select ...) para evaluacion 1 vez/query.
-- - Sustituimos FOR ALL en policies _write_oficina_admin por INSERT/UPDATE/DELETE
--   especificos, dejando SELECT exclusivo para la policy _select.
-- - En ordenes_trabajo: fusionamos ordenes_update_oficina_admin + ordenes_update_tecnico_propias
--   en una sola policy "ordenes_update" con OR.
-- - En materiales_orden: separamos materiales_write_oficina_admin en policies de
--   UPDATE/DELETE (la INSERT queda en una policy unica con OR junto a tecnico).

-- Helper: condicion repetida
-- (no se puede SQL macro, pero gracias a SQL inline queda legible)

-- =============================================================
-- usuarios_sat
-- =============================================================
drop policy if exists "usuarios_sat_read_self"   on public.usuarios_sat;
create policy "usuarios_sat_read_self"
on public.usuarios_sat for select to authenticated
using (
  (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
  and (user_id = (select auth.uid()) or public.fn_es_admin_sat())
);

drop policy if exists "usuarios_sat_admin_manage" on public.usuarios_sat;
create policy "usuarios_sat_admin_insert"
on public.usuarios_sat for insert to authenticated
with check (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and public.fn_es_admin_sat()
);

create policy "usuarios_sat_admin_update"
on public.usuarios_sat for update to authenticated
using      (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_admin_sat())
with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_admin_sat());

create policy "usuarios_sat_admin_delete"
on public.usuarios_sat for delete to authenticated
using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_admin_sat());

-- =============================================================
-- clientes
-- =============================================================
drop policy if exists "clientes_select" on public.clientes;
create policy "clientes_select"
on public.clientes for select to authenticated
using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "clientes_write_oficina_admin" on public.clientes;
create policy "clientes_insert_oficina_admin"
on public.clientes for insert to authenticated
with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat());

create policy "clientes_update_oficina_admin"
on public.clientes for update to authenticated
using      (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat());

create policy "clientes_delete_oficina_admin"
on public.clientes for delete to authenticated
using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat());

-- =============================================================
-- equipos
-- =============================================================
drop policy if exists "equipos_select" on public.equipos;
create policy "equipos_select"
on public.equipos for select to authenticated
using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "equipos_write_oficina_admin" on public.equipos;
create policy "equipos_insert_oficina_admin"
on public.equipos for insert to authenticated
with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat());

create policy "equipos_update_oficina_admin"
on public.equipos for update to authenticated
using      (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat());

create policy "equipos_delete_oficina_admin"
on public.equipos for delete to authenticated
using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat());

-- =============================================================
-- tecnicos
-- =============================================================
drop policy if exists "tecnicos_select" on public.tecnicos;
create policy "tecnicos_select"
on public.tecnicos for select to authenticated
using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "tecnicos_write_oficina_admin" on public.tecnicos;
create policy "tecnicos_insert_oficina_admin"
on public.tecnicos for insert to authenticated
with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat());

create policy "tecnicos_update_oficina_admin"
on public.tecnicos for update to authenticated
using      (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat());

create policy "tecnicos_delete_oficina_admin"
on public.tecnicos for delete to authenticated
using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat());

-- =============================================================
-- ordenes_trabajo
-- =============================================================
drop policy if exists "ordenes_select" on public.ordenes_trabajo;
create policy "ordenes_select"
on public.ordenes_trabajo for select to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (public.fn_es_oficina_o_admin_sat() or public.fn_es_tecnico_de_orden_sat(id))
);

drop policy if exists "ordenes_insert_oficina_admin" on public.ordenes_trabajo;
create policy "ordenes_insert_oficina_admin"
on public.ordenes_trabajo for insert to authenticated
with check (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and public.fn_es_oficina_o_admin_sat()
);

-- Fusion update oficina/admin + tecnico en una sola policy
drop policy if exists "ordenes_update_oficina_admin"  on public.ordenes_trabajo;
drop policy if exists "ordenes_update_tecnico_propias" on public.ordenes_trabajo;
create policy "ordenes_update"
on public.ordenes_trabajo for update to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (public.fn_es_oficina_o_admin_sat() or public.fn_es_tecnico_de_orden_sat(id))
)
with check (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (public.fn_es_oficina_o_admin_sat() or public.fn_es_tecnico_de_orden_sat(id))
);

drop policy if exists "admin puede eliminar ordenes" on public.ordenes_trabajo;
create policy "ordenes_delete_admin"
on public.ordenes_trabajo for delete to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and public.fn_es_admin_sat()
);

-- =============================================================
-- materiales_orden
-- =============================================================
drop policy if exists "materiales_select" on public.materiales_orden;
create policy "materiales_select"
on public.materiales_orden for select to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (public.fn_es_oficina_o_admin_sat() or public.fn_es_tecnico_de_orden_sat(orden_id))
);

-- Fusion insert (oficina/admin OR tecnico de la orden) en una sola policy
drop policy if exists "materiales_write_oficina_admin"     on public.materiales_orden;
drop policy if exists "materiales_insert_tecnico_propias" on public.materiales_orden;
create policy "materiales_insert"
on public.materiales_orden for insert to authenticated
with check (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (public.fn_es_oficina_o_admin_sat() or public.fn_es_tecnico_de_orden_sat(orden_id))
);

create policy "materiales_update_oficina_admin"
on public.materiales_orden for update to authenticated
using      (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat());

create policy "materiales_delete_oficina_admin"
on public.materiales_orden for delete to authenticated
using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat());

-- =============================================================
-- inventario_materiales
-- =============================================================
do $$
begin
  if to_regclass('public.inventario_materiales') is not null then
    execute 'drop policy if exists "inventario_materiales_select" on public.inventario_materiales';
    execute $f$
      create policy "inventario_materiales_select"
      on public.inventario_materiales for select to authenticated
      using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
    $f$;

    execute 'drop policy if exists "inventario_materiales_write_oficina_admin" on public.inventario_materiales';

    execute $f$
      create policy "inventario_materiales_insert_oficina_admin"
      on public.inventario_materiales for insert to authenticated
      with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
    $f$;

    execute $f$
      create policy "inventario_materiales_update_oficina_admin"
      on public.inventario_materiales for update to authenticated
      using      (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
      with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
    $f$;

    execute $f$
      create policy "inventario_materiales_delete_oficina_admin"
      on public.inventario_materiales for delete to authenticated
      using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
    $f$;
  end if;
end
$$;

-- =============================================================
-- inventario_movimientos
-- =============================================================
do $$
begin
  if to_regclass('public.inventario_movimientos') is not null then
    execute 'drop policy if exists "inventario_movimientos_select" on public.inventario_movimientos';
    execute $f$
      create policy "inventario_movimientos_select"
      on public.inventario_movimientos for select to authenticated
      using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false)
    $f$;

    execute 'drop policy if exists "inventario_movimientos_write_oficina_admin" on public.inventario_movimientos';

    execute $f$
      create policy "inventario_movimientos_insert_oficina_admin"
      on public.inventario_movimientos for insert to authenticated
      with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
    $f$;

    execute $f$
      create policy "inventario_movimientos_update_oficina_admin"
      on public.inventario_movimientos for update to authenticated
      using      (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
      with check (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
    $f$;

    execute $f$
      create policy "inventario_movimientos_delete_oficina_admin"
      on public.inventario_movimientos for delete to authenticated
      using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
    $f$;
  end if;
end
$$;
