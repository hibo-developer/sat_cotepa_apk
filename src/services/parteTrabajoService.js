import { obtenerClienteSupabase } from './supabaseClient';
import {
  limpiarTexto,
  validarMinutos,
  validarPrioridad,
  validarTextoRequerido,
} from './satValidation';
import { crearOrdenTrabajo } from './workOrderService';

function parsearMateriales(textoMateriales) {
  if (!textoMateriales.trim()) {
    return [];
  }

  return textoMateriales
    .split('\n')
    .map((linea) => linea.trim())
    .filter(Boolean)
    .map((linea, indice) => {
      const [nombre, cantidadRaw, precioRaw] = linea.split(';').map((v) => (v || '').trim());

      if (!nombre) {
        throw new Error(`El material de la línea ${indice + 1} no tiene nombre.`);
      }

      if (cantidadRaw && (!Number.isFinite(Number.parseInt(cantidadRaw, 10)) || Number.parseInt(cantidadRaw, 10) <= 0)) {
        throw new Error(`La cantidad del material en la línea ${indice + 1} debe ser mayor que cero.`);
      }

      if (precioRaw && !Number.isFinite(Number.parseFloat(precioRaw))) {
        throw new Error(`El precio del material en la línea ${indice + 1} no es válido.`);
      }

      const cantidad = cantidadRaw ? Number.parseInt(cantidadRaw, 10) : 1;
      const precio = precioRaw ? Number.parseFloat(precioRaw) : null;

      return {
        nombre_material: nombre,
        cantidad,
        precio_unitario: precio,
      };
    });
}

function formatearCoord(valor) {
  return Number.isFinite(Number(valor)) ? Number(valor).toFixed(5) : 'n/d';
}

function construirResumenGeolocalizacion(seguimientoTiempo) {
  if (!seguimientoTiempo || !seguimientoTiempo.inicioIso) {
    return null;
  }

  const lineas = ['Parte registrado desde movilidad'];
  lineas.push(`Inicio técnico: ${seguimientoTiempo.inicioIso}`);

  if (seguimientoTiempo.finIso) {
    lineas.push(`Fin técnico: ${seguimientoTiempo.finIso}`);
  }

  if (seguimientoTiempo.ubicacionInicio) {
    lineas.push(
      `Geo inicio: ${formatearCoord(seguimientoTiempo.ubicacionInicio.latitud)}, ${formatearCoord(seguimientoTiempo.ubicacionInicio.longitud)}`,
    );

    if (seguimientoTiempo.ubicacionInicio.nombreLugarCompleto || seguimientoTiempo.ubicacionInicio.nombreLugar) {
      lineas.push(
        `Lugar inicio: ${seguimientoTiempo.ubicacionInicio.nombreLugarCompleto || seguimientoTiempo.ubicacionInicio.nombreLugar}`,
      );
    }
  }

  if (seguimientoTiempo.ubicacionFin) {
    lineas.push(
      `Geo fin: ${formatearCoord(seguimientoTiempo.ubicacionFin.latitud)}, ${formatearCoord(seguimientoTiempo.ubicacionFin.longitud)}`,
    );

    if (seguimientoTiempo.ubicacionFin.nombreLugarCompleto || seguimientoTiempo.ubicacionFin.nombreLugar) {
      lineas.push(
        `Lugar fin: ${seguimientoTiempo.ubicacionFin.nombreLugarCompleto || seguimientoTiempo.ubicacionFin.nombreLugar}`,
      );
    }
  }

  if (Number.isFinite(Number(seguimientoTiempo.distanciaMetros))) {
    lineas.push(`Distancia geolocalizada: ${Math.round(Number(seguimientoTiempo.distanciaMetros))} m`);
  }

  if (Number.isFinite(Number(seguimientoTiempo.minutosGeo))) {
    lineas.push(`Tiempo por geolocalización: ${Math.round(Number(seguimientoTiempo.minutosGeo))} minutos`);
  }

  return lineas.join(' | ');
}

function resolverFechaIso(valor, fallback) {
  if (!valor) {
    return fallback;
  }

  const fecha = new Date(valor);
  if (!Number.isFinite(fecha.getTime())) {
    return fallback;
  }

  return fecha.toISOString();
}

function esDataUrlImagen(valor) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(valor || '');
}

async function resolverBlobImagen(fuente) {
  if (fuente instanceof Blob) {
    return fuente;
  }

  if (esDataUrlImagen(fuente)) {
    const respuesta = await fetch(fuente);
    return respuesta.blob();
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

  const { data } = supabase.storage.from('firmas-clientes').getPublicUrl(rutaArchivo);
  return data?.publicUrl || null;
}

async function subirFotosIntervencionStorage(supabase, { fotos, clienteId, tecnicoId, ordenId }) {
  const listaFotos = Array.isArray(fotos) ? fotos : [];
  if (listaFotos.length === 0) {
    return [];
  }

  const urls = [];

  for (let indice = 0; indice < listaFotos.length; indice += 1) {
    const foto = listaFotos[indice];
    let blobFoto;
    try {
      blobFoto = await resolverBlobImagen(foto);
    } catch {
      throw new Error(`No se pudo procesar la foto ${indice + 1} de la intervención.`);
    }

    const extension = blobFoto.type === 'image/jpeg' ? 'jpg' : blobFoto.type === 'image/webp' ? 'webp' : 'png';
    const nombreArchivo = `${Date.now()}-${indice + 1}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    const rutaArchivo = `${clienteId}/${tecnicoId}/${ordenId}/${nombreArchivo}`;

    const { error: errorSubida } = await supabase.storage
      .from('fotos-intervenciones')
      .upload(rutaArchivo, blobFoto, {
        upsert: false,
        contentType: blobFoto.type || 'image/png',
        cacheControl: '3600',
      });

    if (errorSubida) {
      throw new Error(`No se pudo subir la foto ${indice + 1} de la intervención: ${errorSubida.message}`);
    }

    const { data } = supabase.storage.from('fotos-intervenciones').getPublicUrl(rutaArchivo);
    if (data?.publicUrl) {
      urls.push(data.publicUrl);
    }
  }

  return urls;
}

export async function obtenerOrdenesAbiertasParaParte(filtros = {}) {
  const supabase = obtenerClienteSupabase();
  const clienteId = limpiarTexto(filtros.cliente_id);
  const tecnicoId = limpiarTexto(filtros.tecnico_id);

  let consulta = supabase
    .from('ordenes_trabajo')
    .select('id, numero_ticket, cliente_id, equipo_id, tecnico_id, descripcion_averia, estado, prioridad, fecha_inicio')
    .in('estado', ['pendiente', 'en_proceso', 'pausado'])
    .order('fecha_inicio', { ascending: false });

  if (clienteId) {
    consulta = consulta.eq('cliente_id', clienteId);
  }

  if (tecnicoId) {
    consulta = consulta.eq('tecnico_id', tecnicoId);
  }

  const { data, error } = await consulta;

  if (error) {
    throw new Error(`No se pudieron obtener las ordenes abiertas para el parte: ${error.message}`);
  }

  return data || [];
}

export async function crearParteTrabajo(payload) {
  const supabase = obtenerClienteSupabase();
  const ordenIdEntrada = limpiarTexto(payload.orden_id);
  let ordenIdTrabajo = ordenIdEntrada;
  const clienteId = limpiarTexto(payload.cliente_id);
  const equipoId = limpiarTexto(payload.equipo_id) || null;
  const tecnicoId = limpiarTexto(payload.tecnico_id);
  const descripcionProblema = validarTextoRequerido(payload.descripcion_problema, 'La descripción del problema', 8);
  const nombreFirmante = validarTextoRequerido(payload.nombre_firmante, 'El nombre de la persona firmante', 3);
  const prioridad = validarPrioridad(payload.prioridad || 'media');
  const materialesManual = parsearMateriales(payload.materialesTexto || '');
  const materialesInventarioEntrada = Array.isArray(payload.materialesInventario) ? payload.materialesInventario : [];
  const tiempoEmpleadoMinutos = validarMinutos(payload.tiempo_empleado);
  const resumenGeo = construirResumenGeolocalizacion(payload.seguimientoTiempo);
  const firmaEntrada = limpiarTexto(payload.firma_url);
  const fotosIntervencionEntrada = Array.isArray(payload.fotos_intervencion) ? payload.fotos_intervencion : [];
  const ahoraIso = new Date().toISOString();
  const fechaInicio = resolverFechaIso(payload.seguimientoTiempo?.inicioIso, ahoraIso);
  const fechaFin = resolverFechaIso(payload.seguimientoTiempo?.finIso, ahoraIso);

  if (!clienteId) {
    throw new Error('Debes seleccionar un cliente para registrar el parte.');
  }

  if (!tecnicoId) {
    throw new Error('Debes asignar un técnico para registrar el parte.');
  }

  if (!firmaEntrada) {
    throw new Error('La firma del cliente es obligatoria para registrar el parte.');
  }

  const [clienteRsp, tecnicoRsp, equipoRsp] = await Promise.all([
    supabase.from('clientes').select('id').eq('id', clienteId).maybeSingle(),
    supabase.from('tecnicos').select('id, activo').eq('id', tecnicoId).maybeSingle(),
    equipoId
      ? supabase.from('equipos').select('id, cliente_id').eq('id', equipoId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (clienteRsp.error) {
    throw new Error(`No se pudo validar el cliente del parte: ${clienteRsp.error.message}`);
  }

  if (!clienteRsp.data) {
    throw new Error('El cliente seleccionado para el parte no existe.');
  }

  if (tecnicoRsp.error) {
    throw new Error(`No se pudo validar el técnico del parte: ${tecnicoRsp.error.message}`);
  }

  if (!tecnicoRsp.data) {
    throw new Error('El técnico seleccionado para el parte no existe.');
  }

  if (!tecnicoRsp.data.activo) {
    throw new Error('El técnico seleccionado está inactivo.');
  }

  if (equipoRsp.error) {
    throw new Error(`No se pudo validar el equipo del parte: ${equipoRsp.error.message}`);
  }

  if (equipoId && !equipoRsp.data) {
    throw new Error('El equipo seleccionado para el parte no existe.');
  }

  if (equipoRsp.data && equipoRsp.data.cliente_id !== clienteId) {
    throw new Error('El equipo seleccionado no pertenece al cliente del parte.');
  }

  if (ordenIdEntrada) {
    const { data: ordenActual, error: ordenActualError } = await supabase
      .from('ordenes_trabajo')
      .select('id, cliente_id, equipo_id, tecnico_id, estado')
      .eq('id', ordenIdEntrada)
      .maybeSingle();

    if (ordenActualError) {
      throw new Error(`No se pudo validar la orden seleccionada: ${ordenActualError.message}`);
    }

    if (!ordenActual) {
      throw new Error('La orden seleccionada no existe.');
    }

    if (ordenActual.estado === 'finalizado') {
      throw new Error('La orden seleccionada ya esta finalizada. El parte debe registrarse sobre una orden abierta.');
    }

    if (ordenActual.cliente_id !== clienteId) {
      throw new Error('La orden seleccionada no pertenece al cliente del parte.');
    }

    if (ordenActual.tecnico_id !== tecnicoId) {
      throw new Error('La orden seleccionada no esta asignada al tecnico elegido.');
    }

    if ((ordenActual.equipo_id || null) !== equipoId) {
      throw new Error('El equipo del parte no coincide con el equipo de la orden seleccionada.');
    }
  } else {
    const ordenImprevista = await crearOrdenTrabajo({
      cliente_id: clienteId,
      equipo_id: equipoId,
      tecnico_id: tecnicoId,
      descripcion_averia: descripcionProblema,
      prioridad,
      estado: 'pendiente',
      fecha_inicio: fechaInicio,
    });

    ordenIdTrabajo = ordenImprevista.id;
  }

  const materialesInventarioNormalizados = materialesInventarioEntrada.map((item, indice) => {
    const materialId = limpiarTexto(item.material_id);
    const cantidad = Number.parseInt(item.cantidad, 10);

    if (!materialId) {
      throw new Error(`El material de inventario en la posicion ${indice + 1} no es valido.`);
    }

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new Error(`La cantidad del material de inventario en la posicion ${indice + 1} debe ser mayor que cero.`);
    }

    return {
      material_id: materialId,
      cantidad,
    };
  });

  const cantidadesPorMaterial = materialesInventarioNormalizados.reduce((acc, item) => {
    acc.set(item.material_id, (acc.get(item.material_id) || 0) + item.cantidad);
    return acc;
  }, new Map());

  const inventarioIds = [...cantidadesPorMaterial.keys()];
  let inventarioMap = new Map();

  if (inventarioIds.length > 0) {
    const { data: inventarioData, error: inventarioError } = await supabase
      .from('inventario_materiales')
      .select('id, nombre, precio_ref, stock_actual, activo')
      .in('id', inventarioIds);

    if (inventarioError) {
      throw new Error(`No se pudo validar el inventario de materiales: ${inventarioError.message}`);
    }

    inventarioMap = new Map((inventarioData || []).map((item) => [item.id, item]));

    inventarioIds.forEach((materialId) => {
      const cantidadTotal = cantidadesPorMaterial.get(materialId) || 0;
      const materialDb = inventarioMap.get(materialId);
      if (!materialDb) {
        throw new Error('Uno de los materiales seleccionados ya no existe en inventario.');
      }

      if (!materialDb.activo) {
        throw new Error(`El material ${materialDb.nombre} esta inactivo en inventario.`);
      }

      if (Number(materialDb.stock_actual) < cantidadTotal) {
        throw new Error(`Stock insuficiente para ${materialDb.nombre}. Disponible: ${materialDb.stock_actual}.`);
      }
    });
  }

  const firmaUrl = await subirFirmaClienteStorage(supabase, {
    firmaDataUrl: firmaEntrada,
    clienteId,
    tecnicoId,
  });

  if (!firmaUrl) {
    throw new Error('No se pudo obtener la URL pública de la firma del cliente.');
  }

  const fotosIntervencionUrls = await subirFotosIntervencionStorage(supabase, {
    fotos: fotosIntervencionEntrada,
    clienteId,
    tecnicoId,
    ordenId: ordenIdTrabajo,
  });

  const bloquesTareas = [resumenGeo || 'Parte registrado desde movilidad'];
  bloquesTareas.push(`Firmado por: ${nombreFirmante}`);
  if (fotosIntervencionUrls.length > 0) {
    bloquesTareas.push(`Fotos intervención: ${fotosIntervencionUrls.join(' | ')}`);
  }

  const ordenPayload = {
    descripcion_averia: descripcionProblema,
    tareas_realizadas: bloquesTareas.join(' | '),
    tiempo_empleado_minutos: tiempoEmpleadoMinutos,
    estado: 'finalizado',
    prioridad,
    foto_url: fotosIntervencionUrls[0] || null,
    firma_url: firmaUrl,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
  };

  const { data: orden, error: errorOrden } = await supabase
    .from('ordenes_trabajo')
    .update(ordenPayload)
    .eq('id', ordenIdTrabajo)
    .select()
    .single();

  if (errorOrden) {
    throw new Error(`No se pudo registrar el parte de trabajo: ${errorOrden.message}`);
  }

  const { error: limpiarMaterialesError } = await supabase
    .from('materiales_orden')
    .delete()
    .eq('orden_id', orden.id);

  if (limpiarMaterialesError) {
    throw new Error(`No se pudo preparar el detalle de materiales del parte: ${limpiarMaterialesError.message}`);
  }

  for (const [materialId, cantidadTotal] of cantidadesPorMaterial.entries()) {
    const materialDb = inventarioMap.get(materialId);
    const { error: descontarError } = await supabase
      .from('inventario_materiales')
      .update({ stock_actual: (materialDb?.stock_actual || 0) - cantidadTotal })
      .eq('id', materialId)
      .gte('stock_actual', cantidadTotal);

    if (descontarError) {
      throw new Error(`No se pudo descontar stock de inventario: ${descontarError.message}`);
    }
  }

  const materialesInventario = materialesInventarioNormalizados.map((materialUso) => {
    const materialDb = inventarioMap.get(materialUso.material_id);
    return {
      orden_id: orden.id,
      material_id: materialUso.material_id,
      nombre_material: materialDb?.nombre || 'Material inventario',
      cantidad: materialUso.cantidad,
      precio_unitario: materialDb?.precio_ref ?? null,
    };
  });

  const materiales = [...materialesInventario, ...materialesManual];

  if (materiales.length > 0) {
    const payloadMateriales = materiales.map((material) => ({
      orden_id: orden.id,
      ...material,
    }));

    const { error: errorMateriales } = await supabase.from('materiales_orden').insert(payloadMateriales);

    if (errorMateriales) {
      throw new Error(`El parte se creó, pero falló el guardado de materiales: ${errorMateriales.message}`);
    }
  }

  return {
    ...orden,
    nombre_firmante: nombreFirmante,
    fotos_intervencion_urls: fotosIntervencionUrls,
  };
}
