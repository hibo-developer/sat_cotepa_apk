import { obtenerClienteSupabase, tieneConfiguracionSupabase } from './supabaseClient';

export async function obtenerSesionActual() {
  if (!tieneConfiguracionSupabase()) {
    return null;
  }

  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(`No se pudo recuperar la sesion actual: ${error.message}`);
  }

  return data.session;
}

export async function iniciarSesionConPassword({ email, password }) {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error(`No se pudo iniciar sesion: ${error.message}`);
  }

  return data.session;
}

export async function cerrarSesion() {
  const supabase = obtenerClienteSupabase();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(`No se pudo cerrar sesion: ${error.message}`);
  }
}

export async function actualizarPasswordUsuarioActual(nuevaPassword) {
  const supabase = obtenerClienteSupabase();
  const { error } = await supabase.auth.updateUser({ password: nuevaPassword });

  if (error) {
    throw new Error(`No se pudo actualizar la contrasena: ${error.message}`);
  }
}

export function escucharCambiosSesion(onCambio) {
  if (!tieneConfiguracionSupabase()) {
    return () => {};
  }

  const supabase = obtenerClienteSupabase();
  const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => {
    onCambio(sesion || null);
  });

  return () => {
    data.subscription.unsubscribe();
  };
}