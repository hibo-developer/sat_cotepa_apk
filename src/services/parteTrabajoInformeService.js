import { jsPDF } from 'jspdf';
import logoCotepaUrl from '../assets/cotepa.jpg';
import { obtenerClienteSupabase } from './supabaseClient';

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

function crearReferenciaInforme(fechaIso, secuencial) {
  const f = new Date(fechaIso);
  const ahora = Number.isFinite(f.getTime()) ? f : new Date();
  const dd = String(ahora.getDate()).padStart(2, '0');
  const mm = String(ahora.getMonth() + 1).padStart(2, '0');
  const yyyy = ahora.getFullYear();
  const seq = String(Number.isFinite(secuencial) ? secuencial : 1).padStart(2, '0');
  return `SAT-${dd}-${mm}-${yyyy}/${seq}`;
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
  const lineas = doc.splitTextToSize(contenido, PAGINA.contenido - 6);
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

function dibujarValoracionEconomica(doc, estado, val) {
  if (!val) return;
  const aplicaFest = Boolean(val.aplicaRecargoFestivo);
  const aplicaFuera = Boolean(val.aplicaRecargoFueraHorario);
  const recFestPct = aplicaFest ? Number(val.recargoFestivoPct || 0) : 0;
  const recFueraPct = aplicaFuera ? Number(val.recargoFueraHorarioPct || 0) : 0;
  const pctRecargoMO = num(val.porcentajeRecargoManoObra) ?? (recFestPct + recFueraPct);
  const moBase = num(val.costeManoObraBase)
    ?? (Number(val.tarifaManoObraHora || 0) * Number(val.horasManoObra || 0));
  const moTotal = num(val.costeManoObraTotal) ?? (moBase * (1 + pctRecargoMO / 100));
  const desplTotal = num(val.costeDesplazamientoTotal)
    ?? (Number(val.tarifaDesplazamientoKm || 0) * Number(val.kmDesplazamientoFacturables || 0));
  const materiales = num(val.costeMaterialesEditable) ?? 0;
  const totalGeneral = num(val.costeTotal) ?? (materiales + moTotal + desplTotal);

  const x = PAGINA.margenX;
  const w = PAGINA.contenido;
  const colDesc = w - 35 - 35;
  const colDetalle = 35;
  const colImporte = 35;
  const altoFila = 6.5;

  const filas = [
    ['Materiales', '', materiales],
    ['Mano de obra', `${num(val.horasManoObra) ?? 0} h × ${eur(val.tarifaManoObraHora)}`, moBase],
  ];
  if (pctRecargoMO > 0) {
    filas.push([`Recargo mano de obra`, `+${pctRecargoMO.toFixed(2)} %`, moTotal - moBase]);
  }
  const kmFact = num(val.kmDesplazamientoFacturables) ?? 0;
  const kmIda = kmFact > 0 ? (kmFact / 2).toFixed(2) : '0';
  filas.push([
    'Desplazamiento',
    `${kmIda} km ida × 2 = ${kmFact} km × ${eur(val.tarifaDesplazamientoKm)}`,
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

async function dibujarFirma(doc, estado, firmaUrl, nombreFirmante) {
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
  const aviso = 'El cliente declara haber recibido el servicio descrito y dar su conformidad a las tareas realizadas.';
  doc.text(doc.splitTextToSize(aviso, colDatos - 8), xD, estado.y + 40);

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

function construirFilasControlTiempos({ desplazamiento, intervension, seguimientoTiempo }) {
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
  if (inicioDesp) filas.push(['Inicio desplazamiento', formatearFechaCorta(inicioDesp)]);
  if (finDesp) filas.push(['Fin desplazamiento', formatearFechaCorta(finDesp)]);
  if (lugarFinDesp) filas.push(['Lugar destino', lugarFinDesp]);
  if (km != null) filas.push(['Distancia recorrida', `${km} km (ida) · ${(km * 2).toFixed(2)} km facturables`]);

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
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const fechaInformeIso = new Date().toISOString();
  const referencia = crearReferenciaInforme(fechaInformeIso, secuencialDiario);
  const logoDataUrl = await obtenerLogoEmpresa();

  metaInforme = {
    referencia,
    fechaEmision: formatearFechaSolo(fechaInformeIso),
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
  const tiempoMin = parte?.tiempo_empleado_minutos != null
    ? String(parte.tiempo_empleado_minutos)
    : String(formulario?.tiempo_empleado || '');
  const prioridad = txt(parte?.prioridad || formulario?.prioridad).toUpperCase();
  const descripcion = parte?.descripcion_averia || formulario?.descripcion_problema || '';

  dibujarTituloSeccion(doc, estado, 'Identificación');
  dibujarTablaInfo(doc, estado, [
    ['Nº de informe', referencia],
    ['Fecha de emisión', metaInforme.fechaEmision],
    ['Prioridad', prioridad],
    ['Tiempo empleado', tiempoMin ? `${tiempoMin} min` : '—'],
  ]);

  // ==== Descripción de la avería ====
  dibujarTituloSeccion(doc, estado, 'Descripción de la avería');
  dibujarParrafo(doc, estado, descripcion);

  // ==== Trabajos realizados ====
  if (parte?.tareas_realizadas) {
    dibujarTituloSeccion(doc, estado, 'Trabajos realizados');
    dibujarParrafo(doc, estado, parte.tareas_realizadas);
  }

  // ==== Control de tiempos ====
  const filasTiempo = construirFilasControlTiempos({ desplazamiento, intervension, seguimientoTiempo });
  if (filasTiempo.length) {
    dibujarTituloSeccion(doc, estado, 'Control de tiempos y geolocalización');
    dibujarTablaInfo(doc, estado, filasTiempo);
  }

  // ==== Materiales ====
  const materiales = materialesDesdeTexto(formulario?.materialesTexto || '');
  dibujarTituloSeccion(doc, estado, 'Materiales utilizados');
  dibujarTablaMateriales(doc, estado, materiales);

  // ==== Valoración económica ====
  if (valoracionEconomica) {
    dibujarTituloSeccion(doc, estado, 'Valoración económica');
    dibujarValoracionEconomica(doc, estado, valoracionEconomica);
  }

  // ==== Evidencias fotográficas ====
  if (Array.isArray(fotosIntervencionUrls) && fotosIntervencionUrls.length) {
    dibujarTituloSeccion(doc, estado, 'Evidencias fotográficas');
    await dibujarFotos(doc, estado, fotosIntervencionUrls);
  }

  // ==== Conformidad ====
  dibujarTituloSeccion(doc, estado, 'Conformidad del cliente');
  await dibujarFirma(doc, estado, firmaUrl, nombreFirmante);

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
  const supabase = obtenerClienteSupabase();
  const ruta = `${cliente}/informe-parte-${parte}.pdf`;
  const { data } = supabase.storage.from('informes-partes').getPublicUrl(ruta);
  return data?.publicUrl || '';
}

async function subirPdfInforme({ pdfBlob, nombreArchivo, clienteId }) {
  const supabase = obtenerClienteSupabase();
  const ruta = `${clienteId}/${nombreArchivo}`;
  const { error } = await supabase.storage
    .from('informes-partes')
    .upload(ruta, pdfBlob, { upsert: true, contentType: 'application/pdf', cacheControl: '3600' });
  if (error) {
    throw new Error(`No se pudo subir el PDF a Storage: ${error.message}`);
  }
  const { data } = supabase.storage.from('informes-partes').getPublicUrl(ruta);
  return data?.publicUrl || null;
}

async function obtenerSecuencialDiario() {
  try {
    const supabase = obtenerClienteSupabase();
    const hoy = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1).toISOString();
    const { count } = await supabase
      .from('ordenes_trabajo')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'finalizado')
      .gte('fecha_fin', inicio)
      .lt('fecha_fin', fin);
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
}) {
  const secuencialDiario = await obtenerSecuencialDiario();
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
    firmaUrl,
    fotosIntervencionUrls,
    secuencialDiario,
  });
  const pdfUrl = await subirPdfInforme({ pdfBlob, nombreArchivo, clienteId: formulario.cliente_id });
  if (!pdfUrl) throw new Error('No se pudo obtener la URL pública del informe PDF.');
  return { pdfUrl, nombreArchivo };
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
