-- Segundo contacto independiente (nombre + cargo), asociado a telefono_2
alter table public.clientes
  add column if not exists contacto_2 text,
  add column if not exists cargo_2 text;

comment on column public.clientes.contacto_2 is 'Nombre de la segunda persona de contacto';
comment on column public.clientes.cargo_2 is 'Cargo/puesto de la segunda persona de contacto';

notify pgrst, 'reload schema';
