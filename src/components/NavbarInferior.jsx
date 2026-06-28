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
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-marca-100/80 bg-white/92 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-2xl backdrop-blur-xl lg:hidden">
      <div className="mx-auto mb-2 h-1 w-12 rounded-full bg-marca-100/90" aria-hidden="true" />
      <ul className="mx-auto grid w-full max-w-screen-2xl auto-cols-fr grid-flow-col items-stretch gap-2">
        {itemsVisibles.map((item) => {
          const Icono = item.icono;
          const activo = vistaActiva === item.key;

          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onCambiarVista(item.key)}
                className={`flex w-full flex-col items-center justify-center rounded-[1.35rem] px-2 py-3 text-[11px] font-bold transition active:scale-95 ${
                  activo
                    ? 'bg-gradient-to-br from-cotepa-rojo-500 to-cotepa-rojo-600 text-white shadow-lift'
                    : 'bg-white/70 text-marca-700 shadow-sm hover:-translate-y-0.5 hover:bg-marca-50'
                }`}
                aria-current={activo ? 'page' : undefined}
              >
                <span className={`mb-1 flex h-8 w-8 items-center justify-center rounded-2xl ${activo ? 'bg-white/15' : 'bg-marca-50'}`}>
                  <Icono className={`h-5 w-5 ${activo ? '' : 'text-marca-600'}`} strokeWidth={2.25} />
                </span>
                <span className="leading-tight">{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
