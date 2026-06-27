import { useEffect, useMemo, useState } from 'react';
import { CircleCheckBig, Package, ShieldAlert, TriangleAlert, Users } from 'lucide-react';
import {
  actualizarCliente,
  crearCliente,
  eliminarCliente,
  listarClientes,
} from '../services/clientesService';
import {
  actualizarEquipo,
  crearEquipo,
  eliminarEquipo,
  listarEquipos,
} from '../services/equiposService';
import { tieneConfiguracionSupabase } from '../services/supabaseClient';

const FORM_CLIENTE_INICIAL = {
  nombre: '',
  direccion: '',
  telefono: '',
  email: '',
  lat: '',
  lng: '',
};

const FORM_EQUIPO_INICIAL = {
  cliente_id: '',
  nombre: '',
  marca: '',
  modelo: '',
  numero_serie: '',
  ultima_revision: '',
};

const OPCIONES_ITEMS_PAGINA = [5, 10, 20];
const claseTarjeta = 'rounded-3xl border border-marca-100 bg-white p-4 shadow-tarjeta';
const claseCampo = 'w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-marca-600 focus:outline-none focus:ring-4 focus:ring-marca-100';
const claseEtiqueta = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600';
const claseBotonPrimario = 'rounded-2xl bg-cotepa-rojo-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-red-200 transition hover:bg-cotepa-rojo-600 focus:outline-none focus:ring-4 focus:ring-red-100';
const claseBotonSecundario = 'rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-200 focus:outline-none focus:ring-4 focus:ring-slate-200';
const claseBotonAccion = 'rounded-xl bg-marca-50 px-3 py-2 text-xs font-bold text-marca-700 transition hover:bg-marca-100 focus:outline-none focus:ring-4 focus:ring-marca-100';
const claseBotonPeligro = 'rounded-xl bg-rose-100 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-200 focus:outline-none focus:ring-4 focus:ring-rose-100';

export function ClientesView({ rolUsuario }) {
  const [tabActiva, setTabActiva] = useState('clientes');
  const [clientes, setClientes] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const [clienteForm, setClienteForm] = useState(FORM_CLIENTE_INICIAL);
  const [clienteEditandoId, setClienteEditandoId] = useState('');

  const [equipoForm, setEquipoForm] = useState(FORM_EQUIPO_INICIAL);
  const [equipoEditandoId, setEquipoEditandoId] = useState('');
  const [busquedaEquipo, setBusquedaEquipo] = useState('');

  const [paginaClientes, setPaginaClientes] = useState(1);
  const [paginaEquipos, setPaginaEquipos] = useState(1);
  const [itemsPaginaClientes, setItemsPaginaClientes] = useState(5);
  const [itemsPaginaEquipos, setItemsPaginaEquipos] = useState(5);

  const sinConfiguracion = useMemo(() => !tieneConfiguracionSupabase(), []);
  const puedeEditarCatalogos = rolUsuario === 'admin' || rolUsuario === 'oficina';
  const modoSoloLectura = !puedeEditarCatalogos;
  const clientesConGps = clientes.filter((cliente) => cliente.lat != null && cliente.lng != null).length;
  const equiposConRevision = equipos.filter((equipo) => Boolean(equipo.ultima_revision)).length;

  const equiposFiltrados = useMemo(() => {
    const termino = busquedaEquipo.trim().toLowerCase();

    if (!termino) {
      return equipos;
    }

    return equipos.filter((equipo) => {
      const cliente = (equipo.clientes && equipo.clientes.nombre ? equipo.clientes.nombre : '').toLowerCase();
      const nombre = (equipo.nombre || '').toLowerCase();
      const marca = (equipo.marca || '').toLowerCase();
      const modelo = (equipo.modelo || '').toLowerCase();
      const serie = (equipo.numero_serie || '').toLowerCase();

      return (
        cliente.includes(termino) ||
        nombre.includes(termino) ||
        marca.includes(termino) ||
        modelo.includes(termino) ||
        serie.includes(termino)
      );
    });
  }, [equipos, busquedaEquipo]);

  const totalPaginasClientes = Math.max(1, Math.ceil(clientes.length / itemsPaginaClientes));
  const clientesPaginados = useMemo(() => {
    const inicio = (paginaClientes - 1) * itemsPaginaClientes;
    return clientes.slice(inicio, inicio + itemsPaginaClientes);
  }, [clientes, paginaClientes, itemsPaginaClientes]);

  const totalPaginasEquipos = Math.max(1, Math.ceil(equiposFiltrados.length / itemsPaginaEquipos));
  const equiposPaginados = useMemo(() => {
    const inicio = (paginaEquipos - 1) * itemsPaginaEquipos;
    return equiposFiltrados.slice(inicio, inicio + itemsPaginaEquipos);
  }, [equiposFiltrados, paginaEquipos, itemsPaginaEquipos]);
  const resumenCatalogos = [
    { etiqueta: 'Clientes', valor: clientes.length, detalle: 'fichas activas' },
    { etiqueta: 'Equipos', valor: equipos.length, detalle: 'referencias registradas' },
    { etiqueta: 'GPS', valor: clientesConGps, detalle: 'clientes con coordenadas' },
    { etiqueta: 'Revision', valor: equiposConRevision, detalle: 'equipos con fecha de control' },
  ];

  useEffect(() => {
    if (paginaClientes > totalPaginasClientes) {
      setPaginaClientes(totalPaginasClientes);
    }
  }, [paginaClientes, totalPaginasClientes]);

  useEffect(() => {
    if (paginaEquipos > totalPaginasEquipos) {
      setPaginaEquipos(totalPaginasEquipos);
    }
  }, [paginaEquipos, totalPaginasEquipos]);

  useEffect(() => {
    setPaginaClientes(1);
    setPaginaEquipos(1);
  }, [tabActiva]);

  useEffect(() => {
    setPaginaEquipos(1);
  }, [busquedaEquipo]);

  async function recargarDatos() {
    if (sinConfiguracion) {
      setCargando(false);
      return;
    }

    setCargando(true);
    setError('');

    try {
      const [datosClientes, datosEquipos] = await Promise.all([
        listarClientes(),
        listarEquipos(),
      ]);
      setClientes(datosClientes);
      setEquipos(datosEquipos);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar clientes y equipos.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    recargarDatos();
  }, []);

  function limpiarFormCliente() {
    setClienteForm(FORM_CLIENTE_INICIAL);
    setClienteEditandoId('');
  }

  function limpiarFormEquipo() {
    setEquipoForm(FORM_EQUIPO_INICIAL);
    setEquipoEditandoId('');
  }

  async function guardarCliente(evento) {
    evento.preventDefault();
    setMensaje('');
    setError('');

    try {
      const latNum = clienteForm.lat !== '' && clienteForm.lat !== null && clienteForm.lat !== undefined
        ? Number.parseFloat(String(clienteForm.lat).replace(',', '.'))
        : null;
      const lngNum = clienteForm.lng !== '' && clienteForm.lng !== null && clienteForm.lng !== undefined
        ? Number.parseFloat(String(clienteForm.lng).replace(',', '.'))
        : null;
      const payload = {
        nombre: clienteForm.nombre,
        direccion: clienteForm.direccion || null,
        telefono: clienteForm.telefono || null,
        email: clienteForm.email || null,
        lat: Number.isFinite(latNum) ? latNum : null,
        lng: Number.isFinite(lngNum) ? lngNum : null,
      };
      if (clienteEditandoId) {
        await actualizarCliente(clienteEditandoId, payload);
        setMensaje('Cliente actualizado correctamente.');
      } else {
        await crearCliente(payload);
        setMensaje('Cliente creado correctamente.');
      }
      limpiarFormCliente();
      await recargarDatos();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el cliente.');
    }
  }

  async function borrarCliente(idCliente) {
    setMensaje('');
    setError('');

    try {
      await eliminarCliente(idCliente);
      setMensaje('Cliente eliminado correctamente.');
      if (clienteEditandoId === idCliente) {
        limpiarFormCliente();
      }
      await recargarDatos();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el cliente.');
    }
  }

  async function guardarEquipo(evento) {
    evento.preventDefault();
    setMensaje('');
    setError('');

    try {
      const payload = {
        cliente_id: equipoForm.cliente_id,
        nombre: equipoForm.nombre,
        marca: equipoForm.marca || null,
        modelo: equipoForm.modelo || null,
        numero_serie: equipoForm.numero_serie || null,
        ultima_revision: equipoForm.ultima_revision || null,
      };

      if (equipoEditandoId) {
        await actualizarEquipo(equipoEditandoId, payload);
        setMensaje('Equipo actualizado correctamente.');
      } else {
        await crearEquipo(payload);
        setMensaje('Equipo creado correctamente.');
      }

      limpiarFormEquipo();
      await recargarDatos();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el equipo.');
    }
  }

  async function borrarEquipo(idEquipo) {
    setMensaje('');
    setError('');

    try {
      await eliminarEquipo(idEquipo);
      setMensaje('Equipo eliminado correctamente.');
      if (equipoEditandoId === idEquipo) {
        limpiarFormEquipo();
      }
      await recargarDatos();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el equipo.');
    }
  }

  if (sinConfiguracion) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
        Configura Supabase en `app-config.js` o con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para habilitar el CRUD de clientes y equipos.
      </section>
    );
  }

  return (
    <section className="space-y-4 pb-20 lg:pb-0">
      <header className="rounded-3xl border border-marca-700/40 bg-marca-900 p-5 text-white shadow-xl lg:p-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-100">
          <Users className="h-3.5 w-3.5" />
          Catálogos
        </div>
        <h2 className="mt-4 text-xl font-bold">Catálogos SAT</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
          Gestión centralizada de clientes y equipos con acceso rápido a los datos base del servicio técnico.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {resumenCatalogos.map((item) => (
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
          Vista activa en modo {modoSoloLectura ? 'consulta' : 'edición'} con acceso rápido a clientes y equipos del catálogo SAT.
        </div>
      </header>

      {modoSoloLectura && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p>
            Tu rol técnico solo tiene acceso de consulta a catálogos. La edición está reservada a administración/oficina.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 rounded-3xl border border-marca-100 bg-marca-50 p-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => setTabActiva('clientes')}
          className={`inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-bold transition focus:outline-none focus:ring-4 focus:ring-marca-100 ${
            tabActiva === 'clientes' ? 'bg-cotepa-rojo-500 text-white shadow shadow-red-200' : 'text-marca-700'
          }`}
        >
          <Users className="h-4 w-4" />
          Clientes
        </button>
        <button
          type="button"
          onClick={() => setTabActiva('equipos')}
          className={`inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-bold transition focus:outline-none focus:ring-4 focus:ring-marca-100 ${
            tabActiva === 'equipos' ? 'bg-cotepa-rojo-500 text-white shadow shadow-red-200' : 'text-marca-700'
          }`}
        >
          <Package className="h-4 w-4" />
          Equipos
        </button>
      </div>

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

      {tabActiva === 'clientes' && (
        <div className="lg:grid lg:grid-cols-12 lg:gap-4">
          {puedeEditarCatalogos && (
            <form onSubmit={guardarCliente} className={`space-y-4 ${claseTarjeta} lg:col-span-4 lg:sticky lg:top-5 lg:self-start`}>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-marca-100 bg-marca-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-marca-700">
                  <Users className="h-3.5 w-3.5" />
                  Ficha cliente
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    {clienteEditandoId ? 'Editar cliente' : 'Nuevo cliente'}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Mantén actualizados los datos de contacto y la ubicación base para agilizar navegación y servicio.
                  </p>
                </div>
              </div>

              <label className="block">
                <span className={claseEtiqueta}>Nombre del cliente</span>
                <input
                  required
                  value={clienteForm.nombre}
                  onChange={(e) => setClienteForm((p) => ({ ...p, nombre: e.target.value }))}
                  className={claseCampo}
                  placeholder="Nombre del cliente"
                />
              </label>
              <label className="block">
                <span className={claseEtiqueta}>Dirección</span>
                <input
                  value={clienteForm.direccion}
                  onChange={(e) => setClienteForm((p) => ({ ...p, direccion: e.target.value }))}
                  className={claseCampo}
                  placeholder="Dirección"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={claseEtiqueta}>Teléfono</span>
                  <input
                    value={clienteForm.telefono}
                    onChange={(e) => setClienteForm((p) => ({ ...p, telefono: e.target.value }))}
                    className={claseCampo}
                    placeholder="Teléfono"
                  />
                </label>
                <label className="block">
                  <span className={claseEtiqueta}>Email</span>
                  <input
                    type="email"
                    value={clienteForm.email}
                    onChange={(e) => setClienteForm((p) => ({ ...p, email: e.target.value }))}
                    className={claseCampo}
                    placeholder="Email"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={claseEtiqueta}>Latitud</span>
                  <input
                    inputMode="decimal"
                    value={clienteForm.lat}
                    onChange={(e) => setClienteForm((p) => ({ ...p, lat: e.target.value }))}
                    className={claseCampo}
                    placeholder="Latitud"
                  />
                </label>
                <label className="block">
                  <span className={claseEtiqueta}>Longitud</span>
                  <input
                    inputMode="decimal"
                    value={clienteForm.lng}
                    onChange={(e) => setClienteForm((p) => ({ ...p, lng: e.target.value }))}
                    className={claseCampo}
                    placeholder="Longitud"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button className={claseBotonPrimario} type="submit">
                  {clienteEditandoId ? 'Actualizar' : 'Crear'}
                </button>
                <button
                  className={claseBotonSecundario}
                  type="button"
                  onClick={limpiarFormCliente}
                >
                  Limpiar
                </button>
              </div>
            </form>
          )}

          <div className={`space-y-3 ${puedeEditarCatalogos ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
            {cargando && <p className="text-sm font-semibold text-slate-600">Cargando clientes...</p>}
            {!cargando && clientes.length > 0 && (
              <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs font-semibold text-slate-700 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span>Página {paginaClientes} de {totalPaginasClientes}</span>
                  <label className="flex items-center gap-1">
                    <span>Mostrar</span>
                    <select
                      value={itemsPaginaClientes}
                      onChange={(e) => {
                        setItemsPaginaClientes(Number(e.target.value));
                        setPaginaClientes(1);
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
                    onClick={() => setPaginaClientes((previo) => Math.max(1, previo - 1))}
                    disabled={paginaClientes === 1}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 transition focus:outline-none focus:ring-2 focus:ring-marca-100 disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaginaClientes((previo) => Math.min(totalPaginasClientes, previo + 1))}
                    disabled={paginaClientes === totalPaginasClientes}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 transition focus:outline-none focus:ring-2 focus:ring-marca-100 disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
            {!cargando && clientes.length > 0 && (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Visibles</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">{clientesPaginados.length}</p>
                  <p className="mt-1 text-xs text-slate-500">clientes en la página actual</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Geolocalizados</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">{clientesConGps}</p>
                  <p className="mt-1 text-xs text-slate-500">clientes con coordenadas útiles</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Modo</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">{modoSoloLectura ? 'Consulta' : 'Edición'}</p>
                  <p className="mt-1 text-xs text-slate-500">permiso del usuario actual</p>
                </div>
              </div>
            )}

            {!cargando &&
              clientesPaginados.map((cliente) => (
                <article key={cliente.id} className={`${claseTarjeta} transition hover:border-marca-200 hover:shadow-md`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{cliente.nombre}</p>
                      <p className="mt-1 text-xs text-slate-600">{cliente.telefono || 'Sin teléfono'} · {cliente.email || 'Sin email'}</p>
                    </div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${
                      cliente.lat != null && cliente.lng != null ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {cliente.lat != null && cliente.lng != null ? 'GPS listo' : 'Sin GPS'}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{cliente.direccion || 'Sin dirección'}</p>
                  {(cliente.lat != null && cliente.lng != null) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <p className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        GPS: {Number(cliente.lat).toFixed(5)}, {Number(cliente.lng).toFixed(5)}
                      </p>
                    </div>
                  )}

                  {puedeEditarCatalogos && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className={claseBotonAccion}
                        onClick={() => {
                          setClienteEditandoId(cliente.id);
                          setClienteForm({
                            nombre: cliente.nombre || '',
                            direccion: cliente.direccion || '',
                            telefono: cliente.telefono || '',
                            email: cliente.email || '',
                            lat: cliente.lat != null ? String(cliente.lat) : '',
                            lng: cliente.lng != null ? String(cliente.lng) : '',
                          });
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className={claseBotonPeligro}
                        onClick={() => borrarCliente(cliente.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </article>
              ))}

            {!cargando && clientes.length === 0 && (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                No hay clientes registrados todavía. Puedes crear el primero desde el panel lateral.
              </div>
            )}
          </div>
        </div>
      )}

      {tabActiva === 'equipos' && (
        <div className="lg:grid lg:grid-cols-12 lg:gap-4">
          {puedeEditarCatalogos && (
            <form onSubmit={guardarEquipo} className={`space-y-4 ${claseTarjeta} lg:col-span-4 lg:sticky lg:top-5 lg:self-start`}>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-marca-100 bg-marca-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-marca-700">
                  <Package className="h-3.5 w-3.5" />
                  Ficha equipo
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    {equipoEditandoId ? 'Editar equipo' : 'Nuevo equipo'}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Asocia cada equipo a su cliente y mantén identificadores técnicos accesibles para soporte y revisiones.
                  </p>
                </div>
              </div>

              <label className="block">
                <span className={claseEtiqueta}>Cliente</span>
                <select
                  required
                  value={equipoForm.cliente_id}
                  onChange={(e) => setEquipoForm((p) => ({ ...p, cliente_id: e.target.value }))}
                  className={claseCampo}
                >
                  <option value="">Selecciona cliente</option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <input
                required
                value={equipoForm.nombre}
                onChange={(e) => setEquipoForm((p) => ({ ...p, nombre: e.target.value }))}
                className={claseCampo}
                placeholder="Nombre del equipo"
              />
              <input
                value={equipoForm.marca}
                onChange={(e) => setEquipoForm((p) => ({ ...p, marca: e.target.value }))}
                className={claseCampo}
                placeholder="Marca"
              />
              <input
                value={equipoForm.modelo}
                onChange={(e) => setEquipoForm((p) => ({ ...p, modelo: e.target.value }))}
                className={claseCampo}
                placeholder="Modelo"
              />
              <input
                value={equipoForm.numero_serie}
                onChange={(e) => setEquipoForm((p) => ({ ...p, numero_serie: e.target.value }))}
                className={claseCampo}
                placeholder="Número de serie"
              />
              <label className="block">
                <span className={claseEtiqueta}>Última revisión</span>
                <input
                  type="date"
                  value={equipoForm.ultima_revision}
                  onChange={(e) => setEquipoForm((p) => ({ ...p, ultima_revision: e.target.value }))}
                  className={claseCampo}
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button className={claseBotonPrimario} type="submit">
                  {equipoEditandoId ? 'Actualizar' : 'Crear'}
                </button>
                <button
                  className={claseBotonSecundario}
                  type="button"
                  onClick={limpiarFormEquipo}
                >
                  Limpiar
                </button>
              </div>
            </form>
          )}

          <div className={`space-y-3 ${puedeEditarCatalogos ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Búsqueda de equipos</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Filtra por cliente, nombre, marca, modelo o número de serie para localizar equipos con rapidez.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-right shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Resultados</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{equiposFiltrados.length}</p>
                </div>
              </div>
              <label className="mt-4 block">
                <span className={claseEtiqueta}>Buscar equipo</span>
                <input
                  value={busquedaEquipo}
                  onChange={(e) => setBusquedaEquipo(e.target.value)}
                  className={claseCampo}
                  placeholder="Buscar por cliente, nombre, marca, modelo o serie"
                />
              </label>
            </div>
            {cargando && <p className="text-sm font-semibold text-slate-600">Cargando equipos...</p>}
            {!cargando && equiposFiltrados.length > 0 && (
              <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs font-semibold text-slate-700 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span>Página {paginaEquipos} de {totalPaginasEquipos}</span>
                  <label className="flex items-center gap-1">
                    <span>Mostrar</span>
                    <select
                      value={itemsPaginaEquipos}
                      onChange={(e) => {
                        setItemsPaginaEquipos(Number(e.target.value));
                        setPaginaEquipos(1);
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
                    onClick={() => setPaginaEquipos((previo) => Math.max(1, previo - 1))}
                    disabled={paginaEquipos === 1}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 transition focus:outline-none focus:ring-2 focus:ring-marca-100 disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaginaEquipos((previo) => Math.min(totalPaginasEquipos, previo + 1))}
                    disabled={paginaEquipos === totalPaginasEquipos}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 transition focus:outline-none focus:ring-2 focus:ring-marca-100 disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
            {!cargando && equiposFiltrados.length > 0 && (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Visibles</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">{equiposPaginados.length}</p>
                  <p className="mt-1 text-xs text-slate-500">equipos en la página actual</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Revisados</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">{equiposConRevision}</p>
                  <p className="mt-1 text-xs text-slate-500">equipos con fecha de revisión</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Filtro</p>
                  <p className="mt-2 text-xl font-bold text-slate-900">{busquedaEquipo.trim() ? 'Activo' : 'Global'}</p>
                  <p className="mt-1 text-xs text-slate-500">{busquedaEquipo.trim() || 'sin término aplicado'}</p>
                </div>
              </div>
            )}

            {!cargando &&
              equiposPaginados.map((equipo) => (
                <article key={equipo.id} className={`${claseTarjeta} transition hover:border-marca-200 hover:shadow-md`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{equipo.nombre}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {(equipo.clientes && equipo.clientes.nombre) || 'Cliente no disponible'}
                      </p>
                    </div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${
                      equipo.ultima_revision ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {equipo.ultima_revision ? 'Revisado' : 'Pendiente'}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {equipo.marca || 'Sin marca'} · {equipo.modelo || 'Sin modelo'} · {equipo.numero_serie || 'Sin serie'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <p className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      Última revisión: {equipo.ultima_revision || 'No registrada'}
                    </p>
                  </div>

                  {puedeEditarCatalogos && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                      className={claseBotonAccion}
                        onClick={() => {
                          setEquipoEditandoId(equipo.id);
                          setEquipoForm({
                            cliente_id: equipo.cliente_id || '',
                            nombre: equipo.nombre || '',
                            marca: equipo.marca || '',
                            modelo: equipo.modelo || '',
                            numero_serie: equipo.numero_serie || '',
                            ultima_revision: equipo.ultima_revision || '',
                          });
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                      className={claseBotonPeligro}
                        onClick={() => borrarEquipo(equipo.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </article>
              ))}

            {!cargando && busquedaEquipo.trim() && equiposFiltrados.length === 0 && (
              <p className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                No hay equipos que coincidan con la búsqueda.
              </p>
            )}

            {!cargando && !busquedaEquipo.trim() && equipos.length === 0 && (
              <p className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                No hay equipos registrados todavía. Puedes crear el primero desde el panel lateral.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
