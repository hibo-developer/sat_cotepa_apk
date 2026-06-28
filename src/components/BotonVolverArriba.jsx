export function BotonVolverArriba({ visible, onClick, className = '' }) {
  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`fixed bottom-24 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/92 px-4 py-3 text-xs font-black tracking-[0.08em] text-marca-800 shadow-hero backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-marca-50 lg:bottom-6 ${className}`}
      aria-label="Volver arriba"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-marca-50 text-[11px] text-marca-700">
        ↑
      </span>
      Volver arriba
    </button>
  );
}
