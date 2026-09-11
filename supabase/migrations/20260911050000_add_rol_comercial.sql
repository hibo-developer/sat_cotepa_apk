-- Modulo de Comerciales (1/3): anade el valor 'comercial' al enum rol_sat.
-- IMPORTANTE: ALTER TYPE ... ADD VALUE no puede usarse en la misma transaccion
-- en la que despues se referencia el nuevo valor, por eso vive en su propio
-- archivo de migracion, separado de las policies/tablas que lo usan.

alter type public.rol_sat add value if not exists 'comercial';
