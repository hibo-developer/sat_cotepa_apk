import { useEffect, useMemo, useState } from 'react';
import {
  actualizarCliente,
  crearCliente,
  eliminarCliente,
  listarClientes,
  obtenerClienteCompleto,
  registrarAuditoriaDescargaCliente,
} from '../services/clientesService';
import {
  actualizarEquipo,
  crearEquipo,
  eliminarEquipo,
  listarEquipos,
} from '../services/equiposService';
import { listarComerciales } from '../services/comercialesService';
import { tieneConfiguracionSupabase } from '../services/supabaseClient';
import {
  autorizadoParaDescargarPdfCliente,
  construirMensajeErrorUsuario,
  descargarBlobEnNavegador,
  generarPdfClienteIndividual,
  generarPdfClientesMasivo,
  obtenerMaxClientesDescargaMasiva,
  obtenerLongitudMinContrasenaPdf,
} from '../services/clientesPdfService';

const FORM_CLIENTE_INICIAL = {
  nombre: '',
  direccion: '',
  telefono: '',
  telefono_2: '',
  contacto: '',
  cargo: '',
  contacto_2: '',
  cargo_2: '',
  email: '',
  lat: '',
  lng: '',
  identificador_fiscal: '',
  razon_social: '',
  direccion_fiscal: '',
  regimen_tributario: '',
  situacion_fiscal: '',
  telefono_fiscal: '',
  comerciales_ids: [],
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
  const [comerciales, setComerciales] = useState([]);

  const [equipoForm, setEquipoForm] = useState(FORM_EQUIPO_INICIAL);
  const [equipoEditandoId, setEquipoEditandoId] = useState('');
  const [busquedaEquipo, setBusquedaEquipo] = useState('');

  const [paginaClientes, setPaginaClientes] = useState(1);
  const [paginaEquipos, setPaginaEquipos] = useState(1);
  const [itemsPaginaClientes, setItemsPaginaClientes] = useState(5);
  const [itemsPaginaEquipos, setItemsPaginaEquipos] = useState(5);

  const [seleccionClientesIds, setSeleccionClientesIds] = useState([]);
  const [descargaEnCurso, setDescargaEnCurso] = useState(false);
  const [progresoDescarga, setProgresoDescarga] = useState({ actual: 0, total: 0 });
  const [clienteDescargandoId, setClienteDescargandoId] = useState(null);
  const [mostrarAvisoGdpr, setMostrarAvisoGdpr] = useState(false);
  const [gdprAccionPendiente, setGdprAccionPendiente] = useState(null);
  const [opcionesDescarga, setOpcionesDescarga] = useState({
    anonimizar: false,
    advertenciaMostrada: false,
    protegerConContrasena: false,
  });
  const [avisoResponsabilidadAbierto, setAvisoResponsabilidadAbierto] = useState(false);
  const [mostrarModalContrasena, setMostrarModalContrasena] = useState(false);
  const [contrasenaPdf, setContrasenaPdf] = useState('');
  const [confirmacionContrasenaPdf, setConfirmacionContrasenaPdf] = useState('');
  const [errorContrasenaModal, setErrorContrasenaModal] = useState('');
  const [accionPendienteContrasena, setAccionPendienteContrasena] = useState(null);

  const puedeDescargarPdf = autorizadoParaDescargarPdfCliente(rolUsuario);
  const maxDescargaMasiva = obtenerMaxClientesDescargaMasiva();

  const sinConfiguracion = useMemo(() => !tieneConfiguracionSupabase(), []);
  const puedeEditarCatalogos = rolUsuario === 'admin' || rolUsuario === 'oficina';
  const esComercial = rolUsuario === 'comercial';
  const modoSoloLectura = !puedeEditarCatalogos && !esComercial;
  const mostrarFormularioCliente = puedeEditarCatalogos || (esComercial && Boolean(clienteEditandoId));
  const telefono1Habilitado = Boolean(clienteForm.contacto.trim() && clienteForm.cargo.trim());
  const telefono2Habilitado = Boolean(clienteForm.contacto_2.trim() && clienteForm.cargo_2.trim());

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
      const telFisc = (cliente.telefono_fiscal || '').toLowerCase();
      const cnt = (cliente.contacto || '').toLowerCase();
      const crg = (cliente.cargo || '').toLowerCase();
      const cnt2 = (cliente.contacto_2 || '').toLowerCase();
      const crg2 = (cliente.cargo_2 || '').toLowerCase();
      const em = (cliente.email || '').toLowerCase();

      return (
        nom.includes(termino) ||
        rs.includes(termino) ||
        idf.includes(termino) ||
        dir.includes(termino) ||
        dirFisc.includes(termino) ||
        tel.includes(termino) ||
        tel2.includes(termino) ||
        telFisc.includes(termino) ||
        cnt.includes(termino) ||
        crg.includes(termino) ||
        cnt2.includes(termino) ||
        crg2.includes(termino) ||
        em.includes(termino)
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

  useEffect(() => {
    if (tabActiva !== 'clientes') {
      limpiarSeleccionClientes();
    }
  }, [tabActiva]);

  // Si se borra el contacto o cargo de un contacto, su telefono dependiente ya no es valido.
  useEffect(() => {
    if (!telefono1Habilitado) {
      setClienteForm((p) => (p.telefono ? { ...p, telefono: '' } : p));
    }
  }, [telefono1Habilitado]);

  useEffect(() => {
    if (!telefono2Habilitado) {
      setClienteForm((p) => (p.telefono_2 ? { ...p, telefono_2: '' } : p));
    }
  }, [telefono2Habilitado]);

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

      if (puedeEditarCatalogos) {
        try {
          setComerciales(await listarComerciales());
        } catch {
          // El listado de comerciales es solo para el selector; si falla no bloquea el resto.
        }
      }
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
        contacto_2: clienteForm.contacto_2,
        cargo_2: clienteForm.cargo_2,
        email: clienteForm.email,
        lat: clienteForm.lat,
        lng: clienteForm.lng,
        identificador_fiscal: clienteForm.identificador_fiscal,
        razon_social: clienteForm.razon_social,
        direccion_fiscal: clienteForm.direccion_fiscal,
        regimen_tributario: clienteForm.regimen_tributario,
        situacion_fiscal: clienteForm.situacion_fiscal,
        telefono_fiscal: clienteForm.telefono_fiscal,
        // La reasignación de comerciales de referencia queda reservada a
        // admin/oficina: un comercial puede editar el resto de datos del
        // cliente pero no puede reasignarse a sí mismo ni a otros.
        ...(puedeEditarCatalogos ? { comerciales_ids: clienteForm.comerciales_ids } : {}),
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

  function alternarSeleccionCliente(idCliente) {
    if (descargaEnCurso) return;
    setSeleccionClientesIds((previo) => {
      const yaIncluido = previo.includes(idCliente);
      if (yaIncluido) {
        return previo.filter((id) => id !== idCliente);
      }
      return [...previo, idCliente];
    });
  }

  function limpiarSeleccionClientes() {
    if (descargaEnCurso) return;
    setSeleccionClientesIds([]);
  }

  function seleccionarTodosLosFiltrados() {
    if (descargaEnCurso) return;
    const ids = clientesFiltrados.map((c) => c.id).slice(0, maxDescargaMasiva);
    setSeleccionClientesIds(ids);
  }

  async function confirmarAvisoGdprYContinuar(accion) {
    if (!opcionesDescarga.advertenciaMostrada) {
      setGdprAccionPendiente(() => accion);
      setMostrarAvisoGdpr(true);
      return;
    }
    if (opcionesDescarga.protegerConContrasena) {
      setAccionPendienteContrasena(() => accion);
      setContrasenaPdf('');
      setConfirmacionContrasenaPdf('');
      setErrorContrasenaModal('');
      setMostrarModalContrasena(true);
      return;
    }
    await accion({ contrasena: '' });
  }

  async function aceptarGdprYEjecutar() {
    setOpcionesDescarga((prev) => ({ ...prev, advertenciaMostrada: true }));
    setMostrarAvisoGdpr(false);
    const accion = gdprAccionPendiente;
    setGdprAccionPendiente(null);
    if (typeof accion === 'function') {
      try {
        if (opcionesDescarga.protegerConContrasena) {
          setAccionPendienteContrasena(() => accion);
          setContrasenaPdf('');
          setConfirmacionContrasenaPdf('');
          setErrorContrasenaModal('');
          setMostrarModalContrasena(true);
          return;
        }
        await accion({ contrasena: '' });
      } catch (err) {
        setError(construirMensajeErrorUsuario(err));
      }
    }
  }

  function cancelarModalContrasena() {
    setMostrarModalContrasena(false);
    setAccionPendienteContrasena(null);
    setContrasenaPdf('');
    setConfirmacionContrasenaPdf('');
    setErrorContrasenaModal('');
  }

  function confirmarContrasenaYEjecutar() {
    const min = obtenerLongitudMinContrasenaPdf();
    const p1 = String(contrasenaPdf || '');
    const p2 = String(confirmacionContrasenaPdf || '');
    if (p1.length < min) {
      setErrorContrasenaModal(`La contrase\u00F1a debe tener al menos ${min} caracteres.`);
      return;
    }
    if (p1 !== p2) {
      setErrorContrasenaModal('Las contrase\u00F1as introducidas no coinciden.');
      return;
    }
    setErrorContrasenaModal('');
    const accion = accionPendienteContrasena;
    setAccionPendienteContrasena(null);
    setMostrarModalContrasena(false);
    const contrasenaConfirmada = p1;
    setContrasenaPdf('');
    setConfirmacionContrasenaPdf('');
    if (typeof accion === 'function') {
      (async () => {
        try {
          await accion({ contrasena: contrasenaConfirmada });
        } catch (err) {
          setError(construirMensajeErrorUsuario(err));
        }
      })();
    }
  }

  async function descargarPdfClienteIndividual(idCliente) {
    if (!puedeDescargarPdf) {
      setError('Tu usuario no tiene permisos para descargar fichas de clientes.');
      return;
    }
    if (descargaEnCurso) return;
    confirmarAvisoGdprYContinuar(async ({ contrasena }) => {
      setMensaje('');
      setError('');
      setDescargaEnCurso(true);
      setClienteDescargandoId(idCliente);
      try {
        const datosCompletos = await obtenerClienteCompleto(idCliente);
        const nombreUsuario =
          (window.__APP_CONFIG__ && window.__APP_CONFIG__.usuario_nombre)
            ? window.__APP_CONFIG__.usuario_nombre
            : '';
        const resultado = await generarPdfClienteIndividual({
          datosCompletos,
          opciones: {
            anonimizar: Boolean(opcionesDescarga.anonimizar),
            nombreUsuario,
            contrasena: String(contrasena || ''),
          },
        });
        await registrarAuditoriaDescargaCliente({
          clienteIds: [idCliente],
          tipoDescarga: 'individual',
          opciones: {
            anonimizar: Boolean(opcionesDescarga.anonimizar),
            protegidoConContrasena: Boolean(resultado.protegidoConContrasena),
          },
        });
        descargarBlobEnNavegador({ blob: resultado.pdfBlob, nombreArchivo: resultado.nombreArchivo });
        const detalles = [`Ficha PDF generada correctamente: ${resultado.nombreArchivo}`];
        if (resultado.protegidoConContrasena) detalles.push('Protegido con contrase\u00F1a');
        setMensaje(detalles.join(' \u2014 '));
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[ClientesView] Error descarga individual:', err);
        }
        setError(construirMensajeErrorUsuario(err));
      } finally {
        setDescargaEnCurso(false);
        setClienteDescargandoId(null);
      }
    });
  }

  async function descargarPdfClientesSeleccionados() {
    if (!puedeDescargarPdf) {
      setError('Tu usuario no tiene permisos para descargar fichas de clientes.');
      return;
    }
    const ids = Array.isArray(seleccionClientesIds) ? seleccionClientesIds : [];
    if (ids.length === 0) {
      setError('Selecciona al menos un cliente para generar el PDF masivo.');
      return;
    }
    if (ids.length > maxDescargaMasiva) {
      setError(`Se han seleccionado ${ids.length} clientes. El l\u00EDmite es ${maxDescargaMasiva}.`);
      return;
    }
    if (descargaEnCurso) return;
    confirmarAvisoGdprYContinuar(async ({ contrasena }) => {
      setMensaje('');
      setError('');
      setDescargaEnCurso(true);
      setProgresoDescarga({ actual: 0, total: ids.length });
      try {
        const resultadosDatos = [];
        const erroresCarga = [];
        for (let i = 0; i < ids.length; i += 1) {
          const id = ids[i];
          try {
            const datos = await obtenerClienteCompleto(id);
            resultadosDatos.push(datos);
          } catch (err) {
            erroresCarga.push({ idCliente: id, detalle: err?.message || String(err) });
          }
          setProgresoDescarga({ actual: i + 1, total: ids.length, fase: 'carga' });
        }
        if (resultadosDatos.length === 0) {
          throw new Error('No se pudieron obtener los datos de ning\u00FAn cliente seleccionado.');
        }
        const nombreUsuario =
          (window.__APP_CONFIG__ && window.__APP_CONFIG__.usuario_nombre)
            ? window.__APP_CONFIG__.usuario_nombre
            : '';
        const resultado = await generarPdfClientesMasivo({
          listaDatosCompletos: resultadosDatos,
          opciones: {
            anonimizar: Boolean(opcionesDescarga.anonimizar),
            nombreUsuario,
            contrasena: String(contrasena || ''),
            onProgreso: (prog) => setProgresoDescarga({
              actual: prog.actual,
              total: prog.total,
              fase: 'pdf',
              errores: prog.errores,
            }),
          },
        });
        await registrarAuditoriaDescargaCliente({
          clienteIds: ids,
          tipoDescarga: 'masiva',
          opciones: {
            anonimizar: Boolean(opcionesDescarga.anonimizar),
            protegidoConContrasena: Boolean(resultado.protegidoConContrasena),
          },
        });
        descargarBlobEnNavegador({ blob: resultado.pdfBlob, nombreArchivo: resultado.nombreArchivo });
        const partes = [
          `PDF masivo generado: ${resultado.nombreArchivo}`,
          `Clientes con \u00E9xito: ${resultado.numeroClientesExito}`,
        ];
        if (resultado.protegidoConContrasena) partes.push('Protegido con contrase\u00F1a');
        if (resultado.numeroClientesError > 0 || erroresCarga.length > 0) {
          partes.push(`Clientes con errores: ${resultado.numeroClientesError + erroresCarga.length}`);
        }
        setMensaje(partes.join(' \u2014 '));
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[ClientesView] Error descarga masiva:', err);
        }
        setError(construirMensajeErrorUsuario(err));
      } finally {
        setDescargaEnCurso(false);
        setProgresoDescarga({ actual: 0, total: 0 });
      }
    });
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

      {esComercial && (
        <p className="status-banner-warning">
          Tu rol comercial solo permite ver y editar los clientes que tienes asociados. No puedes crear ni eliminar clientes.
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
          {mostrarFormularioCliente && (
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
                    <label className="label-base text-xs">Persona de contacto 1 *</label>
                    <input
                      value={clienteForm.contacto}
                      onChange={(e) => setClienteForm((p) => ({ ...p, contacto: e.target.value }))}
                      className="input-base"
                      placeholder="Nombre de contacto"
                    />
                  </div>
                  <div>
                    <label className="label-base text-xs">Cargo / Puesto *</label>
                    <input
                      value={clienteForm.cargo}
                      onChange={(e) => setClienteForm((p) => ({ ...p, cargo: e.target.value }))}
                      className="input-base"
                      placeholder="Ej. Jefe Mantenimiento"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="label-base text-xs">Teléfono del contacto 1</label>
                    <input
                      value={clienteForm.telefono}
                      onChange={(e) => setClienteForm((p) => ({ ...p, telefono: e.target.value }))}
                      className="input-base disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      placeholder="Teléfono del contacto 1"
                      disabled={!telefono1Habilitado}
                    />
                  </div>
                  {!telefono1Habilitado && (
                    <p className="col-span-2 text-[11px] font-medium text-amber-600">
                      Completa "Persona de contacto 1" y "Cargo / Puesto" para poder registrar su teléfono.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-slate-200/70 pt-2.5">
                  <div>
                    <label className="label-base text-xs">Persona de contacto 2</label>
                    <input
                      value={clienteForm.contacto_2}
                      onChange={(e) => setClienteForm((p) => ({ ...p, contacto_2: e.target.value }))}
                      className="input-base"
                      placeholder="Nombre de contacto 2 (opcional)"
                    />
                  </div>
                  <div>
                    <label className="label-base text-xs">Cargo / Puesto</label>
                    <input
                      value={clienteForm.cargo_2}
                      onChange={(e) => setClienteForm((p) => ({ ...p, cargo_2: e.target.value }))}
                      className="input-base"
                      placeholder="Ej. Administración"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="label-base text-xs">Teléfono del contacto 2</label>
                    <input
                      value={clienteForm.telefono_2}
                      onChange={(e) => setClienteForm((p) => ({ ...p, telefono_2: e.target.value }))}
                      className="input-base disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      placeholder="Teléfono del contacto 2"
                      disabled={!telefono2Habilitado}
                    />
                  </div>
                  {!telefono2Habilitado && (
                    <p className="col-span-2 text-[11px] font-medium text-amber-600">
                      Completa "Persona de contacto 2" y "Cargo / Puesto" para poder registrar su teléfono.
                    </p>
                  )}
                </div>
              </div>

              {/* Seccion: Comercial de referencia (solo admin/oficina puede reasignar) */}
              {puedeEditarCatalogos && (
                <div className="space-y-2.5 rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">
                    Comercial de referencia
                  </p>
                  <p className="text-[11px] text-emerald-700">
                    Selecciona uno o varios comerciales responsables de este cliente. Si no seleccionas ninguno, se
                    asignará automáticamente el comercial predeterminado.
                  </p>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-emerald-200 bg-white p-2">
                    {comerciales.length === 0 && (
                      <p className="text-xs text-slate-400">No hay comerciales registrados.</p>
                    )}
                    {comerciales.map((comercial) => (
                      <label key={comercial.id} className="flex items-center gap-2 text-xs font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={clienteForm.comerciales_ids.includes(comercial.id)}
                          onChange={(e) => {
                            setClienteForm((p) => {
                              const marcado = e.target.checked;
                              const yaIncluido = p.comerciales_ids.includes(comercial.id);
                              const nuevos = marcado
                                ? (yaIncluido ? p.comerciales_ids : [...p.comerciales_ids, comercial.id])
                                : p.comerciales_ids.filter((id) => id !== comercial.id);
                              return { ...p, comerciales_ids: nuevos };
                            });
                          }}
                        />
                        <span>
                          {comercial.nombre}
                          {comercial.es_predeterminado ? ' (predeterminado)' : ''}
                          {!comercial.activo ? ' — inactivo' : ''}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

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

                <div>
                  <label className="label-base text-xs">Teléfono Fiscal / Facturación</label>
                  <input
                    value={clienteForm.telefono_fiscal}
                    onChange={(e) => setClienteForm((p) => ({ ...p, telefono_fiscal: e.target.value }))}
                    className="input-base bg-white"
                    placeholder="Teléfono para facturación"
                  />
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

          <div className={`space-y-3 ${mostrarFormularioCliente ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
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

            {/* Toolbar de selección y descarga PDF masiva */}
            {puedeDescargarPdf && !cargando && clientesFiltrados.length > 0 && (
              <div className="surface-card space-y-3 p-3 border-t-0 rounded-t-none -mt-3" role="toolbar" aria-label="Herramientas de descarga masiva de clientes">
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700" htmlFor="chk-anonimizar">
                      <input
                        id="chk-anonimizar"
                        type="checkbox"
                        checked={Boolean(opcionesDescarga.anonimizar)}
                        disabled={descargaEnCurso}
                        onChange={(e) =>
                          setOpcionesDescarga((prev) => ({ ...prev, anonimizar: e.target.checked }))
                        }
                        aria-describedby="desc-anonimizar"
                      />
                      <span>Anonimizar datos sensibles (ID fiscal, teléfonos, email)</span>
                    </label>
                    <span id="desc-anonimizar" className="sr-only">
                      Al activar esta opción, los datos de contacto e identificación fiscal se mostrarán enmascarados en el PDF.
                    </span>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700" htmlFor="chk-contrasena">
                      <input
                        id="chk-contrasena"
                        type="checkbox"
                        checked={Boolean(opcionesDescarga.protegerConContrasena)}
                        disabled={descargaEnCurso}
                        onChange={(e) =>
                          setOpcionesDescarga((prev) => ({ ...prev, protegerConContrasena: e.target.checked }))
                        }
                        aria-describedby="desc-contrasena"
                      />
                      <span>Proteger PDF con contraseña</span>
                    </label>
                    <span id="desc-contrasena" className="sr-only">
                      Al activar esta opción, se solicitará una contraseña que será necesaria para abrir el archivo PDF descargado.
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={seleccionarTodosLosFiltrados}
                      disabled={descargaEnCurso || clientesFiltrados.length === 0}
                      className="btn-secondary px-3 py-1.5 text-xs"
                      aria-label={`Seleccionar los primeros ${maxDescargaMasiva} clientes filtrados para descarga masiva`}
                    >
                      Seleccionar todos
                    </button>
                    <button
                      type="button"
                      onClick={limpiarSeleccionClientes}
                      disabled={descargaEnCurso || seleccionClientesIds.length === 0}
                      className="btn-secondary px-3 py-1.5 text-xs"
                      aria-label="Deseleccionar todos los clientes marcados"
                    >
                      Limpiar selección
                    </button>
                    <button
                      type="button"
                      onClick={descargarPdfClientesSeleccionados}
                      disabled={descargaEnCurso || seleccionClientesIds.length === 0}
                      className="btn-primary px-3 py-1.5 text-xs inline-flex items-center gap-2"
                      aria-label={`Descargar ficha PDF de los ${seleccionClientesIds.length} clientes seleccionados`}
                      aria-busy={descargaEnCurso}
                    >
                      {descargaEnCurso && (
                        <span className="inline-block h-3 w-3 border-2 border-white/60 border-t-white rounded-full animate-spin" aria-hidden="true" />
                      )}
                      Descargar PDF ({seleccionClientesIds.length}/{maxDescargaMasiva})
                    </button>
                  </div>
                </div>
                {descargaEnCurso && progresoDescarga.total > 0 && (
                  <div role="status" aria-live="polite" className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600">
                      <span>
                        {progresoDescarga.fase === 'pdf' ? 'Generando fichas PDF' : 'Cargando datos de clientes'}
                        {' : '}
                        {progresoDescarga.actual} de {progresoDescarga.total}
                      </span>
                      <span>
                        {Math.round((progresoDescarga.actual / progresoDescarga.total) * 100)}%
                      </span>
                    </div>
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round((progresoDescarga.actual / progresoDescarga.total) * 100)}
                      aria-label="Progreso de generación del PDF masivo"
                    >
                      <div
                        className="h-full bg-indigo-600 transition-all duration-200"
                        style={{ width: `${Math.round((progresoDescarga.actual / progresoDescarga.total) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

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
              clientesPaginados.map((cliente) => {
                const estaSeleccionado = seleccionClientesIds.includes(cliente.id);
                const estaDescargando = clienteDescargandoId === cliente.id;
                return (
                  <article
                    key={cliente.id}
                    className={`list-card space-y-2 ${estaSeleccionado ? 'ring-2 ring-indigo-500 ring-offset-1' : ''}`}
                    aria-label={`Cliente ${cliente.nombre}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        {puedeDescargarPdf && (
                          <label className="sr-only" htmlFor={`sel-cli-${cliente.id}`}>
                            Seleccionar cliente {cliente.nombre} para descarga masiva
                          </label>
                        )}
                        {puedeDescargarPdf && (
                          <input
                            id={`sel-cli-${cliente.id}`}
                            type="checkbox"
                            checked={estaSeleccionado}
                            disabled={descargaEnCurso}
                            onChange={() => alternarSeleccionCliente(cliente.id)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            aria-label={`Seleccionar cliente ${cliente.nombre}`}
                          />
                        )}
                        <div>
                          <h4 className="text-base font-black text-sat-text">{cliente.nombre}</h4>
                          {cliente.razon_social && cliente.razon_social !== cliente.nombre && (
                            <p className="text-xs font-semibold text-slate-600">
                              Razón Social: <span className="font-normal">{cliente.razon_social}</span>
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        {cliente.identificador_fiscal && (
                          <span className="inline-flex items-center rounded-lg bg-sky-100 px-2.5 py-1 text-xs font-black text-sky-800 border border-sky-200">
                            ID Fiscal: {cliente.identificador_fiscal}
                          </span>
                        )}
                        {puedeDescargarPdf && (
                          <button
                            type="button"
                            onClick={() =>
                              confirmarAvisoGdprYContinuar(() =>
                                descargarPdfClienteIndividual(cliente.id)
                              )
                            }
                            disabled={descargaEnCurso && !estaDescargando}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 border border-indigo-200 transition hover:-translate-y-0.5 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label={`Descargar ficha PDF del cliente ${cliente.nombre}`}
                            aria-busy={estaDescargando}
                            title="Descargar ficha PDF individual"
                          >
                            {estaDescargando ? (
                              <>
                                <span className="inline-block h-3 w-3 border-2 border-indigo-500/60 border-t-indigo-700 rounded-full animate-spin" aria-hidden="true" />
                                Generando…
                              </>
                            ) : (
                              <>
                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                  <polyline points="7 10 12 15 17 10" />
                                  <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Ficha PDF
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                  <div className="grid gap-1 text-xs text-sat-muted sm:grid-cols-2">
                    <p><span className="font-semibold text-sat-text">Email:</span> {cliente.email || 'Sin email'}</p>
                    <p><span className="font-semibold text-sat-text">Dir. Trabajo:</span> {cliente.direccion || 'Sin dirección'}</p>
                    {(cliente.contacto || cliente.cargo || cliente.telefono) && (
                      <p className="sm:col-span-2">
                        <span className="font-semibold text-sat-text">Contacto 1:</span> {cliente.contacto || 'Sin contacto'} {cliente.cargo ? `(${cliente.cargo})` : ''} — {cliente.telefono || 'Sin teléfono'}
                      </p>
                    )}
                    {(cliente.contacto_2 || cliente.cargo_2 || cliente.telefono_2) && (
                      <p className="sm:col-span-2">
                        <span className="font-semibold text-sat-text">Contacto 2:</span> {cliente.contacto_2 || 'Sin contacto'} {cliente.cargo_2 ? `(${cliente.cargo_2})` : ''} — {cliente.telefono_2 || 'Sin teléfono'}
                      </p>
                    )}
                    {cliente.direccion_fiscal && (
                      <p className="sm:col-span-2"><span className="font-semibold text-sat-text">Dir. Fiscal:</span> {cliente.direccion_fiscal}</p>
                    )}
                    {cliente.telefono_fiscal && (
                      <p className="sm:col-span-2"><span className="font-semibold text-sat-text">Tel. Fiscal:</span> {cliente.telefono_fiscal}</p>
                    )}
                    {cliente.comerciales && cliente.comerciales.length > 0 && (
                      <p className="sm:col-span-2">
                        <span className="font-semibold text-sat-text">Comercial:</span>{' '}
                        {cliente.comerciales.map((c) => c.nombre).join(', ')}
                      </p>
                    )}
                  </div>

                  {cliente.lat != null && cliente.lng != null && (
                    <p className="text-[11px] text-sat-subtle">
                      GPS: {Number(cliente.lat).toFixed(5)}, {Number(cliente.lng).toFixed(5)}
                    </p>
                  )}

                  {(puedeEditarCatalogos || esComercial) && (
                    <div className={`mt-3 grid gap-2 pt-1 border-t border-slate-100 ${puedeEditarCatalogos ? 'grid-cols-2' : 'grid-cols-1'}`}>
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
                            contacto_2: cliente.contacto_2 || '',
                            cargo_2: cliente.cargo_2 || '',
                            email: cliente.email || '',
                            lat: cliente.lat != null ? String(cliente.lat) : '',
                            lng: cliente.lng != null ? String(cliente.lng) : '',
                            identificador_fiscal: cliente.identificador_fiscal || '',
                            razon_social: cliente.razon_social || '',
                            direccion_fiscal: cliente.direccion_fiscal || '',
                            regimen_tributario: cliente.regimen_tributario || '',
                            situacion_fiscal: cliente.situacion_fiscal || '',
                            telefono_fiscal: cliente.telefono_fiscal || '',
                            comerciales_ids: (cliente.comerciales || []).map((c) => c.id),
                          });
                        }}
                      >
                        Editar
                      </button>
                      {puedeEditarCatalogos && (
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-2xl bg-rose-100 px-3 py-2 text-xs font-bold text-rose-700 transition hover:-translate-y-0.5 hover:bg-rose-200"
                          onClick={() => borrarCliente(cliente.id)}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  )}
                </article>
                );
              })}
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

      {/* Modal GDPR / Aviso de responsabilidad local */}
      {mostrarAvisoGdpr && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gdpr-titulo"
          aria-describedby="gdpr-descripcion"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 ring-1 ring-amber-200" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-amber-700" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div className="space-y-1 flex-1">
                <h3 id="gdpr-titulo" className="text-lg font-black tracking-tight text-slate-900">
                  Aviso de protección de datos
                </h3>
                <p id="gdpr-descripcion" className="text-xs leading-5 text-slate-600">
                  Este módulo genera un fichero PDF que se descargará directamente en tu equipo local. Antes de continuar, confirma que entiendes y aceptas las siguientes responsabilidades de custodia conforme al RGPD, LOPD y CCPA:
                </p>
              </div>
            </div>
            <ul className="space-y-2 rounded-xl bg-slate-50 p-3 text-[12px] leading-5 text-slate-700 ring-1 ring-slate-200" aria-label="Lista de responsabilidades del usuario">
              <li className="flex gap-2">
                <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" aria-hidden="true" />
                <span>
                  <strong>Confidencialidad:</strong> el archivo contiene datos personales de clientes (identificación fiscal, contactos, historial de servicios) y no debe compartirse con terceros sin base legal.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" aria-hidden="true" />
                <span>
                  <strong>Custodia local:</strong> eres responsable de guardar el PDF en un lugar seguro (carpeta encriptada, disco con acceso por contraseña) y borrarlo cuando ya no sea necesario para el fin para el que fue descargado.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" aria-hidden="true" />
                <span>
                  <strong>Registro de auditoría:</strong> cada descarga queda registrada en el sistema con tu usuario, fecha/hora y el cliente o clientes incluidos, de acuerdo al artículo 30 RGPD.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" aria-hidden="true" />
                <span>
                  <strong>Derechos de los titulares:</strong> si un cliente ejerce su derecho de acceso, rectificación o supresión, deberás localizar y actualizar o eliminar cualquier copia local que hayas generado.
                </span>
              </li>
            </ul>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secondary px-4 py-2 text-sm"
                onClick={() => {
                  setMostrarAvisoGdpr(false);
                  setGdprAccionPendiente(null);
                }}
                aria-label="Cancelar y no generar la descarga"
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary px-4 py-2 text-sm inline-flex items-center justify-center gap-2"
                onClick={aceptarGdprYEjecutar}
                aria-label="Aceptar el aviso de responsabilidad y continuar con la descarga"
              >
                Aceptar y continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal introducir contraseña para proteger PDF */}
      {mostrarModalContrasena && (
        <div
          className="fixed inset-0 z-[91] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-contrasena-titulo"
          aria-describedby="modal-contrasena-descripcion"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 ring-1 ring-indigo-200" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-indigo-700" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div className="space-y-1 flex-1">
                <h3 id="modal-contrasena-titulo" className="text-lg font-black tracking-tight text-slate-900">
                  Proteger PDF con contraseña
                </h3>
                <p id="modal-contrasena-descripcion" className="text-xs leading-5 text-slate-600">
                  Introduce una contraseña de al menos <strong>{obtenerLongitudMinContrasenaPdf()} caracteres</strong>. Se te pedirá esta misma clave cada vez que quieras abrir el fichero descargado.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <label className="block space-y-1" htmlFor="pdf-pass-1">
                <span className="text-xs font-bold text-slate-700">Contraseña</span>
                <input
                  id="pdf-pass-1"
                  type="password"
                  autoComplete="new-password"
                  className="input-base text-sm"
                  value={contrasenaPdf}
                  onChange={(e) => setContrasenaPdf(e.target.value)}
                  aria-invalid={Boolean(errorContrasenaModal)}
                />
              </label>
              <label className="block space-y-1" htmlFor="pdf-pass-2">
                <span className="text-xs font-bold text-slate-700">Confirmar contraseña</span>
                <input
                  id="pdf-pass-2"
                  type="password"
                  autoComplete="new-password"
                  className="input-base text-sm"
                  value={confirmacionContrasenaPdf}
                  onChange={(e) => setConfirmacionContrasenaPdf(e.target.value)}
                  aria-invalid={Boolean(errorContrasenaModal)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      confirmarContrasenaYEjecutar();
                    }
                  }}
                />
              </label>
              {errorContrasenaModal && (
                <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                  {errorContrasenaModal}
                </p>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secondary px-4 py-2 text-sm"
                onClick={cancelarModalContrasena}
                aria-label="Cancelar y no establecer contraseña"
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary px-4 py-2 text-sm inline-flex items-center justify-center gap-2"
                onClick={confirmarContrasenaYEjecutar}
                aria-label="Confirmar contraseña y generar el PDF protegido"
              >
                Confirmar y generar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay global de descarga en curso (para pantalla completa + bloqueo interacciones) */}
      {descargaEnCurso && clienteDescargandoId && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[85] bg-white/10"
        />
      )}
    </section>
  );
}
