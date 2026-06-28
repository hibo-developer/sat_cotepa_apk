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
      <header className="section-hero p-5 lg:p-6">
        <div className="max-w-2xl">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/70">Acceso seguro</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white lg:text-3xl">Acceso SAT</h2>
          <p className="mt-3 text-sm leading-6 text-slate-200">
            Inicia sesión para usar la aplicación con políticas de seguridad activas, acceso protegido y verificación en dos pasos.
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="metric-card bg-white/10 text-white">
            <p className="metric-label text-white/65">Protección</p>
            <p className="mt-2 text-sm font-bold text-white">Credenciales cifradas</p>
          </div>
          <div className="metric-card bg-white/10 text-white">
            <p className="metric-label text-white/65">Seguridad</p>
            <p className="mt-2 text-sm font-bold text-white">Flujo con 2FA</p>
          </div>
          <div className="metric-card bg-white/10 text-white">
            <p className="metric-label text-white/65">Operativa</p>
            <p className="mt-2 text-sm font-bold text-white">Acceso rápido y legible</p>
          </div>
        </div>
      </header>

      {(mensajeError || errorSesion) && (
        <p className="status-banner-error">
          {mensajeError || errorSesion}
        </p>
      )}

      {mfaPendiente ? (
        <form onSubmit={enviarCodigoMfa} className="surface-card space-y-4 p-5">
          <div>
            <p className="metric-label">Segundo factor</p>
            <p className="mt-2 text-sm font-semibold text-sat-text">
            Verificacion en dos pasos activada. Introduce el codigo de tu app autenticadora.
            </p>
          </div>

          <label className="block">
            <span className="label-base">Codigo 2FA</span>
            <input
              required
              inputMode="numeric"
              value={codigoMfa}
              onChange={(evento) => setCodigoMfa(evento.target.value)}
              className="input-base text-center tracking-[0.4em]"
              placeholder="123456"
              autoComplete="one-time-code"
              disabled={guardando || cargandoSesion}
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onCancelarMfa?.()}
              disabled={guardando || cargandoSesion}
              className="btn-secondary w-full"
            >
              Volver
            </button>
            <button
              type="submit"
              disabled={guardando || cargandoSesion}
              className="btn-primary w-full"
            >
              {guardando || cargandoSesion ? 'Verificando...' : 'Verificar'}
            </button>
          </div>
        </form>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
          <form onSubmit={enviarLogin} className="surface-card space-y-4 p-5 lg:p-6">
            <div>
              <p className="metric-label">Inicio de sesión</p>
              <h3 className="mt-2 text-xl font-black tracking-tight text-sat-text">Accede a tu espacio SAT</h3>
              <p className="mt-2 text-sm text-sat-muted">
                Usa tus credenciales corporativas para continuar con la gestión técnica y operativa.
              </p>
            </div>

          <label className="block">
              <span className="label-base">Email</span>
            <input
              required
              type="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
                className="input-base"
              placeholder="usuario@empresa.com"
              autoComplete="email"
              disabled={guardando || cargandoSesion}
            />
          </label>

          <label className="block">
              <span className="label-base">Contrasena</span>
            <input
              required
              type="password"
              value={password}
              onChange={(evento) => setPassword(evento.target.value)}
                className="input-base"
              placeholder="********"
              autoComplete="current-password"
              disabled={guardando || cargandoSesion}
            />
          </label>

          <button
            type="submit"
            disabled={guardando || cargandoSesion}
              className="btn-primary w-full"
          >
            {guardando || cargandoSesion ? 'Validando acceso...' : 'Entrar'}
          </button>

            <p className="text-xs leading-5 text-sat-subtle">
              Si la cuenta requiere segundo factor, el sistema solicitará el código de tu aplicación autenticadora.
            </p>
          </form>

          <aside className="surface-panel space-y-4 p-5">
            <div>
              <p className="metric-label">Buenas prácticas</p>
              <h3 className="mt-2 text-lg font-black tracking-tight text-sat-text">Recomendaciones de acceso</h3>
            </div>
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/70 bg-white/75 p-4">
                <p className="text-sm font-bold text-sat-text">Mantén 2FA disponible</p>
                <p className="mt-1 text-sm text-sat-muted">Ten a mano tu autenticador para validar el acceso sin interrupciones.</p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/75 p-4">
                <p className="text-sm font-bold text-sat-text">Usa un correo corporativo</p>
                <p className="mt-1 text-sm text-sat-muted">Facilita el control de roles y la trazabilidad interna del SAT.</p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/75 p-4">
                <p className="text-sm font-bold text-sat-text">Evita sesiones compartidas</p>
                <p className="mt-1 text-sm text-sat-muted">Cada técnico o usuario debe acceder con su identidad operativa real.</p>
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
