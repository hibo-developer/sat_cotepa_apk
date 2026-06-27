import { useEffect } from 'react';
import { CircleAlert, CircleCheckBig, X } from 'lucide-react';

const ESTILOS = {
  exito: {
    contenedor: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icono: CircleCheckBig,
    iconoClase: 'text-emerald-600',
  },
  error: {
    contenedor: 'border-red-200 bg-red-50 text-red-900',
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
        className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border px-4 py-3 shadow-xl ${estilo.contenedor}`}
        role="status"
        aria-live="polite"
      >
        <Icono className={`mt-0.5 h-5 w-5 shrink-0 ${estilo.iconoClase}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{toast.titulo}</p>
          {toast.descripcion && <p className="mt-1 text-sm leading-5">{toast.descripcion}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-sat-subtle transition hover:bg-black/5 hover:text-sat-muted"
          aria-label="Cerrar aviso"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}