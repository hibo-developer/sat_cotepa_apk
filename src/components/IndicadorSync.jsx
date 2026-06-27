import { useEffect, useState } from 'react';
import {
  contarPartesPendientes,
  contarPendientes,
  estaOnline,
  procesarCola,
  procesarColaPartes,
  suscribirseEstadoSync,
} from '../services/offlineSyncService';

export function IndicadorSync() {
  const [estado, setEstado] = useState({
    online: estaOnline(),
    pendientes: 0,
    pendientesAcciones: 0,
    pendientesPartes: 0,
    pendientesGps: 0,
  });
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    let activo = true;
    Promise.all([contarPendientes(), contarPartesPendientes()]).then(([acciones, partes]) => {
      if (activo) {
        setEstado((s) => ({
          ...s,
          pendientesAcciones: acciones,
          pendientesPartes: partes,
          pendientes: acciones + partes,
        }));
      }
    });

    const desuscribir = suscribirseEstadoSync((nuevo) => {
      setEstado(nuevo);
    });

    function alOnline() { setEstado((s) => ({ ...s, online: true })); }
    function alOffline() { setEstado((s) => ({ ...s, online: false })); }
    window.addEventListener('online', alOnline);
    window.addEventListener('offline', alOffline);

    return () => {
      activo = false;
      desuscribir();
      window.removeEventListener('online', alOnline);
      window.removeEventListener('offline', alOffline);
    };
  }, []);

  async function sincronizarAhora() {
    if (sincronizando || !estado.online) return;
    setSincronizando(true);
    try {
      await Promise.all([procesarCola(), procesarColaPartes()]);
    } finally {
      setSincronizando(false);
    }
  }

  // No mostrar nada cuando todo está OK (online y sin pendientes)
  if (estado.online && estado.pendientes === 0) {
    return null;
  }

  const offline = !estado.online;
  const colorBase = offline
    ? 'bg-amber-50 border-amber-300 text-amber-900'
    : 'bg-sky-50 border-sky-300 text-sky-900';

  const detallePartes = estado.pendientesPartes > 0
    ? ` · ${estado.pendientesPartes} parte${estado.pendientesPartes > 1 ? 's' : ''} por enviar`
    : '';
  const detalleGps = estado.pendientesGps > 0
    ? ` · ${estado.pendientesGps} punto${estado.pendientesGps > 1 ? 's' : ''} GPS`
    : '';

  return (
    <div
      role="status"
      className={`rounded-2xl border px-3 py-3 text-xs font-semibold shadow-sm ${colorBase}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-3">
          <span
            className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${offline ? 'bg-amber-500 animate-pulse' : 'bg-sky-500'}`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span>{offline ? 'Sin conexión · trabajando en local' : 'Cambios pendientes de sincronizar'}</span>
              {estado.pendientes > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold">
                  {estado.pendientes}
                </span>
              )}
            </div>
            {(detallePartes || detalleGps) && (
              <p className="mt-1 text-[11px] font-medium text-current/80">
                {[detallePartes, detalleGps].filter(Boolean).join('')}
              </p>
            )}
          </div>
        </div>
        {!offline && estado.pendientes > 0 && (
          <button
            type="button"
            onClick={sincronizarAhora}
            disabled={sincronizando}
            className="shrink-0 rounded-xl bg-white/85 px-3 py-1.5 text-[11px] font-bold text-sky-700 shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-sky-100 disabled:opacity-60"
          >
            {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
        )}
      </div>
    </div>
  );
}
