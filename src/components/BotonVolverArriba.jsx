export function BotonVolverArriba({ visible, onClick, className = '' }) {
  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`fixed bottom-[calc(6.9rem+env(safe-area-inset-bottom))] right-3 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/80 bg-white/94 p-0 text-marca-800 shadow-hero backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-marca-50 sm:bottom-[calc(7.4rem+env(safe-area-inset-bottom))] sm:right-4 sm:h-auto sm:w-auto sm:gap-2 sm:px-4 sm:py-3 sm:text-xs sm:font-black sm:tracking-[0.08em] lg:bottom-6 ${className}`}
      aria-label="Volver arriba"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-marca-50 text-[13px] text-marca-700 sm:h-6 sm:w-6 sm:text-[11px]">
        ↑
      </span>
      <span className="sr-only sm:not-sr-only">Volver arriba</span>
    </button>
  );
}
