-- Añade telefono_fiscal (contacto telefónico de facturación) a clientes
alter table public.clientes
  add column if not exists telefono_fiscal text;

comment on column public.clientes.telefono_fiscal is 'Teléfono de contacto para facturación / datos fiscales';

notify pgrst, 'reload schema';
