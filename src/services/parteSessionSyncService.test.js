import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();
const removeChannelMock = vi.fn(async () => {});
const subscribeMock = vi.fn(() => ({ topic: 'channel-ok' }));
const onMock = vi.fn(function on() {
  return { subscribe: subscribeMock };
});
const channelMock = vi.fn(() => ({ on: onMock }));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => 'web',
  },
}));

vi.mock('./supabaseClient', () => ({
  tieneConfiguracionSupabase: () => true,
  obtenerClienteSupabase: () => ({
    rpc: rpcMock,
    channel: channelMock,
    removeChannel: removeChannelMock,
  }),
}));

describe('parteSessionSyncService', () => {
  let service;
  const storage = new Map();

  beforeEach(async () => {
    rpcMock.mockReset();
    removeChannelMock.mockClear();
    subscribeMock.mockClear();
    onMock.mockClear();
    channelMock.mockClear();
    storage.clear();
    global.localStorage = {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    };
    global.window = globalThis;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        randomUUID: () => 'uuid-prueba-123',
      },
    });
    service = await import('./parteSessionSyncService');
  });

  it('genera y conserva un device instance id estable', () => {
    const primero = service.obtenerDeviceInstanceId();
    const segundo = service.obtenerDeviceInstanceId();

    expect(primero).toBe('uuid-prueba-123');
    expect(segundo).toBe('uuid-prueba-123');
  });

  it('detecta progreso real en un parte en curso', () => {
    expect(service.tieneProgresoSesionParte({ formulario: {}, desplazamiento: {}, intervension: {}, seguimientoTiempo: {} })).toBe(false);
    expect(service.tieneProgresoSesionParte({
      formulario: { descripcion_problema: 'Avería de prueba' },
      desplazamiento: {},
      intervension: {},
      seguimientoTiempo: {},
    })).toBe(true);
  });

  it('construye un snapshot serializable con metadatos de fotos', () => {
    const snapshot = service.construirSnapshotSesionParte({
      formulario: { cliente_id: 'cli-1', descripcion_problema: 'Fallo' },
      desplazamiento: { inicioIso: '2026-06-21T08:00:00.000Z' },
      intervension: { inicioIso: '2026-06-21T09:00:00.000Z' },
      seguimientoTiempo: { inicioIso: '2026-06-21T08:00:00.000Z' },
      materialesSeleccionados: [{ material_id: 'mat-1', cantidad: 2 }],
      pendienteGeoIntervension: true,
      firmaClienteDataUrl: 'data:image/png;base64,abc',
      fotosIntervencion: [{ categoria: 'antes', name: 'foto.jpg', size: 1234, type: 'image/jpeg' }],
    });

    expect(snapshot.formulario.cliente_id).toBe('cli-1');
    expect(snapshot.firmaClienteDisponible).toBe(true);
    expect(snapshot.firmaClienteDataUrl).toBe('data:image/png;base64,abc');
    expect(snapshot.fotosIntervencion).toEqual([
      { categoria: 'antes', nombre: 'foto.jpg', size: 1234, type: 'image/jpeg' },
    ]);
  });

  it('reclama la sesión activa usando la RPC y normaliza la respuesta', async () => {
    rpcMock.mockResolvedValue({
      data: { id: 'ses-1', estado: 'active', device_instance_id: 'uuid-prueba-123' },
      error: null,
    });

    const resultado = await service.reclamarSesionParteActiva({
      ordenId: 'ord-1',
      snapshot: { formulario: { cliente_id: 'cli-1' } },
      estado: 'active',
    });

    expect(resultado.id).toBe('ses-1');
    expect(rpcMock).toHaveBeenCalledWith('fn_claim_parte_sesion_sat', expect.objectContaining({
      p_device_instance_id: 'uuid-prueba-123',
      p_orden_id: 'ord-1',
      p_estado: 'active',
    }));
  });

  it('cierra la sesión activa usando la RPC correcta', async () => {
    rpcMock.mockResolvedValue({
      data: { id: 'ses-1', estado: 'submitted', device_instance_id: 'uuid-prueba-123' },
      error: null,
    });

    const resultado = await service.cerrarSesionParteActiva({
      reason: 'submitted',
      snapshot: { formulario: { cliente_id: 'cli-1' } },
    });

    expect(resultado.estado).toBe('submitted');
    expect(rpcMock).toHaveBeenCalledWith('fn_close_parte_sesion_sat', {
      p_device_instance_id: 'uuid-prueba-123',
      p_reason: 'submitted',
      p_snapshot: { formulario: { cliente_id: 'cli-1' } },
    });
  });

  it('suscribe las sesiones del usuario y permite desuscribirse', () => {
    const desuscribir = service.suscribirSesionesParteUsuario({
      userId: 'user-1',
      onEvent: vi.fn(),
    });

    expect(channelMock).toHaveBeenCalledTimes(1);
    expect(onMock).toHaveBeenCalledTimes(1);
    expect(subscribeMock).toHaveBeenCalledTimes(1);

    desuscribir();
    expect(removeChannelMock).toHaveBeenCalledTimes(1);
  });
});
