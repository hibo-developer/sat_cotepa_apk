import { obtenerClienteSupabase } from './supabaseClient';

// ---------------------------------------------------------------------------
// Caché localStorage para catálogos de referencia (técnicos, clientes).
// Se usa como fallback cuando no hay conexión a Supabase.
// Solo se cachea la primera página sin filtro (lista completa inicial).
// ---------------------------------------------------------------------------
const CACHE_KEY_TECNICOS = 'sat_cache_tecnicos_v1';
const CACHE_KEY_CLIENTES = 'sat_cache_clientes_v1';

function guardarEnCache(clave, items) {
  try {
    localStorage.setItem(clave, JSON.stringify(items));
  } catch { /* noop — storage lleno o no disponible */ }
}

function leerDeCache(clave) {
  try {
    const raw = localStorage.getItem(clave);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function aplicarFiltroYPaginacion(items, busqueda, limite, pagina) {
  const filtro = (busqueda || '').trim().toLowerCase();
  const filtrados = filtro
    ? items.filter((i) =>
        Object.values(i).some((v) => String(v ?? '').toLowerCase().includes(filtro))
      )
    : items;
  const desde = (pagina - 1) * limite;
  const slice = filtrados.slice(desde, desde + limite);
  return {
    items: slice,
    total: filtrados.length,
    hayMas: desde + limite < filtrados.length,
  };
}

function normalizarBusquedaParaOr(valor) {
  return (valor || '')
    .trim()
    // Evita que caracteres reservados rompan la expresion or(...) de PostgREST
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ');
}

async function asegurarRegistroTecnicoParaAdminActual(supabase) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) {
    return;
  }

  const userId = authData?.user?.id;
  if (!userId) {
    return;
  }

  const { data: usuarioSat, error: usuarioSatError } = await supabase
    .from('usuarios_sat')
    .select('rol, nombre_visible')
    .eq('user_id', userId)
    .maybeSingle();

  if (usuarioSatError || usuarioSat?.rol !== 'admin') {
    return;
  }

  const { data: tecnicoActual, error: tecnicoError } = await supabase
    .from('tecnicos')
    .select('id, activo')
    .eq('user_id', userId)
    .maybeSingle();

  if (tecnicoError) {
    return;
  }

  if (!tecnicoActual) {
    const nombreAdmin = (usuarioSat.nombre_visible || authData.user.email || 'Administrador SAT').trim();
    await supabase.from('tecnicos').insert({
      nombre: nombreAdmin,
      especialidad: 'Administración SAT',
      activo: true,
      user_id: userId,
    });
    return;
  }

  if (!tecnicoActual.activo) {
    await supabase.from('tecnicos').update({ activo: true }).eq('id', tecnicoActual.id);
  }
}

export async function obtenerClientes(opciones = {}) {
  const { busqueda = '', limite = 20, pagina = 1 } = opciones;
  const supabase = obtenerClienteSupabase();
  const desde = (pagina - 1) * limite;
  const hasta = desde + limite - 1;

  let consulta = supabase
    .from('clientes')
    .select('id, nombre', { count: 'exact' })
    .order('nombre', { ascending: true })
    .range(desde, hasta);

  if (busqueda.trim()) {
    consulta = consulta.ilike('nombre', `%${busqueda.trim()}%`);
  }

  const { data, error, count } = await consulta;

  if (error) {
    // Fallback offline: devolver datos cacheados filtrados
    const cacheados = leerDeCache(CACHE_KEY_CLIENTES);
    if (cacheados.length > 0) {
      return aplicarFiltroYPaginacion(cacheados, busqueda, limite, pagina);
    }
    throw new Error(`No se pudieron obtener los clientes: ${error.message}`);
  }

  const resultado = {
    items: data || [],
    total: count || 0,
    hayMas: Boolean(count && hasta + 1 < count),
  };

  // Actualizar caché con la lista completa cuando no hay filtro activo
  if (!busqueda.trim() && pagina === 1 && resultado.items.length > 0) {
    guardarEnCache(CACHE_KEY_CLIENTES, resultado.items);
  }

  return resultado;
}

export async function obtenerTecnicosActivos(opciones = {}) {
  const { busqueda = '', limite = 20, pagina = 1 } = opciones;
  const supabase = obtenerClienteSupabase();
  await asegurarRegistroTecnicoParaAdminActual(supabase);
  const desde = (pagina - 1) * limite;
  const hasta = desde + limite - 1;

  let consulta = supabase
    .from('tecnicos')
    .select('id, nombre, especialidad', { count: 'exact' })
    .eq('activo', true)
    .order('nombre', { ascending: true })
    .range(desde, hasta);

  const busquedaNormalizada = normalizarBusquedaParaOr(busqueda);
  if (busquedaNormalizada) {
    consulta = consulta.or(
      `nombre.ilike.%${busquedaNormalizada}%,especialidad.ilike.%${busquedaNormalizada}%`
    );
  }

  const { data, error, count } = await consulta;

  if (error) {
    // Fallback offline: devolver datos cacheados filtrados
    const cacheados = leerDeCache(CACHE_KEY_TECNICOS);
    if (cacheados.length > 0) {
      return aplicarFiltroYPaginacion(cacheados, busqueda, limite, pagina);
    }
    throw new Error(`No se pudieron obtener los técnicos: ${error.message}`);
  }

  const resultado = {
    items: data || [],
    total: count || 0,
    hayMas: Boolean(count && hasta + 1 < count),
  };

  // Actualizar caché con la lista completa cuando no hay filtro activo
  if (!busqueda.trim() && pagina === 1 && resultado.items.length > 0) {
    guardarEnCache(CACHE_KEY_TECNICOS, resultado.items);
  }

  return resultado;
}

export async function obtenerEquiposPorCliente(clienteId, opciones = {}) {
  const { busqueda = '', limite = 20, pagina = 1 } = opciones;
  if (!clienteId) {
    return { items: [], total: 0, hayMas: false };
  }

  const supabase = obtenerClienteSupabase();
  const desde = (pagina - 1) * limite;
  const hasta = desde + limite - 1;

  let consulta = supabase
    .from('equipos')
    .select('id, nombre, marca, modelo', { count: 'exact' })
    .eq('cliente_id', clienteId)
    .order('nombre', { ascending: true })
    .range(desde, hasta);

  const busquedaNormalizada = normalizarBusquedaParaOr(busqueda);
  if (busquedaNormalizada) {
    consulta = consulta.or(
      `nombre.ilike.%${busquedaNormalizada}%,marca.ilike.%${busquedaNormalizada}%,modelo.ilike.%${busquedaNormalizada}%`
    );
  }

  const { data, error, count } = await consulta;

  if (error) {
    throw new Error(`No se pudieron obtener los equipos: ${error.message}`);
  }

  return {
    items: data || [],
    total: count || 0,
    hayMas: Boolean(count && hasta + 1 < count),
  };
}
