export const UBICACION_COTEPA = {
  latitud: 39.4415,
  longitud: -0.3820,
  nombreLugar: 'Cotepa S.L., Paiporta',
  nombreLugarCompleto: 'Pol. Industrial La Pasqualeta, Calle Sequía de Rascanya, 46200 Paiporta, Valencia',
};

export const FACTOR_RODEO_CARRETERA = 1.3;

export function calcularDistanciaMetros(origen, destino) {
  if (!origen || !destino) {
    return null;
  }

  const latOrigen = Number(origen.latitud);
  const lngOrigen = Number(origen.longitud);
  const latDestino = Number(destino.latitud);
  const lngDestino = Number(destino.longitud);
  if (![latOrigen, lngOrigen, latDestino, lngDestino].every(Number.isFinite)) {
    return null;
  }

  const radioTierra = 6371000;
  const lat1 = (latOrigen * Math.PI) / 180;
  const lat2 = (latDestino * Math.PI) / 180;
  const deltaLat = ((latDestino - latOrigen) * Math.PI) / 180;
  const deltaLon = ((lngDestino - lngOrigen) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(radioTierra * c);
}

export function calcularDistanciaFacturableMetros(origen, destino) {
  const distanciaBase = calcularDistanciaMetros(origen, destino);
  if (!Number.isFinite(distanciaBase)) {
    return null;
  }

  return Math.round(distanciaBase * FACTOR_RODEO_CARRETERA);
}

export function obtenerCoordenadasCliente(cliente) {
  const latitud = Number(cliente?.lat);
  const longitud = Number(cliente?.lng);
  if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) {
    return null;
  }

  return { latitud, longitud };
}

export function resolverDestinoFacturable({ cliente, ubicacionActual }) {
  const coordenadasCliente = obtenerCoordenadasCliente(cliente);
  if (coordenadasCliente) {
    return {
      destino: coordenadasCliente,
      fuente: 'cliente',
      coordenadasCliente,
      desviacionGpsMetros: calcularDistanciaMetros(coordenadasCliente, ubicacionActual),
    };
  }

  return {
    destino: ubicacionActual || null,
    fuente: 'gps',
    coordenadasCliente: null,
    desviacionGpsMetros: null,
  };
}

export function normalizarKmDesplazamientoFacturable(distanciaMetros) {
  const metros = Number(distanciaMetros);
  if (!Number.isFinite(metros) || metros <= 0) {
    return null;
  }

  return Number(((metros * 2) / 1000).toFixed(2));
}

function calcularMediana(valores) {
  if (!Array.isArray(valores) || valores.length === 0) {
    return null;
  }

  const ordenados = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2 === 0) {
    return Number((((ordenados[mitad - 1] + ordenados[mitad]) / 2)).toFixed(2));
  }

  return Number(ordenados[mitad].toFixed(2));
}

export function calcularVariacionPorcentual(valorBase, valorActual) {
  const base = Number(valorBase);
  const actual = Number(valorActual);
  if (!Number.isFinite(base) || !Number.isFinite(actual) || base <= 0) {
    return null;
  }

  return Number((Math.abs(actual - base) / base * 100).toFixed(2));
}

export function analizarConsistenciaKmCliente({
  kmActual,
  historicoKms = [],
  umbralPct = 5,
}) {
  const kmHistoricos = historicoKms
    .map((valor) => Number(valor))
    .filter((valor) => Number.isFinite(valor) && valor > 0);

  if (!Number.isFinite(Number(kmActual)) || kmHistoricos.length === 0) {
    return {
      alerta: false,
      kmReferencia: null,
      variacionPct: null,
    };
  }

  const kmReferencia = calcularMediana(kmHistoricos);
  const variacionPct = calcularVariacionPorcentual(kmReferencia, kmActual);
  return {
    alerta: Number.isFinite(variacionPct) && variacionPct > umbralPct,
    kmReferencia,
    variacionPct,
  };
}
