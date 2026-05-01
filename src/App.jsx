import { useEffect, useState } from 'react';
import { NavbarInferior } from './components/NavbarInferior';
import { CambiarPasswordModal } from './components/CambiarPasswordModal';
import { useAuthSession } from './hooks/useAuthSession';
import { obtenerClienteSupabase, tieneConfiguracionSupabase } from './services/supabaseClient';
import logoCotepa from './assets/cotepa.jpg';
import { AdminView } from './views/AdminView';
import { AccesoView } from './views/AccesoView';
import { ClientesView } from './views/ClientesView';
import { ListaOrdenesView } from './views/ListaOrdenesView';
import { ParteTrabajoView } from './views/ParteTrabajoView';

const TITULOS = {
  ordenes: 'Panel SAT',
  parte: 'Nuevo Parte',
  clientes: 'Clientes',
  admin: 'Administración',
};

const NAV_ITEMS = [
  { key: 'ordenes', label: 'Órdenes' },
  { key: 'parte', label: 'Parte' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'admin', label: 'Admin' },
];

export default function App() {
  const [vistaActiva, setVistaActiva] = useState('ordenes');
  const [rolUsuario, setRolUsuario] = useState(null);
  const [verificandoRol, setVerificandoRol] = useState(false);
  const [mostrarCambiarPassword, setMostrarCambiarPassword] = useState(false);
  const { sesion, cargando, error, login, logout } = useAuthSession();
  const requiereLogin = tieneConfiguracionSupabase();
  const accesoBloqueado = requiereLogin && !sesion;
  const esAdmin = rolUsuario === 'admin';
  const tituloActual = accesoBloqueado
    ? 'Acceso'
    : !esAdmin && vistaActiva === 'admin'
      ? TITULOS.ordenes
      : TITULOS[vistaActiva] || TITULOS.ordenes;

  useEffect(() => {
    let cancelado = false;

    async function cargarRolUsuario() {
      if (!requiereLogin || !sesion?.user?.id) {
        setRolUsuario(null);
        setVerificandoRol(false);
        return;
      }

      setVerificandoRol(true);

      try {
        const supabase = obtenerClienteSupabase();
        const { data, error: perfilError } = await supabase
          .from('usuarios_sat')
          .select('rol')
          .eq('user_id', sesion.user.id)
          .maybeSingle();

        if (perfilError) {
          throw perfilError;
        }

        if (!cancelado) {
          setRolUsuario(data?.rol || null);
        }
      } catch {
        if (!cancelado) {
          setRolUsuario(null);
        }
      } finally {
        if (!cancelado) {
          setVerificandoRol(false);
        }
      }
    }

    cargarRolUsuario();

    return () => {
      cancelado = true;
    };
  }, [requiereLogin, sesion?.user?.id]);

  useEffect(() => {
    if (!accesoBloqueado && !verificandoRol && vistaActiva === 'admin' && !esAdmin) {
      setVistaActiva('ordenes');
    }
  }, [accesoBloqueado, esAdmin, verificandoRol, vistaActiva]);

  function cambiarVistaSegura(siguienteVista) {
    if (siguienteVista === 'admin' && !esAdmin) {
      return;
    }

    setVistaActiva(siguienteVista);
  }

  const navItemsVisibles = esAdmin
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => item.key !== 'admin');

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-4 pb-24 pt-5 lg:max-w-6xl lg:px-6 lg:pb-8">
      <header className="mb-4 overflow-hidden rounded-2xl border border-marca-100 bg-white shadow-tarjeta">
        <div className="h-2 w-full bg-cotepa-rojo-500" />
        <div className="flex items-center gap-3 p-3 lg:gap-4 lg:px-5 lg:py-4">
          <img
            src={logoCotepa}
            alt="Logo COTEPA"
            className="h-16 w-16 rounded-xl border border-marca-100 object-cover lg:h-20 lg:w-20"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-marca-700">SAT Móvil COTEPA</p>
            <p className="truncate text-base font-extrabold text-marca-900 lg:text-xl">Hornos y equipos para panificación</p>
          </div>
        </div>

        <div className="border-t border-marca-100 px-3 py-3 lg:px-5 lg:py-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-extrabold text-marca-900 lg:text-3xl">
              {tituloActual}
            </h1>
            {requiereLogin && sesion && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMostrarCambiarPassword(true)}
                  className="rounded-xl border border-marca-100 bg-white px-3 py-2 text-xs font-bold text-marca-700"
                >
                  Contrasena
                </button>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="rounded-xl border border-marca-100 bg-marca-50 px-3 py-2 text-xs font-bold text-marca-700"
                >
                  Cerrar sesion
                </button>
              </div>
            )}
          </div>

          {!accesoBloqueado && (
            <div className="mt-4 hidden lg:block">
              <nav aria-label="Navegación principal escritorio">
                <ul className="flex flex-wrap items-center gap-2">
                  {navItemsVisibles.map((item) => {
                    const activo = vistaActiva === item.key;
                    return (
                      <li key={item.key}>
                        <button
                          type="button"
                          onClick={() => cambiarVistaSegura(item.key)}
                          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                            activo
                              ? 'bg-cotepa-rojo-500 text-white shadow-md'
                              : 'bg-marca-50 text-marca-700 hover:bg-marca-100'
                          }`}
                        >
                          {item.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </div>
          )}
        </div>
      </header>

      <main className="lg:rounded-2xl lg:border lg:border-marca-100 lg:bg-white lg:p-5 lg:shadow-tarjeta">
        {accesoBloqueado ? (
          <AccesoView onLogin={login} cargandoSesion={cargando} errorSesion={error} />
        ) : (
          <>
            {vistaActiva === 'ordenes' && <ListaOrdenesView />}
            {vistaActiva === 'parte' && <ParteTrabajoView />}
            {vistaActiva === 'clientes' && <ClientesView />}
            {vistaActiva === 'admin' && esAdmin && <AdminView />}
          </>
        )}
      </main>

      {!accesoBloqueado && (
        <NavbarInferior vistaActiva={vistaActiva} onCambiarVista={cambiarVistaSegura} mostrarAdmin={esAdmin} />
      )}

      <CambiarPasswordModal
        abierto={mostrarCambiarPassword}
        onCerrar={() => setMostrarCambiarPassword(false)}
      />
    </div>
  );
}
