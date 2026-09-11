-- Migracion: Incorporacion de segundo telefono de contacto al modulo de clientes
-- Fecha: 2026-09-11
-- Idempotente y seguro para produccion.

alter table public.clientes
  add column if not exists telefono_2 text;

comment on column public.clientes.telefono_2 is 'Segundo telefono de contacto (secundario o alternativo) del cliente';
