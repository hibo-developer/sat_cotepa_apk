import { useEffect, useMemo, useState } from 'react';
import { CircleCheckBig, Package, ShieldAlert, TriangleAlert } from 'lucide-react';
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
const claseTarjeta = 'rounded-3xl border border-marca-100 bg-white p-4 shadow-tarjeta';
const claseCampo = 'w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-marca-600 focus:outline-none focus:ring-4 focus:ring-marca-100';
const claseEtiqueta = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600';
const claseBotonPrimario = 'rounded-2xl bg-cotepa-rojo-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-red-200 transition hover:bg-cotepa-rojo-600 focus:outline-none focus:ring-4 focus:ring-red-100';
const claseBotonSecundario = 'rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-200 focus:outline-none focus:ring-4 focus:ring-slate-200';
const claseBotonAccion = 'rounded-xl bg-marca-50 px-3 py-2 text-xs font-bold text-marca-700 transition hover:bg-marca-100 focus:outline-none focus:ring-4 focus:ring-marca-100';
const claseBotonWarning = 'rounded-xl bg-amber-100 px-3 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-200 focus:outline-none focus:ring-4 focus:ring-amber-100';
const claseBotonPeligro = 'rounded-xl bg-rose-100 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-200 focus:outline-none focus:ring-4 focus:ring-rose-100';

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
  const totalActivos = materialesInventario.filter((material) => material.activo).length;
  const totalInactivos = Math.max(0, materialesInventario.length - totalActivos);
  const materialesConStock = materialesInventario.filter((material) => Number(material.stock_actual) > 0).length;
  const resumenInventario = [
    { etiqueta: 'Materiales', valor: materialesInventario.length, detalle: 'catalogo total' },
    { etiqueta: 'Activos', valor: totalActivos, detalle: 'disponibles para uso' },
    { etiqueta: 'Con stock', valor: materialesConStock, detalle: 'referencias con existencia' },
    { etiqueta: 'Inactivos', valor: totalInactivos, detalle: 'fuera de operativa' },
  ];

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
      <header className="rounded-3xl border border-marca-700/40 bg-marca-900 p-5 text-white shadow-xl lg:p-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-100">
          <Package className="h-3.5 w-3.5" />
          Inventario
        </div>
        <h2 className="mt-4 text-xl font-bold">Inventario SAT</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
          Gestión de materiales globales de almacén con seguimiento de stock, regularizaciones y movimientos recientes.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {resumenInventario.map((item) => (
            <div
              key={item.etiqueta}
              className="rounded-2xl border border-white/10 bg-white/10 p-3 shadow-lg shadow-black/5 backdrop-blur-sm"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-200">{item.etiqueta}</p>
              <p className="mt-2 text-2xl font-bold text-white">{item.valor}</p>
              <p className="mt-1 text-xs text-slate-200">{item.detalle}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-slate-200 shadow-lg shadow-black/5 backdrop-blur-sm">
          {movimientosSoportados
            ? `Historial activo con ${movimientosInventario.length} movimientos recientes y panel en modo ${modoSoloLectura ? 'consulta' : 'edicion'}.`
            : 'Historial pendiente de soporte en base de datos. El resto del inventario permanece operativo.'}
        </div>
      </header>

      {modoSoloLectura && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p>
            Tu rol técnico solo tiene acceso de consulta al inventario. La edición está reservada a administración/oficina.
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <p>{error}</p>
        </div>
      )}
      {mensaje && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm">
          <CircleCheckBig className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <p>{mensaje}</p>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-12 lg:gap-4">
        {puedeEditarCatalogos && (
          <div className="space-y-4 lg:col-span-4 lg:sticky lg:top-5 lg:self-start">
            <form onSubmit={guardarMaterial} className={`space-y-4 ${claseTarjeta}`}>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-marca-100 bg-marca-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-marca-700">
                  <Package className="h-3.5 w-3.5" />
                  Ficha material
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    {materialEditandoId ? 'Editar material' : 'Nuevo material'}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Centraliza nombre, stock y precio de referencia para mantener el inventario operativo y trazable.
                  </p>
                </div>
              </div>
              {!materialEditandoId && (
                <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  Si el material ya existe, se sumará el stock automáticamente en lugar de crear un duplicado.
                </p>
              )}

              <label className="block">
                <span className={claseEtiqueta}>Nombre del material</span>
                <input
                  required
                  value={materialForm.nombre}
                  onChange={(e) => setMaterialForm((p) => ({ ...p, nombre: e.target.value }))}
                  className={claseCampo}
                  placeholder="Nombre del material"
                />
              </label>

              <label className="block">
                <span className={claseEtiqueta}>Descripcion</span>
                <input
                  value={materialForm.descripcion}
                  onChange={(e) => setMaterialForm((p) => ({ ...p, descripcion: e.target.value }))}
                  className={claseCampo}
                  placeholder="Descripcion"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className={claseEtiqueta}>Unidad</span>
                  <input
                    value={materialForm.unidad}
                    onChange={(e) => setMaterialForm((p) => ({ ...p, unidad: e.target.value }))}
                    className={claseCampo}
                    placeholder="Unidad"
                  />
                </label>
                <label className="block">
                  <span className={claseEtiqueta}>{materialEditandoId ? 'Stock total' : 'Cantidad'}</span>
                  <input
                    type="number"
                    min="0"
                    value={materialForm.stock_actual}
                    onChange={(e) => setMaterialForm((p) => ({ ...p, stock_actual: e.target.value }))}
                    className={claseCampo}
                    placeholder={materialEditandoId ? 'Stock total' : 'Cantidad'}
                  />
                </label>
                <label className="block">
                  <span className={claseEtiqueta}>Precio ref.</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={materialForm.precio_ref}
                    onChange={(e) => setMaterialForm((p) => ({ ...p, precio_ref: e.target.value }))}
                    className={claseCampo}
                    placeholder="Precio"
                  />
                </label>
              </div>

              <label className="block">
                <span className={claseEtiqueta}>Motivo</span>
                <input
                  value={materialForm.motivo}
                  onChange={(e) => setMaterialForm((p) => ({ ...p, motivo: e.target.value }))}
                  className={claseCampo}
                  placeholder="Motivo (opcional)"
                />
              </label>

              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={materialForm.activo}
                  onChange={(e) => setMaterialForm((p) => ({ ...p, activo: e.target.checked }))}
                />
                Material activo
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button className={claseBotonPrimario} type="submit">
                  {materialEditandoId ? 'Actualizar' : 'Guardar'}
                </button>
                <button
                  className={claseBotonSecundario}
                  type="button"
                  onClick={limpiarFormMaterial}
                >
                  Limpiar
                </button>
              </div>
            </form>

            <form onSubmit={regularizarStock} className={`space-y-4 ${claseTarjeta}`}>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">
                  <TriangleAlert className="h-3.5 w-3.5" />
                  Ajuste manual
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Regularizar stock</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Usa este bloque para correcciones de inventario físico, incidencias de almacen o ajustes administrativos.
                  </p>
                </div>
              </div>
              <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Usa esta opción para ajustes por inventario físico, roturas o correcciones administrativas.
              </p>

              <label className="block">
                <span className={claseEtiqueta}>Material</span>
                <select
                  required
                  value={regularizacionForm.material_id}
                  onChange={(e) => setRegularizacionForm((p) => ({ ...p, material_id: e.target.value }))}
                  className={claseCampo}
                >
                  <option value="">Selecciona material</option>
                  {materialesInventario.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.nombre} · stock {material.stock_actual}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={claseEtiqueta}>Modo</span>
                  <select
                    value={regularizacionForm.modo}
                    onChange={(e) => setRegularizacionForm((p) => ({ ...p, modo: e.target.value }))}
                    className={claseCampo}
                  >
                    <option value="fijar">Fijar stock final</option>
                    <option value="sumar">Sumar stock</option>
                    <option value="restar">Restar stock</option>
                  </select>
                </label>
                <label className="block">
                  <span className={claseEtiqueta}>Cantidad</span>
                  <input
                    required
                    type="number"
                    min="0"
                    value={regularizacionForm.cantidad}
                    onChange={(e) => setRegularizacionForm((p) => ({ ...p, cantidad: e.target.value }))}
                    className={claseCampo}
                    placeholder="Cantidad"
                  />
                </label>
              </div>

              <label className="block">
                <span className={claseEtiqueta}>Motivo</span>
                <textarea
                  required
                  rows={2}
                  value={regularizacionForm.motivo}
                  onChange={(e) => setRegularizacionForm((p) => ({ ...p, motivo: e.target.value }))}
                  className={claseCampo}
                  placeholder="Motivo de la regularizacion"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button className="rounded-2xl bg-marca-900 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-slate-200 transition hover:bg-marca-800 focus:outline-none focus:ring-4 focus:ring-marca-100" type="submit">
                  Aplicar
                </button>
                <button
                  className={claseBotonSecundario}
                  type="button"
                  onClick={limpiarFormRegularizacion}
                >
                  Limpiar
                </button>
              </div>
            </form>
          </div>
        )}

        <div className={`space-y-3 ${puedeEditarCatalogos ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
          {cargando && <p className="text-sm font-semibold text-slate-600">Cargando materiales...</p>}
          {!cargando && materialesInventario.length > 0 && (
            <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs font-semibold text-slate-700 shadow-sm sm:flex-row sm:items-center sm:justify-between">
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
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-marca-100"
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
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 transition focus:outline-none focus:ring-2 focus:ring-marca-100 disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setPaginaMateriales((previo) => Math.min(totalPaginasMateriales, previo + 1))}
                  disabled={paginaMateriales === totalPaginasMateriales}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 transition focus:outline-none focus:ring-2 focus:ring-marca-100 disabled:opacity-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
          {!cargando && materialesInventario.length > 0 && (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Visibles</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{materialesPaginados.length}</p>
                <p className="mt-1 text-xs text-slate-500">materiales en la página actual</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Historial</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{movimientosSoportados ? movimientosInventario.length : '-'}</p>
                <p className="mt-1 text-xs text-slate-500">movimientos recientes cargados</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Modo</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{modoSoloLectura ? 'Consulta' : 'Edicion'}</p>
                <p className="mt-1 text-xs text-slate-500">acceso del usuario actual</p>
              </div>
            </div>
          )}
          {!cargando &&
            materialesPaginados.map((material) => (
              <article key={material.id} className={`${claseTarjeta} transition hover:border-marca-200 hover:shadow-md`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{material.nombre}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {material.descripcion || 'Sin descripcion'}
                    </p>
                  </div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${
                    material.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {material.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    Stock: {material.stock_actual} {material.unidad || 'ud'}
                  </span>
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    Precio ref: {material.precio_ref ?? 'N/D'}
                  </span>
                </div>

                {puedeEditarCatalogos && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      className={claseBotonAccion}
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
                      className={claseBotonWarning}
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
                      className={claseBotonPeligro}
                      onClick={() => borrarMaterial(material.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </article>
            ))}

          {!cargando && materialesInventario.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              No hay materiales registrados todavia. Puedes crear el primero desde el panel lateral.
            </div>
          )}
        </div>
      </div>

      <section className={`space-y-4 ${claseTarjeta}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">Historial de movimientos</h3>
            <p className="text-sm leading-6 text-slate-600">Entradas, salidas y regularizaciones con motivo para revisar el rastro operativo reciente.</p>
          </div>

          <div className="w-full max-w-xs">
            <label className="block">
              <span className={claseEtiqueta}>Filtrar por material</span>
              <select
                value={filtroMaterialMovimientoId}
                onChange={(e) => setFiltroMaterialMovimientoId(e.target.value)}
                className={claseCampo}
              >
                <option value="">Todos</option>
                {materialesInventario.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Filtro</p>
            <p className="mt-2 text-base font-bold text-slate-900">{filtroMaterialMovimientoId ? 'Especifico' : 'Todos'}</p>
            <p className="mt-1 text-xs text-slate-500">alcance del historial visible</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Soporte</p>
            <p className="mt-2 text-base font-bold text-slate-900">{movimientosSoportados ? 'Disponible' : 'Pendiente'}</p>
            <p className="mt-1 text-xs text-slate-500">estado del registro de movimientos</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Resultados</p>
            <p className="mt-2 text-base font-bold text-slate-900">{movimientosInventario.length}</p>
            <p className="mt-1 text-xs text-slate-500">movimientos mostrados</p>
          </div>
        </div>

        {!movimientosSoportados && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            El historial requiere la migracion de base de datos 14_inventario_movimientos_regularizacion.sql.
          </p>
        )}

        {cargandoMovimientos && <p className="text-sm text-slate-600">Cargando movimientos...</p>}

        {!cargandoMovimientos && movimientosSoportados && movimientosInventario.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            No hay movimientos registrados para el filtro seleccionado.
          </p>
        )}

        {!cargandoMovimientos && movimientosSoportados && movimientosInventario.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50 text-slate-700">
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
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatearFechaHora(movimiento.creado_en)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-700">{materialNombre}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-1 font-semibold ${claseTipoMovimiento(movimiento.tipo_movimiento)}`}>
                          {etiquetaTipoMovimiento(movimiento.tipo_movimiento)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700">{cantidadTexto}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                        {movimiento.stock_anterior} {'->'} {movimiento.stock_nuevo}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{movimiento.motivo || 'Sin motivo'}</td>
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
