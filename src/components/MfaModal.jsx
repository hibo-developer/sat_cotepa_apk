import { useEffect, useMemo, useState } from 'react';
import { KeyRound, ShieldCheck, Smartphone, X } from 'lucide-react';
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
  const claseBotonSecundario = 'inline-flex items-center justify-center rounded-2xl border border-marca-100 bg-white px-3.5 py-2.5 text-xs font-bold text-marca-700 shadow-sm transition hover:-translate-y-0.5 hover:border-marca-200 hover:bg-marca-50 focus:outline-none focus:ring-4 focus:ring-marca-100 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60';
  const claseBotonPrimario = 'inline-flex items-center justify-center rounded-2xl bg-cotepa-rojo-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-red-200/60 transition hover:-translate-y-0.5 hover:bg-cotepa-rojo-600 focus:outline-none focus:ring-4 focus:ring-red-100 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-mfa"
    >
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-white/70 bg-white/95 p-5 shadow-[0_24px_70px_-28px_rgba(15,23,42,0.45)] ring-1 ring-slate-950/5">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-marca-100 bg-marca-50/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-marca-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Seguridad
            </div>
            <h2 id="titulo-mfa" className="mt-3 text-xl font-extrabold tracking-tight text-marca-900">
              Verificación en dos pasos
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Refuerza el acceso con un código temporal desde tu app autenticadora.
            </p>
          </div>
          <button
            type="button"
            onClick={cerrar}
            className="rounded-full border border-transparent p-2 text-marca-700 transition hover:border-marca-100 hover:bg-marca-50 focus:outline-none focus:ring-4 focus:ring-marca-100"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {modo === 'lista' && (
          <div className="space-y-4">
            <div className="rounded-[1.6rem] border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white bg-white text-marca-700 shadow-md shadow-slate-200/70">
                  <Smartphone className="h-5 w-5" />
                </span>
                <p className="pr-1 text-sm leading-6 text-slate-700">
                  Activa la verificacion en dos pasos con una app autenticadora (Google Authenticator, Microsoft
                  Authenticator, etc.).
                </p>
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-marca-100/80 bg-marca-50/70 p-4 text-sm shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-marca-700">Estado</p>
                  <p className="mt-1 font-semibold text-marca-900">
                    {factorTotpActivo ? '2FA activado' : '2FA desactivado'}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                    factorTotpActivo ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {factorTotpActivo ? 'Protegido' : 'Pendiente'}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                {factorTotpActivo ? 'La cuenta ya requiere un código adicional al iniciar sesión.' : 'Activa 2FA para añadir una segunda capa de verificación a la cuenta.'}
              </p>
            </div>

            {error && (
              <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 shadow-sm">
                {error}
              </p>
            )}
            {exito && (
              <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-700 shadow-sm">
                {exito}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              {factorTotpActivo ? (
                <button
                  type="button"
                  onClick={desactivar}
                  disabled={cargando}
                  className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-100 focus:outline-none focus:ring-4 focus:ring-rose-100 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cargando ? 'Desactivando...' : 'Desactivar 2FA'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={iniciar}
                  disabled={cargando}
                  className={claseBotonPrimario}
                >
                  {cargando ? 'Preparando...' : 'Activar 2FA'}
                </button>
              )}
            </div>
          </div>
        )}

        {modo === 'enroll' && (
          <form onSubmit={confirmar} className="space-y-4">
            <div className="rounded-[1.6rem] border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white bg-white text-marca-700 shadow-md shadow-slate-200/70">
                  <KeyRound className="h-5 w-5" />
                </span>
                <p className="pr-1 text-sm leading-6 text-slate-700">
                  1) Escanea el QR con tu app autenticadora. 2) Introduce el codigo de 6 digitos para confirmar.
                </p>
              </div>
            </div>

            {qrDataUrl ? (
              <div className="flex items-center justify-center rounded-[1.6rem] border border-marca-100/80 bg-white p-4 shadow-sm">
                <img src={qrDataUrl} alt="QR 2FA" className="h-44 w-44" />
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-900 shadow-sm">
                No se pudo generar el QR. Usa el secreto manual.
              </div>
            )}

            {secreto && (
              <div className="rounded-2xl border border-marca-100/80 bg-marca-50/70 p-3 text-xs text-marca-900 shadow-sm">
                <p className="font-bold">Secreto</p>
                <p className="mt-1 break-all font-mono">{secreto}</p>
              </div>
            )}

            {uri && (
              <div className="rounded-2xl border border-marca-100/80 bg-marca-50/70 p-3 text-xs text-marca-900 shadow-sm">
                <p className="font-bold">URI</p>
                <p className="mt-1 break-all font-mono">{uri}</p>
              </div>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Codigo 2FA</span>
              <input
                required
                inputMode="numeric"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className="w-full rounded-2xl border border-slate-300/90 bg-white px-4 py-3 text-sm tracking-[0.35em] text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-marca-600 focus:outline-none focus:ring-4 focus:ring-marca-100"
                placeholder="123456"
                autoComplete="one-time-code"
                disabled={cargando}
              />
            </label>

            {error && (
              <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700 shadow-sm">
                {error}
              </p>
            )}
            {exito && (
              <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-700 shadow-sm">
                {exito}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  setModo('lista');
                  setEnroll(null);
                  setCodigo('');
                  setError('');
                }}
                disabled={cargando}
                className={claseBotonSecundario}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={cargando}
                className={claseBotonPrimario}
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

