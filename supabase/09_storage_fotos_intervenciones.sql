-- Bucket publico para almacenar fotos de la intervencion
insert into storage.buckets (id, name, public)
values ('fotos-intervenciones', 'fotos-intervenciones', true)
on conflict (id) do nothing;

-- Politicas abiertas de desarrollo (anon/authenticated)
drop policy if exists "dev_public_read_fotos_intervenciones" on storage.objects;
create policy "dev_public_read_fotos_intervenciones"
on storage.objects
for select
to public
using (bucket_id = 'fotos-intervenciones');

drop policy if exists "dev_public_insert_fotos_intervenciones" on storage.objects;
create policy "dev_public_insert_fotos_intervenciones"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'fotos-intervenciones');

drop policy if exists "dev_public_update_fotos_intervenciones" on storage.objects;
create policy "dev_public_update_fotos_intervenciones"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'fotos-intervenciones')
with check (bucket_id = 'fotos-intervenciones');

drop policy if exists "dev_public_delete_fotos_intervenciones" on storage.objects;
create policy "dev_public_delete_fotos_intervenciones"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'fotos-intervenciones');
