import { obtenerClienteSupabase } from './supabaseClient';
import { traducirErrorSupabase } from './erroresSupabase';

/**
 * Servicio de comerciales, calcado de tecnicosService.js.
 * Ademas gestiona la tabla puente clientes_comerciales, que permite
 * asignar varios comerciales de referencia a un mismo cliente.
 */

export async function listarComerciales() {
  const supabase = obtenerClienteSupabase();

  const { data, error } = await supabase
    .from('comerciales')
    .select('id, nombre, activo, es_predeterminado')
    .order('nombre', { ascending: true });

  if (error) {
    throw new Error(traducirErrorSupabase(error, 'No se pudieron obtener los comerciales'));
  }

  return data || [];
}

export async function crearComercial(payload) {
  const supabase = obtenerClienteSupabase();

  const { data, error } = await supabase.from('comerciales').insert(payload).select().single();

  if (error) {
    throw new Error(traducirErrorSupabase(error, 'No se pudo crear el comercial'));
  }

  return data;
}

export async function actualizarComercial(idComercial, payload) {
  const supabase = obtenerClienteSupabase();

  const { data, error } = await supabase
    .from('comerciales')
    .update(payload)
    .eq('id', idComercial)
    .select()
    .single();

  if (error) {
    throw new Error(traducirErrorSupabase(error, 'No se pudo actualizar el comercial'));
  }

  return data;
}

export async function eliminarComercial(idComercial) {
  const supabase = obtenerClienteSupabase();

  const { error } = await supabase.from('comerciales').delete().eq('id', idComercial);

  if (error) {
    throw new Error(traducirErrorSupabase(error, 'No se pudo eliminar el comercial'));
  }
}

/**
 * Devuelve el comercial marcado como predeterminado (asignado automaticamente
 * a los clientes que no tengan ningun comercial de referencia explicito).
 */
export async function obtenerComercialPredeterminado() {
  const supabase = obtenerClienteSupabase();

  const { data, error } = await supabase
    .from('comerciales')
    .select('id, nombre')
    .eq('es_predeterminado', true)
    .maybeSingle();

  if (error) {
    throw new Error(traducirErrorSupabase(error, 'No se pudo obtener el comercial predeterminado'));
  }

  return data || null;
}

/**
 * Reemplaza las asignaciones de comerciales de un cliente por la lista de
 * ids indicada. Si la lista queda vacia, asigna automaticamente el
 * comercial predeterminado (regla de negocio: todo cliente debe tener al
 * menos un comercial de referencia).
 */
export async function sincronizarComercialesDeCliente(idCliente, comercialesIds) {
  const supabase = obtenerClienteSupabase();

  let idsFinal = Array.from(new Set((comercialesIds || []).filter(Boolean)));

  if (idsFinal.length === 0) {
    const predeterminado = await obtenerComercialPredeterminado();
    if (predeterminado?.id) {
      idsFinal = [predeterminado.id];
    }
  }

  const { error: deleteError } = await supabase
    .from('clientes_comerciales')
    .delete()
    .eq('cliente_id', idCliente);

  if (deleteError) {
    throw new Error(
      traducirErrorSupabase(deleteError, 'No se pudieron actualizar los comerciales asignados al cliente')
    );
  }

  if (idsFinal.length === 0) {
    return;
  }

  const filas = idsFinal.map((comercialId) => ({ cliente_id: idCliente, comercial_id: comercialId }));

  const { error: insertError } = await supabase.from('clientes_comerciales').insert(filas);

  if (insertError) {
    throw new Error(traducirErrorSupabase(insertError, 'No se pudo asignar el comercial al cliente'));
  }
}
