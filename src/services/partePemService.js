import { obtenerClienteSupabase } from './supabaseClient';
import { limpiarTexto, validarTextoRequerido } from './satValidation';
import { crearOrdenTrabajo } from './workOrderService';
import { subirFotosIntervencionStorage } from './parteTrabajoService';
import { generarYSubirInformeParte } from './parteTrabajoInformeService';

const TEXTO_ACEPTACION_CLIENTE = `Aceptación por parte del cliente:
En el día de la fecha de hoy se ha finalizado el montaje y se ha realizado con éxito positivo la puesta en marcha sobre la instalación del equipo asignado.
Verifica que ésta corresponde en cuanto a características técnicas y constructivas a lo pedido.
Además, declara:
- Haber predispuesto las obras de construcción y los locales de colocación de la instalación, así como las conexiones con las redes de suministro con arreglo a la normativa vigente para la prevención de incendios, de accidentes y de contaminación.
- Haber instalado el interruptor magnetotérmico diferencial con poder de ruptura tal de respetar las características de la instalación y haber predispuesto la instalación de puesta a tierra.
- Haber obtenido el visto bueno de las autoridades competentes para la instalación del equipo entregado.
- Haber recibido el Manual de Uso y mantenimiento del equipo entregado.
- Estar al tanto de los procedimientos de seguridad.
- Haber recibido las instrucciones para el correcto funcionamiento, mantenimiento, utilización, límites y prestaciones de la instalación.
- Haber asistido a los controles de funcionalidad.
Se compromete, por último, a atenerse a las instrucciones contenidas en el manual relativas al uso y mantenimiento de la instalación.`;

function esDataUrlImagen(valor) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(valor || '');
}

function blobDesdeDataUrlImagen(dataUrl) {
  const raw = String(dataUrl || '');
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(raw);
  if (!match) {
    throw new Error('Data URL inválida.');
  }
  const mime = match[1] || 'image/png';
  const base64 = match[2] || '';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

async function resolverBlobImagen(fuente) {
  if (fuente instanceof Blob) {
    return fuente;
  }
  if (esDataUrlImagen(fuente)) {
    return blobDesdeDataUrlImagen(fuente);
  }
  throw new Error('Formato de imagen no válido para subir a Storage.');
}

async function subirFirmaClienteStorage(supabase, { firmaDataUrl, clienteId, tecnicoId }) {
  if (!esDataUrlImagen(firmaDataUrl)) {
    return firmaDataUrl;
  }

  let blobFirma;
  try {
    blobFirma = await resolverBlobImagen(firmaDataUrl);
  } catch {
    throw new Error('No se pudo procesar la firma del cliente para subirla a Storage.');
  }

  const extension = blobFirma.type === 'image/jpeg' ? 'jpg' : 'png';
  const nombreArchivo = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const rutaArchivo = `${clienteId}/${tecnicoId}/${nombreArchivo}`;

  const { error: errorSubida } = await supabase.storage
    .from('firmas-clientes')
    .upload(rutaArchivo, blobFirma, {
      upsert: false,
      contentType: blobFirma.type || 'image/png',
      cacheControl: '3600',
    });

  if (errorSubida) {
    throw new Error(
      `No se pudo subir la firma del cliente a Storage. Verifica bucket/policies de firmas-clientes. (${errorSubida.message})`,
    );
  }

  return `sb://firmas-clientes/${rutaArchivo}`;
}

function normalizarTipoOrden(valor) {
  const tipo = limpiarTexto(valor);
  if (tipo === 'montaje') return 'montaje';
  if (tipo === 'puesta_en_marcha') return 'puesta_en_marcha';
  if (tipo === 'puesta en marcha') return 'puesta_en_marcha';
  return '';
}

function calcularMinutos(inicioIso, finIso) {
  const inicio = inicioIso ? new Date(inicioIso).getTime() : NaN;
  const fin = finIso ? new Date(finIso).getTime() : NaN;
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) return null;
  return Math.max(1, Math.ceil((fin - inicio) / 60000));
}

function construirEtiquetaEquipo(equipo) {
  if (!equipo) return 'Sin equipo';
  const piezas = [equipo.nombre, equipo.marca, equipo.modelo].filter(Boolean);
  return piezas.length ? piezas.join(' ') : 'Sin equipo';
}

export async function obtenerOrdenesAbiertasParaPartePem(filtros = {}) {
  const supabase = obtenerClienteSupabase();
  const clienteId = limpiarTexto(filtros.cliente_id);
  const tecnicoId = limpiarTexto(filtros.tecnico_id);

  let consulta = supabase
    .from('ordenes_trabajo')
    .select('id, numero_ticket, cliente_id, equipo_id, tecnico_id, descripcion_averia, estado, prioridad, fecha_inicio, tipo_orden')
    .in('estado', ['pendiente', 'en_proceso', 'pausado'])
    .in('tipo_orden', ['montaje', 'puesta_en_marcha'])
    .order('fecha_inicio', { ascending: false });

  if (clienteId) {
    consulta = consulta.eq('cliente_id', clienteId);
  }

  if (tecnicoId) {
    consulta = consulta.eq('tecnico_id', tecnicoId);
  }

  const { data, error } = await consulta;
  if (error) {
    throw new Error(`No se pudieron obtener las ordenes abiertas para el parte PEM: ${error.message}`);
  }
  return data || [];
}

export async function crearPartePem(payload) {
  const supabase = obtenerClienteSupabase();
  const ordenIdEntrada = limpiarTexto(payload.orden_id);
  let ordenIdTrabajo = ordenIdEntrada;
  const clienteId = limpiarTexto(payload.cliente_id);
  const tecnicoId = limpiarTexto(payload.tecnico_id);
  const equipoId = limpiarTexto(payload.equipo_id) || null;
  const matricula = validarTextoRequerido(payload.equipo_matricula, 'La matrícula del equipo', 2);
  const tipoOrden = normalizarTipoOrden(payload.tipo_orden || payload.tipo_operacion);
  const fechaInstalacion = limpiarTexto(payload.fecha_instalacion);
  const nombreFirmante = validarTextoRequerido(payload.nombre_firmante, 'El nombre de la persona firmante', 3);
  const firmaEntrada = limpiarTexto(payload.firma_url);
  const notasTecnico = String(payload.notas_tecnico || '').trim();
  const notasCliente = String(payload.notas_cliente || '').trim();
  const checks = payload.checks && typeof payload.checks === 'object' ? payload.checks : {};
  const intervension = payload.intervension && typeof payload.intervension === 'object' ? payload.intervension : {};
  const fotosIntervencionEntrada = Array.isArray(payload.fotos_intervencion) ? payload.fotos_intervencion : [];

  if (!clienteId) {
    throw new Error('Debes seleccionar un cliente para registrar el parte PEM.');
  }

  if (!tecnicoId) {
    throw new Error('Debes asignar un técnico para registrar el parte PEM.');
  }

  if (!equipoId) {
    throw new Error('Debes seleccionar el equipo a intervenir.');
  }

  if (!tipoOrden) {
    throw new Error('Debes seleccionar el tipo de operación (montaje o puesta en marcha).');
  }

  if (!fechaInstalacion) {
    throw new Error('La fecha de instalación es obligatoria. Pulsa Inicio de intervención para autocompletarla.');
  }

  if (!firmaEntrada) {
    throw new Error('La firma del cliente es obligatoria para registrar el parte PEM.');
  }

  const obligatorias = [
    'verificacion_suministros',
    'verificacion_funcionamiento',
    'verificacion_seguridades',
    'instrucciones_funcionamiento',
    'instrucciones_mantenimiento',
  ];
  const valoresValidos = new Set(['si', 'no', 'na']);
  for (const clave of obligatorias) {
    const valor = String(checks[clave] || '').toLowerCase();
    if (!valoresValidos.has(valor)) {
      throw new Error('Debes completar todas las comprobaciones obligatorias (Sí/No/N/A).');
    }
  }

  let descripcionOrden = '';
  if (!ordenIdEntrada) {
    const etiquetaTipo = tipoOrden === 'montaje' ? 'PEM · Montaje' : 'PEM · Puesta en marcha';
    descripcionOrden = String(payload.descripcion_orden || payload.descripcion_averia || etiquetaTipo).trim() || etiquetaTipo;
    const ordenNueva = await crearOrdenTrabajo({
      cliente_id: clienteId,
      equipo_id: equipoId,
      tecnico_id: tecnicoId,
      descripcion_averia: descripcionOrden,
      prioridad: payload.prioridad || 'media',
      estado: 'pendiente',
      tipo_orden: tipoOrden,
      fecha_inicio: new Date().toISOString(),
    });
    ordenIdTrabajo = ordenNueva.id;
  } else {
    const { data: ordenActual, error } = await supabase
      .from('ordenes_trabajo')
      .select('id, cliente_id, tecnico_id, equipo_id, estado, tipo_orden')
      .eq('id', ordenIdEntrada)
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo validar la orden para el parte PEM: ${error.message}`);
    }

    if (!ordenActual) {
      throw new Error('La orden seleccionada ya no existe.');
    }

    if (ordenActual.estado === 'finalizado') {
      throw new Error('La orden seleccionada ya está finalizada.');
    }

    if ((ordenActual.cliente_id || null) !== clienteId) {
      throw new Error('La orden seleccionada no pertenece al cliente del parte.');
    }

    if ((ordenActual.tecnico_id || null) !== tecnicoId) {
      throw new Error('La orden seleccionada no está asignada al técnico elegido.');
    }

    if ((ordenActual.equipo_id || null) !== equipoId) {
      throw new Error('El equipo del parte no coincide con el equipo de la orden seleccionada.');
    }

    if (!['montaje', 'puesta_en_marcha'].includes(ordenActual.tipo_orden || '')) {
      throw new Error('La orden seleccionada no es de tipo PEM.');
    }
  }

  const { data: contextoOrden, error: errorContextoOrden } = await supabase
    .from('ordenes_trabajo')
    .select('id, descripcion_averia, prioridad, clientes ( nombre ), equipos ( nombre, marca, modelo ), tecnicos ( nombre )')
    .eq('id', ordenIdTrabajo)
    .single();

  if (errorContextoOrden) {
    throw new Error(`No se pudo cargar la orden para el informe PEM: ${errorContextoOrden.message}`);
  }

  const [fotosIntervencionUrls, firmaUrl] = await Promise.all([
    subirFotosIntervencionStorage(supabase, {
      fotos: fotosIntervencionEntrada,
      clienteId,
      tecnicoId,
      ordenId: ordenIdTrabajo,
    }),
    subirFirmaClienteStorage(supabase, { firmaDataUrl: firmaEntrada, clienteId, tecnicoId }),
  ]);

  const pemData = {
    tipo_operacion: tipoOrden,
    equipo_matricula: matricula,
    aceptacion_texto: TEXTO_ACEPTACION_CLIENTE,
    notas_tecnico: notasTecnico || null,
    notas_cliente: notasCliente || null,
    checks: {
      verificacion_suministros: String(checks.verificacion_suministros).toLowerCase(),
      verificacion_funcionamiento: String(checks.verificacion_funcionamiento).toLowerCase(),
      verificacion_seguridades: String(checks.verificacion_seguridades).toLowerCase(),
      instrucciones_funcionamiento: String(checks.instrucciones_funcionamiento).toLowerCase(),
      instrucciones_mantenimiento: String(checks.instrucciones_mantenimiento).toLowerCase(),
    },
    intervension: {
      inicioIso: intervension.inicioIso || null,
      finIso: intervension.finIso || null,
    },
    firma: {
      nombre: nombreFirmante,
      firma_url: firmaUrl,
    },
    fotos_intervencion_urls: fotosIntervencionUrls,
  };

  const lineas = [];
  lineas.push('Parte PEM (Puesta en Marcha y Montajes)');
  lineas.push(`Operación: ${tipoOrden === 'montaje' ? 'montaje' : 'puesta en marcha'}`);
  lineas.push(`Matrícula equipo: ${matricula}`);
  lineas.push(`Fecha instalación: ${fechaInstalacion}`);
  lineas.push(`Verificación suministros: ${pemData.checks.verificacion_suministros.toUpperCase()}`);
  lineas.push(`Verificación funcionamiento: ${pemData.checks.verificacion_funcionamiento.toUpperCase()}`);
  lineas.push(`Verificación seguridades: ${pemData.checks.verificacion_seguridades.toUpperCase()}`);
  lineas.push(`Instrucciones funcionamiento: ${pemData.checks.instrucciones_funcionamiento.toUpperCase()}`);
  lineas.push(`Instrucciones mantenimiento: ${pemData.checks.instrucciones_mantenimiento.toUpperCase()}`);
  if (notasTecnico) {
    lineas.push(`Notas técnico: ${notasTecnico}`);
  }
  if (notasCliente) {
    lineas.push(`Notas cliente: ${notasCliente}`);
  }
  if (fotosIntervencionUrls.length) {
    lineas.push(`Fotos intervención: ${fotosIntervencionUrls.join(' | ')}`);
  }
  lineas.push('Aceptación cliente: incluida');
  lineas.push(`Firmante: ${nombreFirmante}`);

  const minutos = calcularMinutos(intervension.inicioIso, intervension.finIso);
  const descripcionInforme = contextoOrden?.descripcion_averia || descripcionOrden || (tipoOrden === 'montaje' ? 'PEM · Montaje' : 'PEM · Puesta en marcha');

  const informe = await generarYSubirInformeParte({
    parte: {
      id: ordenIdTrabajo,
      tareas_realizadas: lineas.join(' | '),
      descripcion_averia: descripcionInforme,
      prioridad: contextoOrden?.prioridad || payload.prioridad || 'media',
    },
    formulario: {
      cliente_id: clienteId,
      tecnico_id: tecnicoId,
      orden_id: ordenIdTrabajo,
      prioridad: contextoOrden?.prioridad || payload.prioridad || 'media',
      tiempo_empleado: String(minutos || 0),
      descripcion_problema: descripcionInforme,
      materialesTexto: '',
    },
    seguimientoTiempo: null,
    desplazamiento: null,
    intervension: {
      inicioIso: intervension.inicioIso || null,
      finIso: intervension.finIso || null,
      pausasComida: [],
    },
    clienteNombre: contextoOrden?.clientes?.nombre || 'Cliente no identificado',
    equipoNombre: construirEtiquetaEquipo(contextoOrden?.equipos),
    tecnicoNombre: contextoOrden?.tecnicos?.nombre || 'Tecnico no identificado',
    nombreFirmante,
    firmaUrl,
    fotosIntervencionUrls,
    fechaInformeIso: intervension.inicioIso || undefined,
    prefijoInforme: 'PEM',
    filtroTipoOrden: 'pem',
  });

  const actualizacion = {
    estado: 'finalizado',
    tareas_realizadas: lineas.join(' | '),
    firma_url: firmaUrl,
    informe_pdf_url: informe?.pdfUrl || null,
    fecha_fin: new Date().toISOString(),
    fecha_instalacion: fechaInstalacion,
    pem_data: pemData,
    tiempo_empleado_minutos: minutos ?? null,
  };

  const { data: ordenFinal, error: errorUpdate } = await supabase
    .from('ordenes_trabajo')
    .update(actualizacion)
    .eq('id', ordenIdTrabajo)
    .select()
    .single();

  if (errorUpdate) {
    throw new Error(`No se pudo guardar el parte PEM: ${errorUpdate.message}`);
  }

  return {
    ...ordenFinal,
    nombre_firmante: nombreFirmante,
    fotos_intervencion_urls: fotosIntervencionUrls,
    informe_pdf_url: informe?.pdfUrl || ordenFinal?.informe_pdf_url || '',
    informe_nombre: informe?.nombreArchivo || '',
  };
}
