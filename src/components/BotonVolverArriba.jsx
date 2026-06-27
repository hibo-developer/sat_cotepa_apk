export function BotonVolverArriba({ visible, onClick, className = '' }) {
  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 inline-flex items-center gap-2.5 rounded-full border border-marca-200/90 bg-gradient-to-b from-white to-marca-50/80 px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-marca-800 shadow-[0_22px_40px_-26px_rgba(15,23,42,0.45)] ring-1 ring-slate-950/5 backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:border-marca-300 hover:from-white hover:to-marca-100/80 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-marca-100 lg:bottom-6 ${className}`}
      aria-label="Volver arriba"
    >
      <span
        aria-hidden="true"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/90 bg-white text-sm leading-none text-marca-700 shadow-sm ring-1 ring-marca-100/80"
      >
        ↑
      </span>
      <span className="leading-none tracking-[0.16em]">Volver arriba</span>
    </button>
  );
}
