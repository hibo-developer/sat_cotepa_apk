import { useEffect, useState } from 'react';
import {
  cerrarSesion,
  escucharCambiosSesion,
  iniciarSesionConPassword,
  listarFactoresMfa,
  obtenerNivelAseguramientoSesion,
  obtenerSesionActual,
  verificarTotpMfa,
} from '../services/authService';
import { limpiarStorageAuthSupabase } from '../services/supabaseStorage';
import { tieneConfiguracionSupabase } from '../services/supabaseClient';

function resolverFactorPreferido(factores) {
  const totp = Array.isArray(factores?.totp) ? factores.totp : [];
  const all = Array.isArray(factores?.all) ? factores.all : [];
  const preferido = totp.find((f) => String(f?.status || '').toLowerCase() === 'verified')
    || all.find((f) => String(f?.status || '').toLowerCase() === 'verified')
    || totp[0]
    || all[0]
    || null;
  return preferido?.id || null;
}

// Rate-limiting de login en cliente: máximo 5 intentos fallidos en ventana de 15 min.
const LOGIN_MAX_INTENTOS = 5;
const LOGIN_VENTANA_MS = 15 * 60 * 1000;
const _loginIntentos = { count: 0, ventanaInicio: 0 };

function registrarIntentoFallido() {
  const ahora = Date.now();
  if (ahora - _loginIntentos.ventanaInicio > LOGIN_VENTANA_MS) {
    _loginIntentos.count = 0;
    _loginIntentos.ventanaInicio = ahora;
  }
  _loginIntentos.count += 1;
}

function verificarRateLimitLogin() {
  const ahora = Date.now();
  if (ahora - _loginIntentos.ventanaInicio > LOGIN_VENTANA_MS) {
    _loginIntentos.count = 0;
    _loginIntentos.ventanaInicio = ahora;
  }
  if (_loginIntentos.count >= LOGIN_MAX_INTENTOS) {
    const esperaMs = LOGIN_VENTANA_MS - (ahora - _loginIntentos.ventanaInicio);
    const esperaMin = Math.ceil(esperaMs / 60000);
    throw new Error(`Demasiados intentos fallidos. Espera ${esperaMin} minuto${esperaMin !== 1 ? 's' : ''} antes de volver a intentarlo.`);
  }
}

function resetearRateLimitLogin() {
  _loginIntentos.count = 0;
  _loginIntentos.ventanaInicio = 0;
}

export function useAuthSession() {
  const [sesion, setSesion] = useState(null);
  const [sesionPendienteMfa, setSesionPendienteMfa] = useState(null);
  const [factorMfaId, setFactorMfaId] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  async function evaluarSesion(siguienteSesion) {
    if (!tieneConfiguracionSupabase()) {
      setSesion(null);
      setSesionPendienteMfa(null);
      setFactorMfaId(null);
      return { requiereMfa: false, sesion: null };
    }

    if (!siguienteSesion) {
      setSesion(null);
      setSesionPendienteMfa(null);
      setFactorMfaId(null);
      return { requiereMfa: false, sesion: null };
    }

    try {
      const aal = await obtenerNivelAseguramientoSesion();
      const current = String(aal?.currentLevel || '').toLowerCase();
      const next = String(aal?.nextLevel || '').toLowerCase();

      if (current === 'aal1' && next === 'aal2') {
        const factores = await listarFactoresMfa();
        const factorId = resolverFactorPreferido(factores);
        setSesion(null);
        setSesionPendienteMfa(siguienteSesion);
        setFactorMfaId(factorId);
        return { requiereMfa: true, sesion: null, factorId };
      }

      setSesion(siguienteSesion);
      setSesionPendienteMfa(null);
      setFactorMfaId(null);
      return { requiereMfa: false, sesion: siguienteSesion };
    } catch {
      setSesion(siguienteSesion);
      setSesionPendienteMfa(null);
      setFactorMfaId(null);
      return { requiereMfa: false, sesion: siguienteSesion };
    }
  }

  useEffect(() => {
    let montado = true;

    async function inicializarSesion() {
      if (!tieneConfiguracionSupabase()) {
        setCargando(false);
        return;
      }

      try {
        const sesionActual = await obtenerSesionActual();
        if (montado) {
          await evaluarSesion(sesionActual);
        }
      } catch (err) {
        if (montado) {
          setError(err.message || 'No se pudo comprobar la sesion actual.');
        }
      } finally {
        if (montado) {
          setCargando(false);
        }
      }
    }

    inicializarSesion();

    const desuscribir = escucharCambiosSesion((siguienteSesion) => {
      if (!montado) {
        return;
      }
      evaluarSesion(siguienteSesion).catch(() => {});
    });

    return () => {
      montado = false;
      desuscribir();
    };
  }, []);

  async function login(email, password) {
    setError('');
    verificarRateLimitLogin();
    try {
      const sesionCreada = await iniciarSesionConPassword({ email, password });
      resetearRateLimitLogin();
      const resultado = await evaluarSesion(sesionCreada);
      return resultado;
    } catch (err) {
      registrarIntentoFallido();
      throw err;
    }
  }

  async function verificarMfa(codigo) {
    setError('');
    const code = String(codigo || '').trim();
    if (!code) {
      throw new Error('Debes introducir el codigo de 6 digitos.');
    }
    if (!factorMfaId) {
      throw new Error('No se encontro un factor 2FA valido para este usuario.');
    }
    await verificarTotpMfa({ factorId: factorMfaId, code });
    const sesionActual = await obtenerSesionActual();
    await evaluarSesion(sesionActual);
    return sesionActual;
  }

  async function cancelarMfa() {
    setError('');
    await cerrarSesion();
    await limpiarStorageAuthSupabase();
    setSesion(null);
    setSesionPendienteMfa(null);
    setFactorMfaId(null);
  }

  async function logout() {
    setError('');
    await cerrarSesion();
    await limpiarStorageAuthSupabase();
    try {
      localStorage.removeItem('sat_cache_usuario_sat_v1');
      localStorage.removeItem('sat_cache_parte_borrador_v1');
      localStorage.removeItem('sat_device_instance_id_v1');
    } catch {}
    setSesion(null);
    setSesionPendienteMfa(null);
    setFactorMfaId(null);
  }

  return {
    sesion,
    mfaPendiente: Boolean(sesionPendienteMfa),
    cargando,
    error,
    login,
    verificarMfa,
    cancelarMfa,
    logout,
  };
}
