# Plan de Despliegue Seguro y Rollback: Módulo de Clientes (Datos Fiscales)

## 1. Resumen de Cambios

Se ha ampliado el módulo de clientes para incorporar los datos fiscales requeridos para facturación y normativa tributaria:
- `identificador_fiscal` (CUIT / RFC / NIF / CIF): Identificador fiscal único sanitizado y validado.
- `razon_social`: Razón social o nombre legal fiscal.
- `direccion_fiscal`: Dirección tributaria registrada.
- `regimen_tributario`: Régimen fiscal aplicable (ej. Régimen General, Monotributo, etc.).
- `situacion_fiscal`: Situación frente al IVA / Impuestos (ej. Responsable Inscripto, Consumidor Final, Exento).

## 2. Garantías de Retrocompatibilidad e Integridad

1. **Campos Opcionales en BD**: Todos los nuevos campos permiten valores nulos (`NULL`), por lo que los registros existentes de clientes creados con anterioridad siguen siendo 100% funcionales sin modificaciones destructivas.
2. **Validaciones en API / Servicio**: `validarYSanearPayloadCliente()` sanea los datos sin alterar campos originales (`nombre`, `direccion`, `telefono`, `email`, `lat`, `lng`).
3. **Índice Único Parcial**: `idx_clientes_identificador_fiscal_unique` aplica únicamente cuando el cliente está activo (`deleted_at IS NULL`) e `identificador_fiscal` no está vacío, previniendo duplicados involuntarios sin interferir con registros antiguos que no tengan identificador fiscal asignado.

## 3. Protocolo de Despliegue Gradual (Zero Downtime)

### Paso 1: Migración de Base de Datos (Pre-deploy)
Ejecutar el script de migración SQL en Supabase:
`supabase/migrations/20260911000000_add_datos_fiscales_clientes.sql`

Puntos clave:
- Usa `ADD COLUMN IF NOT EXISTS`, garantizando idempotencia.
- No bloquea lecturas ni escrituras concurrentes.

### Paso 2: Despliegue del Código de Aplicación (Deploy)
1. Desplegar los artefactos cliente (Web / PWA / APK / Desktop).
2. Los clientes antiguos verán la nueva interfaz y podrán empezar a capturar datos fiscales sin interrupción.

### Paso 3: Verificación Post-Despliegue
- Confirmar creación de nuevo cliente con datos fiscales completos.
- Confirmar edición de cliente existente agregando datos fiscales.
- Confirmar consulta y filtrado por CUIT/RFC/Razón Social.
- Verificar que los partes de trabajo y órdenes de trabajo siguen operando correctamente.

## 4. Plan de Rollback Inmediato

En caso de detectar cualquier anomalía grave durante o inmediatamente después del despliegue:

### Nivel 1: Rollback de Frontend / Aplicación
Revertir el despliegue del frontend al commit previo.
Dado que la base de datos solo añadió columnas opcionales, la versión anterior del frontend continuará ignorando los campos adicionales sin causar fallos.

### Nivel 2: Reversión en Base de Datos (Si fuera estrictamente necesario)
Ejecutar en el Editor SQL de Supabase:

```sql
-- Script de Reversión (Rollback SQL)
DROP INDEX IF EXISTS public.idx_clientes_identificador_fiscal_unique;
DROP INDEX IF EXISTS public.idx_clientes_razon_social;

-- NOTA: Se recomienda conservar las columnas para evitar perdida de datos si se ingresaron nuevos registros.
-- Si se requiere eliminacion explicita de columnas:
-- ALTER TABLE public.clientes
--   DROP COLUMN IF EXISTS identificador_fiscal,
--   DROP COLUMN IF EXISTS razon_social,
--   DROP COLUMN IF EXISTS direccion_fiscal,
--   DROP COLUMN IF EXISTS regimen_tributario,
--   DROP COLUMN IF EXISTS situacion_fiscal;
```
