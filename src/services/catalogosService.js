import { obtenerClienteSupabase } from './supabaseClient';

// ---------------------------------------------------------------------------
// Caché localStorage para catálogos de referencia (técnicos, clientes, equipos).
// Se usa como fallback cuando no hay conexión a Supabase.
// Se precalienta en background para disponer de la lista completa offline.
// ---------------------------------------------------------------------------
const CACHE_KEY_TECNICOS = 'sat_cache_tecnicos_v1';
const CACHE_KEY_CLIENTES = 'sat_cache_clientes_v1';
const CACHE_KEY_EQUIPOS = 'sat_cache_equipos_v1';
const TAMANO_LOTE_CACHE = 500;

let precargaClientesEnCurso = null;
let precargaTecnicosEnCurso = null;
let precargaEquiposEnCurso = null;

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

function crearErrorCatalogoSinCache(etiqueta, errorOriginal) {
  const detalle = errorOriginal?.message ? ` ${errorOriginal.message}` : '';
  return new Error(
    `No se pudieron obtener los ${etiqueta} y no hay caché offline disponible.${detalle}`,
  );
}

async function cargarCatalogoCompleto({
  supabase,
  tabla,
  columnas,
  cacheKey,
  orderBy,
  filtros,
}) {
  const acumulado = [];
  let desde = 0;

  while (true) {
    let consulta = supabase
      .from(tabla)
      .select(columnas)
      .order(orderBy, { ascending: true })
      .range(desde, desde + TAMANO_LOTE_CACHE - 1);

    if (typeof filtros === 'function') {
      consulta = filtros(consulta);
    }

    const { data, error } = await consulta;

    if (error) {
      throw error;
    }

    const items = data || [];
    acumulado.push(...items);

    if (items.length < TAMANO_LOTE_CACHE) {
      break;
    }

    desde += TAMANO_LOTE_CACHE;
  }

  if (acumulado.length > 0) {
    guardarEnCache(cacheKey, acumulado);
  }

  return acumulado;
}

async function precargarClientesEnBackground(supabase) {
  if (!precargaClientesEnCurso) {
    precargaClientesEnCurso = cargarCatalogoCompleto({
      supabase,
      tabla: 'clientes',
      columnas: 'id, nombre',
      cacheKey: CACHE_KEY_CLIENTES,
      orderBy: 'nombre',
    }).finally(() => {
      precargaClientesEnCurso = null;
    });
  }

  return precargaClientesEnCurso;
}

async function precargarTecnicosEnBackground(supabase) {
  if (!precargaTecnicosEnCurso) {
    precargaTecnicosEnCurso = cargarCatalogoCompleto({
      supabase,
      tabla: 'tecnicos',
      columnas: 'id, nombre, especialidad',
      cacheKey: CACHE_KEY_TECNICOS,
      orderBy: 'nombre',
      filtros: (consulta) => consulta.eq('activo', true),
    }).finally(() => {
      precargaTecnicosEnCurso = null;
    });
  }

  return precargaTecnicosEnCurso;
}

async function precargarEquiposEnBackground(supabase) {
  if (!precargaEquiposEnCurso) {
    precargaEquiposEnCurso = cargarCatalogoCompleto({
      supabase,
      tabla: 'equipos',
      columnas: 'id, cliente_id, nombre, marca, modelo',
      cacheKey: CACHE_KEY_EQUIPOS,
      orderBy: 'nombre',
    }).finally(() => {
      precargaEquiposEnCurso = null;
    });
  }

  return precargaEquiposEnCurso;
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
    throw crearErrorCatalogoSinCache('clientes', error);
  }

  const resultado = {
    items: data || [],
    total: count || 0,
    hayMas: Boolean(count && hasta + 1 < count),
  };

  // Mantiene una versión completa del catálogo para uso offline.
  if (!busqueda.trim() && pagina === 1 && resultado.items.length > 0) {
    if (resultado.total > resultado.items.length) {
      precargarClientesEnBackground(supabase).catch(() => {
        guardarEnCache(CACHE_KEY_CLIENTES, resultado.items);
      });
    } else {
      guardarEnCache(CACHE_KEY_CLIENTES, resultado.items);
    }
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
    throw crearErrorCatalogoSinCache('técnicos', error);
  }

  const resultado = {
    items: data || [],
    total: count || 0,
    hayMas: Boolean(count && hasta + 1 < count),
  };

  // Mantiene una versión completa del catálogo para uso offline.
  if (!busqueda.trim() && pagina === 1 && resultado.items.length > 0) {
    if (resultado.total > resultado.items.length) {
      precargarTecnicosEnBackground(supabase).catch(() => {
        guardarEnCache(CACHE_KEY_TECNICOS, resultado.items);
      });
    } else {
      guardarEnCache(CACHE_KEY_TECNICOS, resultado.items);
    }
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
    .select('id, cliente_id, nombre, marca, modelo', { count: 'exact' })
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
    const cacheados = leerDeCache(CACHE_KEY_EQUIPOS);
    const equiposCliente = cacheados.filter((equipo) => equipo.cliente_id === clienteId);
    if (equiposCliente.length > 0) {
      return aplicarFiltroYPaginacion(equiposCliente, busqueda, limite, pagina);
    }
    throw crearErrorCatalogoSinCache('equipos', error);
  }

  const resultado = {
    items: data || [],
    total: count || 0,
    hayMas: Boolean(count && hasta + 1 < count),
  };

  if (pagina === 1 && resultado.items.length > 0) {
    if (resultado.total > resultado.items.length) {
      precargarEquiposEnBackground(supabase).catch(() => {
        guardarEnCache(CACHE_KEY_EQUIPOS, resultado.items);
      });
    } else {
      guardarEnCache(CACHE_KEY_EQUIPOS, resultado.items);
    }
  }

  return resultado;
}

export async function precargarCatalogosOffline() {
  const supabase = obtenerClienteSupabase();

  await Promise.allSettled([
    precargarClientesEnBackground(supabase),
    precargarTecnicosEnBackground(supabase),
    precargarEquiposEnBackground(supabase),
  ]);
}
