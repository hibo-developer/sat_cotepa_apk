import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  actualizarCliente,
  crearCliente,
  eliminarCliente,
  listarClientes,
  validarYSanearPayloadCliente,
  verificarUnicidadIdentificadorFiscal,
} from './clientesService';

const mockFrom = vi.fn();

vi.mock('./supabaseClient', () => ({
  obtenerClienteSupabase: () => ({
    from: mockFrom,
  }),
}));

describe('clientesService - Módulo de clientes y datos fiscales', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  describe('validarYSanearPayloadCliente', () => {
    it('sanea datos válidos completos con información fiscal', () => {
      const entrada = {
        nombre: '  Cotepa Servicios S.L. ',
        direccion: ' Calle Principal 123 ',
        telefono: ' +34 912 345 678 ',
        email: ' contacto@cotepa.com ',
        lat: '40.4167',
        lng: '-3.7037',
        identificador_fiscal: ' 20-12345678-9 ',
        razon_social: ' Comercializadora Cotepa S.L. ',
        direccion_fiscal: ' Av. Central 456 ',
        regimen_tributario: ' General ',
        situacion_fiscal: ' Responsable Inscripto ',
      };

      const resultado = validarYSanearPayloadCliente(entrada);

      expect(resultado).toEqual({
        nombre: 'Cotepa Servicios S.L.',
        direccion: 'Calle Principal 123',
        telefono: '+34 912 345 678',
        email: 'contacto@cotepa.com',
        lat: 40.4167,
        lng: -3.7037,
        identificador_fiscal: '20-12345678-9',
        razon_social: 'Comercializadora Cotepa S.L.',
        direccion_fiscal: 'Av. Central 456',
        regimen_tributario: 'General',
        situacion_fiscal: 'Responsable Inscripto',
      });
    });

    it('permite registros antiguos/mínimos sin datos fiscales (retrocompatibilidad)', () => {
      const entrada = {
        nombre: 'Cliente Antiguo',
      };

      const resultado = validarYSanearPayloadCliente(entrada);

      expect(resultado).toEqual({
        nombre: 'Cliente Antiguo',
        direccion: null,
        telefono: null,
        email: null,
        lat: null,
        lng: null,
        identificador_fiscal: null,
        razon_social: null,
        direccion_fiscal: null,
        regimen_tributario: null,
        situacion_fiscal: null,
      });
    });

    it('lanza error si el nombre está vacío', () => {
      expect(() => validarYSanearPayloadCliente({ nombre: '   ' })).toThrow(
        'El nombre o razón comercial del cliente es obligatorio.'
      );
    });

    it('lanza error si el formato del correo es inválido', () => {
      expect(() =>
        validarYSanearPayloadCliente({
          nombre: 'Cliente Test',
          email: 'correo-invalido-sin-arroba',
        })
      ).toThrow('El formato del correo electrónico es inválido.');
    });

    it('valida el formato del identificador fiscal (longitud y caracteres permitidos)', () => {
      // Demasiado corto (<4 caracteres)
      expect(() =>
        validarYSanearPayloadCliente({
          nombre: 'Cliente Test',
          identificador_fiscal: '123',
        })
      ).toThrow('El identificador fiscal debe tener entre 4 y 30 caracteres.');

      // Caracteres no alfanuméricos / no permitidos
      expect(() =>
        validarYSanearPayloadCliente({
          nombre: 'Cliente Test',
          identificador_fiscal: '20-12345678-9#$',
        })
      ).toThrow('El identificador fiscal solo puede contener caracteres alfanuméricos, guiones o puntos.');
    });
  });

  describe('verificarUnicidadIdentificadorFiscal', () => {
    it('pasa silenciosamente si no se proporciona identificador fiscal', async () => {
      const supabase = { from: mockFrom };
      await expect(verificarUnicidadIdentificadorFiscal(supabase, null)).resolves.not.toThrow();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('lanza error si ya existe otro cliente activo con el mismo identificador fiscal', async () => {
      const selectMock = vi.fn().mockReturnThis();
      const eqMock = vi.fn().mockReturnThis();
      const isMock = vi.fn().mockReturnThis();
      const maybeSingleMock = vi.fn().mockResolvedValue({
        data: { id: 'uuid-existente', nombre: 'Empresa Existente' },
        error: null,
      });

      mockFrom.mockReturnValue({
        select: selectMock,
        eq: eqMock,
        is: isMock,
        maybeSingle: maybeSingleMock,
      });

      const supabase = { from: mockFrom };

      await expect(
        verificarUnicidadIdentificadorFiscal(supabase, '20-12345678-9')
      ).rejects.toThrow('Ya existe un cliente registrado (Empresa Existente) con el identificador fiscal "20-12345678-9".');
    });
  });

  describe('Operaciones CRUD de Clientes', () => {
    it('listarClientes solicita todos los campos incluyendo los nuevos campos fiscales', async () => {
      const selectMock = vi.fn().mockReturnThis();
      const orderMock = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'cli-1',
            nombre: 'Cliente Uno',
            identificador_fiscal: '20-11111111-1',
            razon_social: 'Cliente Uno S.A.',
          },
        ],
        error: null,
      });

      mockFrom.mockReturnValue({
        select: selectMock,
        order: orderMock,
      });

      const clientes = await listarClientes();

      expect(mockFrom).toHaveBeenCalledWith('clientes');
      expect(selectMock).toHaveBeenCalledWith(
        'id, nombre, direccion, telefono, email, lat, lng, identificador_fiscal, razon_social, direccion_fiscal, regimen_tributario, situacion_fiscal, created_at'
      );
      expect(clientes).toHaveLength(1);
      expect(clientes[0].identificador_fiscal).toBe('20-11111111-1');
    });

    it('crearCliente inserta datos fiscalmente validados', async () => {
      const singleInsert = vi.fn().mockResolvedValue({
        data: {
          id: 'cli-nuevo',
          nombre: 'Cliente Nuevo',
          identificador_fiscal: '30-99999999-9',
        },
        error: null,
      });

      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: singleInsert,
          }),
        }),
      });

      const resultado = await crearCliente({
        nombre: 'Cliente Nuevo',
        identificador_fiscal: '30-99999999-9',
        razon_social: 'Cliente Nuevo S.R.L.',
      });

      expect(resultado.id).toBe('cli-nuevo');
      expect(resultado.identificador_fiscal).toBe('30-99999999-9');
    });

    it('crearCliente captura error 23505 de unicidad y devuelve mensaje claro', async () => {
      const singleInsert = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      });

      mockFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: singleInsert,
          }),
        }),
      });

      await expect(
        crearCliente({
          nombre: 'Cliente Duplicado',
          identificador_fiscal: '20-12345678-9',
        })
      ).rejects.toThrow('Ya existe un cliente registrado con el identificador fiscal "20-12345678-9".');
    });
  });
});