import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import logoCotepaUrl from '../assets/cotepa.jpg';

const COLOR = {
  marca: [11, 30, 59],
  marcaSuave: [30, 58, 95],
  acento: [185, 28, 28],
  acentoSuave: [254, 226, 226],
  texto: [15, 23, 42],
  textoSuave: [71, 85, 105],
  textoMute: [120, 130, 145],
  borde: [226, 232, 240],
  bordeSuave: [241, 245, 249],
  fondoZebra: [248, 250, 252],
  fondoSuave: [249, 250, 252],
  fondoTarjeta: [255, 255, 255],
  fondoMarcaTenue: [244, 247, 251],
  fondoAcentoTenue: [255, 245, 245],
  blanco: [255, 255, 255],
  okFondo: [220, 252, 231],
  okTexto: [21, 128, 61],
  warnFondo: [254, 243, 199],
  warnTexto: [146, 64, 14],
  errorFondo: [254, 202, 202],
  errorTexto: [153, 27, 27],
};

const PAGINA = {
  ancho: 210,
  alto: 297,
  margenX: 14,
  margenSup: 14,
  margenInf: 16,
};
PAGINA.contenido = PAGINA.ancho - PAGINA.margenX * 2;

const EMPRESA = {
  nombre: 'COTEPA S.L.',
  direccion: 'C/ Sequía de Rascanya, 7 · Pol. Ind. · 46200 Paiporta (Valencia)',
  cif: 'B46220042',
  email: 'sat@cotepa.com',
  web: 'www.cotepa.com',
};

const TEXTO_CONFIDENCIALIDAD =
  'DOCUMENTO CONFIDENCIAL: La información contenida en este fichero es propiedad de COTEPA S.L. ' +
  'y se entrega bajo estricta confidencialidad. Su reproducción, distribución o comunicación a terceros sin ' +
  'consentimiento escrito está prohibida. El usuario receptor es responsable de su custodia y protección frente a accesos no autorizados.';

const ROLES_AUTORIZADOS_DESCARGA = new Set(['admin', 'oficina', 'comercial']);
const MAX_CLIENTES_DESCARGA_MASIVA = 50;
const TAMANO_MAXIMO_MB_POR_CLIENTE = 15;
const LONGITUD_MIN_CONTRASENA_PDF = 4;

let logoEmpresaCache = null;
let logoEmpresaPromise = null;

function txt(valor, fallback = '\u2014') {
  const s = typeof valor === 'string' ? valor.trim() : (valor != null ? String(valor).trim() : '');
  return s || fallback;
}

function eur(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? `${n.toFixed(2)} \u20AC` : '\u2014';
}

function formatearFechaCorta(valor) {
  if (!valor) return '\u2014';
  const f = new Date(valor);
  if (!Number.isFinite(f.getTime())) return String(valor);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(f);
}

function formatearFechaSolo(valor) {
  if (!valor) return '\u2014';
  const f = new Date(valor);
  if (!Number.isFinite(f.getTime())) return String(valor);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit', month: 'long', year: 'numeric',
  }).format(f);
}

function anonimizarIdentificadorFiscal(identificador) {
  const cadena = String(identificador || '').trim();
  if (cadena.length <= 4) return '***';
  const principio = cadena.slice(0, 2);
  const final = cadena.slice(-2);
  return `${principio}${'*'.repeat(Math.max(2, cadena.length - 4))}${final}`;
}

function anonimizarTelefono(telefono) {
  const cadena = String(telefono || '').replace(/\s+/g, '');
  if (cadena.length <= 4) return '***';
  const principio = cadena.slice(0, 2);
  const final = cadena.slice(-2);
  return `${principio} ${'*'.repeat(Math.max(2, cadena.length - 4))} ${final}`;
}

function anonimizarEmail(email) {
  const cadena = String(email || '').trim();
  const idxArroba = cadena.indexOf('@');
  if (idxArroba <= 1) return '***@***';
  const usuario = cadena.slice(0, idxArroba);
  const dominio = cadena.slice(idxArroba + 1);
  const uPrincipio = usuario.slice(0, 1);
  const uFinal = usuario.slice(-1);
  return `${uPrincipio}***${uFinal}@${dominio}`;
}

function traducirEstadoOrden(estado) {
  switch (String(estado || '').toLowerCase()) {
    case 'pendiente': return 'Pendiente';
    case 'en_proceso': return 'En proceso';
    case 'pausado': return 'Pausado';
    case 'finalizado': return 'Finalizado';
    case 'cancelado': return 'Cancelado';
    default: return String(estado || 'Sin estado');
  }
}

function traducirTipoOrden(tipo) {
  switch (String(tipo || '').toLowerCase()) {
    case 'averia': return 'Avería';
    case 'montaje': return 'Montaje';
    case 'puesta_en_marcha': return 'Puesta en marcha';
    default: return String(tipo || 'Sin tipo');
  }
}

function traducirPrioridad(prioridad) {
  switch (String(prioridad || '').toLowerCase()) {
    case 'baja': return 'Baja';
    case 'media': return 'Media';
    case 'alta': return 'Alta';
    case 'urgente': return 'Urgente';
    default: return String(prioridad || 'Media');
  }
}

async function urlADataUrl(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise((resolve) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result);
      lector.onerror = () => resolve(null);
      lector.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function obtenerLogoEmpresa() {
  if (logoEmpresaCache) return logoEmpresaCache;
  if (!logoEmpresaPromise) {
    logoEmpresaPromise = urlADataUrl(logoCotepaUrl)
      .then((d) => { logoEmpresaCache = d || null; return logoEmpresaCache; })
      .finally(() => { logoEmpresaPromise = null; });
  }
  return logoEmpresaPromise;
}

function setFill(doc, color) { doc.setFillColor(color[0], color[1], color[2]); }
function setStroke(doc, color) { doc.setDrawColor(color[0], color[1], color[2]); }
function setText(doc, color) { doc.setTextColor(color[0], color[1], color[2]); }

function dibujarCabeceraPaginaCliente(doc, opciones = {}) {
  const { mostrarTitulo = true, logoDataUrl, tituloEspecifico = 'Ficha del cliente', subTitulo = '' } = opciones;
  setFill(doc, COLOR.marca);
  doc.rect(0, 0, PAGINA.ancho, 4, 'F');
  setFill(doc, COLOR.acento);
  doc.rect(0, 4, PAGINA.ancho, 0.6, 'F');
  const logoX = PAGINA.margenX;
  const logoY = 8;
  const logoSize = 15;
  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 'JPEG', logoX, logoY, logoSize, logoSize); } catch { /* noop */ }
  }
  if (mostrarTitulo) {
    setFill(doc, COLOR.fondoMarcaTenue);
    setStroke(doc, COLOR.borde);
    doc.setLineWidth(0.2);
    doc.roundedRect(PAGINA.ancho - PAGINA.margenX - 74, 7.5, 74, 16, 2, 2, 'FD');
  }
  setText(doc, COLOR.marca);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text('COTEPA', logoX + logoSize + 3.5, logoY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setText(doc, COLOR.textoSuave);
  doc.text('Servicio de Asistencia Técnica', logoX + logoSize + 3.5, logoY + 10);
  doc.setFontSize(7.2);
  setText(doc, COLOR.textoMute);
  doc.text(EMPRESA.web, logoX + logoSize + 3.5, logoY + 14.1);
  if (mostrarTitulo) {
    const xDer = PAGINA.ancho - PAGINA.margenX - 4;
    setText(doc, COLOR.marca);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(tituloEspecifico.toUpperCase(), xDer, logoY + 6, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    setText(doc, COLOR.textoSuave);
    doc.text(subTitulo, xDer, logoY + 10.8, { align: 'right' });
    doc.text(formatearFechaCorta(new Date().toISOString()), xDer, logoY + 14.5, { align: 'right' });
  }
  setStroke(doc, COLOR.borde);
  doc.setLineWidth(0.3);
  doc.line(PAGINA.margenX, 26, PAGINA.ancho - PAGINA.margenX, 26);
}

function dibujarPiePaginasCliente(doc, meta = {}) {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    setStroke(doc, COLOR.borde);
    doc.setLineWidth(0.2);
    doc.line(PAGINA.margenX, PAGINA.alto - 12, PAGINA.ancho - PAGINA.margenX, PAGINA.alto - 12);
    setText(doc, COLOR.textoMute);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`${EMPRESA.nombre} \u00B7 ${EMPRESA.cif} \u00B7 ${EMPRESA.web}`, PAGINA.margenX, PAGINA.alto - 8.5);
    doc.text(TEXTO_CONFIDENCIALIDAD.slice(0, 110), PAGINA.margenX, PAGINA.alto - 5);
    setFill(doc, COLOR.fondoSuave);
    setStroke(doc, COLOR.borde);
    doc.roundedRect(PAGINA.ancho - PAGINA.margenX - 22, PAGINA.alto - 10.7, 22, 5.8, 1.5, 1.5, 'FD');
    setText(doc, COLOR.textoSuave);
    doc.setFont('helvetica', 'bold');
    doc.text(`P\u00E1gina ${p} de ${total}`, PAGINA.ancho - PAGINA.margenX - 1.5, PAGINA.alto - 7, { align: 'right' });
    if (meta.referencia) {
      setText(doc, COLOR.textoMute);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.text(`Ref: ${meta.referencia}`, PAGINA.margenX, PAGINA.alto - 13.2);
    }
  }
}

function reservarEspacio(doc, estado, alto, opciones = {}) {
  const limite = PAGINA.alto - PAGINA.margenInf - 14;
  if (estado.y + alto <= limite) return;
  doc.addPage();
  dibujarCabeceraPaginaCliente(doc, estado.opcionesCabecera || {});
  estado.y = 32;
  if (typeof opciones.alContinuar === 'function') opciones.alContinuar();
}

function dibujarTituloSeccion(doc, estado, titulo) {
  reservarEspacio(doc, estado, 11);
  setFill(doc, COLOR.acento);
  doc.roundedRect(PAGINA.margenX, estado.y, 2.5, 6.5, 0.8, 0.8, 'F');
  setText(doc, COLOR.marca);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(titulo.toUpperCase(), PAGINA.margenX + 5, estado.y + 5);
  setStroke(doc, COLOR.borde);
  doc.setLineWidth(0.2);
  doc.line(PAGINA.margenX + 5 + doc.getTextWidth(titulo.toUpperCase()) + 3, estado.y + 4, PAGINA.ancho - PAGINA.margenX, estado.y + 4);
  estado.y += 9;
}

function dibujarTarjetasResumen(doc, estado, datos) {
  if (!datos.length) return;
  const cols = Math.min(4, datos.length);
  const gap = 4;
  const ancho = (PAGINA.contenido - gap * (cols - 1)) / cols;
  const alto = 20;
  const filas = Math.ceil(datos.length / cols);
  const altoTotal = filas * alto + (filas - 1) * gap;
  reservarEspacio(doc, estado, altoTotal + 4);
  for (let i = 0; i < datos.length; i += 1) {
    const col = i % cols;
    const fila = Math.floor(i / cols);
    const x = PAGINA.margenX + col * (ancho + gap);
    const y = estado.y + fila * (alto + gap);
    const [titulo, valor] = datos[i];
    setFill(doc, COLOR.fondoTarjeta);
    setStroke(doc, COLOR.borde);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, ancho, alto, 2, 2, 'FD');
    setFill(doc, COLOR.fondoMarcaTenue);
    doc.roundedRect(x, y, ancho, 5.5, 2, 2, 'F');
    setFill(doc, COLOR.acento);
    doc.roundedRect(x, y, 2.2, 5.5, 1.2, 1.2, 'F');
    setText(doc, COLOR.textoMute);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(String(titulo).toUpperCase(), x + 5, y + 3.9);
    setText(doc, COLOR.marca);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    const lineas = doc.splitTextToSize(txt(valor), ancho - 6);
    doc.text(lineas.slice(0, 2), x + 3, y + 11.8);
  }
  estado.y += altoTotal + 5;
}

function dibujarTablaInfo(doc, estado, filas) {
  if (!filas || !filas.length) return;
  const x = PAGINA.margenX;
  const xEtiqueta = x + 3;
  const xValor = PAGINA.margenX + 65;
  const anchoValor = PAGINA.contenido - (xValor - PAGINA.margenX) - 3;
  const padFila = 2;
  const altoLinea = 4.2;
  const items = filas.map(([etiqueta, valor]) => {
    const lineas = doc.splitTextToSize(txt(valor), anchoValor);
    const altoFila = Math.max(altoLinea + padFila * 2, lineas.length * altoLinea + padFila * 2);
    return { etiqueta, lineas, altoFila };
  });
  const total = items.reduce((a, it) => a + it.altoFila, 0);
  reservarEspacio(doc, estado, total + 2);
  setFill(doc, COLOR.fondoTarjeta);
  doc.roundedRect(x, estado.y, PAGINA.contenido, total, 2, 2, 'F');
  setStroke(doc, COLOR.borde);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, estado.y, PAGINA.contenido, total, 2, 2, 'S');
  setStroke(doc, COLOR.bordeSuave);
  doc.line(xValor - 4, estado.y + 1.4, xValor - 4, estado.y + total - 1.4);
  let y = estado.y;
  items.forEach((it, idx) => {
    if (idx % 2 === 0) {
      setFill(doc, COLOR.fondoZebra);
      doc.rect(x + 0.2, y, PAGINA.contenido - 0.4, it.altoFila, 'F');
    }
    setText(doc, COLOR.textoSuave);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(it.etiqueta, xEtiqueta, y + padFila + 3);
    setText(doc, COLOR.texto);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(it.lineas, xValor, y + padFila + 3);
    y += it.altoFila;
  });
  estado.y += total + 4;
}

function dibujarParrafo(doc, estado, texto) {
  const contenido = txt(texto, 'Sin informaci\u00F3n registrada.');
  const maxWidth = PAGINA.contenido - 6;
  const segmentos = String(contenido || '').split(/\r?\n/);
  const lineas = [];
  segmentos.forEach((segmento) => {
    const normalizado = String(segmento || '').trimEnd();
    if (!normalizado) { lineas.push(' '); return; }
    const partidas = doc.splitTextToSize(normalizado, maxWidth);
    lineas.push(...partidas);
  });
  const alto = (lineas.length || 1) * 4.4 + 6;
  reservarEspacio(doc, estado, alto);
  setFill(doc, COLOR.fondoTarjeta);
  setStroke(doc, COLOR.borde);
  doc.setLineWidth(0.2);
  doc.roundedRect(PAGINA.margenX, estado.y, PAGINA.contenido, alto, 2, 2, 'FD');
  setFill(doc, COLOR.fondoMarcaTenue);
  doc.roundedRect(PAGINA.margenX, estado.y, 1.8, alto, 1.2, 1.2, 'F');
  setText(doc, COLOR.texto);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(lineas, PAGINA.margenX + 4, estado.y + 5.2);
  estado.y += alto + 4;
}

function dibujarTabla(doc, estado, { columnas, filas, altoCabecera = 8, altoFilaBase = 6.5, zebra = true }) {
  if (!Array.isArray(columnas) || !columnas.length) return;
  const x = PAGINA.margenX;
  const w = PAGINA.contenido;
  const totalCols = columnas.reduce((acc, c) => acc + (Number(c.ancho) || 0), 0);
  const columnasNormalizadas = columnas.map((c) => ({
    ...c,
    anchoEfectivo: totalCols > 0 ? ((Number(c.ancho) || 0) / totalCols) * w : w / columnas.length,
  }));
  reservarEspacio(doc, estado, altoCabecera + altoFilaBase + 6);
  setFill(doc, COLOR.marca);
  doc.roundedRect(x, estado.y, w, altoCabecera, 2, 2, 'F');
  setText(doc, COLOR.blanco);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  let xCursor = x;
  columnasNormalizadas.forEach((c) => {
    const alineacion = c.alineacion || 'left';
    const textX = alineacion === 'right'
      ? xCursor + c.anchoEfectivo - 3
      : (alineacion === 'center' ? xCursor + c.anchoEfectivo / 2 : xCursor + 3);
    doc.text(String(c.titulo || '').toUpperCase(), textX, estado.y + altoCabecera - 2.5, { align: alineacion });
    xCursor += c.anchoEfectivo;
  });
  let y = estado.y + altoCabecera;
  const filasRenderizables = Array.isArray(filas) ? filas : [];
  filasRenderizables.forEach((fila, idx) => {
    const celdas = Array.isArray(fila) ? fila : columnasNormalizadas.map(() => '\u2014');
    const lineasCeldas = celdas.map((valor, i) => {
      const col = columnasNormalizadas[i] || { anchoEfectivo: w / columnasNormalizadas.length };
      return doc.splitTextToSize(txt(valor), col.anchoEfectivo - 6);
    });
    const numeroLineas = Math.max(1, ...lineasCeldas.map((l) => l.length));
    const altoFila = Math.max(altoFilaBase, numeroLineas * 3.8 + 3);
    reservarEspacio(doc, estado, altoFila);
    if (y + altoFila > PAGINA.alto - PAGINA.margenInf - 14) {
      doc.addPage();
      dibujarCabeceraPaginaCliente(doc, estado.opcionesCabecera || {});
      estado.y = 32;
      setFill(doc, COLOR.marca);
      doc.roundedRect(x, estado.y, w, altoCabecera, 2, 2, 'F');
      setText(doc, COLOR.blanco);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      let xC2 = x;
      columnasNormalizadas.forEach((c) => {
        const alineacion = c.alineacion || 'left';
        const textX = alineacion === 'right'
          ? xC2 + c.anchoEfectivo - 3
          : (alineacion === 'center' ? xC2 + c.anchoEfectivo / 2 : xC2 + 3);
        doc.text(String(c.titulo || '').toUpperCase(), textX, estado.y + altoCabecera - 2.5, { align: alineacion });
        xC2 += c.anchoEfectivo;
      });
      y = estado.y + altoCabecera;
    }
    if (zebra && idx % 2 === 1) {
      setFill(doc, COLOR.fondoZebra);
      doc.rect(x, y, w, altoFila, 'F');
    }
    setStroke(doc, COLOR.bordeSuave);
    doc.setLineWidth(0.1);
    let xCursorFila = x;
    for (let i = 0; i < columnasNormalizadas.length; i += 1) {
      doc.line(xCursorFila, y, xCursorFila, y + altoFila);
      const col = columnasNormalizadas[i];
      const alineacion = col.alineacion || 'left';
      const lineas = lineasCeldas[i] || ['\u2014'];
      const textX = alineacion === 'right'
        ? xCursorFila + col.anchoEfectivo - 3
        : (alineacion === 'center' ? xCursorFila + col.anchoEfectivo / 2 : xCursorFila + 3);
      setText(doc, COLOR.texto);
      doc.setFont('helvetica', col.negrita ? 'bold' : 'normal');
      doc.setFontSize(8.5);
      doc.text(lineas, textX, y + 3, { align: alineacion });
      xCursorFila += col.anchoEfectivo;
    }
    setStroke(doc, COLOR.borde);
    doc.setLineWidth(0.15);
    doc.line(x, y + altoFila, x + w, y + altoFila);
    y += altoFila;
    estado.y = y;
  });
  setStroke(doc, COLOR.borde);
  doc.setLineWidth(0.2);
  doc.roundedRect(x, estado.y - (y - (estado.y + altoCabecera)) - altoCabecera, w, (y - (estado.y + altoCabecera)) + altoCabecera, 2, 2, 'S');
  estado.y = y + 4;
}

function generarReferenciaFichaCliente(nombreCliente, secuencial = 1) {
  const fecha = new Date();
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const yy = String(fecha.getFullYear()).slice(-2);
  const iniciales = String(nombreCliente || 'CLIENTE')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5)
    .padEnd(5, 'X');
  const seq = String(secuencial).padStart(3, '0');
  return `FICHA-CLIENTE-${yy}${mm}${dd}-${iniciales}-${seq}`;
}

async function construirPdfClienteIndividual({ datosCompletos, opciones = {} }) {
  const { anonimizar = false, nombreUsuario = '' } = opciones;
  const cliente = datosCompletos?.cliente || {};
  const equipos = Array.isArray(datosCompletos?.equipos) ? datosCompletos.equipos : [];
  const ordenes = Array.isArray(datosCompletos?.ordenes) ? datosCompletos.ordenes : [];
  const resumen = datosCompletos?.resumen || {};
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setDocumentProperties({
    title: `Ficha cliente - ${txt(cliente.nombre, 'Sin nombre')}`,
    subject: 'Ficha de cliente con historial SAT',
    author: EMPRESA.nombre,
    keywords: `cliente, SAT, COTEPA, ${txt(cliente.nombre, '')}`,
    creator: EMPRESA.nombre,
  });
  const referencia = generarReferenciaFichaCliente(cliente.nombre, 1);
  const fechaGeneracion = new Date().toISOString();
  const logoDataUrl = await obtenerLogoEmpresa();
  const opcionesCabecera = {
    mostrarTitulo: true,
    logoDataUrl,
    tituloEspecifico: 'Ficha del cliente',
    subTitulo: `Ref. ${referencia}`,
  };
  const estado = { y: 32, opcionesCabecera };
  dibujarCabeceraPaginaCliente(doc, opcionesCabecera);
  const nombreMostrar = anonimizar && cliente.razon_social
    ? txt(cliente.razon_social)
    : txt(cliente.nombre);
  dibujarTarjetasResumen(doc, estado, [
    ['Total \u00F3rdenes', String(resumen.total_ordenes || 0)],
    ['Finalizadas', String(resumen.ordenes_finalizadas || 0)],
    ['Abiertas', String(resumen.ordenes_abiertas || 0)],
    ['Facturado', eur(resumen.importe_total_facturado || 0)],
  ]);
  dibujarTituloSeccion(doc, estado, '1. Datos identificativos');
  const idFiscalMostrar = anonimizar
    ? anonimizarIdentificadorFiscal(cliente.identificador_fiscal)
    : txt(cliente.identificador_fiscal);
  const telMostrar = anonimizar ? anonimizarTelefono(cliente.telefono) : txt(cliente.telefono);
  const tel2Mostrar = anonimizar ? anonimizarTelefono(cliente.telefono_2) : txt(cliente.telefono_2);
  const telFiscMostrar = anonimizar ? anonimizarTelefono(cliente.telefono_fiscal) : txt(cliente.telefono_fiscal);
  const emailMostrar = anonimizar ? anonimizarEmail(cliente.email) : txt(cliente.email);
  dibujarTablaInfo(doc, estado, [
    ['Nombre comercial', cliente.nombre],
    ['Raz\u00F3n social', txt(cliente.razon_social)],
    ['ID Fiscal', idFiscalMostrar],
    ['Direcci\u00F3n instalaci\u00F3n', txt(cliente.direccion)],
    ['Direcci\u00F3n fiscal', txt(cliente.direccion_fiscal)],
    ['Tel\u00E9fono fiscal', telFiscMostrar],
    ['Email', emailMostrar],
    ['Contacto 1', [cliente.contacto, cliente.cargo, telMostrar].filter(Boolean).join(' \u2014 ') || '\u2014'],
    ['Contacto 2', [cliente.contacto_2, cliente.cargo_2, tel2Mostrar].filter(Boolean).join(' \u2014 ') || '\u2014'],
    ['Comerciales', (cliente.comerciales || []).map((c) => c.nombre + (c.es_predeterminado ? ' (predet.)' : '')).join(', ') || '\u2014'],
    ['Alta sistema', formatearFechaSolo(cliente.created_at)],
    ['\u00DAltima actualizaci\u00F3n', formatearFechaSolo(cliente.updated_at || cliente.created_at)],
  ]);
  dibujarTituloSeccion(doc, estado, '2. Equipos instalados');
  if (equipos.length === 0) {
    dibujarParrafo(doc, estado, 'No hay equipos registrados para este cliente.');
  } else {
    dibujarTabla(doc, estado, {
      columnas: [
        { titulo: 'Equipo', ancho: 38 },
        { titulo: 'Marca', ancho: 20 },
        { titulo: 'Modelo', ancho: 22 },
        { titulo: 'N\u00BA serie', ancho: 26 },
        { titulo: '\u00DAlt. revisi\u00F3n', ancho: 16, alineacion: 'center' },
      ],
      filas: equipos.map((e) => [
        txt(e.nombre),
        txt(e.marca),
        txt(e.modelo),
        txt(e.numero_serie),
        formatearFechaSolo(e.ultima_revision),
      ]),
    });
  }
  dibujarTituloSeccion(doc, estado, '3. Historial de \u00F3rdenes SAT');
  if (ordenes.length === 0) {
    dibujarParrafo(doc, estado, 'No hay \u00F3rdenes de trabajo registradas para este cliente.');
  } else {
    dibujarTabla(doc, estado, {
      columnas: [
        { titulo: 'Ticket', ancho: 20 },
        { titulo: 'Fecha', ancho: 18, alineacion: 'center' },
        { titulo: 'Equipo', ancho: 26 },
        { titulo: 'T\u00E9cnico', ancho: 20 },
        { titulo: 'Estado', ancho: 14, alineacion: 'center' },
        { titulo: 'Tipo', ancho: 16, alineacion: 'center' },
        { titulo: 'Coste', ancho: 14, alineacion: 'right', negrita: true },
      ],
      filas: ordenes.map((o) => [
        txt(o.numero_ticket, String(o.id).slice(0, 8)),
        formatearFechaSolo(o.fecha_inicio || o.created_at),
        txt(o.equipos?.nombre),
        txt(o.tecnicos?.nombre),
        traducirEstadoOrden(o.estado),
        traducirTipoOrden(o.tipo_orden),
        eur(o.coste_total),
      ]),
    });
    const detallesKpis = [
      ['Horas totales de servicio', `${resumen.horas_totales_servicio || 0} h`],
      ['Tiempo total (minutos)', `${resumen.minutos_totales_servicio || 0} min`],
      ['Equipos totales registrados', String(resumen.total_equipos || 0)],
    ];
    if (nombreUsuario) {
      detallesKpis.push(['Generado por usuario', txt(nombreUsuario)]);
    }
    dibujarTituloSeccion(doc, estado, '4. Resumen econ\u00F3mico y servicio');
    dibujarTablaInfo(doc, estado, detallesKpis);
  }
  dibujarTituloSeccion(doc, estado, '5. Aviso legal y confidencialidad');
  const textoLegal =
    'RESPONSABILIDAD DEL USUARIO: Este documento contiene datos personales y/o datos de naturaleza confidencial protegidos por ' +
    'el Reglamento (UE) 2016/679 (RGPD), la Ley Org\u00E1nica 3/2018, de 5 de diciembre, de Protecci\u00F3n de Datos Personales y garant\u00EDa de los ' +
    'derechos digitales (LOPDGDD) y dem\u00E1s normativa aplicable. El usuario que recibe este fichero se compromete a:' +
    '\n1. Custodiar el archivo en un entorno seguro con acceso restringido a personal autorizado.' +
    '\n2. No compartir, distribuir ni reproducir su contenido sin la autorizaci\u00F3n expresa y por escrito de COTEPA S.L.' +
    '\n3. Eliminar definitivamente el documento cuando deje de ser necesario para los fines leg\u00EDtimos para los que fue generado.' +
    '\n4. Comunicar sin dilaci\u00F3n cualquier p\u00E9rdida o acceso no autorizado a: ' + EMPRESA.email + '.' +
    (anonimizar ? '\nNota: Los campos sensibles (ID fiscal, tel\u00E9fonos, email) se han anonimizado en esta copia.' : '') +
    '\n\nFecha de emisi\u00F3n del documento: ' + formatearFechaCorta(fechaGeneracion);
  dibujarParrafo(doc, estado, textoLegal);
  dibujarPiePaginasCliente(doc, { referencia });
  return {
    pdfBlob: doc.output('blob'),
    doc,
    nombreArchivo: `${referencia}.pdf`,
    referencia,
    fechaGeneracion,
  };
}

export function autorizadoParaDescargarPdfCliente(rolUsuario) {
  return ROLES_AUTORIZADOS_DESCARGA.has(String(rolUsuario || '').toLowerCase());
}

export function obtenerMaxClientesDescargaMasiva() {
  return MAX_CLIENTES_DESCARGA_MASIVA;
}

export function construirMensajeErrorUsuario(error) {
  const causa = String(error?.message || error || '').toLowerCase();
  if (causa.includes('permiso') || causa.includes('rls') || causa.includes('autorizado')) {
    return 'No tienes permisos suficientes para descargar esta informaci\u00F3n. Contacta con administraci\u00F3n.';
  }
  if (causa.includes('network') || causa.includes('fetch') || causa.includes('conexi\u00F3n') || causa.includes('offline')) {
    return 'No se pudo completar la descarga por un problema de conexi\u00F3n. Revisa tu red e int\u00E9ntalo de nuevo.';
  }
  if (causa.includes('no existe') || causa.includes('encontrado')) {
    return 'Uno o m\u00E1s clientes ya no existen en el sistema. Actualiza la lista y vuelve a intentarlo.';
  }
  if (causa.includes('l\u00EDmite') || causa.includes('l\xEDmite') || causa.includes('max')) {
    return 'Se ha superado el l\u00EDmite m\u00E1ximo de clientes por descarga masiva. Selecciona menos clientes.';
  }
  if (causa.includes('pdf') || causa.includes('generar')) {
    return 'No se pudo generar el archivo PDF. Int\u00E9ntalo de nuevo en unos segundos.';
  }
  return 'No se pudo completar la descarga. Si el problema persiste, contacta con soporte t\u00E9cnico.';
}

export async function encriptarPdfConContrasena(blobSinCifrar, contrasena) {
  if (!blobSinCifrar) throw new Error('No hay contenido PDF para encriptar.');
  const passwordLimpio = String(contrasena || '');
  if (passwordLimpio.length < LONGITUD_MIN_CONTRASENA_PDF) {
    throw new Error(
      `La contrase\u00F1a debe tener al menos ${LONGITUD_MIN_CONTRASENA_PDF} caracteres para proteger el PDF.`
    );
  }
  const bytesOrigen = new Uint8Array(await blobSinCifrar.arrayBuffer());
  const pdfDoc = await PDFDocument.load(bytesOrigen);
  const bytesCifrados = await pdfDoc.save({
    encrypt: {
      password: passwordLimpio,
      permissions: {
        printing: true,
        modifying: false,
        copying: false,
        annotating: false,
        fillingForms: false,
        contentAccessibility: true,
        documentAssembly: false,
      },
    },
  });
  return new Blob([bytesCifrados], { type: 'application/pdf' });
}

export function obtenerLongitudMinContrasenaPdf() {
  return LONGITUD_MIN_CONTRASENA_PDF;
}

export async function generarPdfClienteIndividual({ datosCompletos, opciones = {} }) {
  if (!datosCompletos?.cliente) {
    throw new Error('Faltan los datos del cliente para generar el PDF.');
  }
  try {
    const resultado = await construirPdfClienteIndividual({ datosCompletos, opciones });
    const blobSizeMb = resultado.pdfBlob.size / (1024 * 1024);
    if (blobSizeMb > TAMANO_MAXIMO_MB_POR_CLIENTE) {
      throw new Error(
        `El PDF generado supera el l\u00EDmite de ${TAMANO_MAXIMO_MB_POR_CLIENTE} MB por cliente (${blobSizeMb.toFixed(2)} MB).`
      );
    }
    if (String(opciones.contrasena || '').length > 0) {
      const blobProtegido = await encriptarPdfConContrasena(resultado.pdfBlob, opciones.contrasena);
      return { ...resultado, pdfBlob: blobProtegido, protegidoConContrasena: true };
    }
    return { ...resultado, protegidoConContrasena: false };
  } catch (error) {
    const envuelto = new Error(
      `Fallo al generar PDF para cliente ${datosCompletos.cliente?.id || 'sin id'}: ${error.message}`,
      { cause: error },
    );
    throw envuelto;
  }
}

function combinarBlobsPdf(blobs) {
  if (!Array.isArray(blobs) || blobs.length === 0) {
    throw new Error('No hay archivos PDF para combinar.');
  }
  if (blobs.length === 1) return blobs[0];
  const partes = [];
  blobs.forEach((b, i) => {
    partes.push(b);
    if (i < blobs.length - 1) {
      partes.push(new Blob(['\n'], { type: 'application/pdf' }));
    }
  });
  return new Blob(partes, { type: 'application/pdf' });
}

export async function generarPdfClientesMasivo({ listaDatosCompletos, opciones = {} }) {
  const lista = Array.isArray(listaDatosCompletos) ? listaDatosCompletos : [];
  if (lista.length === 0) {
    throw new Error('No hay clientes seleccionados para generar el PDF.');
  }
  if (lista.length > MAX_CLIENTES_DESCARGA_MASIVA) {
    throw new Error(
      `Se han seleccionado ${lista.length} clientes. El l\u00EDmite para descarga masiva es ${MAX_CLIENTES_DESCARGA_MASIVA}.`
    );
  }
  const resultados = [];
  const errores = [];
  for (let i = 0; i < lista.length; i += 1) {
    const datos = lista[i];
    try {
      const r = await construirPdfClienteIndividual({
        datosCompletos: datos,
        opciones: {
          ...opciones,
          secuencial: i + 1,
        },
      });
      resultados.push({ ...r, idCliente: datos?.cliente?.id || String(i) });
    } catch (error) {
      errores.push({
        idCliente: datos?.cliente?.id || String(i),
        nombreCliente: datos?.cliente?.nombre || 'Cliente sin nombre',
        detalle: error.message || String(error),
      });
    }
    if (typeof opciones.onProgreso === 'function') {
      opciones.onProgreso({ actual: i + 1, total: lista.length, errores: errores.length });
    }
  }
  if (resultados.length === 0) {
    const primero = errores[0];
    throw new Error(
      `No se pudo generar el PDF para ning\u00FAn cliente.${primero ? ` \u00DAltimo error: ${primero.detalle}` : ''}`
    );
  }
  const pdfCombinado = combinarBlobsPdf(resultados.map((r) => r.pdfBlob));
  const fecha = new Date();
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const yy = String(fecha.getFullYear()).slice(-2);
  const nombreArchivo = `CLIENTES-FICHA-MASIVA-${yy}${mm}${dd}-${String(resultados.length).padStart(3, '0')}.pdf`;
  let blobFinal = pdfCombinado;
  let protegido = false;
  if (String(opciones.contrasena || '').length > 0) {
    blobFinal = await encriptarPdfConContrasena(pdfCombinado, opciones.contrasena);
    protegido = true;
  }
  return {
    pdfBlob: blobFinal,
    nombreArchivo,
    numeroClientesExito: resultados.length,
    numeroClientesError: errores.length,
    errores,
    protegidoConContrasena: protegido,
  };
}

export function descargarBlobEnNavegador({ blob, nombreArchivo }) {
  if (!blob) throw new Error('No hay contenido para descargar.');
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = String(nombreArchivo || 'documento.pdf').replace(/[^a-zA-Z0-9\-\._\u00C0-\u00FF ]/g, '_');
  enlace.rel = 'noopener';
  enlace.setAttribute('aria-label', `Descargar ${nombreArchivo}`);
  document.body.appendChild(enlace);
  try {
    enlace.click();
  } finally {
    setTimeout(() => {
      try { document.body.removeChild(enlace); } catch { /* noop */ }
      try { URL.revokeObjectURL(url); } catch { /* noop */ }
    }, 1000);
  }
}

export async function generarDemoPdfCliente() {
  const datosDemo = {
    cliente: {
      id: 'demo-cliente-1',
      nombre: 'Panader\u00EDa El Horno S.L.',
      razon_social: 'Panader\u00EDa El Horno S.L.',
      identificador_fiscal: 'B12345678',
      direccion: 'Calle Mayor, 45 \u2014 46001 Valencia',
      direccion_fiscal: 'Avda. Fiscal, 12 \u2014 46002 Valencia',
      telefono_fiscal: '961111111',
      email: 'administracion@elhorno.es',
      contacto: 'Mar\u00EDa L\u00F3pez',
      cargo: 'Directora de explotaci\u00F3n',
      telefono: '600111222',
      contacto_2: 'Javier Ruiz',
      cargo_2: 'Jefe de mantenimiento',
      telefono_2: '600333444',
      comerciales: [{ id: 'c1', nombre: 'Laura G\u00F3mez', es_predeterminado: true, activo: true }],
      created_at: '2024-11-15T10:30:00Z',
      updated_at: '2026-09-18T09:15:00Z',
    },
    equipos: [
      { id: 'e1', nombre: 'Horno convector HC-200', marca: 'Fagor', modelo: 'HC-200', numero_serie: 'HC2024-8877', ultima_revision: '2026-07-22' },
      { id: 'e2', nombre: 'Amasadora industrial AM-120', marca: 'VMI', modelo: 'AM-120', numero_serie: 'AM-2023-00112', ultima_revision: '2026-05-10' },
    ],
    ordenes: [
      {
        id: 'ot-1', numero_ticket: 'OT-2650',
        fecha_inicio: '2026-09-12T08:30:00Z',
        equipos: { nombre: 'Horno convector HC-200' },
        tecnicos: { nombre: 'Carlos P\u00E9rez' },
        estado: 'finalizado', tipo_orden: 'averia', prioridad: 'alta',
        coste_total: 385.50,
      },
      {
        id: 'ot-2', numero_ticket: 'OT-2580',
        fecha_inicio: '2026-06-02T09:00:00Z',
        equipos: { nombre: 'Amasadora industrial AM-120' },
        tecnicos: { nombre: 'Laura G\u00F3mez' },
        estado: 'finalizado', tipo_orden: 'mantenimiento', prioridad: 'media',
        coste_total: 180.00,
      },
      {
        id: 'ot-3', numero_ticket: 'OT-2710',
        fecha_inicio: '2026-09-20T08:00:00Z',
        equipos: { nombre: 'Horno convector HC-200' },
        tecnicos: { nombre: 'Carlos P\u00E9rez' },
        estado: 'pendiente', tipo_orden: 'averia', prioridad: 'urgente',
        coste_total: null,
      },
    ],
    resumen: {
      total_equipos: 2,
      total_ordenes: 3,
      ordenes_finalizadas: 2,
      ordenes_abiertas: 1,
      importe_total_facturado: 565.50,
      minutos_totales_servicio: 540,
      horas_totales_servicio: 9.00,
    },
  };
  return generarPdfClienteIndividual({ datosCompletos: datosDemo, opciones: { nombreUsuario: 'Demo SAT' } });
}
