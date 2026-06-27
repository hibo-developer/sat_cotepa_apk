import { useState } from 'react';
import { LockKeyhole, Mail, ShieldCheck, TriangleAlert } from 'lucide-react';

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

  const claseInput = 'w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-marca-600 focus:outline-none focus:ring-4 focus:ring-marca-100 disabled:cursor-not-allowed disabled:bg-slate-100';
  const claseBotonSecundario = 'flex-1 rounded-2xl border border-marca-100 bg-marca-50 px-4 py-4 text-sm font-bold text-marca-700 shadow-sm transition hover:bg-marca-100 focus:outline-none focus:ring-4 focus:ring-marca-100 disabled:opacity-60';
  const claseBotonPrimario = 'rounded-2xl bg-cotepa-rojo-500 px-4 py-4 text-sm font-bold text-white shadow-lg shadow-red-200 transition hover:bg-cotepa-rojo-600 focus:outline-none focus:ring-4 focus:ring-red-100 disabled:opacity-60';

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
    <section className="mx-auto max-w-md space-y-4">
      <header className="overflow-hidden rounded-3xl border border-marca-700/40 bg-marca-900 p-5 text-white shadow-xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-100">
          <ShieldCheck className="h-3.5 w-3.5" />
          Acceso Seguro
        </div>
        <h2 className="mt-4 text-xl font-bold">Acceso SAT</h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-200">
          Inicia sesión para acceder a la operativa diaria con autenticación reforzada y control de permisos.
        </p>
      </header>

      {(mensajeError || errorSesion) && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <p>{mensajeError || errorSesion}</p>
        </div>
      )}

      {mfaPendiente ? (
        <form onSubmit={enviarCodigoMfa} className="space-y-4 rounded-3xl border border-marca-100 bg-white/95 p-5 shadow-tarjeta backdrop-blur-sm">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">Verificación en dos pasos</p>
            <p className="text-sm leading-6 text-slate-600">
              Introduce el código temporal de tu aplicación autenticadora para continuar.
            </p>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Código 2FA</span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                required
                inputMode="numeric"
                value={codigoMfa}
                onChange={(evento) => setCodigoMfa(evento.target.value)}
                className={`${claseInput} pl-11 text-center tracking-[0.35em]`}
                placeholder="123456"
                autoComplete="one-time-code"
                disabled={guardando || cargandoSesion}
              />
            </div>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onCancelarMfa?.()}
              disabled={guardando || cargandoSesion}
              className={claseBotonSecundario}
            >
              Volver
            </button>
            <button
              type="submit"
              disabled={guardando || cargandoSesion}
              className={`flex-1 ${claseBotonPrimario}`}
            >
              {guardando || cargandoSesion ? 'Verificando...' : 'Verificar'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={enviarLogin} className="space-y-4 rounded-3xl border border-marca-100 bg-white/95 p-5 shadow-tarjeta backdrop-blur-sm">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">Credenciales de acceso</p>
            <p className="text-sm leading-6 text-slate-600">
              Usa tu cuenta corporativa para entrar en el entorno de trabajo.
            </p>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Email</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                required
                type="email"
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                className={`${claseInput} pl-11`}
                placeholder="usuario@empresa.com"
                autoComplete="email"
                disabled={guardando || cargandoSesion}
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">Contraseña</span>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                required
                type="password"
                value={password}
                onChange={(evento) => setPassword(evento.target.value)}
                className={`${claseInput} pl-11`}
                placeholder="********"
                autoComplete="current-password"
                disabled={guardando || cargandoSesion}
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={guardando || cargandoSesion}
            className={`w-full ${claseBotonPrimario}`}
          >
            {guardando || cargandoSesion ? 'Validando acceso...' : 'Entrar'}
          </button>

          <p className="text-center text-xs leading-5 text-slate-500">
            El acceso queda sujeto a control de permisos y políticas de seguridad activas.
          </p>
        </form>
      )}
    </section>
  );
}
