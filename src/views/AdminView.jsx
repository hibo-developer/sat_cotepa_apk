import { useEffect, useState } from 'react';
import { ShieldUser } from 'lucide-react';
import { obtenerClienteSupabase, tieneConfiguracionSupabase } from '../services/supabaseClient';
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
  const [cargandoUsuarios, setCargandoUsuarios] = useState(false);
  const [guardandoUsuario, setGuardandoUsuario] = useState(false);
  const [errorUsuarios, setErrorUsuarios] = useState('');
  const [mensajeUsuarios, setMensajeUsuarios] = useState('');
  const [usuarioEditandoId, setUsuarioEditandoId] = useState('');
  const [formUsuario, setFormUsuario] = useState(FORM_USUARIO_INICIAL);
  const [paginaUsuarios, setPaginaUsuarios] = useState(1);

  const totalPaginasUsuarios = Math.max(1, Math.ceil(usuarios.length / USUARIOS_POR_PAGINA));
  const totalAdmins = usuarios.filter((usuario) => usuario.rol === 'admin').length;
  const totalTecnicos = usuarios.filter((usuario) => usuario.rol === 'tecnico').length;
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
      <header className="section-hero p-5 lg:p-6">
        <div className="flex items-center gap-2">
          <ShieldUser className="h-5 w-5 text-white/90" />
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/70">Control interno</p>
            <h2 className="text-2xl font-black tracking-tight text-white">Administración</h2>
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
          Gestión de usuarios y roles del sistema SAT.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="metric-card bg-white/10 text-white">
            <p className="metric-label text-white/65">Usuarios</p>
            <p className="mt-2 text-2xl font-black text-white">{usuarios.length}</p>
          </div>
          <div className="metric-card bg-white/10 text-white">
            <p className="metric-label text-white/65">Admins</p>
            <p className="mt-2 text-2xl font-black text-white">{totalAdmins}</p>
          </div>
          <div className="metric-card bg-white/10 text-white">
            <p className="metric-label text-white/65">Tecnicos</p>
            <p className="mt-2 text-2xl font-black text-white">{totalTecnicos}</p>
          </div>
        </div>
      </header>

      <section className="surface-card space-y-4 p-4 lg:p-5">
        <header className="flex items-center gap-2">
          <ShieldUser className="h-5 w-5 text-marca-700" />
          <h3 className="text-base font-bold text-sat-text">Usuarios y Roles</h3>
        </header>

        <p className="text-sm text-sat-muted">
          CRUD de usuarios autenticados y asignacion de rol SAT (admin, oficina, tecnico). Para rol tecnico se crea
          automaticamente el registro de tecnico.
        </p>

        {errorUsuarios && (
          <p className="status-banner-error">
            {errorUsuarios}
          </p>
        )}

        {mensajeUsuarios && (
          <p className="status-banner-success">
            {mensajeUsuarios}
          </p>
        )}

        {puedeAdministrar === false && (
          <p className="status-banner-warning">
            Esta sección solo está disponible para usuarios con rol admin.
          </p>
        )}

        <div className="lg:grid lg:grid-cols-12 lg:gap-4">
          <form onSubmit={guardarUsuario} className="surface-panel space-y-3 p-4 lg:col-span-4 lg:sticky lg:top-5 lg:self-start">
            <div>
              <p className="metric-label">{usuarioEditandoId ? 'Edición activa' : 'Alta de usuario'}</p>
              <h4 className="mt-2 text-lg font-black tracking-tight text-sat-text">
                {usuarioEditandoId ? 'Actualizar usuario' : 'Crear nuevo acceso'}
              </h4>
            </div>
            <label className="block">
              <span className="label-base">Email *</span>
              <input
                required
                type="email"
                value={formUsuario.email}
                onChange={(evento) => setFormUsuario((previo) => ({ ...previo, email: evento.target.value }))}
                className="input-base"
                disabled={guardandoUsuario || !puedeAdministrar}
              />
            </label>

            <label className="block">
              <span className="label-base">
                {usuarioEditandoId ? 'Nueva contrasena (opcional)' : 'Contrasena inicial *'}
              </span>
              <input
                type="password"
                value={formUsuario.password}
                required={!usuarioEditandoId}
                minLength={12}
                onChange={(evento) => setFormUsuario((previo) => ({ ...previo, password: evento.target.value }))}
                className="input-base"
                disabled={guardandoUsuario || !puedeAdministrar}
                placeholder={usuarioEditandoId ? 'Dejar vacio para mantener la actual' : 'Minimo 12, con mayuscula, minuscula, numero y simbolo'}
              />
              <span className="help-message">
                Requisito: minimo 12 caracteres con mayuscula, minuscula, numero y simbolo.
              </span>
            </label>

            <label className="block">
              <span className="label-base">Nombre visible</span>
              <input
                type="text"
                value={formUsuario.nombre_visible}
                onChange={(evento) =>
                  setFormUsuario((previo) => ({ ...previo, nombre_visible: evento.target.value }))
                }
                className="input-base"
                disabled={guardandoUsuario || !puedeAdministrar}
              />
            </label>

            <label className="block">
              <span className="label-base">Rol *</span>
              <select
                value={formUsuario.rol}
                onChange={(evento) =>
                  setFormUsuario((previo) => ({
                    ...previo,
                    rol: evento.target.value,
                  }))
                }
                className="select-base"
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
                  <span className="label-base">Nombre del tecnico</span>
                  <input
                    type="text"
                    value={formUsuario.tecnico_nombre}
                    onChange={(evento) =>
                      setFormUsuario((previo) => ({ ...previo, tecnico_nombre: evento.target.value }))
                    }
                    className="input-base"
                    disabled={guardandoUsuario || !puedeAdministrar}
                    placeholder="Si se deja vacio se usa el nombre visible"
                  />
                </label>

                <label className="block">
                  <span className="label-base">Especialidad</span>
                  <input
                    type="text"
                    value={formUsuario.tecnico_especialidad}
                    onChange={(evento) =>
                      setFormUsuario((previo) => ({ ...previo, tecnico_especialidad: evento.target.value }))
                    }
                    className="input-base"
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
                className="btn-primary w-full"
              >
                {guardandoUsuario ? 'Guardando...' : usuarioEditandoId ? 'Actualizar usuario' : 'Crear usuario'}
              </button>

              <button
                type="button"
                onClick={resetFormularioUsuario}
                disabled={guardandoUsuario || !puedeAdministrar}
                className="btn-secondary w-full"
              >
                Limpiar formulario
              </button>
            </div>
          </form>

          <div className="space-y-2 lg:col-span-8">
            <div className="toolbar-panel">
              <p className="text-sm font-semibold text-sat-muted">Usuarios registrados: {usuarios.length}</p>
              <button
                type="button"
                onClick={recargarUsuarios}
                disabled={cargandoUsuarios || guardandoUsuario || !puedeAdministrar}
                className="btn-secondary px-3 py-2 text-xs"
              >
                {cargandoUsuarios ? 'Actualizando...' : 'Recargar'}
              </button>
            </div>

            {!cargandoUsuarios && usuarios.length > 0 && (
              <div className="toolbar-panel">
                <span>Pagina {paginaUsuarios} de {totalPaginasUsuarios}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPaginaUsuarios((previo) => Math.max(1, previo - 1))}
                    disabled={paginaUsuarios === 1}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaginaUsuarios((previo) => Math.min(totalPaginasUsuarios, previo + 1))}
                    disabled={paginaUsuarios === totalPaginasUsuarios}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}

            {cargandoUsuarios ? (
              <p className="text-sm font-semibold text-sat-muted">Cargando usuarios...</p>
            ) : (
              <ul className="space-y-2">
                {usuariosPaginados.map((usuario) => (
                  <li key={usuario.user_id} className="list-card">
                    <p className="text-sm font-bold text-sat-text">{usuario.email}</p>
                    <p className="mt-1 inline-flex rounded-full bg-marca-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-marca-700">
                      Rol: {usuario.rol}
                    </p>
                    <p className="mt-1 text-xs text-sat-muted">
                      Nombre visible: {usuario.nombre_visible || 'Sin definir'}
                    </p>
                    {usuario.rol === 'tecnico' && (
                      <p className="text-xs text-sat-muted">
                        Tecnico: {usuario.tecnico_nombre || 'Sin nombre'}
                        {usuario.tecnico_especialidad ? ` · ${usuario.tecnico_especialidad}` : ''}
                      </p>
                    )}

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => editarUsuario(usuario)}
                        className="btn-secondary px-3 py-2 text-xs"
                        disabled={guardandoUsuario || !puedeAdministrar}
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => borrarUsuario(usuario.user_id)}
                        className="inline-flex items-center justify-center rounded-2xl bg-rose-600 px-3 py-2 text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-rose-700 disabled:opacity-60"
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

    </section>
  );
}
