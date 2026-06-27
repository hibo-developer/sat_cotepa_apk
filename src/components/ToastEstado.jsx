import { useEffect } from 'react';
import { CircleAlert, CircleCheckBig, X } from 'lucide-react';

const ESTILOS = {
  exito: {
    contenedor: 'border-emerald-200 bg-white/95 text-emerald-950',
    franja: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-800',
    icono: CircleCheckBig,
    iconoClase: 'text-emerald-600',
  },
  error: {
    contenedor: 'border-red-200 bg-white/95 text-red-950',
    franja: 'bg-red-500',
    badge: 'bg-red-100 text-red-800',
    icono: CircleAlert,
    iconoClase: 'text-red-600',
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
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div
        className={`pointer-events-auto relative flex w-full max-w-md items-start gap-3 overflow-hidden rounded-3xl border px-4 py-3 shadow-2xl backdrop-blur-sm ${estilo.contenedor}`}
        role="status"
        aria-live="polite"
      >
        <span className={`absolute inset-y-0 left-0 w-1 ${estilo.franja}`} aria-hidden="true" />
        <Icono className={`mt-0.5 h-5 w-5 shrink-0 ${estilo.iconoClase}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${estilo.badge}`}>
              {toast.tipo === 'error' ? 'Error' : 'Correcto'}
            </span>
            <p className="text-sm font-bold">{toast.titulo}</p>
          </div>
          {toast.descripcion && <p className="mt-1 text-sm leading-5 text-slate-700">{toast.descripcion}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-slate-500 transition hover:bg-black/5 hover:text-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-200"
          aria-label="Cerrar aviso"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
