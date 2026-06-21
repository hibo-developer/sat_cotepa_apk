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

function escapeHtml(valor: string) {
  return valor
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function validarUrlInformeSupabase(pdfUrl: string, supabaseUrl: string) {
  try {
    const pdf = new URL(pdfUrl);
    const proyecto = new URL(supabaseUrl);

    if (pdf.protocol !== 'https:') {
      return { ok: false, error: 'pdfUrl debe ser https' };
    }

    if (pdf.hostname !== proyecto.hostname) {
      return { ok: false, error: 'pdfUrl debe pertenecer al proyecto Supabase actual' };
    }

    const path = pdf.pathname || '';
    const esRutaStorageInforme =
      path.startsWith('/storage/v1/object/sign/informes-partes/')
      || path.startsWith('/storage/v1/object/public/informes-partes/')
      || path.startsWith('/storage/v1/object/informes-partes/');

    if (!esRutaStorageInforme) {
      return { ok: false, error: 'pdfUrl debe apuntar a informes-partes en Supabase Storage' };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: 'pdfUrl no valida' };
  }
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

  if (rol === 'tecnico') {
    return { error: jsonResponse({ error: 'Solo admin u oficina pueden enviar correos SAT.' }, 403, cors) };
  }

  return {
    userId: authData.user.id,
    rol,
  };
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

  const destinoBase = (Deno.env.get('SAT_TO_EMAIL') || 'sat@cotepa.com').trim();
  const destinoSolicitado = (body.to || '').trim();
  const allowedRecipients = (Deno.env.get('SAT_ALLOWED_EMAIL_RECIPIENTS') || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const destino = allowedRecipients.length > 0
    ? (allowedRecipients.includes(destinoSolicitado.toLowerCase())
      ? destinoSolicitado
      : (allowedRecipients.includes(destinoBase.toLowerCase()) ? destinoBase : allowedRecipients[0]))
    : destinoBase;
  const asunto = (body.subject || 'Informe SAT').trim();
  const texto = (body.text || '').trim();
  const pdfUrl = (body.pdfUrl || '').trim();

  if (!destino || !asunto || !texto || !pdfUrl) {
    return jsonResponse({ error: 'Campos requeridos faltantes' }, 400, cors);
  }

  if (asunto.length > 160) {
    return jsonResponse({ error: 'El asunto supera la longitud permitida' }, 400, cors);
  }

  if (texto.length > 5000) {
    return jsonResponse({ error: 'El cuerpo del correo supera la longitud permitida' }, 400, cors);
  }

  const validacionPdf = validarUrlInformeSupabase(pdfUrl, supabaseUrl);
  if (!validacionPdf.ok) {
    return jsonResponse({ error: validacionPdf.error || 'pdfUrl no valida' }, 400, cors);
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('SAT_FROM_EMAIL');

  if (!resendApiKey || !fromEmail) {
    return jsonResponse({ error: 'Faltan secrets RESEND_API_KEY o SAT_FROM_EMAIL' }, 500, cors);
  }

  const html = [
    '<p>Se genero un nuevo informe de parte de trabajo SAT.</p>',
    `<p><strong>Parte:</strong> ${escapeHtml((body.parteId || 'sin-id').trim())}</p>`,
    `<p><strong>PDF:</strong> <a href="${escapeHtml(pdfUrl)}">${escapeHtml(pdfUrl)}</a></p>`,
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
