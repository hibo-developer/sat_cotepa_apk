import { ClipboardList, FilePlus2, Package, Settings, Users } from 'lucide-react';

const ITEMS = [
  { key: 'ordenes', label: 'Órdenes', icono: ClipboardList },
  { key: 'parte', label: 'Parte', icono: FilePlus2 },
  { key: 'clientes', label: 'Clientes', icono: Users },
  { key: 'inventario', label: 'Inventario', icono: Package },
  { key: 'admin', label: 'Admin', icono: Settings },
];

export function NavbarInferior({
  vistaActiva,
  onCambiarVista,
  mostrarAdmin = false,
  mostrarClientes = true,
  mostrarInventario = true,
}) {
  const itemsVisibles = ITEMS.filter((item) => {
    if (item.key === 'admin') {
      return mostrarAdmin;
    }

    if (item.key === 'clientes') {
      return mostrarClientes;
    }

    if (item.key === 'inventario') {
      return mostrarInventario;
    }

    return true;
  });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-marca-100/70 bg-gradient-to-t from-white via-white/95 to-white/75 px-3 pb-[calc(0.85rem+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-14px_34px_-24px_rgba(15,23,42,0.4)] backdrop-blur-md lg:hidden">
      <ul className="mx-auto flex w-full max-w-screen-md items-center justify-between gap-2 rounded-[2.15rem] border border-white/80 bg-white/80 p-1.5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.4)] ring-1 ring-black/5">
        {itemsVisibles.map((item) => {
          const Icono = item.icono;
          const activo = vistaActiva === item.key;

          return (
            <li key={item.key} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onCambiarVista(item.key)}
                aria-current={activo ? 'page' : undefined}
                className={`group relative flex min-h-[4.65rem] w-full flex-col items-center justify-center overflow-hidden rounded-[1.45rem] border px-2 py-2.5 text-[11px] font-semibold leading-4 tracking-[0.01em] transition duration-200 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-marca-100 ${
                  activo
                    ? 'border-cotepa-rojo-300/90 bg-gradient-to-b from-cotepa-rojo-500 via-cotepa-rojo-500 to-cotepa-rojo-600 text-white shadow-[0_18px_32px_-20px_rgba(220,38,38,0.9)] ring-1 ring-white/15'
                    : 'border-white/70 bg-white/72 text-marca-700 shadow-sm shadow-slate-200/50 hover:-translate-y-0.5 hover:border-marca-100 hover:bg-marca-50/95 hover:shadow-md'
                }`}
              >
                <span
                  className={`absolute inset-x-3 bottom-0 h-10 rounded-full blur-2xl transition ${
                    activo ? 'bg-cotepa-rojo-950/25' : 'bg-transparent group-hover:bg-marca-200/40'
                  }`}
                  aria-hidden="true"
                />
                <span
                  className={`absolute inset-x-4 top-1.5 h-1 rounded-full transition ${
                    activo ? 'bg-white/95' : 'bg-transparent group-hover:bg-marca-200/80'
                  }`}
                  aria-hidden="true"
                />
                <span
                  className={`relative z-10 mb-1.5 flex h-9 w-9 items-center justify-center rounded-2xl border transition ${
                    activo
                      ? 'border-white/15 bg-white/15 text-white shadow-inner'
                      : 'border-white bg-marca-50 text-marca-600 shadow-sm group-hover:bg-white group-hover:text-marca-700'
                  }`}
                  aria-hidden="true"
                >
                  <Icono className="h-5 w-5" strokeWidth={2.25} />
                </span>
                <span className="relative z-10 truncate">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
