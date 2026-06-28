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
    ? 'border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 text-amber-950'
    : 'border-sky-200 bg-gradient-to-r from-sky-50 to-cyan-50 text-sky-950';

  const detallePartes = estado.pendientesPartes > 0
    ? ` · ${estado.pendientesPartes} parte${estado.pendientesPartes > 1 ? 's' : ''} por enviar`
    : '';
  const detalleGps = estado.pendientesGps > 0
    ? ` · ${estado.pendientesGps} punto${estado.pendientesGps > 1 ? 's' : ''} GPS`
    : '';
  const chipsDetalle = [
    estado.pendientesAcciones > 0 ? `${estado.pendientesAcciones} accion${estado.pendientesAcciones > 1 ? 'es' : ''}` : null,
    estado.pendientesPartes > 0 ? `${estado.pendientesPartes} parte${estado.pendientesPartes > 1 ? 's' : ''}` : null,
    estado.pendientesGps > 0 ? `${estado.pendientesGps} GPS` : null,
  ].filter(Boolean);

  return (
    <div
      role="status"
      className={`surface-card flex flex-col gap-3 border px-4 py-3 text-xs font-semibold sm:flex-row sm:items-center sm:justify-between ${colorBase}`}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full shadow-sm ${offline ? 'bg-amber-500 animate-pulse' : 'bg-sky-500'}`}
            aria-hidden="true"
          />
          <span className="leading-relaxed">
            {offline ? 'Sin conexión · trabajando en local' : 'Cambios pendientes de sincronizar'}
            {estado.pendientes > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full border border-white/80 bg-white/80 px-1.5 py-0.5 text-[10px] font-black shadow-sm">
                {estado.pendientes}
              </span>
            )}
            {detallePartes}
            {detalleGps}
          </span>
        </div>
        {chipsDetalle.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chipsDetalle.map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center rounded-full border border-white/80 bg-white/70 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-current/80"
              >
                {chip}
              </span>
            ))}
          </div>
        )}
      </div>
      {!offline && estado.pendientes > 0 && (
        <button
          type="button"
          onClick={sincronizarAhora}
          disabled={sincronizando}
          className="btn-secondary px-3 py-1.5 text-[11px] text-sky-700 disabled:opacity-60"
        >
          {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
      )}
    </div>
  );
}
