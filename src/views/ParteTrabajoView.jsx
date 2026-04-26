import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  obtenerClientes,
  obtenerEquiposPorCliente,
  obtenerTecnicosActivos,
} from '../services/catalogosService';
import { listarMaterialesInventario } from '../services/inventarioMaterialesService';
import { crearParteTrabajo, obtenerOrdenesAbiertasParaParte } from '../services/parteTrabajoService';
import { generarYSubirInformeParte } from '../services/parteTrabajoInformeService';
import { guardarInformePdfUrl } from '../services/workOrderService';
import { tieneConfiguracionSupabase } from '../services/supabaseClient';

function obtenerUbicacionActual() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Este dispositivo no soporta geolocalización.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        resolve({
          latitud: posicion.coords.latitude,
          longitud: posicion.coords.longitude,
          precisionMetros: posicion.coords.accuracy,
          timestamp: posicion.timestamp,
        });
      },
      (err) => {
        reject(new Error(`No se pudo obtener la ubicación (${err.message}).`));
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      },
    );
  });
}

async function resolverNombreLugar(latitud, longitud) {
  try {
    const respuesta = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitud}&lon=${longitud}&zoom=18&addressdetails=1`,
      {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'es',
        },
      },
    );

    if (!respuesta.ok) {
      return null;
    }

    const data = await respuesta.json();
    const address = data.address || {};
    const via = address.road || address.pedestrian || address.footway || address.cycleway || address.path;
    const numero = address.house_number;
    const barrio = address.suburb || address.neighbourhood || address.city_district;
    const localidad = address.city || address.town || address.village || address.municipality;
    const provincia = address.state || address.county;

    const tramoVia = [via, numero].filter(Boolean).join(', ');
    const partes = [tramoVia, barrio, localidad, provincia].filter(Boolean);
    const nombreLugarCompleto = partes.join(' | ') || data.display_name || null;
    const nombreLugarCorto = [localidad, provincia].filter(Boolean).join(' | ') || nombreLugarCompleto;

    return {
      nombreLugar: nombreLugarCorto,
      nombreLugarCompleto,
    };
  } catch {
    return null;
  }
}

function calcularDistanciaMetros(origen, destino) {
  if (!origen || !destino) {
    return null;
  }

  const radioTierra = 6371000;
  const lat1 = (origen.latitud * Math.PI) / 180;
  const lat2 = (destino.latitud * Math.PI) / 180;
  const deltaLat = ((destino.latitud - origen.latitud) * Math.PI) / 180;
  const deltaLon = ((destino.longitud - origen.longitud) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(radioTierra * c);
}

function redondearMinutos(inicioIso, finIso) {
  const inicioMs = new Date(inicioIso).getTime();
  const finMs = new Date(finIso).getTime();
  const diferenciaMs = finMs - inicioMs;

  if (!Number.isFinite(diferenciaMs) || diferenciaMs <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(diferenciaMs / 60000));
}

function formatearUbicacion(ubicacion) {
  if (!ubicacion) {
    return 'No disponible';
  }

  return `${ubicacion.latitud.toFixed(5)}, ${ubicacion.longitud.toFixed(5)}`;
}

function formatearLugar(ubicacion) {
  return ubicacion?.nombreLugar || 'No disponible';
}

const FORM_INICIAL = {
  orden_id: '',
  cliente_id: '',
  equipo_id: '',
  tecnico_id: '',
  nombre_firmante: '',
  descripcion_problema: '',
  materialesTexto: '',
  tiempo_empleado: '60',
  prioridad: 'media',
};

export function ParteTrabajoView() {
  const location = useLocation();
  const prefillAplicadoRef = useRef(false);
  const [formulario, setFormulario] = useState(() => {
    const prefill = location.state?.prefill;
    if (!prefill) return FORM_INICIAL;
    return {
      ...FORM_INICIAL,
      orden_id: prefill.orden_id || '',
      cliente_id: prefill.cliente_id || '',
      equipo_id: prefill.equipo_id || '',
      tecnico_id: prefill.tecnico_id || '',
      descripcion_problema: prefill.descripcion_problema || '',
      prioridad: prefill.prioridad || 'media',
    };
  });
  const [seguimientoTiempo, setSeguimientoTiempo] = useState({
    inicioIso: null,
    finIso: null,
    ubicacionInicio: null,
    ubicacionFin: null,
    distanciaMetros: null,
    minutosGeo: null,
  });
  const [clientes, setClientes] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [ordenesAbiertas, setOrdenesAbiertas] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [materialesInventario, setMaterialesInventario] = useState([]);
  const [materialSeleccionadoId, setMaterialSeleccionadoId] = useState('');
  const [materialSeleccionadoCantidad, setMaterialSeleccionadoCantidad] = useState('1');
  const [materialesSeleccionados, setMaterialesSeleccionados] = useState([]);
  const [fotosIntervencion, setFotosIntervencion] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [capturandoTiempo, setCapturandoTiempo] = useState(false);
  const [firmaClienteDataUrl, setFirmaClienteDataUrl] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const canvasFirmaRef = useRef(null);
  const dibujandoFirmaRef = useRef(false);

  useEffect(() => {
    async function cargarCatalogos() {
      if (!tieneConfiguracionSupabase()) {
        setCargando(false);
        return;
      }

      setCargando(true);
      setError('');

      try {
        const [clientesRsp, tecnicosRsp, materialesRsp] = await Promise.all([
          obtenerClientes({ limite: 100, pagina: 1 }),
          obtenerTecnicosActivos({ limite: 100, pagina: 1 }),
          listarMaterialesInventario({ soloActivos: true }),
        ]);

        setClientes(clientesRsp.items);
        setTecnicos(tecnicosRsp.items);
        setMaterialesInventario(materialesRsp || []);
      } catch (err) {
        setError(err.message || 'No se pudieron cargar los catálogos del parte de trabajo.');
      } finally {
        setCargando(false);
      }
    }

    cargarCatalogos();
  }, []);

  useEffect(() => {
    async function cargarEquipos() {
      if (!formulario.cliente_id || !tieneConfiguracionSupabase()) {
        setEquipos([]);
        setFormulario((prev) => ({ ...prev, equipo_id: '' }));
        return;
      }

      try {
        const equiposRsp = await obtenerEquiposPorCliente(formulario.cliente_id, {
          limite: 100,
          pagina: 1,
        });
        setEquipos(equiposRsp.items);
      } catch (err) {
        setError(err.message || 'No se pudieron cargar los equipos del cliente.');
      }
    }

    cargarEquipos();
  }, [formulario.cliente_id]);

  useEffect(() => {
    async function cargarOrdenesAbiertas() {
      if (!formulario.cliente_id || !formulario.tecnico_id || !tieneConfiguracionSupabase()) {
        setOrdenesAbiertas([]);
        setFormulario((prev) => ({ ...prev, orden_id: '' }));
        return;
      }

      try {
        const ordenes = await obtenerOrdenesAbiertasParaParte({
          cliente_id: formulario.cliente_id,
          tecnico_id: formulario.tecnico_id,
        });
        setOrdenesAbiertas(ordenes);
        setFormulario((prev) => {
          if (prev.orden_id && ordenes.some((orden) => orden.id === prev.orden_id)) {
            return prev;
          }

          return { ...prev, orden_id: '' };
        });
      } catch (err) {
        setError(err.message || 'No se pudieron cargar las ordenes abiertas para el parte.');
      }
    }

    cargarOrdenesAbiertas();
  }, [formulario.cliente_id, formulario.tecnico_id]);

  useEffect(() => {
    prepararCanvasFirma();
  }, []);

  useEffect(() => {
    const prefill = location.state?.prefill;
    if (!prefill || prefillAplicadoRef.current) {
      return;
    }

    prefillAplicadoRef.current = true;
    setMensaje(
      prefill.numero_ticket
        ? `Orden SAT-${prefill.numero_ticket} cargada en el parte.`
        : 'Orden cargada en el parte.',
    );
  }, [location.state]);

  function prepararCanvasFirma() {
    const canvas = canvasFirmaRef.current;
    if (!canvas) {
      return;
    }

    const contexto = canvas.getContext('2d');
    if (!contexto) {
      return;
    }

    contexto.fillStyle = '#ffffff';
    contexto.fillRect(0, 0, canvas.width, canvas.height);
    contexto.lineWidth = 2;
    contexto.lineCap = 'round';
    contexto.lineJoin = 'round';
    contexto.strokeStyle = '#0f172a';
  }

  function limpiarFirma() {
    setFirmaClienteDataUrl('');
    dibujandoFirmaRef.current = false;
    prepararCanvasFirma();
  }

  function obtenerPuntoFirma(evento) {
    const canvas = canvasFirmaRef.current;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    return {
      x: evento.clientX - rect.left,
      y: evento.clientY - rect.top,
    };
  }

  function iniciarTrazoFirma(evento) {
    const canvas = canvasFirmaRef.current;
    if (!canvas) {
      return;
    }

    const contexto = canvas.getContext('2d');
    const punto = obtenerPuntoFirma(evento);
    if (!contexto || !punto) {
      return;
    }

    dibujandoFirmaRef.current = true;
    contexto.beginPath();
    contexto.moveTo(punto.x, punto.y);
  }

  function trazarFirma(evento) {
    if (!dibujandoFirmaRef.current) {
      return;
    }

    const canvas = canvasFirmaRef.current;
    if (!canvas) {
      return;
    }

    const contexto = canvas.getContext('2d');
    const punto = obtenerPuntoFirma(evento);
    if (!contexto || !punto) {
      return;
    }

    contexto.lineTo(punto.x, punto.y);
    contexto.stroke();
  }

  function terminarTrazoFirma() {
    const canvas = canvasFirmaRef.current;
    if (!canvas || !dibujandoFirmaRef.current) {
      return;
    }

    dibujandoFirmaRef.current = false;
    setFirmaClienteDataUrl(canvas.toDataURL('image/png'));
  }

  async function iniciarSeguimientoTiempo() {
    setMensaje('');
    setError('');
    setCapturandoTiempo(true);

    try {
      const ubicacion = await obtenerUbicacionActual();
      const lugarResuelto = await resolverNombreLugar(ubicacion.latitud, ubicacion.longitud);
      setSeguimientoTiempo({
        inicioIso: new Date().toISOString(),
        finIso: null,
        ubicacionInicio: {
          ...ubicacion,
          nombreLugar: lugarResuelto?.nombreLugar || null,
          nombreLugarCompleto: lugarResuelto?.nombreLugarCompleto || null,
        },
        ubicacionFin: null,
        distanciaMetros: null,
        minutosGeo: null,
      });
      setMensaje('Inicio registrado con geolocalización.');
    } catch (err) {
      const inicioIso = new Date().toISOString();
      setSeguimientoTiempo({
        inicioIso,
        finIso: null,
        ubicacionInicio: null,
        ubicacionFin: null,
        distanciaMetros: null,
        minutosGeo: null,
      });
      setFormulario((prev) => ({ ...prev, tiempo_empleado: '1' }));
      setMensaje('Inicio registrado con hora actual (sin geolocalización).');
      setError('');
    } finally {
      setCapturandoTiempo(false);
    }
  }

  async function finalizarSeguimientoTiempo() {
    if (!seguimientoTiempo.inicioIso) {
      setError('Primero debes pulsar Inicio para calcular el tiempo empleado.');
      return;
    }

    setMensaje('');
    setError('');
    setCapturandoTiempo(true);

    try {
      const ubicacionFin = await obtenerUbicacionActual();
      const lugarFinResuelto = await resolverNombreLugar(ubicacionFin.latitud, ubicacionFin.longitud);
      const finIso = new Date().toISOString();
      const minutosCalculados = redondearMinutos(seguimientoTiempo.inicioIso, finIso);
      const ubicacionFinConLugar = {
        ...ubicacionFin,
        nombreLugar: lugarFinResuelto?.nombreLugar || null,
        nombreLugarCompleto: lugarFinResuelto?.nombreLugarCompleto || null,
      };
      const distanciaMetros = calcularDistanciaMetros(seguimientoTiempo.ubicacionInicio, ubicacionFinConLugar);
      const minutosGeo = seguimientoTiempo.ubicacionInicio?.timestamp
        ? redondearMinutos(
          new Date(seguimientoTiempo.ubicacionInicio.timestamp).toISOString(),
          new Date(ubicacionFin.timestamp).toISOString(),
        )
        : minutosCalculados;

      setSeguimientoTiempo((prev) => ({
        ...prev,
        finIso,
        ubicacionFin: ubicacionFinConLugar,
        distanciaMetros,
        minutosGeo,
      }));
      setFormulario((prev) => ({ ...prev, tiempo_empleado: String(minutosCalculados) }));
      setMensaje('Fin registrado. Tiempo empleado calculado automáticamente.');
    } catch (err) {
      const finIso = new Date().toISOString();
      const minutosCalculados = redondearMinutos(seguimientoTiempo.inicioIso, finIso);

      setSeguimientoTiempo((prev) => ({
        ...prev,
        finIso,
        ubicacionFin: null,
        distanciaMetros: null,
        minutosGeo: minutosCalculados,
      }));
      setFormulario((prev) => ({ ...prev, tiempo_empleado: String(minutosCalculados) }));
      setMensaje('Fin registrado con hora actual (sin geolocalización). Tiempo empleado calculado automáticamente.');
      setError('');
    } finally {
      setCapturandoTiempo(false);
    }
  }

  function manejarSeleccionFotos(evento) {
    const archivos = Array.from(evento.target.files || []);
    setFotosIntervencion(archivos);
  }

  function quitarFotoIntervencion(indiceObjetivo) {
    setFotosIntervencion((prev) => prev.filter((_, indice) => indice !== indiceObjetivo));
  }

  async function enviarParte(evento) {
    evento.preventDefault();
    setMensaje('');
    setError('');

    if (!seguimientoTiempo.inicioIso || !seguimientoTiempo.finIso) {
      setError('Debes registrar Inicio y Fin para calcular el tiempo antes de guardar el parte.');
      return;
    }

    if (!firmaClienteDataUrl) {
      setError('La firma del cliente es obligatoria para registrar el parte.');
      return;
    }

    if (!(formulario.nombre_firmante || '').trim()) {
      setError('Debes indicar el nombre de la persona que firma el parte.');
      return;
    }

    setGuardando(true);

    try {
      const parte = await crearParteTrabajo({
        ...formulario,
        orden_id: formulario.orden_id,
        equipo_id: formulario.equipo_id || null,
        tecnico_id: formulario.tecnico_id || null,
        materialesInventario: materialesSeleccionados,
        fotos_intervencion: fotosIntervencion,
        seguimientoTiempo,
        firma_url: firmaClienteDataUrl,
      });

      const clienteSeleccionado = clientes.find((c) => c.id === formulario.cliente_id);
      const equipoSeleccionado = equipos.find((e) => e.id === formulario.equipo_id);
      const tecnicoSeleccionado = tecnicos.find((t) => t.id === formulario.tecnico_id);
      const materialesInventarioTexto = materialesSeleccionados
        .map((uso) => {
          const material = materialesInventario.find((m) => m.id === uso.material_id);
          if (!material) {
            return null;
          }

          const precio = material.precio_ref ?? 'N/D';
          return `${material.nombre};${uso.cantidad};${precio}`;
        })
        .filter(Boolean)
        .join('\n');

      const materialesTextoInforme = [materialesInventarioTexto, formulario.materialesTexto]
        .filter((bloque) => (bloque || '').trim())
        .join('\n');

      const informe = await generarYSubirInformeParte({
        parte,
        formulario: {
          ...formulario,
          materialesTexto: materialesTextoInforme,
        },
        seguimientoTiempo,
        clienteNombre: clienteSeleccionado?.nombre || 'Cliente no identificado',
        equipoNombre: equipoSeleccionado?.nombre || 'Sin equipo',
        tecnicoNombre: tecnicoSeleccionado?.nombre || 'Tecnico no identificado',
        nombreFirmante: formulario.nombre_firmante,
        firmaUrl: parte.firma_url || '',
        fotosIntervencionUrls: parte.fotos_intervencion_urls || [],
      });

      try {
        await guardarInformePdfUrl(parte.id, informe.pdfUrl);
      } catch {
        // No bloqueante: el parte ya se registró correctamente
      }

      setMensaje('Parte registrado. Informe disponible.');
      setFormulario(FORM_INICIAL);
      setSeguimientoTiempo({
        inicioIso: null,
        finIso: null,
        ubicacionInicio: null,
        ubicacionFin: null,
        distanciaMetros: null,
        minutosGeo: null,
      });
      limpiarFirma();
      setEquipos([]);
      setOrdenesAbiertas([]);
      setMaterialesSeleccionados([]);
      setMaterialSeleccionadoId('');
      setMaterialSeleccionadoCantidad('1');
      setFotosIntervencion([]);
    } catch (err) {
      setError(err.message || 'No se pudo registrar el parte de trabajo.');
    } finally {
      setGuardando(false);
    }
  }

  function agregarMaterialInventario() {
    const materialId = materialSeleccionadoId;
    const cantidad = Number.parseInt(materialSeleccionadoCantidad, 10);

    if (!materialId) {
      setError('Selecciona un material de inventario para agregarlo al parte.');
      return;
    }

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      setError('La cantidad del material debe ser mayor que cero.');
      return;
    }

    setError('');
    setMaterialesSeleccionados((prev) => {
      const existente = prev.find((item) => item.material_id === materialId);
      if (existente) {
        return prev.map((item) =>
          item.material_id === materialId ? { ...item, cantidad: item.cantidad + cantidad } : item,
        );
      }

      return [...prev, { material_id: materialId, cantidad }];
    });
    setMaterialSeleccionadoCantidad('1');
  }

  function quitarMaterialInventario(materialId) {
    setMaterialesSeleccionados((prev) => prev.filter((item) => item.material_id !== materialId));
  }

  if (!tieneConfiguracionSupabase()) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
        Configura Supabase en `.env` para usar el formulario de parte de trabajo.
      </section>
    );
  }

  return (
    <section className="space-y-4 pb-20 lg:pb-0">
      <header className="rounded-2xl bg-marca-900 p-4 text-white shadow-lg lg:p-5">
        <h2 className="text-lg font-bold lg:text-xl">Parte de Trabajo</h2>
        <p className="mt-1 text-sm text-slate-200">Registro técnico para cierre operativo de averías.</p>
      </header>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {mensaje && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {mensaje}
        </p>
      )}

      <form onSubmit={enviarParte} className="grid gap-3 rounded-2xl border border-marca-100 bg-white p-4 shadow-tarjeta lg:grid-cols-2 lg:gap-4 lg:p-5">
        <h2 className="text-lg font-bold text-marca-900 lg:col-span-2">Detalle del parte</h2>
        <p className="text-xs text-slate-600 lg:col-span-2">
          El parte puede vincularse a una orden abierta o registrarse como imprevisto sin orden previa.
        </p>
        <p className="text-xs text-slate-500 lg:col-span-2">
          Al guardarlo, la orden vinculada se finaliza. Si no hay orden, se crea una orden imprevista y se finaliza en el mismo paso.
        </p>

        <div className="rounded-xl border border-marca-200 bg-marca-50 p-3 lg:col-span-2">
          <p className="text-xs font-semibold text-marca-900">Control de tiempo por inicio/fin + geolocalización</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={iniciarSeguimientoTiempo}
              disabled={capturandoTiempo || guardando}
              className="rounded-xl border border-marca-300 bg-white px-3 py-2 text-xs font-semibold text-marca-900 disabled:opacity-60"
            >
              Inicio
            </button>
            <button
              type="button"
              onClick={finalizarSeguimientoTiempo}
              disabled={capturandoTiempo || guardando || !seguimientoTiempo.inicioIso}
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-60"
            >
              Fin
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-700">
            Inicio: {seguimientoTiempo.inicioIso ? new Date(seguimientoTiempo.inicioIso).toLocaleString('es-ES') : 'No iniciado'}
          </p>
          <p className="text-xs text-slate-700">
            Fin: {seguimientoTiempo.finIso ? new Date(seguimientoTiempo.finIso).toLocaleString('es-ES') : 'No finalizado'}
          </p>
          <p className="text-xs text-slate-700">Geo inicio: {formatearUbicacion(seguimientoTiempo.ubicacionInicio)}</p>
          <p className="text-xs text-slate-700">Lugar inicio: {formatearLugar(seguimientoTiempo.ubicacionInicio)}</p>
          <p className="text-xs text-slate-700">Geo fin: {formatearUbicacion(seguimientoTiempo.ubicacionFin)}</p>
          <p className="text-xs text-slate-700">Lugar fin: {formatearLugar(seguimientoTiempo.ubicacionFin)}</p>
          <p className="text-xs text-slate-700">
            Distancia geo: {Number.isFinite(seguimientoTiempo.distanciaMetros) ? `${seguimientoTiempo.distanciaMetros} m` : 'No disponible'}
          </p>
          <p className="text-xs text-slate-700">
            Tiempo calculado por geolocalización: {Number.isFinite(seguimientoTiempo.minutosGeo) ? `${seguimientoTiempo.minutosGeo} min` : 'Pendiente'}
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Cliente *</span>
          <select
            required
            value={formulario.cliente_id}
            onChange={(e) =>
              setFormulario((prev) => ({ ...prev, cliente_id: e.target.value, equipo_id: '', orden_id: '' }))
            }
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
            disabled={cargando}
          >
            <option value="">Selecciona cliente</option>
            {clientes.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Equipo</span>
          <select
            value={formulario.equipo_id}
            onChange={(e) => setFormulario((prev) => ({ ...prev, equipo_id: e.target.value }))}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
            disabled={!formulario.cliente_id}
          >
            <option value="">Sin equipo</option>
            {equipos.map((equipo) => (
              <option key={equipo.id} value={equipo.id}>
                {equipo.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Técnico *</span>
          <select
            required
            value={formulario.tecnico_id}
            onChange={(e) => setFormulario((prev) => ({ ...prev, tecnico_id: e.target.value, orden_id: '' }))}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
          >
            <option value="">Selecciona técnico</option>
            {tecnicos.map((tecnico) => (
              <option key={tecnico.id} value={tecnico.id}>
                {tecnico.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Orden abierta (opcional)</span>
          <select
            value={formulario.orden_id}
            onChange={(e) => {
              const ordenId = e.target.value;
              const orden = ordenesAbiertas.find((item) => item.id === ordenId);
              setFormulario((prev) => ({
                ...prev,
                orden_id: ordenId,
                equipo_id: orden?.equipo_id || prev.equipo_id,
                descripcion_problema: orden?.descripcion_averia || prev.descripcion_problema,
                prioridad: orden?.prioridad || prev.prioridad,
              }));
            }}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
            disabled={!formulario.cliente_id || !formulario.tecnico_id}
          >
            <option value="">Sin orden previa (imprevista)</option>
            {ordenesAbiertas.map((orden) => (
              <option key={orden.id} value={orden.id}>
                #{orden.numero_ticket} · {orden.descripcion_averia}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Si no seleccionas orden, el sistema creará una orden imprevista y la cerrará con este parte.
          </p>
        </label>

        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Descripción del problema *</span>
          <textarea
            required
            rows={4}
            value={formulario.descripcion_problema}
            onChange={(e) => setFormulario((prev) => ({ ...prev, descripcion_problema: e.target.value }))}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
            placeholder="Describe la avería reportada"
          />
        </label>

        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Materiales utilizados</span>
          <textarea
            rows={4}
            value={formulario.materialesTexto}
            onChange={(e) => setFormulario((prev) => ({ ...prev, materialesTexto: e.target.value }))}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
            placeholder={"Ejemplo:\nGas R32;1;45.5\nFiltro;2;12"}
          />
        </label>

        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:col-span-2">
          <p className="text-xs font-semibold text-slate-700">Materiales desde inventario (descuenta stock)</p>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <select
                value={materialSeleccionadoId}
                onChange={(e) => setMaterialSeleccionadoId(e.target.value)}
                className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Selecciona material</option>
                {materialesInventario.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.nombre} · stock {material.stock_actual}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={materialSeleccionadoCantidad}
                onChange={(e) => setMaterialSeleccionadoCantidad(e.target.value)}
                className="w-16 rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={agregarMaterialInventario}
              className="w-full rounded-xl bg-marca-900 px-4 py-2 text-sm font-bold text-white"
            >
              Agregar
            </button>
          </div>

          {materialesSeleccionados.length > 0 && (
            <ul className="space-y-1">
              {materialesSeleccionados.map((uso) => {
                const material = materialesInventario.find((item) => item.id === uso.material_id);
                return (
                  <li key={uso.material_id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs">
                    <span>
                      {material?.nombre || 'Material'} · {uso.cantidad} {material?.unidad || 'ud'}
                    </span>
                    <button
                      type="button"
                      onClick={() => quitarMaterialInventario(uso.material_id)}
                      className="rounded-lg bg-rose-100 px-2 py-1 font-semibold text-rose-700"
                    >
                      Quitar
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Tiempo empleado (min) *</span>
          <input
            required
            min="1"
            type="number"
            value={formulario.tiempo_empleado}
            onChange={(e) => setFormulario((prev) => ({ ...prev, tiempo_empleado: e.target.value }))}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Prioridad</span>
          <select
            value={formulario.prioridad}
            onChange={(e) => setFormulario((prev) => ({ ...prev, prioridad: e.target.value }))}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm"
          >
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </label>

        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Informe PDF</span>
          <p className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Al guardar, el informe en PDF se subirá automáticamente al almacenamiento. El administrador podrá descargarlo desde el panel SAT.
          </p>
        </label>

        <div className="rounded-xl border border-slate-300 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Fotos de la intervención</span>
          </div>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={manejarSeleccionFotos}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
          />
          {fotosIntervencion.length > 0 && (
            <ul className="mt-2 space-y-1">
              {fotosIntervencion.map((foto, indice) => (
                <li key={`${foto.name}-${indice}`} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs">
                  <span className="truncate pr-2">{foto.name}</span>
                  <button
                    type="button"
                    onClick={() => quitarFotoIntervencion(indice)}
                    className="rounded-lg bg-rose-100 px-2 py-1 font-semibold text-rose-700"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-300 bg-slate-50 p-3">
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">Nombre de quien firma *</span>
            <input
              required
              type="text"
              value={formulario.nombre_firmante}
              onChange={(e) => setFormulario((prev) => ({ ...prev, nombre_firmante: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              placeholder="Nombre y apellidos"
              maxLength={120}
            />
          </label>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Firma del cliente *</span>
            <button
              type="button"
              onClick={limpiarFirma}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
            >
              Limpiar firma
            </button>
          </div>
          <canvas
            ref={canvasFirmaRef}
            width={320}
            height={140}
            onPointerDown={iniciarTrazoFirma}
            onPointerMove={trazarFirma}
            onPointerUp={terminarTrazoFirma}
            onPointerLeave={terminarTrazoFirma}
            className="w-full rounded-lg border border-slate-300 bg-white"
            style={{ touchAction: 'none' }}
          />
          <p className="mt-1 text-xs text-slate-500">
            Firma requerida para completar el parte.
          </p>
        </div>

        <button
          type="submit"
          disabled={
            guardando
            || cargando
            || !seguimientoTiempo.inicioIso
            || !seguimientoTiempo.finIso
            || !firmaClienteDataUrl
            || !(formulario.nombre_firmante || '').trim()
          }
          className="w-full rounded-2xl bg-cotepa-rojo-500 px-4 py-4 text-sm font-bold text-white disabled:opacity-60 lg:col-span-2"
        >
          {guardando ? 'Guardando parte...' : 'Registrar parte de trabajo'}
        </button>
      </form>
    </section>
  );
}
