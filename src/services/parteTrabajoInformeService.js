import { jsPDF } from 'jspdf';
import logoCotepaUrl from '../assets/cotepa.jpg';
import { obtenerClienteSupabase } from './supabaseClient';

let logoEmpresaDataUrlCache = null;
let logoEmpresaPromise = null;
let logoCabeceraActual = null;

export function obtenerUrlPublicaInformeParte(clienteId, parteId) {
  const cliente = valorTexto(clienteId, '').trim();
  const parte = valorTexto(parteId, '').trim();

  if (!cliente || !parte) {
    return '';
  }

  const supabase = obtenerClienteSupabase();
  const ruta = `${cliente}/informe-parte-${parte}.pdf`;
  const { data } = supabase.storage.from('informes-partes').getPublicUrl(ruta);

  return data?.publicUrl || '';
}

function valorTexto(valor, fallback = 'N/D') {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  return texto || fallback;
}

function formatearFecha(valor) {
  if (!valor) {
    return 'N/D';
  }

  const fecha = new Date(valor);
  if (!Number.isFinite(fecha.getTime())) {
    return String(valor);
  }

  return fecha.toLocaleString('es-ES');
}

function formatearFechaOficial(valor) {
  if (!valor) {
    return 'N/D';
  }

  const fecha = new Date(valor);
  if (!Number.isFinite(fecha.getTime())) {
    return String(valor);
  }

  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);
}

function crearReferenciaInforme(fechaIso, secuencial) {
  const fecha = new Date(fechaIso);
  const ahora = Number.isFinite(fecha.getTime()) ? fecha : new Date();
  const dd = String(ahora.getDate()).padStart(2, '0');
  const mm = String(ahora.getMonth() + 1).padStart(2, '0');
  const yyyy = ahora.getFullYear();
  const seq = String(Number.isFinite(secuencial) ? secuencial : 1).padStart(2, '0');
  return `SAT-${dd}-${mm}-${yyyy}/${seq}`;
}

function materialesDesdeTexto(texto) {
  if (!texto || !texto.trim()) {
    return [];
  }

  return texto
    .split('\n')
    .map((linea) => linea.trim())
    .filter(Boolean)
    .map((linea) => {
      const [nombre, cantidad, precio] = linea.split(';').map((v) => (v || '').trim());
      return {
        nombre: nombre || 'Material',
        cantidad: cantidad || '1',
        precio: precio || 'N/D',
      };
    });
}

const PDF_ESTILO = {
  colorPrimario: [15, 23, 42],
  colorSecundario: [226, 232, 240],
  colorAcento: [185, 28, 28],
  colorTexto: [30, 41, 59],
  margenX: 15,
  anchoContenido: 180,
};

function iniciarPagina(doc, estado) {
  doc.setDrawColor(...PDF_ESTILO.colorSecundario);
  doc.setLineWidth(0.4);
  doc.rect(8, 8, 194, 281);
  estado.y = 18;
}

function reservarEspacio(doc, estado, altoNecesario, withHeader = true) {
  if (estado.y + altoNecesario <= 284) {
    return;
  }

  doc.addPage();
  iniciarPagina(doc, estado);
  if (withHeader) {
    dibujarCabeceraSimple(doc, estado);
  }
}

function dibujarCabeceraSimple(doc, estado) {
  doc.setFillColor(...PDF_ESTILO.colorPrimario);
  doc.roundedRect(PDF_ESTILO.margenX, estado.y, PDF_ESTILO.anchoContenido, 14, 2, 2, 'F');

  const logoX = PDF_ESTILO.margenX + 4;
  const logoY = estado.y + 2;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(logoX, logoY, 10, 10, 1.5, 1.5, 'F');
  if (logoCabeceraActual) {
    try {
      doc.addImage(logoCabeceraActual, 'JPEG', logoX + 0.8, logoY + 0.8, 8.4, 8.4);
    } catch {
      // Si falla el logo, mantenemos la cabecera funcional.
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('INFORME SAT', PDF_ESTILO.margenX + 18, estado.y + 9);

  doc.setTextColor(...PDF_ESTILO.colorTexto);
  estado.y += 20;
}

function dibujarCabeceraPrincipal(doc, estado, referenciaInforme, logoEmpresaDataUrl) {
  doc.setFillColor(...PDF_ESTILO.colorPrimario);
  doc.roundedRect(PDF_ESTILO.margenX, estado.y, PDF_ESTILO.anchoContenido, 26, 3, 3, 'F');

  const logoX = PDF_ESTILO.margenX + 4;
  const logoY = estado.y + 4;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(logoX, logoY, 14, 14, 2, 2, 'F');
  if (logoEmpresaDataUrl) {
    try {
      doc.addImage(logoEmpresaDataUrl, 'JPEG', logoX + 1, logoY + 1, 12, 12);
    } catch {
      // Si falla la carga del logo, mantenemos la caja en blanco para no romper el PDF.
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('INFORME DE PARTE DE TRABAJO', PDF_ESTILO.margenX + 20, estado.y + 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('SAT COTEPA · Servicio Tecnico', PDF_ESTILO.margenX + 20, estado.y + 16);
  doc.text(`Re: parte ${valorTexto(referenciaInforme)}`, PDF_ESTILO.margenX + 20, estado.y + 22);

  doc.setTextColor(...PDF_ESTILO.colorTexto);
  estado.y += 32;
}

function dibujarBloqueDatos(doc, estado, datos) {
  const altoFila = 7;
  const alto = datos.length * altoFila + 6;
  reservarEspacio(doc, estado, alto);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...PDF_ESTILO.colorSecundario);
  doc.roundedRect(PDF_ESTILO.margenX, estado.y, PDF_ESTILO.anchoContenido, alto, 2, 2, 'FD');

  let y = estado.y + 7;
  datos.forEach(([etiqueta, valor]) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...PDF_ESTILO.colorPrimario);
    doc.text(`${etiqueta}:`, PDF_ESTILO.margenX + 4, y);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...PDF_ESTILO.colorTexto);
    doc.text(valorTexto(valor), PDF_ESTILO.margenX + 52, y);
    y += altoFila;
  });

  estado.y += alto + 5;
}

function dibujarTituloSeccion(doc, estado, titulo) {
  reservarEspacio(doc, estado, 12);
  doc.setFillColor(...PDF_ESTILO.colorAcento);
  doc.roundedRect(PDF_ESTILO.margenX, estado.y, 3, 8, 1, 1, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...PDF_ESTILO.colorPrimario);
  doc.text(titulo, PDF_ESTILO.margenX + 7, estado.y + 6);

  doc.setTextColor(...PDF_ESTILO.colorTexto);
  estado.y += 11;
}

function dibujarParrafo(doc, estado, texto) {
  const contenido = valorTexto(texto);
  const lineas = doc.splitTextToSize(contenido, PDF_ESTILO.anchoContenido - 8);
  const alto = lineas.length * 5 + 8;
  reservarEspacio(doc, estado, alto);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...PDF_ESTILO.colorSecundario);
  doc.roundedRect(PDF_ESTILO.margenX, estado.y, PDF_ESTILO.anchoContenido, alto, 2, 2, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_ESTILO.colorTexto);
  doc.text(lineas, PDF_ESTILO.margenX + 4, estado.y + 6);
  estado.y += alto + 4;
}

function dibujarTablaMateriales(doc, estado, materiales) {
  if (!materiales.length) {
    dibujarParrafo(doc, estado, 'Sin materiales declarados.');
    return;
  }

  const altoCabecera = 8;
  const altoFila = 7;
  const altoTabla = altoCabecera + materiales.length * altoFila;
  reservarEspacio(doc, estado, altoTabla + 6);

  const x = PDF_ESTILO.margenX;
  const colNombre = 110;
  const colCantidad = 30;
  const colPrecio = 40;

  doc.setFillColor(...PDF_ESTILO.colorPrimario);
  doc.rect(x, estado.y, PDF_ESTILO.anchoContenido, altoCabecera, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Material', x + 3, estado.y + 5.5);
  doc.text('Cantidad', x + colNombre + 3, estado.y + 5.5);
  doc.text('Precio', x + colNombre + colCantidad + 3, estado.y + 5.5);

  let y = estado.y + altoCabecera;
  materiales.forEach((material, indice) => {
    doc.setFillColor(indice % 2 === 0 ? 248 : 241, indice % 2 === 0 ? 250 : 245, indice % 2 === 0 ? 252 : 249);
    doc.rect(x, y, PDF_ESTILO.anchoContenido, altoFila, 'F');
    doc.setDrawColor(...PDF_ESTILO.colorSecundario);
    doc.rect(x, y, PDF_ESTILO.anchoContenido, altoFila);

    doc.setTextColor(...PDF_ESTILO.colorTexto);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    const nombre = doc.splitTextToSize(material.nombre, colNombre - 5)[0] || 'Material';
    doc.text(nombre, x + 3, y + 4.8);
    doc.text(valorTexto(material.cantidad), x + colNombre + 3, y + 4.8);
    doc.text(valorTexto(material.precio), x + colNombre + colCantidad + 3, y + 4.8);

    y += altoFila;
  });

  estado.y += altoTabla + 4;
}

async function dibujarFotos(doc, estado, fotosIntervencionUrls) {
  if (!Array.isArray(fotosIntervencionUrls) || fotosIntervencionUrls.length === 0) {
    dibujarParrafo(doc, estado, 'Sin fotos adjuntas.');
    return;
  }

  const anchoCaja = 87;
  const altoCaja = 62;
  const maxAnchoImg = 79;
  const maxAltoImg = 44;
  const columnas = 2;

  for (let i = 0; i < fotosIntervencionUrls.length; i += columnas) {
    reservarEspacio(doc, estado, altoCaja + 4);

    for (let col = 0; col < columnas; col += 1) {
      const indice = i + col;
      if (!fotosIntervencionUrls[indice]) continue;

      const x = PDF_ESTILO.margenX + col * (anchoCaja + 6);
      const y = estado.y;

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...PDF_ESTILO.colorSecundario);
      doc.roundedRect(x, y, anchoCaja, altoCaja, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...PDF_ESTILO.colorPrimario);
      doc.text(`Foto ${indice + 1}`, x + 3, y + 6);

      const dataUrl = await urlADataUrl(fotosIntervencionUrls[indice]);
      if (!dataUrl) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('No se pudo cargar la imagen.', x + 3, y + 15);
        continue;
      }

      // Ajustar imagen al marco sin deformar.
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const ratio = img.naturalWidth / img.naturalHeight;
          let ancho = maxAnchoImg;
          let alto = ancho / ratio;

          if (alto > maxAltoImg) {
            alto = maxAltoImg;
            ancho = alto * ratio;
          }

          const xImg = x + (anchoCaja - ancho) / 2;
          const yImg = y + 11 + (maxAltoImg - alto) / 2;
          doc.addImage(dataUrl, 'JPEG', xImg, yImg, ancho, alto);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = dataUrl;
      });
    }

    estado.y += altoCaja + 4;
  }
}

async function dibujarFirma(doc, estado, firmaUrl, nombreFirmante) {
  reservarEspacio(doc, estado, 58);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...PDF_ESTILO.colorSecundario);
  doc.roundedRect(PDF_ESTILO.margenX, estado.y, PDF_ESTILO.anchoContenido, 54, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...PDF_ESTILO.colorPrimario);
  doc.text('Firma del cliente', PDF_ESTILO.margenX + 4, estado.y + 8);

  if (firmaUrl) {
    const firmaDataUrl = await urlADataUrl(firmaUrl);
    if (firmaDataUrl) {
      doc.addImage(firmaDataUrl, 'PNG', PDF_ESTILO.margenX + 4, estado.y + 11, 85, 36);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text('No se pudo cargar la firma.', PDF_ESTILO.margenX + 4, estado.y + 16);
    }
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('Sin firma registrada.', PDF_ESTILO.margenX + 4, estado.y + 16);
  }

  doc.setDrawColor(148, 163, 184);
  doc.line(PDF_ESTILO.margenX + 110, estado.y + 41, PDF_ESTILO.margenX + 175, estado.y + 41);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...PDF_ESTILO.colorPrimario);
  doc.text(valorTexto(nombreFirmante), PDF_ESTILO.margenX + 111, estado.y + 38.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Nombre y conformidad del cliente', PDF_ESTILO.margenX + 111, estado.y + 46);

  estado.y += 58;
}

function dibujarPiePaginas(doc) {
  const totalPaginas = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    doc.setPage(pagina);
    doc.setDrawColor(...PDF_ESTILO.colorSecundario);
    doc.line(15, 281, 195, 281);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`SAT COTEPA · Documento generado automaticamente · Pagina ${pagina}/${totalPaginas}`, 15, 284.5);
  }
}

async function urlADataUrl(url) {
  try {
    const respuesta = await fetch(url);
    if (!respuesta.ok) return null;
    const blob = await respuesta.blob();
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

async function obtenerLogoEmpresaDataUrl() {
  if (logoEmpresaDataUrlCache) {
    return logoEmpresaDataUrlCache;
  }

  if (!logoEmpresaPromise) {
    logoEmpresaPromise = urlADataUrl(logoCotepaUrl)
      .then((dataUrl) => {
        logoEmpresaDataUrlCache = dataUrl || null;
        return logoEmpresaDataUrlCache;
      })
      .finally(() => {
        logoEmpresaPromise = null;
      });
  }

  return logoEmpresaPromise;
}

async function crearPdfInforme({
  parte,
  formulario,
  seguimientoTiempo,
  clienteNombre,
  equipoNombre,
  tecnicoNombre,
  nombreFirmante,
  firmaUrl,
  fotosIntervencionUrls,
  secuencialDiario,
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const estado = { y: 18 };
  const materiales = materialesDesdeTexto(formulario.materialesTexto);
  const fechaInformeIso = new Date().toISOString();
  const referenciaInforme = crearReferenciaInforme(fechaInformeIso, secuencialDiario);
  const logoEmpresaDataUrl = await obtenerLogoEmpresaDataUrl();
  logoCabeceraActual = logoEmpresaDataUrl;

  iniciarPagina(doc, estado);
  dibujarCabeceraPrincipal(doc, estado, referenciaInforme, logoEmpresaDataUrl);

  dibujarBloqueDatos(doc, estado, [
    ['Nº informe', referenciaInforme],
    ['Fecha de informe', formatearFechaOficial(fechaInformeIso)],
    ['Cliente', clienteNombre],
    ['Equipo', equipoNombre],
    ['Tecnico', tecnicoNombre],
    ['Prioridad', valorTexto(formulario.prioridad)],
    ['Tiempo empleado (min)', valorTexto(String(formulario.tiempo_empleado))],
  ]);

  dibujarTituloSeccion(doc, estado, 'Descripcion del problema');
  dibujarParrafo(doc, estado, formulario.descripcion_problema);

  dibujarTituloSeccion(doc, estado, 'Control de tiempos y geolocalizacion');
  dibujarBloqueDatos(doc, estado, [
    ['Inicio', formatearFecha(seguimientoTiempo?.inicioIso)],
    ['Lugar inicio', valorTexto(seguimientoTiempo?.ubicacionInicio?.nombreLugarCompleto || seguimientoTiempo?.ubicacionInicio?.nombreLugar)],
    ['Fin', formatearFecha(seguimientoTiempo?.finIso)],
    ['Lugar fin', valorTexto(seguimientoTiempo?.ubicacionFin?.nombreLugarCompleto || seguimientoTiempo?.ubicacionFin?.nombreLugar)],
    ['Distancia geo (m)', valorTexto(seguimientoTiempo?.distanciaMetros ? String(seguimientoTiempo.distanciaMetros) : '', 'N/D')],
    ['Tiempo geo (min)', valorTexto(seguimientoTiempo?.minutosGeo ? String(seguimientoTiempo.minutosGeo) : '', 'N/D')],
  ]);

  dibujarTituloSeccion(doc, estado, 'Materiales utilizados');
  dibujarTablaMateriales(doc, estado, materiales);

  dibujarTituloSeccion(doc, estado, 'Evidencias fotograficas');
  await dibujarFotos(doc, estado, fotosIntervencionUrls);

  dibujarTituloSeccion(doc, estado, 'Conformidad');
  await dibujarFirma(doc, estado, firmaUrl, nombreFirmante);

  dibujarPiePaginas(doc);

  const nombreArchivo = `informe-parte-${parte.id || Date.now()}.pdf`;
  const pdfBlob = doc.output('blob');

  return { pdfBlob, nombreArchivo };
}

async function subirPdfInforme({ pdfBlob, nombreArchivo, clienteId }) {
  const supabase = obtenerClienteSupabase();
  const ruta = `${clienteId}/${nombreArchivo}`;

  const { error: errorSubida } = await supabase.storage
    .from('informes-partes')
    .upload(ruta, pdfBlob, {
      upsert: false,
      contentType: 'application/pdf',
      cacheControl: '3600',
    });

  if (errorSubida) {
    throw new Error(
      `No se pudo subir el PDF a Storage. Verifica bucket/policies de informes-partes. (${errorSubida.message})`,
    );
  }

  const { data } = supabase.storage.from('informes-partes').getPublicUrl(ruta);
  return data?.publicUrl || null;
}

async function obtenerSecuencialDiario() {
  try {
    const supabase = obtenerClienteSupabase();
    const hoy = new Date();
    const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
    const finDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1).toISOString();

    const { count } = await supabase
      .from('ordenes_trabajo')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'finalizado')
      .gte('fecha_fin', inicioDia)
      .lt('fecha_fin', finDia);

    return (count || 0) + 1;
  } catch {
    return 1;
  }
}

export async function generarYSubirInformeParte({
  parte,
  formulario,
  seguimientoTiempo,
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
    clienteNombre,
    equipoNombre,
    tecnicoNombre,
    nombreFirmante,
    firmaUrl,
    fotosIntervencionUrls,
    secuencialDiario,
  });

  const pdfUrl = await subirPdfInforme({
    pdfBlob,
    nombreArchivo,
    clienteId: formulario.cliente_id,
  });

  if (!pdfUrl) {
    throw new Error('No se pudo obtener la URL pública del informe PDF.');
  }

  return { pdfUrl, nombreArchivo };
}

