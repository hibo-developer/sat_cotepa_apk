import { useState } from 'react';
import { KeyRound, LockKeyhole, ShieldCheck, X } from 'lucide-react';
import { actualizarPasswordUsuarioActual } from '../services/authService';
import { asegurarPasswordSegura } from '../services/passwordSecurity';

export function CambiarPasswordModal({ abierto, onCerrar }) {
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');

  if (!abierto) {
    return null;
  }

  function reset() {
    setNueva('');
    setRepetir('');
    setError('');
    setExito('');
    setEnviando(false);
  }

  function cerrar() {
    reset();
    onCerrar();
  }

  async function manejarSubmit(evento) {
    evento.preventDefault();
    setError('');
    setExito('');

    if (nueva !== repetir) {
      setError('Las contrasenas no coinciden.');
      return;
    }

    setEnviando(true);
    try {
      await asegurarPasswordSegura(nueva);
      await actualizarPasswordUsuarioActual(nueva);
      setExito('Contrasena actualizada correctamente.');
      setNueva('');
      setRepetir('');
    } catch (err) {
      setError(err?.message || 'No se pudo actualizar la contrasena.');
    } finally {
      setEnviando(false);
    }
  }

  const claseInput = 'w-full rounded-2xl border border-marca-100/90 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-cotepa-rojo-500 focus:outline-none focus:ring-4 focus:ring-red-100';
  const claseBotonSecundario = 'inline-flex items-center justify-center rounded-2xl border border-marca-100 bg-white px-3.5 py-2.5 text-xs font-bold text-marca-700 shadow-sm transition hover:-translate-y-0.5 hover:border-marca-200 hover:bg-marca-50 focus:outline-none focus:ring-4 focus:ring-marca-100';
  const claseBotonPrimario = 'inline-flex items-center justify-center rounded-2xl bg-cotepa-rojo-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-red-200/60 transition hover:-translate-y-0.5 hover:bg-cotepa-rojo-600 focus:outline-none focus:ring-4 focus:ring-red-100 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-cambiar-password"
    >
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-white/70 bg-white/95 p-5 shadow-[0_24px_70px_-28px_rgba(15,23,42,0.45)] ring-1 ring-slate-950/5">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-marca-100 bg-marca-50/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-marca-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Seguridad
            </div>
            <h2 id="titulo-cambiar-password" className="mt-3 text-xl font-extrabold tracking-tight text-marca-900">
              Cambiar contrasena
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Actualiza el acceso de la cuenta sin salir de la sesion actual.
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

        <form onSubmit={manejarSubmit} className="space-y-4">
          <div className="rounded-[1.6rem] border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white bg-white text-marca-700 shadow-md shadow-slate-200/70">
                <KeyRound className="h-5 w-5" />
              </span>
              <p className="pr-1 text-sm leading-6 text-slate-700">
                Actualiza tu contrasena para mantener protegida la cuenta y cumplir las politicas de seguridad activas.
              </p>
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Nueva contrasena
            </span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={nueva}
                onChange={(evento) => setNueva(evento.target.value)}
                required
                autoComplete="new-password"
                className={`${claseInput} pl-10`}
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              Repetir nueva contrasena
            </span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={repetir}
                onChange={(evento) => setRepetir(evento.target.value)}
                required
                autoComplete="new-password"
                className={`${claseInput} pl-10`}
              />
            </div>
          </label>

          <p className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-[11px] leading-5 text-slate-600 shadow-sm">
            Minimo 10 caracteres con mayusculas, minusculas y numeros. Se comprueba contra
            filtraciones publicas (HaveIBeenPwned) sin enviar la contrasena.
          </p>

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
              onClick={cerrar}
              className={claseBotonSecundario}
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className={claseBotonPrimario}
            >
              {enviando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
