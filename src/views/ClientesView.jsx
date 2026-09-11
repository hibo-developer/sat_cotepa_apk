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
  telefono_2: '',
  contacto: '',
  cargo: '',
  email: '',
  lat: '',
  lng: '',
  identificador_fiscal: '',
  razon_social: '',
  direccion_fiscal: '',
  regimen_tributario: '',
  situacion_fiscal: '',
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
  const [busquedaCliente, setBusquedaCliente] = useState('');

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

  const clientesFiltrados = useMemo(() => {
    const termino = busquedaCliente.trim().toLowerCase();

    if (!termino) {
      return clientes;
    }

    return clientes.filter((cliente) => {
      const nom = (cliente.nombre || '').toLowerCase();
      const rs = (cliente.razon_social || '').toLowerCase();
      const idf = (cliente.identificador_fiscal || '').toLowerCase();
      const dir = (cliente.direccion || '').toLowerCase();
      const dirFisc = (cliente.direccion_fiscal || '').toLowerCase();
      const tel = (cliente.telefono || '').toLowerCase();
      const tel2 = (cliente.telefono_2 || '').toLowerCase();
      const cnt = (cliente.contacto || '').toLowerCase();
      const crg = (cliente.cargo || '').toLowerCase();
      const em = (cliente.email || '').toLowerCase();
      const reg = (cliente.regimen_tributario || '').toLowerCase();
      const sit = (cliente.situacion_fiscal || '').toLowerCase();

      return (
        nom.includes(termino) ||
        rs.includes(termino) ||
        idf.includes(termino) ||
        dir.includes(termino) ||
        dirFisc.includes(termino) ||
        tel.includes(termino) ||
        tel2.includes(termino) ||
        cnt.includes(termino) ||
        crg.includes(termino) ||
        em.includes(termino) ||
        reg.includes(termino) ||
        sit.includes(termino)
      );
    });
  }, [clientes, busquedaCliente]);

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

  const totalPaginasClientes = Math.max(1, Math.ceil(clientesFiltrados.length / itemsPaginaClientes));
  const clientesPaginados = useMemo(() => {
    const inicio = (paginaClientes - 1) * itemsPaginaClientes;
    return clientesFiltrados.slice(inicio, inicio + itemsPaginaClientes);
  }, [clientesFiltrados, paginaClientes, itemsPaginaClientes]);

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
    setPaginaClientes(1);
  }, [busquedaCliente]);

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
      const payload = {
        nombre: clienteForm.nombre,
        direccion: clienteForm.direccion,
        telefono: clienteForm.telefono,
        telefono_2: clienteForm.telefono_2,
        contacto: clienteForm.contacto,
        cargo: clienteForm.cargo,
        email: clienteForm.email,
        lat: clienteForm.lat,
        lng: clienteForm.lng,
        identificador_fiscal: clienteForm.identificador_fiscal,
        razon_social: clienteForm.razon_social,
        direccion_fiscal: clienteForm.direccion_fiscal,
        regimen_tributario: clienteForm.regimen_tributario,
        situacion_fiscal: clienteForm.situacion_fiscal,
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
      <header className="section-hero p-5 lg:p-6">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/70">Catálogos operativos</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Clientes y equipos</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
            Vista unificada de clientes y maquinaria para trabajar con mejor legibilidad, jerarquía y consulta rápida.
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="metric-card bg-white/10 text-white">
            <p className="metric-label text-white/65">Clientes</p>
            <p className="mt-2 text-2xl font-black text-white">{clientes.length}</p>
          </div>
          <div className="metric-card bg-white/10 text-white">
            <p className="metric-label text-white/65">Equipos</p>
            <p className="mt-2 text-2xl font-black text-white">{equipos.length}</p>
          </div>
          <div className="metric-card bg-white/10 text-white">
            <p className="metric-label text-white/65">Modo</p>
            <p className="mt-2 text-sm font-bold text-white">{modoSoloLectura ? 'Consulta' : 'Edición activa'}</p>
          </div>
        </div>
      </header>

      {modoSoloLectura && (
        <p className="status-banner-warning">
          Tu rol técnico solo tiene acceso de consulta a catálogos. La edición está reservada a administración/oficina.
        </p>
      )}

      <div className="segmented-control grid-cols-2">
        <button
          type="button"
          onClick={() => setTabActiva('clientes')}
          className={`segmented-item ${
            tabActiva === 'clientes' ? 'segmented-item-active' : ''
          }`}
        >
          Clientes
        </button>
        <button
          type="button"
          onClick={() => setTabActiva('equipos')}
          className={`segmented-item ${
            tabActiva === 'equipos' ? 'segmented-item-active' : ''
          }`}
        >
          Equipos
        </button>
      </div>

      {error && <p className="status-banner-error">{error}</p>}
      {mensaje && (
        <p className="status-banner-success">
          {mensaje}
        </p>
      )}

      {tabActiva === 'clientes' && (
        <div className="lg:grid lg:grid-cols-12 lg:gap-4">
          {puedeEditarCatalogos && (
            <form onSubmit={guardarCliente} className="surface-card space-y-4 p-4 lg:col-span-4 lg:sticky lg:top-5 lg:self-start">
              <div>
                <p className="metric-label">{clienteEditandoId ? 'Edición activa' : 'Alta rápida'}</p>
                <h3 className="mt-2 text-lg font-black tracking-tight text-sat-text">
                  {clienteEditandoId ? 'Editar cliente' : 'Nuevo cliente'}
                </h3>
              </div>

              {/* Seccion: Datos Operativos / Instalacion */}
              <div className="space-y-2.5 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  Ubicación e Instalación
                </p>
                <div>
                  <label className="label-base text-xs">Nombre comercial / Lugar *</label>
                  <input
                    required
                    value={clienteForm.nombre}
                    onChange={(e) => setClienteForm((p) => ({ ...p, nombre: e.target.value }))}
                    className="input-base"
                    placeholder="Ej. Taller Central / Empresa S.A."
                  />
                </div>
                <div>
                  <label className="label-base text-xs">Dirección de trabajo / instalación</label>
                  <input
                    value={clienteForm.direccion}
                    onChange={(e) => setClienteForm((p) => ({ ...p, direccion: e.target.value }))}
                    className="input-base"
                    placeholder="Ej. Av. Industrial 1234"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label-base text-xs">Teléfono 1 (Principal)</label>
                    <input
                      value={clienteForm.telefono}
                      onChange={(e) => setClienteForm((p) => ({ ...p, telefono: e.target.value }))}
                      className="input-base"
                      placeholder="Teléfono principal"
                    />
                  </div>
                  <div>
                    <label className="label-base text-xs">Teléfono 2 (Secundario)</label>
                    <input
                      value={clienteForm.telefono_2}
                      onChange={(e) => setClienteForm((p) => ({ ...p, telefono_2: e.target.value }))}
                      className="input-base"
                      placeholder="Teléfono 2"
                    />
                  </div>
                </div>
                <div>
                  <label className="label-base text-xs">Email</label>
                  <input
                    type="email"
                    value={clienteForm.email}
                    onChange={(e) => setClienteForm((p) => ({ ...p, email: e.target.value }))}
                    className="input-base"
                    placeholder="Email"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label-base text-xs">Persona de contacto</label>
                    <input
                      value={clienteForm.contacto}
                      onChange={(e) => setClienteForm((p) => ({ ...p, contacto: e.target.value }))}
                      className="input-base"
                      placeholder="Nombre de contacto"
                    />
                  </div>
                  <div>
                    <label className="label-base text-xs">Cargo / Puesto</label>
                    <input
                      value={clienteForm.cargo}
                      onChange={(e) => setClienteForm((p) => ({ ...p, cargo: e.target.value }))}
                      className="input-base"
                      placeholder="Ej. Jefe Mantenimiento"
                    />
                  </div>
                </div>
              </div>

              {/* Seccion: Datos Fiscales */}
              <div className="space-y-2.5 rounded-xl border border-sky-200/80 bg-sky-50/40 p-3">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-sky-800 flex items-center justify-between">
                  <span>Datos Fiscales</span>
                  <span className="text-[10px] font-normal normal-case text-sky-600">(Para facturación)</span>
                </p>

                <div>
                  <label className="label-base text-xs">ID Fiscal (CUIT / RFC / NIF / CIF)</label>
                  <input
                    value={clienteForm.identificador_fiscal}
                    onChange={(e) => setClienteForm((p) => ({ ...p, identificador_fiscal: e.target.value }))}
                    className="input-base bg-white"
                    placeholder="Ej. 20-12345678-9 o ABC123456T12"
                  />
                </div>

                <div>
                  <label className="label-base text-xs">Razón Social</label>
                  <input
                    value={clienteForm.razon_social}
                    onChange={(e) => setClienteForm((p) => ({ ...p, razon_social: e.target.value }))}
                    className="input-base bg-white"
                    placeholder="Ej. Comercializadora Cotepa S.R.L."
                  />
                </div>

                <div>
                  <label className="label-base text-xs">Dirección Fiscal</label>
                  <input
                    value={clienteForm.direccion_fiscal}
                    onChange={(e) => setClienteForm((p) => ({ ...p, direccion_fiscal: e.target.value }))}
                    className="input-base bg-white"
                    placeholder="Ej. Calle Fiscal 456, Piso 2"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label-base text-xs">Régimen Tributario</label>
                    <input
                      list="list-regimenes-tributarios"
                      value={clienteForm.regimen_tributario}
                      onChange={(e) => setClienteForm((p) => ({ ...p, regimen_tributario: e.target.value }))}
                      className="input-base bg-white text-xs"
                      placeholder="Ej. General"
                    />
                    <datalist id="list-regimenes-tributarios">
                      <option value="Régimen General" />
                      <option value="Monotributo / Simplificado" />
                      <option value="Exento / Sin fines de lucro" />
                      <option value="Persona Física con Actividad Empresarial" />
                    </datalist>
                  </div>

                  <div>
                    <label className="label-base text-xs">Situación Fiscal / IVA</label>
                    <input
                      list="list-situaciones-fiscales"
                      value={clienteForm.situacion_fiscal}
                      onChange={(e) => setClienteForm((p) => ({ ...p, situacion_fiscal: e.target.value }))}
                      className="input-base bg-white text-xs"
                      placeholder="Ej. Responsable Inscripto"
                    />
                    <datalist id="list-situaciones-fiscales">
                      <option value="Responsable Inscripto" />
                      <option value="Consumidor Final" />
                      <option value="Monotributista" />
                      <option value="Exento" />
                      <option value="Sujeto No Categorizado" />
                    </datalist>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button className="btn-primary w-full" type="submit">
                  {clienteEditandoId ? 'Actualizar' : 'Crear'}
                </button>
                <button
                  className="btn-secondary w-full"
                  type="button"
                  onClick={limpiarFormCliente}
                >
                  Limpiar
                </button>
              </div>
            </form>
          )}

          <div className={`space-y-3 ${puedeEditarCatalogos ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
            {/* Buscador de Clientes */}
            <div className="surface-card p-3">
              <input
                type="text"
                value={busquedaCliente}
                onChange={(e) => setBusquedaCliente(e.target.value)}
                className="input-base text-sm"
                placeholder="🔍 Buscar por nombre, razón social, CUIT/RFC/NIF, dirección o teléfono..."
              />
            </div>

            {cargando && <p className="text-sm font-semibold text-sat-muted">Cargando clientes...</p>}

            {!cargando && clientesFiltrados.length === 0 && (
              <div className="surface-card p-6 text-center text-sat-muted">
                <p className="text-sm font-medium">No se encontraron clientes con los criterios de búsqueda.</p>
              </div>
            )}

            {!cargando && clientesFiltrados.length > 0 && (
              <div className="toolbar-panel">
                <div className="flex items-center gap-3">
                  <span>Página {paginaClientes} de {totalPaginasClientes} ({clientesFiltrados.length} clientes)</span>
                  <label className="flex items-center gap-1">
                    <span>Mostrar</span>
                    <select
                      value={itemsPaginaClientes}
                      onChange={(e) => {
                        setItemsPaginaClientes(Number(e.target.value));
                        setPaginaClientes(1);
                      }}
                      className="select-base max-w-[5rem] px-2 py-1 text-xs"
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
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaginaClientes((previo) => Math.min(totalPaginasClientes, previo + 1))}
                    disabled={paginaClientes === totalPaginasClientes}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}

            {!cargando &&
              clientesPaginados.map((cliente) => (
                <article key={cliente.id} className="list-card space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="text-base font-black text-sat-text">{cliente.nombre}</h4>
                      {cliente.razon_social && cliente.razon_social !== cliente.nombre && (
                        <p className="text-xs font-semibold text-slate-600">
                          Razón Social: <span className="font-normal">{cliente.razon_social}</span>
                        </p>
                      )}
                    </div>
                    {cliente.identificador_fiscal && (
                      <span className="inline-flex items-center rounded-lg bg-sky-100 px-2.5 py-1 text-xs font-black text-sky-800 border border-sky-200">
                        ID Fiscal: {cliente.identificador_fiscal}
                      </span>
                    )}
                  </div>

                  <div className="grid gap-1 text-xs text-sat-muted sm:grid-cols-2">
                    <p>
                      <span className="font-semibold text-sat-text">Teléfono 1:</span> {cliente.telefono || 'Sin teléfono'}
                    </p>
                    <p>
                      <span className="font-semibold text-sat-text">Teléfono 2:</span> {cliente.telefono_2 || 'Sin teléfono'}
                    </p>
                    <p><span className="font-semibold text-sat-text">Email:</span> {cliente.email || 'Sin email'}</p>
                    <p><span className="font-semibold text-sat-text">Dir. Trabajo:</span> {cliente.direccion || 'Sin dirección'}</p>
                    {(cliente.contacto || cliente.cargo) && (
                      <p className="sm:col-span-2">
                        <span className="font-semibold text-sat-text">Contacto:</span> {cliente.contacto || 'Sin contacto'} {cliente.cargo ? `(${cliente.cargo})` : ''}
                      </p>
                    )}
                    {cliente.direccion_fiscal && (
                      <p className="sm:col-span-2"><span className="font-semibold text-sat-text">Dir. Fiscal:</span> {cliente.direccion_fiscal}</p>
                    )}
                  </div>

                  {(cliente.regimen_tributario || cliente.situacion_fiscal) && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {cliente.regimen_tributario && (
                        <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          Régimen: {cliente.regimen_tributario}
                        </span>
                      )}
                      {cliente.situacion_fiscal && (
                        <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                          Situación IVA/Fiscal: {cliente.situacion_fiscal}
                        </span>
                      )}
                    </div>
                  )}

                  {cliente.lat != null && cliente.lng != null && (
                    <p className="text-[11px] text-sat-subtle">
                      GPS: {Number(cliente.lat).toFixed(5)}, {Number(cliente.lng).toFixed(5)}
                    </p>
                  )}

                  {puedeEditarCatalogos && (
                    <div className="mt-3 grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        className="btn-secondary px-3 py-2 text-xs"
                        onClick={() => {
                          setClienteEditandoId(cliente.id);
                          setClienteForm({
                            nombre: cliente.nombre || '',
                            direccion: cliente.direccion || '',
                            telefono: cliente.telefono || '',
                            telefono_2: cliente.telefono_2 || '',
                            contacto: cliente.contacto || '',
                            cargo: cliente.cargo || '',
                            email: cliente.email || '',
                            lat: cliente.lat != null ? String(cliente.lat) : '',
                            lng: cliente.lng != null ? String(cliente.lng) : '',
                            identificador_fiscal: cliente.identificador_fiscal || '',
                            razon_social: cliente.razon_social || '',
                            direccion_fiscal: cliente.direccion_fiscal || '',
                            regimen_tributario: cliente.regimen_tributario || '',
                            situacion_fiscal: cliente.situacion_fiscal || '',
                          });
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-2xl bg-rose-100 px-3 py-2 text-xs font-bold text-rose-700 transition hover:-translate-y-0.5 hover:bg-rose-200"
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
            <form onSubmit={guardarEquipo} className="surface-card space-y-3 p-4 lg:col-span-4 lg:sticky lg:top-5 lg:self-start">
              <div>
                <p className="metric-label">{equipoEditandoId ? 'Edición activa' : 'Alta rápida'}</p>
                <h3 className="mt-2 text-lg font-black tracking-tight text-sat-text">
                {equipoEditandoId ? 'Editar equipo' : 'Nuevo equipo'}
                </h3>
              </div>

              <label className="block">
                <span className="label-base">Cliente *</span>
                <select
                  required
                  value={equipoForm.cliente_id}
                  onChange={(e) => setEquipoForm((p) => ({ ...p, cliente_id: e.target.value }))}
                  className="select-base"
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
                className="input-base"
                placeholder="Nombre del equipo"
              />
              <input
                value={equipoForm.marca}
                onChange={(e) => setEquipoForm((p) => ({ ...p, marca: e.target.value }))}
                className="input-base"
                placeholder="Marca"
              />
              <input
                value={equipoForm.modelo}
                onChange={(e) => setEquipoForm((p) => ({ ...p, modelo: e.target.value }))}
                className="input-base"
                placeholder="Modelo"
              />
              <input
                value={equipoForm.numero_serie}
                onChange={(e) => setEquipoForm((p) => ({ ...p, numero_serie: e.target.value }))}
                className="input-base"
                placeholder="Número de serie"
              />
              <label className="block">
                <span className="label-base">Última revisión</span>
                <input
                  type="date"
                  value={equipoForm.ultima_revision}
                  onChange={(e) => setEquipoForm((p) => ({ ...p, ultima_revision: e.target.value }))}
                  className="input-base"
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button className="btn-primary w-full" type="submit">
                  {equipoEditandoId ? 'Actualizar' : 'Crear'}
                </button>
                <button
                  className="btn-secondary w-full"
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
              className="input-base"
              placeholder="Buscar por cliente, nombre, marca, modelo o serie"
            />
            {cargando && <p className="text-sm font-semibold text-sat-muted">Cargando equipos...</p>}
            {!cargando && equiposFiltrados.length > 0 && (
              <div className="toolbar-panel">
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
                      className="select-base max-w-[5rem] px-2 py-1 text-xs"
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
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaginaEquipos((previo) => Math.min(totalPaginasEquipos, previo + 1))}
                    disabled={paginaEquipos === totalPaginasEquipos}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}

            {!cargando &&
              equiposPaginados.map((equipo) => (
                <article key={equipo.id} className="list-card">
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
                        className="btn-secondary px-3 py-2 text-xs"
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
                        className="inline-flex items-center justify-center rounded-2xl bg-rose-100 px-3 py-2 text-xs font-bold text-rose-700 transition hover:-translate-y-0.5 hover:bg-rose-200"
                        onClick={() => borrarEquipo(equipo.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </article>
              ))}

            {!cargando && busquedaEquipo.trim() && equiposFiltrados.length === 0 && (
              <p className="surface-panel border-dashed p-3 text-sm text-sat-muted">
                No hay equipos que coincidan con la búsqueda.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
