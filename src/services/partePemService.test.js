import { describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();
const uploadMock = vi.fn();

vi.mock('./supabaseClient', () => ({
  obtenerClienteSupabase: () => ({
    from: (...args) => fromMock(...args),
    storage: {
      from: () => ({
        upload: (...args) => uploadMock(...args),
      }),
    },
  }),
}));

const crearOrdenTrabajoMock = vi.fn(async () => ({ id: 'ot-123', numero_ticket: 999 }));
vi.mock('./workOrderService', () => ({
  crearOrdenTrabajo: (...args) => crearOrdenTrabajoMock(...args),
}));

const subirFotosMock = vi.fn(async () => []);
vi.mock('./parteTrabajoService', () => ({
  subirFotosIntervencionStorage: (...args) => subirFotosMock(...args),
}));

const generarInformeMock = vi.fn(async () => ({ pdfUrl: 'sb://informes-partes/c1/t1/ot-123/PEM-260624-01.pdf', nombreArchivo: 'PEM-260624-01.pdf' }));
vi.mock('./parteTrabajoInformeService', () => ({
  generarYSubirInformeParte: (...args) => generarInformeMock(...args),
}));

describe('partePemService', () => {
  it('valida campos obligatorios', async () => {
    const { crearPartePem } = await import('./partePemService');
    await expect(
      crearPartePem({
        cliente_id: 'c1',
        tecnico_id: 't1',
        equipo_id: 'e1',
        equipo_matricula: 'AA',
        fecha_instalacion: '2026-06-24',
        nombre_firmante: 'Cliente',
        firma_url: 'sb://firmas-clientes/x.png',
        checks: {
          verificacion_suministros: 'si',
          verificacion_funcionamiento: 'si',
          verificacion_seguridades: 'si',
          instrucciones_funcionamiento: 'si',
          instrucciones_mantenimiento: 'si',
        },
      }),
    ).rejects.toThrow(/tipo de operación/i);
  });

  it('crea y cierra una orden PEM cuando no hay orden_id', async () => {
    fromMock.mockReset();
    crearOrdenTrabajoMock.mockClear();
    subirFotosMock.mockClear();
    uploadMock.mockClear();
    generarInformeMock.mockClear();

    const updateSingle = vi.fn(async () => ({ data: { id: 'ot-123', numero_ticket: 999 }, error: null }));
    const updateSelect = vi.fn(() => ({ single: updateSingle }));
    const updateEq = vi.fn(() => ({ select: updateSelect }));
    const update = vi.fn(() => ({ eq: updateEq }));

    fromMock.mockImplementation((tabla) => {
      if (tabla !== 'ordenes_trabajo') {
        throw new Error(`tabla inesperada: ${tabla}`);
      }
      const selectSingle = vi.fn(async () => ({
        data: {
          id: 'ot-123',
          descripcion_averia: 'PEM · Montaje',
          prioridad: 'media',
          clientes: { nombre: 'Cliente 1' },
          equipos: { nombre: 'Equipo 1', marca: null, modelo: null },
          tecnicos: { nombre: 'Tecnico 1' },
        },
        error: null,
      }));
      const selectEq = vi.fn(() => ({ single: selectSingle }));
      const select = vi.fn(() => ({ eq: selectEq }));
      return { update, select };
    });

    const { crearPartePem } = await import('./partePemService');

    const rsp = await crearPartePem({
      cliente_id: 'c1',
      tecnico_id: 't1',
      equipo_id: 'e1',
      tipo_orden: 'montaje',
      fecha_instalacion: '2026-06-24',
      equipo_matricula: 'AA',
      notas_tecnico: 'ok',
      notas_cliente: '',
      nombre_firmante: 'Cliente',
      firma_url: 'sb://firmas-clientes/x.png',
      checks: {
        verificacion_suministros: 'si',
        verificacion_funcionamiento: 'no',
        verificacion_seguridades: 'na',
        instrucciones_funcionamiento: 'si',
        instrucciones_mantenimiento: 'si',
      },
      intervension: { inicioIso: '2026-06-24T10:00:00.000Z', finIso: '2026-06-24T10:12:00.000Z' },
      fotos_intervencion: [],
    });

    expect(crearOrdenTrabajoMock).toHaveBeenCalledTimes(1);
    expect(crearOrdenTrabajoMock.mock.calls[0][0]).toMatchObject({
      cliente_id: 'c1',
      tecnico_id: 't1',
      equipo_id: 'e1',
      tipo_orden: 'montaje',
    });
    expect(subirFotosMock).toHaveBeenCalledTimes(1);
    expect(generarInformeMock).toHaveBeenCalledTimes(1);
    expect(rsp).toMatchObject({ id: 'ot-123' });
    expect(update).toHaveBeenCalledTimes(1);
  });
});
