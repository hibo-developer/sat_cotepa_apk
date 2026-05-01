-- Reset completo de la BD y creacion del usuario admin inicial
-- Ejecutar en Supabase SQL Editor (Dashboard > SQL Editor)
-- ATENCION: borra TODOS los datos y usuarios de Auth.

begin;

-- ── 1. Limpiar datos en orden respetando FK ────────────────────────────────
truncate table public.materiales_orden  restart identity cascade;
truncate table public.ordenes_trabajo   restart identity cascade;
truncate table public.equipos           restart identity cascade;
truncate table public.clientes          restart identity cascade;
truncate table public.tecnicos          restart identity cascade;
truncate table public.usuarios_sat      restart identity cascade;

-- ── 2. Borrar todos los usuarios de Supabase Auth ─────────────────────────
delete from auth.users;

-- ── 3. Crear usuario admin ────────────────────────────────────────────────
-- Genera un UUID nuevo y lo almacena para reutilizarlo
do $$
declare
  v_user_id uuid := gen_random_uuid();
begin
  -- 3a. Insertar en auth.users con password hasheado (bcrypt)
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    'jesus@cotepa.com',
    crypt('207414', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  -- 3b. Insertar identidad (necesaria para que el login funcione)
  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    'jesus@cotepa.com',
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', 'jesus@cotepa.com'),
    'email',
    now(),
    now(),
    now()
  );

  -- 3c. Asignar rol admin en usuarios_sat
  insert into public.usuarios_sat (user_id, rol, nombre_visible)
  values (v_user_id, 'admin', 'Jesus - Admin');

  raise notice 'Admin creado: jesus@cotepa.com (uuid: %)', v_user_id;
end;
$$;

commit;
