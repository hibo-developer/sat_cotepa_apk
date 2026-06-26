import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock supabaseClient
const fromMock = vi.fn();
const uploadMock = vi.fn();
const obtenerUrlFirmadaStorageMock = vi.fn();

vi.mock('./supabaseClient', () => ({
  obtenerClienteSupabase: () => ({
    storage: {
      from: (bucket) => fromMock(bucket),
    },
    from: (table) => fromMock(table),
  }),
  obtenerUrlFirmadaStorage: (...args) => obtenerUrlFirmadaStorageMock(...args),
}));

describe('storageSat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockReset();
    uploadMock.mockReset();
    obtenerUrlFirmadaStorageMock.mockReset();
  });

  it('exporta constantes de buckets', async () => {
    const { BUCKET_FOTOS, BUCKET_FIRMAS, BUCKET_INFORMES, BUCKET_AUDIOS } = await import('./storageSat');
    expect(BUCKET_FOTOS).toBe('fotos-intervenciones');
    expect(BUCKET_FIRMAS).toBe('firmas-clientes');
    expect(BUCKET_INFORMES).toBe('informes-partes');
    expect(BUCKET_AUDIOS).toBe('audios-clientes');
  });

  it('construye rutas con formato clienteId/tecnicoId/parteId/{tipo}-{idx}_{ts}.{ext} si hay IDs', async () => {
    const { subirArchivoSAT } = await import('./storageSat');

    const blob = new Blob(['test'], { type: 'image/png' });
    const singleMock = vi.fn(async () => ({ data: { id: 'test-id' }, error: null }));
    const selectMock = vi.fn(() => ({ single: singleMock }));
    const insertMock = vi.fn(() => ({ select: selectMock }));
    const fromTableMock = vi.fn(() => ({ insert: insertMock }));

    fromMock.mockImplementation((name) => {
      if (name === 'archivos_parte') {
        return fromTableMock();
      }
      return {
        upload: uploadMock.mockResolvedValue({ error: null }),
      };
    });

    const result = await subirArchivoSAT(blob, {
      clienteId: 'cli-123',
      tecnicoId: 'tec-456',
      otNumero: 'SAT-123',
      parteId: 'parte-456',
      tipo: 'foto-evidencia',
      indice: 2,
    });

    expect(result.path).toMatch(/^cli-123\/tec-456\/parte-456\/foto-evidencia-2_\d+\.png$/);
    expect(result.bucket).toBe('fotos-intervenciones');
    expect(result.registro.id).toBe('test-id');
  });

  it('listarArchivosParte devuelve array vacío si no hay parteId', async () => {
    const { listarArchivosParte } = await import('./storageSat');
    const result = await listarArchivosParte('');
    expect(result).toEqual([]);
  });

  it('lanza error claro si faltan clienteId/tecnicoId al subir evidencias', async () => {
    const { subirArchivoSAT } = await import('./storageSat');
    const blob = new Blob(['test'], { type: 'image/png' });

    await expect(
      subirArchivoSAT(blob, {
        otNumero: 'SAT-123',
        parteId: 'parte-456',
        tipo: 'foto-evidencia',
      }),
    ).rejects.toThrow(/clienteId y tecnicoId/i);
  });

  it('getUrlPublica delega a obtenerUrlFirmadaStorage', async () => {
    const { getUrlPublica } = await import('./storageSat');
    obtenerUrlFirmadaStorageMock.mockResolvedValue('https://example.com/signed-url');

    const url = await getUrlPublica('sb://fotos-intervenciones/2024/06/test.png');
    expect(url).toBe('https://example.com/signed-url');
    expect(obtenerUrlFirmadaStorageMock).toHaveBeenCalledWith('sb://fotos-intervenciones/2024/06/test.png', { expiresIn: 3600 });
  });
});
