import { useEffect, useMemo, useState } from 'react';
import {
  actualizarMaterialInventario,
  crearOActualizarMaterialInventario,
  eliminarMaterialInventario,
  listarMaterialesInventario,
  listarMovimientosInventario,
  regularizarStockMaterialInventario,
} from '../services/inventarioMaterialesService';
import { tieneConfiguracionSupabase } from '../services/supabaseClient';

const FORM_MATERIAL_INICIAL = {
  nombre: '',
  descripcion: '',
  unidad: 'ud',
  stock_actual: '0',
  precio_ref: '',
  activo: true,
  motivo: '',
};

const FORM_REGULARIZACION_INICIAL = {
  material_id: '',
  modo: 'fijar',
  cantidad: '0',
  motivo: '',
};

const OPCIONES_ITEMS_PAGINA = [5, 10, 20];

export function InventarioView({ rolUsuario }) {
  const [materialesInventario, setMaterialesInventario] = useState([]);
  const [movimientosInventario, setMovimientosInventario] = useState([]);
  const [movimientosSoportados, setMovimientosSoportados] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(true);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [materialForm, setMaterialForm] = useState(FORM_MATERIAL_INICIAL);
  const [materialEditandoId, setMaterialEditandoId] = useState('');
  const [regularizacionForm, setRegularizacionForm] = useState(FORM_REGULARIZACION_INICIAL);
  const [filtroMaterialMovimientoId, setFiltroMaterialMovimientoId] = useState('');
  const [paginaMateriales, setPaginaMateriales] = useState(1);
  const [itemsPaginaMateriales, setItemsPaginaMateriales] = useState(5);

  const sinConfiguracion = useMemo(() => !tieneConfiguracionSupabase(), []);
  const puedeEditarCatalogos = rolUsuario === 'admin' || rolUsuario === 'oficina';
  const modoSoloLectura = !puedeEditarCatalogos;

  const totalPaginasMateriales = Math.max(1, Math.ceil(materialesInventario.length / itemsPaginaMateriales));
  const materialesPaginados = useMemo(() => {
    const inicio = (paginaMateriales - 1) * itemsPaginaMateriales;
    return materialesInventario.slice(inicio, inicio + itemsPaginaMateriales);
  }, [materialesInventario, paginaMateriales, itemsPaginaMateriales]);

  useEffect(() => {
    if (paginaMateriales > totalPaginasMateriales) {
      setPaginaMateriales(totalPaginasMateriales);
    }
  }, [paginaMateriales, totalPaginasMateriales]);

  async function recargarDatos() {
    if (sinConfiguracion) {
      setCargando(false);
      return;
    }

    setCargando(true);
    setError('');

    try {
      const datosMateriales = await listarMaterialesInventario();
      setMaterialesInventario(datosMateriales || []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar los materiales de inventario.');
    } finally {
      setCargando(false);
    }
  }

  async function cargarMovimientos() {
    if (sinConfiguracion) {
      setCargandoMovimientos(false);
      return;
    }

    setCargandoMovimientos(true);

    try {
      const respuesta = await listarMovimientosInventario({
        materialId: filtroMaterialMovimientoId,
        limite: 50,
      });
      setMovimientosInventario(respuesta.items || []);
      setMovimientosSoportados(respuesta.soportado !== false);
    } catch (err) {
      setError(err.message || 'No se pudo cargar historial.');
    } finally {
      setCargandoMovimientos(false);
    }
  }

  useEffect(() => {
    recargarDatos();
  }, []);

  useEffect(() => {
    cargarMovimientos();
  }, [filtroMaterialMovimientoId]);

  function formatearFechaHora(valor) {
    if (!valor) {
      return 'Sin fecha';
    }
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) {
      return 'Sin fecha';
    }
    return fecha.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function etiquetaTipoMovimiento(tipo) {
    if (tipo === 'alta') {
      return 'Alta';
    }
    if (tipo === 'entrada') {
      return 'Entrada';
    }
    if (tipo === 'salida') {
      return 'Salida';
    }
    if (tipo === 'regularizacion') {
      return 'Regularizacion';
    }
    return tipo || 'Movimiento';
  }

  function claseTipoMovimiento(tipo) {
    if (tipo === 'salida') {
      return 'bg-rose-100 text-rose-700';
    }
    if (tipo === 'regularizacion') {
      return 'bg-amber-100 text-amber-700';
    }
    return 'bg-emerald-100 text-emerald-700';
  }

  function limpiarFormMaterial() {
    setMaterialForm(FORM_MATERIAL_INICIAL);
    setMaterialEditandoId('');
  }

  function limpiarFormRegularizacion() {
    setRegularizacionForm(FORM_REGULARIZACION_INICIAL);
  }

  async function guardarMaterial(evento) {
    evento.preventDefault();
    setMensaje('');
    setError('');

    try {
      const payload = {
        nombre: materialForm.nombre,
        descripcion: materialForm.descripcion || null,
        unidad: materialForm.unidad || 'ud',
        stock_actual: materialForm.stock_actual,
        precio_ref: materialForm.precio_ref,
        activo: materialForm.activo,
        motivo: materialForm.motivo,
      };

      if (materialEditandoId) {
        await actualizarMaterialInventario(materialEditandoId, payload);
        setMensaje('Material actualizado correctamente.');
      } else {
        const resultado = await crearOActualizarMaterialInventario(payload);
        if (resultado.accion === 'actualizado') {
          setMensaje('Material existente actualizado: se sumó el stock correctamente.');
        } else {
          setMensaje('Material creado correctamente.');
        }
      }

      limpiarFormMaterial();
      await recargarDatos();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el material de inventario.');
    }
  }

  async function borrarMaterial(idMaterial) {
    setMensaje('');
    setError('');

    try {
      await eliminarMaterialInventario(idMaterial);
      setMensaje('Material eliminado correctamente.');
      if (materialEditandoId === idMaterial) {
        limpiarFormMaterial();
      }
      await recargarDatos();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el material de inventario.');
    }
  }

  async function regularizarStock(evento) {
    evento.preventDefault();
    setMensaje('');
    setError('');

    try {
      await regularizarStockMaterialInventario(regularizacionForm.material_id, {
        modo: regularizacionForm.modo,
        cantidad: regularizacionForm.cantidad,
        motivo: regularizacionForm.motivo,
      });
      setMensaje('Regularizacion aplicada correctamente.');
      limpiarFormRegularizacion();
      await recargarDatos();
    } catch (err) {
      setError(err.message || 'No se pudo regularizar el stock.');
    }
  }

  if (sinConfiguracion) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
        Configura Supabase en `app-config.js` o con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para habilitar el inventario de materiales.
      </section>
    );
  }

  return (
    <section className="space-y-4 pb-20 lg:pb-0">
      <header className="rounded-2xl bg-marca-900 p-4 text-white shadow-lg lg:p-5">
        <h2 className="text-lg font-bold">Inventario SAT</h2>
        <p className="mt-1 text-sm text-slate-200">Gestión de materiales globales de almacén.</p>
      </header>

      {modoSoloLectura && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Tu rol técnico solo tiene acceso de consulta al inventario. La edición está reservada a administración/oficina.
        </p>
      )}

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {mensaje && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {mensaje}
        </p>
      )}

      <div className="lg:grid lg:grid-cols-12 lg:gap-4">
        {puedeEditarCatalogos && (
          <div className="space-y-4 lg:col-span-4 lg:sticky lg:top-5 lg:self-start">
            <form onSubmit={guardarMaterial} className="space-y-3 rounded-2xl border border-marca-100 bg-white p-4 shadow-tarjeta">
              <h3 className="text-base font-bold text-sat-text">
                {materialEditandoId ? 'Editar material' : 'Nuevo material'}
              </h3>
              {!materialEditandoId && (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  Si el material ya existe, se sumará el stock automáticamente en lugar de crear un duplicado.
                </p>
              )}

              <input
                required
                value={materialForm.nombre}
                onChange={(e) => setMaterialForm((p) => ({ ...p, nombre: e.target.value }))}
                className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
                placeholder="Nombre del material"
              />

              <input
                value={materialForm.descripcion}
                onChange={(e) => setMaterialForm((p) => ({ ...p, descripcion: e.target.value }))}
                className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
                placeholder="Descripcion"
              />

              <div className="grid grid-cols-3 gap-2">
                <input
                  value={materialForm.unidad}
                  onChange={(e) => setMaterialForm((p) => ({ ...p, unidad: e.target.value }))}
                  className="rounded-xl border border-sat-border px-4 py-3 text-sm"
                  placeholder="Unidad"
                />
                <input
                  type="number"
                  min="0"
                  value={materialForm.stock_actual}
                  onChange={(e) => setMaterialForm((p) => ({ ...p, stock_actual: e.target.value }))}
                  className="rounded-xl border border-sat-border px-4 py-3 text-sm"
                  placeholder={materialEditandoId ? 'Stock total' : 'Cantidad'}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={materialForm.precio_ref}
                  onChange={(e) => setMaterialForm((p) => ({ ...p, precio_ref: e.target.value }))}
                  className="rounded-xl border border-sat-border px-4 py-3 text-sm"
                  placeholder="Precio"
                />
              </div>

              <input
                value={materialForm.motivo}
                onChange={(e) => setMaterialForm((p) => ({ ...p, motivo: e.target.value }))}
                className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
                placeholder="Motivo (opcional)"
              />

              <label className="flex items-center gap-2 rounded-xl border border-sat-border-soft px-3 py-2 text-sm text-sat-muted">
                <input
                  type="checkbox"
                  checked={materialForm.activo}
                  onChange={(e) => setMaterialForm((p) => ({ ...p, activo: e.target.checked }))}
                />
                Material activo
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button className="rounded-xl bg-cotepa-rojo-500 px-4 py-3 text-sm font-bold text-white" type="submit">
                  {materialEditandoId ? 'Actualizar' : 'Guardar'}
                </button>
                <button
                  className="rounded-xl bg-slate-200 px-4 py-3 text-sm font-bold text-sat-muted"
                  type="button"
                  onClick={limpiarFormMaterial}
                >
                  Limpiar
                </button>
              </div>
            </form>

            <form onSubmit={regularizarStock} className="space-y-3 rounded-2xl border border-marca-100 bg-white p-4 shadow-tarjeta">
              <h3 className="text-base font-bold text-sat-text">Regularizar stock</h3>
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Usa esta opción para ajustes por inventario físico, roturas o correcciones administrativas.
              </p>

              <select
                required
                value={regularizacionForm.material_id}
                onChange={(e) => setRegularizacionForm((p) => ({ ...p, material_id: e.target.value }))}
                className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
              >
                <option value="">Selecciona material</option>
                {materialesInventario.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.nombre} · stock {material.stock_actual}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={regularizacionForm.modo}
                  onChange={(e) => setRegularizacionForm((p) => ({ ...p, modo: e.target.value }))}
                  className="rounded-xl border border-sat-border px-3 py-3 text-sm"
                >
                  <option value="fijar">Fijar stock final</option>
                  <option value="sumar">Sumar stock</option>
                  <option value="restar">Restar stock</option>
                </select>
                <input
                  required
                  type="number"
                  min="0"
                  value={regularizacionForm.cantidad}
                  onChange={(e) => setRegularizacionForm((p) => ({ ...p, cantidad: e.target.value }))}
                  className="rounded-xl border border-sat-border px-3 py-3 text-sm"
                  placeholder="Cantidad"
                />
              </div>

              <textarea
                required
                rows={2}
                value={regularizacionForm.motivo}
                onChange={(e) => setRegularizacionForm((p) => ({ ...p, motivo: e.target.value }))}
                className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
                placeholder="Motivo de la regularizacion"
              />

              <div className="grid grid-cols-2 gap-2">
                <button className="rounded-xl bg-marca-900 px-4 py-3 text-sm font-bold text-white" type="submit">
                  Aplicar
                </button>
                <button
                  className="rounded-xl bg-slate-200 px-4 py-3 text-sm font-bold text-sat-muted"
                  type="button"
                  onClick={limpiarFormRegularizacion}
                >
                  Limpiar
                </button>
              </div>
            </form>
          </div>
        )}

        <div className={`space-y-2 ${puedeEditarCatalogos ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
          {cargando && <p className="text-sm font-semibold text-sat-muted">Cargando materiales...</p>}
          {!cargando && materialesInventario.length > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-sat-border-soft bg-sat-surface px-3 py-2 text-xs font-semibold text-sat-muted">
              <div className="flex items-center gap-3">
                <span>Pagina {paginaMateriales} de {totalPaginasMateriales}</span>
                <label className="flex items-center gap-1">
                  <span>Mostrar</span>
                  <select
                    value={itemsPaginaMateriales}
                    onChange={(e) => {
                      setItemsPaginaMateriales(Number(e.target.value));
                      setPaginaMateriales(1);
                    }}
                    className="rounded-md border border-sat-border bg-white px-2 py-1 text-xs"
                  >
                    {OPCIONES_ITEMS_PAGINA.map((opcion) => (
                      <option key={opcion} value={opcion}>{opcion}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaginaMateriales((previo) => Math.max(1, previo - 1))}
                  disabled={paginaMateriales === 1}
                  className="rounded-lg border border-sat-border bg-white px-3 py-1.5 disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setPaginaMateriales((previo) => Math.min(totalPaginasMateriales, previo + 1))}
                  disabled={paginaMateriales === totalPaginasMateriales}
                  className="rounded-lg border border-sat-border bg-white px-3 py-1.5 disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
          {!cargando &&
            materialesPaginados.map((material) => (
              <article key={material.id} className="rounded-2xl border border-marca-100 bg-white p-4 shadow-tarjeta">
                <p className="text-sm font-bold text-sat-text">{material.nombre}</p>
                <p className="text-xs text-sat-muted">
                  {material.descripcion || 'Sin descripcion'}
                </p>
                <p className="mt-1 text-xs text-sat-subtle">
                  Stock: {material.stock_actual} {material.unidad || 'ud'} · Precio ref: {material.precio_ref ?? 'N/D'}
                </p>
                <p className="mt-1 text-xs text-sat-subtle">Estado: {material.activo ? 'Activo' : 'Inactivo'}</p>

                {puedeEditarCatalogos && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      className="rounded-xl bg-marca-50 px-3 py-2 text-xs font-bold text-marca-700"
                      onClick={() => {
                        setMaterialEditandoId(material.id);
                        setMaterialForm({
                          nombre: material.nombre || '',
                          descripcion: material.descripcion || '',
                          unidad: material.unidad || 'ud',
                          stock_actual: String(material.stock_actual ?? 0),
                          precio_ref: material.precio_ref ?? '',
                          activo: Boolean(material.activo),
                          motivo: '',
                        });
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-bold text-amber-700"
                      onClick={() =>
                        setRegularizacionForm((previo) => ({
                          ...previo,
                          material_id: material.id,
                        }))
                      }
                    >
                      Regularizar
                    </button>
                    <button
                      type="button"
                      className="rounded-xl bg-rose-100 px-3 py-2 text-xs font-bold text-rose-700"
                      onClick={() => borrarMaterial(material.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </article>
            ))}
        </div>
      </div>

      <section className="space-y-3 rounded-2xl border border-marca-100 bg-white p-4 shadow-tarjeta">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-base font-bold text-sat-text">Historial de movimientos</h3>
            <p className="text-xs text-sat-muted">Entradas, salidas y regularizaciones con motivo.</p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-sat-muted">Filtrar por material</label>
            <select
              value={filtroMaterialMovimientoId}
              onChange={(e) => setFiltroMaterialMovimientoId(e.target.value)}
              className="rounded-xl border border-sat-border px-3 py-2 text-xs"
            >
              <option value="">Todos</option>
              {materialesInventario.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!movimientosSoportados && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            El historial requiere la migracion de base de datos 14_inventario_movimientos_regularizacion.sql.
          </p>
        )}

        {cargandoMovimientos && <p className="text-sm text-sat-muted">Cargando movimientos...</p>}

        {!cargandoMovimientos && movimientosSoportados && movimientosInventario.length === 0 && (
          <p className="rounded-xl border border-sat-border-soft bg-sat-surface p-3 text-sm text-sat-muted">
            No hay movimientos registrados para el filtro seleccionado.
          </p>
        )}

        {!cargandoMovimientos && movimientosSoportados && movimientosInventario.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-sat-border-soft">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-sat-surface text-sat-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Fecha</th>
                  <th className="px-3 py-2 text-left font-semibold">Material</th>
                  <th className="px-3 py-2 text-left font-semibold">Tipo</th>
                  <th className="px-3 py-2 text-left font-semibold">Cantidad</th>
                  <th className="px-3 py-2 text-left font-semibold">Stock</th>
                  <th className="px-3 py-2 text-left font-semibold">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {movimientosInventario.map((movimiento) => {
                  const cantidadNumerica = Number(movimiento.cantidad) || 0;
                  const cantidadTexto = cantidadNumerica > 0 ? `+${cantidadNumerica}` : String(cantidadNumerica);
                  const materialNombre = movimiento.inventario_materiales?.nombre || 'Material';

                  return (
                    <tr key={movimiento.id}>
                      <td className="whitespace-nowrap px-3 py-2 text-sat-muted">{formatearFechaHora(movimiento.creado_en)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-sat-muted">{materialNombre}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-1 font-semibold ${claseTipoMovimiento(movimiento.tipo_movimiento)}`}>
                          {etiquetaTipoMovimiento(movimiento.tipo_movimiento)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold text-sat-muted">{cantidadTexto}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-sat-muted">
                        {movimiento.stock_anterior} {'->'} {movimiento.stock_nuevo}
                      </td>
                      <td className="px-3 py-2 text-sat-muted">{movimiento.motivo || 'Sin motivo'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
