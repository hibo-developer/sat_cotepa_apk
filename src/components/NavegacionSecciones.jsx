import { ChevronLeft, ChevronRight } from 'lucide-react';

function resolverIndiceActivo(secciones, seccionActiva) {
  const indice = secciones.findIndex((seccion) => seccion.id === seccionActiva);
  return indice >= 0 ? indice : 0;
}

export function NavegacionSecciones({
  secciones,
  seccionActiva,
  onIrSeccion,
  seccionesConError = [],
  seccionesCompletadas = [],
  resumenProgreso = null,
  className = '',
}) {
  const conError = new Set(seccionesConError);
  const completadas = new Set(seccionesCompletadas);
  const seccionActual = secciones.find((seccion) => seccion.id === seccionActiva) || secciones[0] || null;

  return (
    <nav
      aria-label="Navegacion por secciones"
      className={`w-full max-w-full overflow-hidden rounded-3xl border border-marca-100 bg-white/95 p-3 shadow-md md:sticky md:top-[calc(0.5rem+env(safe-area-inset-top))] md:z-30 md:backdrop-blur ${className}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-marca-600">Navegación</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {seccionActual?.label || 'Sección actual'}
          </p>
        </div>
        {resumenProgreso && (
          <span className="shrink-0 rounded-full border border-marca-100 bg-marca-50 px-3 py-1 text-[11px] font-bold text-marca-700">
            {`${resumenProgreso.porcentaje}%`}
          </span>
        )}
      </div>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {secciones.map((seccion) => {
          const activa = seccionActiva === seccion.id;
          return (
            <li key={seccion.id}>
              <button
                type="button"
                onClick={() => onIrSeccion(seccion.id)}
                className={`whitespace-nowrap rounded-2xl border px-3 py-2 text-[11px] font-bold transition focus:outline-none focus:ring-4 focus:ring-marca-100 sm:px-3.5 sm:text-xs ${
                  activa
                    ? 'border-cotepa-rojo-500 bg-cotepa-rojo-500 text-white shadow shadow-red-200'
                    : conError.has(seccion.id)
                      ? 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
                      : completadas.has(seccion.id)
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        : 'border-transparent bg-marca-50 text-marca-700 hover:border-marca-100 hover:bg-marca-100'
                }`}
                aria-current={activa ? 'page' : undefined}
              >
                {seccion.shortLabel || seccion.label}
                {conError.has(seccion.id) && <span className="ml-1">!</span>}
                {!conError.has(seccion.id) && completadas.has(seccion.id) && <span className="ml-1">OK</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="hidden px-1 pt-2 text-[11px] text-slate-500 sm:block">
        Seccion actual:{' '}
        <span className="font-semibold text-slate-700">
          {seccionActual?.label}
        </span>
      </p>
      {resumenProgreso && (
        <p className="px-1 pt-1 text-[11px] text-slate-600">
          {`Sección ${resumenProgreso.indiceActual} de ${resumenProgreso.totalSecciones} · ${resumenProgreso.porcentaje}% completado`}
        </p>
      )}
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
        className="inline-flex items-center gap-1 rounded-2xl border border-marca-200 bg-white px-3 py-2 text-[11px] font-semibold text-marca-700 shadow-sm transition hover:bg-marca-50 focus:outline-none focus:ring-4 focus:ring-marca-100 disabled:opacity-50 sm:text-xs"
      >
        <ChevronLeft className="h-4 w-4" />
        Seccion anterior
      </button>
      <button
        type="button"
        onClick={() => siguiente && onIrSeccion(siguiente.id)}
        disabled={!siguiente}
        className="inline-flex items-center gap-1 rounded-2xl border border-marca-200 bg-white px-3 py-2 text-[11px] font-semibold text-marca-700 shadow-sm transition hover:bg-marca-50 focus:outline-none focus:ring-4 focus:ring-marca-100 disabled:opacity-50 sm:text-xs"
      >
        Siguiente seccion
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
