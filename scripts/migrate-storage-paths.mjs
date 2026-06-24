import { createClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(rawUrl) {
  const text = String(rawUrl || '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    url.pathname = url.pathname.replace(/\/+$/, '');
    if (url.pathname.endsWith('/rest/v1')) {
      url.pathname = url.pathname.slice(0, -'/rest/v1'.length);
    }
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '';
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return text.replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '');
  }
}

function isServiceRoleLikeKey(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (text.startsWith('sb_publishable_')) return false;
  if (text.startsWith('sb_secret_')) return true;
  if (text.split('.').length === 3) return true;
  return false;
}

const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const targetOt = String(process.argv[2] || '').trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en variables de entorno.');
  process.exit(1);
}

if (!isServiceRoleLikeKey(serviceRoleKey)) {
  console.error('SUPABASE_SERVICE_ROLE_KEY no tiene formato de clave service role/secret. Usa la clave secreta del proyecto, no la publishable.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseSbRef(ref) {
  const text = String(ref || '').trim();
  if (!text.startsWith('sb://')) return null;
  const body = text.slice(5);
  const idx = body.indexOf('/');
  if (idx <= 0) return null;
  return { bucket: body.slice(0, idx), path: body.slice(idx + 1) };
}

function buildSbRef(bucket, path) {
  return `sb://${bucket}/${path}`;
}

function extensionFromPath(path, fallback = 'bin') {
  const name = String(path || '').split('/').pop() || '';
  const idx = name.lastIndexOf('.');
  return idx > -1 ? name.slice(idx + 1).toLowerCase() : fallback;
}

function baseName(path) {
  return String(path || '').split('/').pop() || '';
}

function extractReadableOt(value) {
  const text = String(value || '').trim();
  const match = /(?:^|\/)((?:SAT|PEM)-\d{6}-\d{2})(?:\.pdf)?$/i.exec(text);
  return match?.[1] || '';
}

function normalizeOtFolder(otNumero, fallbackRef = '') {
  const readable = extractReadableOt(otNumero) || extractReadableOt(fallbackRef);
  if (readable) return readable.toUpperCase();
  const text = String(otNumero || '').trim();
  if (!text) return 'SAT-SIN-OT';
  if (/^(SAT|PEM)-/i.test(text)) return text.toUpperCase();
  return `SAT-${text}`;
}

function dateParts(fechaIso) {
  const date = fechaIso ? new Date(fechaIso) : new Date();
  const safe = Number.isFinite(date.getTime()) ? date : new Date();
  return {
    yyyy: String(safe.getFullYear()),
    mm: String(safe.getMonth() + 1).padStart(2, '0'),
    timestamp: safe.getTime(),
  };
}

function sanitizeFilename(name, fallback) {
  const clean = String(name || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-');
  return clean || fallback;
}

function isLegacyPath(bucket, path) {
  const parts = String(path || '').split('/').filter(Boolean);
  if (bucket === 'firmas-clientes') {
    return parts.length === 3 && UUID_RE.test(parts[0]) && UUID_RE.test(parts[1]);
  }
  if (bucket === 'fotos-intervenciones' || bucket === 'informes-partes') {
    return parts.length === 4 && UUID_RE.test(parts[0]) && UUID_RE.test(parts[1]) && UUID_RE.test(parts[2]);
  }
  return false;
}

async function objectExists(bucket, path) {
  const partes = String(path || '').split('/').filter(Boolean);
  const fileName = partes.pop();
  const carpeta = partes.join('/');
  if (!fileName) return false;
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(carpeta, { limit: 100, search: fileName });
  if (error) return false;
  return Array.isArray(data) && data.some((item) => item.name === fileName);
}

async function findActualPathInStorage(bucket, oldPath, meta = {}) {
  const fileName = baseName(oldPath);
  if (!fileName) return '';

  const parteId = String(meta.parteId || '').trim();
  const otNumero = normalizeOtFolder(meta.otNumero, meta.fallbackRef || '');
  const patrones = [
    `%/${fileName}`,
    `%${fileName}%`,
    parteId ? `%parte-${parteId}/%` : '',
    otNumero ? `%/${otNumero}/%` : '',
  ].filter(Boolean);

  const candidatosMap = new Map();

  for (const patron of patrones) {
    const { data, error } = await supabase
      .schema('storage')
      .from('objects')
      .select('name, created_at, updated_at')
      .eq('bucket_id', bucket)
      .ilike('name', patron)
      .limit(50);

    if (error || !Array.isArray(data)) {
      continue;
    }

    for (const item of data) {
      const name = String(item?.name || '');
      if (!name) continue;
      candidatosMap.set(name, item);
    }
  }

  const data = [...candidatosMap.values()].filter((item) => {
    const name = String(item?.name || '');
    if (!name) return false;
    if (fileName && name.includes(fileName)) return true;
    if (parteId && name.includes(`parte-${parteId}`)) return true;
    if (otNumero && name.includes(`/${otNumero}/`)) return true;
    return false;
  });

  if (data.length === 0) {
    return '';
  }

  const candidatosOrdenados = [...data].sort((a, b) => {
    const aName = String(a.name || '');
    const bName = String(b.name || '');
    const aParte = parteId && aName.includes(`parte-${parteId}`) ? 1 : 0;
    const bParte = parteId && bName.includes(`parte-${parteId}`) ? 1 : 0;
    if (aParte !== bParte) return bParte - aParte;

    const aOt = otNumero && aName.includes(`/${otNumero}/`) ? 1 : 0;
    const bOt = otNumero && bName.includes(`/${otNumero}/`) ? 1 : 0;
    if (aOt !== bOt) return bOt - aOt;

    return String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''));
  });

  return String(candidatosOrdenados[0]?.name || '');
}

function buildReadablePath({ bucket, otNumero, parteId, fechaIso, index = 0, oldPath, fallbackRef }) {
  const { yyyy, mm, timestamp } = dateParts(fechaIso);
  const ext = extensionFromPath(oldPath, bucket === 'informes-partes' ? 'pdf' : 'png');
  const folderOt = normalizeOtFolder(otNumero, fallbackRef || oldPath);
  const folder = `${yyyy}/${mm}/${folderOt}/parte-${parteId}`;

  if (bucket === 'informes-partes') {
    const oldFileName = String(oldPath || '').split('/').pop() || `${otNumero}.pdf`;
    const fileName = sanitizeFilename(oldFileName, `${otNumero}.pdf`);
    return `${folder}/${fileName}`;
  }

  if (bucket === 'firmas-clientes') {
    return `${folder}/firma-cliente-${index}_${timestamp}.${ext}`;
  }

  return `${folder}/foto-evidencia-${index}_${timestamp}.${ext}`;
}

function extractFotos(tareas) {
  const text = String(tareas || '');
  const match = /Fotos intervención:\s*(.+)$/i.exec(text);
  if (!match?.[1]) return [];
  return match[1].split('|').map((item) => item.trim()).filter(Boolean);
}

function replaceFotos(tareas, fotos) {
  const parts = String(tareas || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^Fotos intervención:/i.test(item));

  if (fotos.length) {
    parts.push(`Fotos intervención: ${fotos.join(' | ')}`);
  }

  return parts.join(' | ');
}

async function moveIfNeeded(ref, meta) {
  const parsed = parseSbRef(ref);
  if (!parsed || !isLegacyPath(parsed.bucket, parsed.path)) {
    return ref;
  }

  let sourcePath = parsed.path;
  const existeOrigen = await objectExists(parsed.bucket, sourcePath);
  if (!existeOrigen) {
    const rutaReal = await findActualPathInStorage(parsed.bucket, sourcePath, meta);
    if (rutaReal) {
      sourcePath = rutaReal;
    }
  }

  const newPath = buildReadablePath({
    bucket: parsed.bucket,
    otNumero: meta.otNumero,
    parteId: meta.parteId,
    fechaIso: meta.fechaIso,
    index: meta.index,
    oldPath: sourcePath,
    fallbackRef: meta.fallbackRef,
  });

  if (newPath === sourcePath) {
    return buildSbRef(parsed.bucket, newPath);
  }

  const bucketApi = supabase.storage.from(parsed.bucket);
  const { error: moveError } = await bucketApi.move(sourcePath, newPath);
  if (moveError) {
    const msg = String(moveError.message || '');
    if (/already exists/i.test(msg)) {
      return buildSbRef(parsed.bucket, newPath);
    }
    if (/object not found/i.test(msg)) {
      const existeDestino = await objectExists(parsed.bucket, newPath);
      if (existeDestino) {
        return buildSbRef(parsed.bucket, newPath);
      }
    }
    throw new Error(`No se pudo mover ${parsed.bucket}/${sourcePath} -> ${newPath}: ${moveError.message}`);
  }

  await supabase
    .from('archivos_parte')
    .update({ path: newPath })
    .eq('parte_id', meta.parteId)
    .eq('path', parsed.path);

  return buildSbRef(parsed.bucket, newPath);
}

async function main() {
  let query = supabase
    .from('ordenes_trabajo')
    .select('id, numero_ticket, fecha_fin, fecha_inicio, tareas_realizadas, foto_url, firma_url, informe_pdf_url')
    .order('fecha_inicio', { ascending: false });

  if (targetOt) {
    const looksReadableOt = /^(SAT|PEM)-\d{6}-\d{2}$/i.test(targetOt);
    if (!looksReadableOt) {
      query = query.eq('numero_ticket', targetOt);
    }
  }

  const { data: orders, error } = await query;
  if (error) {
    throw new Error(`No se pudieron cargar las órdenes: ${error.message}`);
  }

  const ordersFiltradas = targetOt
    ? (orders || []).filter((order) => {
        const numeroTicket = String(order.numero_ticket || '').trim();
        const informe = String(order.informe_pdf_url || '');
        const firma = String(order.firma_url || '');
        const tareas = String(order.tareas_realizadas || '');
        return (
          numeroTicket === targetOt
          || informe.includes(targetOt)
          || firma.includes(targetOt)
          || tareas.includes(targetOt)
        );
      })
    : (orders || []);

  let updated = 0;

  for (const order of ordersFiltradas) {
    const otNumero = String(order.numero_ticket || '').trim();
    if (!otNumero) continue;

    const fechaIso = order.fecha_fin || order.fecha_inicio || new Date().toISOString();
    const fotosActuales = extractFotos(order.tareas_realizadas);

    const referenciaLegible = extractReadableOt(order.informe_pdf_url) || String(order.numero_ticket || '').trim();

    const informeRef = await moveIfNeeded(order.informe_pdf_url, {
      otNumero,
      parteId: order.id,
      fechaIso,
      index: 0,
      fallbackRef: referenciaLegible,
    });

    const firmaRef = await moveIfNeeded(order.firma_url, {
      otNumero,
      parteId: order.id,
      fechaIso,
      index: 0,
      fallbackRef: referenciaLegible,
    });

    const fotosMigradas = [];
    for (let i = 0; i < fotosActuales.length; i += 1) {
      fotosMigradas.push(await moveIfNeeded(fotosActuales[i], {
        otNumero,
        parteId: order.id,
        fechaIso,
        index: i,
        fallbackRef: referenciaLegible,
      }));
    }

    const nuevoTextoTareas = replaceFotos(order.tareas_realizadas, fotosMigradas);
    const nuevaFotoPrincipal = fotosMigradas[0] || order.foto_url || null;

    const changed =
      informeRef !== order.informe_pdf_url
      || firmaRef !== order.firma_url
      || nuevoTextoTareas !== order.tareas_realizadas
      || nuevaFotoPrincipal !== order.foto_url;

    if (!changed) continue;

    const { error: updateError } = await supabase.rpc('admin_actualizar_storage_refs_orden', {
      p_orden_id: order.id,
      p_informe_pdf_url: informeRef,
      p_firma_url: firmaRef,
      p_foto_url: nuevaFotoPrincipal,
      p_tareas_realizadas: nuevoTextoTareas,
    });

    if (updateError) {
      throw new Error(`No se pudo actualizar la orden ${otNumero}: ${updateError.message}`);
    }

    updated += 1;
    console.log(`Migrada OT ${otNumero}`);
  }

  console.log(`Proceso completado. Órdenes actualizadas: ${updated}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
