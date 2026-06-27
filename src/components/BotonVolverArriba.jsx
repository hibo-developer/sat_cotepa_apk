export function BotonVolverArriba({ visible, onClick, className = '' }) {
  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`fixed bottom-24 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-marca-200 bg-white/95 px-4 py-3 text-xs font-bold text-marca-800 shadow-xl backdrop-blur-sm transition hover:bg-marca-50 focus:outline-none focus:ring-4 focus:ring-marca-100 lg:bottom-6 ${className}`}
      aria-label="Volver arriba"
    >
      <span aria-hidden="true" className="text-sm leading-none">↑</span>
      Volver arriba
    </button>
  );
}
