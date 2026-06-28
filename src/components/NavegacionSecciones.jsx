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
      className={`w-full max-w-full overflow-hidden rounded-[1.85rem] border border-marca-100/90 bg-gradient-to-br from-white via-white to-marca-50/50 p-3.5 shadow-[0_24px_55px_-34px_rgba(15,23,42,0.35)] ring-1 ring-black/5 md:sticky md:top-[calc(0.5rem+env(safe-area-inset-top))] md:z-30 md:backdrop-blur ${className}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-marca-600">Navegación</p>
          <p className="mt-1 text-sm font-bold leading-5 text-slate-800">
            {seccionActual?.label || 'Sección actual'}
          </p>
        </div>
        {resumenProgreso && (
          <span className="shrink-0 rounded-full border border-marca-100/90 bg-white/85 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-marca-700 shadow-sm ring-1 ring-white/80">
            {`${resumenProgreso.porcentaje}%`}
          </span>
        )}
      </div>
      <ul className="flex gap-2 overflow-x-auto pb-1.5">
        {secciones.map((seccion) => {
          const activa = seccionActiva === seccion.id;
          return (
            <li key={seccion.id}>
              <button
                type="button"
                onClick={() => onIrSeccion(seccion.id)}
                className={`whitespace-nowrap rounded-[1.1rem] border px-3 py-2 text-[11px] font-bold shadow-sm transition duration-200 focus:outline-none focus:ring-4 focus:ring-marca-100 sm:px-3.5 sm:text-xs ${
                  activa
                    ? 'border-cotepa-rojo-400/90 bg-gradient-to-b from-cotepa-rojo-500 to-cotepa-rojo-600 text-white shadow-lg shadow-red-200/80'
                    : conError.has(seccion.id)
                      ? 'border-rose-200/90 bg-rose-50/95 text-rose-800 hover:border-rose-300 hover:bg-rose-100'
                      : completadas.has(seccion.id)
                        ? 'border-emerald-200/90 bg-emerald-50/95 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100'
                        : 'border-transparent bg-white/75 text-marca-700 hover:border-marca-100 hover:bg-marca-50/95'
                }`}
                aria-current={activa ? 'page' : undefined}
              >
                {seccion.shortLabel || seccion.label}
                {conError.has(seccion.id) && <span className="ml-1 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] shadow-sm">!</span>}
                {!conError.has(seccion.id) && completadas.has(seccion.id) && <span className="ml-1 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] shadow-sm">OK</span>}
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
        className="inline-flex items-center gap-1.5 rounded-2xl border border-marca-200/90 bg-white/95 px-3.5 py-2.5 text-[11px] font-semibold text-marca-700 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-marca-300 hover:bg-marca-50 focus:outline-none focus:ring-4 focus:ring-marca-100 disabled:opacity-50 sm:text-xs"
      >
        <ChevronLeft className="h-4 w-4" />
        Seccion anterior
      </button>
      <button
        type="button"
        onClick={() => siguiente && onIrSeccion(siguiente.id)}
        disabled={!siguiente}
        className="inline-flex items-center gap-1.5 rounded-2xl border border-marca-200/90 bg-white/95 px-3.5 py-2.5 text-[11px] font-semibold text-marca-700 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-marca-300 hover:bg-marca-50 focus:outline-none focus:ring-4 focus:ring-marca-100 disabled:opacity-50 sm:text-xs"
      >
        Siguiente seccion
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
