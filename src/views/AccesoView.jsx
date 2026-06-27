import { useState } from 'react';

export function AccesoView({
  onLogin,
  onVerificarMfa,
  onCancelarMfa,
  mfaPendiente = false,
  cargandoSesion,
  errorSesion,
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [codigoMfa, setCodigoMfa] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensajeError, setMensajeError] = useState('');

  async function enviarLogin(evento) {
    evento.preventDefault();
    setMensajeError('');
    setGuardando(true);

    try {
      const resultado = await onLogin(email, password);
      if (resultado?.requiereMfa) {
        setPassword('');
        setCodigoMfa('');
      }
    } catch (err) {
      setMensajeError(err.message || 'No se pudo iniciar sesion.');
    } finally {
      setGuardando(false);
    }
  }

  async function enviarCodigoMfa(evento) {
    evento.preventDefault();
    setMensajeError('');
    setGuardando(true);
    try {
      await onVerificarMfa(codigoMfa);
    } catch (err) {
      setMensajeError(err.message || 'No se pudo verificar el codigo 2FA.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="space-y-4">
      <header className="rounded-2xl bg-marca-900 p-4 text-white shadow-lg">
        <h2 className="text-lg font-bold">Acceso SAT</h2>
        <p className="mt-1 text-sm text-slate-300">
          Inicia sesion para usar la aplicacion con politicas de seguridad activas.
        </p>
      </header>

      {(mensajeError || errorSesion) && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {mensajeError || errorSesion}
        </p>
      )}

      {mfaPendiente ? (
        <form onSubmit={enviarCodigoMfa} className="space-y-3 rounded-2xl border border-marca-100 bg-white p-4 shadow-tarjeta">
          <p className="text-sm font-semibold text-sat-text">
            Verificacion en dos pasos activada. Introduce el codigo de tu app autenticadora.
          </p>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-sat-muted">Codigo 2FA</span>
            <input
              required
              inputMode="numeric"
              value={codigoMfa}
              onChange={(evento) => setCodigoMfa(evento.target.value)}
              className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm tracking-widest"
              placeholder="123456"
              autoComplete="one-time-code"
              disabled={guardando || cargandoSesion}
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onCancelarMfa?.()}
              disabled={guardando || cargandoSesion}
              className="flex-1 rounded-2xl border border-marca-100 bg-marca-50 px-4 py-4 text-sm font-bold text-marca-700 disabled:opacity-60"
            >
              Volver
            </button>
            <button
              type="submit"
              disabled={guardando || cargandoSesion}
              className="flex-1 rounded-2xl bg-cotepa-rojo-500 px-4 py-4 text-sm font-bold text-white disabled:opacity-60"
            >
              {guardando || cargandoSesion ? 'Verificando...' : 'Verificar'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={enviarLogin} className="space-y-3 rounded-2xl border border-marca-100 bg-white p-4 shadow-tarjeta">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-sat-muted">Email</span>
            <input
              required
              type="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
              placeholder="usuario@empresa.com"
              autoComplete="email"
              disabled={guardando || cargandoSesion}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-sat-muted">Contrasena</span>
            <input
              required
              type="password"
              value={password}
              onChange={(evento) => setPassword(evento.target.value)}
              className="w-full rounded-xl border border-sat-border px-4 py-3 text-sm"
              placeholder="********"
              autoComplete="current-password"
              disabled={guardando || cargandoSesion}
            />
          </label>

          <button
            type="submit"
            disabled={guardando || cargandoSesion}
            className="w-full rounded-2xl bg-cotepa-rojo-500 px-4 py-4 text-sm font-bold text-white disabled:opacity-60"
          >
            {guardando || cargandoSesion ? 'Validando acceso...' : 'Entrar'}
          </button>
        </form>
      )}
    </section>
  );
}
