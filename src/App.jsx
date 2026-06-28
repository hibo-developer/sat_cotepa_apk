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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    <div className="mx-auto min-h-[100dvh] w-full max-w-screen-2xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] md:px-5 lg:px-6 lg:pb-8">
      <header className="section-hero mb-4">
        <div className="h-1.5 w-full bg-gradient-to-r from-cotepa-rojo-500 via-cotepa-rojo-600 to-marca-600" />
        <div className="flex items-center gap-3 p-4 lg:gap-4 lg:px-6 lg:py-5">
          <img
            src={logoCotepa}
            alt="Logo COTEPA"
            className="h-16 w-16 rounded-2xl border border-white/40 object-cover shadow-lg ring-4 ring-white/15 lg:h-20 lg:w-20"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-white/70">SAT Móvil COTEPA</p>
            <p className="truncate text-lg font-black tracking-tight text-white lg:text-[1.65rem]">
              Hornos y equipos para panificación
            </p>
          </div>
        </div>

        <div className="border-t border-white/10 px-4 py-4 lg:px-6 lg:py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-100">
                Espacio de trabajo activo
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white lg:text-4xl">
                {tituloActual}
              </h1>
            </div>
            {requiereLogin && sesion && (
              <div className="flex flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
                <button
                  type="button"
                  onClick={() => setMostrarCambiarPassword(true)}
                  className="btn-secondary text-xs"
                >
                  Contraseña
                </button>
                <button
                  type="button"
                  onClick={() => setMostrarMfa(true)}
                  className="btn-secondary text-xs"
                >
                  2FA
                </button>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/15"
                >
                  Cerrar sesion
                </button>
              </div>
            )}
          </div>

          {!accesoBloqueado && sesion && (
            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-slate-100 backdrop-blur-sm">
                <span className="font-semibold text-white">Sesión:</span>{' '}
                {nombreVisibleUsuario || sesion.user?.email || 'Usuario'}
                {' · '}
                <span className="font-semibold text-white">Rol:</span>{' '}
                {rolUsuario || 'sin rol'}
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-slate-100 backdrop-blur-sm">
                <span className="font-semibold text-white">Ubicación actual:</span>{' '}
                {navItemsVisibles.find((item) => item.key === vistaActiva)?.label || 'Órdenes'}
              </div>
            </div>
          )}
        </div>
      </header>

      {!accesoBloqueado && (
        <nav
          aria-label="Navegación fija de secciones principales"
          className="app-shell mb-4 hidden p-2.5 lg:sticky lg:top-[calc(0.45rem+env(safe-area-inset-top))] lg:z-40 lg:block"
        >
          <ul className="flex items-center gap-2 overflow-x-auto pb-1">
            {navItemsVisibles.map((item) => {
              const activo = vistaActiva === item.key;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => cambiarVistaSegura(item.key)}
                    className={`whitespace-nowrap rounded-2xl px-3 py-2.5 text-xs font-bold transition lg:px-4 lg:text-sm ${
                      activo
                        ? 'bg-cotepa-rojo-500 text-white shadow-lift'
                        : 'bg-white/70 text-marca-700 hover:bg-marca-50'
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

      <main className="app-shell lg:p-5">
        {!accesoBloqueado && (
          <div className="mb-4">
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
