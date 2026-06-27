export function BotonVolverArriba({ visible, onClick, className = '' }) {
  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`fixed bottom-24 right-4 z-40 rounded-full border border-marca-200 bg-white px-4 py-3 text-xs font-bold text-marca-800 shadow-xl transition hover:bg-marca-50 lg:bottom-6 ${className}`}
      aria-label="Volver arriba"
    >
      Volver arriba
    </button>
  );
}
