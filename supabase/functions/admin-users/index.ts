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

function normalizarTexto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function validarRol(valor: unknown): RolSat {
  const rol = normalizarTexto(valor).toLowerCase();

  if (rol !== 'admin' && rol !== 'oficina' && rol !== 'tecnico') {
    throw new Error('Rol invalido. Usa admin, oficina o tecnico.');
  }

  return rol;
}

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

  const userId = authData.user.id;

  const { data: perfil, error: perfilError } = await clienteAuth
    .from('usuarios_sat')
    .select('rol')
    .eq('user_id', userId)
    .maybeSingle();

  if (perfilError) {
    return { error: jsonResponse({ error: `No se pudo validar rol: ${perfilError.message}` }, 500, cors) };
  }

  if (perfil?.rol !== 'admin') {
    return { error: jsonResponse({ error: 'Solo un admin puede gestionar usuarios.' }, 403, cors) };
  }

  return {
    authHeader,
    userId,
  };
}

async function listarUsuarios(supabaseAdmin: ReturnType<typeof createClient>) {
  const [{ data: authUsers, error: authError }, { data: usuariosSat, error: satError }, { data: tecnicos, error: tecnicosError }] =
    await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      supabaseAdmin.from('usuarios_sat').select('user_id, rol, nombre_visible'),
      supabaseAdmin.from('tecnicos').select('id, nombre, especialidad, user_id, activo').order('nombre', { ascending: true }),
    ]);

  if (authError) {
    throw new Error(`No se pudo listar Auth Users: ${authError.message}`);
  }

  if (satError) {
    throw new Error(`No se pudo leer usuarios_sat: ${satError.message}`);
  }

  if (tecnicosError) {
    throw new Error(`No se pudo leer tecnicos: ${tecnicosError.message}`);
  }

  const satPorUserId = new Map((usuariosSat || []).map((fila) => [fila.user_id, fila]));
  const tecnicoPorUserId = new Map((tecnicos || []).filter((t) => t.user_id).map((t) => [t.user_id, t]));

  const users = (authUsers?.users || []).map((user) => {
    const sat = satPorUserId.get(user.id);
    const tecnico = tecnicoPorUserId.get(user.id);

    return {
      user_id: user.id,
      email: user.email || '',
      rol: sat?.rol || 'tecnico',
      nombre_visible: sat?.nombre_visible || '',
      tecnico_id: tecnico?.id || null,
      tecnico_nombre: tecnico?.nombre || null,
      tecnico_especialidad: tecnico?.especialidad || null,
      tecnico_activo: tecnico?.activo ?? null,
      last_sign_in_at: user.last_sign_in_at || null,
      creado_en: user.created_at || null,
    };
  });

  return { users };
}

async function crearUsuario(supabaseAdmin: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const email = normalizarTexto(payload.email).toLowerCase();
  const password = normalizarTexto(payload.password);
  const rol = validarRol(payload.rol);
  const nombreVisible = normalizarTexto(payload.nombre_visible) || null;
  const tecnicoNombre = rol === 'tecnico' ? normalizarTexto(payload.tecnico_nombre) || nombreVisible || email.split('@')[0] : null;
  const tecnicoEspecialidad = rol === 'tecnico' ? normalizarTexto(payload.tecnico_especialidad) || null : null;

  if (!email) {
    throw new Error('El email es obligatorio.');
  }

  if (!password || password.length < 6) {
    throw new Error('La contrasena debe tener al menos 6 caracteres.');
  }

  const { data: creado, error: crearError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (crearError || !creado.user) {
    throw new Error(`No se pudo crear el usuario en Auth: ${crearError?.message || 'sin detalle'}`);
  }

  const userId = creado.user.id;

  const { error: rolError } = await supabaseAdmin.from('usuarios_sat').upsert(
    {
      user_id: userId,
      rol,
      nombre_visible: nombreVisible || email.split('@')[0],
    },
    { onConflict: 'user_id' },
  );

  if (rolError) {
    throw new Error(`No se pudo asignar rol SAT: ${rolError.message}`);
  }

  if (rol === 'tecnico') {
    const { error: tecnicoError } = await supabaseAdmin.from('tecnicos').upsert(
      { nombre: tecnicoNombre, especialidad: tecnicoEspecialidad, activo: true, user_id: userId },
      { onConflict: 'user_id' },
    );

    if (tecnicoError) {
      throw new Error(`No se pudo crear el registro de tecnico: ${tecnicoError.message}`);
    }
  }

  return { user_id: userId, email, rol, nombre_visible: nombreVisible };
}

async function actualizarUsuario(supabaseAdmin: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const userId = normalizarTexto(payload.user_id);
  const email = normalizarTexto(payload.email).toLowerCase() || null;
  const password = normalizarTexto(payload.password) || null;
  const rol = validarRol(payload.rol);
  const nombreVisible = normalizarTexto(payload.nombre_visible) || null;
  const tecnicoNombre = rol === 'tecnico' ? normalizarTexto(payload.tecnico_nombre) || nombreVisible : null;
  const tecnicoEspecialidad = rol === 'tecnico' ? normalizarTexto(payload.tecnico_especialidad) || null : null;

  if (!userId) {
    throw new Error('El user_id es obligatorio.');
  }

  if (password && password.length < 6) {
    throw new Error('La nueva contrasena debe tener al menos 6 caracteres.');
  }

  if (email || password) {
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: email || undefined,
      password: password || undefined,
    });

    if (authUpdateError) {
      throw new Error(`No se pudo actualizar Auth User: ${authUpdateError.message}`);
    }
  }

  const { error: perfilError } = await supabaseAdmin.from('usuarios_sat').upsert(
    { user_id: userId, rol, nombre_visible: nombreVisible },
    { onConflict: 'user_id' },
  );

  if (perfilError) {
    throw new Error(`No se pudo actualizar rol SAT: ${perfilError.message}`);
  }

  if (rol === 'tecnico') {
    const { error: tecnicoError } = await supabaseAdmin.from('tecnicos').upsert(
      { nombre: tecnicoNombre, especialidad: tecnicoEspecialidad, activo: true, user_id: userId },
      { onConflict: 'user_id' },
    );

    if (tecnicoError) {
      throw new Error(`No se pudo actualizar el registro de tecnico: ${tecnicoError.message}`);
    }
  } else {
    // Si cambio de rol a no-tecnico, desactivar su registro de tecnico para que no aparezca en nuevas ordenes
    await supabaseAdmin
      .from('tecnicos')
      .update({ activo: false, user_id: null })
      .eq('user_id', userId);
  }

  return { user_id: userId, email, rol, nombre_visible: nombreVisible };
}

async function eliminarUsuario(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  requesterId: string,
) {
  if (!userId) {
    throw new Error('El user_id es obligatorio para eliminar.');
  }

  if (userId === requesterId) {
    throw new Error('No puedes eliminar tu propio usuario administrador.');
  }

  // Desactivar el tecnico y desvincularlo: no se borra para preservar historial de ordenes
  const { error: desvincularTecnicoError } = await supabaseAdmin
    .from('tecnicos')
    .update({ activo: false, user_id: null })
    .eq('user_id', userId);

  if (desvincularTecnicoError) {
    throw new Error(`No se pudo desactivar el tecnico vinculado: ${desvincularTecnicoError.message}`);
  }

  const { error: perfilError } = await supabaseAdmin.from('usuarios_sat').delete().eq('user_id', userId);

  if (perfilError) {
    throw new Error(`No se pudo eliminar perfil SAT: ${perfilError.message}`);
  }

  const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (authDeleteError) {
    throw new Error(`No se pudo eliminar Auth User: ${authDeleteError.message}`);
  }
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
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse({ error: 'Faltan variables SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY' }, 500, cors);
  }

  const verificacion = await verificarAdmin(req, supabaseUrl, supabaseAnonKey, cors);

  if (verificacion.error) {
    return verificacion.error;
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  let body: { action?: string; payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON invalido' }, 400, cors);
  }

  const action = normalizarTexto(body.action).toLowerCase();
  const payload = body.payload || {};

  try {
    if (action === 'list') {
      const data = await listarUsuarios(supabaseAdmin);
      return jsonResponse(data, 200, cors);
    }

    if (action === 'create') {
      const user = await crearUsuario(supabaseAdmin, payload);
      return jsonResponse({ ok: true, user }, 200, cors);
    }

    if (action === 'update') {
      const user = await actualizarUsuario(supabaseAdmin, payload);
      return jsonResponse({ ok: true, user }, 200, cors);
    }

    if (action === 'delete') {
      const userId = normalizarTexto(payload.user_id);
      await eliminarUsuario(supabaseAdmin, userId, verificacion.userId);
      return jsonResponse({ ok: true }, 200, cors);
    }

    return jsonResponse({ error: 'Accion no soportada. Usa list, create, update o delete.' }, 400, cors);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno inesperado';
    return jsonResponse({ error: message }, 400, cors);
  }
});
