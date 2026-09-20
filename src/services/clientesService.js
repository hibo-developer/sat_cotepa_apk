import { obtenerClienteSupabase } from './supabaseClient';
import { traducirErrorSupabase } from './erroresSupabase';
import { sincronizarComercialesDeCliente } from './comercialesService';

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
  const telefonoFiscal = String(payload.telefono_fiscal || '').trim() || null;

  const direccion = String(payload.direccion || '').trim() || null;
  const telefono = String(payload.telefono || '').trim() || null;
  const telefono2 = String(payload.telefono_2 || payload.telefono2 || '').trim() || null;
  const contacto = String(payload.contacto || '').trim() || null;
  const cargo = String(payload.cargo || '').trim() || null;
  const contacto2 = String(payload.contacto_2 || '').trim() || null;
  const cargo2 = String(payload.cargo_2 || '').trim() || null;

  // Cada telefono solo es valido si esta asociado a su propia persona de contacto y cargo.
  if (telefono && (!contacto || !cargo)) {
    throw new Error(
      'Para registrar el teléfono del contacto 1 debes indicar primero su nombre y cargo/puesto.'
    );
  }
  if (telefono2 && (!contacto2 || !cargo2)) {
    throw new Error(
      'Para registrar el teléfono del contacto 2 debes indicar primero su nombre y cargo/puesto.'
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
    contacto_2: contacto2,
    cargo_2: cargo2,
    email,
    lat: Number.isFinite(latNum) ? latNum : null,
    lng: Number.isFinite(lngNum) ? lngNum : null,
    identificador_fiscal: identificadorFiscal,
    razon_social: razonSocial,
    direccion_fiscal: direccionFiscal,
    regimen_tributario: regimenTributario,
    situacion_fiscal: situacionFiscal,
    telefono_fiscal: telefonoFiscal,
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
    .select('id, nombre, direccion, telefono, telefono_2, contacto, cargo, contacto_2, cargo_2, email, lat, lng, identificador_fiscal, razon_social, direccion_fiscal, regimen_tributario, situacion_fiscal, telefono_fiscal, created_at, clientes_comerciales(comercial_id, comerciales(id, nombre))')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(traducirErrorSupabase(error, 'No se pudieron obtener los clientes'));
  }

  return (data || []).map((cliente) => {
    const { clientes_comerciales: asignaciones, ...resto } = cliente;
    return {
      ...resto,
      comerciales: (asignaciones || []).map((fila) => fila.comerciales).filter(Boolean),
    };
  });
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

  if (Array.isArray(payload.comerciales_ids)) {
    await sincronizarComercialesDeCliente(data.id, payload.comerciales_ids);
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

  if (Array.isArray(payload.comerciales_ids)) {
    await sincronizarComercialesDeCliente(idCliente, payload.comerciales_ids);
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

export async function obtenerClienteCompleto(idCliente) {
  if (!idCliente) {
    throw new Error('Se requiere el identificador del cliente para obtener su historial.');
  }

  const supabase = obtenerClienteSupabase();

  const clientePromise = supabase
    .from('clientes')
    .select('id, nombre, direccion, telefono, telefono_2, contacto, cargo, contacto_2, cargo_2, email, lat, lng, identificador_fiscal, razon_social, direccion_fiscal, regimen_tributario, situacion_fiscal, telefono_fiscal, created_at, clientes_comerciales(comercial_id, comerciales(id, nombre, es_predeterminado, activo))')
    .eq('id', idCliente)
    .maybeSingle();

  const equiposPromise = supabase
    .from('equipos')
    .select('id, cliente_id, nombre, marca, modelo, numero_serie, ultima_revision')
    .eq('cliente_id', idCliente)
    .order('nombre', { ascending: true });

  const ordenesPromise = supabase
    .from('ordenes_trabajo')
    .select('id, numero_ticket, tipo_orden, estado, prioridad, descripcion_averia, tiempo_empleado_minutos, coste_total, fecha_inicio, fecha_fin, cliente_id, equipo_id, tecnico_id')
    .eq('cliente_id', idCliente)
    .order('fecha_inicio', { ascending: false })
    .limit(200);

  const [clienteRsp, equiposRsp, ordenesRsp] = await Promise.all([
    clientePromise,
    equiposPromise,
    ordenesPromise,
  ]);

  if (clienteRsp.error) {
    throw new Error(traducirErrorSupabase(clienteRsp.error, 'No se pudieron obtener los datos del cliente'));
  }
  if (!clienteRsp.data) {
    throw new Error('El cliente indicado no existe o no tienes permiso para acceder a él.');
  }
  if (equiposRsp.error) {
    throw new Error(traducirErrorSupabase(equiposRsp.error, 'No se pudieron cargar los equipos del cliente'));
  }
  if (ordenesRsp.error) {
    throw new Error(traducirErrorSupabase(ordenesRsp.error, 'No se pudieron cargar las órdenes del cliente'));
  }

  const asignaciones = clienteRsp.data.clientes_comerciales || [];
  const { clientes_comerciales: _omitido, ...restoCliente } = clienteRsp.data;

  const ordenes = (ordenesRsp.data || []).map((o) => {
    const materiales = Array.isArray(o.materiales_orden) ? o.materiales_orden : [];
    const costeMateriales = materiales.reduce(
      (acc, m) => acc + (Number(m?.cantidad || 0) * Number(m?.precio_unitario || 0)),
      0,
    );
    return {
      ...o,
      materiales_orden: materiales,
      coste_materiales_calculado: Number(costeMateriales.toFixed(2)),
    };
  });

  const totalOrdenes = ordenes.length;
  const ordenesFinalizadas = ordenes.filter((o) => o.estado === 'finalizado').length;
  const ordenesAbiertas = ordenes.filter((o) => o.estado !== 'finalizado').length;
  const importeTotalFacturado = ordenes
    .filter((o) => o.estado === 'finalizado')
    .reduce((acc, o) => acc + (Number.isFinite(Number(o.coste_total)) ? Number(o.coste_total) : 0), 0);
  const minutosTotalesServicio = ordenes
    .filter((o) => o.estado === 'finalizado')
    .reduce((acc, o) => acc + (Number.isFinite(Number(o.tiempo_empleado_minutos)) ? Number(o.tiempo_empleado_minutos) : 0), 0);

  return {
    cliente: {
      ...restoCliente,
      comerciales: asignaciones
        .map((a) => a?.comerciales)
        .filter(Boolean)
        .map((c) => ({
          id: c.id,
          nombre: c.nombre,
          es_predeterminado: Boolean(c.es_predeterminado),
          activo: Boolean(c.activo),
        })),
    },
    equipos: equiposRsp.data || [],
    ordenes,
    resumen: {
      total_equipos: (equiposRsp.data || []).length,
      total_ordenes: totalOrdenes,
      ordenes_finalizadas: ordenesFinalizadas,
      ordenes_abiertas: ordenesAbiertas,
      importe_total_facturado: Number(importeTotalFacturado.toFixed(2)),
      minutos_totales_servicio: Math.round(minutosTotalesServicio),
      horas_totales_servicio: Number((minutosTotalesServicio / 60).toFixed(2)),
    },
  };
}

export async function registrarAuditoriaDescargaCliente({ clienteIds, tipoDescarga, opciones = {} }) {
  try {
    const supabase = obtenerClienteSupabase();
    const { data: authData } = await supabase.auth.getUser();
    const usuario = authData?.user || null;
    const payload = {
      tipo_accion: 'descarga_pdf_cliente',
      tipo_descarga: tipoDescarga === 'masiva' ? 'masiva' : 'individual',
      cliente_ids: Array.isArray(clienteIds) ? clienteIds : [clienteIds],
      usuario_id: usuario?.id || null,
      usuario_email: usuario?.email || null,
      contrasena_aplicada: Boolean(opciones.aplicarContrasena),
      anonimizado: Boolean(opciones.anonimizar),
      fecha_hora: new Date().toISOString(),
    };

    if (typeof console !== 'undefined' && typeof console.info === 'function') {
      console.info('[AUDITORIA] Descarga PDF clientes:', payload);
    }

    try {
      await supabase.from('auditoria_descargas_clientes').insert(payload).maybeSingle();
    } catch {
      // Tabla puede no existir; no bloqueamos la descarga por auditoría.
    }

    return payload;
  } catch {
    return null;
  }
}
