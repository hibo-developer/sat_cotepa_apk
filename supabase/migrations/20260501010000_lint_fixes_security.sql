-- Migracion: silenciar lints 0012 y 0028 del Database Linter de Supabase.
-- - 0028: revocar EXECUTE de anon/public en todas las funciones SECURITY DEFINER de SAT.
-- - 0012: anadir condicion explicita "no anonimo" en USING/WITH CHECK de cada politica
--          PERMISSIVE para que el linter detecte la barrera (la policy RESTRICTIVE
--          deny_anonymous_sat sigue actuando como cinturon adicional).
-- 0029 (authenticated puede ejecutar) es ESPERADO: las funciones se usan en RLS.

-- =============================================================
-- 1. Revocar EXECUTE de anon y public en funciones SECURITY DEFINER
-- =============================================================
revoke execute on function public.fn_rol_actual_sat()                          from anon, public;
revoke execute on function public.fn_es_admin_sat()                            from anon, public;
revoke execute on function public.fn_es_oficina_o_admin_sat()                  from anon, public;
revoke execute on function public.fn_es_tecnico_de_orden_sat(uuid)             from anon, public;
revoke execute on function public.fn_es_sesion_no_anon_sat()                   from anon, public;

-- Trigger function: nadie debe poder llamarla por RPC
revoke execute on function public.fn_validar_edicion_tecnico_orden_sat()       from anon, public, authenticated;

-- =============================================================
-- 2. Endurecer politicas PERMISSIVE con check explicito de "no anonimo"
--    Asi el linter ve la condicion en cada policy y deja de avisar.
--    La policy RESTRICTIVE deny_anonymous_sat sigue presente como
--    segunda barrera por si alguna policy nueva olvidara este check.
-- =============================================================

-- usuarios_sat
drop policy if exists "usuarios_sat_read_self"   on public.usuarios_sat;
create policy "usuarios_sat_read_self"
on public.usuarios_sat for select to authenticated
using (
  (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
  and (user_id = auth.uid() or public.fn_es_admin_sat())
);

drop policy if exists "usuarios_sat_admin_manage" on public.usuarios_sat;
create policy "usuarios_sat_admin_manage"
on public.usuarios_sat for all to authenticated
using      (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_admin_sat())
with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_admin_sat());

-- clientes
drop policy if exists "clientes_select" on public.clientes;
create policy "clientes_select"
on public.clientes for select to authenticated
using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "clientes_write_oficina_admin" on public.clientes;
create policy "clientes_write_oficina_admin"
on public.clientes for all to authenticated
using      (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat());

-- equipos
drop policy if exists "equipos_select" on public.equipos;
create policy "equipos_select"
on public.equipos for select to authenticated
using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "equipos_write_oficina_admin" on public.equipos;
create policy "equipos_write_oficina_admin"
on public.equipos for all to authenticated
using      (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat());

-- tecnicos
drop policy if exists "tecnicos_select" on public.tecnicos;
create policy "tecnicos_select"
on public.tecnicos for select to authenticated
using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "tecnicos_write_oficina_admin" on public.tecnicos;
create policy "tecnicos_write_oficina_admin"
on public.tecnicos for all to authenticated
using      (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat());

-- ordenes_trabajo
drop policy if exists "ordenes_select" on public.ordenes_trabajo;
create policy "ordenes_select"
on public.ordenes_trabajo for select to authenticated
using (
  coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  and (public.fn_es_oficina_o_admin_sat() or public.fn_es_tecnico_de_orden_sat(id))
);

drop policy if exists "ordenes_insert_oficina_admin" on public.ordenes_trabajo;
create policy "ordenes_insert_oficina_admin"
on public.ordenes_trabajo for insert to authenticated
with check (
  coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  and public.fn_es_oficina_o_admin_sat()
);

drop policy if exists "ordenes_update_oficina_admin" on public.ordenes_trabajo;
create policy "ordenes_update_oficina_admin"
on public.ordenes_trabajo for update to authenticated
using      (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat());

drop policy if exists "ordenes_update_tecnico_propias" on public.ordenes_trabajo;
create policy "ordenes_update_tecnico_propias"
on public.ordenes_trabajo for update to authenticated
using      (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_tecnico_de_orden_sat(id))
with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_tecnico_de_orden_sat(id));

drop policy if exists "admin puede eliminar ordenes" on public.ordenes_trabajo;
create policy "admin puede eliminar ordenes"
on public.ordenes_trabajo for delete to authenticated
using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_admin_sat());

-- materiales_orden
drop policy if exists "materiales_select" on public.materiales_orden;
create policy "materiales_select"
on public.materiales_orden for select to authenticated
using (
  coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  and (public.fn_es_oficina_o_admin_sat() or public.fn_es_tecnico_de_orden_sat(orden_id))
);

drop policy if exists "materiales_write_oficina_admin" on public.materiales_orden;
create policy "materiales_write_oficina_admin"
on public.materiales_orden for all to authenticated
using      (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat());

drop policy if exists "materiales_insert_tecnico_propias" on public.materiales_orden;
create policy "materiales_insert_tecnico_propias"
on public.materiales_orden for insert to authenticated
with check (
  coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  and public.fn_es_tecnico_de_orden_sat(orden_id)
);

-- inventario_materiales
do $$
begin
  if to_regclass('public.inventario_materiales') is not null then
    execute 'drop policy if exists "inventario_materiales_select" on public.inventario_materiales';
    execute $f$
      create policy "inventario_materiales_select"
      on public.inventario_materiales for select to authenticated
      using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
    $f$;

    execute 'drop policy if exists "inventario_materiales_write_oficina_admin" on public.inventario_materiales';
    execute $f$
      create policy "inventario_materiales_write_oficina_admin"
      on public.inventario_materiales for all to authenticated
      using      (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
      with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
    $f$;
  end if;
end
$$;

-- inventario_movimientos
do $$
begin
  if to_regclass('public.inventario_movimientos') is not null then
    execute 'alter table public.inventario_movimientos enable row level security';

    execute 'drop policy if exists "inventario_movimientos_select" on public.inventario_movimientos';
    execute $f$
      create policy "inventario_movimientos_select"
      on public.inventario_movimientos for select to authenticated
      using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
    $f$;

    execute 'drop policy if exists "inventario_movimientos_write_oficina_admin" on public.inventario_movimientos';
    execute $f$
      create policy "inventario_movimientos_write_oficina_admin"
      on public.inventario_movimientos for all to authenticated
      using      (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
      with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false and public.fn_es_oficina_o_admin_sat())
    $f$;

    -- Cinturon adicional
    execute 'drop policy if exists "deny_anonymous_sat" on public.inventario_movimientos';
    execute $f$
      create policy "deny_anonymous_sat"
      on public.inventario_movimientos as restrictive for all to authenticated
      using      (public.fn_es_sesion_no_anon_sat())
      with check (public.fn_es_sesion_no_anon_sat())
    $f$;
  end if;
end
$$;

-- =============================================================
-- 3. Storage: anadir condicion no-anonimo a politicas de escritura
-- =============================================================
-- firmas-clientes
drop policy if exists "auth_insert_firmas_clientes" on storage.objects;
create policy "auth_insert_firmas_clientes"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'firmas-clientes'
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

drop policy if exists "auth_update_firmas_clientes" on storage.objects;
create policy "auth_update_firmas_clientes"
on storage.objects for update to authenticated
using      (bucket_id = 'firmas-clientes' and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
with check (bucket_id = 'firmas-clientes' and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "auth_delete_firmas_clientes" on storage.objects;
create policy "auth_delete_firmas_clientes"
on storage.objects for delete to authenticated
using (bucket_id = 'firmas-clientes' and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

-- fotos-intervenciones
drop policy if exists "auth_insert_fotos_intervenciones" on storage.objects;
create policy "auth_insert_fotos_intervenciones"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'fotos-intervenciones'
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

drop policy if exists "auth_update_fotos_intervenciones" on storage.objects;
create policy "auth_update_fotos_intervenciones"
on storage.objects for update to authenticated
using      (bucket_id = 'fotos-intervenciones' and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
with check (bucket_id = 'fotos-intervenciones' and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "auth_delete_fotos_intervenciones" on storage.objects;
create policy "auth_delete_fotos_intervenciones"
on storage.objects for delete to authenticated
using (bucket_id = 'fotos-intervenciones' and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

-- informes-partes
drop policy if exists "auth_insert_informes_partes" on storage.objects;
create policy "auth_insert_informes_partes"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'informes-partes'
  and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
);

drop policy if exists "auth_update_informes_partes" on storage.objects;
create policy "auth_update_informes_partes"
on storage.objects for update to authenticated
using      (bucket_id = 'informes-partes' and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
with check (bucket_id = 'informes-partes' and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "auth_delete_informes_partes" on storage.objects;
create policy "auth_delete_informes_partes"
on storage.objects for delete to authenticated
using (bucket_id = 'informes-partes' and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);
