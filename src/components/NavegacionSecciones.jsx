import { ChevronLeft, ChevronRight } from 'lucide-react';

function resolverIndiceActivo(secciones, seccionActiva) {
  const indice = secciones.findIndex((seccion) => seccion.id === seccionActiva);
  return indice >= 0 ? indice : 0;
}

export function NavegacionSecciones({
  secciones,
  seccionActiva,
  onIrSeccion,
  className = '',
}) {
  return (
    <nav
      aria-label="Navegacion por secciones"
      className={`w-full max-w-full overflow-hidden rounded-2xl border border-marca-100 bg-white/95 p-2 shadow-md md:sticky md:top-[calc(0.5rem+env(safe-area-inset-top))] md:z-30 md:backdrop-blur ${className}`}
    >
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {secciones.map((seccion) => {
          const activa = seccionActiva === seccion.id;
          return (
            <li key={seccion.id}>
              <button
                type="button"
                onClick={() => onIrSeccion(seccion.id)}
                className={`whitespace-nowrap rounded-xl px-2 py-1.5 text-[11px] font-bold transition sm:px-3 sm:py-2 sm:text-xs ${
                  activa
                    ? 'bg-cotepa-rojo-500 text-white shadow'
                    : 'bg-marca-50 text-marca-700 hover:bg-marca-100'
                }`}
                aria-current={activa ? 'page' : undefined}
              >
                {seccion.shortLabel || seccion.label}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="hidden px-1 pt-1 text-[11px] text-slate-500 sm:block">
        Seccion actual:{' '}
        <span className="font-semibold text-slate-700">
          {secciones.find((seccion) => seccion.id === seccionActiva)?.label || secciones[0]?.label}
        </span>
      </p>
    </nav>
  );
}

export function ControlesFlujoSecciones({
  secciones,
  seccionActiva,
  onIrSeccion,
  className = '',
}) {
  const indiceActivo = resolverIndiceActivo(secciones, seccionActiva);
  const anterior = secciones[indiceActivo - 1] || null;
  const siguiente = secciones[indiceActivo + 1] || null;

  return (
    <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => anterior && onIrSeccion(anterior.id)}
        disabled={!anterior}
        className="inline-flex items-center gap-1 rounded-xl border border-marca-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-marca-700 disabled:opacity-50 sm:px-3 sm:py-2 sm:text-xs"
      >
        <ChevronLeft className="h-4 w-4" />
        Seccion anterior
      </button>
      <button
        type="button"
        onClick={() => siguiente && onIrSeccion(siguiente.id)}
        disabled={!siguiente}
        className="inline-flex items-center gap-1 rounded-xl border border-marca-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-marca-700 disabled:opacity-50 sm:px-3 sm:py-2 sm:text-xs"
      >
        Siguiente seccion
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
