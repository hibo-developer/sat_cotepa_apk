import { useEffect, useMemo, useState } from 'react';
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
      <header className="rounded-2xl bg-marca-900 p-4 text-white shadow-lg lg:p-5">
        <h2 className="text-lg font-bold">Catálogos SAT</h2>
        <p className="mt-1 text-sm text-slate-200">Gestión de clientes y equipos.</p>
      </header>

      {modoSoloLectura && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Tu rol técnico solo tiene acceso de consulta a catálogos. La edición está reservada a administración/oficina.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-marca-100 bg-marca-50 p-1">
        <button
          type="button"
          onClick={() => setTabActiva('clientes')}
          className={`rounded-xl px-3 py-3 text-sm font-bold ${
            tabActiva === 'clientes' ? 'bg-cotepa-rojo-500 text-white shadow' : 'text-marca-700'
          }`}
        >
          Clientes
        </button>
        <button
          type="button"
          onClick={() => setTabActiva('equipos')}
          className={`rounded-xl px-3 py-3 text-sm font-bold ${
            tabActiva === 'equipos' ? 'bg-cotepa-rojo-500 text-white shadow' : 'text-marca-700'
          }`}
        >
          Equipos
        </button>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {mensaje && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {mensaje}
        </p>
      )}

      {tabActiva === 'clientes' && (
        <div className="lg:grid lg:grid-cols-12 lg:gap-4">
          {puedeEditarCatalogos && (
            <form onSubmit={guardarCliente} className="space-y-3 rounded-2xl border border-marca-100 bg-white p-4 shadow-tarjeta lg:col-span-4 lg:sticky lg:top-5 lg:self-start">
              <h3 className="text-base font-bold text-sat-text">
                {clienteEditandoId ? 'Editar cliente' : 'Nuevo cliente'}
              </h3>

              <input
                required
                value={clienteForm.nombre}
                onChange={(e) => setClienteForm((p) => ({ ...p, nombre: e.target.value }))}
                className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
                placeholder="Nombre del cliente"
              />
              <input
                value={clienteForm.direccion}
                onChange={(e) => setClienteForm((p) => ({ ...p, direccion: e.target.value }))}
                className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
                placeholder="Dirección"
              />
              <input
                value={clienteForm.telefono}
                onChange={(e) => setClienteForm((p) => ({ ...p, telefono: e.target.value }))}
                className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
                placeholder="Teléfono"
              />
              <input
                type="email"
                value={clienteForm.email}
                onChange={(e) => setClienteForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
                placeholder="Email"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  inputMode="decimal"
                  value={clienteForm.lat}
                  onChange={(e) => setClienteForm((p) => ({ ...p, lat: e.target.value }))}
                  className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
                  placeholder="Latitud"
                />
                <input
                  inputMode="decimal"
                  value={clienteForm.lng}
                  onChange={(e) => setClienteForm((p) => ({ ...p, lng: e.target.value }))}
                  className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
                  placeholder="Longitud"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button className="rounded-xl bg-cotepa-rojo-500 px-4 py-3 text-sm font-bold text-white" type="submit">
                  {clienteEditandoId ? 'Actualizar' : 'Crear'}
                </button>
                <button
                  className="rounded-xl bg-slate-200 px-4 py-3 text-sm font-bold text-sat-muted"
                  type="button"
                  onClick={limpiarFormCliente}
                >
                  Limpiar
                </button>
              </div>
            </form>
          )}

          <div className={`space-y-2 ${puedeEditarCatalogos ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
            {cargando && <p className="text-sm font-semibold text-sat-muted">Cargando clientes...</p>}
            {!cargando && clientes.length > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-sat-border-soft bg-sat-surface px-3 py-2 text-xs font-semibold text-sat-muted">
                <div className="flex items-center gap-3">
                  <span>Pagina {paginaClientes} de {totalPaginasClientes}</span>
                  <label className="flex items-center gap-1">
                    <span>Mostrar</span>
                    <select
                      value={itemsPaginaClientes}
                      onChange={(e) => {
                        setItemsPaginaClientes(Number(e.target.value));
                        setPaginaClientes(1);
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
                    onClick={() => setPaginaClientes((previo) => Math.max(1, previo - 1))}
                    disabled={paginaClientes === 1}
                    className="rounded-lg border border-sat-border bg-white px-3 py-1.5 disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaginaClientes((previo) => Math.min(totalPaginasClientes, previo + 1))}
                    disabled={paginaClientes === totalPaginasClientes}
                    className="rounded-lg border border-sat-border bg-white px-3 py-1.5 disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}

            {!cargando &&
              clientesPaginados.map((cliente) => (
                <article key={cliente.id} className="rounded-2xl border border-marca-100 bg-white p-4 shadow-tarjeta">
                  <p className="text-sm font-bold text-sat-text">{cliente.nombre}</p>
                  <p className="text-xs text-sat-muted">{cliente.telefono || 'Sin teléfono'} · {cliente.email || 'Sin email'}</p>
                  <p className="mt-1 text-xs text-sat-subtle">{cliente.direccion || 'Sin dirección'}</p>
                  {(cliente.lat != null && cliente.lng != null) && (
                    <p className="mt-1 text-xs text-sat-subtle">GPS: {Number(cliente.lat).toFixed(5)}, {Number(cliente.lng).toFixed(5)}</p>
                  )}

                  {puedeEditarCatalogos && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className="rounded-xl bg-marca-50 px-3 py-2 text-xs font-bold text-marca-700"
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
                        className="rounded-xl bg-rose-100 px-3 py-2 text-xs font-bold text-rose-700"
                        onClick={() => borrarCliente(cliente.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </article>
              ))}
          </div>
        </div>
      )}

      {tabActiva === 'equipos' && (
        <div className="lg:grid lg:grid-cols-12 lg:gap-4">
          {puedeEditarCatalogos && (
            <form onSubmit={guardarEquipo} className="space-y-3 rounded-2xl border border-marca-100 bg-white p-4 shadow-tarjeta lg:col-span-4 lg:sticky lg:top-5 lg:self-start">
              <h3 className="text-base font-bold text-sat-text">
                {equipoEditandoId ? 'Editar equipo' : 'Nuevo equipo'}
              </h3>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-sat-muted">Cliente *</span>
                <select
                  required
                  value={equipoForm.cliente_id}
                  onChange={(e) => setEquipoForm((p) => ({ ...p, cliente_id: e.target.value }))}
                  className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
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
                className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
                placeholder="Nombre del equipo"
              />
              <input
                value={equipoForm.marca}
                onChange={(e) => setEquipoForm((p) => ({ ...p, marca: e.target.value }))}
                className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
                placeholder="Marca"
              />
              <input
                value={equipoForm.modelo}
                onChange={(e) => setEquipoForm((p) => ({ ...p, modelo: e.target.value }))}
                className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
                placeholder="Modelo"
              />
              <input
                value={equipoForm.numero_serie}
                onChange={(e) => setEquipoForm((p) => ({ ...p, numero_serie: e.target.value }))}
                className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
                placeholder="Número de serie"
              />
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-sat-muted">Última revisión</span>
                <input
                  type="date"
                  value={equipoForm.ultima_revision}
                  onChange={(e) => setEquipoForm((p) => ({ ...p, ultima_revision: e.target.value }))}
                  className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button className="rounded-xl bg-cotepa-rojo-500 px-4 py-3 text-sm font-bold text-white" type="submit">
                  {equipoEditandoId ? 'Actualizar' : 'Crear'}
                </button>
                <button
                  className="rounded-xl bg-slate-200 px-4 py-3 text-sm font-bold text-sat-muted"
                  type="button"
                  onClick={limpiarFormEquipo}
                >
                  Limpiar
                </button>
              </div>
            </form>
          )}

          <div className={`space-y-2 ${puedeEditarCatalogos ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
            <input
              value={busquedaEquipo}
              onChange={(e) => setBusquedaEquipo(e.target.value)}
              className="w-full rounded-xl border border-sat-border bg-white px-4 py-3 text-sm"
              placeholder="Buscar por cliente, nombre, marca, modelo o serie"
            />
            {cargando && <p className="text-sm font-semibold text-sat-muted">Cargando equipos...</p>}
            {!cargando && equiposFiltrados.length > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-sat-border-soft bg-sat-surface px-3 py-2 text-xs font-semibold text-sat-muted">
                <div className="flex items-center gap-3">
                  <span>Pagina {paginaEquipos} de {totalPaginasEquipos}</span>
                  <label className="flex items-center gap-1">
                    <span>Mostrar</span>
                    <select
                      value={itemsPaginaEquipos}
                      onChange={(e) => {
                        setItemsPaginaEquipos(Number(e.target.value));
                        setPaginaEquipos(1);
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
                    onClick={() => setPaginaEquipos((previo) => Math.max(1, previo - 1))}
                    disabled={paginaEquipos === 1}
                    className="rounded-lg border border-sat-border bg-white px-3 py-1.5 disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaginaEquipos((previo) => Math.min(totalPaginasEquipos, previo + 1))}
                    disabled={paginaEquipos === totalPaginasEquipos}
                    className="rounded-lg border border-sat-border bg-white px-3 py-1.5 disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}

            {!cargando &&
              equiposPaginados.map((equipo) => (
                <article key={equipo.id} className="rounded-2xl border border-marca-100 bg-white p-4 shadow-tarjeta">
                  <p className="text-sm font-bold text-sat-text">{equipo.nombre}</p>
                  <p className="text-xs text-sat-muted">
                    {(equipo.clientes && equipo.clientes.nombre) || 'Cliente no disponible'}
                  </p>
                  <p className="mt-1 text-xs text-sat-subtle">
                    {equipo.marca || 'Sin marca'} · {equipo.modelo || 'Sin modelo'} · {equipo.numero_serie || 'Sin serie'}
                  </p>
                  <p className="mt-1 text-xs text-sat-subtle">
                    Última revisión: {equipo.ultima_revision || 'No registrada'}
                  </p>

                  {puedeEditarCatalogos && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className="rounded-xl bg-marca-50 px-3 py-2 text-xs font-bold text-marca-700"
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
                        className="rounded-xl bg-rose-100 px-3 py-2 text-xs font-bold text-rose-700"
                        onClick={() => borrarEquipo(equipo.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </article>
              ))}

            {!cargando && busquedaEquipo.trim() && equiposFiltrados.length === 0 && (
              <p className="rounded-xl border border-dashed border-sat-border bg-sat-surface p-3 text-sm text-sat-muted">
                No hay equipos que coincidan con la búsqueda.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
