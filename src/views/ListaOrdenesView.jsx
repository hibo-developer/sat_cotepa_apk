import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, CalendarClock, CircleCheckBig, Clock3, Download, Flag, Hammer, MapPinned, Rocket, Search, TriangleAlert, UserRound, Wrench } from 'lucide-react';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { ToastEstado } from '../components/ToastEstado';
import { ModalElegirNavegacion } from '../components/ModalElegirNavegacion';
import {
  getAppsNavegacionDisponibles,
  getPreferenciaNav,
  guardarPreferenciaNav,
  navegarA,
} from '../services/navegacion';
import { useOrdenes } from '../hooks/useOrdenes';
import { useDebounce } from '../hooks/useDebounce';
import {
  obtenerClientes,
  obtenerEquiposPorCliente,
  obtenerTecnicosActivos,
} from '../services/catalogosService';
import { tieneConfiguracionSupabase, obtenerUrlFirmadaStorage } from '../services/supabaseClient';

const estilosEstado = {
  Pendiente: {
    icono: Clock3,
    clase: 'bg-amber-100 text-amber-800',
  },
  'En Proceso': {
    icono: Hammer,
    clase: 'bg-sky-100 text-sky-800',
  },
  Finalizado: {
    icono: CircleCheckBig,
    clase: 'bg-emerald-100 text-emerald-800',
  },
  Pausado: {
    icono: TriangleAlert,
    clase: 'bg-orange-100 text-orange-800',
  },
};

const FILTROS_ESTADO = ['Todas', 'Pendiente', 'En Proceso', 'Pausado', 'Finalizado'];
const ORDENES_POR_PAGINA = 8;
const OPCIONES_ESTADO_EDITABLE = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_proceso', label: 'En Proceso' },
  { value: 'pausado', label: 'Pausado' },
];
const PASOS_ALTA_RAPIDA = [
  {
    numero: '01',
    titulo: 'Cliente y equipo',
    descripcion: 'Selecciona el contexto de la incidencia o del PEM.',
    campos: 'Cliente, equipo',
  },
  {
    numero: '02',
    titulo: 'Tecnico y tipo',
    descripcion: 'Asigna responsable y clasifica rapidamente el trabajo.',
    campos: 'Tecnico, tipo',
  },
  {
    numero: '03',
    titulo: 'Detalle y prioridad',
    descripcion: 'Resume la intervencion y marca la urgencia real.',
    campos: 'Descripcion, prioridad',
  },
];

function resolverUbicacionCliente(orden) {
  const direccion = String(orden?.clienteDireccion || '').trim();
  const lat = Number(orden?.clienteLat);
  const lng = Number(orden?.clienteLng);
  const tieneCoords =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0);

  return {
    direccion,
    lat: tieneCoords ? lat : null,
    lng: tieneCoords ? lng : null,
    tieneUbicacion: tieneCoords || Boolean(direccion),
  };
}

function resolverEtiquetaTipoOrden(tipoOrden) {
  const tipo = String(tipoOrden || '').trim();
  if (tipo === 'montaje') {
    return {
      texto: 'PEM · Montaje',
      icono: Hammer,
      clase: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    };
  }
  if (tipo === 'puesta_en_marcha') {
    return {
      texto: 'PEM · Puesta en marcha',
      icono: Rocket,
      clase: 'border-purple-200 bg-purple-50 text-purple-800',
    };
  }
  return {
    texto: 'Avería',
    icono: Wrench,
    clase: 'border-rose-200 bg-rose-50 text-rose-800',
  };
}

function resolverEtiquetaPrioridad(prioridad) {
  const valor = String(prioridad || 'media').trim().toLowerCase();

  if (valor === 'urgente') {
    return {
      texto: 'Urgente',
      clase: 'border-rose-200 bg-rose-50 text-rose-800',
    };
  }
  if (valor === 'alta') {
    return {
      texto: 'Alta',
      clase: 'border-orange-200 bg-orange-50 text-orange-800',
    };
  }
  if (valor === 'baja') {
    return {
      texto: 'Baja',
      clase: 'border-slate-200 bg-slate-100 text-slate-700',
    };
  }

  return {
    texto: 'Media',
    clase: 'border-amber-200 bg-amber-50 text-amber-800',
  };
}

function obtenerFechaRegeneracionDesdeUrl(urlInforme) {
  const url = String(urlInforme || '');
  const coincidencia = /informe-parte-[^-]+-(\d+)\.pdf/i.exec(url);
  if (!coincidencia) {
    return null;
  }

  const epochMs = Number.parseInt(coincidencia[1], 10);
  if (!Number.isFinite(epochMs) || epochMs <= 0) {
    return null;
  }

  const fecha = new Date(epochMs);
  return Number.isFinite(fecha.getTime()) ? fecha.toLocaleString('es-ES') : null;
}

function esFinDeSemana(fechaIso) {
  if (!fechaIso) {
    return false;
  }

  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) {
    return false;
  }

  const dia = fecha.getDay();
  return dia === 0 || dia === 6;
}

function esFueraHorarioLaboral(fechaIso) {
  if (!fechaIso) {
    return false;
  }

  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) {
    return false;
  }

  const hora = fecha.getHours();
  return hora < 8 || hora >= 18;
}

function detectarFueraHorario(inicioIso, finIso) {
  return esFueraHorarioLaboral(inicioIso) || esFueraHorarioLaboral(finIso);
}

function isoADatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function datetimeLocalAIso(valor) {
  const v = String(valor || '').trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const hh = Number(m[4]);
  const mi = Number(m[5]);
  const d = new Date(yyyy, mm - 1, dd, hh, mi, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function horasManoObraDesdeIntervencionDatetimeLocal(inicioDatetimeLocal, finDatetimeLocal) {
  const inicioIso = datetimeLocalAIso(inicioDatetimeLocal);
  const finIso = datetimeLocalAIso(finDatetimeLocal);
  if (!inicioIso || !finIso) return null;
  const ms = new Date(finIso).getTime() - new Date(inicioIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutos = Math.max(1, Math.ceil(ms / 60000));
  const horas = minutos < 60 ? 1 : Number((minutos / 60).toFixed(2));
  return horas.toFixed(2);
}

function columnaExcel(indice) {
  let n = indice;
  let resultado = '';

  while (n > 0) {
    const resto = (n - 1) % 26;
    resultado = String.fromCharCode(65 + resto) + resultado;
    n = Math.floor((n - 1) / 26);
  }

  return resultado;
}

async function descargarExcelProfesional({
  nombreArchivo,
  hojaNombre,
  titulo,
  subtitulo,
  columnas,
  filas,
  resumen = [],
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SAT COTEPA';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(hojaNombre);
  const totalColumnas = columnas.length;
  const ultimaColumna = columnaExcel(totalColumnas);

  columnas.forEach((columna, indice) => {
    worksheet.getColumn(indice + 1).width = columna.width || 20;
  });

  worksheet.mergeCells(`A1:${ultimaColumna}1`);
  worksheet.getCell('A1').value = titulo;
  worksheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  worksheet.getCell('A1').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F172A' },
  };
  worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(1).height = 28;

  worksheet.mergeCells(`A2:${ultimaColumna}2`);
  worksheet.getCell('A2').value = subtitulo;
  worksheet.getCell('A2').font = { italic: true, size: 11, color: { argb: 'FF334155' } };
  worksheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(2).height = 20;

  let filaActual = 4;
  if (resumen.length) {
    worksheet.getCell(`A${filaActual}`).value = 'Resumen';
    worksheet.getCell(`A${filaActual}`).font = { bold: true, size: 11, color: { argb: 'FF0F172A' } };
    filaActual += 1;

    resumen.forEach(([etiqueta, valor]) => {
      worksheet.getCell(`A${filaActual}`).value = etiqueta;
      worksheet.getCell(`A${filaActual}`).font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
      worksheet.getCell(`B${filaActual}`).value = valor;
      worksheet.getCell(`B${filaActual}`).font = { size: 10, color: { argb: 'FF334155' } };
      filaActual += 1;
    });

    filaActual += 1;
  }

  const filaEncabezado = filaActual;
  columnas.forEach((columna, indice) => {
    const celda = worksheet.getCell(filaEncabezado, indice + 1);
    celda.value = columna.header;
    celda.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    celda.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' },
    };
    celda.alignment = { vertical: 'middle', horizontal: 'left' };
    celda.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  const filaDatosInicio = filaEncabezado + 1;
  const filasDatos = filas.length ? filas : [{ __sinDatos: 'Sin datos para los filtros actuales' }];

  filasDatos.forEach((fila, indiceFila) => {
    const numeroFila = filaDatosInicio + indiceFila;

    columnas.forEach((columna, indiceColumna) => {
      const celda = worksheet.getCell(numeroFila, indiceColumna + 1);
      celda.value = fila[columna.key] ?? '';
      celda.font = { size: 10, color: { argb: 'FF0F172A' } };
      celda.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      celda.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: indiceFila % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' },
      };
      celda.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      if (columna.numFmt) {
        celda.numFmt = columna.numFmt;
      }
    });
  });

  const filaDatosFin = filaDatosInicio + filasDatos.length - 1;
  worksheet.autoFilter = {
    from: { row: filaEncabezado, column: 1 },
    to: { row: filaEncabezado, column: totalColumnas },
  };

  worksheet.views = [{ state: 'frozen', ySplit: filaEncabezado }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);

  return { filaDatosInicio, filaDatosFin };
}

function FormularioNuevaOrden({ onCrear, accionEnCurso, onNotificar, puedeCrearOrdenes }) {
  const LIMITE_CATALOGO = 20;
  const [clientes, setClientes] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [cargandoClientes, setCargandoClientes] = useState(false);
  const [cargandoEquipos, setCargandoEquipos] = useState(false);
  const [cargandoTecnicos, setCargandoTecnicos] = useState(false);
  const [hayMasClientes, setHayMasClientes] = useState(false);
  const [hayMasEquipos, setHayMasEquipos] = useState(false);
  const [hayMasTecnicos, setHayMasTecnicos] = useState(false);
  const [paginaClientes, setPaginaClientes] = useState(1);
  const [paginaEquipos, setPaginaEquipos] = useState(1);
  const [paginaTecnicos, setPaginaTecnicos] = useState(1);
  const [formulario, setFormulario] = useState({
    cliente_id: '',
    equipo_id: '',
    tecnico_id: '',
    tipo_orden: 'averia',
    descripcion_averia: '',
    prioridad: 'media',
  });

  const [mensaje, setMensaje] = useState('');
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [busquedaEquipo, setBusquedaEquipo] = useState('');
  const [busquedaTecnico, setBusquedaTecnico] = useState('');

  const busquedaClienteDebounce = useDebounce(busquedaCliente, 250);
  const busquedaEquipoDebounce = useDebounce(busquedaEquipo, 250);
  const busquedaTecnicoDebounce = useDebounce(busquedaTecnico, 250);
  const cargandoCatalogos = cargandoClientes || cargandoEquipos || cargandoTecnicos;
  const formularioDeshabilitado = !puedeCrearOrdenes || !tieneConfiguracionSupabase() || cargandoCatalogos;

  useEffect(() => {
    async function cargarClientes() {
      if (!tieneConfiguracionSupabase()) {
        setMensaje('Configura Supabase para habilitar el alta de órdenes con catálogos reales.');
        return;
      }

      setCargandoClientes(true);

      try {
        const respuesta = await obtenerClientes({
          busqueda: busquedaClienteDebounce,
          limite: LIMITE_CATALOGO,
          pagina: paginaClientes,
        });

        setClientes((previo) => (paginaClientes === 1 ? respuesta.items : [...previo, ...respuesta.items]));
        setHayMasClientes(respuesta.hayMas);
      } catch (err) {
        setMensaje(err.message || 'No se pudieron cargar los clientes.');
      } finally {
        setCargandoClientes(false);
      }
    }

    cargarClientes();
  }, [busquedaClienteDebounce, paginaClientes]);

  useEffect(() => {
    async function cargarTecnicos() {
      if (!tieneConfiguracionSupabase()) {
        return;
      }

      setCargandoTecnicos(true);

      try {
        const respuesta = await obtenerTecnicosActivos({
          busqueda: busquedaTecnicoDebounce,
          limite: LIMITE_CATALOGO,
          pagina: paginaTecnicos,
        });

        setTecnicos((previo) => (paginaTecnicos === 1 ? respuesta.items : [...previo, ...respuesta.items]));
        setHayMasTecnicos(respuesta.hayMas);
      } catch (err) {
        setMensaje(err.message || 'No se pudieron cargar los técnicos.');
      } finally {
        setCargandoTecnicos(false);
      }
    }

    cargarTecnicos();
  }, [busquedaTecnicoDebounce, paginaTecnicos]);

  useEffect(() => {
    async function cargarEquipos() {
      if (!formulario.cliente_id || !tieneConfiguracionSupabase()) {
        setEquipos([]);
        setHayMasEquipos(false);
        setBusquedaEquipo('');
        setFormulario((previo) => ({ ...previo, equipo_id: '' }));
        return;
      }

      setCargandoEquipos(true);

      try {
        const respuesta = await obtenerEquiposPorCliente(formulario.cliente_id, {
          busqueda: busquedaEquipoDebounce,
          limite: LIMITE_CATALOGO,
          pagina: paginaEquipos,
        });

        setEquipos((previo) => (paginaEquipos === 1 ? respuesta.items : [...previo, ...respuesta.items]));
        setHayMasEquipos(respuesta.hayMas);
      } catch (err) {
        setEquipos([]);
        setMensaje(err.message || 'No se pudieron cargar los equipos del cliente seleccionado.');
      } finally {
        setCargandoEquipos(false);
      }
    }

    cargarEquipos();
  }, [formulario.cliente_id, busquedaEquipoDebounce, paginaEquipos]);

  function actualizarCampo(evento) {
    const { name, value } = evento.target;
    setFormulario((previo) => ({ ...previo, [name]: value }));
  }

  async function enviarFormulario(evento) {
    evento.preventDefault();
    setMensaje('');

    try {
      await onCrear({
        ...formulario,
        equipo_id: formulario.equipo_id || null,
        tecnico_id: formulario.tecnico_id || null,
      });

      setFormulario({
        cliente_id: '',
        equipo_id: '',
        tecnico_id: '',
        tipo_orden: 'averia',
        descripcion_averia: '',
        prioridad: 'media',
      });
      setBusquedaCliente('');
      setBusquedaEquipo('');
      setBusquedaTecnico('');
      setPaginaClientes(1);
      setPaginaEquipos(1);
      setPaginaTecnicos(1);
      setMensaje('Orden creada correctamente.');
      onNotificar({
        tipo: 'exito',
        titulo: 'Orden creada',
        descripcion: 'La orden se ha registrado y ya aparece en la lista.',
      });
    } catch (err) {
      setMensaje(err.message || 'No se pudo crear la orden. Revisa los datos obligatorios y vuelve a intentarlo.');
      onNotificar({
        tipo: 'error',
        titulo: 'No se pudo crear la orden',
        descripcion: err.message || 'Revisa los datos obligatorios y vuelve a intentarlo.',
      });
    }
  }

  return (
    <form
      onSubmit={enviarFormulario}
      className="space-y-4 rounded-[1.5rem] border border-white bg-white p-4 shadow-hero lg:p-5"
    >
      <div className="rounded-[1.25rem] border border-marca-100 bg-gradient-to-br from-marca-50 to-white px-4 py-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-marca-900 text-white shadow-sm">
            <Wrench className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="metric-label">Alta rápida</p>
            <h3 className="mt-2 text-base font-black tracking-tight text-sat-text">Nueva Orden de Trabajo</h3>
            <p className="mt-1 text-sm leading-6 text-sat-muted">
              Crea una orden operativa en pocos pasos con cliente, técnico y prioridad definidos desde el mismo listado.
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
          {PASOS_ALTA_RAPIDA.map((paso) => (
            <div
              key={paso.numero}
              className="surface-panel min-w-0 overflow-hidden border-marca-100 bg-gradient-to-br from-sat-surface to-white px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-marca-900 text-xs font-black tracking-[0.18em] text-white shadow-sm">
                  {paso.numero}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="metric-label">Paso {Number.parseInt(paso.numero, 10)}</p>
                  <p className="mt-2 text-sm font-black tracking-tight text-sat-text">{paso.titulo}</p>
                  <p className="mt-1 text-xs font-semibold text-sat-subtle">{paso.campos}</p>
                  <p className="mt-2 text-xs leading-5 text-sat-subtle">{paso.descripcion}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <section className="rounded-[1.25rem] border border-sat-border-soft bg-sat-surface/70 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="metric-label">Paso 1</p>
              <h4 className="mt-2 text-sm font-black tracking-tight text-sat-text">Cliente y equipo</h4>
              <p className="mt-1 text-xs leading-5 text-sat-subtle">
                Selecciona el cliente y, si procede, acota la orden al equipo correcto.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full border border-sat-border-soft bg-white px-2.5 py-1 text-[11px] font-bold text-sat-muted">
              Contexto
            </span>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            <label className="block min-w-0">
              <span className="label-base">Cliente *</span>
              <input
                value={busquedaCliente}
                onChange={(evento) => {
                  setPaginaClientes(1);
                  setBusquedaCliente(evento.target.value);
                }}
                className="input-base mb-2"
                placeholder="Buscar cliente por nombre"
                disabled={formularioDeshabilitado}
              />
              <select
                required
                name="cliente_id"
                value={formulario.cliente_id}
                onChange={(evento) => {
                  const clienteSeleccionado = clientes.find((cliente) => cliente.id === evento.target.value);
                  setFormulario((previo) => ({
                    ...previo,
                    cliente_id: evento.target.value,
                    equipo_id: '',
                  }));
                  setPaginaEquipos(1);
                  setEquipos([]);
                  setBusquedaEquipo('');
                  if (clienteSeleccionado) {
                    setBusquedaCliente(clienteSeleccionado.nombre);
                  }
                }}
                className="select-base"
                disabled={formularioDeshabilitado}
              >
                <option value="">Selecciona cliente</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nombre}
                  </option>
                ))}
              </select>
              {!!busquedaClienteDebounce && clientes.length === 0 && (
                <p className="help-message">No hay clientes que coincidan con la búsqueda.</p>
              )}
              {hayMasClientes && (
                <button
                  type="button"
                  onClick={() => setPaginaClientes((previo) => previo + 1)}
                  className="btn-secondary mt-2 w-full px-3 py-2 text-xs"
                  disabled={cargandoClientes}
                >
                  {cargandoClientes ? 'Cargando...' : 'Cargar más clientes'}
                </button>
              )}
            </label>

            <label className="block min-w-0">
              <span className="label-base">Equipo</span>
              <input
                value={busquedaEquipo}
                onChange={(evento) => {
                  setPaginaEquipos(1);
                  setBusquedaEquipo(evento.target.value);
                }}
                className="input-base mb-2"
                placeholder="Buscar equipo por nombre, marca o modelo"
                disabled={!formulario.cliente_id || formularioDeshabilitado}
              />
              <select
                name="equipo_id"
                value={formulario.equipo_id}
                onChange={(evento) => {
                  const equipoSeleccionado = equipos.find((equipo) => equipo.id === evento.target.value);
                  setFormulario((previo) => ({ ...previo, equipo_id: evento.target.value }));
                  if (equipoSeleccionado) {
                    const etiqueta = [equipoSeleccionado.nombre, equipoSeleccionado.marca, equipoSeleccionado.modelo]
                      .filter(Boolean)
                      .join(' ');
                    setBusquedaEquipo(etiqueta);
                  }
                }}
                className="select-base"
                disabled={!formulario.cliente_id || formularioDeshabilitado}
              >
                <option value="">Sin equipo</option>
                {equipos.map((equipo) => (
                  <option key={equipo.id} value={equipo.id}>
                    {equipo.nombre}
                    {equipo.marca ? ` - ${equipo.marca}` : ''}
                    {equipo.modelo ? ` ${equipo.modelo}` : ''}
                  </option>
                ))}
              </select>
              {!!busquedaEquipoDebounce && equipos.length === 0 && (
                <p className="help-message">No hay equipos que coincidan con la búsqueda.</p>
              )}
              {hayMasEquipos && (
                <button
                  type="button"
                  onClick={() => setPaginaEquipos((previo) => previo + 1)}
                  className="btn-secondary mt-2 w-full px-3 py-2 text-xs"
                  disabled={cargandoEquipos}
                >
                  {cargandoEquipos ? 'Cargando...' : 'Cargar más equipos'}
                </button>
              )}
            </label>
          </div>
        </section>

        <section className="rounded-[1.25rem] border border-sat-border-soft bg-sat-surface/70 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="metric-label">Paso 2</p>
              <h4 className="mt-2 text-sm font-black tracking-tight text-sat-text">Tecnico y tipo</h4>
              <p className="mt-1 text-xs leading-5 text-sat-subtle">
                Define el responsable y el tipo de orden para clasificarla correctamente.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full border border-sat-border-soft bg-white px-2.5 py-1 text-[11px] font-bold text-sat-muted">
              Asignacion
            </span>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            <label className="block min-w-0">
              <span className="label-base">Tecnico *</span>
              <input
                value={busquedaTecnico}
                onChange={(evento) => {
                  setPaginaTecnicos(1);
                  setBusquedaTecnico(evento.target.value);
                }}
                className="input-base mb-2"
                placeholder="Buscar tecnico por nombre o especialidad"
                disabled={formularioDeshabilitado}
              />
              <select
                required
                name="tecnico_id"
                value={formulario.tecnico_id}
                onChange={(evento) => {
                  const tecnicoSeleccionado = tecnicos.find((tecnico) => tecnico.id === evento.target.value);
                  setFormulario((previo) => ({ ...previo, tecnico_id: evento.target.value }));
                  if (tecnicoSeleccionado) {
                    const etiqueta = [tecnicoSeleccionado.nombre, tecnicoSeleccionado.especialidad]
                      .filter(Boolean)
                      .join(' ');
                    setBusquedaTecnico(etiqueta);
                  }
                }}
                className="select-base"
                disabled={formularioDeshabilitado}
              >
                <option value="">Selecciona tecnico</option>
                {tecnicos.map((tecnico) => (
                  <option key={tecnico.id} value={tecnico.id}>
                    {tecnico.nombre}
                    {tecnico.especialidad ? ` (${tecnico.especialidad})` : ''}
                  </option>
                ))}
              </select>
              {!!busquedaTecnicoDebounce && tecnicos.length === 0 && (
                <p className="help-message">No hay tecnicos que coincidan con la busqueda.</p>
              )}
              {hayMasTecnicos && (
                <button
                  type="button"
                  onClick={() => setPaginaTecnicos((previo) => previo + 1)}
                  className="btn-secondary mt-2 w-full px-3 py-2 text-xs"
                  disabled={cargandoTecnicos}
                >
                  {cargandoTecnicos ? 'Cargando...' : 'Cargar más tecnicos'}
                </button>
              )}
            </label>

            <label className="block min-w-0">
              <span className="label-base">Tipo de orden *</span>
              <select
                required
                name="tipo_orden"
                value={formulario.tipo_orden}
                onChange={(evento) => {
                  const siguiente = evento.target.value;
                  setFormulario((previo) => {
                    const defaults = {
                      averia: '',
                      montaje: 'PEM · Montaje',
                      puesta_en_marcha: 'PEM · Puesta en marcha',
                    };
                    const descripcionActual = String(previo.descripcion_averia || '');
                    const esDefaultPrevio = Object.values(defaults).includes(descripcionActual);
                    const siguienteDescripcion = esDefaultPrevio ? (defaults[siguiente] ?? descripcionActual) : descripcionActual;
                    return {
                      ...previo,
                      tipo_orden: siguiente,
                      descripcion_averia: siguienteDescripcion,
                    };
                  });
                }}
                className="select-base"
                disabled={formularioDeshabilitado}
              >
                <option value="averia">Averia</option>
                <option value="montaje">Montaje</option>
                <option value="puesta_en_marcha">Puesta en marcha</option>
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-[1.25rem] border border-sat-border-soft bg-sat-surface/70 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="metric-label">Paso 3</p>
              <h4 className="mt-2 text-sm font-black tracking-tight text-sat-text">Detalle y prioridad</h4>
              <p className="mt-1 text-xs leading-5 text-sat-subtle">
                Describe la necesidad real y marca la prioridad antes de crear la orden.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full border border-sat-border-soft bg-white px-2.5 py-1 text-[11px] font-bold text-sat-muted">
              Cierre
            </span>
          </div>
          <div className="grid gap-3">
            <label className="block min-w-0">
              <span className="label-base">
                {formulario.tipo_orden === 'averia' ? 'Descripcion de la averia *' : 'Descripcion de la orden *'}
              </span>
              <textarea
                required
                name="descripcion_averia"
                value={formulario.descripcion_averia}
                onChange={actualizarCampo}
                rows={3}
                className="input-base min-h-[112px] resize-y"
                placeholder={formulario.tipo_orden === 'averia'
                  ? 'Describe el problema detectado'
                  : 'Describe el montaje o la puesta en marcha'}
              />
            </label>

            <label className="block min-w-0">
              <span className="label-base">Prioridad</span>
              <select
                name="prioridad"
                value={formulario.prioridad}
                onChange={actualizarCampo}
                className="select-base"
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </label>
          </div>
        </section>
      </div>

      <div className="surface-panel px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="metric-label">Acción</p>
            <p className="mt-2 text-sm font-black tracking-tight text-sat-text">
              {puedeCrearOrdenes ? 'Crear y publicar en el listado' : 'Creación deshabilitada por permisos'}
            </p>
            <p className="mt-1 text-xs leading-5 text-sat-subtle">
              La orden se añadirá al listado actual y quedará lista para asignación y seguimiento.
            </p>
          </div>
          <button
            type="submit"
            disabled={accionEnCurso || formularioDeshabilitado}
            className="btn-primary w-full px-4 py-3 text-sm sm:w-auto"
          >
            {cargandoCatalogos
              ? 'Cargando catálogos...'
              : !puedeCrearOrdenes
                ? 'Sin permisos para crear órdenes'
                : accionEnCurso
                  ? 'Guardando...'
                  : 'Crear Orden'}
          </button>
        </div>
      </div>

      {mensaje && <p className="status-banner-success text-xs">{mensaje}</p>}
      {!puedeCrearOrdenes && (
        <p className="status-banner-warning text-xs">
          Tu rol técnico no permite crear órdenes nuevas.
        </p>
      )}
    </form>
  );
}

function BloqueEditarParteCompleto({ orden, accionEnCurso, onEditarParteCompleto, onNotificar }) {
  const [abierto, setAbierto] = useState(false);
  const [descripcionAveria, setDescripcionAveria] = useState(orden.descripcion || '');
  const [tareasLibre, setTareasLibre] = useState(() => {
    const texto = String(orden.tareasRealizadas || '');
    const primerBloque = texto.split('|')[0] || '';
    return primerBloque.trim();
  });
  const [materiales, setMateriales] = useState(() =>
    (Array.isArray(orden.materiales) ? orden.materiales : []).map((m) => ({
      nombre_material: m.nombre_material || m.nombre || '',
      cantidad: String(m.cantidad ?? 1),
      precio_unitario: String(m.precio_unitario ?? 0),
    })),
  );
  const [fotosActuales, setFotosActuales] = useState(() =>
    Array.isArray(orden.fotosIntervencionUrls) ? [...orden.fotosIntervencionUrls] : [],
  );
  const [mapaFotosVista, setMapaFotosVista] = useState({});
  const [fotosAEliminar, setFotosAEliminar] = useState([]);
  const [fotosNuevas, setFotosNuevas] = useState([]);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    if (!abierto) return;
    setDescripcionAveria(orden.descripcion || '');
    setTareasLibre(() => {
      const texto = String(orden.tareasRealizadas || '');
      const primerBloque = texto.split('|')[0] || '';
      return primerBloque.trim();
    });
    setMateriales(
      (Array.isArray(orden.materiales) ? orden.materiales : []).map((m) => ({
        nombre_material: m.nombre_material || m.nombre || '',
        cantidad: String(m.cantidad ?? 1),
        precio_unitario: String(m.precio_unitario ?? 0),
      })),
    );
    const refs = Array.isArray(orden.fotosIntervencionUrls) ? [...orden.fotosIntervencionUrls] : [];
    setFotosActuales(refs);
    setFotosAEliminar([]);
    setFotosNuevas([]);
    setMensaje('');
    setMapaFotosVista({});
    Promise.all(
      refs.map(async (ref) => {
        const url = await obtenerUrlFirmadaStorage(ref, { expiresIn: 900 });
        return [ref, url];
      }),
    ).then((pares) => {
      setMapaFotosVista(Object.fromEntries(pares.filter(([k]) => k)));
    }).catch(() => {});
  }, [abierto, orden.descripcion, orden.materiales, orden.fotosIntervencionUrls]);

  function alternarEliminarFoto(url) {
    setFotosAEliminar((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
    );
  }

  function actualizarMaterial(indice, campo, valor) {
    setMateriales((prev) => prev.map((m, i) => (i === indice ? { ...m, [campo]: valor } : m)));
  }

  function eliminarMaterial(indice) {
    setMateriales((prev) => prev.filter((_, i) => i !== indice));
  }

  function agregarMaterial() {
    setMateriales((prev) => [...prev, { nombre_material: '', cantidad: '1', precio_unitario: '0' }]);
  }

  function aceptarFotosNuevas(evento) {
    const archivos = Array.from(evento.target.files || []);
    setFotosNuevas((prev) => [...prev, ...archivos]);
    evento.target.value = '';
  }

  function quitarFotoNueva(indice) {
    setFotosNuevas((prev) => prev.filter((_, i) => i !== indice));
  }

  async function guardar(evento) {
    evento.preventDefault();
    setMensaje('');
    try {
      const tareasLibreTrim = String(tareasLibre || '').trim();
      await onEditarParteCompleto(orden.id, {
        descripcion_averia: descripcionAveria,
        ...(tareasLibreTrim ? { tareas_realizadas_libre: tareasLibreTrim } : {}),
        materiales: materiales.map((m) => ({
          nombre_material: m.nombre_material,
          cantidad: m.cantidad,
          precio_unitario: m.precio_unitario,
        })),
        fotos_a_eliminar: fotosAEliminar,
        fotos_nuevas: fotosNuevas,
      });
      setAbierto(false);
      setMensaje('Parte editado e informe regenerado.');
      onNotificar?.({
        tipo: 'exito',
        titulo: 'Parte actualizado',
        descripcion: 'Se guardaron los cambios y se regeneró el PDF del informe.',
      });
    } catch (err) {
      setMensaje(err.message || 'No se pudo editar el parte.');
      onNotificar?.({
        tipo: 'error',
        titulo: 'No se pudo editar el parte',
        descripcion: err.message || 'Revisa los cambios y vuelve a intentarlo.',
      });
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((p) => !p)}
        className="w-full rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-bold text-sky-800"
      >
        {abierto ? 'Cancelar edición del parte' : 'Editar parte completo (admin)'}
      </button>

      {abierto && (
        <form onSubmit={guardar} className="space-y-3 rounded-xl border border-sky-200 bg-white p-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-sat-muted">Descripción de la avería</span>
            <textarea
              rows={2}
              value={descripcionAveria}
              onChange={(e) => setDescripcionAveria(e.target.value)}
              className="w-full rounded-lg border border-sat-border px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-sat-muted">
              Tareas realizadas
            </span>
            <textarea
              rows={3}
              value={tareasLibre}
              onChange={(e) => setTareasLibre(e.target.value)}
              className="w-full rounded-lg border border-sat-border px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-[10px] text-sat-subtle">
              Los marcadores técnicos (firma, fotos…) se conservan.
            </span>
          </label>

          <fieldset className="space-y-2 rounded-lg border border-sat-border-soft p-2">
            <legend className="px-1 text-xs font-bold text-sat-muted">Materiales</legend>
            {materiales.length === 0 && (
              <p className="text-xs text-sat-subtle">Sin materiales asociados.</p>
            )}
            {materiales.map((m, i) => (
              <div key={i} className="grid grid-cols-12 gap-1">
                <input
                  type="text"
                  value={m.nombre_material}
                  onChange={(e) => actualizarMaterial(i, 'nombre_material', e.target.value)}
                  placeholder="Nombre"
                  className="col-span-6 rounded border border-sat-border px-2 py-1 text-xs"
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={m.cantidad}
                  onChange={(e) => actualizarMaterial(i, 'cantidad', e.target.value)}
                  placeholder="Cant."
                  className="col-span-2 rounded border border-sat-border px-2 py-1 text-xs"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={m.precio_unitario}
                  onChange={(e) => actualizarMaterial(i, 'precio_unitario', e.target.value)}
                  placeholder="€/u"
                  className="col-span-3 rounded border border-sat-border px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => eliminarMaterial(i)}
                  className="col-span-1 rounded bg-red-100 px-1 text-xs font-bold text-red-700"
                  title="Eliminar"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={agregarMaterial}
              className="w-full rounded-lg border border-dashed border-sat-border px-2 py-1 text-xs font-semibold text-sat-muted"
            >
              + Añadir material
            </button>
            <p className="text-[10px] text-sat-subtle">
              No se ajusta el stock de inventario al editar; solo cambia el detalle del informe.
            </p>
          </fieldset>

          <fieldset className="space-y-2 rounded-lg border border-sat-border-soft p-2">
            <legend className="px-1 text-xs font-bold text-sat-muted">Fotos del parte</legend>
            {fotosActuales.length === 0 && (
              <p className="text-xs text-sat-subtle">Sin fotos en el parte original.</p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {fotosActuales.map((url) => {
                const marcada = fotosAEliminar.includes(url);
                return (
                  <button
                    key={url}
                    type="button"
                    onClick={() => alternarEliminarFoto(url)}
                    className={`relative overflow-hidden rounded border-2 ${marcada ? 'border-red-500 opacity-50' : 'border-sat-border-soft'}`}
                  >
                    <img src={mapaFotosVista[url] || ''} alt="Foto" className="h-20 w-full object-cover" />
                    {marcada && (
                      <span className="absolute inset-0 flex items-center justify-center bg-red-500/40 text-xs font-bold text-white">
                        Eliminar
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {fotosAEliminar.length > 0 && (
              <p className="text-[11px] font-semibold text-red-700">
                {fotosAEliminar.length} foto(s) marcadas para eliminar.
              </p>
            )}
            <div className="border-t border-sat-border-soft pt-2">
              <span className="mb-1 block text-xs font-semibold text-sat-muted">Añadir fotos nuevas</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={aceptarFotosNuevas}
                className="block w-full text-xs"
              />
              {fotosNuevas.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-sat-muted">
                  {fotosNuevas.map((f, i) => (
                    <li key={i} className="flex items-center justify-between rounded bg-sat-surface-alt px-2 py-1">
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => quitarFotoNueva(i)}
                        className="ml-2 rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700"
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={accionEnCurso}
            className="w-full rounded-xl bg-sky-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {accionEnCurso ? 'Guardando y regenerando PDF...' : 'Guardar parte y regenerar informe'}
          </button>

          {mensaje && <p className="text-xs font-semibold text-sat-muted">{mensaje}</p>}
        </form>
      )}
    </>
  );
}

function TarjetaOrden({
  orden,
  tecnicosActivos,
  accionEnCurso,
  onFinalizar,
  onActualizar,
  onValorarFinalizada,
  onEditarParteCompleto,
  onEliminar,
  onNotificar,
  onIrACliente,
  onIrAParte,
  puedeEditarOrden,
  puedeValorarFinalizada,
  puedeEliminarOrden,
}) {
  const { icono: IconoEstado, clase } = estilosEstado[orden.estado] || estilosEstado.Pendiente;
  const fechaRegeneracionInforme = obtenerFechaRegeneracionDesdeUrl(orden.informePdfUrl);
  const etiquetaTipo = resolverEtiquetaTipoOrden(orden.tipoOrden);
  const etiquetaPrioridad = resolverEtiquetaPrioridad(orden.prioridad);
  const IconoTipoOrden = etiquetaTipo.icono;
  const identificadorOrden = orden.numero_ticket ? `SAT-${orden.numero_ticket}` : orden.id;
  const [mostrarEdicion, setMostrarEdicion] = useState(false);
  const [mostrarValoracion, setMostrarValoracion] = useState(false);
  const [mostrarEliminar, setMostrarEliminar] = useState(false);
  const [copiaGuardada, setCopiaGuardada] = useState(false);
  const [mensajeEdicion, setMensajeEdicion] = useState('');
  const [mensajeValoracion, setMensajeValoracion] = useState('');
  const [mensajeEliminacion, setMensajeEliminacion] = useState('');
  const [descargandoInforme, setDescargandoInforme] = useState(false);
  const [horasManoObraEditadas, setHorasManoObraEditadas] = useState(false);
  const ubicacionCliente = resolverUbicacionCliente(orden);
  const aplicaRecargoFestivoPorDefecto = typeof orden.aplicaRecargoFestivo === 'boolean'
    ? orden.aplicaRecargoFestivo
    : esFinDeSemana(orden.fechaInicioIso);
  const aplicaRecargoFueraHorarioPorDefecto = typeof orden.aplicaRecargoFueraHorario === 'boolean'
    ? orden.aplicaRecargoFueraHorario
    : detectarFueraHorario(orden.fechaInicioIso, orden.fechaFinIso);
  const [formularioEdicion, setFormularioEdicion] = useState({
    tecnico_id: orden.tecnicoId || '',
    prioridad: orden.prioridad || 'media',
    estado: orden.estado === 'En Proceso' ? 'en_proceso' : orden.estado === 'Pausado' ? 'pausado' : 'pendiente',
  });
  const [formularioValoracion, setFormularioValoracion] = useState({
    coste_materiales_editable: Number(orden.costeMaterialesEditable || orden.costeMateriales || 0).toFixed(2),
    tarifa_mano_obra_hora: Number(orden.tarifaManoObraHora || 0).toFixed(2),
    horas_mano_obra: Number(orden.horasManoObra || 0).toFixed(2),
    mecanicos_intervinieron: String(orden.mecanicosIntervinieron ?? 1),
    fecha_inicio: isoADatetimeLocal(orden.fechaInicioIso),
    fecha_fin: isoADatetimeLocal(orden.fechaFinIso),
    tarifa_desplazamiento_km: Number(orden.tarifaDesplazamientoKm || 0).toFixed(2),
    km_desplazamiento_facturables: Number(orden.kmDesplazamientoFacturables || 0).toFixed(2),
    recargo_festivo_pct: Number(orden.recargoFestivoPct ?? 25).toFixed(2),
    recargo_fuera_horario_pct: Number(orden.recargoFueraHorarioPct ?? 20).toFixed(2),
    aplica_recargo_festivo: aplicaRecargoFestivoPorDefecto,
    aplica_recargo_fuera_horario: aplicaRecargoFueraHorarioPorDefecto,
  });

  useEffect(() => {
    setFormularioEdicion({
      tecnico_id: orden.tecnicoId || '',
      prioridad: orden.prioridad || 'media',
      estado: orden.estado === 'En Proceso' ? 'en_proceso' : orden.estado === 'Pausado' ? 'pausado' : 'pendiente',
    });
  }, [orden.estado, orden.prioridad, orden.tecnicoId]);

  useEffect(() => {
    setHorasManoObraEditadas(false);
    const siguienteAplicaRecargoFestivo = typeof orden.aplicaRecargoFestivo === 'boolean'
      ? orden.aplicaRecargoFestivo
      : esFinDeSemana(orden.fechaInicioIso);
    const siguienteAplicaRecargoFueraHorario = typeof orden.aplicaRecargoFueraHorario === 'boolean'
      ? orden.aplicaRecargoFueraHorario
      : detectarFueraHorario(orden.fechaInicioIso, orden.fechaFinIso);

    setFormularioValoracion({
      coste_materiales_editable: Number(orden.costeMaterialesEditable || orden.costeMateriales || 0).toFixed(2),
      tarifa_mano_obra_hora: Number(orden.tarifaManoObraHora || 0).toFixed(2),
      horas_mano_obra: Number(orden.horasManoObra || 0).toFixed(2),
      mecanicos_intervinieron: String(orden.mecanicosIntervinieron ?? 1),
      fecha_inicio: isoADatetimeLocal(orden.fechaInicioIso),
      fecha_fin: isoADatetimeLocal(orden.fechaFinIso),
      tarifa_desplazamiento_km: Number(orden.tarifaDesplazamientoKm || 0).toFixed(2),
      km_desplazamiento_facturables: Number(orden.kmDesplazamientoFacturables || 0).toFixed(2),
      recargo_festivo_pct: Number(orden.recargoFestivoPct ?? 25).toFixed(2),
      recargo_fuera_horario_pct: Number(orden.recargoFueraHorarioPct ?? 20).toFixed(2),
      aplica_recargo_festivo: siguienteAplicaRecargoFestivo,
      aplica_recargo_fuera_horario: siguienteAplicaRecargoFueraHorario,
    });
  }, [
    orden.costeMateriales,
    orden.costeMaterialesEditable,
    orden.tarifaManoObraHora,
    orden.horasManoObra,
    orden.tarifaDesplazamientoKm,
    orden.kmDesplazamientoFacturables,
    orden.recargoFestivoPct,
    orden.recargoFueraHorarioPct,
    orden.aplicaRecargoFestivo,
    orden.aplicaRecargoFueraHorario,
    orden.fechaInicioIso,
    orden.fechaFinIso,
  ]);

  async function guardarEdicion(evento) {
    evento.preventDefault();
    setMensajeEdicion('');

    try {
      await onActualizar(orden.id, formularioEdicion);
      setMostrarEdicion(false);
      setMensajeEdicion('Orden actualizada correctamente.');
      onNotificar({
        tipo: 'exito',
        titulo: 'Orden actualizada',
        descripcion: 'Se han guardado el técnico, el estado y la prioridad.',
      });
    } catch (err) {
      setMensajeEdicion(err.message || 'No se pudo actualizar la orden.');
      onNotificar({
        tipo: 'error',
        titulo: 'No se pudo actualizar la orden',
        descripcion: err.message || 'Revisa los cambios y vuelve a intentarlo.',
      });
    }
  }

  async function guardarValoracion(evento) {
    evento.preventDefault();
    setMensajeValoracion('');

    try {
      const inicio = String(formularioValoracion.fecha_inicio || '').trim();
      const fin = String(formularioValoracion.fecha_fin || '').trim();
      if ((inicio && !fin) || (!inicio && fin)) {
        setMensajeValoracion('Debes indicar inicio y fin de intervención.');
        return;
      }
      const payload = { ...formularioValoracion };
      if (!horasManoObraEditadas) {
        delete payload.horas_mano_obra;
      }
      if (inicio && fin) {
        const iniIso = datetimeLocalAIso(inicio);
        const finIso = datetimeLocalAIso(fin);
        if (!iniIso || !finIso) {
          setMensajeValoracion('El formato de fecha/hora de intervención no es válido.');
          return;
        }
        payload.fecha_inicio = iniIso;
        payload.fecha_fin = finIso;
      }
      await onValorarFinalizada(orden.id, payload);
      setMostrarValoracion(false);
      setMensajeValoracion('Valoración guardada e informe regenerado correctamente.');
      onNotificar({
        tipo: 'exito',
        titulo: 'Valoración actualizada',
        descripcion: 'Se actualizaron importes y se regeneró el informe PDF de la orden.',
      });
    } catch (err) {
      setMensajeValoracion(err.message || 'No se pudo guardar la valoración.');
      onNotificar({
        tipo: 'error',
        titulo: 'No se pudo actualizar la valoración',
        descripcion: err.message || 'Revisa los importes y vuelve a intentarlo.',
      });
    }
  }

  function descargarCopiaJsonOrden() {
    const payload = {
      generadoEn: new Date().toISOString(),
      orden,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `copia-orden-${orden.numero_ticket || orden.id}.json`;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(url);
  }

  async function descargarInformePdf() {
    if (!orden.informePdfUrl || descargandoInforme) {
      return;
    }
    setDescargandoInforme(true);
    try {
      const url = await obtenerUrlFirmadaStorage(orden.informePdfUrl, { expiresIn: 900 });
      if (!url) {
        throw new Error('No se pudo obtener el enlace del informe.');
      }
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.target = '_blank';
      enlace.rel = 'noreferrer';
      enlace.download = `informe-${orden.numero_ticket || orden.id}.pdf`;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
    } catch (err) {
      onNotificar?.({
        tipo: 'error',
        titulo: 'No se pudo descargar el informe',
        descripcion: err?.message || 'Inténtalo de nuevo en unos segundos.',
      });
    } finally {
      setDescargandoInforme(false);
    }
  }

  async function confirmarEliminacion() {
    setMensajeEliminacion('');
    try {
      await onEliminar(orden.id);
      setMostrarEliminar(false);
      setCopiaGuardada(false);
      onNotificar({
        tipo: 'exito',
        titulo: 'Orden eliminada',
        descripcion: `La orden ${orden.numero_ticket ? `SAT-${orden.numero_ticket}` : orden.id} fue eliminada correctamente.`,
      });
    } catch (err) {
      setMensajeEliminacion(err.message || 'No se pudo eliminar la orden.');
      onNotificar({
        tipo: 'error',
        titulo: 'No se pudo eliminar la orden',
        descripcion: err.message || 'Inténtalo de nuevo en unos segundos.',
      });
    }
  }

  function alternarEliminar() {
    setMostrarEliminar((previo) => !previo);
    setMensajeEliminacion('');
    setCopiaGuardada(false);
  }

  const costeManoObraBasePreview = Number(formularioValoracion.tarifa_mano_obra_hora || 0)
    * Number(formularioValoracion.horas_mano_obra || 0)
    * Math.max(1, Number.parseInt(formularioValoracion.mecanicos_intervinieron || '1', 10) || 1);
  const porcentajeRecargoManoObraPreview = (formularioValoracion.aplica_recargo_festivo
    ? Number(formularioValoracion.recargo_festivo_pct || 0)
    : 0)
    + (formularioValoracion.aplica_recargo_fuera_horario
      ? Number(formularioValoracion.recargo_fuera_horario_pct || 0)
      : 0);
  const recargoManoObraEurosPreview = costeManoObraBasePreview * (porcentajeRecargoManoObraPreview / 100);
  const costeManoObraPreview = costeManoObraBasePreview + recargoManoObraEurosPreview;
  const costeDesplazamientoPreview = Number(formularioValoracion.tarifa_desplazamiento_km || 0)
    * Number(formularioValoracion.km_desplazamiento_facturables || 0);
  const costeTotalPreview = Number(formularioValoracion.coste_materiales_editable || 0)
    + costeManoObraPreview
    + costeDesplazamientoPreview;

  return (
    <article className="overflow-hidden rounded-[1.45rem] border border-white bg-white p-4 shadow-suave transition hover:-translate-y-0.5 hover:shadow-lift">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="rounded-[1.2rem] border border-sat-border-soft bg-gradient-to-r from-sat-surface to-white px-3 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-sat-subtle">
                {identificadorOrden}
              </p>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${etiquetaTipo.clase}`}>
                <IconoTipoOrden className="h-3.5 w-3.5" />
                {etiquetaTipo.texto}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${etiquetaPrioridad.clase}`}>
                <Flag className="h-3.5 w-3.5" />
                {etiquetaPrioridad.texto}
              </span>
            </div>
            <h3 className="mt-2 truncate text-lg font-black tracking-tight text-sat-text">{orden.equipo}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-sat-muted">
              <span className="inline-flex items-center rounded-full border border-sat-border-soft bg-white px-2.5 py-1">
                Cliente: {orden.cliente || 'Sin cliente'}
              </span>
              <span className="inline-flex items-center rounded-full border border-sat-border-soft bg-white px-2.5 py-1">
                Fecha: {orden.fecha || 'Sin fecha'}
              </span>
            </div>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${clase}`}>
          <IconoEstado className="h-4 w-4" />
          {orden.estado}
        </span>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <div className="surface-panel flex items-start gap-3 px-3 py-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-marca-50 text-marca-700">
            <UserRound className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="metric-label">Cliente</p>
            <p className="mt-1 truncate text-sm font-bold text-sat-text">{orden.cliente}</p>
          </div>
        </div>
        <div className="surface-panel flex items-start gap-3 px-3 py-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-marca-50 text-marca-700">
            <UserRound className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="metric-label">Técnico</p>
            <p className="mt-1 truncate text-sm font-bold text-sat-text">{orden.tecnico || 'Sin técnico asignado'}</p>
          </div>
        </div>
        <div className="surface-panel flex items-start gap-3 px-3 py-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-marca-50 text-marca-700">
            <CalendarClock className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="metric-label">Fecha</p>
            <p className="mt-1 truncate text-sm font-bold text-sat-text">{orden.fecha || 'Sin fecha'}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3 text-sm text-sat-muted">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <p className="min-w-0 flex-1 rounded-2xl border border-sat-border-soft bg-sat-surface px-3 py-3">
            <span className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-sat-subtle">
              <MapPinned className="h-3.5 w-3.5" />
              Dirección
            </span>
            {ubicacionCliente.direccion || (ubicacionCliente.tieneUbicacion ? 'Ubicación registrada' : 'Sin ubicación')}
          </p>
          <button
            type="button"
            onClick={() => onIrACliente(orden)}
            disabled={!ubicacionCliente.tieneUbicacion}
            className="btn-secondary inline-flex shrink-0 items-center justify-center rounded-2xl border-marca-200 bg-marca-50 px-4 py-3 text-xs font-bold text-marca-800 disabled:opacity-60"
          >
            Ir
          </button>
        </div>
        {orden.estado !== 'Finalizado' && (
          <p className="rounded-2xl border border-sat-border-soft bg-white px-3 py-3 shadow-sm">
            <span className="mb-1 block text-xs font-bold uppercase tracking-[0.18em] text-sat-subtle">
              {orden.tipoOrden === 'averia' ? 'Descripción de avería' : 'Descripción de orden'}
            </span>
            {orden.descripcion}
          </p>
        )}
      </div>

      {orden.estado !== 'Finalizado' && (
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-marca-100 bg-gradient-to-r from-marca-50 to-white px-3 py-3 text-xs font-semibold text-marca-700">
          <span className="inline-flex items-center gap-2">
            <Flag className="h-4 w-4" />
            Prioridad actual: {etiquetaPrioridad.texto}
          </span>
          <span>{orden.fecha}</span>
        </div>
      )}

      {orden.estado === 'Finalizado' && (
        <div className="mt-3 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {orden.informePdfUrl && (
            <button
              type="button"
              onClick={descargarInformePdf}
              disabled={descargandoInforme}
              className="inline-flex rounded-lg bg-marca-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {descargandoInforme ? 'Generando enlace...' : 'Descargar informe PDF'}
            </button>
          )}
          {!orden.informePdfUrl && (
            <p className="text-xs font-semibold text-emerald-800">
              Informe PDF pendiente: el administrador debe completar la valoración económica para generarlo.
            </p>
          )}

          {puedeValorarFinalizada && (
            <>
              <button
                type="button"
                onClick={() => {
                  setMostrarValoracion((previo) => !previo);
                  setMensajeValoracion('');
                }}
                className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-800"
              >
                {mostrarValoracion ? 'Cancelar valoración' : 'Editar valoración y regenerar informe'}
              </button>

              {mostrarValoracion && (
                <form onSubmit={guardarValoracion} className="space-y-2 rounded-xl border border-emerald-200 bg-white p-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-sat-muted">Materiales (€)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formularioValoracion.coste_materiales_editable}
                      onChange={(evento) => setFormularioValoracion((previo) => ({ ...previo, coste_materiales_editable: evento.target.value }))}
                      className="w-full rounded-lg border border-sat-border px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-sat-muted">Tarifa mano de obra (€/h)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formularioValoracion.tarifa_mano_obra_hora}
                      onChange={(evento) => setFormularioValoracion((previo) => ({ ...previo, tarifa_mano_obra_hora: evento.target.value }))}
                      className="w-full rounded-lg border border-sat-border px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-sat-muted">Horas mano de obra</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formularioValoracion.horas_mano_obra}
                      onChange={(evento) => {
                        setHorasManoObraEditadas(true);
                        setFormularioValoracion((previo) => ({ ...previo, horas_mano_obra: evento.target.value }));
                      }}
                      className="w-full rounded-lg border border-sat-border px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-sat-muted">Mecánicos</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={formularioValoracion.mecanicos_intervinieron}
                      onChange={(evento) => setFormularioValoracion((previo) => ({ ...previo, mecanicos_intervinieron: evento.target.value }))}
                      className="w-full rounded-lg border border-sat-border px-3 py-2 text-sm"
                    />
                  </label>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-sat-muted">Inicio intervención</span>
                      <input
                        type="datetime-local"
                        value={formularioValoracion.fecha_inicio}
                        onChange={(evento) =>
                          setFormularioValoracion((previo) => {
                            const siguiente = { ...previo, fecha_inicio: evento.target.value };
                            const horas = horasManoObraDesdeIntervencionDatetimeLocal(
                              siguiente.fecha_inicio,
                              siguiente.fecha_fin,
                            );
                            if (horas != null) {
                              siguiente.horas_mano_obra = horas;
                            }
                            return siguiente;
                          })
                        }
                        className="w-full rounded-lg border border-sat-border px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-sat-muted">Fin intervención</span>
                      <input
                        type="datetime-local"
                        value={formularioValoracion.fecha_fin}
                        onChange={(evento) =>
                          setFormularioValoracion((previo) => {
                            const siguiente = { ...previo, fecha_fin: evento.target.value };
                            const horas = horasManoObraDesdeIntervencionDatetimeLocal(
                              siguiente.fecha_inicio,
                              siguiente.fecha_fin,
                            );
                            if (horas != null) {
                              siguiente.horas_mano_obra = horas;
                            }
                            return siguiente;
                          })
                        }
                        className="w-full rounded-lg border border-sat-border px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-sat-muted">Tarifa desplazamiento (€/km)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formularioValoracion.tarifa_desplazamiento_km}
                      onChange={(evento) => setFormularioValoracion((previo) => ({ ...previo, tarifa_desplazamiento_km: evento.target.value }))}
                      className="w-full rounded-lg border border-sat-border px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-sat-muted">Km desplazamiento facturables</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formularioValoracion.km_desplazamiento_facturables}
                      onChange={(evento) => setFormularioValoracion((previo) => ({ ...previo, km_desplazamiento_facturables: evento.target.value }))}
                      className="w-full rounded-lg border border-sat-border px-3 py-2 text-sm"
                    />
                  </label>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                    <p className="font-semibold">Recargos mano de obra</p>
                    <p>Horario estándar: 08:00 - 18:00</p>
                  </div>

                  <label className="flex items-center gap-2 rounded-lg border border-sat-border-soft bg-sat-surface px-3 py-2 text-xs font-semibold text-sat-muted">
                    <input
                      type="checkbox"
                      checked={Boolean(formularioValoracion.aplica_recargo_festivo)}
                      onChange={(evento) => setFormularioValoracion((previo) => ({ ...previo, aplica_recargo_festivo: evento.target.checked }))}
                    />
                    Aplicar recargo por festivo
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-sat-muted">Recargo festivo (%)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formularioValoracion.recargo_festivo_pct}
                      onChange={(evento) => setFormularioValoracion((previo) => ({ ...previo, recargo_festivo_pct: evento.target.value }))}
                      className="w-full rounded-lg border border-sat-border px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="flex items-center gap-2 rounded-lg border border-sat-border-soft bg-sat-surface px-3 py-2 text-xs font-semibold text-sat-muted">
                    <input
                      type="checkbox"
                      checked={Boolean(formularioValoracion.aplica_recargo_fuera_horario)}
                      onChange={(evento) => setFormularioValoracion((previo) => ({ ...previo, aplica_recargo_fuera_horario: evento.target.checked }))}
                    />
                    Aplicar recargo fuera de horario (08:00-18:00)
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-sat-muted">Recargo fuera de horario (%)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formularioValoracion.recargo_fuera_horario_pct}
                      onChange={(evento) => setFormularioValoracion((previo) => ({ ...previo, recargo_fuera_horario_pct: evento.target.value }))}
                      className="w-full rounded-lg border border-sat-border px-3 py-2 text-sm"
                    />
                  </label>

                  <div className="rounded-lg border border-sat-border-soft bg-sat-surface p-2 text-xs text-sat-muted">
                    <p>Mano de obra base: {costeManoObraBasePreview.toFixed(2)} €</p>
                    <p>Recargo mano de obra ({porcentajeRecargoManoObraPreview.toFixed(2)}%): {recargoManoObraEurosPreview.toFixed(2)} €</p>
                    <p>Mano de obra total: {costeManoObraPreview.toFixed(2)} €</p>
                    <p>Desplazamiento: {costeDesplazamientoPreview.toFixed(2)} €</p>
                    <p className="font-bold">Total: {costeTotalPreview.toFixed(2)} €</p>
                  </div>

                  <button
                    type="submit"
                    disabled={accionEnCurso}
                    className="w-full rounded-xl bg-marca-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {accionEnCurso ? 'Guardando y regenerando...' : 'Guardar valoración y regenerar informe'}
                  </button>

                  {mensajeValoracion && <p className="text-xs font-semibold text-sat-muted">{mensajeValoracion}</p>}
                </form>
              )}
            </>
          )}

          {puedeValorarFinalizada && (
            <BloqueEditarParteCompleto
              orden={orden}
              accionEnCurso={accionEnCurso}
              onEditarParteCompleto={onEditarParteCompleto}
              onNotificar={onNotificar}
            />
          )}

          {puedeEliminarOrden && (
            <BloqueEliminarOrden
              orden={orden}
              mostrarEliminar={mostrarEliminar}
              copiaGuardada={copiaGuardada}
              accionEnCurso={accionEnCurso}
              mensajeEliminacion={mensajeEliminacion}
              onAlternarEliminar={alternarEliminar}
              onDescargarCopiaJsonOrden={descargarCopiaJsonOrden}
              onCambiarCopiaGuardada={setCopiaGuardada}
              onConfirmarEliminacion={confirmarEliminacion}
              claseBotonToggle="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-bold text-rose-700"
            />
          )}
        </div>
      )}

      {orden.estado !== 'Finalizado' && (
        <div className="mt-3 space-y-2">
          <div className="rounded-[1.2rem] border border-sat-border-soft bg-gradient-to-r from-white to-sat-surface px-3 py-3 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sat-subtle">Acciones operativas</p>
                <p className="mt-1 text-sm font-black tracking-tight text-sat-text">Gestiona la orden directamente desde el listado</p>
              </div>
              <span className="inline-flex items-center rounded-full border border-sat-border-soft bg-white px-2.5 py-1 text-[11px] font-bold text-sat-muted">
                {identificadorOrden}
              </span>
            </div>
            <div className={`grid gap-2 ${puedeEditarOrden ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
              {puedeEditarOrden && (
                <button
                  type="button"
                  onClick={() => {
                    setMostrarEdicion((previo) => !previo);
                    setMensajeEdicion('');
                  }}
                  className="btn-secondary w-full rounded-2xl px-4 py-3 text-sm"
                >
                  {mostrarEdicion ? 'Cancelar edición' : 'Editar orden'}
                </button>
              )}
              <button
                type="button"
                onClick={() => onIrAParte(orden)}
                className="btn-secondary w-full rounded-2xl border-marca-300 bg-marca-50 px-4 py-3 text-sm text-marca-800"
              >
                Ir a parte
              </button>
              <button
                type="button"
                onClick={() => onIrAParte(orden)}
                className="btn-primary w-full rounded-2xl px-4 py-3 text-sm"
              >
                Finalizar con informe
              </button>
            </div>
          </div>

          {mostrarEdicion && puedeEditarOrden && (
            <form onSubmit={guardarEdicion} className="space-y-2 rounded-xl border border-marca-100 bg-marca-50 p-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-sat-muted">Técnico *</span>
                <select
                  required
                  value={formularioEdicion.tecnico_id}
                  onChange={(evento) =>
                    setFormularioEdicion((previo) => ({ ...previo, tecnico_id: evento.target.value }))
                  }
                  className="w-full rounded-lg border border-sat-border px-3 py-2 text-sm"
                >
                  <option value="">Selecciona técnico</option>
                  {tecnicosActivos.map((tecnico) => (
                    <option key={tecnico.id} value={tecnico.id}>
                      {tecnico.nombre}
                      {tecnico.especialidad ? ` (${tecnico.especialidad})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-sat-muted">Estado</span>
                <select
                  value={formularioEdicion.estado}
                  onChange={(evento) =>
                    setFormularioEdicion((previo) => ({ ...previo, estado: evento.target.value }))
                  }
                  className="w-full rounded-lg border border-sat-border px-3 py-2 text-sm"
                >
                  {OPCIONES_ESTADO_EDITABLE.map((opcion) => (
                    <option key={opcion.value} value={opcion.value}>
                      {opcion.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-sat-muted">Prioridad</span>
                <select
                  value={formularioEdicion.prioridad}
                  onChange={(evento) =>
                    setFormularioEdicion((previo) => ({ ...previo, prioridad: evento.target.value }))
                  }
                  className="w-full rounded-lg border border-sat-border px-3 py-2 text-sm"
                >
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </label>

              <button
                type="submit"
                disabled={accionEnCurso}
                className="w-full rounded-xl bg-marca-900 px-4 py-3 text-sm font-bold text-white active:scale-95 disabled:opacity-60"
              >
                {accionEnCurso ? 'Guardando cambios...' : 'Guardar cambios'}
              </button>

              {mensajeEdicion && <p className="text-xs font-semibold text-sat-muted">{mensajeEdicion}</p>}
            </form>
          )}

          {puedeEliminarOrden && (
            <BloqueEliminarOrden
              orden={orden}
              mostrarEliminar={mostrarEliminar}
              copiaGuardada={copiaGuardada}
              accionEnCurso={accionEnCurso}
              mensajeEliminacion={mensajeEliminacion}
              onAlternarEliminar={alternarEliminar}
              onDescargarCopiaJsonOrden={descargarCopiaJsonOrden}
              onDescargarInformePdf={descargarInformePdf}
              onCambiarCopiaGuardada={setCopiaGuardada}
              onConfirmarEliminacion={confirmarEliminacion}
              claseBotonToggle="w-full rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 active:scale-95"
            />
          )}

        </div>
      )}
    </article>
  );
}

function BloqueEliminarOrden({
  orden,
  mostrarEliminar,
  copiaGuardada,
  accionEnCurso,
  mensajeEliminacion,
  onAlternarEliminar,
  onDescargarCopiaJsonOrden,
  onDescargarInformePdf,
  onCambiarCopiaGuardada,
  onConfirmarEliminacion,
  claseBotonToggle,
}) {
  return (
    <>
      <button
        type="button"
        onClick={onAlternarEliminar}
        className={claseBotonToggle}
      >
        {mostrarEliminar ? 'Cancelar eliminación' : 'Eliminar orden (admin)'}
      </button>

      {mostrarEliminar && (
        <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
          <p className="font-semibold">Antes de eliminar, guarda una copia del informe o de la orden.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onDescargarCopiaJsonOrden}
              className="rounded-lg border border-rose-300 bg-white px-3 py-2 font-bold text-rose-700"
            >
              Descargar copia JSON
            </button>
            <button
              type="button"
              onClick={onDescargarInformePdf}
              disabled={!orden.informePdfUrl || accionEnCurso}
              className={`inline-flex items-center justify-center rounded-lg border px-3 py-2 font-bold ${orden.informePdfUrl ? 'border-rose-300 bg-white text-rose-700' : 'border-sat-border bg-sat-surface-alt text-sat-faint pointer-events-none'}`}
            >
              Descargar informe PDF
            </button>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 font-semibold text-rose-800">
            <input
              type="checkbox"
              checked={copiaGuardada}
              onChange={(evento) => onCambiarCopiaGuardada(evento.target.checked)}
            />
            Confirmo que ya guardé copia antes de eliminar.
          </label>
          <button
            type="button"
            onClick={onConfirmarEliminacion}
            disabled={accionEnCurso || !copiaGuardada}
            className="w-full rounded-lg bg-rose-600 px-3 py-2 font-bold text-white disabled:opacity-60"
          >
            {accionEnCurso ? 'Eliminando...' : 'Eliminar definitivamente'}
          </button>
          {mensajeEliminacion && <p className="font-semibold text-rose-700">{mensajeEliminacion}</p>}
        </div>
      )}
    </>
  );
}

export function ListaOrdenesView({ rolUsuario }) {
  const navigate = useNavigate();
  const [tecnicosActivos, setTecnicosActivos] = useState([]);
  const [toast, setToast] = useState(null);
  const [modalNavAbierto, setModalNavAbierto] = useState(false);
  const [appsNavDisponibles, setAppsNavDisponibles] = useState([]);
  const [destinoNavPendiente, setDestinoNavPendiente] = useState(null);
  const [exportandoZip, setExportandoZip] = useState(false);
  const [filtroClienteAnalisis, setFiltroClienteAnalisis] = useState('todos');
  const [filtroTipoOrden, setFiltroTipoOrden] = useState('todos');
  const [busquedaOrdenes, setBusquedaOrdenes] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);
  const busquedaOrdenesDebounce = useDebounce(busquedaOrdenes, 200);
  const {
    ordenes,
    ordenesFiltradas,
    cargando,
    error,
    accionEnCurso,
    filtroEstado,
    setFiltroEstado,
    crearOrdenDesdeFormulario,
    finalizarOrden,
    actualizarOrden,
    actualizarValoracionFinalizada,
    editarParteCompleto,
    eliminarOrden,
  } = useOrdenes();

  useEffect(() => {
    async function cargarTecnicosEdicion() {
      if (!tieneConfiguracionSupabase() || rolUsuario === 'tecnico') {
        setTecnicosActivos([]);
        return;
      }

      try {
        const respuesta = await obtenerTecnicosActivos({ limite: 100, pagina: 1 });
        setTecnicosActivos(respuesta.items);
      } catch {
        setTecnicosActivos([]);
      }
    }

    cargarTecnicosEdicion();
  }, [rolUsuario]);

  function notificar(siguienteToast) {
    setToast({
      id: Date.now(),
      ...siguienteToast,
    });
  }

  function cerrarModalNavegacion() {
    setModalNavAbierto(false);
    setAppsNavDisponibles([]);
    setDestinoNavPendiente(null);
  }

  const clientesAnalisis = useMemo(() => {
    const mapa = new Map();
    ordenes.forEach((orden) => {
      const id = orden.clienteId || '';
      const nombre = orden.cliente || 'Cliente sin nombre';
      if (id && !mapa.has(id)) {
        mapa.set(id, nombre);
      }
    });

    return Array.from(mapa.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-ES'));
  }, [ordenes]);

  useEffect(() => {
    if (filtroClienteAnalisis === 'todos') {
      return;
    }

    const existeCliente = clientesAnalisis.some((cliente) => cliente.id === filtroClienteAnalisis);
    if (!existeCliente) {
      setFiltroClienteAnalisis('todos');
    }
  }, [clientesAnalisis, filtroClienteAnalisis]);

  useEffect(() => {
    setPaginaActual(1);
  }, [filtroEstado, filtroTipoOrden, ordenes.length, busquedaOrdenesDebounce]);

  const ordenesFiltradasPorTipo = useMemo(() => {
    if (filtroTipoOrden === 'todos') {
      return ordenesFiltradas;
    }

    if (filtroTipoOrden === 'pem') {
      return ordenesFiltradas.filter((orden) => ['montaje', 'puesta_en_marcha'].includes(orden.tipoOrden));
    }

    if (filtroTipoOrden === 'averia') {
      return ordenesFiltradas.filter((orden) => !orden.tipoOrden || orden.tipoOrden === 'averia');
    }

    return ordenesFiltradas.filter((orden) => orden.tipoOrden === filtroTipoOrden);
  }, [filtroTipoOrden, ordenesFiltradas]);

  const ordenesAnalisis = filtroClienteAnalisis === 'todos'
    ? ordenesFiltradasPorTipo
    : ordenesFiltradasPorTipo.filter((orden) => orden.clienteId === filtroClienteAnalisis);

  const resumenAnalisis = ordenesAnalisis.reduce(
    (acc, orden) => {
      acc[orden.estado] = (acc[orden.estado] || 0) + 1;
      return acc;
    },
    { Pendiente: 0, 'En Proceso': 0, Pausado: 0, Finalizado: 0 },
  );
  const contadoresEstado = {
    Todas: ordenesAnalisis.length,
    Pendiente: resumenAnalisis.Pendiente,
    'En Proceso': resumenAnalisis['En Proceso'],
    Pausado: resumenAnalisis.Pausado,
    Finalizado: resumenAnalisis.Finalizado,
  };
  const nombreClienteAnalisis = filtroClienteAnalisis === 'todos'
    ? 'Todos los clientes'
    : clientesAnalisis.find((cliente) => cliente.id === filtroClienteAnalisis)?.nombre || 'Cliente no disponible';

  const ordenesFinalizadas = ordenesAnalisis.filter((orden) => orden.estado === 'Finalizado');
  const informesDisponibles = ordenesFinalizadas.filter((orden) => orden.informePdfUrl).length;
  const terminoBusqueda = busquedaOrdenesDebounce.trim().toLowerCase();
  const ordenesListado = terminoBusqueda
    ? ordenesFiltradasPorTipo.filter((orden) => {
      const campos = [
        orden.numero_ticket,
        orden.cliente,
        orden.equipo,
        orden.tecnico,
        orden.descripcion,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return campos.includes(terminoBusqueda);
    })
    : ordenesFiltradasPorTipo;
  const totalOrdenesFiltradas = ordenesListado.length;
  const totalPaginas = Math.max(1, Math.ceil(totalOrdenesFiltradas / ORDENES_POR_PAGINA));
  const paginaSegura = Math.min(paginaActual, totalPaginas);
  const ordenesPaginadas = ordenesListado.slice((paginaSegura - 1) * ORDENES_POR_PAGINA, paginaSegura * ORDENES_POR_PAGINA);
  const primerElementoPagina = totalOrdenesFiltradas ? ((paginaSegura - 1) * ORDENES_POR_PAGINA) + 1 : 0;
  const ultimoElementoPagina = totalOrdenesFiltradas
    ? Math.min(primerElementoPagina + ordenesPaginadas.length - 1, totalOrdenesFiltradas)
    : 0;
  const esTecnico = rolUsuario === 'tecnico';
  const puedeCrearOrdenes = rolUsuario !== 'tecnico';
  const puedeEditarOrden = rolUsuario !== 'tecnico';
  const puedeValorarFinalizada = rolUsuario === 'admin';
  const puedeEliminarOrden = rolUsuario === 'admin';
  const mttrMinutos = ordenesFinalizadas.length
    ? Math.round(
      ordenesFinalizadas.reduce((acc, orden) => acc + Number(orden.tiempoEmpleadoMinutos || 0), 0)
        / ordenesFinalizadas.length,
    )
    : 0;
  const cumplimientoSla48h = ordenesFinalizadas.length
    ? Math.round(
      (ordenesFinalizadas.filter((orden) => {
        const inicio = orden.fechaInicioIso ? new Date(orden.fechaInicioIso).getTime() : NaN;
        const fin = orden.fechaFinIso ? new Date(orden.fechaFinIso).getTime() : NaN;
        if (!Number.isFinite(inicio) || !Number.isFinite(fin)) return false;
        const horas = (fin - inicio) / (1000 * 60 * 60);
        return horas <= 48;
      }).length / ordenesFinalizadas.length) * 100,
    )
    : 0;
  const firstTimeFixProxy = ordenesAnalisis.length
    ? Math.round((ordenesFinalizadas.length / ordenesAnalisis.length) * 100)
    : 0;
  const costeTotalMateriales = ordenesFinalizadas
    .reduce((acc, orden) => acc + Number(orden.costeMateriales || 0), 0)
    .toFixed(2);

  function irAParteDesdeOrden(orden) {
    const ruta = orden.tipoOrden && orden.tipoOrden !== 'averia' ? '/parte-pem' : '/parte';
    navigate(ruta, {
      state: {
        prefill: {
          orden_id: orden.id,
          cliente_id: orden.clienteId || '',
          equipo_id: orden.equipoId || '',
          tecnico_id: orden.tecnicoId || '',
          tipo_orden: orden.tipoOrden || 'averia',
          descripcion_problema: orden.descripcion || '',
          prioridad: orden.prioridad || 'media',
          numero_ticket: orden.numero_ticket || '',
        },
      },
    });
  }

  async function irAClienteDesdeOrden(orden) {
    const ubicacion = resolverUbicacionCliente(orden);

    if (!ubicacion.tieneUbicacion) {
      notificar({
        tipo: 'error',
        titulo: 'Cliente sin ubicación',
      });
      return;
    }

    try {
      const pref = await getPreferenciaNav();
      const disponibles = await getAppsNavegacionDisponibles();

      if (pref && disponibles.includes(pref)) {
        await navegarA(ubicacion.lat, ubicacion.lng, ubicacion.direccion, pref);
        return;
      }

      setDestinoNavPendiente(ubicacion);
      setAppsNavDisponibles(disponibles);
      setModalNavAbierto(true);
    } catch (err) {
      notificar({
        tipo: 'error',
        titulo: 'No se pudo abrir la navegación',
        descripcion: err.message || 'Inténtalo de nuevo en unos segundos.',
      });
    }
  }

  async function seleccionarAppNavegacion(app, recordar) {
    if (!destinoNavPendiente) {
      cerrarModalNavegacion();
      return;
    }

    try {
      if (recordar) {
        await guardarPreferenciaNav(app);
      }
      await navegarA(
        destinoNavPendiente.lat,
        destinoNavPendiente.lng,
        destinoNavPendiente.direccion,
        app,
      );
      cerrarModalNavegacion();
    } catch (err) {
      notificar({
        tipo: 'error',
        titulo: 'No se pudo abrir la navegación',
        descripcion: err.message || 'Inténtalo de nuevo en unos segundos.',
      });
    }
  }

  async function exportarOrdenesExcel() {
    try {
      const filas = ordenesAnalisis.map((orden) => ({
        ticket: orden.numero_ticket || '',
        cliente: orden.cliente,
        equipo: orden.equipo,
        tecnico: orden.tecnico,
        estado: orden.estado,
        prioridad: orden.prioridad,
        tiempo_min: Number(orden.tiempoEmpleadoMinutos || 0),
        coste_materiales: Number(orden.costeMateriales || 0),
        fecha_inicio: orden.fechaInicioIso ? new Date(orden.fechaInicioIso).toLocaleString('es-ES') : '',
        fecha_fin: orden.fechaFinIso ? new Date(orden.fechaFinIso).toLocaleString('es-ES') : '',
        informe_pdf: orden.informePdfUrl || '',
      }));

      await descargarExcelProfesional({
        nombreArchivo: `ordenes-sat-${new Date().toISOString().slice(0, 10)}.xlsx`,
        hojaNombre: 'Ordenes SAT',
        titulo: 'SAT COTEPA · Exportación profesional de órdenes',
        subtitulo: `Generado el ${new Date().toLocaleString('es-ES')} · Cliente: ${filtroClienteAnalisis === 'todos' ? 'Todos' : (clientesAnalisis.find((c) => c.id === filtroClienteAnalisis)?.nombre || 'Filtrado')}`,
        columnas: [
          { key: 'ticket', header: 'Ticket', width: 14 },
          { key: 'cliente', header: 'Cliente', width: 28 },
          { key: 'equipo', header: 'Equipo', width: 24 },
          { key: 'tecnico', header: 'Técnico', width: 24 },
          { key: 'estado', header: 'Estado', width: 16 },
          { key: 'prioridad', header: 'Prioridad', width: 14 },
          { key: 'tiempo_min', header: 'Tiempo (min)', width: 14, numFmt: '0' },
          { key: 'coste_materiales', header: 'Coste materiales (€)', width: 20, numFmt: '#,##0.00' },
          { key: 'fecha_inicio', header: 'Fecha inicio', width: 22 },
          { key: 'fecha_fin', header: 'Fecha fin', width: 22 },
          { key: 'informe_pdf', header: 'URL informe PDF', width: 38 },
        ],
        filas,
        resumen: [
          ['Órdenes en análisis', ordenesAnalisis.length],
          ['Órdenes finalizadas', ordenesFinalizadas.length],
          ['MTTR (min)', mttrMinutos],
          ['Coste materiales total (€)', Number(costeTotalMateriales)],
        ],
      });

      notificar({
        tipo: 'exito',
        titulo: 'Excel generado',
        descripcion: 'Se descargó un archivo .xlsx con formato profesional.',
      });
    } catch (err) {
      notificar({
        tipo: 'error',
        titulo: 'No se pudo exportar órdenes',
        descripcion: err.message || 'No se pudo generar el archivo Excel de órdenes.',
      });
    }
  }

  async function exportarKpisExcel() {
    try {
      const filas = [
        { kpi: 'Total órdenes', valor: ordenesAnalisis.length },
        { kpi: 'Órdenes finalizadas', valor: ordenesFinalizadas.length },
        { kpi: 'MTTR (min)', valor: mttrMinutos },
        { kpi: 'SLA <=48h (%)', valor: cumplimientoSla48h },
        { kpi: 'First Time Fix proxy (%)', valor: firstTimeFixProxy },
        { kpi: 'Coste materiales total (€)', valor: Number(costeTotalMateriales) },
      ];

      await descargarExcelProfesional({
        nombreArchivo: `kpi-sat-${new Date().toISOString().slice(0, 10)}.xlsx`,
        hojaNombre: 'KPIs SAT',
        titulo: 'SAT COTEPA · Informe KPI profesional',
        subtitulo: `Generado el ${new Date().toLocaleString('es-ES')} · Cliente: ${filtroClienteAnalisis === 'todos' ? 'Todos' : (clientesAnalisis.find((c) => c.id === filtroClienteAnalisis)?.nombre || 'Filtrado')}`,
        columnas: [
          { key: 'kpi', header: 'Indicador', width: 36 },
          { key: 'valor', header: 'Valor', width: 20 },
        ],
        filas,
      });

      notificar({
        tipo: 'exito',
        titulo: 'KPI Excel generado',
        descripcion: 'Se descargó un KPI en formato .xlsx con diseño profesional.',
      });
    } catch (err) {
      notificar({
        tipo: 'error',
        titulo: 'No se pudo exportar KPI',
        descripcion: err.message || 'No se pudo generar el archivo Excel de KPI.',
      });
    }
  }

  async function exportarInformesZip() {
    const informes = ordenesFinalizadas.filter((orden) => orden.informePdfUrl);

    if (!informes.length) {
      notificar({
        tipo: 'error',
        titulo: 'Sin informes disponibles',
        descripcion: 'No hay órdenes finalizadas con informe PDF para exportar.',
      });
      return;
    }

    setExportandoZip(true);

    try {
      const zip = new JSZip();
      let agregados = 0;

      for (const orden of informes) {
        try {
          const urlInforme = await obtenerUrlFirmadaStorage(orden.informePdfUrl, { expiresIn: 900 });
          if (!urlInforme) {
            continue;
          }
          const respuesta = await fetch(urlInforme);
          if (!respuesta.ok) {
            continue;
          }

          const blob = await respuesta.blob();
          const nombre = `informe-${orden.numero_ticket || orden.id}.pdf`;
          zip.file(nombre, blob);
          agregados += 1;
        } catch {
          // Ignorar informes individuales con fallo y continuar con el resto.
        }
      }

      if (!agregados) {
        throw new Error('No se pudo descargar ningún informe PDF.');
      }

      const contenidoZip = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(contenidoZip);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `informes-sat-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(url);

      notificar({
        tipo: 'exito',
        titulo: 'ZIP generado',
        descripcion: `Se descargaron ${agregados} informes en un archivo ZIP.`,
      });
    } catch (err) {
      notificar({
        tipo: 'error',
        titulo: 'No se pudo generar el ZIP',
        descripcion: err.message || 'Revisa conexión y permisos de acceso a informes.',
      });
    } finally {
      setExportandoZip(false);
    }
  }

  if (cargando) {
    return <p className="text-sm font-semibold text-sat-muted">Cargando órdenes...</p>;
  }

  return (
    <section className="space-y-4 lg:space-y-5">
      <ToastEstado toast={toast} onClose={() => setToast(null)} />
      <ModalElegirNavegacion
        isOpen={modalNavAbierto}
        onClose={cerrarModalNavegacion}
        onSelect={seleccionarAppNavegacion}
        appsDisponibles={appsNavDisponibles}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <header className="rounded-2xl bg-marca-900 p-4 text-white shadow-lg lg:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">Órdenes de Trabajo</h2>
            <p className="mt-1 text-sm text-slate-200">
              Consulta, crea y actualiza el estado de cada avería desde el móvil.
            </p>
          </div>
        </div>

        <div className={`mt-4 grid gap-2 ${esTecnico ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <article className="rounded-xl border border-white/20 bg-white/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-200">Informes PDF</p>
              <Download className="h-4 w-4 text-white" />
            </div>
            <p className="mt-2 text-xl font-extrabold text-white">{informesDisponibles}</p>
            <p className="text-xs text-slate-200">listos para incluir en ZIP</p>
            <button
              type="button"
              onClick={exportarInformesZip}
              disabled={exportandoZip}
              className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-white px-3 py-2 text-xs font-bold text-marca-900 disabled:opacity-60"
            >
              {exportandoZip ? 'Generando ZIP...' : 'Descargar ZIP de informes'}
            </button>
          </article>

          {!esTecnico && (
            <article className="rounded-xl border border-white/20 bg-white/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-200">KPI</p>
                <BarChart3 className="h-4 w-4 text-white" />
              </div>
              <p className="mt-2 text-xl font-extrabold text-white">{ordenesFinalizadas.length}</p>
              <p className="text-xs text-slate-200">órdenes finalizadas analizadas</p>
              <button
                type="button"
                onClick={exportarKpisExcel}
                className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-white px-3 py-2 text-xs font-bold text-marca-900"
              >
                Descargar KPI Excel
              </button>
            </article>
          )}

          <article className="rounded-xl border border-white/20 bg-white/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-200">Órdenes</p>
              <Download className="h-4 w-4 text-white" />
            </div>
            <p className="mt-2 text-xl font-extrabold text-white">{ordenes.length}</p>
            <p className="text-xs text-slate-200">registros totales exportables</p>
            <button
              type="button"
              onClick={exportarOrdenesExcel}
              className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-white px-3 py-2 text-xs font-bold text-marca-900"
            >
              Descargar Excel de órdenes
            </button>
          </article>
        </div>

        <div className="mt-3 rounded-[1.25rem] border border-white/15 bg-white/10 p-3 shadow-sm backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-200">Ámbito de análisis</p>
              <p className="mt-1 text-sm font-black tracking-tight text-white">{nombreClienteAnalisis}</p>
              <p className="mt-1 text-xs text-slate-300">
                Ajusta cliente, tipo, estado y búsqueda para centrar el listado operativo más rápido.
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-300">Órdenes visibles</p>
              <p className="mt-1 text-lg font-black text-white">{totalOrdenesFiltradas}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)_minmax(0,1fr)]">
            <label className="block rounded-[1.1rem] border border-white/12 bg-white/8 p-3 shadow-sm">
              <span className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-200">
                <UserRound className="h-3.5 w-3.5" />
                Cliente
              </span>
              <select
                value={filtroClienteAnalisis}
                onChange={(evento) => setFiltroClienteAnalisis(evento.target.value)}
                className="w-full rounded-xl border border-white/20 bg-marca-900/90 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:border-white/30 focus:border-white/40 focus:outline-none"
              >
                <option value="todos">Todos los clientes</option>
                {clientesAnalisis.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="block rounded-[1.1rem] border border-white/12 bg-white/8 p-3 shadow-sm">
              <span className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-200">
                <Wrench className="h-3.5 w-3.5" />
                Tipo
              </span>
              <select
                value={filtroTipoOrden}
                onChange={(evento) => setFiltroTipoOrden(evento.target.value)}
                className="w-full rounded-xl border border-white/20 bg-marca-900/90 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:border-white/30 focus:border-white/40 focus:outline-none"
              >
                <option value="todos">Todas</option>
                <option value="averia">Avería</option>
                <option value="pem">PEM (Montaje + Puesta en marcha)</option>
                <option value="montaje">PEM · Montaje</option>
                <option value="puesta_en_marcha">PEM · Puesta en marcha</option>
              </select>
            </label>

            <label className="block rounded-[1.1rem] border border-white/12 bg-white/8 p-3 shadow-sm">
              <span className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-200">
                <Search className="h-3.5 w-3.5" />
                Buscar
              </span>
              <input
                value={busquedaOrdenes}
                onChange={(evento) => setBusquedaOrdenes(evento.target.value)}
                className="w-full rounded-xl border border-white/20 bg-marca-900/90 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition placeholder:text-slate-300 hover:border-white/30 focus:border-white/40 focus:outline-none"
                placeholder="Ticket, cliente, equipo o técnico"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-100">
              Cliente: {nombreClienteAnalisis}
            </span>
            <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-100">
              Tipo: {filtroTipoOrden === 'todos' ? 'Todas' : filtroTipoOrden.replaceAll('_', ' ')}
            </span>
            <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-100">
              Estado: {filtroEstado}
            </span>
            {terminoBusqueda && (
              <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-100">
                Búsqueda: {busquedaOrdenes.trim()}
              </span>
            )}
          </div>
        </div>

        {!esTecnico && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold lg:grid-cols-4">
            <div className="rounded-[1.1rem] border border-white/12 bg-white/10 p-3 text-left shadow-sm">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">MTTR</p>
              <p className="mt-2 text-lg font-black text-white">{mttrMinutos} min</p>
              <p className="mt-1 text-[11px] font-medium text-slate-300">Tiempo medio de resolución</p>
            </div>
            <div className="rounded-[1.1rem] border border-white/12 bg-white/10 p-3 text-left shadow-sm">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">SLA 48h</p>
              <p className="mt-2 text-lg font-black text-white">{cumplimientoSla48h}%</p>
              <p className="mt-1 text-[11px] font-medium text-slate-300">Finalizadas dentro de objetivo</p>
            </div>
            <div className="rounded-[1.1rem] border border-white/12 bg-white/10 p-3 text-left shadow-sm">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">FTF proxy</p>
              <p className="mt-2 text-lg font-black text-white">{firstTimeFixProxy}%</p>
              <p className="mt-1 text-[11px] font-medium text-slate-300">Órdenes cerradas en el ciclo actual</p>
            </div>
            <div className="rounded-[1.1rem] border border-white/12 bg-white/10 p-3 text-left shadow-sm">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">Coste mat.</p>
              <p className="mt-2 text-lg font-black text-white">{costeTotalMateriales} €</p>
              <p className="mt-1 text-[11px] font-medium text-slate-300">Acumulado del conjunto filtrado</p>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold sm:grid-cols-4">
          <div className="rounded-[1.1rem] border border-white/12 bg-white/10 p-3 text-left shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">Pendientes</p>
            <p className="mt-2 text-lg font-black text-white">{resumenAnalisis.Pendiente}</p>
            <p className="mt-1 text-[11px] font-medium text-slate-300">A la espera de atención</p>
          </div>
          <div className="rounded-[1.1rem] border border-white/12 bg-white/10 p-3 text-left shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">En Proceso</p>
            <p className="mt-2 text-lg font-black text-white">{resumenAnalisis['En Proceso']}</p>
            <p className="mt-1 text-[11px] font-medium text-slate-300">Trabajos actualmente activos</p>
          </div>
          <div className="rounded-[1.1rem] border border-white/12 bg-white/10 p-3 text-left shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">Pausadas</p>
            <p className="mt-2 text-lg font-black text-white">{resumenAnalisis.Pausado}</p>
            <p className="mt-1 text-[11px] font-medium text-slate-300">Pendientes de reanudación</p>
          </div>
          <div className="rounded-[1.1rem] border border-white/12 bg-white/10 p-3 text-left shadow-sm">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-300">Finalizadas</p>
            <p className="mt-2 text-lg font-black text-white">{resumenAnalisis.Finalizado}</p>
            <p className="mt-1 text-[11px] font-medium text-slate-300">Cerradas en el conjunto filtrado</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {FILTROS_ESTADO.map((filtro) => (
            <button
              key={filtro}
              type="button"
              onClick={() => setFiltroEstado(filtro)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold transition ${
                filtroEstado === filtro
                  ? 'border-cotepa-rojo-500 bg-cotepa-rojo-500 text-white shadow-md'
                  : 'border-white/10 bg-white/10 text-white hover:border-white/20 hover:bg-white/15'
              }`}
            >
              {filtro}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                filtroEstado === filtro ? 'bg-white/15 text-white' : 'bg-white/10 text-slate-200'
              }`}
              >
                {contadoresEstado[filtro] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-12 lg:gap-4">
        <div className="lg:col-span-4 lg:sticky lg:top-5 lg:self-start">
          <FormularioNuevaOrden
            onCrear={crearOrdenDesdeFormulario}
            accionEnCurso={accionEnCurso}
            onNotificar={notificar}
            puedeCrearOrdenes={puedeCrearOrdenes}
          />
        </div>

        <div className="space-y-3 pb-20 lg:col-span-8 lg:pb-0">
          {ordenesPaginadas.map((orden) => (
            <TarjetaOrden
              key={orden.id}
              orden={orden}
              tecnicosActivos={tecnicosActivos}
              accionEnCurso={accionEnCurso}
              onFinalizar={finalizarOrden}
              onActualizar={actualizarOrden}
              onValorarFinalizada={actualizarValoracionFinalizada}
              onEditarParteCompleto={editarParteCompleto}
              onEliminar={eliminarOrden}
              onNotificar={notificar}
              onIrACliente={irAClienteDesdeOrden}
              onIrAParte={irAParteDesdeOrden}
              puedeEditarOrden={puedeEditarOrden}
              puedeValorarFinalizada={puedeValorarFinalizada}
              puedeEliminarOrden={puedeEliminarOrden}
            />
          ))}

          {totalPaginas > 1 && (
            <div className="toolbar-panel rounded-[1.2rem] px-3 py-3 text-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sat-faint">Navegación de páginas</p>
                  <p className="mt-1 text-sm font-bold text-sat-text">
                    Mostrando {primerElementoPagina}-{ultimoElementoPagina} de {totalOrdenesFiltradas} órdenes
                  </p>
                  <p className="mt-1 text-xs font-medium text-sat-muted">
                    Página {paginaSegura} de {totalPaginas}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                  <span className="inline-flex items-center rounded-full border border-sat-border bg-white px-2.5 py-1 text-[11px] font-bold text-sat-muted">
                    {paginaSegura}/{totalPaginas}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={paginaSegura === 1}
                  onClick={() => setPaginaActual(1)}
                  className="btn-secondary rounded-xl px-2.5 py-1.5 text-xs disabled:opacity-40"
                  title="Primera página"
                >
                  «
                </button>
                <button
                  type="button"
                  disabled={paginaSegura === 1}
                  onClick={() => setPaginaActual((p) => p - 1)}
                  className="btn-secondary rounded-xl px-2.5 py-1.5 text-xs disabled:opacity-40"
                  title="Página anterior"
                >
                  ‹
                </button>
                {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPaginas || Math.abs(p - paginaSegura) <= 1)
                  .reduce((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, idx) =>
                    p === '...' ? (
                      <span key={`ellipsis-${idx}`} className="px-1 text-xs text-sat-faint">…</span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPaginaActual(p)}
                        className={`rounded-xl border px-2.5 py-1.5 text-xs font-bold transition ${
                          p === paginaSegura
                            ? 'border-cotepa-rojo-500 bg-cotepa-rojo-500 text-white shadow-sm'
                            : 'border-sat-border bg-white text-sat-muted hover:border-marca-200 hover:bg-marca-50'
                        }`}
                      >
                        {p}
                      </button>
                    ),
                  )}
                <button
                  type="button"
                  disabled={paginaSegura === totalPaginas}
                  onClick={() => setPaginaActual((p) => p + 1)}
                  className="btn-secondary rounded-xl px-2.5 py-1.5 text-xs disabled:opacity-40"
                  title="Página siguiente"
                >
                  ›
                </button>
                <button
                  type="button"
                  disabled={paginaSegura === totalPaginas}
                  onClick={() => setPaginaActual(totalPaginas)}
                  className="btn-secondary rounded-xl px-2.5 py-1.5 text-xs disabled:opacity-40"
                  title="Última página"
                >
                  »
                </button>
              </div>
            </div>
          )}

          {!ordenesListado.length && (
            <div className="overflow-hidden rounded-[1.35rem] border border-dashed border-marca-200 bg-gradient-to-br from-sat-surface to-white shadow-sm">
              <div className="h-1.5 w-full bg-gradient-to-r from-marca-500 via-marca-600 to-cotepa-rojo-500" />
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-marca-50 text-marca-700">
                    <TriangleAlert className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="metric-label">Sin resultados</p>
                    <p className="mt-2 text-base font-black tracking-tight text-sat-text">
                      No hay órdenes visibles con los filtros actuales
                    </p>
                    <p className="mt-1 text-sm leading-6 text-sat-muted">
                      Ajusta cliente, tipo, estado o búsqueda para volver a mostrar órdenes en el listado.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFiltroClienteAnalisis('todos');
                    setFiltroTipoOrden('todos');
                    setFiltroEstado('Todas');
                    setBusquedaOrdenes('');
                  }}
                  className="btn-secondary px-4 py-3 text-sm"
                >
                  Restablecer filtros
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
