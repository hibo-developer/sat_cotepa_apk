-- Asignacion de roles SAT y vinculo tecnico -> auth user
-- Requiere haber ejecutado 04_security_roles_rls.sql
-- Ejecutar en Supabase SQL Editor con un rol con permisos de administracion.

-- 1) Rellena esta matriz con usuarios ya creados en Auth > Users.
-- tecnico_nombre puede ir null para admin/oficina.
with datos(email, rol, nombre_visible, tecnico_nombre) as (
  values
    ('admin@empresa.com', 'admin', 'Administrador SAT', null),
    ('oficina@empresa.com', 'oficina', 'Operador Oficina', null),
    ('tecnico1@empresa.com', 'tecnico', 'Tecnico 1', 'Demo SAT - Laura Gomez')
),
roles_validados as (
  select
    lower(trim(email)) as email,
    rol::public.rol_sat as rol,
    nullif(trim(nombre_visible), '') as nombre_visible,
    nullif(trim(tecnico_nombre), '') as tecnico_nombre
  from datos
),
usuarios_auth as (
  select
    rv.email,
    rv.rol,
    rv.nombre_visible,
    rv.tecnico_nombre,
    au.id as user_id
  from roles_validados rv
  left join auth.users au
    on lower(au.email) = rv.email
)
insert into public.usuarios_sat (user_id, rol, nombre_visible)
select
  ua.user_id,
  ua.rol,
  coalesce(ua.nombre_visible, split_part(ua.email, '@', 1))
from usuarios_auth ua
where ua.user_id is not null
on conflict (user_id)
do update set
  rol = excluded.rol,
  nombre_visible = excluded.nombre_visible;

-- 2) Vincular tecnico con usuario Auth cuando aplique.
with datos(email, rol, nombre_visible, tecnico_nombre) as (
  values
    ('admin@empresa.com', 'admin', 'Administrador SAT', null),
    ('oficina@empresa.com', 'oficina', 'Operador Oficina', null),
    ('tecnico1@empresa.com', 'tecnico', 'Tecnico 1', 'Demo SAT - Laura Gomez')
),
roles_validados as (
  select
    lower(trim(email)) as email,
    rol::public.rol_sat as rol,
    nullif(trim(nombre_visible), '') as nombre_visible,
    nullif(trim(tecnico_nombre), '') as tecnico_nombre
  from datos
),
tecnicos_a_vincular as (
  select
    au.id as user_id,
    rv.tecnico_nombre
  from roles_validados rv
  join auth.users au
    on lower(au.email) = rv.email
  where rv.rol = 'tecnico'
    and rv.tecnico_nombre is not null
)
update public.tecnicos t
set user_id = tv.user_id
from tecnicos_a_vincular tv
where lower(t.nombre) = lower(tv.tecnico_nombre);

-- 3) Verificacion rapida.
select
  us.user_id,
  au.email,
  us.rol,
  us.nombre_visible,
  t.id as tecnico_id,
  t.nombre as tecnico_nombre
from public.usuarios_sat us
left join auth.users au on au.id = us.user_id
left join public.tecnicos t on t.user_id = us.user_id
order by us.rol, au.email;

-- 4) Diagnostico: emails del bloque de datos que no existen en Auth.
with datos(email) as (
  values
    ('admin@empresa.com'),
    ('oficina@empresa.com'),
    ('tecnico1@empresa.com')
)
select d.email
from datos d
left join auth.users au on lower(au.email) = lower(trim(d.email))
where au.id is null;
