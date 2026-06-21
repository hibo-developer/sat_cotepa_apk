import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  cors: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
    },
  });
}

type RolSat = 'admin' | 'oficina' | 'tecnico';

async function verificarSesionYRol(
  req: Request,
  supabaseUrl: string,
  supabaseAnonKey: string,
  cors: Record<string, string>,
): Promise<{ userId: string; rol: RolSat } | { error: Response }> {
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

function normalizarTexto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : '';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validarBucket(bucket: string) {
  return bucket === 'firmas-clientes' || bucket === 'fotos-intervenciones' || bucket === 'informes-partes';
}

function validarPath(path: string) {
  if (!path) return false;
  if (path.startsWith('/')) return false;
  if (path.includes('..')) return false;
  return true;
}

function trocearPath(path: string) {
  return path
    .split('/')
    .map((segmento) => segmento.trim())
    .filter(Boolean);
}

function esUuid(valor: string) {
  return UUID_RE.test(valor);
}

async function obtenerTecnicoActualId(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
) {
  const { data: tecnico, error } = await supabaseAdmin
    .from('tecnicos')
    .select('id')
    .eq('user_id', userId)
    .eq('activo', true)
    .maybeSingle();

  if (error || !tecnico?.id) {
    return null;
  }

  return tecnico.id as string;
}

async function validarRutaFirma(
  supabaseAdmin: ReturnType<typeof createClient>,
  path: string,
  verificacion: { userId: string; rol: RolSat },
) {
  const partes = trocearPath(path);
  if (partes.length !== 3) {
    return { ok: false, error: 'Ruta de firma no valida' };
  }

  const [clienteId, tecnicoId, nombreArchivo] = partes;
  if (!esUuid(clienteId) || !esUuid(tecnicoId) || !nombreArchivo) {
    return { ok: false, error: 'Ruta de firma no valida' };
  }

  const [{ data: cliente, error: clienteError }, { data: tecnico, error: tecnicoError }] = await Promise.all([
    supabaseAdmin.from('clientes').select('id').eq('id', clienteId).maybeSingle(),
    supabaseAdmin.from('tecnicos').select('id').eq('id', tecnicoId).maybeSingle(),
  ]);

  if (clienteError || tecnicoError || !cliente?.id || !tecnico?.id) {
    return { ok: false, error: 'La ruta de firma referencia entidades no validas' };
  }

  if (verificacion.rol !== 'tecnico') {
    return { ok: true };
  }

  const tecnicoActualId = await obtenerTecnicoActualId(supabaseAdmin, verificacion.userId);
  if (!tecnicoActualId || tecnicoActualId !== tecnicoId) {
    return { ok: false, error: 'Acceso denegado a la firma solicitada' };
  }

  return { ok: true };
}

async function validarRutaOrden(
  supabaseAdmin: ReturnType<typeof createClient>,
  path: string,
  verificacion: { userId: string; rol: RolSat },
) {
  const partes = trocearPath(path);
  if (partes.length !== 4) {
    return { ok: false, error: 'Ruta de archivo no valida' };
  }

  const [clienteId, tecnicoId, ordenId, nombreArchivo] = partes;
  if (!esUuid(clienteId) || !esUuid(tecnicoId) || !esUuid(ordenId) || !nombreArchivo) {
    return { ok: false, error: 'Ruta de archivo no valida' };
  }

  const { data: orden, error: ordenError } = await supabaseAdmin
    .from('ordenes_trabajo')
    .select('id, cliente_id, tecnico_id')
    .eq('id', ordenId)
    .maybeSingle();

  if (ordenError || !orden?.id) {
    return { ok: false, error: 'La ruta referencia una orden no valida' };
  }

  if (orden.cliente_id !== clienteId || orden.tecnico_id !== tecnicoId) {
    return { ok: false, error: 'La ruta no coincide con la orden asociada' };
  }

  if (verificacion.rol !== 'tecnico') {
    return { ok: true };
  }

  const tecnicoActualId = await obtenerTecnicoActualId(supabaseAdmin, verificacion.userId);
  if (!tecnicoActualId || tecnicoActualId !== tecnicoId) {
    return { ok: false, error: 'Acceso denegado al archivo solicitado' };
  }

  return { ok: true };
}

async function validarAccesoRutaStorage(
  supabaseAdmin: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  verificacion: { userId: string; rol: RolSat },
) {
  if (bucket === 'firmas-clientes') {
    return await validarRutaFirma(supabaseAdmin, path, verificacion);
  }

  if (bucket === 'fotos-intervenciones' || bucket === 'informes-partes') {
    return await validarRutaOrden(supabaseAdmin, path, verificacion);
  }

  return { ok: false, error: 'Bucket no permitido' };
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

  let body: { bucket?: unknown; path?: unknown; expiresIn?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON invalido' }, 400, cors);
  }

  const bucket = normalizarTexto(body.bucket);
  const path = normalizarTexto(body.path);
  const expiresIn = Math.max(60, Math.min(3600, Number(body.expiresIn) || 600));

  if (!validarBucket(bucket)) {
    return jsonResponse({ error: 'Bucket no permitido' }, 400, cors);
  }

  if (!validarPath(path)) {
    return jsonResponse({ error: 'Path no valido' }, 400, cors);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  const accesoRuta = await validarAccesoRutaStorage(supabaseAdmin, bucket, path, verificacion);
  if (!accesoRuta.ok) {
    return jsonResponse({ error: accesoRuta.error || 'Acceso denegado al archivo' }, 403, cors);
  }

  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    return jsonResponse({ error: 'No se pudo generar URL firmada' }, 404, cors);
  }

  return jsonResponse({ ok: true, url: data.signedUrl }, 200, cors);
});

