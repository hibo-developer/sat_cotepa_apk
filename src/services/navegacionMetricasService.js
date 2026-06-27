const STORAGE_KEY = 'sat_nav_metrics_v1';
const MAX_REGISTROS = 300;

function leerMetricas() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function obtenerMetricasNavegacion() {
  return leerMetricas();
}

export function limpiarMetricasNavegacion() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}

function guardarMetricas(registros) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registros.slice(-MAX_REGISTROS)));
  } catch {
    // noop
  }
}

function pushMetrica(registro) {
  const actuales = leerMetricas();
  actuales.push({
    ...registro,
    timestamp: new Date().toISOString(),
  });
  guardarMetricas(actuales);

  if (import.meta.env.DEV) {
    // Util para validar metricas en desarrollo sin depender de backend.
    // eslint-disable-next-line no-console
    console.info('[SAT][metricas-nav]', registro);
  }
}

export function registrarNavegacionSeccion({ vista, desde, hacia, origen, duracionMs }) {
  pushMetrica({
    tipo: 'navegacion_seccion',
    vista,
    desde,
    hacia,
    origen,
    duracionMs: Number.isFinite(duracionMs) ? Math.round(duracionMs) : null,
  });
}

export function registrarErrorValidacion({ vista, campo, seccion }) {
  pushMetrica({
    tipo: 'error_validacion',
    vista,
    campo,
    seccion,
  });
}

export function registrarRetornoRapido({ vista, accion, scrollOrigen, scrollDestino }) {
  pushMetrica({
    tipo: 'retorno_rapido',
    vista,
    accion,
    scrollOrigen,
    scrollDestino,
    distanciaReducida: Number.isFinite(scrollOrigen) && Number.isFinite(scrollDestino)
      ? Math.max(0, Math.round(scrollOrigen - scrollDestino))
      : null,
  });
}

export function obtenerResumenMetricasNavegacion() {
  const registros = leerMetricas();
  const navegaciones = registros.filter((item) => item.tipo === 'navegacion_seccion');
  const errores = registros.filter((item) => item.tipo === 'error_validacion');
  const retornos = registros.filter((item) => item.tipo === 'retorno_rapido');

  const mediaNavMs = navegaciones.length
    ? Math.round(
      navegaciones.reduce((acc, item) => acc + (Number(item.duracionMs) || 0), 0) / navegaciones.length,
    )
    : null;

  return {
    totalRegistros: registros.length,
    navegaciones: navegaciones.length,
    erroresValidacion: errores.length,
    retornosRapidos: retornos.length,
    mediaNavegacionMs: mediaNavMs,
  };
}
