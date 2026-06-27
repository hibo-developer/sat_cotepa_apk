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
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-marca-100/80 bg-white/90 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-2xl backdrop-blur lg:hidden">
      <ul className="mx-auto flex w-full max-w-screen-md items-center justify-between gap-2 rounded-[2rem] border border-white/80 bg-white/75 p-1.5 shadow-lg shadow-slate-200/70 ring-1 ring-black/5">
        {itemsVisibles.map((item) => {
          const Icono = item.icono;
          const activo = vistaActiva === item.key;

          return (
            <li key={item.key} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onCambiarVista(item.key)}
                aria-current={activo ? 'page' : undefined}
                className={`group relative flex min-h-[4.5rem] w-full flex-col items-center justify-center overflow-hidden rounded-[1.35rem] border px-2 py-2.5 text-[11px] font-semibold leading-4 tracking-[0.01em] transition duration-200 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-marca-100 ${
                  activo
                    ? 'border-cotepa-rojo-400/90 bg-gradient-to-b from-cotepa-rojo-500 to-cotepa-rojo-600 text-white shadow-lg shadow-red-200/80'
                    : 'border-transparent bg-white/70 text-marca-700 hover:border-marca-100 hover:bg-marca-50/90'
                }`}
              >
                <span
                  className={`absolute inset-x-4 top-1.5 h-1 rounded-full transition ${
                    activo ? 'bg-white/90' : 'bg-transparent group-hover:bg-marca-200'
                  }`}
                  aria-hidden="true"
                />
                <span
                  className={`mb-1.5 flex h-9 w-9 items-center justify-center rounded-2xl transition ${
                    activo ? 'bg-white/15 text-white' : 'bg-marca-50 text-marca-600 group-hover:bg-white'
                  }`}
                  aria-hidden="true"
                >
                  <Icono className="h-5 w-5" strokeWidth={2.25} />
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
