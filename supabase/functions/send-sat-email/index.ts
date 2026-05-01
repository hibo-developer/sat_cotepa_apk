import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Whitelist de origenes. Configurable via env SAT_ALLOWED_ORIGINS
// (lista separada por comas). Si no se define, se usan los defaults
// para entornos locales/movil/desktop.
const DEFAULT_ALLOWED_ORIGINS = [
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
  'http://localhost:5173',
  'http://localhost:4173',
  'null', // Electron file:// puede enviar Origin: null
];

function getAllowedOrigins(): string[] {
  const env = (Deno.env.get('SAT_ALLOWED_ORIGINS') || '').trim();
  if (!env) return DEFAULT_ALLOWED_ORIGINS;
  return env
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  const allowed = getAllowedOrigins();
  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

type CorreoPayload = {
  to?: string;
  subject?: string;
  text?: string;
  pdfUrl?: string;
  parteId?: string;
};

type RolSat = 'admin' | 'oficina' | 'tecnico';

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

async function verificarSesionYRol(
  req: Request,
  supabaseUrl: string,
  supabaseAnonKey: string,
  cors: Record<string, string>,
) {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    return { error: jsonResponse({ error: 'Falta cabecera Authorization' }, 401, cors) };
  }

  const clienteAuth = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
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

  return {
    userId: authData.user.id,
    rol,
  };
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Metodo no permitido' }, 405, cors);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Faltan variables SUPABASE_URL / SUPABASE_ANON_KEY' }, 500, cors);
  }

  const verificacion = await verificarSesionYRol(req, supabaseUrl, supabaseAnonKey, cors);
  if (verificacion.error) {
    return verificacion.error;
  }

  let body: CorreoPayload;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON invalido' }, 400, cors);
  }

  const destino = (body.to || Deno.env.get('SAT_TO_EMAIL') || 'sat@cotepa.com').trim();
  const asunto = (body.subject || 'Informe SAT').trim();
  const texto = (body.text || '').trim();
  const pdfUrl = (body.pdfUrl || '').trim();

  if (!destino || !asunto || !texto || !pdfUrl) {
    return jsonResponse({ error: 'Campos requeridos faltantes' }, 400, cors);
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('SAT_FROM_EMAIL');

  if (!resendApiKey || !fromEmail) {
    return jsonResponse({ error: 'Faltan secrets RESEND_API_KEY o SAT_FROM_EMAIL' }, 500, cors);
  }

  const html = [
    '<p>Se genero un nuevo informe de parte de trabajo SAT.</p>',
    `<p><strong>Parte:</strong> ${body.parteId || 'sin-id'}</p>`,
    `<p><strong>PDF:</strong> <a href="${pdfUrl}">${pdfUrl}</a></p>`,
  ].join('');

  const respuestaResend = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [destino],
      subject: asunto,
      text: `${texto}\n\nPDF: ${pdfUrl}`,
      html,
    }),
  });

  const data = await respuestaResend.json().catch(() => ({}));

  if (!respuestaResend.ok) {
    return jsonResponse({ error: 'Fallo envio con proveedor', detalle: data }, 502, cors);
  }

  return jsonResponse({ ok: true, provider: 'resend', data, role: verificacion.rol }, 200, cors);
});
