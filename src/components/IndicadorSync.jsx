import { useEffect, useState } from 'react';
import {
  contarPendientes,
  estaOnline,
  procesarCola,
  suscribirseEstadoSync,
} from '../services/offlineSyncService';

export function IndicadorSync() {
  const [estado, setEstado] = useState({ online: estaOnline(), pendientes: 0 });
  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    let activo = true;
    contarPendientes().then((n) => {
      if (activo) setEstado((s) => ({ ...s, pendientes: n }));
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
      await procesarCola();
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

  return (
    <div
      role="status"
      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm ${colorBase}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${offline ? 'bg-amber-500 animate-pulse' : 'bg-sky-500'}`}
          aria-hidden="true"
        />
        <span>
          {offline ? 'Sin conexión · trabajando en local' : 'Cambios pendientes de sincronizar'}
          {estado.pendientes > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-bold">
              {estado.pendientes}
            </span>
          )}
        </span>
      </div>
      {!offline && estado.pendientes > 0 && (
        <button
          type="button"
          onClick={sincronizarAhora}
          disabled={sincronizando}
          className="rounded-lg bg-white/80 px-2.5 py-1 text-[11px] font-bold text-sky-700 transition hover:bg-white disabled:opacity-60"
        >
          {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
      )}
    </div>
  );
}
