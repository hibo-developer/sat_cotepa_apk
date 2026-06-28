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

  return (
    <nav
      aria-label="Navegacion por secciones"
      className={`w-full max-w-full overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/92 p-3 shadow-hero backdrop-blur-xl md:sticky md:top-[calc(0.5rem+env(safe-area-inset-top))] md:z-30 ${className}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="metric-label">Navegacion guiada</p>
          <p className="mt-1 text-sm font-black tracking-tight text-sat-text">
            {secciones.find((seccion) => seccion.id === seccionActiva)?.label || secciones[0]?.label}
          </p>
        </div>
        {resumenProgreso && (
          <div className="surface-panel px-3 py-2 text-[11px] font-semibold text-sat-muted">
            {`Sección ${resumenProgreso.indiceActual} de ${resumenProgreso.totalSecciones} · ${resumenProgreso.porcentaje}% completado`}
          </div>
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
                className={`whitespace-nowrap rounded-2xl border px-2.5 py-2 text-[11px] font-bold transition sm:px-3.5 sm:py-2.5 sm:text-xs ${
                  activa
                    ? 'border-cotepa-rojo-500 bg-gradient-to-br from-cotepa-rojo-500 to-cotepa-rojo-600 text-white shadow-lift'
                    : conError.has(seccion.id)
                      ? 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
                      : completadas.has(seccion.id)
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        : 'border-transparent bg-marca-50 text-marca-700 hover:bg-marca-100'
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
      <p className="hidden px-1 pt-2 text-[11px] text-sat-subtle sm:block">
        Seccion actual:{' '}
        <span className="font-semibold text-sat-muted">
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
        className="btn-secondary px-2.5 py-1.5 text-[11px] disabled:opacity-50 sm:px-3 sm:py-2 sm:text-xs"
      >
        <ChevronLeft className="h-4 w-4" />
        Seccion anterior
      </button>
      <button
        type="button"
        onClick={() => siguiente && onIrSeccion(siguiente.id)}
        disabled={!siguiente}
        className="btn-secondary px-2.5 py-1.5 text-[11px] disabled:opacity-50 sm:px-3 sm:py-2 sm:text-xs"
      >
        Siguiente seccion
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
