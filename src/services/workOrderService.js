import { obtenerClienteSupabase, parsearReferenciaStorage } from './supabaseClient';
import {
  limpiarTexto,
  normalizarDescripcion,
  validarMinutos,
  validarPrioridad,
  validarTextoRequerido,
  validarUrlOpcional,
} from './satValidation';
import { generarYSubirInformeParte } from './parteTrabajoInformeService';
import { subirFotosIntervencionStorage } from './parteTrabajoService';

const ESTADOS_EDITABLES = new Set(['pendiente', 'en_proceso', 'pausado']);

function validarDecimalNoNegativo(valor, etiqueta) {
  const numero = Number.parseFloat(String(valor ?? '').replace(',', '.'));
  if (!Number.isFinite(numero) || numero < 0) {
    throw new Error(`${etiqueta} debe ser un número mayor o igual a 0.`);
  }

  return Number(numero.toFixed(2));
}

function extraerFotosIntervencionDesdeTareas(tareasRealizadas) {
  const texto = String(tareasRealizadas || '');
  const coincidencia = /Fotos intervención:\s*(.+)$/i.exec(texto);
  if (!coincidencia || !coincidencia[1]) {
    return [];
  }

  return coincidencia[1]
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function extraerNombreFirmanteDesdeTareas(tareasRealizadas) {
  const texto = String(tareasRealizadas || '');
  const coincidencia = /Firmado por:\s*([^|\n\r]+)/i.exec(texto);
  return coincidencia?.[1]?.trim() || 'Cliente';
}

function resolverContextoRutaStorage(...referencias) {
  let clienteId = null;
  let tecnicoId = null;

  for (const referencia of referencias) {
    const ref = parsearReferenciaStorage(referencia);
    if (!ref?.path) {
      continue;
    }

    const segmentos = String(ref.path)
      .split('/')
      .map((segmento) => segmento.trim())
      .filter(Boolean);

    if (segmentos.length < 2) {
      continue;
    }

    if (!clienteId) {
      clienteId = segmentos[0];
    }
    if (!tecnicoId) {
      tecnicoId = segmentos[1];
    }

    if (clienteId && tecnicoId) {
      break;
    }
  }

  return { clienteId, tecnicoId };
}

// Parsea los bloques "Desplazamiento Cotepa a cliente" e "Intervención en cliente"
// embebidos en tareas_realizadas para reconstruir los timestamps reales y las pausas.
function extraerFasesDesdeTareas(tareasRealizadas) {
  const texto = String(tareasRealizadas || '');
  const tokens = texto.split('|').map((t) => t.trim());
  const cabeceras = {
    desplazamiento: 'Desplazamiento Cotepa a cliente',
    intervension: 'Intervención en cliente',
    seguimiento: 'Parte registrado desde movilidad',
  };
  const localizar = (cabecera) => {
    const idxIni = tokens.findIndex((t) => t === cabecera);
    if (idxIni < 0) return [];
    const idxFin = tokens.findIndex((t, i) => i > idxIni && Object.values(cabeceras).includes(t));
    return tokens.slice(idxIni + 1, idxFin > 0 ? idxFin : tokens.length);
  };
  const parseISO = (linea, etiqueta) => {
    const re = new RegExp(`^${etiqueta}:\\s*(.+)$`, 'i');
    const m = re.exec(linea);
    return m?.[1]?.trim() || null;
  };
  const construirFase = (cabecera) => {
    const lineas = localizar(cabecera);
    if (lineas.length === 0) return null;
    const fase = { inicioIso: null, finIso: null, pausasComida: [] };
    for (const linea of lineas) {
      const ini = parseISO(linea, 'Inicio');
      if (ini && !fase.inicioIso) { fase.inicioIso = ini; continue; }
      const fin = parseISO(linea, 'Fin');
      if (fin && !fase.finIso) { fase.finIso = fin; continue; }
      const mPausa = /^Pausa\s+\d+:\s*(\S+)\s*->\s*(\S+)/i.exec(linea);
      if (mPausa) {
        fase.pausasComida.push({ inicioIso: mPausa[1], finIso: mPausa[2] });
      }
    }
    return fase.inicioIso ? fase : null;
  };
  return {
    desplazamiento: construirFase(cabeceras.desplazamiento),
    intervension: construirFase(cabeceras.intervension),
  };
}

function materialesOrdenATexto(materialesOrden) {
  const materiales = Array.isArray(materialesOrden) ? materialesOrden : [];
  return materiales
    .map((material) => {
      const nombre = material.nombre_material || 'Material';
      const cantidad = Number.parseInt(material.cantidad, 10);
      const precioUnitario = Number.parseFloat(material.precio_unitario || 0);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        return null;
      }

      const precio = Number.isFinite(precioUnitario) ? precioUnitario : 0;
      return `${nombre};${cantidad};${precio}`;
    })
    .filter(Boolean)
    .join('\n');
}

function resolverValoracionNumerica(payloadValor, valorActual, etiqueta) {
  const vieneEnPayload = payloadValor !== undefined && payloadValor !== null && String(payloadValor).trim() !== '';
  if (vieneEnPayload) {
    return validarDecimalNoNegativo(payloadValor, etiqueta);
  }

  const numeroActual = Number.parseFloat(String(valorActual ?? '').replace(',', '.'));
  if (Number.isFinite(numeroActual) && numeroActual >= 0) {
    return Number(numeroActual.toFixed(2));
  }

  return 0;
}

function vieneNumeroEnPayload(payloadValor) {
  return payloadValor !== undefined && payloadValor !== null && String(payloadValor).trim() !== '';
}

function validarIsoDateTime(valor, etiqueta) {
  const texto = limpiarTexto(valor);
  if (!texto) {
    return null;
  }
  const fecha = new Date(texto);
  if (Number.isNaN(fecha.getTime())) {
    throw new Error(`${etiqueta} no tiene un formato válido.`);
  }
  return fecha.toISOString();
}

function resolverHorasManoObraPorDefecto(minutosContador) {
  const minutos = Number.parseFloat(String(minutosContador ?? '').replace(',', '.'));
  if (!Number.isFinite(minutos) || minutos <= 0) {
    return 1;
  }

  return minutos < 60 ? 1 : Number((minutos / 60).toFixed(2));
}

function resolverMinutosDesdeRangoIso(inicioIso, finIso) {
  if (!inicioIso || !finIso) return null;
  const iniMs = new Date(inicioIso).getTime();
  const finMs = new Date(finIso).getTime();
  const dif = finMs - iniMs;
  if (!Number.isFinite(dif) || dif <= 0) return null;
  return Math.max(1, Math.ceil(dif / 60000));
}

function extraerSecuencialInformeDesdeUrl(urlInforme) {
  const url = String(urlInforme || '');
  const nuevo = /(?:SAT|PEM)-\d{6}-(\d{2})\.pdf/i.exec(url);
  if (nuevo) {
    const n = Number.parseInt(nuevo[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  const antiguo = /(?:SAT|PEM)-\d{2}-\d{2}-\d{4}-(\d{2})\.pdf/i.exec(url);
  if (antiguo) {
    const n = Number.parseInt(antiguo[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function resolverValoracionBooleana(payloadValor, valorActual = false) {
  if (typeof payloadValor === 'boolean') {
    return payloadValor;
  }

  if (typeof payloadValor === 'string') {
    const normalizado = payloadValor.trim().toLowerCase();
    if (['true', '1', 'si', 'sí'].includes(normalizado)) {
      return true;
    }
    if (['false', '0', 'no'].includes(normalizado)) {
      return false;
    }
  }

  if (typeof payloadValor === 'number') {
    return payloadValor === 1;
  }

  return Boolean(valorActual);
}

function esFinDeSemanaPorIso(fechaIso) {
  if (!fechaIso) {
    return false;
  }

  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) {
    return false;
  }

  const dia = fecha.getDay();
  return dia === 0 || dia === 6;
}

function esFueraHorarioLaboralPorIso(fechaIso) {
  if (!fechaIso) {
    return false;
  }

  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) {
    return false;
  }

  const hora = fecha.getHours();
  return hora < 8 || hora >= 18;
}

function calcularRecargoFueraHorario(fechaInicioIso, fechaFinIso) {
  return esFueraHorarioLaboralPorIso(fechaInicioIso) || esFueraHorarioLaboralPorIso(fechaFinIso);
}

function validarEstadoEditable(estado) {
  const estadoLimpio = limpiarTexto(estado).toLowerCase();

  if (!ESTADOS_EDITABLES.has(estadoLimpio)) {
    throw new Error('El estado seleccionado no es válido para una orden abierta.');
  }

  return estadoLimpio;
}

async function obtenerContextoUsuarioSat(supabase) {
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) {
    throw new Error(`No se pudo validar la sesion actual: ${authError.message}`);
  }

  const usuario = authData?.user;
  if (!usuario) {
    throw new Error('No hay una sesion activa. Inicia sesion para operar ordenes.');
  }

  const [rolRsp, tecnicoRsp] = await Promise.all([
    supabase.from('usuarios_sat').select('rol').eq('user_id', usuario.id).maybeSingle(),
    supabase.from('tecnicos').select('id, nombre, activo').eq('user_id', usuario.id).maybeSingle(),
  ]);

  if (rolRsp.error) {
    throw new Error(`No se pudo validar el rol del usuario: ${rolRsp.error.message}`);
  }

  if (tecnicoRsp.error) {
    throw new Error(`No se pudo validar el tecnico vinculado al usuario: ${tecnicoRsp.error.message}`);
  }

  return {
    rol: rolRsp.data?.rol || null,
    tecnicoId: tecnicoRsp.data?.id || null,
    tecnicoNombre: tecnicoRsp.data?.nombre || null,
  };
}

function validarAsignacionTecnicoEnOrden(contextoUsuario, ordenActual, accion) {
  if (contextoUsuario.rol !== 'tecnico') {
    return;
  }

  if (!contextoUsuario.tecnicoId) {
    throw new Error(
      'Tu usuario esta en rol tecnico pero no esta vinculado a ningun registro en tecnicos. Vincula auth.users.id en tecnicos.user_id para poder ' +
        accion +
        ' ordenes.',
    );
  }

  if (ordenActual.tecnico_id !== contextoUsuario.tecnicoId) {
    throw new Error('Solo puedes operar ordenes asignadas a tu tecnico. Revisa la asignacion del tecnico en la orden.');
  }
}

async function validarReferenciasOrden(supabase, ordenNueva) {
  const { cliente_id: clienteId, equipo_id: equipoId, tecnico_id: tecnicoId } = ordenNueva;

  const { data: cliente, error: errorCliente } = await supabase
    .from('clientes')
    .select('id')
    .eq('id', clienteId)
    .maybeSingle();

  if (errorCliente) {
    throw new Error(`No se pudo validar el cliente seleccionado: ${errorCliente.message}`);
  }

  if (!cliente) {
    throw new Error('El cliente seleccionado no existe.');
  }

  if (equipoId) {
    const { data: equipo, error: errorEquipo } = await supabase
      .from('equipos')
      .select('id, cliente_id')
      .eq('id', equipoId)
      .maybeSingle();

    if (errorEquipo) {
      throw new Error(`No se pudo validar el equipo seleccionado: ${errorEquipo.message}`);
    }

    if (!equipo) {
      throw new Error('El equipo seleccionado no existe.');
    }

    if (equipo.cliente_id !== clienteId) {
      throw new Error('El equipo seleccionado no pertenece al cliente indicado.');
    }
  }

  if (tecnicoId) {
    const { data: tecnico, error: errorTecnico } = await supabase
      .from('tecnicos')
      .select('id, activo')
      .eq('id', tecnicoId)
      .maybeSingle();

    if (errorTecnico) {
      throw new Error(`No se pudo validar el técnico seleccionado: ${errorTecnico.message}`);
    }

    if (!tecnico) {
      throw new Error('El técnico seleccionado no existe.');
    }

    if (!tecnico.activo) {
      throw new Error('El técnico seleccionado está inactivo.');
    }
  }
}

async function validarOrdenDuplicadaAbierta(supabase, ordenNueva) {
  const { data, error } = await supabase
    .from('ordenes_trabajo')
    .select('id, descripcion_averia, estado, equipo_id')
    .eq('cliente_id', ordenNueva.cliente_id)
    .in('estado', ['pendiente', 'en_proceso', 'pausado'])
    .order('fecha_inicio', { ascending: false })
    .limit(25);

  if (error) {
    throw new Error(`No se pudo comprobar si existe una orden abierta similar: ${error.message}`);
  }

  const descripcionNueva = normalizarDescripcion(ordenNueva.descripcion_averia);
  const duplicada = (data || []).find((ordenExistente) => {
    const mismaDescripcion = normalizarDescripcion(ordenExistente.descripcion_averia) === descripcionNueva;
    const mismoEquipo = !ordenNueva.equipo_id || !ordenExistente.equipo_id || ordenExistente.equipo_id === ordenNueva.equipo_id;
    return mismaDescripcion && mismoEquipo;
  });

  if (duplicada) {
    throw new Error('Ya existe una orden abierta con la misma avería para este cliente.');
  }
}

/**
 * Obtiene todas las órdenes de trabajo.
 */
export async function obtenerOrdenesTrabajo() {
  const supabase = obtenerClienteSupabase();

  const { data, error } = await supabase
    .from('ordenes_trabajo')
    .select(
      `
      id,
      updated_at,
      numero_ticket,
      tipo_orden,
      descripcion_averia,
      tareas_realizadas,
      tiempo_empleado_minutos,
      coste_materiales_editable,
      tarifa_mano_obra_hora,
      horas_mano_obra,
      mecanicos_intervinieron,
      tarifa_desplazamiento_km,
      km_desplazamiento_facturables,
      recargo_festivo_pct,
      recargo_fuera_horario_pct,
      aplica_recargo_festivo,
      aplica_recargo_fuera_horario,
      coste_mano_obra_total,
      coste_desplazamiento_total,
      coste_total,
      estado,
      prioridad,
      foto_url,
      firma_url,
      informe_pdf_url,
      fecha_inicio,
      fecha_fin,
      fecha_instalacion,
      pem_data,
      clientes ( id, nombre, direccion, telefono, lat, lng ),
      equipos ( id, nombre, marca, modelo ),
      tecnicos ( id, nombre ),
      materiales_orden ( id, nombre_material, cantidad, precio_unitario )
    `
    )
    .order('fecha_inicio', { ascending: false });

  if (error) {
    throw new Error(`No se pudieron obtener las órdenes de trabajo: ${error.message}`);
  }

  return data;
}

/**
 * Crea una nueva orden de trabajo.
 * Recibe un objeto con los campos de la tabla ordenes_trabajo.
 */
export async function crearOrdenTrabajo(ordenNueva) {
  const supabase = obtenerClienteSupabase();

  const clienteId = limpiarTexto(ordenNueva.cliente_id);
  if (!clienteId) {
    throw new Error('Debes seleccionar un cliente para crear la orden.');
  }

  const tipoOrdenEntrada = limpiarTexto(ordenNueva.tipo_orden) || 'averia';
  const tipoOrden = ['averia', 'montaje', 'puesta_en_marcha'].includes(tipoOrdenEntrada)
    ? tipoOrdenEntrada
    : 'averia';
  const etiquetaDescripcion = tipoOrden === 'averia' ? 'La descripción de la avería' : 'La descripción de la orden';
  const minDesc = tipoOrden === 'averia' ? 8 : 3;
  const descripcionAveria = validarTextoRequerido(ordenNueva.descripcion_averia, etiquetaDescripcion, minDesc);
  const prioridad = validarPrioridad(ordenNueva.prioridad ?? 'media');
  const equipoId = limpiarTexto(ordenNueva.equipo_id) || null;
  const tecnicoId = limpiarTexto(ordenNueva.tecnico_id);

  if (!tecnicoId) {
    throw new Error('Debes asignar un técnico antes de crear la orden.');
  }

  await validarReferenciasOrden(supabase, {
    cliente_id: clienteId,
    equipo_id: equipoId,
    tecnico_id: tecnicoId,
  });
  await validarOrdenDuplicadaAbierta(supabase, {
    cliente_id: clienteId,
    equipo_id: equipoId,
    descripcion_averia: descripcionAveria,
  });

  const payload = {
    cliente_id: clienteId,
    equipo_id: equipoId,
    tecnico_id: tecnicoId,
    descripcion_averia: descripcionAveria,
    tipo_orden: tipoOrden,
    tareas_realizadas: ordenNueva.tareas_realizadas ?? null,
    tiempo_empleado_minutos: ordenNueva.tiempo_empleado_minutos ?? null,
    estado: ordenNueva.estado ?? 'pendiente',
    prioridad,
    foto_url: validarUrlOpcional(ordenNueva.foto_url, 'La URL de la foto') ?? null,
    firma_url: ordenNueva.firma_url ?? null,
    fecha_inicio: ordenNueva.fecha_inicio ?? new Date().toISOString(),
    fecha_fin: ordenNueva.fecha_fin ?? null,
    fecha_instalacion: ordenNueva.fecha_instalacion ?? null,
    pem_data: ordenNueva.pem_data ?? undefined,
  };

  const { data, error } = await supabase
    .from('ordenes_trabajo')
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw new Error(`No se pudo crear la orden de trabajo: ${error.message}`);
  }

  return data;
}

/**
 * Actualiza una orden al estado finalizado,
 * guardando tareas realizadas y la foto del trabajo.
 */
export async function finalizarOrdenTrabajo(idOrden, { tareasRealizadas, fotoUrl, tiempoEmpleadoMinutos }) {
  const supabase = obtenerClienteSupabase();
  const contextoUsuario = await obtenerContextoUsuarioSat(supabase);

  const ordenId = limpiarTexto(idOrden);
  if (!ordenId) {
    throw new Error('La orden que intentas finalizar no es válida.');
  }

  const tareas = validarTextoRequerido(tareasRealizadas, 'Las tareas realizadas', 8);
  const minutos = validarMinutos(tiempoEmpleadoMinutos, 'El tiempo de cierre');
  const foto = validarUrlOpcional(fotoUrl, 'La URL de la foto');

  const { data: ordenActual, error: errorOrdenActual } = await supabase
    .from('ordenes_trabajo')
    .select('id, tecnico_id, estado')
    .eq('id', ordenId)
    .maybeSingle();

  if (errorOrdenActual) {
    throw new Error(`No se pudo validar la orden antes del cierre: ${errorOrdenActual.message}`);
  }

  if (!ordenActual) {
    throw new Error('La orden que intentas finalizar ya no existe.');
  }

  if (!ordenActual.tecnico_id) {
    throw new Error('No se puede finalizar una orden sin técnico asignado.');
  }

  if (ordenActual.estado === 'finalizado') {
    throw new Error('La orden seleccionada ya está finalizada.');
  }

  validarAsignacionTecnicoEnOrden(contextoUsuario, ordenActual, 'finalizar');

  const actualizacion = {
    estado: 'finalizado',
    tareas_realizadas: tareas,
    tiempo_empleado_minutos: minutos,
    foto_url: foto,
    fecha_fin: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('ordenes_trabajo')
    .update(actualizacion)
    .eq('id', ordenId)
    .select()
    .single();

  if (error) {
    throw new Error(`No se pudo finalizar la orden de trabajo: ${error.message}`);
  }

  return data;
}

export async function actualizarOrdenTrabajo(idOrden, cambios, opciones = {}) {
  const supabase = obtenerClienteSupabase();
  const contextoUsuario = await obtenerContextoUsuarioSat(supabase);
  const ordenId = limpiarTexto(idOrden);
  const expectedUpdatedAt = limpiarTexto(opciones.expectedUpdatedAt) || null;

  if (!ordenId) {
    throw new Error('La orden que intentas actualizar no es válida.');
  }

  const tecnicoId = limpiarTexto(cambios.tecnico_id);
  if (!tecnicoId) {
    throw new Error('Debes asignar un técnico válido a la orden.');
  }

  const prioridad = validarPrioridad(cambios.prioridad ?? 'media');
  const estado = validarEstadoEditable(cambios.estado ?? 'pendiente');

  const { data: ordenActual, error: errorOrdenActual } = await supabase
    .from('ordenes_trabajo')
    .select('id, cliente_id, equipo_id, estado, updated_at')
    .eq('id', ordenId)
    .maybeSingle();

  if (errorOrdenActual) {
    throw new Error(`No se pudo validar la orden antes de actualizarla: ${errorOrdenActual.message}`);
  }

  if (!ordenActual) {
    throw new Error('La orden que intentas editar ya no existe.');
  }

  if (ordenActual.estado === 'finalizado') {
    throw new Error('No se puede editar una orden que ya está finalizada.');
  }

  validarAsignacionTecnicoEnOrden(contextoUsuario, ordenActual, 'editar');

  await validarReferenciasOrden(supabase, {
    cliente_id: ordenActual.cliente_id,
    equipo_id: ordenActual.equipo_id,
    tecnico_id: tecnicoId,
  });

  let query = supabase
    .from('ordenes_trabajo')
    .update({
      tecnico_id: tecnicoId,
      prioridad,
      estado,
    })
    .eq('id', ordenId);

  if (expectedUpdatedAt) {
    query = query.eq('updated_at', expectedUpdatedAt);
  }

  const { data, error } = await query.select();

  if (error) {
    if ((error.message || '').includes('Solo puedes editar ordenes asignadas a tu tecnico')) {
      throw new Error(
        'Solo puedes editar ordenes asignadas a tu tecnico. Verifica que el usuario actual este vinculado en tecnicos.user_id y que la orden tenga ese tecnico.',
      );
    }

    const wrapped = new Error(`No se pudo actualizar la orden de trabajo: ${error.message}`, { cause: error });
    throw wrapped;
  }

  const fila = Array.isArray(data) ? data[0] : null;
  if (expectedUpdatedAt && !fila) {
    const conflicto = new Error('Conflicto: la orden cambió mientras estabas offline.', { cause: null });
    conflicto.status = 409;
    throw conflicto;
  }

  if (!fila) {
    throw new Error('No se pudo actualizar la orden de trabajo (sin respuesta del servidor).');
  }

  return fila;
}

export async function eliminarOrdenTrabajo(ordenId) {
  const supabase = obtenerClienteSupabase();
  const contextoUsuario = await obtenerContextoUsuarioSat(supabase);
  const id = limpiarTexto(ordenId);

  if (!id) {
    throw new Error('La orden que intentas eliminar no es válida.');
  }

  if (contextoUsuario.rol !== 'admin') {
    throw new Error('Solo el rol admin puede eliminar órdenes.');
  }

  const { data: ordenActual, error: errorOrdenActual } = await supabase
    .from('ordenes_trabajo')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (errorOrdenActual) {
    throw new Error(`No se pudo validar la orden antes de eliminarla: ${errorOrdenActual.message}`);
  }

  if (!ordenActual) {
    throw new Error('La orden que intentas eliminar no existe o ya fue eliminada.');
  }

  const { error: errorMateriales } = await supabase
    .from('materiales_orden')
    .delete()
    .eq('orden_id', id);

  if (errorMateriales) {
    throw new Error(`No se pudieron eliminar los materiales de la orden: ${errorMateriales.message}`, { cause: errorMateriales });
  }

  const { error: errorOrden } = await supabase
    .from('ordenes_trabajo')
    .delete()
    .eq('id', id);

  if (errorOrden) {
    throw new Error(`No se pudo eliminar la orden de trabajo: ${errorOrden.message}`, { cause: errorOrden });
  }

  // Verificar que realmente se eliminó (RLS puede bloquear silenciosamente sin devolver error)
  const { data: verificacion, error: errorVerificacion } = await supabase
    .from('ordenes_trabajo')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (errorVerificacion) {
    throw new Error(`No se pudo verificar la eliminación: ${errorVerificacion.message}`);
  }

  if (verificacion) {
    throw new Error(
      'La orden no fue eliminada. Es posible que la política de seguridad de la base de datos no permita esta operación. Contacta con el administrador de Supabase para añadir una política DELETE para el rol admin en la tabla ordenes_trabajo.',
    );
  }
}

/**
 * Guarda la URL del informe PDF en la orden de trabajo.
 */
export async function guardarInformePdfUrl(ordenId, pdfUrl) {
  const supabase = obtenerClienteSupabase();
  const id = limpiarTexto(ordenId);
  if (!id) {
    throw new Error('ID de orden requerido para guardar el informe PDF.');
  }

  const { error } = await supabase
    .from('ordenes_trabajo')
    .update({ informe_pdf_url: pdfUrl })
    .eq('id', id);

  if (error) {
    throw new Error(`No se pudo guardar la URL del informe PDF: ${error.message}`);
  }
}

export async function actualizarValoracionOrdenFinalizada(ordenId, payload) {
  const supabase = obtenerClienteSupabase();
  const contextoUsuario = await obtenerContextoUsuarioSat(supabase);
  const id = limpiarTexto(ordenId);

  if (!id) {
    throw new Error('ID de orden requerido para actualizar la valoración.');
  }

  if (contextoUsuario.rol !== 'admin') {
    throw new Error('Solo el rol admin puede editar valoración económica y regenerar el informe.');
  }

  const { data: ordenActual, error: ordenError } = await supabase
    .from('ordenes_trabajo')
    .select(
      `
      id,
      numero_ticket,
      tipo_orden,
      cliente_id,
      equipo_id,
      tecnico_id,
      descripcion_averia,
      tareas_realizadas,
      tiempo_empleado_minutos,
      prioridad,
      estado,
      foto_url,
      firma_url,
      informe_pdf_url,
      pem_data,
      coste_materiales_editable,
      tarifa_mano_obra_hora,
      horas_mano_obra,
      mecanicos_intervinieron,
      tarifa_desplazamiento_km,
      km_desplazamiento_facturables,
      recargo_festivo_pct,
      recargo_fuera_horario_pct,
      aplica_recargo_festivo,
      aplica_recargo_fuera_horario,
      coste_mano_obra_total,
      coste_desplazamiento_total,
      coste_total,
      fecha_inicio,
      fecha_fin,
      desplazamiento_inicio,
      desplazamiento_fin,
      intervension_inicio,
      intervension_fin,
      clientes ( id, nombre, direccion, telefono, lat, lng ),
      equipos ( id, nombre, marca, modelo ),
      tecnicos ( id, nombre ),
      materiales_orden ( id, nombre_material, cantidad, precio_unitario )
    `,
    )
    .eq('id', id)
    .maybeSingle();

  if (ordenError) {
    throw new Error(`No se pudo cargar la orden para valorar: ${ordenError.message}`);
  }

  if (!ordenActual) {
    throw new Error('La orden no existe o fue eliminada.');
  }

  if (ordenActual.estado !== 'finalizado') {
    throw new Error('Solo se puede valorar una orden finalizada.');
  }

  const valoracionTraceId = `valoracion-${ordenId}-${Date.now()}`;

  const costeMaterialesCalculado = (Array.isArray(ordenActual.materiales_orden) ? ordenActual.materiales_orden : [])
    .reduce((acc, item) => acc + (Number(item.cantidad || 0) * Number(item.precio_unitario || 0)), 0);

  const fechaInicioIso = payload.fecha_inicio !== undefined
    ? validarIsoDateTime(payload.fecha_inicio, 'Inicio intervención')
    : (ordenActual.fecha_inicio || null);
  const fechaFinIso = payload.fecha_fin !== undefined
    ? validarIsoDateTime(payload.fecha_fin, 'Fin intervención')
    : (ordenActual.fecha_fin || null);

  if ((fechaInicioIso && !fechaFinIso) || (!fechaInicioIso && fechaFinIso)) {
    throw new Error('Debes indicar inicio y fin de intervención.');
  }
  if (fechaInicioIso && fechaFinIso) {
    const iniMs = new Date(fechaInicioIso).getTime();
    const finMs = new Date(fechaFinIso).getTime();
    if (!Number.isFinite(iniMs) || !Number.isFinite(finMs) || finMs < iniMs) {
      throw new Error('La fecha/hora de fin de intervención debe ser posterior al inicio.');
    }
  }

  const costeMaterialesEditable = resolverValoracionNumerica(
    payload.coste_materiales_editable,
    ordenActual.coste_materiales_editable ?? costeMaterialesCalculado,
    'Coste materiales editable',
  );
  const tarifaManoObraHora = resolverValoracionNumerica(
    payload.tarifa_mano_obra_hora,
    ordenActual.tarifa_mano_obra_hora ?? 50,
    'Tarifa mano de obra (€/h)',
  );
  const tiempoEmpleadoMinutos = payload.tiempo_empleado_minutos !== undefined
    ? validarMinutos(payload.tiempo_empleado_minutos, 'Tiempo empleado (min)')
    : ordenActual.tiempo_empleado_minutos;
  const minutosDesdeFechas = payload.fecha_inicio !== undefined && payload.fecha_fin !== undefined
    ? resolverMinutosDesdeRangoIso(fechaInicioIso, fechaFinIso)
    : null;
  const horasDesdeFechas = minutosDesdeFechas != null ? resolverHorasManoObraPorDefecto(minutosDesdeFechas) : null;
  const horasDesdeMinutos = resolverHorasManoObraPorDefecto(tiempoEmpleadoMinutos);
  const horasManoObraFallback = !vieneNumeroEnPayload(payload.horas_mano_obra)
    ? (horasDesdeFechas ?? (payload.tiempo_empleado_minutos !== undefined ? horasDesdeMinutos : (
      Number.isFinite(Number(ordenActual.horas_mano_obra))
        ? Number(ordenActual.horas_mano_obra)
        : horasDesdeMinutos
    )))
    : (Number.isFinite(Number(ordenActual.horas_mano_obra))
      ? Number(ordenActual.horas_mano_obra)
      : horasDesdeMinutos);
  const horasManoObra = resolverValoracionNumerica(
    payload.horas_mano_obra,
    horasManoObraFallback,
    'Horas mano de obra',
  );
  const mecanicosIntervinieronNumerico = resolverValoracionNumerica(
    payload.mecanicos_intervinieron,
    ordenActual.mecanicos_intervinieron ?? 1,
    'Mecánicos intervinieron',
  );
  const mecanicosIntervinieron = Math.max(1, Math.round(mecanicosIntervinieronNumerico));
  const tarifaDesplazamientoKm = resolverValoracionNumerica(
    payload.tarifa_desplazamiento_km,
    ordenActual.tarifa_desplazamiento_km ?? 0.5,
    'Tarifa desplazamiento (€/km)',
  );
  const kmDesplazamientoFacturables = resolverValoracionNumerica(
    payload.km_desplazamiento_facturables,
    ordenActual.km_desplazamiento_facturables,
    'Km desplazamiento facturables',
  );
  const recargoFestivoPct = resolverValoracionNumerica(
    payload.recargo_festivo_pct,
    ordenActual.recargo_festivo_pct,
    'Recargo festivo (%)',
  );
  const recargoFueraHorarioPct = resolverValoracionNumerica(
    payload.recargo_fuera_horario_pct,
    ordenActual.recargo_fuera_horario_pct,
    'Recargo fuera de horario (%)',
  );
  const aplicaRecargoFestivo = resolverValoracionBooleana(
    payload.aplica_recargo_festivo,
    ordenActual.aplica_recargo_festivo ?? esFinDeSemanaPorIso(fechaInicioIso),
  );
  const aplicaRecargoFueraHorario = resolverValoracionBooleana(
    payload.aplica_recargo_fuera_horario,
    ordenActual.aplica_recargo_fuera_horario
      ?? calcularRecargoFueraHorario(fechaInicioIso, fechaFinIso),
  );
  const porcentajeRecargoManoObra = (aplicaRecargoFestivo ? recargoFestivoPct : 0)
    + (aplicaRecargoFueraHorario ? recargoFueraHorarioPct : 0);
  const costeManoObraBase = Number((tarifaManoObraHora * horasManoObra * mecanicosIntervinieron).toFixed(2));
  const costeManoObraTotal = Number((costeManoObraBase * (1 + (porcentajeRecargoManoObra / 100))).toFixed(2));
  const costeDesplazamientoTotal = Number((tarifaDesplazamientoKm * kmDesplazamientoFacturables).toFixed(2));
  const costeTotal = Number((costeMaterialesEditable + costeManoObraTotal + costeDesplazamientoTotal).toFixed(2));

  const { error: updateError } = await supabase
    .from('ordenes_trabajo')
    .update({
      ...(payload.tiempo_empleado_minutos !== undefined ? { tiempo_empleado_minutos: tiempoEmpleadoMinutos } : {}),
      ...(fechaInicioIso ? { fecha_inicio: fechaInicioIso } : {}),
      ...(fechaFinIso ? { fecha_fin: fechaFinIso } : {}),
      coste_materiales_editable: costeMaterialesEditable,
      tarifa_mano_obra_hora: tarifaManoObraHora,
      horas_mano_obra: horasManoObra,
      mecanicos_intervinieron: mecanicosIntervinieron,
      tarifa_desplazamiento_km: tarifaDesplazamientoKm,
      km_desplazamiento_facturables: kmDesplazamientoFacturables,
      recargo_festivo_pct: recargoFestivoPct,
      recargo_fuera_horario_pct: recargoFueraHorarioPct,
      aplica_recargo_festivo: aplicaRecargoFestivo,
      aplica_recargo_fuera_horario: aplicaRecargoFueraHorario,
      coste_mano_obra_total: costeManoObraTotal,
      coste_desplazamiento_total: costeDesplazamientoTotal,
      coste_total: costeTotal,
    })
    .eq('id', id);

  if (updateError) {
    throw new Error(`No se pudo guardar la valoración económica: ${updateError.message}`);
  }

  let materialesParaInforme = Array.isArray(ordenActual.materiales_orden) ? ordenActual.materiales_orden : [];

  if (payload.coste_materiales_editable !== undefined) {
    const round2 = (n) => Number(Number(n || 0).toFixed(2));
    const objetivo = round2(costeMaterialesEditable);

    const recalcularMateriales = (items, totalObjetivo) => {
      const base = Array.isArray(items) ? items : [];

      if (base.length === 0) {
        if (totalObjetivo <= 0) return [];
        return [{
          orden_id: id,
          nombre_material: 'Materiales',
          cantidad: 1,
          precio_unitario: totalObjetivo,
        }];
      }

      const lineas = base.map((m) => ({
        orden_id: id,
        nombre_material: String(m.nombre_material || m.nombre || 'Material').trim() || 'Material',
        cantidad: Math.max(1, Number.parseInt(m.cantidad, 10) || 1),
        precio_unitario: round2(Number(m.precio_unitario || 0)),
      }));

      const totalBase = round2(lineas.reduce((acc, l) => acc + (l.cantidad * l.precio_unitario), 0));
      if (Math.abs(totalBase - totalObjetivo) < 0.01) {
        return null;
      }

      if (totalBase <= 0) {
        const primera = lineas[0];
        primera.precio_unitario = round2(totalObjetivo / Math.max(1, primera.cantidad));
        return lineas;
      }

      const factor = totalObjetivo / totalBase;
      const escaladas = lineas.map((l) => ({
        ...l,
        precio_unitario: round2(l.precio_unitario * factor),
      }));

      const totalEscalado = round2(escaladas.reduce((acc, l) => acc + (l.cantidad * l.precio_unitario), 0));
      const diff = round2(totalObjetivo - totalEscalado);
      if (Math.abs(diff) >= 0.01) {
        const idx = escaladas.length - 1;
        const ultima = escaladas[idx];
        const ajusteUnitario = round2(diff / Math.max(1, ultima.cantidad));
        ultima.precio_unitario = round2(Math.max(0, ultima.precio_unitario + ajusteUnitario));
      }

      return escaladas;
    };

    const nuevosMateriales = recalcularMateriales(materialesParaInforme, objetivo);
    if (nuevosMateriales) {
      const { error: errorDelete } = await supabase
        .from('materiales_orden')
        .delete()
        .eq('orden_id', id);
      if (errorDelete) {
        throw new Error(`No se pudieron actualizar los materiales de la orden: ${errorDelete.message}`);
      }

      if (nuevosMateriales.length > 0) {
        const { error: errorInsert } = await supabase
          .from('materiales_orden')
          .insert(nuevosMateriales);
        if (errorInsert) {
          throw new Error(`No se pudieron actualizar los materiales de la orden: ${errorInsert.message}`);
        }
      }

      materialesParaInforme = nuevosMateriales;
    }
  }

  const materialesTexto = materialesOrdenATexto(materialesParaInforme);
  const fasesParseadas = extraerFasesDesdeTareas(ordenActual.tareas_realizadas);
  const inicioInterv = fechaInicioIso
    || ordenActual.intervension_inicio
    || fasesParseadas.intervension?.inicioIso
    || ordenActual.fecha_inicio;
  const finInterv = fechaFinIso
    || ordenActual.intervension_fin
    || fasesParseadas.intervension?.finIso
    || ordenActual.fecha_fin;
  const desplazamiento = {
    inicioIso: ordenActual.desplazamiento_inicio
      || fasesParseadas.desplazamiento?.inicioIso
      || ordenActual.fecha_inicio,
    finIso: ordenActual.desplazamiento_fin
      || fasesParseadas.desplazamiento?.finIso
      || inicioInterv,
    distanciaMetros: Number.isFinite(Number(kmDesplazamientoFacturables))
      ? Math.round(kmDesplazamientoFacturables * 1000)
      : null,
  };
  const intervensionRecuperada = {
    inicioIso: inicioInterv,
    finIso: finInterv,
    pausasComida: fasesParseadas.intervension?.pausasComida || [],
  };
  const secuencialInforme = extraerSecuencialInformeDesdeUrl(ordenActual.informe_pdf_url);

  const informe = await generarYSubirInformeParte({
    parte: {
      id: ordenActual.id,
      tareas_realizadas: ordenActual.tareas_realizadas || '',
      descripcion_averia: ordenActual.descripcion_averia || null,
      prioridad: ordenActual.prioridad || null,
    },
    formulario: {
      cliente_id: ordenActual.cliente_id,
      tecnico_id: ordenActual.tecnico_id,
      orden_id: ordenActual.id,
      prioridad: ordenActual.prioridad || 'media',
      tiempo_empleado: String(tiempoEmpleadoMinutos || 0),
      descripcion_problema: ordenActual.descripcion_averia || 'Sin descripción',
      materialesTexto,
    },
    desplazamiento,
    intervension: intervensionRecuperada,
    clienteNombre: ordenActual.clientes?.nombre || 'Cliente no identificado',
    equipoNombre: ordenActual.equipos?.nombre || 'Sin equipo',
    tecnicoNombre: ordenActual.tecnicos?.nombre || 'Tecnico no identificado',
    nombreFirmante: extraerNombreFirmanteDesdeTareas(ordenActual.tareas_realizadas),
    firmaUrl: ordenActual.firma_url || '',
    fotosIntervencionUrls: extraerFotosIntervencionDesdeTareas(ordenActual.tareas_realizadas),
    secuencialDiario: secuencialInforme || undefined,
    fechaInformeIso: inicioInterv,
    valoracionEconomica: {
      costeMaterialesEditable,
      tarifaManoObraHora,
      horasManoObra,
      mecanicosIntervinieron,
      recargoFestivoPct,
      recargoFueraHorarioPct,
      aplicaRecargoFestivo,
      aplicaRecargoFueraHorario,
      porcentajeRecargoManoObra,
      costeManoObraBase,
      costeManoObraTotal,
      tarifaDesplazamientoKm,
      kmDesplazamientoFacturables,
      costeDesplazamientoTotal,
      costeTotal,
    },
  });

  await guardarInformePdfUrl(id, informe.pdfUrl);

  return {
    pdfUrl: informe.pdfUrl,
    costeMaterialesEditable,
    tarifaManoObraHora,
    horasManoObra,
    mecanicosIntervinieron,
    tarifaDesplazamientoKm,
    kmDesplazamientoFacturables,
    recargoFestivoPct,
    recargoFueraHorarioPct,
    aplicaRecargoFestivo,
    aplicaRecargoFueraHorario,
    porcentajeRecargoManoObra,
    costeManoObraBase,
    costeManoObraTotal,
    costeDesplazamientoTotal,
    costeTotal,
  };
}

// =====================================================================
// Edición completa de un parte ya finalizado (rol admin)
// =====================================================================

function reemplazarBloqueTareasRealizadas(tareasRealizadas, { descripcionLibre, fotosUrls }) {
  const partes = String(tareasRealizadas || '')
    .split('|')
    .map((t) => t.trim())
    .filter(Boolean);

  // El primer bloque es el resumen/descripción libre. Lo reemplazamos si llega.
  if (descripcionLibre !== undefined) {
    const nuevaDesc = String(descripcionLibre || '').trim() || 'Parte registrado desde movilidad';
    if (partes.length === 0) {
      partes.push(nuevaDesc);
    } else {
      partes[0] = nuevaDesc;
    }
  } else if (partes.length === 0) {
    partes.push('Parte registrado desde movilidad');
  }

  // Quitamos el bloque "Fotos intervención: ..." si existe
  const sinFotos = partes.filter((bloque) => !/^Fotos intervención:/i.test(bloque));

  // Reañadimos al final si hay fotos
  if (Array.isArray(fotosUrls) && fotosUrls.length > 0) {
    sinFotos.push(`Fotos intervención: ${fotosUrls.join(' | ')}`);
  }

  return sinFotos.join(' | ');
}

export async function editarParteFinalizado(ordenId, payload) {
  const supabase = obtenerClienteSupabase();
  const contextoUsuario = await obtenerContextoUsuarioSat(supabase);
  const id = limpiarTexto(ordenId);
  let costeMaterialesEditableRecalculado = null;
  let costeTotalRecalculado = null;

  if (!id) {
    throw new Error('ID de orden requerido para editar el parte.');
  }

  if (contextoUsuario.rol !== 'admin') {
    throw new Error('Solo el rol admin puede editar un parte finalizado.');
  }

  const { data: ordenActual, error: ordenError } = await supabase
    .from('ordenes_trabajo')
    .select(`
      id,
      cliente_id,
      tecnico_id,
      descripcion_averia,
      tareas_realizadas,
      foto_url,
      firma_url,
      informe_pdf_url,
      tiempo_empleado_minutos,
      desplazamiento_inicio,
      desplazamiento_fin,
      intervension_inicio,
      intervension_fin,
      prioridad,
      estado,
      fecha_inicio,
      fecha_fin,
      coste_materiales_editable,
      tarifa_mano_obra_hora,
      horas_mano_obra,
      mecanicos_intervinieron,
      tarifa_desplazamiento_km,
      km_desplazamiento_facturables,
      recargo_festivo_pct,
      recargo_fuera_horario_pct,
      aplica_recargo_festivo,
      aplica_recargo_fuera_horario,
      coste_mano_obra_total,
      coste_desplazamiento_total,
      coste_total,
      clientes ( id, nombre, direccion, telefono, lat, lng ),
      equipos ( id, nombre ),
      tecnicos ( id, nombre ),
      materiales_orden ( id, nombre_material, cantidad, precio_unitario )
    `)
    .eq('id', id)
    .maybeSingle();

  if (ordenError) {
    throw new Error(`No se pudo cargar la orden para editar: ${ordenError.message}`);
  }

  if (!ordenActual) {
    throw new Error('La orden no existe o fue eliminada.');
  }

  if (ordenActual.estado !== 'finalizado') {
    throw new Error('Solo se puede editar un parte finalizado. Para cambios en órdenes abiertas usa el editor estándar.');
  }

  const editarParteTraceId = `editar-parte-${ordenId}-${Date.now()}`;

  // Resolver descripción avería
  const descripcionAveria = payload.descripcion_averia !== undefined
    ? validarTextoRequerido(payload.descripcion_averia, 'Descripción de la avería')
    : ordenActual.descripcion_averia;

  // Resolver descripción libre del parte (primer bloque de tareas_realizadas)
  const descripcionLibreParte = payload.tareas_realizadas_libre !== undefined
    ? String(payload.tareas_realizadas_libre || '').trim()
    : undefined;

  // Fotos: partir de las actuales (extraídas del marcador en tareas_realizadas), eliminar las marcadas y subir nuevas
  const fotosActuales = extraerFotosIntervencionDesdeTareas(ordenActual.tareas_realizadas);
  const fotosAEliminar = Array.isArray(payload.fotos_a_eliminar)
    ? payload.fotos_a_eliminar.map((u) => String(u || '').trim()).filter(Boolean)
    : [];
  const fotosConservadas = fotosActuales.filter((u) => !fotosAEliminar.includes(u));

  const contextoRutaStorage = resolverContextoRutaStorage(
    ...fotosConservadas,
    ordenActual.foto_url,
    ordenActual.firma_url,
  );
  const clienteIdStorage = ordenActual.cliente_id || contextoRutaStorage.clienteId;
  const tecnicoIdStorage = ordenActual.tecnico_id || contextoRutaStorage.tecnicoId;

  let fotosNuevasUrls = [];
  const fotosNuevas = Array.isArray(payload.fotos_nuevas) ? payload.fotos_nuevas : [];
  if (fotosNuevas.length > 0) {
    if (!clienteIdStorage || !tecnicoIdStorage) {
      throw new Error(
        'No se pudo determinar cliente/técnico para la ruta de Storage del parte. Revisa que la orden tenga cliente y técnico asignados.',
      );
    }

    fotosNuevasUrls = await subirFotosIntervencionStorage(supabase, {
      fotos: fotosNuevas,
      clienteId: clienteIdStorage,
      tecnicoId: tecnicoIdStorage,
      ordenId: ordenActual.id,
    });
  }

  const fotosFinales = [...fotosConservadas, ...fotosNuevasUrls];

  // Reconstruir tareas_realizadas
  const nuevasTareasRealizadas = reemplazarBloqueTareasRealizadas(ordenActual.tareas_realizadas, {
    descripcionLibre: descripcionLibreParte,
    fotosUrls: fotosFinales,
  });

  // Materiales: si llegan, reemplazamos toda la lista (sin tocar stock de inventario)
  const materialesEntrada = Array.isArray(payload.materiales) ? payload.materiales : null;
  let materialesNormalizados = null;
  if (materialesEntrada) {
    materialesNormalizados = materialesEntrada
      .map((m) => {
        const nombre = String(m?.nombre_material || m?.nombre || '').trim();
        const cantidad = Number.parseInt(m?.cantidad, 10);
        const precio = Number.parseFloat(String(m?.precio_unitario ?? m?.precio ?? 0).replace(',', '.'));
        if (!nombre || !Number.isFinite(cantidad) || cantidad <= 0) {
          return null;
        }
        return {
          orden_id: id,
          nombre_material: nombre,
          cantidad,
          precio_unitario: Number.isFinite(precio) ? Number(precio.toFixed(2)) : 0,
        };
      })
      .filter(Boolean);
  }

  // Update orden
  const updatePayload = {
    descripcion_averia: descripcionAveria,
    tareas_realizadas: nuevasTareasRealizadas,
    foto_url: fotosFinales[0] || null,
  };

  const { error: updateError } = await supabase
    .from('ordenes_trabajo')
    .update(updatePayload)
    .eq('id', id);

  if (updateError) {
    throw new Error(`No se pudo actualizar el parte: ${updateError.message}`);
  }

  // Reemplazar materiales_orden si vinieron
  if (materialesNormalizados) {
    const { error: errorDelete } = await supabase
      .from('materiales_orden')
      .delete()
      .eq('orden_id', id);
    if (errorDelete) {
      throw new Error(`No se pudo limpiar el detalle de materiales anterior: ${errorDelete.message}`);
    }
    if (materialesNormalizados.length > 0) {
      const { error: errorInsert } = await supabase
        .from('materiales_orden')
        .insert(materialesNormalizados);
      if (errorInsert) {
        throw new Error(`No se pudo guardar el nuevo detalle de materiales: ${errorInsert.message}`);
      }
    }

    const normalizarClaveMaterial = (m) => {
      const nombre = String(m?.nombre_material || m?.nombre || m?.nombre_material || '').trim().toLowerCase();
      const cantidad = Number.parseInt(m?.cantidad, 10);
      const precio = Number.parseFloat(String(m?.precio_unitario ?? m?.precio ?? 0).replace(',', '.'));
      if (!nombre || !Number.isFinite(cantidad) || cantidad <= 0) return null;
      const precioNorm = Number.isFinite(precio) ? Number(precio.toFixed(2)) : 0;
      return `${nombre}|${cantidad}|${precioNorm}`;
    };

    const materialesPrevios = Array.isArray(ordenActual.materiales_orden) ? ordenActual.materiales_orden : [];
    const clavesPrevias = materialesPrevios.map(normalizarClaveMaterial).filter(Boolean).sort();
    const clavesNuevas = materialesNormalizados.map(normalizarClaveMaterial).filter(Boolean).sort();
    const materialesHanCambiado = JSON.stringify(clavesPrevias) !== JSON.stringify(clavesNuevas);

    const costeMaterialesNuevoCalc = materialesNormalizados.reduce(
      (acc, m) => acc + Number(m.cantidad) * Number(m.precio_unitario),
      0,
    );
    const costeMaterialesNuevo = Number(costeMaterialesNuevoCalc.toFixed(2));

    if (materialesHanCambiado) {
      const mecanicosIntervinieron = Math.max(1, Math.round(Number(ordenActual.mecanicos_intervinieron || 1)));
      const tarifaManoObraHora = Number(ordenActual.tarifa_mano_obra_hora || 50);
      const horasManoObra = Number(ordenActual.horas_mano_obra || 0);
      const recargoFestivoPct = Number(ordenActual.recargo_festivo_pct || 0);
      const recargoFueraHorarioPct = Number(ordenActual.recargo_fuera_horario_pct || 0);
      const aplicaRecargoFestivo = Boolean(ordenActual.aplica_recargo_festivo);
      const aplicaRecargoFueraHorario = Boolean(ordenActual.aplica_recargo_fuera_horario);
      const porcentajeRecargoManoObra = (aplicaRecargoFestivo ? recargoFestivoPct : 0)
        + (aplicaRecargoFueraHorario ? recargoFueraHorarioPct : 0);
      const costeManoObraBase = Number((tarifaManoObraHora * horasManoObra * mecanicosIntervinieron).toFixed(2));
      const costeManoObraTotal = ordenActual.coste_mano_obra_total != null
        ? Number(ordenActual.coste_mano_obra_total)
        : Number((costeManoObraBase * (1 + (porcentajeRecargoManoObra / 100))).toFixed(2));
      const costeDesplazamientoTotal = Number(ordenActual.coste_desplazamiento_total || 0);
      const costeTotalNuevo = Number((costeMaterialesNuevo + costeManoObraTotal + costeDesplazamientoTotal).toFixed(2));

      const { error: costeError } = await supabase
        .from('ordenes_trabajo')
        .update({
          coste_materiales_editable: costeMaterialesNuevo,
          coste_total: costeTotalNuevo,
        })
        .eq('id', id);
      if (costeError) {
        throw new Error(`No se pudo recalcular el coste de materiales: ${costeError.message}`);
      }
      costeMaterialesEditableRecalculado = costeMaterialesNuevo;
      costeTotalRecalculado = costeTotalNuevo;
    }
  }

  // Regenerar PDF (mantiene la valoración económica actual)
  const materialesParaTexto = materialesNormalizados
    || (Array.isArray(ordenActual.materiales_orden) ? ordenActual.materiales_orden : []);
  const materialesTexto = materialesParaTexto
    .map((m) => {
      const nombre = m.nombre_material || 'Material';
      const cantidad = Number.parseInt(m.cantidad, 10);
      const precio = Number.parseFloat(String(m.precio_unitario ?? 0).replace(',', '.'));
      if (!Number.isFinite(cantidad) || cantidad <= 0) return null;
      return `${nombre};${cantidad};${Number.isFinite(precio) ? precio : 0}`;
    })
    .filter(Boolean)
    .join('\n');

  const fasesParseadas = extraerFasesDesdeTareas(nuevasTareasRealizadas);
  const inicioInterv = ordenActual.intervension_inicio
    || fasesParseadas.intervension?.inicioIso
    || ordenActual.fecha_inicio;

  const desplazamiento = {
    inicioIso: ordenActual.desplazamiento_inicio
      || fasesParseadas.desplazamiento?.inicioIso
      || ordenActual.fecha_inicio,
    finIso: ordenActual.desplazamiento_fin
      || fasesParseadas.desplazamiento?.finIso
      || inicioInterv,
    distanciaMetros: Number.isFinite(Number(ordenActual.km_desplazamiento_facturables))
      ? Math.round(Number(ordenActual.km_desplazamiento_facturables) * 1000)
      : null,
  };

  const intervensionRecuperada = {
    inicioIso: inicioInterv,
    finIso: ordenActual.intervension_fin
      || fasesParseadas.intervension?.finIso
      || ordenActual.fecha_fin,
    pausasComida: fasesParseadas.intervension?.pausasComida || [],
  };
  const secuencialInforme = extraerSecuencialInformeDesdeUrl(ordenActual.informe_pdf_url);

  const mecanicosIntervinieron = Math.max(1, Math.round(Number(ordenActual.mecanicos_intervinieron || 1)));
  const tarifaManoObraHora = Number(ordenActual.tarifa_mano_obra_hora || 50);
  const horasManoObra = Number(ordenActual.horas_mano_obra || 0);
  const recargoFestivoPct = Number(ordenActual.recargo_festivo_pct || 0);
  const recargoFueraHorarioPct = Number(ordenActual.recargo_fuera_horario_pct || 0);
  const aplicaRecargoFestivo = Boolean(ordenActual.aplica_recargo_festivo);
  const aplicaRecargoFueraHorario = Boolean(ordenActual.aplica_recargo_fuera_horario);
  const porcentajeRecargoManoObra = (aplicaRecargoFestivo ? recargoFestivoPct : 0)
    + (aplicaRecargoFueraHorario ? recargoFueraHorarioPct : 0);
  const costeManoObraBase = Number((tarifaManoObraHora * horasManoObra * mecanicosIntervinieron).toFixed(2));
  const costeManoObraTotal = ordenActual.coste_mano_obra_total != null
    ? Number(ordenActual.coste_mano_obra_total)
    : Number((costeManoObraBase * (1 + (porcentajeRecargoManoObra / 100))).toFixed(2));
  const costeDesplazamientoTotal = Number(ordenActual.coste_desplazamiento_total || 0);
  const costeMaterialesEditable = costeMaterialesEditableRecalculado != null
    ? costeMaterialesEditableRecalculado
    : Number(ordenActual.coste_materiales_editable || 0);
  const costeTotal = costeTotalRecalculado != null
    ? costeTotalRecalculado
    : (ordenActual.coste_total != null
      ? Number(ordenActual.coste_total)
      : Number((costeMaterialesEditable + costeManoObraTotal + costeDesplazamientoTotal).toFixed(2)));

  const valoracionEconomica = {
    costeMaterialesEditable,
    tarifaManoObraHora,
    horasManoObra,
    mecanicosIntervinieron,
    recargoFestivoPct,
    recargoFueraHorarioPct,
    aplicaRecargoFestivo,
    aplicaRecargoFueraHorario,
    porcentajeRecargoManoObra,
    costeManoObraBase,
    costeManoObraTotal,
    tarifaDesplazamientoKm: Number(ordenActual.tarifa_desplazamiento_km || 0),
    kmDesplazamientoFacturables: Number(ordenActual.km_desplazamiento_facturables || 0),
    costeDesplazamientoTotal,
    costeTotal,
  };


  const esPem = ['montaje', 'puesta_en_marcha'].includes(ordenActual.tipo_orden || '');
  const informe = await generarYSubirInformeParte({
    parte: {
      id: ordenActual.id,
      tareas_realizadas: nuevasTareasRealizadas || '',
      descripcion_averia: descripcionAveria || null,
      prioridad: ordenActual.prioridad || null,
      ...(esPem ? { pem_data: ordenActual.pem_data || null } : {}),
    },
    formulario: {
      cliente_id: ordenActual.cliente_id,
      tecnico_id: ordenActual.tecnico_id,
      orden_id: ordenActual.id,
      prioridad: ordenActual.prioridad || 'media',
      tiempo_empleado: String(ordenActual.tiempo_empleado_minutos || 0),
      descripcion_problema: descripcionAveria || 'Sin descripción',
      materialesTexto,
    },
    desplazamiento,
    intervension: intervensionRecuperada,
    clienteNombre: ordenActual.clientes?.nombre || 'Cliente no identificado',
    equipoNombre: ordenActual.equipos?.nombre || 'Sin equipo',
    tecnicoNombre: ordenActual.tecnicos?.nombre || 'Tecnico no identificado',
    nombreFirmante: extraerNombreFirmanteDesdeTareas(nuevasTareasRealizadas),
    firmaUrl: ordenActual.firma_url || '',
    fotosIntervencionUrls: fotosFinales,
    secuencialDiario: secuencialInforme || undefined,
    fechaInformeIso: inicioInterv,
    valoracionEconomica,
    prefijoInforme: esPem ? 'PEM' : 'SAT',
    filtroTipoOrden: esPem ? 'pem' : 'averia',
  });

  await guardarInformePdfUrl(id, informe.pdfUrl);

  return {
    pdfUrl: informe.pdfUrl,
    fotosIntervencionUrls: fotosFinales,
    descripcionAveria,
    tareasRealizadas: nuevasTareasRealizadas,
    materiales: materialesNormalizados || ordenActual.materiales_orden || [],
  };
}
