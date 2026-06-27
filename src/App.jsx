import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { NavbarInferior } from './components/NavbarInferior';
import { IndicadorSync } from './components/IndicadorSync';
import { CambiarPasswordModal } from './components/CambiarPasswordModal';
import { MfaModal } from './components/MfaModal';
import { BotonVolverArriba } from './components/BotonVolverArriba';
import { useAuthSession } from './hooks/useAuthSession';
import { precargarCatalogosOffline } from './services/catalogosService';
import { estaOnline } from './services/offlineSyncService';
import { obtenerClienteSupabase, tieneConfiguracionSupabase } from './services/supabaseClient';
import { registrarRetornoRapido } from './services/navegacionMetricasService';
import logoCotepa from './assets/cotepa.jpg';
import { AdminView } from './views/AdminView';
import { AccesoView } from './views/AccesoView';
import { ClientesView } from './views/ClientesView';
import { InventarioView } from './views/InventarioView';
import { ListaOrdenesView } from './views/ListaOrdenesView';
import { ParteTrabajoView } from './views/ParteTrabajoView';
import { PartePemView } from './views/PartePemView';

const TITULOS = {
  ordenes: 'Panel SAT',
  parte: 'Nuevo Parte',
  clientes: 'Clientes y Equipos',
  inventario: 'Inventario de Materiales',
  admin: 'Administración',
};

const NAV_ITEMS = [
  { key: 'ordenes', label: 'Órdenes' },
  { key: 'parte', label: 'Parte' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'inventario', label: 'Inventario' },
  { key: 'admin', label: 'Admin' },
];

const RUTA_POR_VISTA = {
  ordenes: '/ordenes',
  parte: '/parte',
  clientes: '/clientes',
  inventario: '/inventario',
  admin: '/admin',
};

const CACHE_KEY_USUARIO_SAT = 'sat_cache_usuario_sat_v1';

function leerPerfilUsuarioCacheado(userId) {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY_USUARIO_SAT);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || parsed.userId !== userId) return null;
    return {
      rol: parsed.rol || null,
      nombre_visible: parsed.nombre_visible || '',
    };
  } catch {
    return null;
  }
}

function guardarPerfilUsuarioCacheado(userId, perfil) {
  if (!userId) return;
  try {
    localStorage.setItem(CACHE_KEY_USUARIO_SAT, JSON.stringify({
      userId,
      rol: perfil?.rol || null,
      nombre_visible: perfil?.nombre_visible || '',
      updatedAt: Date.now(),
    }));
  } catch {}
}

function obtenerVistaDesdeRuta(pathname) {
  if (pathname.startsWith('/parte')) {
    return 'parte';
  }

  if (pathname.startsWith('/clientes')) {
    return 'clientes';
  }

  if (pathname.startsWith('/inventario')) {
    return 'inventario';
  }

  if (pathname.startsWith('/admin')) {
    return 'admin';
  }

  return 'ordenes';
}

export default function App() {
  const [rolUsuario, setRolUsuario] = useState(null);
  const [nombreVisibleUsuario, setNombreVisibleUsuario] = useState('');
  const [verificandoRol, setVerificandoRol] = useState(false);
  const [mostrarVolverArriba, setMostrarVolverArriba] = useState(false);
  const [mostrarCambiarPassword, setMostrarCambiarPassword] = useState(false);
  const [mostrarMfa, setMostrarMfa] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const {
    sesion,
    mfaPendiente,
    cargando,
    error,
    login,
    verificarMfa,
    cancelarMfa,
    logout,
  } = useAuthSession();
  const requiereLogin = tieneConfiguracionSupabase();
  const accesoBloqueado = requiereLogin && !sesion;
  const esAdmin = rolUsuario === 'admin';
  const esTecnico = rolUsuario === 'tecnico';
  const puedeVerClientes = rolUsuario !== 'tecnico';
  const puedeVerInventario = rolUsuario !== 'tecnico';
  const vistaActiva = obtenerVistaDesdeRuta(location.pathname);
  const tituloActual = accesoBloqueado
    ? 'Acceso'
    : esTecnico && vistaActiva === 'clientes'
      ? TITULOS.ordenes
    : !esAdmin && vistaActiva === 'admin'
      ? TITULOS.ordenes
      : TITULOS[vistaActiva] || TITULOS.ordenes;

  useEffect(() => {
    let cancelado = false;

    async function cargarRolUsuario() {
      if (!requiereLogin || !sesion?.user?.id) {
        setRolUsuario(null);
        setNombreVisibleUsuario('');
        setVerificandoRol(false);
        return;
      }

      const perfilCacheado = leerPerfilUsuarioCacheado(sesion.user.id);
      if (perfilCacheado) {
        setRolUsuario(perfilCacheado.rol || 'tecnico');
        setNombreVisibleUsuario(perfilCacheado.nombre_visible || '');
      } else {
        setRolUsuario((previo) => previo || 'tecnico');
      }

      if (!estaOnline()) {
        setVerificandoRol(false);
        return;
      }

      setVerificandoRol(true);

      try {
        const supabase = obtenerClienteSupabase();
        const { data, error: perfilError } = await supabase
          .from('usuarios_sat')
          .select('rol, nombre_visible')
          .eq('user_id', sesion.user.id)
          .maybeSingle();

        if (perfilError) {
          throw perfilError;
        }

        if (!cancelado) {
          setRolUsuario(data?.rol || 'tecnico');
          setNombreVisibleUsuario(data?.nombre_visible || '');
          guardarPerfilUsuarioCacheado(sesion.user.id, data);
        }
      } catch {
        if (!cancelado) {
          setRolUsuario((previo) => previo || 'tecnico');
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
      navigate('/ordenes', { replace: true });
    }
  }, [accesoBloqueado, esAdmin, navigate, verificandoRol, vistaActiva]);

  useEffect(() => {
    if (!accesoBloqueado && !verificandoRol && vistaActiva === 'clientes' && !puedeVerClientes) {
      navigate('/ordenes', { replace: true });
    }
  }, [accesoBloqueado, navigate, puedeVerClientes, verificandoRol, vistaActiva]);

  useEffect(() => {
    if (!accesoBloqueado && !verificandoRol && vistaActiva === 'inventario' && !puedeVerInventario) {
      navigate('/ordenes', { replace: true });
    }
  }, [accesoBloqueado, navigate, puedeVerInventario, verificandoRol, vistaActiva]);

  useEffect(() => {
    if (!requiereLogin || !sesion?.user?.id) {
      return undefined;
    }

    precargarCatalogosOffline().catch(() => { /* noop */ });

    function refrescarCatalogosOffline() {
      precargarCatalogosOffline().catch(() => { /* noop */ });
    }

    window.addEventListener('online', refrescarCatalogosOffline);
    return () => {
      window.removeEventListener('online', refrescarCatalogosOffline);
    };
  }, [requiereLogin, sesion?.user?.id]);

  useEffect(() => {
    function onScroll() {
      setMostrarVolverArriba(window.scrollY > 420);
    }

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function cambiarVistaSegura(siguienteVista) {
    if (siguienteVista === 'admin' && !esAdmin) {
      return;
    }

    if (siguienteVista === 'clientes' && !puedeVerClientes) {
      return;
    }

    if (siguienteVista === 'inventario' && !puedeVerInventario) {
      return;
    }

    navigate(RUTA_POR_VISTA[siguienteVista] || '/ordenes');
  }

  function volverArriba() {
    const origen = window.scrollY;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    registrarRetornoRapido({
      vista: vistaActiva,
      accion: 'volver_arriba',
      scrollOrigen: origen,
      scrollDestino: 0,
    });
  }

  const navItemsVisibles = NAV_ITEMS.filter((item) => {
    if (item.key === 'admin') {
      return esAdmin;
    }

    if (item.key === 'clientes') {
      return puedeVerClientes;
    }

    if (item.key === 'inventario') {
      return puedeVerInventario;
    }

    return true;
  });

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-screen-2xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))] md:px-5 lg:px-6 lg:pb-8">
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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-2xl font-extrabold text-marca-900 lg:text-3xl">
              {tituloActual}
            </h1>
            {requiereLogin && sesion && (
              <div className="flex flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
                <button
                  type="button"
                  onClick={() => setMostrarCambiarPassword(true)}
                  className="rounded-xl border border-marca-100 bg-white px-3 py-2 text-xs font-bold text-marca-700"
                >
                  Contraseña
                </button>
                <button
                  type="button"
                  onClick={() => setMostrarMfa(true)}
                  className="rounded-xl border border-marca-100 bg-white px-3 py-2 text-xs font-bold text-marca-700"
                >
                  2FA
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

          {!accesoBloqueado && sesion && (
            <div className="mt-2 rounded-xl border border-marca-100 bg-marca-50 px-3 py-2 text-xs text-marca-900">
              <span className="font-semibold">Sesión:</span>{' '}
              {nombreVisibleUsuario || sesion.user?.email || 'Usuario'}
              {' · '}
              <span className="font-semibold">Rol:</span>{' '}
              {rolUsuario || 'sin rol'}
            </div>
          )}

          {!accesoBloqueado && (
            <p className="mt-3 text-xs font-semibold text-marca-700 lg:text-sm">
              Ubicación actual: {navItemsVisibles.find((item) => item.key === vistaActiva)?.label || 'Órdenes'}
            </p>
          )}
        </div>
      </header>

      {!accesoBloqueado && (
        <nav
          aria-label="Navegación fija de secciones principales"
          className="mb-4 hidden rounded-2xl border border-marca-100 bg-white/95 p-2 shadow-md backdrop-blur lg:sticky lg:top-[calc(0.45rem+env(safe-area-inset-top))] lg:z-40 lg:block"
        >
          <ul className="flex items-center gap-2 overflow-x-auto pb-1">
            {navItemsVisibles.map((item) => {
              const activo = vistaActiva === item.key;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => cambiarVistaSegura(item.key)}
                    className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition lg:px-4 lg:text-sm ${
                      activo
                        ? 'bg-cotepa-rojo-500 text-white shadow-md'
                        : 'bg-marca-50 text-marca-700 hover:bg-marca-100'
                    }`}
                    aria-current={activo ? 'page' : undefined}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <main className="lg:rounded-2xl lg:border lg:border-marca-100 lg:bg-white lg:p-5 lg:shadow-tarjeta">
        {!accesoBloqueado && (
          <div className="mb-3">
            <IndicadorSync />
          </div>
        )}
        {accesoBloqueado ? (
          <AccesoView
            onLogin={login}
            onVerificarMfa={verificarMfa}
            onCancelarMfa={cancelarMfa}
            mfaPendiente={mfaPendiente}
            cargandoSesion={cargando}
            errorSesion={error}
          />
        ) : (
          <Routes>
            <Route path="/" element={<Navigate to="/ordenes" replace />} />
            <Route path="/ordenes" element={<ListaOrdenesView rolUsuario={rolUsuario} />} />
            <Route path="/parte" element={<ParteTrabajoView rolUsuario={rolUsuario} sesion={sesion} />} />
            <Route path="/parte-pem" element={<PartePemView rolUsuario={rolUsuario} sesion={sesion} />} />
            <Route
              path="/clientes"
              element={puedeVerClientes ? <ClientesView rolUsuario={rolUsuario} /> : <Navigate to="/ordenes" replace />}
            />
            <Route
              path="/inventario"
              element={puedeVerInventario ? <InventarioView rolUsuario={rolUsuario} /> : <Navigate to="/ordenes" replace />}
            />
            <Route path="/admin" element={esAdmin ? <AdminView /> : <Navigate to="/ordenes" replace />} />
            <Route path="*" element={<Navigate to="/ordenes" replace />} />
          </Routes>
        )}
      </main>

      {!accesoBloqueado && (
        <NavbarInferior
          vistaActiva={vistaActiva}
          onCambiarVista={cambiarVistaSegura}
          mostrarAdmin={esAdmin}
          mostrarClientes={puedeVerClientes}
          mostrarInventario={puedeVerInventario}
        />
      )}

      <CambiarPasswordModal
        abierto={mostrarCambiarPassword}
        onCerrar={() => setMostrarCambiarPassword(false)}
      />

      <MfaModal
        abierto={mostrarMfa}
        onCerrar={() => setMostrarMfa(false)}
      />

      <BotonVolverArriba visible={mostrarVolverArriba} onClick={volverArriba} />
    </div>
  );
}
