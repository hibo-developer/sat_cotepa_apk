-- Modulo de Comerciales (2/3): tabla comerciales, tabla puente
-- clientes_comerciales (asignacion multiple) y RLS.
--
-- Arquitectura calcada de la de "tecnicos":
--   - public.comerciales   -> analoga a public.tecnicos (id, nombre, activo, user_id)
--   - clientes_comerciales -> tabla puente N:N entre clientes y comerciales
--     (un cliente puede tener varios comerciales de referencia).
--
-- Reglas de acceso (rol 'comercial'):
--   - Solo puede ver los clientes en los que aparece como comercial asignado
--     (igual que un tecnico solo ve los clientes de sus ordenes de trabajo).
--   - Puede EDITAR (update) esos clientes, pero no crearlos ni eliminarlos.
--   - No puede modificar la propia asignacion de comerciales de un cliente
--     (eso queda reservado a oficina/admin).

-- =============================================================
-- 1. Tabla comerciales
-- =============================================================
create table if not exists public.comerciales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  es_predeterminado boolean not null default false,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'comerciales_user_id_unique'
      and conrelid = 'public.comerciales'::regclass
  ) then
    alter table public.comerciales
      add constraint comerciales_user_id_unique unique (user_id);
  end if;
end
$$;

-- Solo puede haber un comercial marcado como predeterminado a la vez.
create unique index if not exists idx_comerciales_predeterminado_unico
  on public.comerciales (es_predeterminado)
  where es_predeterminado;

alter table public.comerciales enable row level security;

-- =============================================================
-- 2. Tabla puente clientes_comerciales (N:N)
-- =============================================================
create table if not exists public.clientes_comerciales (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  comercial_id uuid not null references public.comerciales(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  primary key (cliente_id, comercial_id)
);

create index if not exists idx_clientes_comerciales_comercial_id
  on public.clientes_comerciales(comercial_id);

create index if not exists idx_clientes_comerciales_cliente_id
  on public.clientes_comerciales(cliente_id);

alter table public.clientes_comerciales enable row level security;

-- =============================================================
-- 3. Funciones de apoyo (private_sat, SECURITY DEFINER, no expuestas via API)
-- =============================================================
create or replace function private_sat.fn_es_comercial_de_cliente_sat(p_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.clientes_comerciales cc
    join public.comerciales c on c.id = cc.comercial_id
    where cc.cliente_id = p_cliente_id
      and c.user_id = auth.uid()
  );
$$;

revoke all on function private_sat.fn_es_comercial_de_cliente_sat(uuid) from public, anon;
grant execute on function private_sat.fn_es_comercial_de_cliente_sat(uuid) to authenticated;

-- =============================================================
-- 4. Policies: comerciales
-- =============================================================
drop policy if exists "comerciales_select" on public.comerciales;
create policy "comerciales_select"
on public.comerciales for select to authenticated
using (coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false);

drop policy if exists "comerciales_insert_oficina_admin" on public.comerciales;
create policy "comerciales_insert_oficina_admin"
on public.comerciales for insert to authenticated
with check (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and private_sat.fn_es_oficina_o_admin_sat()
);

drop policy if exists "comerciales_update_oficina_admin" on public.comerciales;
create policy "comerciales_update_oficina_admin"
on public.comerciales for update to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and private_sat.fn_es_oficina_o_admin_sat()
)
with check (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and private_sat.fn_es_oficina_o_admin_sat()
);

drop policy if exists "comerciales_delete_oficina_admin" on public.comerciales;
create policy "comerciales_delete_oficina_admin"
on public.comerciales for delete to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and private_sat.fn_es_oficina_o_admin_sat()
);

-- =============================================================
-- 5. Policies: clientes_comerciales (tabla puente)
--    Solo oficina/admin puede escribir asignaciones; un comercial puede
--    leer unicamente sus propias filas (para saber que clientes tiene).
-- =============================================================
drop policy if exists "clientes_comerciales_select" on public.clientes_comerciales;
create policy "clientes_comerciales_select"
on public.clientes_comerciales for select to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and (
    private_sat.fn_es_oficina_o_admin_sat()
    or exists (
      select 1 from public.comerciales c
      where c.id = clientes_comerciales.comercial_id
        and c.user_id = auth.uid()
    )
  )
);

drop policy if exists "clientes_comerciales_write_oficina_admin" on public.clientes_comerciales;
create policy "clientes_comerciales_write_oficina_admin"
on public.clientes_comerciales for all to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and private_sat.fn_es_oficina_o_admin_sat()
)
with check (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and private_sat.fn_es_oficina_o_admin_sat()
);

-- =============================================================
-- 6. Extender policies de clientes para el rol comercial
--    - SELECT: ademas de oficina/admin y tecnico-de-orden, ahora tambien
--      el comercial asignado puede ver el cliente.
--    - UPDATE: nueva policy que permite a un comercial editar (no crear,
--      no borrar) los clientes en los que esta asignado.
-- =============================================================
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
    or private_sat.fn_es_comercial_de_cliente_sat(clientes.id)
  )
);

drop policy if exists "clientes_update_comercial_asignado" on public.clientes;
create policy "clientes_update_comercial_asignado"
on public.clientes for update to authenticated
using (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and clientes.deleted_at is null
  and private_sat.fn_es_comercial_de_cliente_sat(clientes.id)
)
with check (
  coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and private_sat.fn_es_comercial_de_cliente_sat(clientes.id)
);

notify pgrst, 'reload schema';
