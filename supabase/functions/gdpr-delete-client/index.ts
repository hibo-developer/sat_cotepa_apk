// Edge Function: gdpr-delete-client
// Implementa el derecho al olvido (GDPR) para un cliente:
//   1. Borra objetos de Storage (fotos, audios, firmas, PDFs) asociados.
//   2. Borra registros de archivos_parte, materiales_orden, ordenes_trabajo.
//   3. Marca clientes.deleted_at = now() (soft delete por defecto) o borra
//      fisicamente si se solicita hard=true.
//
// Solo admin puede invocarla. Usa service_role para saltar RLS.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function buildCorsHeaders(req: Request): { headers: Record<string, string>; originAllowed: boolean } {
  const origin = req.headers.get('Origin');
  const ALLOWED_ORIGINS = new Set([
    'https://sat.cotepa.com',
    'https://sat-cotepa.netlify.app',
    'http://localhost:5173',
    'http://localhost:4173',
  ]);
  const originAllowed = !origin || ALLOWED_ORIGINS.has(origin);
  const allowOrigin = originAllowed ? (origin || '') : '';
  return {
    originAllowed,
    headers: {
      ...(allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin } : {}),
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
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function verificarAdmin(
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
    return { error: jsonResponse({ error: `No se pudo validar rol: ${perfilError.message}` }, 500, cors) };
  }
  if (perfil?.rol !== 'admin') {
    return { error: jsonResponse({ error: 'Solo un admin puede ejecutar el borrado GDPR.' }, 403, cors) };
  }
  return { userId: authData.user.id };
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
    return jsonResponse({ error: 'Faltan variables SUPABASE_URL / SUPABASE_ANON_KEY / SERVICE_ROLE_KEY' }, 500, cors);
  }

  const verificacion = await verificarAdmin(req, supabaseUrl, supabaseAnonKey, cors);
  if ('error' in verificacion) {
    return verificacion.error;
  }

  let body: { cliente_id?: unknown; hard?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON invalido' }, 400, cors);
  }

  const clienteId = String(body.cliente_id || '').trim();
  const hardDelete = Boolean(body.hard);

  if (!clienteId || !UUID_RE.test(clienteId)) {
    return jsonResponse({ error: 'cliente_id (UUID) obligatorio' }, 400, cors);
  }

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey);

  // 1. Verificar que el cliente existe
  const { data: cliente, error: clienteError } = await admin
    .from('clientes')
    .select('id, nombre')
    .eq('id', clienteId)
    .maybeSingle();

  if (clienteError || !cliente?.id) {
    return jsonResponse({ error: 'Cliente no encontrado' }, 404, cors);
  }

  const resumen: Record<string, unknown> = { cliente_id: clienteId, nombre: cliente.nombre, hard: hardDelete };

  // 2. Recopilar ordenes del cliente
  const { data: ordenes, error: ordenesError } = await admin
    .from('ordenes_trabajo')
    .select('id')
    .eq('cliente_id', clienteId);

  if (ordenesError) {
    return jsonResponse({ error: `No se pudo listar ordenes: ${ordenesError.message}` }, 500, cors);
  }

  const ordenIds = (ordenes || []).map((o) => o.id);
  resumen.ordenes = ordenIds.length;

  // 3. Recopilar archivos_parte de esas ordenes para borrar Storage
  let archivos: { path: string; bucket: string }[] = [];
  if (ordenIds.length > 0) {
    const { data: archs, error: archsError } = await admin
      .from('archivos_parte')
      .select('path, bucket')
      .in('ot_numero', ordenIds);
    if (archsError) {
      return jsonResponse({ error: `No se pudo listar archivos: ${archsError.message}` }, 500, cors);
    }
    archivos = archs || [];
  }
  resumen.archivos = archivos.length;

  // 4. Borrar objetos de Storage
  let storageBorrados = 0;
  let storageErrores = 0;
  for (const arch of archivos) {
    const { error: delErr } = await admin.storage.from(arch.bucket).remove([arch.path]);
    if (delErr) {
      storageErrores += 1;
    } else {
      storageBorrados += 1;
    }
  }
  resumen.storage_borrados = storageBorrados;
  resumen.storage_errores = storageErrores;

  // 5. Borrar registros en cascada (hard) o anonimizar (soft)
  if (hardDelete) {
    // Borrar archivos_parte
    if (ordenIds.length > 0) {
      await admin.from('archivos_parte').delete().in('ot_numero', ordenIds);
      // materiales_orden tiene on delete cascade en ordenes_trabajo
      // ordenes_trabajo: borrar
      await admin.from('ordenes_trabajo').delete().eq('cliente_id', clienteId);
    }
    // equipos tiene on delete cascade en clientes
    const { error: delClienteErr } = await admin.from('clientes').delete().eq('id', clienteId);
    if (delClienteErr) {
      return jsonResponse({ error: `No se pudo borrar el cliente: ${delClienteErr.message}` }, 500, cors);
    }
    resumen.accion = 'hard_delete';
  } else {
    // Soft delete: marcar deleted_at
    const { error: softErr } = await admin
      .from('clientes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', clienteId);
    if (softErr) {
      return jsonResponse({ error: `No se pudo marcar borrado logico: ${softErr.message}` }, 500, cors);
    }
    resumen.accion = 'soft_delete';
  }

  return jsonResponse({ ok: true, resumen }, 200, cors);
});
