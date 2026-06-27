import { useEffect, useMemo, useState } from 'react';
import { desenrolarMfa, enrolarTotpMfa, listarFactoresMfa, verificarTotpMfa } from '../services/authService';

function svgADataUrl(svg) {
  const contenido = String(svg || '').trim();
  if (!contenido) return '';
  if (contenido.startsWith('data:')) return contenido;
  return `data:image/svg+xml;utf-8,${encodeURIComponent(contenido)}`;
}

function esFactorVerificado(factor) {
  return String(factor?.status || '').toLowerCase() === 'verified';
}

export function MfaModal({ abierto, onCerrar }) {
  const [cargando, setCargando] = useState(false);
  const [modo, setModo] = useState('lista');
  const [factores, setFactores] = useState([]);
  const [enroll, setEnroll] = useState(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  const factorTotpActivo = useMemo(
    () => factores.find((f) => esFactorVerificado(f)) || null,
    [factores],
  );

  async function cargar() {
    setError('');
    setExito('');
    setCargando(true);
    try {
      const data = await listarFactoresMfa();
      const totp = Array.isArray(data?.totp) ? data.totp : [];
      setFactores(totp);
    } catch (err) {
      setError(err?.message || 'No se pudo cargar el estado de 2FA.');
    } finally {
      setCargando(false);
    }
  }

  function cerrar() {
    setModo('lista');
    setEnroll(null);
    setCodigo('');
    setError('');
    setExito('');
    onCerrar?.();
  }

  async function iniciar() {
    setError('');
    setExito('');
    setCodigo('');
    setCargando(true);
    try {
      const data = await enrolarTotpMfa();
      setEnroll(data);
      setModo('enroll');
    } catch (err) {
      setError(err?.message || 'No se pudo iniciar la activacion de 2FA.');
    } finally {
      setCargando(false);
    }
  }

  async function confirmar(evento) {
    evento.preventDefault();
    setError('');
    setExito('');
    setCargando(true);
    try {
      const factorId = enroll?.id;
      if (!factorId) {
        throw new Error('No se pudo identificar el factor 2FA.');
      }
      await verificarTotpMfa({ factorId, code: codigo });
      setExito('2FA activado correctamente.');
      setModo('lista');
      setEnroll(null);
      setCodigo('');
      await cargar();
    } catch (err) {
      setError(err?.message || 'No se pudo verificar el codigo.');
    } finally {
      setCargando(false);
    }
  }

  async function desactivar() {
    if (!factorTotpActivo?.id) return;
    setError('');
    setExito('');
    setCargando(true);
    try {
      await desenrolarMfa({ factorId: factorTotpActivo.id });
      setExito('2FA desactivado.');
      await cargar();
    } catch (err) {
      setError(err?.message || 'No se pudo desactivar 2FA.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (!abierto) return undefined;
    cargar();
    return undefined;
  }, [abierto]);

  if (!abierto) return null;

  const qrDataUrl = svgADataUrl(enroll?.totp?.qr_code);
  const secreto = String(enroll?.totp?.secret || '').trim();
  const uri = String(enroll?.totp?.uri || '').trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-mfa"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="titulo-mfa" className="text-lg font-extrabold text-marca-900">
            Seguridad (2FA)
          </h2>
          <button
            type="button"
            onClick={cerrar}
            className="rounded-lg px-2 py-1 text-sm font-bold text-marca-700 hover:bg-marca-50"
            aria-label="Cerrar"
          >
            X
          </button>
        </div>

        {modo === 'lista' && (
          <div className="space-y-3">
            <p className="text-sm text-sat-muted">
              Activa la verificacion en dos pasos con una app autenticadora (Google Authenticator, Microsoft
              Authenticator, etc.).
            </p>

            <div className="rounded-xl border border-marca-100 bg-marca-50 p-3 text-sm">
              <p className="font-bold text-marca-900">Estado</p>
              <p className="mt-1 text-marca-700">
                {factorTotpActivo ? '2FA activado' : '2FA desactivado'}
              </p>
            </div>

            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {error}
              </p>
            )}
            {exito && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                {exito}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              {factorTotpActivo ? (
                <button
                  type="button"
                  onClick={desactivar}
                  disabled={cargando}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-60"
                >
                  {cargando ? 'Desactivando...' : 'Desactivar 2FA'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={iniciar}
                  disabled={cargando}
                  className="rounded-xl bg-cotepa-rojo-500 px-4 py-2 text-xs font-bold text-white shadow-md disabled:opacity-60"
                >
                  {cargando ? 'Preparando...' : 'Activar 2FA'}
                </button>
              )}
            </div>
          </div>
        )}

        {modo === 'enroll' && (
          <form onSubmit={confirmar} className="space-y-3">
            <p className="text-sm text-sat-muted">
              1) Escanea el QR con tu app autenticadora. 2) Introduce el codigo de 6 digitos para confirmar.
            </p>

            {qrDataUrl ? (
              <div className="flex items-center justify-center rounded-xl border border-marca-100 bg-white p-3">
                <img src={qrDataUrl} alt="QR 2FA" className="h-44 w-44" />
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                No se pudo generar el QR. Usa el secreto manual.
              </div>
            )}

            {secreto && (
              <div className="rounded-xl border border-marca-100 bg-marca-50 p-3 text-xs text-marca-900">
                <p className="font-bold">Secreto</p>
                <p className="mt-1 break-all font-mono">{secreto}</p>
              </div>
            )}

            {uri && (
              <div className="rounded-xl border border-marca-100 bg-marca-50 p-3 text-xs text-marca-900">
                <p className="font-bold">URI</p>
                <p className="mt-1 break-all font-mono">{uri}</p>
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-sat-muted">Codigo 2FA</span>
              <input
                required
                inputMode="numeric"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm tracking-widest"
                placeholder="123456"
                autoComplete="one-time-code"
                disabled={cargando}
              />
            </label>

            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                {error}
              </p>
            )}
            {exito && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                {exito}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setModo('lista');
                  setEnroll(null);
                  setCodigo('');
                  setError('');
                }}
                disabled={cargando}
                className="rounded-xl border border-marca-100 bg-marca-50 px-3 py-2 text-xs font-bold text-marca-700 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={cargando}
                className="rounded-xl bg-cotepa-rojo-500 px-4 py-2 text-xs font-bold text-white shadow-md disabled:opacity-60"
              >
                {cargando ? 'Verificando...' : 'Confirmar 2FA'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

