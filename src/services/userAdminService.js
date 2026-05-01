import { obtenerClienteSupabase } from './supabaseClient';
import { asegurarPasswordSegura } from './passwordSecurity';

const ROLES_PERMITIDOS = new Set(['admin', 'oficina', 'tecnico']);

function limpiarTexto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function validarRol(rol) {
  const rolLimpio = limpiarTexto(rol).toLowerCase();

  if (!ROLES_PERMITIDOS.has(rolLimpio)) {
    throw new Error('El rol seleccionado no es valido.');
  }

  return rolLimpio;
}

async function construirMensajeErrorFuncion(error) {
  const estado = error?.context?.status;
  let detalle = error?.message || '';

  // Supabase puede adjuntar la respuesta HTTP en error.context
  const respuesta = error?.context;
  if (respuesta && typeof respuesta.json === 'function') {
    try {
      const cuerpo = await respuesta.json();
      if (cuerpo?.error && typeof cuerpo.error === 'string') {
        detalle = cuerpo.error;
      }
    } catch {
      // Ignorar errores de parseo y usar el mensaje base
    }
  }

  if (estado === 401) {
    return `Sesion no valida o expirada. ${detalle}`.trim();
  }

  if (estado === 403) {
    return `Acceso denegado. Debes iniciar sesion con un usuario admin. ${detalle}`.trim();
  }

  if (detalle && detalle !== 'Edge Function returned a non-2xx status code') {
    return detalle;
  }

  return 'No se pudo completar la operacion de usuarios.';
}

async function invocarAdminUsers(action, payload = {}) {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: {
      action,
      payload,
    },
  });

  if (error) {
    const mensaje = await construirMensajeErrorFuncion(error);
    throw new Error(mensaje);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

export async function listarUsuariosSat() {
  const respuesta = await invocarAdminUsers('list');
  return Array.isArray(respuesta?.users) ? respuesta.users : [];
}

export async function crearUsuarioSat(payload) {
  const email = limpiarTexto(payload.email).toLowerCase();
  const password = limpiarTexto(payload.password);
  const rol = validarRol(payload.rol);
  const nombreVisible = limpiarTexto(payload.nombre_visible) || null;
  const tecnicoNombre = rol === 'tecnico' ? limpiarTexto(payload.tecnico_nombre) || null : null;
  const tecnicoEspecialidad = rol === 'tecnico' ? limpiarTexto(payload.tecnico_especialidad) || null : null;

  if (!email) {
    throw new Error('El email del usuario es obligatorio.');
  }

  if (!password) {
    throw new Error('La contrasena inicial es obligatoria.');
  }

  await asegurarPasswordSegura(password);

  const respuesta = await invocarAdminUsers('create', {
    email,
    password,
    rol,
    nombre_visible: nombreVisible,
    tecnico_nombre: tecnicoNombre,
    tecnico_especialidad: tecnicoEspecialidad,
  });

  return respuesta?.user || null;
}

export async function actualizarUsuarioSat(userId, payload) {
  const id = limpiarTexto(userId);
  const rol = validarRol(payload.rol);
  const email = limpiarTexto(payload.email).toLowerCase() || null;
  const password = limpiarTexto(payload.password) || null;
  const nombreVisible = limpiarTexto(payload.nombre_visible) || null;
  const tecnicoNombre = rol === 'tecnico' ? limpiarTexto(payload.tecnico_nombre) || null : null;
  const tecnicoEspecialidad = rol === 'tecnico' ? limpiarTexto(payload.tecnico_especialidad) || null : null;

  if (!id) {
    throw new Error('El usuario que intentas actualizar no es valido.');
  }

  if (password) {
    await asegurarPasswordSegura(password);
  }

  const respuesta = await invocarAdminUsers('update', {
    user_id: id,
    email,
    password,
    rol,
    nombre_visible: nombreVisible,
    tecnico_nombre: tecnicoNombre,
    tecnico_especialidad: tecnicoEspecialidad,
  });

  return respuesta?.user || null;
}

export async function eliminarUsuarioSat(userId) {
  const id = limpiarTexto(userId);

  if (!id) {
    throw new Error('El usuario que intentas eliminar no es valido.');
  }

  await invocarAdminUsers('delete', {
    user_id: id,
  });
}
