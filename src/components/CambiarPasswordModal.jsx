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
    <>
      <div className="modal-overlay" onClick={cerrar} aria-hidden="true" />
      <div
        className="modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-cambiar-password"
      >
        <div className="modal-card max-w-md">
          <div className="modal-header">
            <div>
              <span className="chip-soft">Credenciales</span>
              <h2 id="titulo-cambiar-password" className="mt-3 text-xl font-black tracking-tight text-marca-900">
                Cambiar contrasena
              </h2>
              <p className="mt-1 text-sm text-sat-muted">
                Actualiza tu acceso manteniendo una contraseña robusta y alineada con las políticas del sistema.
              </p>
            </div>
            <button
              type="button"
              onClick={cerrar}
              className="modal-close"
              aria-label="Cerrar"
            >
              X
            </button>
          </div>

          <form onSubmit={manejarSubmit} className="space-y-4 p-5">
            <label className="block">
              <span className="label-base">
                Nueva contrasena
              </span>
              <input
                type="password"
                value={nueva}
                onChange={(evento) => setNueva(evento.target.value)}
                required
                autoComplete="new-password"
                className="input-base"
              />
            </label>

            <label className="block">
              <span className="label-base">
                Repetir nueva contrasena
              </span>
              <input
                type="password"
                value={repetir}
                onChange={(evento) => setRepetir(evento.target.value)}
                required
                autoComplete="new-password"
                className="input-base"
              />
            </label>

            <div className="surface-panel p-4">
              <p className="metric-label">Requisitos</p>
              <p className="mt-2 text-[11px] leading-5 text-sat-subtle">
                Minimo 10 caracteres con mayusculas, minusculas y numeros. Se comprueba contra
                filtraciones publicas (HaveIBeenPwned) sin enviar la contrasena.
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

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={cerrar}
                className="btn-secondary px-4 py-2 text-xs"
              >
                Cerrar
              </button>
              <button
                type="submit"
                disabled={enviando}
                className="btn-primary px-4 py-2 text-xs disabled:opacity-60"
              >
                {enviando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
