-- Migracion: Incorporacion de persona de contacto y cargo al modulo de clientes
-- Fecha: 2026-09-11
-- Compatibilidad garantizada con registros existentes e idempotencia.

alter table public.clientes
  add column if not exists contacto text,
  add column if not exists cargo text;

comment on column public.clientes.contacto is 'Nombre de la persona de contacto principal en el cliente';
comment on column public.clientes.cargo is 'Cargo o puesto de la persona de contacto';
