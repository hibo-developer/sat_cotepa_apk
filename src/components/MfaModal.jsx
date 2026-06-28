import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
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
    <>
      <div className="modal-overlay" onClick={cerrar} aria-hidden="true" />
      <div
        className="modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-mfa"
      >
        <div className="modal-card max-w-lg">
          <div className="modal-header">
            <div>
              <span className="chip-soft">Seguridad</span>
              <h2 id="titulo-mfa" className="mt-3 text-xl font-black tracking-tight text-marca-900">
                Seguridad (2FA)
              </h2>
              <p className="mt-1 text-sm text-sat-muted">
                Configura el segundo factor con una app autenticadora manteniendo una experiencia clara y guiada.
              </p>
            </div>
            <button
              type="button"
              onClick={cerrar}
              className="modal-close"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="modal-body">
            {modo === 'lista' && (
              <div className="space-y-4">
                <p className="text-sm leading-6 text-sat-muted">
                  Activa la verificacion en dos pasos con una app autenticadora (Google Authenticator, Microsoft
                  Authenticator, etc.).
                </p>

                <div className="modal-info-grid">
                  <div className="helper-card">
                    <p className="metric-label">Proteccion</p>
                    <p className="mt-2 text-sm font-black tracking-tight text-sat-text">Acceso reforzado</p>
                    <p className="mt-1 text-xs leading-5 text-sat-subtle">
                      Añade una segunda verificación para evitar accesos no autorizados.
                    </p>
                  </div>
                  <div className="helper-card">
                    <p className="metric-label">Uso diario</p>
                    <p className="mt-2 text-sm font-black tracking-tight text-sat-text">Código temporal</p>
                    <p className="mt-1 text-xs leading-5 text-sat-subtle">
                      Necesitarás tu autenticador cuando inicies sesión desde una nueva verificación.
                    </p>
                  </div>
                </div>

                <div className="modal-section text-sm">
                  <p className="metric-label">Estado</p>
                  <p className="mt-2 text-base font-black tracking-tight text-marca-900">
                    {factorTotpActivo ? '2FA activado' : '2FA desactivado'}
                  </p>
                </div>

                {error && (
                  <p className="status-banner-error text-xs">
                    {error}
                  </p>
                )}
                {exito && (
                  <p className="status-banner-success text-xs">
                    {exito}
                  </p>
                )}

                <div className="modal-actions pt-1">
                  {factorTotpActivo ? (
                    <button
                      type="button"
                      onClick={desactivar}
                      disabled={cargando}
                      className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 transition hover:-translate-y-0.5 hover:bg-rose-100 disabled:opacity-60"
                    >
                      {cargando ? 'Desactivando...' : 'Desactivar 2FA'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={iniciar}
                      disabled={cargando}
                      className="btn-primary px-4 py-2 text-xs"
                    >
                      {cargando ? 'Preparando...' : 'Activar 2FA'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {modo === 'enroll' && (
              <form onSubmit={confirmar} className="space-y-4">
                <p className="text-sm leading-6 text-sat-muted">
                  1) Escanea el QR con tu app autenticadora. 2) Introduce el codigo de 6 digitos para confirmar.
                </p>

                <div className="modal-section">
                  <p className="metric-label">Ayuda rápida</p>
                  <p className="mt-2 text-[11px] leading-5 text-sat-subtle">
                    Si no puedes escanear el QR, copia manualmente el secreto en tu autenticador y usa después el código generado.
                  </p>
                </div>

                {qrDataUrl ? (
                  <div className="modal-section flex items-center justify-center">
                    <img src={qrDataUrl} alt="QR 2FA" className="h-44 w-44 rounded-2xl bg-white p-2 shadow-sm" />
                  </div>
                ) : (
                  <div className="status-banner-warning text-xs">
                    No se pudo generar el QR. Usa el secreto manual.
                  </div>
                )}

                {secreto && (
                  <div className="modal-section text-xs text-marca-900">
                    <p className="metric-label">Secreto</p>
                    <p className="mt-2 break-all rounded-xl bg-white p-3 font-mono text-[11px] shadow-sm">{secreto}</p>
                  </div>
                )}

                {uri && (
                  <div className="modal-section text-xs text-marca-900">
                    <p className="metric-label">URI</p>
                    <p className="mt-2 break-all rounded-xl bg-white p-3 font-mono text-[11px] shadow-sm">{uri}</p>
                  </div>
                )}

                <label className="block">
                  <span className="label-base">Codigo 2FA</span>
                  <input
                    required
                    inputMode="numeric"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    className="input-base text-center tracking-[0.35em]"
                    placeholder="123456"
                    autoComplete="one-time-code"
                    disabled={cargando}
                  />
                </label>

                {error && (
                  <p className="status-banner-error text-xs">
                    {error}
                  </p>
                )}
                {exito && (
                  <p className="status-banner-success text-xs">
                    {exito}
                  </p>
                )}

                <div className="modal-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setModo('lista');
                      setEnroll(null);
                      setCodigo('');
                      setError('');
                    }}
                    disabled={cargando}
                    className="btn-secondary px-4 py-2 text-xs disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={cargando}
                    className="btn-primary px-4 py-2 text-xs disabled:opacity-60"
                  >
                    {cargando ? 'Verificando...' : 'Confirmar 2FA'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

