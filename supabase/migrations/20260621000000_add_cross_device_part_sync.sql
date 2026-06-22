create schema if not exists private_sat;

create table if not exists public.parte_sesiones_activas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tecnico_id uuid references public.tecnicos(id) on delete set null,
  orden_id uuid references public.ordenes_trabajo(id) on delete set null,
  device_instance_id text not null,
  platform text not null default 'web',
  estado text not null default 'draft'
    check (estado in ('draft', 'active', 'submitted', 'cancelled', 'force_closed')),
  snapshot jsonb not null default '{}'::jsonb,
  remote_message text,
  closed_reason text,
  opened_at timestamp with time zone not null default now(),
  last_seen_at timestamp with time zone not null default now(),
  closed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.parte_sesiones_auditoria (
  id bigserial primary key,
  sesion_id uuid references public.parte_sesiones_activas(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  tecnico_id uuid references public.tecnicos(id) on delete set null,
  orden_id uuid references public.ordenes_trabajo(id) on delete set null,
  device_instance_id text,
  platform text,
  evento text not null,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_parte_sesiones_activas_user_estado
  on public.parte_sesiones_activas(user_id, estado, updated_at desc);

create index if not exists idx_parte_sesiones_activas_device
  on public.parte_sesiones_activas(user_id, device_instance_id, updated_at desc);

create unique index if not exists uq_parte_sesion_activa_por_usuario
  on public.parte_sesiones_activas(user_id)
  where estado in ('draft', 'active');

create index if not exists idx_parte_sesiones_auditoria_user_created
  on public.parte_sesiones_auditoria(user_id, created_at desc);

alter table public.parte_sesiones_activas enable row level security;
alter table public.parte_sesiones_auditoria enable row level security;

drop policy if exists "parte_sesiones_activas_select_self" on public.parte_sesiones_activas;
create policy "parte_sesiones_activas_select_self"
on public.parte_sesiones_activas for select to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (user_id = (select auth.uid()) or private_sat.fn_es_admin_sat())
);

drop policy if exists "parte_sesiones_activas_insert_self" on public.parte_sesiones_activas;
create policy "parte_sesiones_activas_insert_self"
on public.parte_sesiones_activas for insert to authenticated
with check (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (user_id = (select auth.uid()) or private_sat.fn_es_admin_sat())
);

drop policy if exists "parte_sesiones_activas_update_self" on public.parte_sesiones_activas;
create policy "parte_sesiones_activas_update_self"
on public.parte_sesiones_activas for update to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (user_id = (select auth.uid()) or private_sat.fn_es_admin_sat())
)
with check (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (user_id = (select auth.uid()) or private_sat.fn_es_admin_sat())
);

drop policy if exists "parte_sesiones_auditoria_select_self" on public.parte_sesiones_auditoria;
create policy "parte_sesiones_auditoria_select_self"
on public.parte_sesiones_auditoria for select to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (user_id = (select auth.uid()) or private_sat.fn_es_admin_sat())
);

drop policy if exists "parte_sesiones_auditoria_insert_self" on public.parte_sesiones_auditoria;
create policy "parte_sesiones_auditoria_insert_self"
on public.parte_sesiones_auditoria for insert to authenticated
with check (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (user_id = (select auth.uid()) or private_sat.fn_es_admin_sat())
);

drop trigger if exists trg_set_updated_at_parte_sesiones_activas on public.parte_sesiones_activas;
create trigger trg_set_updated_at_parte_sesiones_activas
before update on public.parte_sesiones_activas
for each row
execute function public.set_updated_at();

create or replace function private_sat.fn_tecnico_actual_id_sat()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select t.id
  from public.tecnicos t
  where t.user_id = auth.uid()
  limit 1
$$;

revoke all on function private_sat.fn_tecnico_actual_id_sat() from public, anon;
grant execute on function private_sat.fn_tecnico_actual_id_sat() to authenticated;

create or replace function public.fn_claim_parte_sesion_sat(
  p_device_instance_id text,
  p_platform text default 'web',
  p_orden_id uuid default null,
  p_snapshot jsonb default '{}'::jsonb,
  p_estado text default 'draft'
)
returns jsonb
language plpgsql
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_tecnico_id uuid;
  v_now timestamp with time zone := now();
  v_prev public.parte_sesiones_activas%rowtype;
  v_current public.parte_sesiones_activas%rowtype;
  v_evento text := 'claim';
begin
  if v_user_id is null then
    raise exception 'Sesion requerida para sincronizar el parte.';
  end if;

  if nullif(trim(coalesce(p_device_instance_id, '')), '') is null then
    raise exception 'device_instance_id requerido.';
  end if;

  if coalesce(p_estado, 'draft') not in ('draft', 'active') then
    raise exception 'Estado de sesion no permitido: %', p_estado;
  end if;

  v_tecnico_id := private_sat.fn_tecnico_actual_id_sat();

  select *
    into v_prev
  from public.parte_sesiones_activas
  where user_id = v_user_id
    and estado in ('draft', 'active')
    and device_instance_id <> p_device_instance_id
  order by updated_at desc
  limit 1
  for update;

  if found then
    update public.parte_sesiones_activas
       set estado = 'force_closed',
           closed_reason = 'remote_takeover',
           remote_message = format('El parte ha sido cerrado por actividad desde otra instancia (%s).', coalesce(nullif(trim(p_platform), ''), 'desconocida')),
           closed_at = v_now,
           last_seen_at = v_now,
           updated_at = v_now
     where id = v_prev.id
     returning * into v_prev;

    insert into public.parte_sesiones_auditoria (
      sesion_id, user_id, tecnico_id, orden_id, device_instance_id, platform, evento, detalle
    ) values (
      v_prev.id, v_prev.user_id, v_prev.tecnico_id, v_prev.orden_id, v_prev.device_instance_id, v_prev.platform,
      'force_closed_by_remote',
      jsonb_build_object(
        'remote_device_instance_id', p_device_instance_id,
        'remote_platform', p_platform,
        'reason', 'remote_takeover'
      )
    );
  end if;

  select *
    into v_current
  from public.parte_sesiones_activas
  where user_id = v_user_id
    and device_instance_id = p_device_instance_id
    and estado in ('draft', 'active')
  order by updated_at desc
  limit 1
  for update;

  if found then
    v_evento := 'sync';
    update public.parte_sesiones_activas
       set tecnico_id = coalesce(v_tecnico_id, tecnico_id),
           orden_id = coalesce(p_orden_id, orden_id),
           platform = coalesce(nullif(trim(p_platform), ''), platform),
           estado = p_estado,
           snapshot = coalesce(p_snapshot, '{}'::jsonb),
           remote_message = null,
           closed_reason = null,
           closed_at = null,
           last_seen_at = v_now,
           updated_at = v_now
     where id = v_current.id
     returning * into v_current;
  else
    insert into public.parte_sesiones_activas (
      user_id, tecnico_id, orden_id, device_instance_id, platform, estado, snapshot, opened_at, last_seen_at, updated_at
    ) values (
      v_user_id,
      v_tecnico_id,
      p_orden_id,
      p_device_instance_id,
      coalesce(nullif(trim(p_platform), ''), 'web'),
      p_estado,
      coalesce(p_snapshot, '{}'::jsonb),
      v_now,
      v_now,
      v_now
    )
    returning * into v_current;
  end if;

  insert into public.parte_sesiones_auditoria (
    sesion_id, user_id, tecnico_id, orden_id, device_instance_id, platform, evento, detalle
  ) values (
    v_current.id,
    v_current.user_id,
    v_current.tecnico_id,
    v_current.orden_id,
    v_current.device_instance_id,
    v_current.platform,
    v_evento,
    jsonb_build_object(
      'estado', v_current.estado,
      'snapshot', coalesce(p_snapshot, '{}'::jsonb)
    )
  );

  return to_jsonb(v_current);
end;
$$;

grant execute on function public.fn_claim_parte_sesion_sat(text, text, uuid, jsonb, text) to authenticated;

create or replace function public.fn_close_parte_sesion_sat(
  p_device_instance_id text,
  p_reason text default 'submitted',
  p_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamp with time zone := now();
  v_current public.parte_sesiones_activas%rowtype;
  v_estado_final text;
begin
  if v_user_id is null then
    raise exception 'Sesion requerida para cerrar el parte.';
  end if;

  if nullif(trim(coalesce(p_device_instance_id, '')), '') is null then
    raise exception 'device_instance_id requerido.';
  end if;

  v_estado_final := case
    when coalesce(lower(trim(p_reason)), 'submitted') in ('submitted', 'completed', 'finalizado') then 'submitted'
    when coalesce(lower(trim(p_reason)), '') in ('force_closed', 'remote_takeover') then 'force_closed'
    else 'cancelled'
  end;

  select *
    into v_current
  from public.parte_sesiones_activas
  where user_id = v_user_id
    and device_instance_id = p_device_instance_id
    and estado in ('draft', 'active')
  order by updated_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('closed', false, 'reason', 'not_found');
  end if;

  update public.parte_sesiones_activas
     set estado = v_estado_final,
         snapshot = coalesce(p_snapshot, snapshot),
         closed_reason = p_reason,
         closed_at = v_now,
         last_seen_at = v_now,
         updated_at = v_now,
         remote_message = case
           when v_estado_final = 'force_closed' then 'El parte fue cerrado por otra instancia.'
           else null
         end
   where id = v_current.id
   returning * into v_current;

  insert into public.parte_sesiones_auditoria (
    sesion_id, user_id, tecnico_id, orden_id, device_instance_id, platform, evento, detalle
  ) values (
    v_current.id,
    v_current.user_id,
    v_current.tecnico_id,
    v_current.orden_id,
    v_current.device_instance_id,
    v_current.platform,
    'close',
    jsonb_build_object(
      'reason', p_reason,
      'estado_final', v_estado_final,
      'snapshot', coalesce(p_snapshot, '{}'::jsonb)
    )
  );

  return to_jsonb(v_current);
end;
$$;

grant execute on function public.fn_close_parte_sesion_sat(text, text, jsonb) to authenticated;

create or replace function public.fn_get_parte_sesion_activa_sat()
returns jsonb
language sql
stable
security invoker
set search_path = public, auth
as $$
  select coalesce(
    (
      select to_jsonb(s)
      from (
        select *
        from public.parte_sesiones_activas
        where user_id = auth.uid()
          and estado in ('draft', 'active')
        order by updated_at desc
        limit 1
      ) s
    ),
    'null'::jsonb
  )
$$;

grant execute on function public.fn_get_parte_sesion_activa_sat() to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'parte_sesiones_activas'
  ) then
    alter publication supabase_realtime add table public.parte_sesiones_activas;
  end if;
end
$$;
