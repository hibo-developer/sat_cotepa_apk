import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { ToastEstado } from '../components/ToastEstado';
import { ControlesFlujoSecciones, NavegacionSecciones } from '../components/NavegacionSecciones';
import {
  obtenerClientes,
  obtenerEquiposPorCliente,
  obtenerTecnicosActivos,
} from '../services/catalogosService';
import { crearPartePem, obtenerOrdenesAbiertasParaPartePem } from '../services/partePemService';
import { estaOnline } from '../services/offlineSyncService';
import { abrirGoogleMaps } from '../services/externalNavigationService';
import { tieneConfiguracionSupabase } from '../services/supabaseClient';

async function comprimirImagenA1280(archivo, nombreFinal) {
  if (!archivo) return null;
  const blobEntrada = archivo instanceof Blob ? archivo : null;
  const url = URL.createObjectURL(blobEntrada || archivo);
  try {
    const imagen = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
      img.src = url;
    });

    const ancho = Number(imagen.width || 0);
    const alto = Number(imagen.height || 0);
    if (!Number.isFinite(ancho) || !Number.isFinite(alto) || ancho <= 0 || alto <= 0) {
      return null;
    }

    const maxAncho = 1280;
    const escala = ancho > maxAncho ? maxAncho / ancho : 1;
    const nuevoAncho = Math.round(ancho * escala);
    const nuevoAlto = Math.round(alto * escala);

    const canvas = document.createElement('canvas');
    canvas.width = nuevoAncho;
    canvas.height = nuevoAlto;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(imagen, 0, 0, nuevoAncho, nuevoAlto);

    const blobSalida = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82);
    });
    if (!blobSalida) return null;
    return new File([blobSalida], nombreFinal, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fechaHoyIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizarDireccion(direccion) {
  return String(direccion || '')
    .replace(/[·•]/g, ' ')
    .replace(/N[º°]\s*/gi, 'N ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function construirUrlRutaCliente({ lat, lng, direccion, modoNavegacion = false }) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (Number.isFinite(latNum) && Number.isFinite(lngNum) && !(latNum === 0 && lngNum === 0)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${latNum},${lngNum}&travelmode=driving${modoNavegacion ? '&dir_action=navigate' : ''}`;
  }
  const dir = normalizarDireccion(direccion);
  if (dir) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dir)}&travelmode=driving${modoNavegacion ? '&dir_action=navigate' : ''}`;
  }
  return '';
}

const TEXTO_ACEPTACION_CLIENTE = `ACEPTACIÓN POR PARTE DEL CLIENTE

En el día de hoy se ha finalizado el montaje y se ha realizado con éxito la puesta en marcha de la instalación del equipo asignado.
El cliente verifica que esta corresponde en cuanto a características técnicas y constructivas a lo solicitado.

Asimismo, el cliente DECLARA:

Haber predispuesto las obras de construcción y los locales de colocación de la instalación, así como las conexiones con las redes de suministro, con arreglo a la normativa vigente para la prevención de incendios, de accidentes y de contaminación.
Haber instalado el interruptor magnetotérmico diferencial con poder de ruptura tal que respete las características de la instalación, y haber predispuesto la instalación de puesta a tierra.
Haber obtenido el visto bueno de las autoridades competentes para la instalación del equipo entregado.
Haber recibido el Manual de Uso y Mantenimiento del equipo entregado.
Estar al corriente de los procedimientos de seguridad.
Haber recibido las instrucciones para el correcto funcionamiento, mantenimiento, utilización, límites y prestaciones de la instalación.
Haber asistido a los controles de funcionalidad.
Por último, SE COMPROMETE a atenerse a las instrucciones contenidas en el manual relativas al uso y mantenimiento de la instalación.`;

const SECCIONES_PARTE_PEM = [
  { id: 'pem-datos', label: 'Datos PEM', shortLabel: 'Datos' },
  { id: 'pem-checks', label: 'Verificaciones', shortLabel: 'Checks' },
  { id: 'pem-evidencias', label: 'Evidencias', shortLabel: 'Evidencias' },
  { id: 'pem-firma-envio', label: 'Firma y cierre', shortLabel: 'Firma' },
];
const RESTORE_KEY_PARTE_PEM = 'sat_restore_parte_pem_v1';

export function PartePemView({ rolUsuario, sesion }) {
  const location = useLocation();
  const navigate = useNavigate();
  const prefill = location.state?.prefill || {};

  const [clientes, setClientes] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [ordenesAbiertas, setOrdenesAbiertas] = useState([]);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(false);
  const [toast, setToast] = useState(null);
  const [seccionActiva, setSeccionActiva] = useState(SECCIONES_PARTE_PEM[0].id);
  const [seccionesConErrorManual, setSeccionesConErrorManual] = useState([]);

  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [formulario, setFormulario] = useState(() => ({
    cliente_id: prefill.cliente_id || '',
    tecnico_id: prefill.tecnico_id || '',
    equipo_id: prefill.equipo_id || '',
    orden_id: prefill.orden_id || '',
    tipo_orden: prefill.tipo_orden && prefill.tipo_orden !== 'averia' ? prefill.tipo_orden : '',
    fecha_instalacion: '',
    equipo_matricula: '',
    notas_tecnico: '',
    notas_cliente: '',
    nombre_firmante: '',
  }));

  const [checks, setChecks] = useState({
    verificacion_suministros: '',
    verificacion_funcionamiento: '',
    verificacion_seguridades: '',
    instrucciones_funcionamiento: '',
    instrucciones_mantenimiento: '',
  });

  const [intervension, setIntervension] = useState({
    inicioIso: null,
    finIso: null,
  });

  const [fotosIntervencion, setFotosIntervencion] = useState([]);
  const [previewsFotos, setPreviewsFotos] = useState([]);
  const previewsFotosRef = useRef(new Map());
  const inputFotoCamaraRef = useRef(null);

  const canvasFirmaRef = useRef(null);
  const dibujandoFirmaRef = useRef(false);
  const [firmaClienteDataUrl, setFirmaClienteDataUrl] = useState('');

  const esTecnico = rolUsuario === 'tecnico';
  const puedeUsar = !!sesion && (esTecnico || rolUsuario === 'admin');
  const clienteSeleccionado = clientes.find((c) => c.id === formulario.cliente_id) || null;
  const telefonoCliente = clienteSeleccionado?.telefono ? String(clienteSeleccionado.telefono).trim() : '';
  const telefonoClienteHref = telefonoCliente ? telefonoCliente.replace(/[^\d+]/g, '') : '';
  const direccionCliente = clienteSeleccionado?.direccion ? String(clienteSeleccionado.direccion).trim() : '';
  const latCliente = Number(clienteSeleccionado?.lat);
  const lngCliente = Number(clienteSeleccionado?.lng);
  const tieneCoordsCliente =
    Number.isFinite(latCliente) &&
    Number.isFinite(lngCliente) &&
    !(latCliente === 0 && lngCliente === 0);

  function irASeccionFormulario(id) {
    const nodo = document.getElementById(id);
    if (nodo) {
      nodo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setSeccionActiva(id);
    }
  }

  function resolverSeccionPorCampo(campo) {
    if (!campo) return SECCIONES_PARTE_PEM[0].id;
    if (['verificacion_suministros', 'verificacion_funcionamiento', 'verificacion_seguridades', 'instrucciones_funcionamiento', 'instrucciones_mantenimiento'].includes(campo)) {
      return 'pem-checks';
    }
    if (['nombre_firmante'].includes(campo)) {
      return 'pem-firma-envio';
    }
    if (['cliente_id', 'tecnico_id', 'orden_id', 'equipo_id', 'equipo_matricula', 'tipo_orden', 'fecha_instalacion', 'notas_tecnico', 'notas_cliente'].includes(campo)) {
      return 'pem-datos';
    }
    return 'pem-firma-envio';
  }

  function manejarErrorValidacion(evento) {
    const campo = evento?.target?.name || evento?.target?.id || '';
    const seccion = resolverSeccionPorCampo(campo);
    setSeccionesConErrorManual((prev) => (prev.includes(seccion) ? prev : [...prev, seccion]));
    if (seccionActiva !== seccion) {
      irASeccionFormulario(seccion);
    }
  }

  useEffect(() => {
    if (!tieneConfiguracionSupabase()) {
      setMensaje('Configura Supabase para habilitar los partes PEM.');
      return;
    }

    setCargandoCatalogos(true);
    Promise.all([
      obtenerClientes({ busqueda: '', limite: 200, pagina: 1 }).then((rsp) => rsp.items || []),
      obtenerTecnicosActivos({ busqueda: '', limite: 200, pagina: 1 }).then((rsp) => rsp.items || []),
    ])
      .then(([clientesRsp, tecnicosRsp]) => {
        setClientes(clientesRsp);
        setTecnicos(tecnicosRsp);
      })
      .catch((err) => {
        setError(err.message || 'No se pudieron cargar catálogos.');
      })
      .finally(() => setCargandoCatalogos(false));
  }, []);

  useEffect(() => {
    async function cargarEquipos() {
      if (!formulario.cliente_id || !tieneConfiguracionSupabase()) {
        setEquipos([]);
        setFormulario((prev) => ({ ...prev, equipo_id: prev.orden_id ? prev.equipo_id : '' }));
        return;
      }

      try {
        const rsp = await obtenerEquiposPorCliente(formulario.cliente_id, { busqueda: '', limite: 200, pagina: 1 });
        setEquipos(rsp.items || []);
      } catch (err) {
        setEquipos([]);
        setError(err.message || 'No se pudieron cargar los equipos del cliente.');
      }
    }
    cargarEquipos();
  }, [formulario.cliente_id]);

  useEffect(() => {
    async function cargarOrdenesAbiertas() {
      if (!formulario.cliente_id || !formulario.tecnico_id || !tieneConfiguracionSupabase()) {
        setOrdenesAbiertas([]);
        return;
      }
      try {
        const rsp = await obtenerOrdenesAbiertasParaPartePem({
          cliente_id: formulario.cliente_id,
          tecnico_id: formulario.tecnico_id,
        });
        setOrdenesAbiertas(rsp || []);
      } catch (err) {
        setOrdenesAbiertas([]);
        setError(err.message || 'No se pudieron cargar órdenes PEM abiertas.');
      }
    }
    cargarOrdenesAbiertas();
  }, [formulario.cliente_id, formulario.tecnico_id]);

  useEffect(() => {
    const mapa = previewsFotosRef.current;
    const nuevos = [];
    const activos = new Set();
    fotosIntervencion.forEach((foto) => {
      const clave = `${foto.name}-${foto.size}-${foto.lastModified}`;
      activos.add(clave);
      let url = mapa.get(clave);
      if (!url) {
        url = URL.createObjectURL(foto);
        mapa.set(clave, url);
      }
      nuevos.push({ clave, url, nombre: foto.name });
    });
    for (const [clave, url] of Array.from(mapa.entries())) {
      if (!activos.has(clave)) {
        URL.revokeObjectURL(url);
        mapa.delete(clave);
      }
    }
    setPreviewsFotos(nuevos);
  }, [fotosIntervencion]);

  useEffect(() => () => {
    const mapa = previewsFotosRef.current;
    for (const url of mapa.values()) {
      URL.revokeObjectURL(url);
    }
    mapa.clear();
  }, []);

  useEffect(() => {
    const observables = SECCIONES_PARTE_PEM
      .map((seccion) => document.getElementById(seccion.id))
      .filter(Boolean);

    if (observables.length === 0) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibles = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visibles[0]?.target?.id) {
          setSeccionActiva(visibles[0].target.id);
        }
      },
      {
        threshold: [0.35, 0.6],
        rootMargin: '-120px 0px -40% 0px',
      },
    );

    observables.forEach((nodo) => observer.observe(nodo));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (location.state?.prefill) {
      return;
    }

    try {
      const raw = sessionStorage.getItem(RESTORE_KEY_PARTE_PEM);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') {
        return;
      }

      const seccionGuardada = parsed.seccionActiva;
      const scrollGuardado = Number(parsed.scrollY);

      window.requestAnimationFrame(() => {
        if (seccionGuardada && SECCIONES_PARTE_PEM.some((item) => item.id === seccionGuardada)) {
          irASeccionFormulario(seccionGuardada);
        }
        if (Number.isFinite(scrollGuardado) && scrollGuardado > 0) {
          window.scrollTo({ top: scrollGuardado, behavior: 'auto' });
        }
      });
    } catch {
      // noop
    }
  }, [location.state?.prefill]);

  useEffect(() => {
    function guardarPosicion() {
      try {
        sessionStorage.setItem(RESTORE_KEY_PARTE_PEM, JSON.stringify({
          seccionActiva,
          scrollY: window.scrollY,
          ts: Date.now(),
        }));
      } catch {
        // noop
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        guardarPosicion();
      }
    };

    window.addEventListener('beforeunload', guardarPosicion);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      guardarPosicion();
      window.removeEventListener('beforeunload', guardarPosicion);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [seccionActiva]);

  function prepararCanvasFirma() {
    const canvas = canvasFirmaRef.current;
    if (!canvas) return;
    const contexto = canvas.getContext('2d');
    if (!contexto) return;
    contexto.fillStyle = '#ffffff';
    contexto.fillRect(0, 0, canvas.width, canvas.height);
    contexto.lineWidth = 2;
    contexto.lineCap = 'round';
    contexto.lineJoin = 'round';
    contexto.strokeStyle = '#0f172a';
  }

  useEffect(() => {
    prepararCanvasFirma();
  }, []);

  function limpiarFirma() {
    setFirmaClienteDataUrl('');
    dibujandoFirmaRef.current = false;
    prepararCanvasFirma();
  }

  function obtenerPuntoFirma(evento) {
    const canvas = canvasFirmaRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: evento.clientX - rect.left, y: evento.clientY - rect.top };
  }

  function iniciarTrazoFirma(evento) {
    const canvas = canvasFirmaRef.current;
    if (!canvas) return;
    const contexto = canvas.getContext('2d');
    const punto = obtenerPuntoFirma(evento);
    if (!contexto || !punto) return;
    dibujandoFirmaRef.current = true;
    contexto.beginPath();
    contexto.moveTo(punto.x, punto.y);
  }

  function trazarFirma(evento) {
    if (!dibujandoFirmaRef.current) return;
    const canvas = canvasFirmaRef.current;
    if (!canvas) return;
    const contexto = canvas.getContext('2d');
    const punto = obtenerPuntoFirma(evento);
    if (!contexto || !punto) return;
    contexto.lineTo(punto.x, punto.y);
    contexto.stroke();
  }

  function terminarTrazoFirma() {
    const canvas = canvasFirmaRef.current;
    if (!canvas || !dibujandoFirmaRef.current) return;
    dibujandoFirmaRef.current = false;
    setFirmaClienteDataUrl(canvas.toDataURL('image/png'));
  }

  async function manejarSeleccionFotos(evento) {
    const archivos = Array.from(evento.target.files || []);
    evento.target.value = '';
    if (archivos.length === 0) return;

    const maxPermitidas = 10;
    const disponibles = Math.max(0, maxPermitidas - fotosIntervencion.length);
    if (disponibles === 0) {
      setError('Límite alcanzado: máximo 10 fotos por parte.');
      return;
    }

    const ticket = ordenesAbiertas.find((o) => o.id === formulario.orden_id)?.numero_ticket || prefill.numero_ticket || null;
    const otRef = ticket ? String(ticket) : (formulario.orden_id ? String(formulario.orden_id).slice(0, 8) : 'sin_ot');
    const base = `ot_${otRef}_pem_`;

    let contador = fotosIntervencion.length;
    const procesadas = [];
    for (const archivo of archivos.slice(0, disponibles)) {
      contador += 1;
      const nombreFinal = `${base}${String(contador).padStart(2, '0')}.jpg`;
      const comprimida = await comprimirImagenA1280(archivo, nombreFinal);
      if (comprimida) procesadas.push(comprimida);
    }

    if (procesadas.length === 0) return;

    setFotosIntervencion((previas) => {
      const mapa = new Map();
      [...previas, ...procesadas].forEach((archivo) => {
        const clave = `${archivo.name}-${archivo.size}-${archivo.lastModified}`;
        mapa.set(clave, archivo);
      });
      return Array.from(mapa.values()).slice(0, maxPermitidas);
    });
  }

  function quitarFotoIntervencion(indiceObjetivo) {
    setFotosIntervencion((prev) => prev.filter((_, indice) => indice !== indiceObjetivo));
  }

  function mostrarToast(siguienteToast) {
    setToast({ id: Date.now(), ...siguienteToast });
  }

  async function abrirRutaCliente() {
    const cliente = clientes.find((c) => c.id === formulario.cliente_id);
    if (!cliente) {
      setError('Selecciona un cliente para abrir la ruta.');
      return;
    }

    const modoNavegacion = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    const url = construirUrlRutaCliente({
      lat: cliente.lat,
      lng: cliente.lng,
      direccion: cliente.direccion,
      modoNavegacion,
    });
    if (!url) {
      setError('El cliente no tiene coordenadas ni dirección para abrir la ruta.');
      return;
    }

    setError('');
    setMensaje('');

    if (modoNavegacion) {
      try {
        const rsp = await abrirGoogleMaps({ lat: cliente.lat, lng: cliente.lng, address: cliente.direccion || '' });
        if (rsp?.opened) {
          return;
        }
      } catch {
        // noop
      }
      try {
        window.location.href = url;
        return;
      } catch {
        // noop
      }
      setTimeout(() => {
        try {
          window.open(url, '_blank', 'noopener,noreferrer');
        } catch {
          // noop
        }
      }, 400);
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function enviarParte(evento) {
    evento.preventDefault();
    setError('');
    setMensaje('');

    if (!tieneConfiguracionSupabase()) {
      setError('Configura Supabase para registrar el parte PEM.');
      return;
    }

    if (!estaOnline()) {
      setError('No puedes enviar un parte PEM sin conexión. Conecta a internet y vuelve a intentarlo.');
      return;
    }

    if (!firmaClienteDataUrl) {
      setSeccionesConErrorManual((prev) => (prev.includes('pem-firma-envio') ? prev : [...prev, 'pem-firma-envio']));
      irASeccionFormulario('pem-firma-envio');
      setError('La firma digital del cliente es obligatoria para registrar el parte PEM.');
      return;
    }

    setEnviando(true);
    try {
      // Registrar automáticamente fechas de intervención al cerrar el parte
      const ahoraIso = new Date().toISOString();
      const intervensionFinal = {
        inicioIso: intervension.inicioIso || ahoraIso,
        finIso: ahoraIso,
      };
      const fechaInstalacionFinal = formulario.fecha_instalacion || fechaHoyIso();

      const resultado = await crearPartePem({
        orden_id: formulario.orden_id || null,
        cliente_id: formulario.cliente_id,
        tecnico_id: formulario.tecnico_id,
        equipo_id: formulario.equipo_id,
        tipo_orden: formulario.tipo_orden,
        fecha_instalacion: fechaInstalacionFinal,
        equipo_matricula: formulario.equipo_matricula,
        notas_tecnico: formulario.notas_tecnico,
        notas_cliente: formulario.notas_cliente,
        checks,
        intervension: intervensionFinal,
        fotos_intervencion: fotosIntervencion,
        nombre_firmante: formulario.nombre_firmante,
        firma_url: firmaClienteDataUrl,
        prioridad: 'media',
      });

      setMensaje(`Parte PEM registrado correctamente. OT #${resultado.numero_ticket || ''}`.trim());
      mostrarToast({
        tipo: 'exito',
        titulo: 'Parte PEM registrado',
        descripcion: 'La orden se ha cerrado y el parte PEM quedó guardado.',
      });
      setError('');

      setFormulario({
        cliente_id: '',
        tecnico_id: '',
        equipo_id: '',
        orden_id: '',
        tipo_orden: '',
        fecha_instalacion: '',
        equipo_matricula: '',
        notas_tecnico: '',
        notas_cliente: '',
        nombre_firmante: '',
      });
      setChecks({
        verificacion_suministros: '',
        verificacion_funcionamiento: '',
        verificacion_seguridades: '',
        instrucciones_funcionamiento: '',
        instrucciones_mantenimiento: '',
      });
      setIntervension({ inicioIso: null, finIso: null });
      setFotosIntervencion([]);
      setSeccionActiva(SECCIONES_PARTE_PEM[0].id);
      setSeccionesConErrorManual([]);
      limpiarFirma();

      navigate('/ordenes', { replace: true });
    } catch (err) {
      setError(err.message || 'No se pudo registrar el parte PEM.');
      mostrarToast({
        tipo: 'error',
        titulo: 'No se pudo registrar',
        descripcion: err.message || 'Revisa los campos obligatorios y vuelve a intentarlo.',
      });
    } finally {
      setEnviando(false);
    }
  }

  const checksProgreso = [
    { seccion: 'pem-datos', ok: Boolean(formulario.cliente_id) },
    { seccion: 'pem-datos', ok: Boolean(formulario.tecnico_id) },
    { seccion: 'pem-datos', ok: Boolean(formulario.equipo_id) },
    { seccion: 'pem-datos', ok: Boolean((formulario.equipo_matricula || '').trim()) },
    { seccion: 'pem-datos', ok: Boolean(formulario.tipo_orden) },
    { seccion: 'pem-checks', ok: Boolean(checks.verificacion_suministros) },
    { seccion: 'pem-checks', ok: Boolean(checks.verificacion_funcionamiento) },
    { seccion: 'pem-checks', ok: Boolean(checks.verificacion_seguridades) },
    { seccion: 'pem-checks', ok: Boolean(checks.instrucciones_funcionamiento) },
    { seccion: 'pem-checks', ok: Boolean(checks.instrucciones_mantenimiento) },
    { seccion: 'pem-firma-envio', ok: Boolean((formulario.nombre_firmante || '').trim()) },
    { seccion: 'pem-firma-envio', ok: Boolean(firmaClienteDataUrl) },
  ];
  const totalChecks = checksProgreso.length;
  const checksCompletados = checksProgreso.filter((item) => item.ok).length;
  const porcentajeCompletado = totalChecks > 0 ? Math.round((checksCompletados / totalChecks) * 100) : 0;
  const seccionesConCheckIncompleto = Array.from(new Set(checksProgreso.filter((item) => !item.ok).map((item) => item.seccion)));
  const seccionesCompletadas = SECCIONES_PARTE_PEM
    .filter((seccion) => {
      const checksSeccion = checksProgreso.filter((item) => item.seccion === seccion.id);
      return checksSeccion.length === 0 || checksSeccion.every((item) => item.ok);
    })
    .map((item) => item.id);
  const seccionesConError = Array.from(
    new Set([
      ...seccionesConErrorManual.filter((item) => seccionesConCheckIncompleto.includes(item)),
      ...seccionesConCheckIncompleto,
    ]),
  );
  const indiceSeccionActual = Math.max(1, SECCIONES_PARTE_PEM.findIndex((item) => item.id === seccionActiva) + 1);

  if (!puedeUsar) {
    return (
      <section className="space-y-3">
        <header className="rounded-2xl bg-marca-900 p-4 text-white shadow-tarjeta">
          <h2 className="text-lg font-bold lg:text-xl">Parte PEM</h2>
          <p className="mt-1 text-sm text-slate-200">Puesta en Marcha y Montajes.</p>
        </header>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          No tienes sesión activa o permisos para registrar un parte PEM.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <header className="rounded-2xl bg-marca-900 p-4 text-white shadow-tarjeta">
        <h2 className="text-lg font-bold lg:text-xl">Parte PEM</h2>
        <p className="mt-1 text-sm text-slate-200">Puesta en Marcha y Montajes.</p>
      </header>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {mensaje && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {mensaje}
        </p>
      )}

      <form onSubmit={enviarParte} onInvalidCapture={manejarErrorValidacion} className="grid gap-3 rounded-2xl border border-marca-100 bg-white p-4 shadow-tarjeta lg:grid-cols-2 lg:gap-4 lg:p-5">
        <h2 className="text-lg font-bold text-marca-900 lg:col-span-2">Detalle del parte PEM</h2>

        <NavegacionSecciones
          secciones={SECCIONES_PARTE_PEM}
          seccionActiva={seccionActiva}
          onIrSeccion={irASeccionFormulario}
          seccionesConError={seccionesConError}
          seccionesCompletadas={seccionesCompletadas}
          resumenProgreso={{
            indiceActual: indiceSeccionActual,
            totalSecciones: SECCIONES_PARTE_PEM.length,
            porcentaje: porcentajeCompletado,
          }}
          className="lg:col-span-2"
        />

        <div id="pem-datos" className="scroll-mt-44 rounded-xl border border-marca-200 bg-marca-50 px-3 py-2 lg:col-span-2">
          <p className="text-xs font-bold uppercase tracking-wide text-marca-800">Sección 1 · Datos PEM</p>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-sat-muted">Cliente *</span>
          <select
            name="cliente_id"
            required
            value={formulario.cliente_id}
            onChange={(e) => {
              const clienteId = e.target.value;
              setFormulario((prev) => ({
                ...prev,
                cliente_id: clienteId,
                equipo_id: '',
                orden_id: '',
              }));
              setOrdenesAbiertas([]);
              setEquipos([]);
            }}
            className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
            disabled={cargandoCatalogos}
          >
            <option value="">Selecciona cliente</option>
            {clientes.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nombre}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={abrirRutaCliente}
            className="mt-2 w-full rounded-xl border border-sat-border bg-white px-4 py-3 text-sm font-bold text-sat-muted active:scale-95 disabled:opacity-60"
            disabled={!formulario.cliente_id}
          >
            Iniciar ruta al cliente
          </button>
          {clienteSeleccionado && (
            <div className="mt-2 space-y-1 rounded-xl border border-sat-border-soft bg-sat-surface px-3 py-2 text-xs text-sat-muted">
              <p className="font-semibold text-sat-text">{clienteSeleccionado.nombre}</p>
              {direccionCliente && (
                <p>
                  <span className="font-semibold">Dirección:</span> {direccionCliente}
                </p>
              )}
              {telefonoCliente && (
                <p>
                  <span className="font-semibold">Teléfono:</span>{' '}
                  {telefonoClienteHref ? (
                    <a className="font-bold text-marca-800 underline" href={`tel:${telefonoClienteHref}`}>
                      {telefonoCliente}
                    </a>
                  ) : (
                    <span className="font-semibold">{telefonoCliente}</span>
                  )}
                </p>
              )}
              {tieneCoordsCliente && (
                <p>
                  <span className="font-semibold">Coordenadas:</span> {latCliente.toFixed(5)}, {lngCliente.toFixed(5)}
                </p>
              )}
            </div>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-sat-muted">Técnico responsable *</span>
          <select
            name="tecnico_id"
            required
            value={formulario.tecnico_id}
            onChange={(e) => {
              const tecnicoId = e.target.value;
              setFormulario((prev) => ({
                ...prev,
                tecnico_id: tecnicoId,
                orden_id: '',
              }));
              setOrdenesAbiertas([]);
            }}
            className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
            disabled={cargandoCatalogos}
          >
            <option value="">Selecciona técnico</option>
            {tecnicos.map((tecnico) => (
              <option key={tecnico.id} value={tecnico.id}>
                {tecnico.nombre}
                {tecnico.especialidad ? ` (${tecnico.especialidad})` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-sat-muted">Orden PEM abierta (opcional)</span>
          <select
            name="orden_id"
            value={formulario.orden_id}
            onChange={(e) => {
              const ordenId = e.target.value;
              const orden = ordenesAbiertas.find((item) => item.id === ordenId);
              setFormulario((prev) => ({
                ...prev,
                orden_id: ordenId,
                equipo_id: orden?.equipo_id || prev.equipo_id,
                tipo_orden: orden?.tipo_orden || prev.tipo_orden,
              }));
            }}
            className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
            disabled={!formulario.cliente_id || !formulario.tecnico_id}
          >
            <option value="">Sin orden previa (crear y cerrar en el envío)</option>
            {ordenesAbiertas.map((orden) => (
              <option key={orden.id} value={orden.id}>
                #{orden.numero_ticket} · {orden.descripcion_averia}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-sat-muted">Equipo a intervenir *</span>
          <select
            name="equipo_id"
            required
            value={formulario.equipo_id}
            onChange={(e) => setFormulario((prev) => ({ ...prev, equipo_id: e.target.value }))}
            className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
            disabled={!formulario.cliente_id}
          >
            <option value="">Selecciona equipo</option>
            {equipos.map((equipo) => (
              <option key={equipo.id} value={equipo.id}>
                {equipo.nombre}
                {equipo.marca ? ` - ${equipo.marca}` : ''}
                {equipo.modelo ? ` ${equipo.modelo}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-sat-muted">Matrícula del equipo *</span>
          <input
            name="equipo_matricula"
            required
            value={formulario.equipo_matricula}
            onChange={(e) => setFormulario((prev) => ({ ...prev, equipo_matricula: e.target.value }))}
            className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
            placeholder="Ej: 1234-ABC"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-sat-muted">Tipo de operación *</span>
          <select
            name="tipo_orden"
            required
            value={formulario.tipo_orden}
            onChange={(e) => setFormulario((prev) => ({ ...prev, tipo_orden: e.target.value }))}
            className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
          >
            <option value="">Selecciona</option>
            <option value="montaje">Montaje</option>
            <option value="puesta_en_marcha">Puesta en marcha</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-sat-muted">Fecha de instalación *</span>
          <input
            name="fecha_instalacion"
            required
            readOnly
            value={formulario.fecha_instalacion}
            className="w-full rounded-xl border border-sat-border bg-sat-surface px-4 py-3 text-sm"
            placeholder="Se autocompleta automáticamente al enviar el parte"
          />
        </label>



        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-sat-muted">Notas del técnico</span>
          <textarea
            name="notas_tecnico"
            value={formulario.notas_tecnico}
            onChange={(e) => setFormulario((prev) => ({ ...prev, notas_tecnico: e.target.value }))}
            rows={3}
            className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
            placeholder="Observaciones del montaje / puesta en marcha"
          />
        </label>

        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-sat-muted">Notas del cliente</span>
          <textarea
            name="notas_cliente"
            value={formulario.notas_cliente}
            onChange={(e) => setFormulario((prev) => ({ ...prev, notas_cliente: e.target.value }))}
            rows={3}
            className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
            placeholder="Comentarios del cliente"
          />
        </label>

        <ControlesFlujoSecciones
          secciones={SECCIONES_PARTE_PEM}
          seccionActiva={seccionActiva}
          onIrSeccion={irASeccionFormulario}
          className="lg:col-span-2"
        />

        <div id="pem-checks" className="scroll-mt-44 rounded-xl border border-marca-200 bg-marca-50 px-3 py-2 lg:col-span-2">
          <p className="text-xs font-bold uppercase tracking-wide text-marca-800">Sección 2 · Verificaciones</p>
        </div>

        <div className="space-y-2 rounded-2xl border border-sat-border-soft bg-sat-surface p-4 lg:col-span-2">
          <h3 className="text-sm font-bold text-sat-text">Acciones realizadas (obligatorias)</h3>

          {[
            ['verificacion_suministros', 'Verificación de suministros del equipo efectuada'],
            ['verificacion_funcionamiento', 'Verificación de funcionamiento del equipo efectuada'],
            ['verificacion_seguridades', 'Verificación de seguridades del equipo efectuadas'],
            ['instrucciones_funcionamiento', 'Instrucciones al cliente del funcionamiento del equipo efectuadas'],
            ['instrucciones_mantenimiento', 'Instrucciones al cliente sobre normas de mantenimiento del equipo efectuadas'],
          ].map(([clave, etiqueta]) => (
            <label key={clave} className="block">
              <span className="mb-1 block text-xs font-semibold text-sat-muted">{etiqueta} *</span>
              <select
                name={clave}
                required
                value={checks[clave]}
                onChange={(e) => setChecks((prev) => ({ ...prev, [clave]: e.target.value }))}
                className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
              >
                <option value="">Selecciona</option>
                <option value="si">Sí</option>
                <option value="no">No</option>
                <option value="na">N/A</option>
              </select>
            </label>
          ))}
        </div>

        <ControlesFlujoSecciones
          secciones={SECCIONES_PARTE_PEM}
          seccionActiva={seccionActiva}
          onIrSeccion={irASeccionFormulario}
          className="lg:col-span-2"
        />

        <div id="pem-evidencias" className="scroll-mt-44 rounded-xl border border-marca-200 bg-marca-50 px-3 py-2 lg:col-span-2">
          <p className="text-xs font-bold uppercase tracking-wide text-marca-800">Sección 3 · Evidencias</p>
        </div>

        <div className="space-y-2 rounded-2xl border border-sat-border-soft bg-white p-4 lg:col-span-2">
          <h3 className="text-sm font-bold text-sat-text">Fotos vinculadas a la intervención</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputFotoCamaraRef.current?.click()}
              className="rounded-xl bg-marca-700 px-4 py-3 text-sm font-bold text-white active:scale-95 disabled:opacity-60"
              disabled={enviando}
            >
              Tomar foto
            </button>
            <label className="cursor-pointer rounded-xl border border-sat-border bg-white px-4 py-3 text-sm font-bold text-sat-muted active:scale-95">
              Subir desde galería
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={manejarSeleccionFotos}
                className="hidden"
              />
            </label>
          </div>
          <input
            ref={inputFotoCamaraRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={manejarSeleccionFotos}
            className="hidden"
          />
          <p className="text-[11px] text-sat-muted">
            Máximo 10 fotos. En móvil, "Tomar foto" abre la cámara.
          </p>
          {fotosIntervencion.length > 0 && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-sat-muted">{fotosIntervencion.length} foto(s) seleccionadas</p>
              <button
                type="button"
                onClick={() => setFotosIntervencion([])}
                className="rounded-lg border border-sat-border bg-white px-3 py-2 text-xs font-bold text-sat-muted"
              >
                Quitar todas
              </button>
            </div>
          )}
          {previewsFotos.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {previewsFotos.map((prev, indice) => (
                <div key={prev.clave} className="rounded-xl border border-sat-border-soft bg-sat-surface p-2">
                  <img src={prev.url} alt={prev.nombre} className="h-24 w-full rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => quitarFotoIntervencion(indice)}
                    className="mt-2 w-full rounded-lg bg-rose-600 px-2 py-1 text-xs font-bold text-white"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <ControlesFlujoSecciones
          secciones={SECCIONES_PARTE_PEM}
          seccionActiva={seccionActiva}
          onIrSeccion={irASeccionFormulario}
          className="lg:col-span-2"
        />

        <div id="pem-firma-envio" className="scroll-mt-44 rounded-xl border border-marca-200 bg-marca-50 px-3 py-2 lg:col-span-2">
          <p className="text-xs font-bold uppercase tracking-wide text-marca-800">Sección 4 · Firma y cierre</p>
        </div>

        <label className="block lg:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-sat-muted">Nombre del cliente *</span>
          <input
            name="nombre_firmante"
            required
            value={formulario.nombre_firmante}
            onChange={(e) => setFormulario((prev) => ({ ...prev, nombre_firmante: e.target.value }))}
            className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
            placeholder="Nombre y apellidos"
          />
        </label>

        <div className="space-y-2 rounded-2xl border border-sat-border-soft bg-sat-surface p-4 lg:col-span-2">
          <h3 className="text-sm font-bold text-sat-text">Aceptación por parte del cliente</h3>
          <div className="whitespace-pre-line rounded-xl border border-sat-border-soft bg-white p-3 text-xs text-sat-muted">
            {TEXTO_ACEPTACION_CLIENTE}
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-sat-border-soft bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-sat-text">Firma digital del cliente *</h3>
            <button
              type="button"
              onClick={limpiarFirma}
              className="rounded-lg border border-sat-border bg-white px-3 py-2 text-xs font-bold text-sat-muted"
            >
              Limpiar firma
            </button>
          </div>
          <canvas
            ref={canvasFirmaRef}
            width={900}
            height={240}
            onPointerDown={iniciarTrazoFirma}
            onPointerMove={trazarFirma}
            onPointerUp={terminarTrazoFirma}
            onPointerLeave={terminarTrazoFirma}
            className="h-40 w-full rounded-xl border border-sat-border bg-white touch-none"
          />
          {!firmaClienteDataUrl && (
            <p className="text-xs font-semibold text-rose-700">
              La firma es obligatoria. Dibuja la firma en el recuadro.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={enviando || cargandoCatalogos}
          className="w-full rounded-2xl bg-cotepa-rojo-500 px-4 py-4 text-sm font-bold text-white active:scale-95 disabled:opacity-60 lg:col-span-2"
        >
          {enviando ? 'Enviando parte PEM...' : 'Cerrar orden y registrar parte PEM'}
        </button>

        <div className="lg:col-span-2">
          <ControlesFlujoSecciones
            secciones={SECCIONES_PARTE_PEM}
            seccionActiva={seccionActiva}
            onIrSeccion={irASeccionFormulario}
          />
        </div>
      </form>

      <ToastEstado toast={toast} onClose={() => setToast(null)} />
    </section>
  );
}
