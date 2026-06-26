/**
 * storageSat.ts
 * Servicio centralizado de almacenamiento para SAT COTEPA.
 * Gestiona la subida, listado y URLs públicas de archivos asociados a partes.
 */

import { obtenerClienteSupabase, obtenerUrlFirmadaStorage } from './supabaseClient';

export type TipoArchivoSAT =
  | 'foto-evidencia'
  | 'audio-cliente'
  | 'firma-cliente'
  | 'pdf-parte';

export interface ArchivoParte {
  id: string;
  parte_id: string;
  ot_numero: string;
  tipo: TipoArchivoSAT;
  path: string;
  bucket: string;
  created_at: string;
}

const BUCKET_FOTOS = 'fotos-intervenciones';
const BUCKET_FIRMAS = 'firmas-clientes';
const BUCKET_INFORMES = 'informes-partes';
const BUCKET_AUDIOS = 'audios-clientes';

const BUCKET_POR_TIPO: Record<TipoArchivoSAT, string> = {
  'foto-evidencia': BUCKET_FOTOS,
  'audio-cliente': BUCKET_AUDIOS,
  'firma-cliente': BUCKET_FIRMAS,
  'pdf-parte': BUCKET_INFORMES,
};

function esDataUrlImagen(valor: unknown): boolean {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(String(valor || ''));
}

function esDataUrlAudio(valor: unknown): boolean {
  return /^data:audio\/[a-zA-Z0-9.+-]+;base64,/.test(String(valor || ''));
}

function esDataUrlPdf(valor: unknown): boolean {
  return /^data:application\/pdf;base64,/.test(String(valor || ''));
}

async function dataUrlABlob(dataUrl: string): Promise<Blob> {
  const raw = String(dataUrl || '');
  const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(raw);
  if (!match) {
    throw new Error('Data URL inválido.');
  }
  const mime = match[1] || 'application/octet-stream';
  const base64 = match[2] || '';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function construirRutaArchivo(params: {
  otNumero: string;
  parteId: string;
  tipo: TipoArchivoSAT;
  indice: number;
  timestamp: number;
  extension: string;
}): string {
  const { otNumero, parteId, tipo, indice, timestamp, extension } = params;
  const fecha = new Date(timestamp);
  const yyyy = String(fecha.getFullYear());
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const nombreBase = `${tipo}-${indice}_${timestamp}.${extension}`;
  return `${yyyy}/${mm}/SAT-${otNumero}/parte-${parteId}/${nombreBase}`;
}

/**
 * Sube un archivo al bucket correspondiente y registra en archivos_parte.
 * @param archivo - Blob, File o Data URL del archivo.
 * @param params - Parámetros de contexto (otNumero, parteId, tipo, indice).
 * @returns Objeto con path, bucket y registro insertado.
 */
export async function subirArchivoSAT(
  archivo: Blob | File | string,
  params: {
    otNumero: string;
    parteId: string;
    tipo: TipoArchivoSAT;
    indice?: number;
  },
): Promise<{ path: string; bucket: string; registro: ArchivoParte }> {
  const supabase = obtenerClienteSupabase();
  const { otNumero, parteId, tipo } = params;
  const indice = params.indice ?? 0;
  const timestamp = Date.now();

  if (!otNumero || !parteId) {
    throw new Error('otNumero y parteId son obligatorios para subir archivo SAT.');
  }

  let blob: Blob;
  let extension = 'bin';

  if (archivo instanceof Blob) {
    blob = archivo;
    if (archivo instanceof File && archivo.name) {
      const partes = archivo.name.split('.');
      extension = partes.length > 1 ? partes.pop()!.toLowerCase() : 'bin';
    } else if (blob.type) {
      extension = blob.type.split('/')[1] || 'bin';
    }
  } else if (typeof archivo === 'string') {
    if (esDataUrlImagen(archivo)) {
      blob = await dataUrlABlob(archivo);
      extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1] || 'png';
    } else if (esDataUrlAudio(archivo)) {
      blob = await dataUrlABlob(archivo);
      extension = blob.type.split('/')[1] || 'webm';
    } else if (esDataUrlPdf(archivo)) {
      blob = await dataUrlABlob(archivo);
      extension = 'pdf';
    } else {
      throw new Error('Formato de archivo no soportado para subir a Storage.');
    }
  } else {
    throw new Error('Tipo de archivo no válido.');
  }

  const bucket = BUCKET_POR_TIPO[tipo];
  const path = construirRutaArchivo({
    otNumero,
    parteId,
    tipo,
    indice,
    timestamp,
    extension,
  });

  const { error: errorSubida } = await supabase.storage
    .from(bucket)
    .upload(path, blob, {
      upsert: false,
      contentType: blob.type || 'application/octet-stream',
      cacheControl: '3600',
    });

  if (errorSubida) {
    throw new Error(`No se pudo subir el archivo a Storage: ${errorSubida.message}`);
  }

  const { data: registro, error: errorInsert } = await supabase
    .from('archivos_parte')
    .insert({
      parte_id: parteId,
      ot_numero: otNumero,
      tipo,
      path,
      bucket,
    })
    .select()
    .single();

  if (errorInsert || !registro) {
    throw new Error(`No se pudo registrar el archivo en la tabla: ${errorInsert?.message}`);
  }

  return { path, bucket, registro };
}

/**
 * Lista todos los archivos asociados a un parte.
 * @param parteId - ID del parte.
 * @returns Array de registros de archivos.
 */
export async function listarArchivosParte(parteId: string): Promise<ArchivoParte[]> {
  const supabase = obtenerClienteSupabase();
  if (!parteId) {
    return [];
  }

  const { data, error } = await supabase
    .from('archivos_parte')
    .select('*')
    .eq('parte_id', parteId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`No se pudieron listar los archivos: ${error.message}`);
  }

  return data || [];
}

/**
 * Obtiene una URL pública firmada para un archivo.
 * @param path - Ruta del archivo en Storage.
 * @param bucket - Bucket donde reside el archivo (opcional, se infiere si es path completo).
 * @param expiresIn - Segundos de validez de la URL (por defecto 3600).
 * @returns URL firmada o cadena vacía si no se puede generar.
 */
export async function getUrlPublica(
  path: string,
  bucket?: string,
  expiresIn: number = 3600,
): Promise<string> {
  if (!path) {
    return '';
  }

  let ruta = path;
  let bucketFinal = bucket;

  if (path.startsWith('sb://')) {
    const sinPrefijo = path.slice(5);
    const partes = sinPrefijo.split('/');
    bucketFinal = partes[0];
    ruta = partes.slice(1).join('/');
  }

  if (!bucketFinal) {
    throw new Error('No se puede determinar el bucket para el archivo.');
  }

  return obtenerUrlFirmadaStorage(`sb://${bucketFinal}/${ruta}`, { expiresIn });
}

export { BUCKET_FOTOS, BUCKET_FIRMAS, BUCKET_INFORMES, BUCKET_AUDIOS };
