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
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-marca-100/90 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-2xl backdrop-blur lg:hidden">
      <ul className="mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-2">
        {itemsVisibles.map((item) => {
          const Icono = item.icono;
          const activo = vistaActiva === item.key;

          return (
            <li key={item.key} className="flex-1">
              <button
                type="button"
                onClick={() => onCambiarVista(item.key)}
                aria-current={activo ? 'page' : undefined}
                className={`relative flex w-full flex-col items-center justify-center rounded-2xl border px-2 py-3 text-sm font-semibold transition active:scale-95 focus:outline-none focus:ring-4 focus:ring-marca-100 ${
                  activo
                    ? 'border-cotepa-rojo-500 bg-cotepa-rojo-500 text-white shadow-lg shadow-red-200'
                    : 'border-transparent bg-marca-50 text-marca-700 hover:border-marca-100 hover:bg-marca-100'
                }`}
              >
                <span
                  className={`absolute inset-x-5 top-1 h-1 rounded-full transition ${
                    activo ? 'bg-white/90' : 'bg-transparent'
                  }`}
                  aria-hidden="true"
                />
                <Icono className="mb-1 h-6 w-6" strokeWidth={2.25} />
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
