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
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-navegacion-titulo"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-[1.8rem] border border-white/70 bg-white/95 shadow-hero backdrop-blur-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-sat-border-soft px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="chip-soft">Navegación externa</span>
              <p id="modal-navegacion-titulo" className="mt-3 text-xl font-black tracking-tight text-sat-text">
                Elegir navegación
              </p>
              <p className="mt-1 text-sm leading-6 text-sat-muted">
                Selecciona la app que quieres usar para ir al cliente con el acceso más directo.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="modal-close"
              aria-label="Cerrar modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-3 px-5 py-5">
          {appsDisponibles.map((app) => {
            const meta = APP_META[app];
            const Icono = meta.Icono;

            return (
              <button
                key={app}
                type="button"
                onClick={() => onSelect(app, recordar)}
                className="flex w-full items-center gap-3 rounded-[1.3rem] border border-sat-border-soft bg-white/80 px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-marca-300 hover:bg-marca-50 hover:shadow-suave"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 bg-sat-surface-alt text-sat-muted shadow-sm">
                  <Icono className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black tracking-tight text-sat-text">{meta.nombre}</span>
                  <span className="mt-0.5 block text-xs text-sat-subtle">
                    Abrir destino con esta aplicación
                  </span>
                </span>
              </button>
            );
          })}
          {appsDisponibles.length === 0 && (
            <p className="status-banner-warning text-xs">
              No hay aplicaciones compatibles detectadas en este dispositivo.
            </p>
          )}

          <label className="surface-panel flex items-center gap-3 px-4 py-3 text-sm text-sat-muted">
            <input
              type="checkbox"
              checked={recordar}
              onChange={(event) => setRecordar(event.target.checked)}
              className="h-4 w-4 rounded border-sat-border"
            />
            <span>
              <span className="block font-semibold text-sat-text">Recordar mi elección</span>
              <span className="block text-xs text-sat-subtle">La próxima vez se abrirá directamente la app elegida.</span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
