import { useEffect, useState } from 'react';
import { Compass, MapPinned, Route, Send, X } from 'lucide-react';
import type { AppNavegacion } from '../services/navegacion';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (app: AppNavegacion, recordar: boolean) => void | Promise<void>;
  appsDisponibles: AppNavegacion[];
};

const APP_META: Record<AppNavegacion, { nombre: string; Icono: typeof Compass }> = {
  waze: { nombre: 'Waze', Icono: Compass },
  google: { nombre: 'Google Maps', Icono: MapPinned },
  sygic: { nombre: 'Sygic', Icono: Route },
  system: { nombre: 'Otra app', Icono: Send },
};

export function ModalElegirNavegacion({ isOpen, onClose, onSelect, appsDisponibles }: Props) {
  const [recordar, setRecordar] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setRecordar(false);
      return undefined;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-navegacion-titulo"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-marca-100 bg-white p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-marca-100 bg-marca-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-marca-700">
              <Compass className="h-3.5 w-3.5" />
              Navegación
            </div>
            <p id="modal-navegacion-titulo" className="text-lg font-bold text-slate-900">
              Elegir navegación
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Selecciona la app que quieres usar para ir al cliente.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-4 focus:ring-marca-100"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {appsDisponibles.map((app) => {
            const meta = APP_META[app];
            const Icono = meta.Icono;

            return (
              <button
                key={app}
                type="button"
                onClick={() => onSelect(app, recordar)}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:border-marca-300 hover:bg-marca-50 focus:outline-none focus:ring-4 focus:ring-marca-100"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                  <Icono className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800">{meta.nombre}</span>
                  <span className="block text-xs text-slate-500">
                    {app === 'system' ? 'Usar la app disponible en el dispositivo' : 'Abrir directamente esta aplicación'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={recordar}
            onChange={(event) => setRecordar(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Recordar mi elección
        </label>
      </div>
    </div>
  );
}
