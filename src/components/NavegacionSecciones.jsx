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
      className={`sticky top-[calc(0.5rem+env(safe-area-inset-top))] z-30 rounded-2xl border border-marca-100 bg-white/95 p-2 shadow-md backdrop-blur ${className}`}
    >
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {secciones.map((seccion) => {
          const activa = seccionActiva === seccion.id;
          return (
            <li key={seccion.id}>
              <button
                type="button"
                onClick={() => onIrSeccion(seccion.id)}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition ${
                  activa
                    ? 'bg-cotepa-rojo-500 text-white shadow'
                    : 'bg-marca-50 text-marca-700 hover:bg-marca-100'
                }`}
                aria-current={activa ? 'page' : undefined}
              >
                {seccion.label}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="px-1 pt-1 text-[11px] text-slate-500">
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
        className="inline-flex items-center gap-1 rounded-xl border border-marca-200 bg-white px-3 py-2 text-xs font-semibold text-marca-700 disabled:opacity-50"
      >
        <ChevronLeft className="h-4 w-4" />
        Seccion anterior
      </button>
      <button
        type="button"
        onClick={() => siguiente && onIrSeccion(siguiente.id)}
        disabled={!siguiente}
        className="inline-flex items-center gap-1 rounded-xl border border-marca-200 bg-white px-3 py-2 text-xs font-semibold text-marca-700 disabled:opacity-50"
      >
        Siguiente seccion
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
