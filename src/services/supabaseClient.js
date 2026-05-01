import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const cacheSignedUrls = new Map();

// Cliente de Supabase centralizado para usar en servicios del dominio.
export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export function tieneConfiguracionSupabase() {
  return Boolean(supabase);
}

export function obtenerClienteSupabase() {
  if (!supabase) {
    throw new Error(
      'Falta configurar Supabase. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu archivo .env'
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
  const cached = cacheSignedUrls.get(clave);
  if (cached && cached.url && cached.expiresAt && cached.expiresAt > ahora + 15_000) {
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
  cacheSignedUrls.set(clave, { url: data.url, expiresAt: ahora + expMs });
  return data.url;
}
