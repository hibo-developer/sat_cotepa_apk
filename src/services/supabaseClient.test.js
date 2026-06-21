import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    functions: {
      invoke: (...args) => invokeMock(...args),
    },
  })),
}));

describe('obtenerUrlFirmadaStorage', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.resetModules();
    globalThis.window = {
      __APP_CONFIG__: {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
      },
    };
  });

  it('omite cache en informes PDF y añade cache bust al regenerar la URL', async () => {
    invokeMock
      .mockResolvedValueOnce({ data: { url: 'https://example.supabase.co/storage/v1/object/sign/informes-partes/cli/tec/ord/informe.pdf?token=uno' }, error: null })
      .mockResolvedValueOnce({ data: { url: 'https://example.supabase.co/storage/v1/object/sign/informes-partes/cli/tec/ord/informe.pdf?token=dos' }, error: null });

    const mod = await import('./supabaseClient');
    const primera = await mod.obtenerUrlFirmadaStorage('sb://informes-partes/cli/tec/ord/informe.pdf');
    const segunda = await mod.obtenerUrlFirmadaStorage('sb://informes-partes/cli/tec/ord/informe.pdf');

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(primera).toContain('token=uno');
    expect(segunda).toContain('token=dos');
    expect(primera).toContain('_ts=');
    expect(segunda).toContain('_ts=');
    expect(primera).not.toBe(segunda);
  });

  it('mantiene cache en otros buckets para no repetir firmas innecesarias', async () => {
    invokeMock.mockResolvedValue({
      data: { url: 'https://example.supabase.co/storage/v1/object/sign/fotos-intervenciones/cli/tec/ord/foto.jpg?token=foto' },
      error: null,
    });

    const mod = await import('./supabaseClient');
    const primera = await mod.obtenerUrlFirmadaStorage('sb://fotos-intervenciones/cli/tec/ord/foto.jpg');
    const segunda = await mod.obtenerUrlFirmadaStorage('sb://fotos-intervenciones/cli/tec/ord/foto.jpg');

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(primera).toBe(segunda);
    expect(primera).not.toContain('_ts=');
  });

  it('no devuelve referencias sb:// cuando falla la firma de una URL de storage', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: 'Failed to fetch' },
    });

    const mod = await import('./supabaseClient');
    const url = await mod.obtenerUrlFirmadaStorage('sb://informes-partes/cli/tec/ord/informe.pdf');

    expect(url).toBe('');
  });
});
