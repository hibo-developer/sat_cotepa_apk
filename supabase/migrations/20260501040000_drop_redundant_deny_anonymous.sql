-- Migracion: eliminar policy RESTRICTIVE "deny_anonymous_sat".
-- Motivo:
--   * Cada policy PERMISSIVE ya incluye "is_anonymous = false" (ver 20260501010000),
--     por lo que la barrera RESTRICTIVE es redundante.
--   * El Database Linter de Supabase la marca como "Anonymous Access Policies" (0012)
--     porque heuristicamente detecta el nombre/condicion como sospechoso, aun cuando
--     la policy en realidad bloquea (no permite) acceso anonimo.
--   * Quitarla deja el modelo igual de seguro (las policies PERMISSIVE niegan a anon)
--     y elimina los warnings 0012 del linter.

do $$
declare
  t text;
begin
  foreach t in array array[
    'public.usuarios_sat',
    'public.clientes',
    'public.equipos',
    'public.tecnicos',
    'public.ordenes_trabajo',
    'public.materiales_orden'
  ] loop
    execute format('drop policy if exists "deny_anonymous_sat" on %s', t);
  end loop;

  if to_regclass('public.inventario_materiales') is not null then
    execute 'drop policy if exists "deny_anonymous_sat" on public.inventario_materiales';
  end if;

  if to_regclass('public.inventario_movimientos') is not null then
    execute 'drop policy if exists "deny_anonymous_sat" on public.inventario_movimientos';
  end if;
end
$$;
