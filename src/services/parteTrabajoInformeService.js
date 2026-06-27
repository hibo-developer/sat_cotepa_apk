import { jsPDF } from 'jspdf';
import logoCotepaUrl from '../assets/cotepa.jpg';
import { obtenerClienteSupabase, obtenerUrlFirmadaStorage } from './supabaseClient';

// =====================================================================
// Constantes de diseño - paleta corporativa COTEPA
// =====================================================================

const COLOR = {
  marca: [11, 30, 59],          // Azul marino corporativo
  marcaSuave: [30, 58, 95],
  acento: [185, 28, 28],        // Rojo COTEPA
  acentoSuave: [254, 226, 226],
  texto: [15, 23, 42],
  textoSuave: [71, 85, 105],
  textoMute: [120, 130, 145],
  borde: [226, 232, 240],
  bordeSuave: [241, 245, 249],
  fondoZebra: [248, 250, 252],
  fondoSuave: [249, 250, 252],
  blanco: [255, 255, 255],
  okFondo: [220, 252, 231],
  okTexto: [21, 128, 61],
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

const TEXTO_ACEPTACION_CLIENTE_PEM = `ACEPTACIÓN POR PARTE DEL CLIENTE

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

let logoEmpresaCache = null;
let logoEmpresaPromise = null;

let metaInforme = {
  referencia: '',
  fechaEmision: '',
};

// =====================================================================
// Utilidades de formato
// =====================================================================

function txt(valor, fallback = '—') {
  const s = typeof valor === 'string' ? valor.trim() : (valor != null ? String(valor).trim() : '');
  return s || fallback;
}

function num(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function eur(valor) {
  const n = num(valor);
  return n != null ? `${n.toFixed(2)} €` : '—';
}

function formatearFechaCorta(valor) {
  if (!valor) return '—';
  const f = new Date(valor);
  if (!Number.isFinite(f.getTime())) return String(valor);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(f);
}

function formatearFechaSolo(valor) {
  if (!valor) return '—';
  const f = new Date(valor);
  if (!Number.isFinite(f.getTime())) return String(valor);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit', month: 'long', year: 'numeric',
  }).format(f);
}

function resolverFechaInformeIso({ parte, formulario, seguimientoTiempo, intervension }) {
  const candidatos = [
    intervension?.inicioIso,
    intervension?.finIso,
    parte?.fecha_inicio,
    parte?.fecha_fin,
    seguimientoTiempo?.inicioIso,
    seguimientoTiempo?.finIso,
    formulario?.fecha_inicio,
    formulario?.fecha_fin,
  ];

  for (const c of candidatos) {
    const f = new Date(c);
    if (Number.isFinite(f.getTime())) return f.toISOString();
  }

  return new Date().toISOString();
}

function crearReferenciaInforme(fechaIso, secuencial, prefijoInforme = 'SAT') {
  const f = new Date(fechaIso);
  const ahora = Number.isFinite(f.getTime()) ? f : new Date();
  const dd = String(ahora.getDate()).padStart(2, '0');
  const mm = String(ahora.getMonth() + 1).padStart(2, '0');
  const yy = String(ahora.getFullYear()).slice(-2);
  const seq = String(Number.isFinite(secuencial) ? secuencial : 1).padStart(2, '0');
  const prefijo = String(prefijoInforme || 'SAT').trim().toUpperCase() || 'SAT';
  return `${prefijo}-${yy}${mm}${dd}-${seq}`;
}

function resolverMinutosFase(fase) {
  const minutosGeo = num(fase?.minutosGeo);
  if (minutosGeo != null && minutosGeo > 0) return Math.round(minutosGeo);
  if (!fase?.inicioIso || !fase?.finIso) return null;
  const ms = new Date(fase.finIso).getTime() - new Date(fase.inicioIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 1;
  return Math.max(1, Math.ceil(ms / 60000));
}

function calcularHorasIntervencionMinimoUno(intervension) {
  const m = resolverMinutosFase(intervension);
  if (!m || m <= 0) return 1;
  return Math.max(1, Number((m / 60).toFixed(2)));
}

function materialesDesdeTexto(texto) {
  if (!texto || !texto.trim()) return [];
  return texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [nombre, cantidad, precio] = l.split(';').map((v) => (v || '').trim());
      const c = Number.parseInt(cantidad, 10);
      const p = Number.parseFloat((precio || '').replace(',', '.'));
      const importe = Number.isFinite(c) && Number.isFinite(p) ? c * p : null;
      return {
        nombre: nombre || 'Material',
        cantidad: Number.isFinite(c) ? c : 1,
        precioUnitario: Number.isFinite(p) ? p : null,
        importe,
      };
    });
}

function totalMaterialesDesdeLista(materiales) {
  return (Array.isArray(materiales) ? materiales : []).reduce(
    (acc, m) => acc + (Number.isFinite(m?.importe) ? m.importe : 0),
    0,
  );
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

// =====================================================================
// Primitivas de dibujo
// =====================================================================

function setFill(doc, color) { doc.setFillColor(color[0], color[1], color[2]); }
function setStroke(doc, color) { doc.setDrawColor(color[0], color[1], color[2]); }
function setText(doc, color) { doc.setTextColor(color[0], color[1], color[2]); }

function dibujarCabeceraPagina(doc, opciones = {}) {
  const { mostrarTitulo = true, logoDataUrl } = opciones;

  // Banda superior fina de marca
  setFill(doc, COLOR.marca);
  doc.rect(0, 0, PAGINA.ancho, 4, 'F');
  setFill(doc, COLOR.acento);
  doc.rect(0, 4, PAGINA.ancho, 0.6, 'F');

  // Logo
  const logoX = PAGINA.margenX;
  const logoY = 8;
  const logoSize = 14;
  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 'JPEG', logoX, logoY, logoSize, logoSize); } catch { /* noop */ }
  }

  // Texto cabecera
  setText(doc, COLOR.marca);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('COTEPA', logoX + logoSize + 3, logoY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setText(doc, COLOR.textoSuave);
  doc.text('Servicio de Asistencia Técnica', logoX + logoSize + 3, logoY + 10);

  if (mostrarTitulo) {
    // Bloque derecha: título informe + referencia
    const xDer = PAGINA.ancho - PAGINA.margenX;
    setText(doc, COLOR.marca);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('PARTE DE TRABAJO', xDer, logoY + 5.5, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setText(doc, COLOR.textoSuave);
    doc.text(`Ref. ${txt(metaInforme.referencia)}  ·  ${txt(metaInforme.fechaEmision)}`, xDer, logoY + 10, { align: 'right' });
  }

  // Línea separadora bajo la cabecera
  setStroke(doc, COLOR.borde);
  doc.setLineWidth(0.3);
  doc.line(PAGINA.margenX, 26, PAGINA.ancho - PAGINA.margenX, 26);
}

function dibujarPiePaginas(doc) {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    setStroke(doc, COLOR.borde);
    doc.setLineWidth(0.2);
    doc.line(PAGINA.margenX, PAGINA.alto - 12, PAGINA.ancho - PAGINA.margenX, PAGINA.alto - 12);

    setText(doc, COLOR.textoMute);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`${EMPRESA.nombre}  ·  ${EMPRESA.cif}  ·  ${EMPRESA.web}`, PAGINA.margenX, PAGINA.alto - 7);
    doc.text(`Página ${p} de ${total}`, PAGINA.ancho - PAGINA.margenX, PAGINA.alto - 7, { align: 'right' });
  }
}

function reservarEspacio(doc, estado, alto, opciones = {}) {
  const limite = PAGINA.alto - PAGINA.margenInf - 4;
  if (estado.y + alto <= limite) return;

  doc.addPage();
  dibujarCabeceraPagina(doc, { logoDataUrl: estado.logoDataUrl, mostrarTitulo: true });
  estado.y = 32;
  if (typeof opciones.alContinuar === 'function') opciones.alContinuar();
}

function dibujarTituloSeccion(doc, estado, titulo) {
  reservarEspacio(doc, estado, 11);
  setFill(doc, COLOR.acento);
  doc.rect(PAGINA.margenX, estado.y, 2.5, 6.5, 'F');

  setText(doc, COLOR.marca);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(titulo.toUpperCase(), PAGINA.margenX + 5, estado.y + 5);

  setStroke(doc, COLOR.borde);
  doc.setLineWidth(0.2);
  doc.line(PAGINA.margenX + 5 + doc.getTextWidth(titulo.toUpperCase()) + 3, estado.y + 4, PAGINA.ancho - PAGINA.margenX, estado.y + 4);

  estado.y += 9;
}

// Extrae solo las frases descriptivas de tareas_realizadas, descartando
// los marcadores tecnicos generados automaticamente: cabeceras de fase,
// timestamps, geolocalizacion, lugar, distancias, tiempos, firma y URLs
// de fotos. Asi el texto libre que escribe el tecnico (o el admin al
// editar el parte) queda visible y limpio en el PDF.
function limpiarTextoTrabajosRealizados(tareasRealizadas) {
  const texto = String(tareasRealizadas || '').trim();
  if (!texto) {
    return '';
  }

  const esFragmentoLugar = (valor) => {
    const limpio = String(valor || '').replace(/[.,;]+$/g, '').trim();
    if (!limpio) return false;
    if (/\d/.test(limpio)) return false;
    return /^(Comunidad|Provincia|Municipio)\b/i.test(limpio);
  };

  const PATRONES_TECNICOS = [
    /^Parte registrado desde movilidad\b/i,
    /^Inicio:/i,
    /^Fin:/i,
    /^Inicio t[eé]cnico:/i,
    /^Fin t[eé]cnico:/i,
    /^Geo\b/i,
    /^Lugar\b/i,
    /^Distancia\b/i,
    /^Tiempo\b/i,
    /^Pausas? /i,
    /^Pausa \d+/i,
    /^Total pausa/i,
    /^Factura\b/i,
    /^Firmado por:/i,
    /^Fotos intervenci[oó]n:/i,
  ];

  const bloques = texto
    .split('|')
    .map((parte) => parte.trim())
    .filter(Boolean);

  const lineas = [];

  bloques.forEach((bloque) => {
    const lineasBloque = String(bloque || '').split(/\r?\n/);
    const limpias = lineasBloque
      .map((linea) => String(linea || '').trim())
      .map((linea) => {
        if (!linea) return '';
        if (/^(Desplazamiento|Intervenci[oó]n)\b/i.test(linea)) return '';
        return linea
          .replace(/\bsb:\/\/[^\s]+/gi, '')
          .replace(/https?:\/\/[^\s]+/gi, '')
          .trim();
      })
      .filter(Boolean)
      .filter((parte) => !PATRONES_TECNICOS.some((re) => re.test(parte)))
      .filter((parte) => !esFragmentoLugar(parte));

    if (!limpias.length) return;
    if (lineas.length) {
      lineas.push('');
    }
    lineas.push(...limpias);
  });

  return lineas.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function dibujarTarjetasResumen(doc, estado, datos) {
  if (!datos.length) return;
  const cols = 3;
  const gap = 4;
  const ancho = (PAGINA.contenido - gap * (cols - 1)) / cols;
  const alto = 18;
  const filas = Math.ceil(datos.length / cols);
  const altoTotal = filas * alto + (filas - 1) * gap;

  reservarEspacio(doc, estado, altoTotal + 4);

  for (let i = 0; i < datos.length; i += 1) {
    const col = i % cols;
    const fila = Math.floor(i / cols);
    const x = PAGINA.margenX + col * (ancho + gap);
    const y = estado.y + fila * (alto + gap);
    const [titulo, valor] = datos[i];

    setFill(doc, COLOR.fondoSuave);
    setStroke(doc, COLOR.borde);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, ancho, alto, 1.5, 1.5, 'FD');

    setText(doc, COLOR.textoMute);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(String(titulo).toUpperCase(), x + 3, y + 5);

    setText(doc, COLOR.marca);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    const lineas = doc.splitTextToSize(txt(valor), ancho - 6);
    doc.text(lineas.slice(0, 2), x + 3, y + 10.5);
  }

  estado.y += altoTotal + 5;
}

function dibujarTablaInfo(doc, estado, filas) {
  if (!filas || !filas.length) return;
  const xEtiqueta = PAGINA.margenX + 3;
  const xValor = PAGINA.margenX + 65;
  const anchoValor = PAGINA.contenido - (xValor - PAGINA.margenX) - 3;
  const padFila = 1.5;
  const altoLinea = 4.2;

  // Pre-medir
  const items = filas.map(([etiqueta, valor]) => {
    const lineas = doc.splitTextToSize(txt(valor), anchoValor);
    const altoFila = Math.max(altoLinea + padFila * 2, lineas.length * altoLinea + padFila * 2);
    return { etiqueta, lineas, altoFila };
  });
  const total = items.reduce((a, it) => a + it.altoFila, 0);

  reservarEspacio(doc, estado, total + 2);

  let y = estado.y;
  items.forEach((it, idx) => {
    if (idx % 2 === 0) {
      setFill(doc, COLOR.fondoZebra);
      doc.rect(PAGINA.margenX, y, PAGINA.contenido, it.altoFila, 'F');
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

  // Borde envolvente sutil
  setStroke(doc, COLOR.borde);
  doc.setLineWidth(0.2);
  doc.rect(PAGINA.margenX, estado.y, PAGINA.contenido, total);

  estado.y += total + 4;
}

function dibujarParrafo(doc, estado, texto) {
  const contenido = txt(texto, 'Sin descripción.');
  const maxWidth = PAGINA.contenido - 6;
  const segmentos = String(contenido || '').split(/\r?\n/);
  const lineas = [];
  segmentos.forEach((segmento, indice) => {
    const normalizado = String(segmento || '').trimEnd();
    if (!normalizado) {
      lineas.push(' ');
    } else {
      const partidas = doc.splitTextToSize(normalizado, maxWidth);
      lineas.push(...partidas);
    }
  });
  const alto = lineas.length * 4.4 + 6;
  reservarEspacio(doc, estado, alto);

  setStroke(doc, COLOR.borde);
  doc.setLineWidth(0.2);
  doc.rect(PAGINA.margenX, estado.y, PAGINA.contenido, alto);

  setText(doc, COLOR.texto);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(lineas, PAGINA.margenX + 3, estado.y + 5);

  estado.y += alto + 4;
}

function dibujarTablaMateriales(doc, estado, materiales) {
  if (!materiales.length) {
    dibujarParrafo(doc, estado, 'No se han registrado materiales en esta intervención.');
    return;
  }

  const x = PAGINA.margenX;
  const w = PAGINA.contenido;
  const colCantidad = 22;
  const colPrecio = 32;
  const colImporte = 32;
  const colNombre = w - colCantidad - colPrecio - colImporte;
  const altoCab = 8;
  const altoFila = 7;
  const altoTotal = 9;

  reservarEspacio(doc, estado, altoCab + materiales.length * altoFila + altoTotal + 4);

  // Cabecera
  setFill(doc, COLOR.marca);
  doc.rect(x, estado.y, w, altoCab, 'F');
  setText(doc, COLOR.blanco);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('MATERIAL', x + 3, estado.y + 5.5);
  doc.text('CANT.', x + colNombre + colCantidad / 2, estado.y + 5.5, { align: 'center' });
  doc.text('PRECIO UD.', x + colNombre + colCantidad + colPrecio / 2, estado.y + 5.5, { align: 'center' });
  doc.text('IMPORTE', x + w - 3, estado.y + 5.5, { align: 'right' });

  let y = estado.y + altoCab;
  materiales.forEach((m, idx) => {
    if (idx % 2 === 1) {
      setFill(doc, COLOR.fondoZebra);
      doc.rect(x, y, w, altoFila, 'F');
    }
    setText(doc, COLOR.texto);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const nombre = doc.splitTextToSize(txt(m.nombre, 'Material'), colNombre - 4)[0];
    doc.text(nombre, x + 3, y + 4.7);
    doc.text(String(m.cantidad ?? '—'), x + colNombre + colCantidad / 2, y + 4.7, { align: 'center' });
    doc.text(m.precioUnitario != null ? `${m.precioUnitario.toFixed(2)} €` : '—',
      x + colNombre + colCantidad + colPrecio / 2, y + 4.7, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(m.importe != null ? `${m.importe.toFixed(2)} €` : '—', x + w - 3, y + 4.7, { align: 'right' });
    y += altoFila;
  });

  // Total
  const total = materiales.reduce((a, m) => a + (Number.isFinite(m.importe) ? m.importe : 0), 0);
  setFill(doc, COLOR.bordeSuave);
  doc.rect(x, y, w, altoTotal, 'F');
  setStroke(doc, COLOR.borde);
  doc.setLineWidth(0.2);
  doc.line(x, y, x + w, y);
  setText(doc, COLOR.marca);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('TOTAL MATERIALES', x + 3, y + 6);
  doc.text(`${total.toFixed(2)} €`, x + w - 3, y + 6, { align: 'right' });

  // Borde tabla
  setStroke(doc, COLOR.borde);
  doc.setLineWidth(0.2);
  doc.rect(x, estado.y, w, altoCab + materiales.length * altoFila + altoTotal);

  estado.y += altoCab + materiales.length * altoFila + altoTotal + 5;
}

function dibujarValoracionEconomica(doc, estado, val, totalMaterialesFallback = 0) {
  if (!val) return;
  const aplicaFest = Boolean(val.aplicaRecargoFestivo);
  const aplicaFuera = Boolean(val.aplicaRecargoFueraHorario);
  const recFestPct = aplicaFest ? Number(val.recargoFestivoPct || 0) : 0;
  const recFueraPct = aplicaFuera ? Number(val.recargoFueraHorarioPct || 0) : 0;
  const pctRecargoMO = num(val.porcentajeRecargoManoObra) ?? (recFestPct + recFueraPct);
  const mecanicosIntervinieron = Math.max(1, Math.round(num(val.mecanicosIntervinieron) ?? 1));
  const moBase = num(val.costeManoObraBase)
    ?? (Number(val.tarifaManoObraHora || 0) * Number(val.horasManoObra || 0) * mecanicosIntervinieron);
  const moTotal = num(val.costeManoObraTotal) ?? (moBase * (1 + pctRecargoMO / 100));
  const desplTotal = num(val.costeDesplazamientoTotal)
    ?? (Number(val.tarifaDesplazamientoKm || 0) * Number(val.kmDesplazamientoFacturables || 0));
  const materiales = num(val.costeMaterialesEditable);
  const materialesFinal = materiales != null ? materiales : Number(totalMaterialesFallback || 0);
  const totalCalculado = materialesFinal + moTotal + desplTotal;
  const totalGuardado = num(val.costeTotal);
  const totalGeneral = totalGuardado != null && Math.abs(totalGuardado - totalCalculado) < 0.02
    ? totalGuardado
    : totalCalculado;

  const x = PAGINA.margenX;
  const w = PAGINA.contenido;
  const colDesc = w - 35 - 35;
  const colDetalle = 35;
  const colImporte = 35;
  const altoFila = 6.5;

  const filas = [
    ['Materiales', '', materialesFinal],
    [
      'Mano de obra',
      mecanicosIntervinieron > 1
        ? `${num(val.horasManoObra) ?? 0} h × ${mecanicosIntervinieron} mecánicos × ${eur(val.tarifaManoObraHora)}`
        : `${num(val.horasManoObra) ?? 0} h × ${eur(val.tarifaManoObraHora)}`,
      moBase,
    ],
  ];
  if (pctRecargoMO > 0) {
    filas.push([`Recargo mano de obra`, `+${pctRecargoMO.toFixed(2)} %`, moTotal - moBase]);
  }
  const kmFact = num(val.kmDesplazamientoFacturables) ?? 0;
  filas.push([
    'Desplazamiento',
    `${kmFact} km facturables × ${eur(val.tarifaDesplazamientoKm)}/km`,
    desplTotal,
  ]);

  const altoCab = 7;
  const altoTotal = 10;
  reservarEspacio(doc, estado, altoCab + filas.length * altoFila + altoTotal + 4);

  // Cabecera
  setFill(doc, COLOR.marca);
  doc.rect(x, estado.y, w, altoCab, 'F');
  setText(doc, COLOR.blanco);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('CONCEPTO', x + 3, estado.y + 5);
  doc.text('DETALLE', x + colDesc + colDetalle / 2, estado.y + 5, { align: 'center' });
  doc.text('IMPORTE', x + w - 3, estado.y + 5, { align: 'right' });

  let y = estado.y + altoCab;
  filas.forEach((f, idx) => {
    if (idx % 2 === 1) {
      setFill(doc, COLOR.fondoZebra);
      doc.rect(x, y, w, altoFila, 'F');
    }
    setText(doc, COLOR.texto);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(String(f[0]), x + 3, y + 4.5);
    setText(doc, COLOR.textoSuave);
    doc.setFontSize(8.5);
    doc.text(String(f[1]), x + colDesc + colDetalle / 2, y + 4.5, { align: 'center' });
    setText(doc, COLOR.texto);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(eur(f[2]), x + w - 3, y + 4.5, { align: 'right' });
    y += altoFila;
  });

  // Total general destacado
  setFill(doc, COLOR.marca);
  doc.rect(x, y, w, altoTotal, 'F');
  setText(doc, COLOR.blanco);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL', x + 3, y + 6.5);
  doc.setFontSize(13);
  doc.text(eur(totalGeneral), x + w - 3, y + 6.8, { align: 'right' });

  setStroke(doc, COLOR.borde);
  doc.setLineWidth(0.2);
  doc.rect(x, estado.y, w, altoCab + filas.length * altoFila + altoTotal);

  estado.y += altoCab + filas.length * altoFila + altoTotal + 5;
}

async function dibujarFotos(doc, estado, urls) {
  if (!Array.isArray(urls) || !urls.length) {
    dibujarParrafo(doc, estado, 'Sin evidencias fotográficas adjuntas.');
    return;
  }

  const cols = 2;
  const gap = 4;
  const ancho = (PAGINA.contenido - gap * (cols - 1)) / cols;
  const alto = 60;
  const padTitulo = 6;
  const maxImgAncho = ancho - 4;
  const maxImgAlto = alto - padTitulo - 3;

  for (let i = 0; i < urls.length; i += cols) {
    reservarEspacio(doc, estado, alto + 3);
    for (let c = 0; c < cols; c += 1) {
      const idx = i + c;
      if (!urls[idx]) continue;
      const x = PAGINA.margenX + c * (ancho + gap);
      const y = estado.y;

      setStroke(doc, COLOR.borde);
      doc.setLineWidth(0.2);
      doc.rect(x, y, ancho, alto);
      setFill(doc, COLOR.bordeSuave);
      doc.rect(x, y, ancho, padTitulo, 'F');

      setText(doc, COLOR.marca);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(`Evidencia ${idx + 1}`, x + 2.5, y + 4.2);

      const dataUrl = await urlADataUrl(urls[idx]);
      if (!dataUrl) {
        setText(doc, COLOR.textoMute);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.text('No se pudo cargar la imagen', x + ancho / 2, y + alto / 2, { align: 'center' });
        continue;
      }

      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const ratio = img.naturalWidth / img.naturalHeight;
          let w = maxImgAncho;
          let h = w / ratio;
          if (h > maxImgAlto) { h = maxImgAlto; w = h * ratio; }
          const xImg = x + (ancho - w) / 2;
          const yImg = y + padTitulo + 1 + (maxImgAlto - h) / 2;
          try { doc.addImage(dataUrl, 'JPEG', xImg, yImg, w, h); } catch { /* noop */ }
          resolve();
        };
        img.onerror = () => resolve();
        img.src = dataUrl;
      });
    }
    estado.y += alto + 3;
  }
}

async function dibujarFirma(doc, estado, firmaUrl, nombreFirmante, avisoConformidad) {
  const alto = 48;
  reservarEspacio(doc, estado, alto + 3);

  const x = PAGINA.margenX;
  const w = PAGINA.contenido;
  const colFirma = w * 0.55;
  const colDatos = w - colFirma;

  setStroke(doc, COLOR.borde);
  doc.setLineWidth(0.2);
  doc.rect(x, estado.y, w, alto);
  doc.line(x + colFirma, estado.y, x + colFirma, estado.y + alto);

  // Caja firma
  setText(doc, COLOR.textoSuave);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('FIRMA DEL CLIENTE', x + 3, estado.y + 5);

  if (firmaUrl) {
    const dataUrl = await urlADataUrl(firmaUrl);
    if (dataUrl) {
      try { doc.addImage(dataUrl, 'PNG', x + 3, estado.y + 7, colFirma - 6, alto - 12); } catch { /* noop */ }
    } else {
      setText(doc, COLOR.textoMute);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.text('Firma no disponible', x + colFirma / 2, estado.y + alto / 2, { align: 'center' });
    }
  } else {
    setText(doc, COLOR.textoMute);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('Sin firma registrada', x + colFirma / 2, estado.y + alto / 2, { align: 'center' });
  }

  // Datos firmante
  const xD = x + colFirma + 4;
  setText(doc, COLOR.textoSuave);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('DATOS CONFORMIDAD', xD, estado.y + 5);

  setText(doc, COLOR.textoSuave);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Nombre y apellidos:', xD, estado.y + 14);
  setText(doc, COLOR.texto);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(txt(nombreFirmante, 'Sin nombre'), xD, estado.y + 19);

  setText(doc, COLOR.textoSuave);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Fecha:', xD, estado.y + 27);
  setText(doc, COLOR.texto);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(txt(metaInforme.fechaEmision), xD, estado.y + 32);

  setText(doc, COLOR.textoMute);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  const aviso = avisoConformidad !== undefined
    ? String(avisoConformidad || '')
    : 'El cliente declara haber recibido el servicio descrito y dar su conformidad a las tareas realizadas.';
  if (aviso) {
    doc.text(doc.splitTextToSize(aviso, colDatos - 8), xD, estado.y + 40);
  }

  estado.y += alto + 4;
}

function dibujarBloqueLegal(doc, estado) {
  reservarEspacio(doc, estado, 22);
  const x = PAGINA.margenX;
  const w = PAGINA.contenido;

  setFill(doc, COLOR.bordeSuave);
  setStroke(doc, COLOR.borde);
  doc.setLineWidth(0.2);
  doc.rect(x, estado.y, w, 20, 'FD');

  setText(doc, COLOR.marca);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('AVISO LEGAL', x + 3, estado.y + 4.5);

  setText(doc, COLOR.textoSuave);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const aviso = `${EMPRESA.nombre} (${EMPRESA.cif}) · ${EMPRESA.direccion}. Documento generado automáticamente desde la plataforma SAT Móvil COTEPA. La conformidad del cliente se acredita mediante firma digital. Las imágenes incluidas constituyen evidencias de la intervención. Los datos personales se tratan según la normativa vigente; para ejercer derechos, escriba a ${EMPRESA.email}.`;
  doc.text(doc.splitTextToSize(aviso, w - 6), x + 3, estado.y + 9);

  estado.y += 22;
}

// =====================================================================
// Construcción de datos
// =====================================================================

function construirFilasControlTiempos({
  desplazamiento,
  intervension,
  seguimientoTiempo,
  mostrarInicioFinDesplazamiento = true,
}) {
  const filas = [];
  const desp = desplazamiento || {};
  const inter = intervension || {};
  const seg = seguimientoTiempo || {};

  const inicioDesp = desp.inicioIso || seg.inicioIso;
  const finDesp = desp.finIso || seg.finIso;
  const lugarFinDesp = desp.ubicacionFin?.nombreLugarCompleto
    || desp.ubicacionFin?.nombreLugar
    || seg.ubicacionFin?.nombreLugarCompleto
    || seg.ubicacionFin?.nombreLugar;
  const distMetros = num(desp.distanciaMetros) ?? num(seg.distanciaMetros);
  const km = distMetros != null ? Number((distMetros / 1000).toFixed(2)) : null;

  const inicioInt = inter.inicioIso;
  const finInt = inter.finIso;
  const lugarInt = inter.ubicacionInicio?.nombreLugarCompleto || inter.ubicacionInicio?.nombreLugar;

  // Desplazamiento
  if (mostrarInicioFinDesplazamiento) {
    if (inicioDesp) filas.push(['Inicio desplazamiento', formatearFechaCorta(inicioDesp)]);
    if (finDesp) filas.push(['Fin desplazamiento', formatearFechaCorta(finDesp)]);
  }
  if (lugarFinDesp) filas.push(['Lugar destino', lugarFinDesp]);
  if (km != null) filas.push(['Distancia recorrida', `${km} km`]);

  // Intervención (mostrar bruto y descuento de pausas)
  const pausas = Array.isArray(inter.pausasComida) ? inter.pausasComida : [];
  const minutosBrutoIntervencion = (inicioInt || finInt) ? (resolverMinutosFase(inter) || 0) : 0;
  const minutosPausas = pausas.reduce((a, p) => a + (resolverMinutosFase(p) || 0), 0);
  const minutosEfectivos = Math.max(0, minutosBrutoIntervencion - minutosPausas);

  if (inicioInt) filas.push(['Inicio intervención', formatearFechaCorta(inicioInt)]);
  if (finInt) filas.push(['Fin intervención', formatearFechaCorta(finInt)]);
  if (lugarInt) filas.push(['Lugar intervención', lugarInt]);

  // Pausas: siempre se muestran (Sin pausas si no hay)
  if (pausas.length === 0) {
    if (inicioInt || finInt) {
      filas.push(['Pausas', 'Sin pausas']);
    }
  } else {
    const detallePausas = pausas
      .map((p) => {
        const m = resolverMinutosFase(p) || 0;
        return `${m} min`;
      })
      .join(' + ');
    filas.push([`Pausas (${pausas.length})`, `${detallePausas} = ${minutosPausas} min`]);
  }

  // Tiempo efectivo
  if (inicioInt || finInt) {
    if (minutosPausas > 0) {
      filas.push(['Tiempo bruto intervención', `${(minutosBrutoIntervencion / 60).toFixed(2)} h (${minutosBrutoIntervencion} min)`]);
      filas.push(['Tiempo intervención efectivo', `${(minutosEfectivos / 60).toFixed(2)} h (${minutosEfectivos} min · descontadas pausas)`]);
    } else {
      const horasEfectivas = Math.max(1 / 60, minutosBrutoIntervencion / 60);
      filas.push(['Tiempo intervención', `${horasEfectivas.toFixed(2)} h`]);
    }
  }

  return filas;
}

// =====================================================================
// Construcción del PDF
// =====================================================================

async function crearPdfInforme({
  parte,
  formulario,
  seguimientoTiempo,
  desplazamiento,
  intervension,
  valoracionEconomica,
  clienteNombre,
  equipoNombre,
  tecnicoNombre,
  nombreFirmante,
  firmaUrl,
  fotosIntervencionUrls,
  secuencialDiario,
  fechaInformeIso,
  prefijoInforme = 'SAT',
}) {
  const informeTraceId = `${parte?.id || formulario?.orden_id || 'sin-orden'}-${Date.now()}`;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const fechaBaseIso = resolverFechaInformeIso({ parte, formulario, seguimientoTiempo, intervension });
  let fechaEmisionIso = fechaBaseIso;
  if (fechaInformeIso) {
    const f = new Date(fechaInformeIso);
    if (Number.isFinite(f.getTime())) {
      fechaEmisionIso = f.toISOString();
    }
  }
  const referencia = crearReferenciaInforme(fechaEmisionIso, secuencialDiario, prefijoInforme);
  const logoDataUrl = await obtenerLogoEmpresa();

  metaInforme = {
    referencia,
    fechaEmision: formatearFechaSolo(fechaEmisionIso),
  };

  const estado = { y: 32, logoDataUrl };
  dibujarCabeceraPagina(doc, { logoDataUrl, mostrarTitulo: true });

  // ==== HERO: Cliente / Equipo / Técnico ====
  dibujarTarjetasResumen(doc, estado, [
    ['Cliente', clienteNombre],
    ['Equipo', equipoNombre],
    ['Técnico', tecnicoNombre],
  ]);

  // ==== Identificación del parte ====
  const prioridad = txt(parte?.prioridad || formulario?.prioridad).toUpperCase();
  const descripcion = parte?.descripcion_averia || formulario?.descripcion_problema || '';

  dibujarTituloSeccion(doc, estado, 'Identificación');
  dibujarTablaInfo(doc, estado, [
    ['Nº de informe', referencia],
    ['Fecha intervención', metaInforme.fechaEmision],
    ['Prioridad', prioridad],
  ]);

  // ==== Descripción ====
  dibujarTituloSeccion(doc, estado, prefijoInforme === 'PEM' ? 'Descripción de la orden' : 'Descripción de la avería');
  dibujarParrafo(doc, estado, descripcion);

  // ==== Trabajos realizados ====
  // Filtramos los marcadores tecnicos (geolocalizacion, firma, URLs de fotos)
  // que conviven en `tareas_realizadas` con el texto descriptivo del tecnico
  // o con el texto libre que el admin haya introducido al editar el parte.
  const trabajosTexto = limpiarTextoTrabajosRealizados(parte?.tareas_realizadas);
  dibujarTituloSeccion(doc, estado, 'Trabajos realizados');
  dibujarParrafo(
    doc,
    estado,
    trabajosTexto || (parte?.tareas_realizadas ? 'Sin descripción adicional.' : 'Sin trabajos registrados.'),
  );

  // ==== Control de tiempos ====
  const filasTiempo = construirFilasControlTiempos({
    desplazamiento,
    intervension,
    seguimientoTiempo,
    mostrarInicioFinDesplazamiento: false,
  });
  if (filasTiempo.length) {
    dibujarTituloSeccion(doc, estado, 'Control de tiempos y geolocalización');
    dibujarTablaInfo(doc, estado, filasTiempo);
  }

  // ==== Materiales ====
  const materiales = materialesDesdeTexto(formulario?.materialesTexto || '');
  const totalMaterialesCalc = totalMaterialesDesdeLista(materiales);

  dibujarTituloSeccion(doc, estado, 'Materiales utilizados');
  dibujarTablaMateriales(doc, estado, materiales);

  // ==== Valoración económica ====
  if (valoracionEconomica) {
    dibujarTituloSeccion(doc, estado, 'Valoración económica');
    dibujarValoracionEconomica(doc, estado, valoracionEconomica, totalMaterialesCalc);
  }

  // ==== Evidencias fotográficas ====
  if (Array.isArray(fotosIntervencionUrls) && fotosIntervencionUrls.length) {
    dibujarTituloSeccion(doc, estado, 'Evidencias fotográficas');
    await dibujarFotos(doc, estado, fotosIntervencionUrls);
  }

  // ==== Conformidad ====
  dibujarTituloSeccion(doc, estado, 'Conformidad del cliente');
  const esPem = String(prefijoInforme || 'SAT').trim().toUpperCase() === 'PEM';
  const textoAceptacionCliente = esPem
    ? TEXTO_ACEPTACION_CLIENTE_PEM
    : txt(parte?.aceptacion_texto || formulario?.aceptacion_texto, '').trim();
  if (textoAceptacionCliente) dibujarParrafo(doc, estado, textoAceptacionCliente);
  await dibujarFirma(doc, estado, firmaUrl, nombreFirmante, esPem ? '' : undefined);

  // ==== Aviso legal ====
  dibujarBloqueLegal(doc, estado);

  // Pie de página
  dibujarPiePaginas(doc);

  const refSegura = referencia.replace(/\//g, '-').replace(/[^a-zA-Z0-9\-_]/g, '');

  return { pdfBlob: doc.output('blob'), nombreArchivo: `${refSegura}.pdf` };
}

// =====================================================================
// API pública (sin cambios de firma)
// =====================================================================

export function obtenerUrlPublicaInformeParte(clienteId, parteId) {
  const cliente = txt(clienteId, '').trim();
  const parte = txt(parteId, '').trim();
  if (!cliente || !parte) return '';
  const ruta = `${cliente}/informe-parte-${parte}.pdf`;
  return `sb://informes-partes/${ruta}`;
}

async function subirPdfInforme({ pdfBlob, nombreArchivo, clienteId, tecnicoId, ordenId }) {
  const supabase = obtenerClienteSupabase();
  const ruta = `${clienteId}/${tecnicoId}/${ordenId}/${nombreArchivo}`;
  const { error } = await supabase.storage
    .from('informes-partes')
    .upload(ruta, pdfBlob, { upsert: true, contentType: 'application/pdf', cacheControl: '0' });
  if (error) {
    throw new Error(`No se pudo subir el PDF a Storage: ${error.message}`);
  }
  return `sb://informes-partes/${ruta}`;
}

function construirMensajeErrorServidorInforme(error) {
  const detalle = String(error?.message || '').trim();
  if (!detalle) {
    return 'sin detalle';
  }
  return detalle;
}

async function obtenerSecuencialDiario(fechaIso, filtroTipoOrden = 'averia') {
  try {
    const supabase = obtenerClienteSupabase();
    const base = new Date(fechaIso);
    const hoy = Number.isFinite(base.getTime()) ? base : new Date();
    const inicio = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())).toISOString();
    const fin = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + 1)).toISOString();
    let consulta = supabase
      .from('ordenes_trabajo')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'finalizado')
      .gte('fecha_fin', inicio)
      .lt('fecha_fin', fin);
    if (filtroTipoOrden === 'pem') {
      consulta = consulta.in('tipo_orden', ['montaje', 'puesta_en_marcha']);
    } else if (filtroTipoOrden === 'averia') {
      consulta = consulta.eq('tipo_orden', 'averia');
    }
    const { count } = await consulta;
    return (count || 0) + 1;
  } catch {
    return 1;
  }
}

export async function generarYSubirInformeParte({
  parte,
  formulario,
  seguimientoTiempo,
  desplazamiento,
  intervension,
  valoracionEconomica,
  clienteNombre,
  equipoNombre,
  tecnicoNombre,
  nombreFirmante,
  firmaUrl,
  fotosIntervencionUrls,
  secuencialDiario: secuencialDiarioEntrada,
  fechaInformeIso,
  prefijoInforme = 'SAT',
  filtroTipoOrden = 'averia',
}) {
  const fechaBaseIso = resolverFechaInformeIso({ parte, formulario, seguimientoTiempo, intervension });
  const secuencialDiario = Number.isFinite(Number(secuencialDiarioEntrada)) && Number(secuencialDiarioEntrada) > 0
    ? Number(secuencialDiarioEntrada)
    : await obtenerSecuencialDiario(fechaBaseIso, filtroTipoOrden);

  const firmaAccesible = firmaUrl
    ? await obtenerUrlFirmadaStorage(firmaUrl, { expiresIn: 900 })
    : '';
  const fotosAccesibles = await Promise.all(
    (Array.isArray(fotosIntervencionUrls) ? fotosIntervencionUrls : [])
      .map((u) => obtenerUrlFirmadaStorage(u, { expiresIn: 900 })),
  );

  const supabase = obtenerClienteSupabase();
  const payloadInforme = {
    ordenId: formulario.orden_id || parte?.id,
    parte,
    formulario,
    seguimientoTiempo,
    desplazamiento,
    intervension,
    valoracionEconomica,
    clienteNombre,
    equipoNombre,
    tecnicoNombre,
    nombreFirmante,
    firmaUrl: firmaAccesible,
    fotosIntervencionUrls: fotosAccesibles,
    secuencialDiario,
    fechaInformeIso,
    prefijoInforme,
  };

  try {
    const { data, error } = await supabase.functions.invoke('generate-part-pdf', {
      body: payloadInforme,
    });

    if (error || !data?.pdfUrl || !data?.nombreArchivo) {
      throw new Error(construirMensajeErrorServidorInforme(error));
    }

    return { pdfUrl: data.pdfUrl, nombreArchivo: data.nombreArchivo };
  } catch (errorServidor) {
    const { pdfBlob, nombreArchivo } = await crearPdfInforme({
      parte,
      formulario,
      seguimientoTiempo,
      desplazamiento,
      intervension,
      valoracionEconomica,
      clienteNombre,
      equipoNombre,
      tecnicoNombre,
      nombreFirmante,
      firmaUrl: firmaAccesible,
      fotosIntervencionUrls: fotosAccesibles,
      secuencialDiario,
      fechaInformeIso,
      prefijoInforme,
    });

    try {
      const pdfUrl = await subirPdfInforme({
        pdfBlob,
        nombreArchivo,
        clienteId: formulario?.cliente_id,
        tecnicoId: formulario?.tecnico_id,
        ordenId: formulario?.orden_id || parte?.id,
      });
      return { pdfUrl, nombreArchivo };
    } catch (errorLocal) {
      const detalleServidor = construirMensajeErrorServidorInforme(errorServidor);
      const detalleLocal = String(errorLocal?.message || '').trim() || 'sin detalle';
      throw new Error(
        `No se pudo generar el informe PDF en servidor (${detalleServidor}) ni en local (${detalleLocal}).`,
      );
    }
  }
}

export async function generarInformeParteDemoLocal() {
  const ahoraIso = new Date().toISOString();
  const secuencialDiario = await obtenerSecuencialDiario();
  const { pdfBlob, nombreArchivo } = await crearPdfInforme({
    parte: { id: 'demo-local', tareas_realizadas: 'Sustitución de resistencia y limpieza de cámara. Verificación de termostato y prueba de carga.' },
    formulario: {
      cliente_id: 'demo-cliente',
      prioridad: 'alta',
      tiempo_empleado: '90',
      descripcion_problema: 'El equipo no alcanza la temperatura de consigna y muestra error E-04 de forma intermitente.',
      materialesTexto: 'Resistencia 220V;1;49.90\nKit limpieza horno;1;18.50',
    },
    seguimientoTiempo: null,
    desplazamiento: {
      inicioIso: ahoraIso,
      finIso: ahoraIso,
      ubicacionFin: { nombreLugarCompleto: 'C/ Mayor 12, Quart de les Valls (Valencia)' },
      distanciaMetros: 18500,
    },
    intervension: {
      inicioIso: ahoraIso,
      finIso: ahoraIso,
      ubicacionInicio: { nombreLugarCompleto: 'C/ Mayor 12, Quart de les Valls (Valencia)' },
      minutosGeo: 90,
      pausasComida: [],
    },
    valoracionEconomica: {
      costeMaterialesEditable: 68.40,
      tarifaManoObraHora: 50,
      horasManoObra: 1.5,
      tarifaDesplazamientoKm: 0.5,
      kmDesplazamientoFacturables: 37,
      recargoFestivoPct: 25,
      recargoFueraHorarioPct: 20,
      aplicaRecargoFestivo: false,
      aplicaRecargoFueraHorario: false,
    },
    clienteNombre: 'Panadería Centro',
    equipoNombre: 'Horno Convencional',
    tecnicoNombre: 'Laura Gómez',
    nombreFirmante: 'Antonio Pérez',
    firmaUrl: '',
    fotosIntervencionUrls: [],
    secuencialDiario,
  });

  const url = URL.createObjectURL(pdfBlob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
  return { nombreArchivo };
}
