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
    ? 'border-amber-200/90 bg-white/95 text-amber-950 shadow-amber-100/80'
    : 'border-sky-200/90 bg-white/95 text-sky-950 shadow-sky-100/80';

  const detallePartes = estado.pendientesPartes > 0
    ? ` · ${estado.pendientesPartes} parte${estado.pendientesPartes > 1 ? 's' : ''} por enviar`
    : '';
  const detalleGps = estado.pendientesGps > 0
    ? ` · ${estado.pendientesGps} punto${estado.pendientesGps > 1 ? 's' : ''} GPS`
    : '';

  return (
    <div
      role="status"
      className={`overflow-hidden rounded-[1.75rem] border px-4 py-3.5 text-xs font-semibold shadow-xl backdrop-blur-sm ${colorBase}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-3">
          <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${offline ? 'bg-amber-100/80' : 'bg-sky-100/80'}`}>
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${offline ? 'bg-amber-500 animate-pulse' : 'bg-sky-500'}`}
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold leading-5">
                {offline ? 'Sin conexión · trabajando en local' : 'Cambios pendientes de sincronizar'}
              </span>
              {estado.pendientes > 0 && (
                <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${offline ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>
                  {estado.pendientes}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] font-medium leading-5 text-current/75">
              {offline ? 'Los cambios seguiran guardandose en el dispositivo hasta recuperar la conexion.' : 'La informacion local esta lista para enviarse en cuanto completes la sincronizacion.'}
            </p>
            {(detallePartes || detalleGps) && (
              <p className="mt-1.5 text-[11px] font-medium leading-5 text-current/80">
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
            className="shrink-0 rounded-2xl border border-sky-200 bg-sky-50 px-3.5 py-2 text-[11px] font-bold text-sky-700 shadow-sm transition hover:bg-sky-100 focus:outline-none focus:ring-4 focus:ring-sky-100 disabled:opacity-60"
          >
            {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
        )}
      </div>
    </div>
  );
}
