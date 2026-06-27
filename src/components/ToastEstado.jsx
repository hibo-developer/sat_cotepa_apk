import { useEffect } from 'react';
import { CircleAlert, CircleCheckBig, X } from 'lucide-react';

const ESTILOS = {
  exito: {
    contenedor: 'border-emerald-200/90 bg-white/95 text-emerald-950 shadow-emerald-100/80',
    franja: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-800',
    icono: CircleCheckBig,
    iconoClase: 'text-emerald-600',
    descripcion: 'text-slate-700',
  },
  error: {
    contenedor: 'border-red-200/90 bg-white/95 text-red-950 shadow-red-100/80',
    franja: 'bg-red-500',
    badge: 'bg-red-100 text-red-800',
    icono: CircleAlert,
    iconoClase: 'text-red-600',
    descripcion: 'text-slate-700',
  },
};

export function ToastEstado({ toast, onClose }) {
  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      onClose();
    }, 3200);

    return () => window.clearTimeout(timerId);
  }, [toast, onClose]);

  if (!toast) {
    return null;
  }

  const estilo = ESTILOS[toast.tipo] || ESTILOS.exito;
  const Icono = estilo.icono;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4">
      <div
        className={`pointer-events-auto relative flex w-full max-w-lg items-start gap-3 overflow-hidden rounded-[1.75rem] border px-4 py-3.5 shadow-2xl ring-1 ring-slate-950/5 backdrop-blur-md ${estilo.contenedor}`}
        role="status"
        aria-live="polite"
      >
        <span className={`absolute inset-y-0 left-0 w-1 ${estilo.franja}`} aria-hidden="true" />
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-black/[0.03] shadow-sm">
          <Icono className={`h-5 w-5 ${estilo.iconoClase}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${estilo.badge}`}>
              {toast.tipo === 'error' ? 'Error' : 'Correcto'}
            </span>
            <p className="text-sm font-bold leading-5 tracking-tight">{toast.titulo}</p>
          </div>
          {toast.descripcion && <p className={`mt-1.5 text-sm leading-5 ${estilo.descripcion}`}>{toast.descripcion}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-transparent p-1.5 text-slate-500 transition hover:border-slate-200 hover:bg-black/5 hover:text-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-200"
          aria-label="Cerrar aviso"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
