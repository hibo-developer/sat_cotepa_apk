import { useState } from 'react';
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-cambiar-password"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="titulo-cambiar-password" className="text-lg font-extrabold text-marca-900">
            Cambiar contrasena
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

        <form onSubmit={manejarSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-sat-muted">
              Nueva contrasena
            </span>
            <input
              type="password"
              value={nueva}
              onChange={(evento) => setNueva(evento.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-xl border border-marca-100 bg-white px-3 py-2 text-sm shadow-sm focus:border-cotepa-rojo-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-sat-muted">
              Repetir nueva contrasena
            </span>
            <input
              type="password"
              value={repetir}
              onChange={(evento) => setRepetir(evento.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-xl border border-marca-100 bg-white px-3 py-2 text-sm shadow-sm focus:border-cotepa-rojo-500 focus:outline-none"
            />
          </label>

          <p className="text-[11px] leading-tight text-sat-subtle">
            Minimo 10 caracteres con mayusculas, minusculas y numeros. Se comprueba contra
            filtraciones publicas (HaveIBeenPwned) sin enviar la contrasena.
          </p>

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
              onClick={cerrar}
              className="rounded-xl border border-marca-100 bg-marca-50 px-3 py-2 text-xs font-bold text-marca-700"
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="rounded-xl bg-cotepa-rojo-500 px-4 py-2 text-xs font-bold text-white shadow-md disabled:opacity-60"
            >
              {enviando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
