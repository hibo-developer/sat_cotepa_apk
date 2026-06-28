import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const modal = (
    <>
      <div className="modal-overlay z-[70]" onClick={onClose} aria-hidden="true" />
      <div
        className="modal-shell z-[70]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-navegacion-titulo"
      >
        <div
          className="modal-card relative max-h-[calc(100dvh-2rem)] max-w-lg overflow-hidden"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-header">
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

          <div className="modal-body max-h-[calc(100dvh-9rem)] overflow-y-auto overscroll-contain">
            <div className="modal-section">
              <p className="metric-label">Ayuda rápida</p>
              <p className="mt-2 text-[11px] leading-5 text-sat-subtle">
                Elige la app con la que sueles navegar. Si activas el recordatorio, SAT usará esa opción en futuros accesos.
              </p>
            </div>
            {appsDisponibles.map((app) => {
              const meta = APP_META[app];
              const Icono = meta.Icono;

              return (
                <button
                  key={app}
                  type="button"
                  onClick={() => onSelect(app, recordar)}
                  className="choice-card"
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

            <label className="modal-section flex items-center gap-3 text-sm text-sat-muted">
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
    </>
  );

  return createPortal(modal, document.body);
}
