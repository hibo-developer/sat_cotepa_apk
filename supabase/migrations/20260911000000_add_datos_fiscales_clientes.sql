-- Migracion: Incorporacion de datos fiscales al modulo de clientes
-- Fecha: 2026-09-11
-- Compatibilidad garantizada con registros existentes e idempotencia.

alter table public.clientes
  add column if not exists deleted_at timestamptz,
  add column if not exists identificador_fiscal text,
  add column if not exists razon_social text,
  add column if not exists direccion_fiscal text,
  add column if not exists regimen_tributario text,
  add column if not exists situacion_fiscal text;

-- Comentarios explicativos en las columnas
comment on column public.clientes.identificador_fiscal is 'Identificador fiscal unico del cliente (CUIT/RFC/NIF/CIF)';
comment on column public.clientes.razon_social is 'Razon social o nombre fiscal legal del cliente';
comment on column public.clientes.direccion_fiscal is 'Direccion fiscal declarada para facturacion';
comment on column public.clientes.regimen_tributario is 'Regimen tributario o fiscal aplicable';
comment on column public.clientes.situacion_fiscal is 'Situacion ante el IVA o impuestos (ej. Responsable Inscripto, Consumidor Final)';

-- Indice unico parcial para identificador_fiscal en clientes activos (excluye borrados logicos deleted_at)
create unique index if not exists idx_clientes_identificador_fiscal_unique
  on public.clientes (lower(trim(identificador_fiscal)))
  where deleted_at is null and identificador_fiscal is not null and trim(identificador_fiscal) <> '';

-- Indice de busqueda por razon_social para agilizar consultas
create index if not exists idx_clientes_razon_social
  on public.clientes (razon_social)
  where deleted_at is null;
