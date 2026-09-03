import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsPDF } from 'https://esm.sh/jspdf@3.0.1';

function buildCorsHeaders(req: Request): { headers: Record<string, string>; originAllowed: boolean } {
  const origin = req.headers.get('Origin');
  const allowOrigin = origin || '*';
  return {
    originAllowed: true,
    headers: {
      'Access-Control-Allow-Origin': allowOrigin,
      'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
    },
  });
}

type RolSat = 'admin' | 'oficina' | 'tecnico';

type Payload = {
  ordenId?: string;
  parte?: Record<string, unknown>;
  formulario?: Record<string, unknown>;
  seguimientoTiempo?: Record<string, unknown>;
  desplazamiento?: Record<string, unknown>;
  intervension?: Record<string, unknown>;
  valoracionEconomica?: Record<string, unknown>;
  clienteNombre?: string;
  equipoNombre?: string;
  tecnicoNombre?: string;
  nombreFirmante?: string;
  firmaUrl?: string;
  fotosIntervencionUrls?: string[];
  secuencialDiario?: number;
  fechaInformeIso?: string;
  prefijoInforme?: string;
  filtroTipoOrden?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function txt(valor: unknown, fallback = '—') {
  const texto = typeof valor === 'string' ? valor.trim() : (valor != null ? String(valor).trim() : '');
  return texto || fallback;
}

function num(valor: unknown) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function eur(valor: unknown) {
  const n = num(valor);
  return n != null ? `${n.toFixed(2)} €` : '—';
}

function crearReferenciaInforme(fechaIso: string, secuencial: number | undefined, prefijoInforme = 'SAT') {
  const fecha = new Date(fechaIso);
  const now = Number.isFinite(fecha.getTime()) ? fecha : new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  const seq = String(Number.isFinite(Number(secuencial)) ? Number(secuencial) : 1).padStart(2, '0');
  const prefijo = String(prefijoInforme || 'SAT').trim().toUpperCase() || 'SAT';
  return `${prefijo}-${yy}${mm}${dd}-${seq}`;
}

function formatFecha(valor: unknown) {
  if (!valor) return '—';
  const fecha = new Date(String(valor));
  if (!Number.isFinite(fecha.getTime())) return String(valor);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);
}

function splitLines(doc: InstanceType<typeof jsPDF>, text: string, maxWidth: number) {
  return doc.splitTextToSize(String(text || ''), maxWidth);
}

async function urlToDataUrl(url: string) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const mime = response.headers.get('content-type') || 'application/octet-stream';
    return `data:${mime};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

async function verificarSesionYRol(req: Request, supabaseUrl: string, supabaseAnonKey: string, cors: Record<string, string>) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { error: jsonResponse({ error: 'Falta cabecera Authorization' }, 401, cors) };
  }

  const clienteAuth = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: authData, error: authError } = await clienteAuth.auth.getUser();
  if (authError || !authData?.user) {
    return { error: jsonResponse({ error: 'Sesion invalida o expirada' }, 401, cors) };
  }

  const { data: perfil, error: perfilError } = await clienteAuth
    .from('usuarios_sat')
    .select('rol')
    .eq('user_id', authData.user.id)
    .maybeSingle();

  if (perfilError) {
    return { error: jsonResponse({ error: `No se pudo validar rol SAT: ${perfilError.message}` }, 500, cors) };
  }

  const rol = (perfil?.rol || '') as RolSat;
  if (rol !== 'admin' && rol !== 'oficina' && rol !== 'tecnico') {
    return { error: jsonResponse({ error: 'Acceso denegado: rol SAT no autorizado.' }, 403, cors) };
  }

  return { userId: authData.user.id, rol };
}

async function verificarAccesoOrden(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  rol: RolSat,
  ordenId: string,
) {
  const { data: orden, error } = await supabaseAdmin
    .from('ordenes_trabajo')
    .select('id, cliente_id, tecnico_id')
    .eq('id', ordenId)
    .maybeSingle();

  if (error || !orden?.id) {
    return { ok: false, error: 'Orden no encontrada' };
  }

  if (rol === 'admin' || rol === 'oficina') {
    return { ok: true, orden };
  }

  const { data: tecnico } = await supabaseAdmin
    .from('tecnicos')
    .select('id')
    .eq('user_id', userId)
    .eq('activo', true)
    .maybeSingle();

  if (!tecnico?.id || tecnico.id !== orden.tecnico_id) {
    return { ok: false, error: 'No tienes acceso a esta orden' };
  }

  return { ok: true, orden };
}

async function generarPdf({
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
  prefijoInforme,
}: Payload) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const fechaBase = fechaInformeIso || new Date().toISOString();
  const referencia = crearReferenciaInforme(fechaBase, secuencialDiario, prefijoInforme || 'SAT');
  const fechaEmision = formatFecha(fechaBase);

  const margenX = 14;
  let y = 16;
  const maxWidth = 182;

  const cabecera = [
    'COTEPA S.L.',
    'Servicio de Asistencia Técnica',
    `Parte de trabajo ${referencia}`,
    `Fecha: ${fechaEmision}`,
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(cabecera[0], margenX, y);
  y += 8;
  doc.setFontSize(10);
  doc.text(cabecera[1], margenX, y);
  y += 10;
  doc.setFontSize(12);
  doc.text(cabecera[2], margenX, y);
  y += 6;
  doc.setFontSize(9);
  doc.text(cabecera[3], margenX, y);
  y += 8;

  const seccion = (titulo: string, lineas: string[]) => {
    if (y > 270) {
      doc.addPage();
      y = 16;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(titulo, margenX, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    for (const linea of lineas) {
      const partes = splitLines(doc, linea, maxWidth);
      doc.text(partes, margenX, y);
      y += partes.length * 4.5;
    }
    y += 4;
  };

  seccion('Identificación', [
    `Cliente: ${txt(clienteNombre)}`,
    `Equipo: ${txt(equipoNombre)}`,
    `Técnico: ${txt(tecnicoNombre)}`,
    `Prioridad: ${txt(parte?.prioridad || formulario?.prioridad)}`,
  ]);

  seccion('Descripción', [txt(parte?.descripcion_averia || formulario?.descripcion_problema, 'Sin descripción')]);
  seccion('Trabajos realizados', [txt(parte?.tareas_realizadas, 'Sin trabajos registrados')]);

  // La seccion de tiempos y geolocalizacion se oculta visualmente en el PDF.

  const materialesTexto = String(formulario?.materialesTexto || '').trim();
  seccion('Materiales', [materialesTexto || 'No se registraron materiales.']);

  if (valoracionEconomica) {
    seccion('Valoración económica', [
      `Materiales: ${eur(valoracionEconomica.costeMaterialesEditable)}`,
      `Mano de obra: ${eur(valoracionEconomica.costeManoObraTotal)}`,
      `Desplazamiento: ${eur(valoracionEconomica.costeDesplazamientoTotal)}`,
      `Total: ${eur(valoracionEconomica.costeTotal)}`,
    ]);
  }

  const firmaDataUrl = firmaUrl ? await urlToDataUrl(firmaUrl) : null;
  if (firmaDataUrl) {
    if (y > 210) {
      doc.addPage();
      y = 16;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Firma del cliente', margenX, y);
    y += 4;
    try {
      doc.addImage(firmaDataUrl, 'PNG', margenX, y, 70, 25);
      y += 30;
    } catch {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.text('Firma no disponible', margenX, y);
      y += 10;
    }
  }

  const fotos = Array.isArray(fotosIntervencionUrls) ? fotosIntervencionUrls.slice(0, 6) : [];
  if (fotos.length > 0) {
    doc.addPage();
    y = 16;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Evidencias fotográficas', margenX, y);
    y += 8;
    for (const fotoUrl of fotos) {
      const fotoDataUrl = await urlToDataUrl(fotoUrl);
      if (!fotoDataUrl) continue;
      try {
        doc.addImage(fotoDataUrl, 'JPEG', margenX, y, 80, 50);
        y += 54;
      } catch {
        continue;
      }
      if (y > 240) {
        doc.addPage();
        y = 16;
      }
    }
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text(`Documento generado automáticamente. Conformidad: ${txt(nombreFirmante, 'Sin nombre')}`, margenX, 285);

  return { pdfBlob: new Blob([doc.output('arraybuffer')], { type: 'application/pdf' }), nombreArchivo: `${referencia}.pdf` };
}

Deno.serve(async (req) => {
  const corsInfo = buildCorsHeaders(req);
  const cors = corsInfo.headers;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: cors });
  }

  if (!corsInfo.originAllowed) {
    return jsonResponse({ error: 'Origen no permitido' }, 403, {});
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Metodo no permitido' }, 405, cors);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse({ error: 'Faltan variables SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY' }, 500, cors);
  }

  const verificacion = await verificarSesionYRol(req, supabaseUrl, supabaseAnonKey, cors);
  if ('error' in verificacion) {
    return verificacion.error;
  }

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON invalido' }, 400, cors);
  }

  const ordenId = String(body.ordenId || body.parte?.id || body.formulario?.orden_id || '').trim();
  if (!ordenId || !UUID_RE.test(ordenId)) {
    return jsonResponse({ error: 'ordenId obligatorio' }, 400, cors);
  }

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
  const acceso = await verificarAccesoOrden(admin, verificacion.userId, verificacion.rol, ordenId);
  if (!acceso.ok) {
    return jsonResponse({ error: acceso.error || 'Acceso denegado' }, 403, cors);
  }

  const { pdfBlob, nombreArchivo } = await generarPdf(body);
  const orden = acceso.orden as { cliente_id: string; tecnico_id: string; id: string };
  const ruta = `${orden.cliente_id}/${orden.tecnico_id}/${orden.id}/${nombreArchivo}`;

  const { error: uploadError } = await admin.storage.from('informes-partes').upload(ruta, pdfBlob, {
    upsert: true,
    contentType: 'application/pdf',
    cacheControl: '0',
  });

  if (uploadError) {
    return jsonResponse({ error: `No se pudo subir el PDF a Storage: ${uploadError.message}` }, 500, cors);
  }

  return jsonResponse({ ok: true, pdfUrl: `sb://informes-partes/${ruta}`, nombreArchivo }, 200, cors);
});
