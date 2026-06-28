import { useEffect } from 'react';
import { CircleAlert, CircleCheckBig, X } from 'lucide-react';

const ESTILOS = {
  exito: {
    contenedor: 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-950',
    icono: CircleCheckBig,
    iconoClase: 'text-emerald-600',
    barra: 'from-emerald-500 to-teal-500',
  },
  error: {
    contenedor: 'border-red-200 bg-gradient-to-r from-red-50 to-rose-50 text-red-950',
    icono: CircleAlert,
    iconoClase: 'text-red-600',
    barra: 'from-red-500 to-rose-500',
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
  const descripcionId = toast.descripcion ? 'toast-estado-descripcion' : undefined;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 sm:bottom-28">
      <div
        className={`pointer-events-auto relative flex w-full max-w-lg items-start gap-3 overflow-hidden rounded-[1.4rem] border px-4 py-3 shadow-hero backdrop-blur-xl ${estilo.contenedor}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-describedby={descripcionId}
      >
        <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${estilo.barra}`} aria-hidden="true" />
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/70 shadow-sm">
          <Icono className={`h-5 w-5 ${estilo.iconoClase}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black tracking-tight">{toast.titulo}</p>
          {toast.descripcion && (
            <p id={descripcionId} className="mt-1 text-sm leading-5 text-current/80">
              {toast.descripcion}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/70 bg-white/60 p-1.5 text-sat-subtle transition hover:bg-white hover:text-sat-muted"
          aria-label="Cerrar aviso"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
