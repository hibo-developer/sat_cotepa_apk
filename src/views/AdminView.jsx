import { useEffect, useState } from 'react';
import { RefreshCw, ShieldUser, Settings } from 'lucide-react';
import { obtenerClienteSupabase, tieneConfiguracionSupabase } from '../services/supabaseClient';
import { useSettings } from '../hooks/useSettings';
import {
  actualizarUsuarioSat,
  crearUsuarioSat,
  eliminarUsuarioSat,
  listarUsuariosSat,
} from '../services/userAdminService';

const FORM_USUARIO_INICIAL = {
  email: '',
  password: '',
  rol: 'tecnico',
  nombre_visible: '',
  tecnico_nombre: '',
  tecnico_especialidad: '',
};

const USUARIOS_POR_PAGINA = 10;

export function AdminView() {
  const [usuarios, setUsuarios] = useState([]);
  const [puedeAdministrar, setPuedeAdministrar] = useState(null);
  const [settings, updateSettings] = useSettings();
  const [cargandoUsuarios, setCargandoUsuarios] = useState(false);
  const [guardandoUsuario, setGuardandoUsuario] = useState(false);
  const [errorUsuarios, setErrorUsuarios] = useState('');
  const [mensajeUsuarios, setMensajeUsuarios] = useState('');
  const [usuarioEditandoId, setUsuarioEditandoId] = useState('');
  const [formUsuario, setFormUsuario] = useState(FORM_USUARIO_INICIAL);
  const [paginaUsuarios, setPaginaUsuarios] = useState(1);

  const totalPaginasUsuarios = Math.max(1, Math.ceil(usuarios.length / USUARIOS_POR_PAGINA));
  const usuariosPaginados = usuarios.slice(
    (paginaUsuarios - 1) * USUARIOS_POR_PAGINA,
    (paginaUsuarios - 1) * USUARIOS_POR_PAGINA + USUARIOS_POR_PAGINA,
  );

  useEffect(() => {
    async function inicializarGestionUsuarios() {
      setCargandoUsuarios(true);
      setErrorUsuarios('');

      try {
        const supabase = obtenerClienteSupabase();
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          setPuedeAdministrar(false);
          setUsuarios([]);
          setErrorUsuarios('Debes iniciar sesión con un usuario admin para acceder a esta sección.');
          return;
        }

        const { data: perfil, error: perfilError } = await supabase
          .from('usuarios_sat')
          .select('rol')
          .eq('user_id', user.id)
          .maybeSingle();

        if (perfilError) {
          setPuedeAdministrar(false);
          setUsuarios([]);
          setErrorUsuarios(`No se pudo validar tu rol SAT: ${perfilError.message}`);
          return;
        }

        if (perfil?.rol !== 'admin') {
          setPuedeAdministrar(false);
          setUsuarios([]);
          setErrorUsuarios('Acceso denegado: inicia sesión con un usuario admin.');
          return;
        }

        setPuedeAdministrar(true);
        const usuariosCargados = await listarUsuariosSat();

        setUsuarios(usuariosCargados);
      } catch (err) {
        setPuedeAdministrar(false);
        setErrorUsuarios(err.message || 'No se pudo cargar la gestion de usuarios.');
      } finally {
        setCargandoUsuarios(false);
      }
    }

    if (tieneConfiguracionSupabase()) {
      inicializarGestionUsuarios();
    }
  }, []);

  function resetFormularioUsuario() {
    setFormUsuario(FORM_USUARIO_INICIAL);
    setUsuarioEditandoId('');
  }

  async function recargarUsuarios() {
    if (!puedeAdministrar) {
      return;
    }

    setCargandoUsuarios(true);
    setErrorUsuarios('');

    try {
      const usuariosCargados = await listarUsuariosSat();
      setUsuarios(usuariosCargados);
      setPaginaUsuarios(1);
    } catch (err) {
      setErrorUsuarios(err.message || 'No se pudo actualizar el listado de usuarios.');
    } finally {
      setCargandoUsuarios(false);
    }
  }

  function editarUsuario(usuario) {
    setUsuarioEditandoId(usuario.user_id);
    setMensajeUsuarios('');
    setErrorUsuarios('');
    setFormUsuario({
      email: usuario.email || '',
      password: '',
      rol: usuario.rol || 'tecnico',
      nombre_visible: usuario.nombre_visible || '',
      tecnico_nombre: usuario.tecnico_nombre || '',
      tecnico_especialidad: usuario.tecnico_especialidad || '',
    });
  }

  async function guardarUsuario(evento) {
    evento.preventDefault();

    if (!puedeAdministrar) {
      setErrorUsuarios('Acceso denegado: inicia sesión con un usuario admin.');
      return;
    }

    setGuardandoUsuario(true);
    setMensajeUsuarios('');
    setErrorUsuarios('');

    try {
      if (usuarioEditandoId) {
        await actualizarUsuarioSat(usuarioEditandoId, formUsuario);
        setMensajeUsuarios('Usuario actualizado correctamente.');
      } else {
        await crearUsuarioSat(formUsuario);
        setMensajeUsuarios('Usuario creado correctamente.');
      }

      resetFormularioUsuario();
      await recargarUsuarios();
    } catch (err) {
      setErrorUsuarios(err.message || 'No se pudo guardar el usuario.');
    } finally {
      setGuardandoUsuario(false);
    }
  }

  async function borrarUsuario(userId) {
    if (!puedeAdministrar) {
      setErrorUsuarios('Acceso denegado: inicia sesión con un usuario admin.');
      return;
    }

    setGuardandoUsuario(true);
    setMensajeUsuarios('');
    setErrorUsuarios('');

    try {
      await eliminarUsuarioSat(userId);
      setMensajeUsuarios('Usuario eliminado correctamente.');

      if (usuarioEditandoId === userId) {
        resetFormularioUsuario();
      }

      await recargarUsuarios();
    } catch (err) {
      setErrorUsuarios(err.message || 'No se pudo eliminar el usuario.');
    } finally {
      setGuardandoUsuario(false);
    }
  }

  useEffect(() => {
    if (paginaUsuarios > totalPaginasUsuarios) {
      setPaginaUsuarios(totalPaginasUsuarios);
    }
  }, [paginaUsuarios, totalPaginasUsuarios]);

  if (!tieneConfiguracionSupabase()) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
        Configura Supabase en `app-config.js` o con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para usar las herramientas internas de administración.
      </section>
    );
  }

  return (
    <section className="space-y-4 pb-20 lg:pb-0">
      <header className="rounded-2xl bg-marca-900 p-4 text-white shadow-lg lg:p-5">
        <div className="flex items-center gap-2">
          <ShieldUser className="h-5 w-5" />
          <h2 className="text-lg font-bold">Administración</h2>
        </div>
        <p className="mt-2 text-sm text-slate-300">
          Gestión de usuarios y roles del sistema SAT.
        </p>
      </header>

      <section className="space-y-3 rounded-2xl border border-marca-100 bg-white p-4 shadow-tarjeta lg:p-5">
        <header className="flex items-center gap-2">
          <ShieldUser className="h-5 w-5 text-marca-700" />
          <h3 className="text-base font-bold text-slate-800">Usuarios y Roles</h3>
        </header>

        <p className="text-sm text-slate-600">
          CRUD de usuarios autenticados y asignacion de rol SAT (admin, oficina, tecnico). Para rol tecnico se crea
          automaticamente el registro de tecnico.
        </p>

        {errorUsuarios && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {errorUsuarios}
          </p>
        )}

        {mensajeUsuarios && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
            {mensajeUsuarios}
          </p>
        )}

        {puedeAdministrar === false && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
            Esta sección solo está disponible para usuarios con rol admin.
          </p>
        )}

        <div className="lg:grid lg:grid-cols-12 lg:gap-4">
          <form onSubmit={guardarUsuario} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:col-span-4 lg:sticky lg:top-5 lg:self-start">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-700">Email *</span>
              <input
                required
                type="email"
                value={formUsuario.email}
                onChange={(evento) => setFormUsuario((previo) => ({ ...previo, email: evento.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                disabled={guardandoUsuario || !puedeAdministrar}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-700">
                {usuarioEditandoId ? 'Nueva contrasena (opcional)' : 'Contrasena inicial *'}
              </span>
              <input
                type="password"
                value={formUsuario.password}
                required={!usuarioEditandoId}
                minLength={12}
                onChange={(evento) => setFormUsuario((previo) => ({ ...previo, password: evento.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                disabled={guardandoUsuario || !puedeAdministrar}
                placeholder={usuarioEditandoId ? 'Dejar vacio para mantener la actual' : 'Minimo 12, con mayuscula, minuscula, numero y simbolo'}
              />
              <span className="mt-1 block text-[11px] text-slate-500">
                Requisito: minimo 12 caracteres con mayuscula, minuscula, numero y simbolo.
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-700">Nombre visible</span>
              <input
                type="text"
                value={formUsuario.nombre_visible}
                onChange={(evento) =>
                  setFormUsuario((previo) => ({ ...previo, nombre_visible: evento.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                disabled={guardandoUsuario || !puedeAdministrar}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-700">Rol *</span>
              <select
                value={formUsuario.rol}
                onChange={(evento) =>
                  setFormUsuario((previo) => ({
                    ...previo,
                    rol: evento.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                disabled={guardandoUsuario || !puedeAdministrar}
              >
                <option value="admin">Admin</option>
                <option value="oficina">Oficina</option>
                <option value="tecnico">Tecnico</option>
              </select>
            </label>

            {formUsuario.rol === 'tecnico' && (
              <>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-700">Nombre del tecnico</span>
                  <input
                    type="text"
                    value={formUsuario.tecnico_nombre}
                    onChange={(evento) =>
                      setFormUsuario((previo) => ({ ...previo, tecnico_nombre: evento.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    disabled={guardandoUsuario || !puedeAdministrar}
                    placeholder="Si se deja vacio se usa el nombre visible"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-700">Especialidad</span>
                  <input
                    type="text"
                    value={formUsuario.tecnico_especialidad}
                    onChange={(evento) =>
                      setFormUsuario((previo) => ({ ...previo, tecnico_especialidad: evento.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    disabled={guardandoUsuario || !puedeAdministrar}
                    placeholder="Ej: Hornos industriales"
                  />
                </label>
              </>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="submit"
                disabled={guardandoUsuario || !puedeAdministrar}
                className="w-full rounded-xl bg-marca-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {guardandoUsuario ? 'Guardando...' : usuarioEditandoId ? 'Actualizar usuario' : 'Crear usuario'}
              </button>

              <button
                type="button"
                onClick={resetFormularioUsuario}
                disabled={guardandoUsuario || !puedeAdministrar}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-60"
              >
                Limpiar formulario
              </button>
            </div>
          </form>

          <div className="space-y-2 lg:col-span-8">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Usuarios registrados: {usuarios.length}</p>
              <button
                type="button"
                onClick={recargarUsuarios}
                disabled={cargandoUsuarios || guardandoUsuario || !puedeAdministrar}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-60"
              >
                {cargandoUsuarios ? 'Actualizando...' : 'Recargar'}
              </button>
            </div>

            {!cargandoUsuarios && usuarios.length > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                <span>Pagina {paginaUsuarios} de {totalPaginasUsuarios}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPaginaUsuarios((previo) => Math.max(1, previo - 1))}
                    disabled={paginaUsuarios === 1}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaginaUsuarios((previo) => Math.min(totalPaginasUsuarios, previo + 1))}
                    disabled={paginaUsuarios === totalPaginasUsuarios}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}

            {cargandoUsuarios ? (
              <p className="text-sm font-semibold text-slate-600">Cargando usuarios...</p>
            ) : (
              <ul className="space-y-2">
                {usuariosPaginados.map((usuario) => (
                  <li key={usuario.user_id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-sm font-bold text-slate-800">{usuario.email}</p>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rol: {usuario.rol}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Nombre visible: {usuario.nombre_visible || 'Sin definir'}
                    </p>
                    {usuario.rol === 'tecnico' && (
                      <p className="text-xs text-slate-600">
                        Tecnico: {usuario.tecnico_nombre || 'Sin nombre'}
                        {usuario.tecnico_especialidad ? ` · ${usuario.tecnico_especialidad}` : ''}
                      </p>
                    )}

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => editarUsuario(usuario)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                        disabled={guardandoUsuario || !puedeAdministrar}
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => borrarUsuario(usuario.user_id)}
                        className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white"
                        disabled={guardandoUsuario || !puedeAdministrar}
                      >
                        Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-marca-100 bg-white p-4 shadow-tarjeta lg:p-5">
        <header className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-marca-700" />
          <h3 className="text-base font-bold text-slate-800">Ajustes de la aplicación</h3>
        </header>

        <p className="text-sm text-slate-600">
          Configura el comportamiento del dictado por voz y otras opciones.
        </p>

        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <input
            type="checkbox"
            checked={settings.grabarAudioDictado}
            onChange={(e) => updateSettings({ grabarAudioDictado: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-marca-900 focus:ring-marca-500"
          />
          <div>
            <span className="block text-sm font-semibold text-slate-800">Grabar audio durante dictado</span>
            <span className="block text-xs text-slate-600">
              Si está activo, se guarda el audio en Supabase Storage para posibles disputas legales.
            </span>
          </div>
        </label>
      </section>
    </section>
  );
}
