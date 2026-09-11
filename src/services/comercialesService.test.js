import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listarComerciales,
  obtenerComercialPredeterminado,
  sincronizarComercialesDeCliente,
} from './comercialesService';

const mockFrom = vi.fn();

vi.mock('./supabaseClient', () => ({
  obtenerClienteSupabase: () => ({
    from: mockFrom,
  }),
}));

describe('comercialesService - Módulo de comerciales', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  describe('listarComerciales', () => {
    it('solicita comerciales ordenados por nombre', async () => {
      const selectMock = vi.fn().mockReturnThis();
      const orderMock = vi.fn().mockResolvedValue({
        data: [{ id: 'com-1', nombre: 'Victor Garcia', activo: true, es_predeterminado: true }],
        error: null,
      });

      mockFrom.mockReturnValue({ select: selectMock, order: orderMock });

      const resultado = await listarComerciales();

      expect(mockFrom).toHaveBeenCalledWith('comerciales');
      expect(selectMock).toHaveBeenCalledWith('id, nombre, activo, es_predeterminado');
      expect(resultado).toHaveLength(1);
      expect(resultado[0].nombre).toBe('Victor Garcia');
    });

    it('propaga un error legible si falla la consulta', async () => {
      mockFrom.mockReturnValue({
        select: () => ({
          order: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
        }),
      });

      await expect(listarComerciales()).rejects.toThrow();
    });
  });

  describe('obtenerComercialPredeterminado', () => {
    it('devuelve el comercial marcado como predeterminado', async () => {
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: 'com-victor', nombre: 'Victor Garcia' }, error: null }),
          }),
        }),
      });

      const resultado = await obtenerComercialPredeterminado();

      expect(mockFrom).toHaveBeenCalledWith('comerciales');
      expect(resultado).toEqual({ id: 'com-victor', nombre: 'Victor Garcia' });
    });

    it('devuelve null si no hay ningun comercial predeterminado configurado', async () => {
      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      });

      const resultado = await obtenerComercialPredeterminado();

      expect(resultado).toBeNull();
    });
  });

  describe('sincronizarComercialesDeCliente', () => {
    it('reemplaza las asignaciones existentes por los ids indicados', async () => {
      const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
      const insertMock = vi.fn().mockResolvedValue({ error: null });

      mockFrom.mockImplementation((tabla) => {
        if (tabla === 'clientes_comerciales') {
          return {
            delete: () => ({ eq: deleteEqMock }),
            insert: insertMock,
          };
        }
        throw new Error(`Tabla inesperada: ${tabla}`);
      });

      await sincronizarComercialesDeCliente('cli-1', ['com-a', 'com-b', 'com-a']);

      expect(deleteEqMock).toHaveBeenCalledWith('cliente_id', 'cli-1');
      expect(insertMock).toHaveBeenCalledWith([
        { cliente_id: 'cli-1', comercial_id: 'com-a' },
        { cliente_id: 'cli-1', comercial_id: 'com-b' },
      ]);
    });

    it('asigna el comercial predeterminado si la lista de ids queda vacía', async () => {
      const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
      const insertMock = vi.fn().mockResolvedValue({ error: null });

      mockFrom.mockImplementation((tabla) => {
        if (tabla === 'clientes_comerciales') {
          return {
            delete: () => ({ eq: deleteEqMock }),
            insert: insertMock,
          };
        }
        if (tabla === 'comerciales') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: 'com-victor', nombre: 'Victor Garcia' }, error: null }),
              }),
            }),
          };
        }
        throw new Error(`Tabla inesperada: ${tabla}`);
      });

      await sincronizarComercialesDeCliente('cli-2', []);

      expect(insertMock).toHaveBeenCalledWith([{ cliente_id: 'cli-2', comercial_id: 'com-victor' }]);
    });

    it('no inserta nada si no hay ids ni comercial predeterminado configurado', async () => {
      const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
      const insertMock = vi.fn();

      mockFrom.mockImplementation((tabla) => {
        if (tabla === 'clientes_comerciales') {
          return {
            delete: () => ({ eq: deleteEqMock }),
            insert: insertMock,
          };
        }
        if (tabla === 'comerciales') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        throw new Error(`Tabla inesperada: ${tabla}`);
      });

      await sincronizarComercialesDeCliente('cli-3', null);

      expect(deleteEqMock).toHaveBeenCalledWith('cliente_id', 'cli-3');
      expect(insertMock).not.toHaveBeenCalled();
    });

    it('lanza un error legible si falla el borrado previo', async () => {
      mockFrom.mockImplementation((tabla) => {
        if (tabla === 'clientes_comerciales') {
          return {
            delete: () => ({ eq: () => Promise.resolve({ error: { message: 'boom' } }) }),
          };
        }
        throw new Error(`Tabla inesperada: ${tabla}`);
      });

      await expect(sincronizarComercialesDeCliente('cli-4', ['com-a'])).rejects.toThrow();
    });

    it('lanza un error legible si falla la inserción', async () => {
      mockFrom.mockImplementation((tabla) => {
        if (tabla === 'clientes_comerciales') {
          return {
            delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
            insert: () => Promise.resolve({ error: { message: 'boom' } }),
          };
        }
        throw new Error(`Tabla inesperada: ${tabla}`);
      });

      await expect(sincronizarComercialesDeCliente('cli-5', ['com-a'])).rejects.toThrow();
    });
  });
});
