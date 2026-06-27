import { useEffect, useState } from 'react';
import { CircleCheckBig, ShieldAlert, ShieldUser, TriangleAlert } from 'lucide-react';
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
  const usuariosPaginados = usuarios.slice(
    (paginaUsuarios - 1) * USUARIOS_POR_PAGINA,
    (paginaUsuarios - 1) * USUARIOS_POR_PAGINA + USUARIOS_POR_PAGINA,
  );
  const totalAdmins = usuarios.filter((usuario) => usuario.rol === 'admin').length;
  const totalTecnicos = usuarios.filter((usuario) => usuario.rol === 'tecnico').length;
  const clasePanel = 'space-y-4 rounded-3xl border border-marca-100 bg-white p-4 shadow-tarjeta lg:p-5';
  const claseEtiqueta = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600';
  const claseInput = 'w-full rounded-2xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-marca-600 focus:outline-none focus:ring-4 focus:ring-marca-100 disabled:cursor-not-allowed disabled:bg-slate-100';
  const claseBotonPrimario = 'w-full rounded-2xl bg-marca-900 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-marca-900/10 transition hover:bg-marca-800 focus:outline-none focus:ring-4 focus:ring-marca-100 disabled:opacity-60';
  const claseBotonSecundario = 'w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:opacity-60';
  const resumenAdmin = [
    { etiqueta: 'Usuarios', valor: usuarios.length, detalle: 'Cuentas SAT registradas' },
    { etiqueta: 'Admins', valor: totalAdmins, detalle: 'Control y permisos' },
    { etiqueta: 'Tecnicos', valor: totalTecnicos, detalle: 'Perfiles operativos' },
  ];

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
      <header className="rounded-3xl border border-marca-700/40 bg-marca-900 p-5 text-white shadow-xl lg:p-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-100">
          <ShieldUser className="h-3.5 w-3.5" />
          Administración
        </div>
        <h2 className="mt-4 text-xl font-bold">Administración</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
          Gestión de usuarios, roles SAT y control de acceso interno para tareas de oficina y administración.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {resumenAdmin.map((item) => (
            <div
              key={item.etiqueta}
              className="rounded-2xl border border-white/10 bg-white/10 p-3 shadow-lg shadow-black/5 backdrop-blur-sm"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-200">{item.etiqueta}</p>
              <p className="mt-2 text-2xl font-bold text-white">{item.valor}</p>
              <p className="mt-1 text-xs text-slate-200">{item.detalle}</p>
            </div>
          ))}
        </div>
      </header>

      <section className={clasePanel}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldUser className="h-5 w-5 text-marca-700" />
              <h3 className="text-base font-bold text-slate-800">Usuarios y Roles</h3>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              CRUD de usuarios autenticados y asignacion de rol SAT (admin, oficina, tecnico). Para rol tecnico se crea
              automaticamente el registro de tecnico.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Acceso</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">Panel interno protegido</p>
          </div>
        </header>

        {errorUsuarios && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 shadow-sm">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <p>{errorUsuarios}</p>
          </div>
        )}

        {mensajeUsuarios && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 shadow-sm">
            <CircleCheckBig className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <p>{mensajeUsuarios}</p>
          </div>
        )}

        {puedeAdministrar === false && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900 shadow-sm">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <p>Esta sección solo está disponible para usuarios con rol admin.</p>
          </div>
        )}

        <div className="lg:grid lg:grid-cols-12 lg:gap-4">
          <form
            onSubmit={guardarUsuario}
            className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 lg:col-span-4 lg:sticky lg:top-5 lg:self-start"
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">
                {usuarioEditandoId ? 'Editar usuario existente' : 'Alta de usuario SAT'}
              </p>
              <p className="text-sm leading-6 text-slate-600">
                Define credenciales, rol y datos del tecnico sin salir del panel de administracion.
              </p>
            </div>

            <label className="block">
              <span className={claseEtiqueta}>Email *</span>
              <input
                required
                type="email"
                value={formUsuario.email}
                onChange={(evento) => setFormUsuario((previo) => ({ ...previo, email: evento.target.value }))}
                className={claseInput}
                disabled={guardandoUsuario || !puedeAdministrar}
              />
            </label>

            <label className="block">
              <span className={claseEtiqueta}>
                {usuarioEditandoId ? 'Nueva contrasena (opcional)' : 'Contrasena inicial *'}
              </span>
              <input
                type="password"
                value={formUsuario.password}
                required={!usuarioEditandoId}
                minLength={12}
                onChange={(evento) => setFormUsuario((previo) => ({ ...previo, password: evento.target.value }))}
                className={claseInput}
                disabled={guardandoUsuario || !puedeAdministrar}
                placeholder={usuarioEditandoId ? 'Dejar vacio para mantener la actual' : 'Minimo 12, con mayuscula, minuscula, numero y simbolo'}
              />
              <span className="mt-1 block text-[11px] text-slate-500">
                Requisito: minimo 12 caracteres con mayuscula, minuscula, numero y simbolo.
              </span>
            </label>

            <label className="block">
              <span className={claseEtiqueta}>Nombre visible</span>
              <input
                type="text"
                value={formUsuario.nombre_visible}
                onChange={(evento) =>
                  setFormUsuario((previo) => ({ ...previo, nombre_visible: evento.target.value }))
                }
                className={claseInput}
                disabled={guardandoUsuario || !puedeAdministrar}
              />
            </label>

            <label className="block">
              <span className={claseEtiqueta}>Rol *</span>
              <select
                value={formUsuario.rol}
                onChange={(evento) =>
                  setFormUsuario((previo) => ({
                    ...previo,
                    rol: evento.target.value,
                  }))
                }
                className={claseInput}
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
                  <span className={claseEtiqueta}>Nombre del tecnico</span>
                  <input
                    type="text"
                    value={formUsuario.tecnico_nombre}
                    onChange={(evento) =>
                      setFormUsuario((previo) => ({ ...previo, tecnico_nombre: evento.target.value }))
                    }
                    className={claseInput}
                    disabled={guardandoUsuario || !puedeAdministrar}
                    placeholder="Si se deja vacio se usa el nombre visible"
                  />
                </label>

                <label className="block">
                  <span className={claseEtiqueta}>Especialidad</span>
                  <input
                    type="text"
                    value={formUsuario.tecnico_especialidad}
                    onChange={(evento) =>
                      setFormUsuario((previo) => ({ ...previo, tecnico_especialidad: evento.target.value }))
                    }
                    className={claseInput}
                    disabled={guardandoUsuario || !puedeAdministrar}
                    placeholder="Ej: Hornos industriales"
                  />
                </label>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="submit"
                disabled={guardandoUsuario || !puedeAdministrar}
                className={claseBotonPrimario}
              >
                {guardandoUsuario ? 'Guardando...' : usuarioEditandoId ? 'Actualizar usuario' : 'Crear usuario'}
              </button>

              <button
                type="button"
                onClick={resetFormularioUsuario}
                disabled={guardandoUsuario || !puedeAdministrar}
                className={claseBotonSecundario}
              >
                Limpiar formulario
              </button>
            </div>
          </form>

          <div className="space-y-3 lg:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Listado</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">Usuarios registrados: {usuarios.length}</p>
              </div>
              <button
                type="button"
                onClick={recargarUsuarios}
                disabled={cargandoUsuarios || guardandoUsuario || !puedeAdministrar}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:opacity-60"
              >
                {cargandoUsuarios ? 'Actualizando...' : 'Recargar'}
              </button>
            </div>

            {!cargandoUsuarios && usuarios.length > 0 && (
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-700">
                <span>Pagina {paginaUsuarios} de {totalPaginasUsuarios}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPaginaUsuarios((previo) => Math.max(1, previo - 1))}
                    disabled={paginaUsuarios === 1}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 transition hover:bg-slate-100 disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaginaUsuarios((previo) => Math.min(totalPaginasUsuarios, previo + 1))}
                    disabled={paginaUsuarios === totalPaginasUsuarios}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 transition hover:bg-slate-100 disabled:opacity-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}

            {cargandoUsuarios ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                Cargando usuarios...
              </div>
            ) : usuarios.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 shadow-sm">
                Aun no hay usuarios SAT disponibles para mostrar en este entorno.
              </div>
            ) : (
              <ul className="space-y-2">
                {usuariosPaginados.map((usuario) => (
                  <li key={usuario.user_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-marca-200 hover:shadow-md">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{usuario.email}</p>
                        <p className="mt-1 inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                          Rol: {usuario.rol}
                        </p>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <p>Usuario SAT</p>
                        <p className="mt-1 font-semibold text-slate-700">{usuario.nombre_visible || 'Sin alias'}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-600">
                      Nombre visible: {usuario.nombre_visible || 'Sin definir'}
                    </p>
                    {usuario.rol === 'tecnico' && (
                      <p className="mt-1 text-xs text-slate-600">
                        Tecnico: {usuario.tecnico_nombre || 'Sin nombre'}
                        {usuario.tecnico_especialidad ? ` · ${usuario.tecnico_especialidad}` : ''}
                      </p>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => editarUsuario(usuario)}
                        className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-slate-200"
                        disabled={guardandoUsuario || !puedeAdministrar}
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => borrarUsuario(usuario.user_id)}
                        className="rounded-xl bg-rose-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-rose-700 focus:outline-none focus:ring-4 focus:ring-rose-100"
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
