import { obtenerClienteSupabase } from './supabaseClient';
import { traducirErrorSupabase } from './erroresSupabase';

/**
 * Valida y sanitiza los datos del cliente, incluyendo los nuevos campos fiscales.
 * Garantiza compatibilidad retroactiva y formatos estrictos pero flexibles.
 */
export function validarYSanearPayloadCliente(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('El payload del cliente es inválido.');
  }

  const nombre = String(payload.nombre || '').trim();
  if (!nombre) {
    throw new Error('El nombre o razón comercial del cliente es obligatorio.');
  }

  const identificadorFiscalRaw = String(payload.identificador_fiscal || '').trim();
  let identificadorFiscal = null;

  if (identificadorFiscalRaw) {
    const idLimpio = identificadorFiscalRaw.toUpperCase().replace(/\s+/g, '');
    if (idLimpio.length < 4 || idLimpio.length > 30) {
      throw new Error('El identificador fiscal debe tener entre 4 y 30 caracteres.');
    }
    if (!/^[A-Z0-9\-\.]+$/i.test(idLimpio)) {
      throw new Error('El identificador fiscal solo puede contener caracteres alfanuméricos, guiones o puntos.');
    }
    identificadorFiscal = idLimpio;
  }

  const razonSocial = String(payload.razon_social || '').trim() || null;
  const direccionFiscal = String(payload.direccion_fiscal || '').trim() || null;
  const regimenTributario = String(payload.regimen_tributario || '').trim() || null;
  const situacionFiscal = String(payload.situacion_fiscal || '').trim() || null;

  const direccion = String(payload.direccion || '').trim() || null;
  const telefono = String(payload.telefono || '').trim() || null;
  const telefono2 = String(payload.telefono_2 || payload.telefono2 || '').trim() || null;
  const contacto = String(payload.contacto || '').trim() || null;
  const cargo = String(payload.cargo || '').trim() || null;

  // Los telefonos solo son validos si estan asociados a una persona de contacto y su cargo.
  if ((telefono || telefono2) && (!contacto || !cargo)) {
    throw new Error(
      'Para registrar un teléfono debes indicar primero la persona de contacto y su cargo/puesto.'
    );
  }

  const emailRaw = String(payload.email || '').trim();

  if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
    throw new Error('El formato del correo electrónico es inválido.');
  }
  const email = emailRaw || null;

  const latNum = payload.lat !== '' && payload.lat !== null && payload.lat !== undefined
    ? Number.parseFloat(String(payload.lat).replace(',', '.'))
    : null;
  const lngNum = payload.lng !== '' && payload.lng !== null && payload.lng !== undefined
    ? Number.parseFloat(String(payload.lng).replace(',', '.'))
    : null;

  return {
    nombre,
    direccion,
    telefono,
    telefono_2: telefono2,
    contacto,
    cargo,
    email,
    lat: Number.isFinite(latNum) ? latNum : null,
    lng: Number.isFinite(lngNum) ? lngNum : null,
    identificador_fiscal: identificadorFiscal,
    razon_social: razonSocial,
    direccion_fiscal: direccionFiscal,
    regimen_tributario: regimenTributario,
    situacion_fiscal: situacionFiscal,
  };
}

export async function verificarUnicidadIdentificadorFiscal(supabase, identificadorFiscal, idClienteExcluir = null) {
  if (!identificadorFiscal) return;

  let query = supabase
    .from('clientes')
    .select('id, nombre')
    .eq('identificador_fiscal', identificadorFiscal)
    .is('deleted_at', null);

  if (idClienteExcluir) {
    query = query.neq('id', idClienteExcluir);
  }

  const { data, error } = await query.maybeSingle();

  if (error && error.code !== 'PGRST116') {
    // Si hay un error distinto a no encontrado, permitimos continuar
    return;
  }

  if (data) {
    throw new Error(
      `Ya existe un cliente registrado (${data.nombre}) con el identificador fiscal "${identificadorFiscal}".`
    );
  }
}

export async function listarClientes() {
  const supabase = obtenerClienteSupabase();

  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre, direccion, telefono, telefono_2, contacto, cargo, email, lat, lng, identificador_fiscal, razon_social, direccion_fiscal, regimen_tributario, situacion_fiscal, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(traducirErrorSupabase(error, 'No se pudieron obtener los clientes'));
  }

  return data || [];
}

export async function crearCliente(payload) {
  const supabase = obtenerClienteSupabase();
  const datosSaneados = validarYSanearPayloadCliente(payload);

  if (datosSaneados.identificador_fiscal) {
    await verificarUnicidadIdentificadorFiscal(supabase, datosSaneados.identificador_fiscal);
  }

  const { data, error } = await supabase
    .from('clientes')
    .insert(datosSaneados)
    .select()
    .single();

  if (error) {
    if (error.code === '23505' || String(error.message || '').includes('unique')) {
      throw new Error(
        `Ya existe un cliente registrado con el identificador fiscal "${datosSaneados.identificador_fiscal}".`
      );
    }
    throw new Error(traducirErrorSupabase(error, 'No se pudo crear el cliente'));
  }

  return data;
}

export async function actualizarCliente(idCliente, payload) {
  const supabase = obtenerClienteSupabase();
  const datosSaneados = validarYSanearPayloadCliente(payload);

  if (datosSaneados.identificador_fiscal) {
    await verificarUnicidadIdentificadorFiscal(supabase, datosSaneados.identificador_fiscal, idCliente);
  }

  const { data, error } = await supabase
    .from('clientes')
    .update(datosSaneados)
    .eq('id', idCliente)
    .select()
    .single();

  if (error) {
    if (error.code === '23505' || String(error.message || '').includes('unique')) {
      throw new Error(
        `Ya existe un cliente registrado con el identificador fiscal "${datosSaneados.identificador_fiscal}".`
      );
    }
    throw new Error(traducirErrorSupabase(error, 'No se pudo actualizar el cliente'));
  }

  return data;
}

export async function eliminarCliente(idCliente) {
  const supabase = obtenerClienteSupabase();

  const { error } = await supabase.from('clientes').delete().eq('id', idCliente);

  if (error) {
    throw new Error(traducirErrorSupabase(error, 'No se pudo eliminar el cliente'));
  }
}
