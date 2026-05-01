-- Bucket publico para almacenar firmas de clientes
insert into storage.buckets (id, name, public)
values ('firmas-clientes', 'firmas-clientes', true)
on conflict (id) do nothing;

-- Politicas abiertas de desarrollo (anon/authenticated)
drop policy if exists "dev_public_read_firmas_clientes" on storage.objects;
create policy "dev_public_read_firmas_clientes"
on storage.objects
for select
to public
using (bucket_id = 'firmas-clientes');

drop policy if exists "dev_public_insert_firmas_clientes" on storage.objects;
create policy "dev_public_insert_firmas_clientes"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'firmas-clientes');

drop policy if exists "dev_public_update_firmas_clientes" on storage.objects;
create policy "dev_public_update_firmas_clientes"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'firmas-clientes')
with check (bucket_id = 'firmas-clientes');

drop policy if exists "dev_public_delete_firmas_clientes" on storage.objects;
create policy "dev_public_delete_firmas_clientes"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'firmas-clientes');
