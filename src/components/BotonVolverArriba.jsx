export function BotonVolverArriba({ visible, onClick, className = '' }) {
  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`fixed bottom-24 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-marca-200/90 bg-white/95 px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-marca-800 shadow-2xl shadow-slate-200/70 backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:bg-marca-50 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-marca-100 lg:bottom-6 ${className}`}
      aria-label="Volver arriba"
    >
      <span
        aria-hidden="true"
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-marca-100 text-sm leading-none text-marca-700"
      >
        ↑
      </span>
      <span className="leading-none">Volver arriba</span>
    </button>
  );
}
