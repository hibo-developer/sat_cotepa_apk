import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
const uploadMock = vi.fn();
const obtenerUrlFirmadaStorageMock = vi.fn(async (url) => `https://signed.test/${encodeURIComponent(String(url || ''))}`);

vi.mock('../assets/cotepa.jpg', () => ({ default: '/mock-cotepa.jpg' }));

vi.mock('./supabaseClient', () => ({
  obtenerClienteSupabase: () => ({
    functions: {
      invoke: (...args) => invokeMock(...args),
    },
    storage: {
      from: () => ({
        upload: (...args) => uploadMock(...args),
      }),
    },
  }),
  obtenerUrlFirmadaStorage: (...args) => obtenerUrlFirmadaStorageMock(...args),
}));

class JsPdfMock {
  constructor() {
    this.pages = 1;
    return new Proxy(this, {
      get: (target, prop, receiver) => {
        if (prop in target) {
          return Reflect.get(target, prop, receiver);
        }
        if (typeof prop === 'string') {
          const fn = vi.fn(() => receiver);
          target[prop] = fn;
          return fn;
        }
        return undefined;
      },
    });
  }

  addPage = vi.fn(() => {
    this.pages += 1;
    return this;
  });

  getNumberOfPages = vi.fn(() => this.pages);

  setPage = vi.fn(() => this);

  getTextWidth = vi.fn((texto) => String(texto || '').length * 2);

  splitTextToSize = vi.fn((texto) => {
    const lineas = String(texto || '').split(/\r?\n/).filter(Boolean);
    return lineas.length ? lineas : [String(texto || '')];
  });

  output = vi.fn((tipo) => {
    if (tipo === 'blob') {
      return new Blob(['pdf'], { type: 'application/pdf' });
    }
    return '';
  });

  addImage = vi.fn(() => this);
}

vi.mock('jspdf', () => ({
  jsPDF: JsPdfMock,
}));

describe('parteTrabajoInformeService', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    uploadMock.mockReset();
    obtenerUrlFirmadaStorageMock.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
  });

  it('genera y sube el informe usando la plantilla corporativa local', async () => {
    uploadMock.mockResolvedValue({ error: null });

    const { generarYSubirInformeParte } = await import('./parteTrabajoInformeService');

    const resultado = await generarYSubirInformeParte({
      parte: {
        id: '11111111-1111-1111-1111-111111111111',
        tareas_realizadas: 'Trabajo completado',
      },
      formulario: {
        cliente_id: '22222222-2222-2222-2222-222222222222',
        tecnico_id: '33333333-3333-3333-3333-333333333333',
        orden_id: '11111111-1111-1111-1111-111111111111',
        prioridad: 'media',
        descripcion_problema: 'Fallo de prueba',
        materialesTexto: '',
      },
      desplazamiento: {
        inicioIso: '2026-06-27T10:00:00.000Z',
        finIso: '2026-06-27T10:15:00.000Z',
      },
      intervension: {
        inicioIso: '2026-06-27T10:15:00.000Z',
        finIso: '2026-06-27T11:00:00.000Z',
        pausasComida: [],
      },
      clienteNombre: 'Cliente Test',
      equipoNombre: 'Equipo Test',
      tecnicoNombre: 'Tecnico Test',
      nombreFirmante: 'Firmante Test',
      firmaUrl: '',
      fotosIntervencionUrls: [],
      secuencialDiario: 7,
      fechaInformeIso: '2026-06-27T10:15:00.000Z',
    });

    expect(invokeMock).not.toHaveBeenCalled();
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock.mock.calls[0][0]).toBe('22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333/11111111-1111-1111-1111-111111111111/SAT-260627-07.pdf');
    expect(resultado).toEqual({
      pdfUrl: 'sb://informes-partes/22222222-2222-2222-2222-222222222222/33333333-3333-3333-3333-333333333333/11111111-1111-1111-1111-111111111111/SAT-260627-07.pdf',
      nombreArchivo: 'SAT-260627-07.pdf',
    });
  });

  it('no rompe el informe si falla la firma de URLs de evidencias', async () => {
    uploadMock.mockResolvedValue({ error: null });
    obtenerUrlFirmadaStorageMock.mockImplementation(async (url) => {
      if (String(url).includes('foto-rota')) {
        throw new Error('signed url error');
      }
      return `https://signed.test/${encodeURIComponent(String(url || ''))}`;
    });

    const { generarYSubirInformeParte } = await import('./parteTrabajoInformeService');

    const resultado = await generarYSubirInformeParte({
      parte: {
        id: '11111111-1111-1111-1111-111111111111',
        tareas_realizadas: 'Trabajo completado',
      },
      formulario: {
        cliente_id: '22222222-2222-2222-2222-222222222222',
        tecnico_id: '33333333-3333-3333-3333-333333333333',
        orden_id: '11111111-1111-1111-1111-111111111111',
        prioridad: 'media',
        descripcion_problema: 'Fallo de prueba',
        materialesTexto: '',
      },
      desplazamiento: {
        inicioIso: '2026-06-27T10:00:00.000Z',
        finIso: '2026-06-27T10:15:00.000Z',
      },
      intervension: {
        inicioIso: '2026-06-27T10:15:00.000Z',
        finIso: '2026-06-27T11:00:00.000Z',
        pausasComida: [],
      },
      clienteNombre: 'Cliente Test',
      equipoNombre: 'Equipo Test',
      tecnicoNombre: 'Tecnico Test',
      nombreFirmante: 'Firmante Test',
      firmaUrl: 'sb://firmas-clientes/cli/tec/firma.png',
      fotosIntervencionUrls: ['sb://fotos-intervenciones/cli/tec/foto-buena.jpg', 'sb://fotos-intervenciones/cli/tec/foto-rota.jpg'],
      secuencialDiario: 8,
      fechaInformeIso: '2026-06-27T10:15:00.000Z',
    });

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(resultado.nombreArchivo).toBe('SAT-260627-08.pdf');
  });
});