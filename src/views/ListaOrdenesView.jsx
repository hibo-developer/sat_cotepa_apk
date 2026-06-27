import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, CircleCheckBig, Clock3, Download, Hammer, Rocket, TriangleAlert, Wrench } from 'lucide-react';
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
  const claseInput = 'w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-marca-600 focus:outline-none focus:ring-4 focus:ring-marca-100 disabled:cursor-not-allowed disabled:bg-slate-100';
  const claseEtiqueta = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600';
  const claseBotonCargarMas = 'mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:opacity-60';

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
      className="space-y-4 rounded-3xl border border-marca-100 bg-white p-4 shadow-tarjeta lg:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-marca-700" />
            <h3 className="text-base font-bold text-slate-800">Nueva Orden de Trabajo</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Registra una nueva orden SAT con cliente, técnico, prioridad y tipo de intervención.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Alta rápida</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {cargandoCatalogos ? 'Catálogos cargando' : 'Catálogos listos'}
          </p>
        </div>
      </div>

      <label className="block">
        <span className={claseEtiqueta}>Cliente *</span>
        <input
          value={busquedaCliente}
          onChange={(evento) => {
            setPaginaClientes(1);
            setBusquedaCliente(evento.target.value);
          }}
          className={`${claseInput} mb-2`}
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
          className={claseInput}
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
          <p className="mt-1 text-xs font-medium text-slate-500">No hay clientes que coincidan con la búsqueda.</p>
        )}
        {hayMasClientes && (
          <button
            type="button"
            onClick={() => setPaginaClientes((previo) => previo + 1)}
            className={claseBotonCargarMas}
            disabled={cargandoClientes}
          >
            {cargandoClientes ? 'Cargando...' : 'Cargar más clientes'}
          </button>
        )}
      </label>

      <label className="block">
        <span className={claseEtiqueta}>Equipo</span>
        <input
          value={busquedaEquipo}
          onChange={(evento) => {
            setPaginaEquipos(1);
            setBusquedaEquipo(evento.target.value);
          }}
          className={`${claseInput} mb-2`}
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
          className={claseInput}
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
          <p className="mt-1 text-xs font-medium text-slate-500">No hay equipos que coincidan con la búsqueda.</p>
        )}
        {hayMasEquipos && (
          <button
            type="button"
            onClick={() => setPaginaEquipos((previo) => previo + 1)}
            className={claseBotonCargarMas}
            disabled={cargandoEquipos}
          >
            {cargandoEquipos ? 'Cargando...' : 'Cargar más equipos'}
          </button>
        )}
      </label>

      <label className="block">
        <span className={claseEtiqueta}>Técnico *</span>
        <input
          value={busquedaTecnico}
          onChange={(evento) => {
            setPaginaTecnicos(1);
            setBusquedaTecnico(evento.target.value);
          }}
          className={`${claseInput} mb-2`}
          placeholder="Buscar técnico por nombre o especialidad"
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
          className={claseInput}
          disabled={formularioDeshabilitado}
        >
          <option value="">Selecciona técnico</option>
          {tecnicos.map((tecnico) => (
            <option key={tecnico.id} value={tecnico.id}>
              {tecnico.nombre}
              {tecnico.especialidad ? ` (${tecnico.especialidad})` : ''}
            </option>
          ))}
        </select>
        {!!busquedaTecnicoDebounce && tecnicos.length === 0 && (
          <p className="mt-1 text-xs font-medium text-slate-500">No hay técnicos que coincidan con la búsqueda.</p>
        )}
        {hayMasTecnicos && (
          <button
            type="button"
            onClick={() => setPaginaTecnicos((previo) => previo + 1)}
            className={claseBotonCargarMas}
            disabled={cargandoTecnicos}
          >
            {cargandoTecnicos ? 'Cargando...' : 'Cargar más técnicos'}
          </button>
        )}
      </label>

      <label className="block">
        <span className={claseEtiqueta}>Tipo de orden *</span>
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
          className={claseInput}
          disabled={formularioDeshabilitado}
        >
          <option value="averia">Avería</option>
          <option value="montaje">Montaje</option>
          <option value="puesta_en_marcha">Puesta en marcha</option>
        </select>
      </label>

      <label className="block">
        <span className={claseEtiqueta}>
          {formulario.tipo_orden === 'averia' ? 'Descripción de la avería *' : 'Descripción de la orden *'}
        </span>
        <textarea
          required
          name="descripcion_averia"
          value={formulario.descripcion_averia}
          onChange={actualizarCampo}
          rows={3}
          className={`${claseInput} min-h-[96px]`}
          placeholder={formulario.tipo_orden === 'averia'
            ? 'Describe el problema detectado'
            : 'Describe el montaje o la puesta en marcha'}
        />
      </label>

      <label className="block">
        <span className={claseEtiqueta}>Prioridad</span>
        <select
          name="prioridad"
          value={formulario.prioridad}
          onChange={actualizarCampo}
          className={claseInput}
        >
          <option value="baja">Baja</option>
          <option value="media">Media</option>
          <option value="alta">Alta</option>
          <option value="urgente">Urgente</option>
        </select>
      </label>

      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <div>
          <p className="font-semibold text-slate-900">Sugerencia</p>
          <p className="mt-1 leading-6">
            Selecciona primero cliente y técnico para cargar el resto de catálogos con mayor rapidez.
          </p>
        </div>
      </div>

      <button
        type="submit"
        disabled={accionEnCurso || formularioDeshabilitado}
        className="w-full rounded-2xl bg-cotepa-rojo-500 px-4 py-4 text-sm font-bold text-white active:scale-95 disabled:opacity-60"
      >
        {cargandoCatalogos
          ? 'Cargando catálogos...'
          : !puedeCrearOrdenes
            ? 'Sin permisos para crear órdenes'
            : accionEnCurso
              ? 'Guardando...'
              : 'Crear Orden'}
      </button>

      {mensaje && <p className="text-xs font-semibold text-slate-600">{mensaje}</p>}
      {!puedeCrearOrdenes && (
        <p className="text-xs font-semibold text-slate-600">
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
            <span className="mb-1 block text-xs font-semibold text-slate-700">Descripción de la avería</span>
            <textarea
              rows={2}
              value={descripcionAveria}
              onChange={(e) => setDescripcionAveria(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">
              Tareas realizadas
            </span>
            <textarea
              rows={3}
              value={tareasLibre}
              onChange={(e) => setTareasLibre(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-[10px] text-slate-500">
              Los marcadores técnicos (firma, fotos…) se conservan.
            </span>
          </label>

          <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2">
            <legend className="px-1 text-xs font-bold text-slate-700">Materiales</legend>
            {materiales.length === 0 && (
              <p className="text-xs text-slate-500">Sin materiales asociados.</p>
            )}
            {materiales.map((m, i) => (
              <div key={i} className="grid grid-cols-12 gap-1">
                <input
                  type="text"
                  value={m.nombre_material}
                  onChange={(e) => actualizarMaterial(i, 'nombre_material', e.target.value)}
                  placeholder="Nombre"
                  className="col-span-6 rounded border border-slate-300 px-2 py-1 text-xs"
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={m.cantidad}
                  onChange={(e) => actualizarMaterial(i, 'cantidad', e.target.value)}
                  placeholder="Cant."
                  className="col-span-2 rounded border border-slate-300 px-2 py-1 text-xs"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={m.precio_unitario}
                  onChange={(e) => actualizarMaterial(i, 'precio_unitario', e.target.value)}
                  placeholder="€/u"
                  className="col-span-3 rounded border border-slate-300 px-2 py-1 text-xs"
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
              className="w-full rounded-lg border border-dashed border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
            >
              + Añadir material
            </button>
            <p className="text-[10px] text-slate-500">
              No se ajusta el stock de inventario al editar; solo cambia el detalle del informe.
            </p>
          </fieldset>

          <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2">
            <legend className="px-1 text-xs font-bold text-slate-700">Fotos del parte</legend>
            {fotosActuales.length === 0 && (
              <p className="text-xs text-slate-500">Sin fotos en el parte original.</p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {fotosActuales.map((url) => {
                const marcada = fotosAEliminar.includes(url);
                return (
                  <button
                    key={url}
                    type="button"
                    onClick={() => alternarEliminarFoto(url)}
                    className={`relative overflow-hidden rounded border-2 ${marcada ? 'border-red-500 opacity-50' : 'border-slate-200'}`}
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
            <div className="border-t border-slate-200 pt-2">
              <span className="mb-1 block text-xs font-semibold text-slate-700">Añadir fotos nuevas</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={aceptarFotosNuevas}
                className="block w-full text-xs"
              />
              {fotosNuevas.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-slate-700">
                  {fotosNuevas.map((f, i) => (
                    <li key={i} className="flex items-center justify-between rounded bg-slate-100 px-2 py-1">
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

          {mensaje && <p className="text-xs font-semibold text-slate-600">{mensaje}</p>}
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
  const IconoTipoOrden = etiquetaTipo.icono;
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
      const url = await obtenerUrlFirmadaStorage(orden.informePdfUrl, { expiresIn: 900, forceRefresh: true });
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
    <article className="rounded-2xl border border-marca-100 bg-white p-4 shadow-tarjeta">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {orden.numero_ticket ? `SAT-${orden.numero_ticket}` : orden.id}
            </p>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${etiquetaTipo.clase}`}>
              <IconoTipoOrden className="h-3.5 w-3.5" />
              {etiquetaTipo.texto}
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-slate-800">{orden.equipo}</h3>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${clase}`}>
          <IconoEstado className="h-4 w-4" />
          {orden.estado}
        </span>
      </div>

      <div className="space-y-2 text-sm text-slate-700">
        <p>
          <span className="font-semibold text-slate-900">Cliente:</span> {orden.cliente}
        </p>
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1">
            <span className="font-semibold text-slate-900">Dirección:</span>{' '}
            {ubicacionCliente.direccion || (ubicacionCliente.tieneUbicacion ? 'Ubicación registrada' : 'Sin ubicación')}
          </p>
          <button
            type="button"
            onClick={() => onIrACliente(orden)}
            disabled={!ubicacionCliente.tieneUbicacion}
            className="shrink-0 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            🧭 Ir
          </button>
        </div>
        <p>
          <span className="font-semibold text-slate-900">Técnico:</span> {orden.tecnico || 'Sin técnico asignado'}
        </p>
        {orden.estado !== 'Finalizado' && (
          <p>
            <span className="font-semibold text-slate-900">{orden.tipoOrden === 'averia' ? 'Avería:' : 'Orden:'}</span>{' '}
            {orden.descripcion}
          </p>
        )}
      </div>

      {orden.estado !== 'Finalizado' && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-marca-50 px-3 py-2 text-xs font-semibold text-marca-700">
          <span>Prioridad: {orden.prioridad}</span>
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
                    <span className="mb-1 block text-xs font-semibold text-slate-700">Materiales (€)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formularioValoracion.coste_materiales_editable}
                      onChange={(evento) => setFormularioValoracion((previo) => ({ ...previo, coste_materiales_editable: evento.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-700">Tarifa mano de obra (€/h)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formularioValoracion.tarifa_mano_obra_hora}
                      onChange={(evento) => setFormularioValoracion((previo) => ({ ...previo, tarifa_mano_obra_hora: evento.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-700">Horas mano de obra</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formularioValoracion.horas_mano_obra}
                      onChange={(evento) => {
                        setHorasManoObraEditadas(true);
                        setFormularioValoracion((previo) => ({ ...previo, horas_mano_obra: evento.target.value }));
                      }}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-700">Mecánicos</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={formularioValoracion.mecanicos_intervinieron}
                      onChange={(evento) => setFormularioValoracion((previo) => ({ ...previo, mecanicos_intervinieron: evento.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-700">Inicio intervención</span>
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
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-slate-700">Fin intervención</span>
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
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-700">Tarifa desplazamiento (€/km)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formularioValoracion.tarifa_desplazamiento_km}
                      onChange={(evento) => setFormularioValoracion((previo) => ({ ...previo, tarifa_desplazamiento_km: evento.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-700">Km desplazamiento facturables</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formularioValoracion.km_desplazamiento_facturables}
                      onChange={(evento) => setFormularioValoracion((previo) => ({ ...previo, km_desplazamiento_facturables: evento.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                    <p className="font-semibold">Recargos mano de obra</p>
                    <p>Horario estándar: 08:00 - 18:00</p>
                  </div>

                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(formularioValoracion.aplica_recargo_festivo)}
                      onChange={(evento) => setFormularioValoracion((previo) => ({ ...previo, aplica_recargo_festivo: evento.target.checked }))}
                    />
                    Aplicar recargo por festivo
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-700">Recargo festivo (%)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formularioValoracion.recargo_festivo_pct}
                      onChange={(evento) => setFormularioValoracion((previo) => ({ ...previo, recargo_festivo_pct: evento.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(formularioValoracion.aplica_recargo_fuera_horario)}
                      onChange={(evento) => setFormularioValoracion((previo) => ({ ...previo, aplica_recargo_fuera_horario: evento.target.checked }))}
                    />
                    Aplicar recargo fuera de horario (08:00-18:00)
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-700">Recargo fuera de horario (%)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formularioValoracion.recargo_fuera_horario_pct}
                      onChange={(evento) => setFormularioValoracion((previo) => ({ ...previo, recargo_fuera_horario_pct: evento.target.value }))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
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

                  {mensajeValoracion && <p className="text-xs font-semibold text-slate-600">{mensajeValoracion}</p>}
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
          <div className={`grid gap-2 ${puedeEditarOrden ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {puedeEditarOrden && (
              <button
                type="button"
                onClick={() => {
                  setMostrarEdicion((previo) => !previo);
                  setMensajeEdicion('');
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 active:scale-95"
              >
                {mostrarEdicion ? 'Cancelar edición' : 'Editar orden'}
              </button>
            )}
            <button
              type="button"
              onClick={() => onIrAParte(orden)}
              className="w-full rounded-xl border border-marca-300 bg-marca-50 px-4 py-3 text-sm font-bold text-marca-800 active:scale-95"
            >
              Ir a parte
            </button>
            <button
              type="button"
              onClick={() => onIrAParte(orden)}
              className="w-full rounded-xl bg-cotepa-rojo-500 px-4 py-3 text-sm font-bold text-white active:scale-95"
            >
              Finalizar con informe
            </button>
          </div>

          {mostrarEdicion && puedeEditarOrden && (
            <form onSubmit={guardarEdicion} className="space-y-2 rounded-xl border border-marca-100 bg-marca-50 p-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-700">Técnico *</span>
                <select
                  required
                  value={formularioEdicion.tecnico_id}
                  onChange={(evento) =>
                    setFormularioEdicion((previo) => ({ ...previo, tecnico_id: evento.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
                <span className="mb-1 block text-xs font-semibold text-slate-700">Estado</span>
                <select
                  value={formularioEdicion.estado}
                  onChange={(evento) =>
                    setFormularioEdicion((previo) => ({ ...previo, estado: evento.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {OPCIONES_ESTADO_EDITABLE.map((opcion) => (
                    <option key={opcion.value} value={opcion.value}>
                      {opcion.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-700">Prioridad</span>
                <select
                  value={formularioEdicion.prioridad}
                  onChange={(evento) =>
                    setFormularioEdicion((previo) => ({ ...previo, prioridad: evento.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
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

              {mensajeEdicion && <p className="text-xs font-semibold text-slate-600">{mensajeEdicion}</p>}
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
              className={`inline-flex items-center justify-center rounded-lg border px-3 py-2 font-bold ${orden.informePdfUrl ? 'border-rose-300 bg-white text-rose-700' : 'border-slate-300 bg-slate-100 text-slate-400 pointer-events-none'}`}
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
  const resumenListado = [
    { etiqueta: 'Listado visible', valor: totalOrdenesFiltradas, detalle: 'tras filtros y búsqueda' },
    { etiqueta: 'Página actual', valor: paginaSegura, detalle: `de ${totalPaginas}` },
    { etiqueta: 'Búsqueda', valor: terminoBusqueda ? 'Activa' : 'Global', detalle: terminoBusqueda || 'sin texto aplicado' },
  ];

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
          const urlInforme = await obtenerUrlFirmadaStorage(orden.informePdfUrl, { expiresIn: 900, forceRefresh: true });
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
    return <p className="text-sm font-semibold text-slate-600">Cargando órdenes...</p>;
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
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 shadow-sm">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <p>{error}</p>
        </div>
      )}

      <header className="overflow-hidden rounded-3xl border border-marca-700/40 bg-marca-900 p-5 text-white shadow-xl lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-100">
              <Wrench className="h-3.5 w-3.5" />
              Operativa diaria
            </div>
            <h2 className="mt-4 text-xl font-bold lg:text-2xl">Órdenes de Trabajo</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
              Consulta, crea y actualiza el estado de cada avería desde el móvil.
            </p>
          </div>
        </div>

        <div className={`mt-5 grid gap-3 ${esTecnico ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <article className="rounded-2xl border border-white/15 bg-white/10 p-4 shadow-lg shadow-black/5 backdrop-blur-sm">
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
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-white px-3 py-2 text-xs font-bold text-marca-900 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-marca-900 disabled:opacity-60"
            >
              {exportandoZip ? 'Generando ZIP...' : 'Descargar ZIP de informes'}
            </button>
          </article>

          {!esTecnico && (
            <article className="rounded-2xl border border-white/15 bg-white/10 p-4 shadow-lg shadow-black/5 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-200">KPI</p>
                <BarChart3 className="h-4 w-4 text-white" />
              </div>
              <p className="mt-2 text-xl font-extrabold text-white">{ordenesFinalizadas.length}</p>
              <p className="text-xs text-slate-200">órdenes finalizadas analizadas</p>
              <button
                type="button"
                onClick={exportarKpisExcel}
                className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-white px-3 py-2 text-xs font-bold text-marca-900 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-marca-900"
              >
                Descargar KPI Excel
              </button>
            </article>
          )}

          <article className="rounded-2xl border border-white/15 bg-white/10 p-4 shadow-lg shadow-black/5 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-200">Órdenes</p>
              <Download className="h-4 w-4 text-white" />
            </div>
            <p className="mt-2 text-xl font-extrabold text-white">{ordenes.length}</p>
            <p className="text-xs text-slate-200">registros totales exportables</p>
            <button
              type="button"
              onClick={exportarOrdenesExcel}
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-white px-3 py-2 text-xs font-bold text-marca-900 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-marca-900"
            >
              Descargar Excel de órdenes
            </button>
          </article>
        </div>

        <div className="mt-4 rounded-2xl border border-white/15 bg-white/10 p-4 shadow-lg shadow-black/5 backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-200">Ámbito de análisis</p>
            <span className="text-[11px] font-semibold text-slate-300">{ordenesAnalisis.length} órdenes en análisis</span>
          </div>
          <label className="mt-2 block">
            <span className="mb-1 block text-xs font-semibold text-slate-200">Filtrar por cliente</span>
            <select
              value={filtroClienteAnalisis}
              onChange={(evento) => setFiltroClienteAnalisis(evento.target.value)}
              className="w-full rounded-xl border border-white/20 bg-marca-900/80 px-3 py-2.5 text-sm text-white transition focus:outline-none focus:ring-2 focus:ring-white/60"
            >
              <option value="todos">Todos los clientes</option>
              {clientesAnalisis.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!esTecnico && (
          <div className="mt-4 grid grid-cols-2 gap-2.5 text-center text-xs font-bold lg:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 shadow-lg shadow-black/5">
              <p className="text-slate-300">MTTR</p>
              <p className="text-base text-white">{mttrMinutos} min</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 shadow-lg shadow-black/5">
              <p className="text-slate-300">SLA 48h</p>
              <p className="text-base text-white">{cumplimientoSla48h}%</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 shadow-lg shadow-black/5">
              <p className="text-slate-300">FTF proxy</p>
              <p className="text-base text-white">{firstTimeFixProxy}%</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 shadow-lg shadow-black/5">
              <p className="text-slate-300">Coste mat.</p>
              <p className="text-base text-white">{costeTotalMateriales} €</p>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2.5 text-center text-xs font-bold">
          <div className="rounded-2xl border border-white/10 bg-white/10 p-3 shadow-lg shadow-black/5">
            <p className="text-slate-300">Pendientes</p>
            <p className="text-base text-white">{resumenAnalisis.Pendiente}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-3 shadow-lg shadow-black/5">
            <p className="text-slate-300">En Proceso</p>
            <p className="text-base text-white">{resumenAnalisis['En Proceso']}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-3 shadow-lg shadow-black/5">
            <p className="text-slate-300">Finalizadas</p>
            <p className="text-base text-white">{resumenAnalisis.Finalizado}</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/15 bg-white/10 p-4 shadow-lg shadow-black/5 backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-200">Filtros de trabajo</p>
              <p className="mt-1 text-sm text-slate-200">
                Ajusta estado, tipo y búsqueda para centrar la operativa del día.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-right">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-200">Contexto</p>
              <p className="mt-1 text-sm font-semibold text-white">{totalOrdenesFiltradas} órdenes visibles</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {FILTROS_ESTADO.map((filtro) => (
              <button
                key={filtro}
                type="button"
                onClick={() => setFiltroEstado(filtro)}
                className={`rounded-full px-3.5 py-2 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-marca-900 ${
                  filtroEstado === filtro ? 'bg-cotepa-rojo-500 text-white shadow-md' : 'bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                {filtro}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-200">Filtrar por tipo de orden</span>
              <select
                value={filtroTipoOrden}
                onChange={(evento) => setFiltroTipoOrden(evento.target.value)}
                className="w-full rounded-xl border border-white/20 bg-marca-900/80 px-3 py-2.5 text-sm text-white transition focus:outline-none focus:ring-2 focus:ring-white/60"
              >
                <option value="todos">Todas</option>
                <option value="averia">Avería</option>
                <option value="pem">PEM (Montaje + Puesta en marcha)</option>
                <option value="montaje">PEM · Montaje</option>
                <option value="puesta_en_marcha">PEM · Puesta en marcha</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-200">Buscar orden</span>
              <input
                value={busquedaOrdenes}
                onChange={(evento) => setBusquedaOrdenes(evento.target.value)}
                className="w-full rounded-xl border border-white/20 bg-marca-900/80 px-3 py-2.5 text-sm text-white placeholder:text-slate-300 transition focus:outline-none focus:ring-2 focus:ring-white/60"
                placeholder="Ticket, cliente, equipo o técnico"
              />
            </label>
          </div>
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
          <div className="grid gap-3 md:grid-cols-3">
            {resumenListado.map((item) => (
              <div key={item.etiqueta} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{item.etiqueta}</p>
                <p className="mt-2 text-xl font-bold text-slate-900">{item.valor}</p>
                <p className="mt-1 text-xs text-slate-500">{item.detalle}</p>
              </div>
            ))}
          </div>

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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-sm">
              <p className="text-xs font-semibold">
                Página {paginaSegura} de {totalPaginas} · {totalOrdenesFiltradas} órdenes
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={paginaSegura === 1}
                  onClick={() => setPaginaActual(1)}
                  className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
                  title="Primera página"
                >
                  «
                </button>
                <button
                  type="button"
                  disabled={paginaSegura === 1}
                  onClick={() => setPaginaActual((p) => p - 1)}
                  className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
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
                      <span key={`ellipsis-${idx}`} className="px-1 text-xs text-slate-400">…</span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPaginaActual(p)}
                        className={`rounded-xl border px-2.5 py-1.5 text-xs font-bold ${
                          p === paginaSegura
                            ? 'border-cotepa-rojo-500 bg-cotepa-rojo-500 text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
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
                  className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
                  title="Página siguiente"
                >
                  ›
                </button>
                <button
                  type="button"
                  disabled={paginaSegura === totalPaginas}
                  onClick={() => setPaginaActual(totalPaginas)}
                  className="rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
                  title="Última página"
                >
                  »
                </button>
              </div>
            </div>
          )}

          {!ordenesListado.length && (
            <div className="flex items-start gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600 shadow-sm">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
              <div>
                <p className="font-semibold text-slate-800">Sin órdenes para el criterio actual</p>
                <p className="mt-1">
                  No hay órdenes disponibles con los filtros y la búsqueda seleccionados. Ajusta el estado, el tipo o el texto de búsqueda para ampliar resultados.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
