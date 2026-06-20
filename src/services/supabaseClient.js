import { createClient } from '@supabase/supabase-js';

const runtimeConfig =
  typeof window !== 'undefined' && window.__APP_CONFIG__ ? window.__APP_CONFIG__ : null;
const supabaseUrl = runtimeConfig?.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = runtimeConfig?.SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const cacheSignedUrls = new Map();

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

// Cliente de Supabase centralizado para usar en servicios del dominio.
export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

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
    const bucket = partes[idxObject + 2];
    if (!bucket || (tipo !== 'public' && tipo !== 'sign')) return null;
    const path = partes.slice(idxObject + 3).join('/');
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
  const { data, error } = await supabase.functions.invoke('storage-signed-url', {
    body: {
      bucket: ref.bucket,
      path: ref.path,
      expiresIn: Math.max(60, Math.min(3600, Number(expiresIn) || 600)),
    },
  });

  if (error || !data?.url) {
    return String(referencia || '').trim();
  }

  const expMs = (Math.max(60, Math.min(3600, Number(expiresIn) || 600)) * 1000);
  const urlFinal = omitirCache ? anadirCacheBust(data.url) : data.url;
  cacheSignedUrls.set(clave, { url: urlFinal, expiresAt: ahora + expMs });
  return urlFinal;
}
