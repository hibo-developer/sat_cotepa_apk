create or replace function public.admin_actualizar_storage_refs_orden(
  p_orden_id uuid,
  p_informe_pdf_url text,
  p_firma_url text,
  p_foto_url text,
  p_tareas_realizadas text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.ordenes_trabajo
  set
    informe_pdf_url = p_informe_pdf_url,
    firma_url = p_firma_url,
    foto_url = p_foto_url,
    tareas_realizadas = p_tareas_realizadas
  where id = p_orden_id;
end;
$$;

revoke all on function public.admin_actualizar_storage_refs_orden(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_actualizar_storage_refs_orden(uuid, text, text, text, text) to service_role;

comment on function public.admin_actualizar_storage_refs_orden(uuid, text, text, text, text)
is 'Actualiza referencias de storage en ordenes_trabajo para tareas de backfill/migracion ejecutadas con service_role.';
