import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEFAULT_ALLOWED_ORIGINS = [
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
  'http://localhost:5173',
  'http://localhost:4173',
  'null',
];

function getAllowedOrigins(): string[] {
  const env = (Deno.env.get('SAT_ALLOWED_ORIGINS') || '').trim();
  if (!env) return DEFAULT_ALLOWED_ORIGINS;
  return env
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildCorsHeaders(req: Request): { headers: Record<string, string>; originAllowed: boolean } {
  const origin = req.headers.get('Origin');
  const allowed = getAllowedOrigins();
  const originAllowed = !origin || allowed.includes(origin);
  const allowOrigin = origin || allowed[0];
  return {
    originAllowed,
    headers: originAllowed ? {
      'Access-Control-Allow-Origin': allowOrigin,
      'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
    } : {},
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

function validarBucket(bucket: string) {
  return bucket === 'firmas-clientes' || bucket === 'fotos-intervenciones' || bucket === 'informes-partes';
}

function validarPath(path: string) {
  if (!path) return false;
  if (path.startsWith('/')) return false;
  if (path.includes('..')) return false;
  return true;
}

Deno.serve(async (req) => {
  const corsInfo = buildCorsHeaders(req);
  const cors = corsInfo.headers;

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
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

  if (verificacion.rol === 'tecnico') {
    const { data: tecnico, error: tecnicoError } = await supabaseAdmin
      .from('tecnicos')
      .select('id')
      .eq('user_id', verificacion.userId)
      .maybeSingle();

    if (tecnicoError || !tecnico?.id) {
      return jsonResponse({ error: 'No se pudo validar tecnico asociado' }, 403, cors);
    }

    const partes = path.split('/').filter(Boolean);
    const tecnicoIdEnRuta = partes[1] || '';
    if (tecnicoIdEnRuta !== tecnico.id) {
      return jsonResponse({ error: 'Acceso denegado al archivo' }, 403, cors);
    }
  }

  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    return jsonResponse({ error: 'No se pudo generar URL firmada' }, 404, cors);
  }

  return jsonResponse({ ok: true, url: data.signedUrl }, 200, cors);
});

