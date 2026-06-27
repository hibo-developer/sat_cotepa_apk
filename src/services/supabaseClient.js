import { createClient } from '@supabase/supabase-js';
import { authStorageSupabase } from './supabaseStorage';

const runtimeConfig =
  typeof window !== 'undefined' && window.__APP_CONFIG__ ? window.__APP_CONFIG__ : null;
const supabaseUrl = runtimeConfig?.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = runtimeConfig?.SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const cacheSignedUrls = new Map();
const bucketsPrivadosStorage = new Set([
  'informes-partes',
  'fotos-intervenciones',
  'firmas-clientes',
  'audios-clientes',
]);

function debeOmitirCacheUrlFirmada(bucket, opciones = {}) {
  return Boolean(opciones.forceRefresh || bucket === 'informes-partes');
}

function anadirCacheBust(urlTexto) {
  try {
    const url = new URL(urlTexto);
    url.searchParams.set('_ts', String(Date.now()));
    return url.toString();
  } catch {
    return urlTexto;
  }
}

function normalizarUrlFirmadaStorage(urlTexto) {
  const texto = String(urlTexto || '').trim();
  if (!texto) return '';
  if (texto.startsWith('http://') || texto.startsWith('https://')) return texto;
  if (texto.startsWith('/') && supabaseUrl) {
    try {
      return new URL(texto, supabaseUrl).toString();
    } catch {
      return '';
    }
  }
  return texto;
}

function esUrlHttpValida(urlTexto) {
  try {
    const url = new URL(String(urlTexto || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function esUrlFirmadaStorageValida(urlTexto, bucket) {
  if (!esUrlHttpValida(urlTexto)) {
    return false;
  }

  try {
    const url = new URL(String(urlTexto || '').trim());
    const pathname = url.pathname || '';
    const pareceRutaStorage = pathname.includes('/storage/v1/object/');

    if (!pareceRutaStorage) {
      return true;
    }

    const esRutaFirmada = pathname.includes('/storage/v1/object/sign/');
    const tieneToken = url.searchParams.has('token');
    const bucketPrivado = bucketsPrivadosStorage.has(bucket);

    if (bucketPrivado && !esRutaFirmada && !tieneToken) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function obtenerUrlFirmadaDirectaStorage(supabaseClient, ref, expiresIn) {
  try {
    const { data, error } = await supabaseClient.storage
      .from(ref.bucket)
      .createSignedUrl(ref.path, expiresIn);

    if (error || !data?.signedUrl) {
      return '';
    }

    const urlNormalizada = normalizarUrlFirmadaStorage(data.signedUrl);
    return esUrlFirmadaStorageValida(urlNormalizada, ref.bucket) ? urlNormalizada : '';
  } catch {
    return '';
  }
}

// Cliente de Supabase centralizado para usar en servicios del dominio.
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: authStorageSupabase,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
    : null;

export function tieneConfiguracionSupabase() {
  return Boolean(supabase);
}

export function obtenerClienteSupabase() {
  if (!supabase) {
    throw new Error(
      'Falta configurar Supabase. Revisa app-config.js (hosting) o VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY en tu archivo .env'
    );
  }

  return supabase;
}

export function parsearReferenciaStorage(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return null;

  if (texto.startsWith('sb://')) {
    const resto = texto.slice('sb://'.length);
    const separador = resto.indexOf('/');
    if (separador <= 0) return null;
    const bucket = resto.slice(0, separador);
    const path = resto.slice(separador + 1);
    if (!bucket || !path) return null;
    return { bucket, path };
  }

  try {
    const url = new URL(texto);
    const partes = url.pathname.split('/').filter(Boolean);
    const idxObject = partes.indexOf('object');
    if (idxObject === -1) return null;
    const tipo = partes[idxObject + 1];

    if (tipo === 'public' || tipo === 'sign') {
      const bucket = partes[idxObject + 2];
      if (!bucket) return null;
      const path = partes.slice(idxObject + 3).join('/');
      if (!path) return null;
      return { bucket, path };
    }

    const bucket = tipo;
    if (!bucket) return null;
    const path = partes.slice(idxObject + 2).join('/');
    if (!path) return null;
    return { bucket, path };
  } catch {
    return null;
  }
}

export async function obtenerUrlFirmadaStorage(referencia, opciones = {}) {
  const { expiresIn = 600 } = opciones;
  const ref = parsearReferenciaStorage(referencia);
  if (!ref) {
    return String(referencia || '').trim();
  }

  const clave = `${ref.bucket}/${ref.path}`;
  const ahora = Date.now();
  const omitirCache = debeOmitirCacheUrlFirmada(ref.bucket, opciones);
  const cached = cacheSignedUrls.get(clave);
  if (!omitirCache && cached && cached.url && cached.expiresAt && cached.expiresAt > ahora + 15_000) {
    return cached.url;
  }

  const supabase = obtenerClienteSupabase();
  const expiresInSeguro = Math.max(60, Math.min(3600, Number(expiresIn) || 600));
  const { data, error } = await supabase.functions.invoke('storage-signed-url', {
    body: {
      bucket: ref.bucket,
      path: ref.path,
      expiresIn: expiresInSeguro,
    },
  });

  let urlFirmada = '';
  if (!error && data?.url) {
    const urlNormalizada = normalizarUrlFirmadaStorage(data.url);
    if (esUrlFirmadaStorageValida(urlNormalizada, ref.bucket)) {
      urlFirmada = urlNormalizada;
    }
  }

  if (!urlFirmada) {
    urlFirmada = await obtenerUrlFirmadaDirectaStorage(supabase, ref, expiresInSeguro);
  }

  if (!urlFirmada) {
    return '';
  }

  const expMs = expiresInSeguro * 1000;
  const urlFinal = omitirCache ? anadirCacheBust(urlFirmada) : urlFirmada;
  if (!esUrlHttpValida(urlFinal)) {
    return '';
  }
  cacheSignedUrls.set(clave, { url: urlFinal, expiresAt: ahora + expMs });
  return urlFinal;
}
