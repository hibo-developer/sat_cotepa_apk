import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  actualizarCliente,
  crearCliente,
  eliminarCliente,
  listarClientes,
  obtenerClienteCompleto,
  registrarAuditoriaDescargaCliente,
  validarYSanearPayloadCliente,
  verificarUnicidadIdentificadorFiscal,
} from './clientesService';

const mockFrom = vi.fn();
const mockAuthGetUser = vi.fn().mockResolvedValue({
  data: { user: { id: 'usr-test-1', email: 'test@cotepa.es' } },
});

vi.mock('./supabaseClient', () => ({
  obtenerClienteSupabase: () => ({
    from: mockFrom,
    auth: { getUser: () => mockAuthGetUser() },
  }),
}));

describe('clientesService - Módulo de clientes y datos fiscales', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockAuthGetUser.mockClear();
  });

  describe('validarYSanearPayloadCliente', () => {
    it('sanea datos válidos completos con información fiscal', () => {
      const entrada = {
        nombre: '  Cotepa Servicios S.L. ',
        direccion: ' Calle Principal 123 ',
        telefono: ' +34 912 345 678 ',
        telefono_2: ' +34 912 345 679 ',
        contacto: ' Juan Pérez ',
        cargo: ' Director Técnico ',
        email: ' contacto@cotepa.com ',
        lat: '40.4167',
        lng: '-3.7037',
        identificador_fiscal: ' 20-12345678-9 ',
        razon_social: ' Comercializadora Cotepa S.L. ',
        direccion_fiscal: ' Av. Central 456 ',
        regimen_tributario: ' General ',
        situacion_fiscal: ' Responsable Inscripto ',
        telefono_fiscal: ' +34 911 000 111 ',
        contacto_2: ' María López ',
        cargo_2: ' Administración ',
      };

      const resultado = validarYSanearPayloadCliente(entrada);

      expect(resultado).toEqual({
        nombre: 'Cotepa Servicios S.L.',
        direccion: 'Calle Principal 123',
        telefono: '+34 912 345 678',
        telefono_2: '+34 912 345 679',
        contacto: 'Juan Pérez',
        cargo: 'Director Técnico',
        email: 'contacto@cotepa.com',
        lat: 40.4167,
        lng: -3.7037,
        identificador_fiscal: '20-12345678-9',
        razon_social: 'Comercializadora Cotepa S.L.',
        direccion_fiscal: 'Av. Central 456',
        regimen_tributario: 'General',
        situacion_fiscal: 'Responsable Inscripto',
        telefono_fiscal: '+34 911 000 111',
        contacto_2: 'María López',
        cargo_2: 'Administración',
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
        telefono_2: null,
        contacto: null,
        cargo: null,
        email: null,
        lat: null,
        lng: null,
        identificador_fiscal: null,
        razon_social: null,
        direccion_fiscal: null,
        regimen_tributario: null,
        situacion_fiscal: null,
        telefono_fiscal: null,
        contacto_2: null,
        cargo_2: null,
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

    it('lanza error si se ingresa teléfono del contacto 1 sin persona de contacto ni cargo', () => {
      expect(() =>
        validarYSanearPayloadCliente({
          nombre: 'Cliente Test',
          telefono: '+34 912 345 678',
        })
      ).toThrow('Para registrar el teléfono del contacto 1 debes indicar primero su nombre y cargo/puesto.');
    });

    it('lanza error si se ingresa teléfono del contacto 2 sin cargo (aunque haya nombre de contacto 2)', () => {
      expect(() =>
        validarYSanearPayloadCliente({
          nombre: 'Cliente Test',
          telefono_2: '+34 912 345 679',
          contacto_2: 'María López',
        })
      ).toThrow('Para registrar el teléfono del contacto 2 debes indicar primero su nombre y cargo/puesto.');
    });

    it('permite guardar el teléfono del contacto 1 sin afectar al contacto 2 incompleto', () => {
      expect(() =>
        validarYSanearPayloadCliente({
          nombre: 'Cliente Test',
          telefono: '+34 912 345 678',
          contacto: 'Juan Pérez',
          cargo: 'Director Técnico',
        })
      ).not.toThrow();
    });

    it('permite guardar teléfonos cuando cada contacto tiene su nombre y cargo', () => {
      const resultado = validarYSanearPayloadCliente({
        nombre: 'Cliente Test',
        telefono: '+34 912 345 678',
        telefono_2: '+34 912 345 679',
        contacto: 'Juan Pérez',
        cargo: 'Director Técnico',
        contacto_2: 'María López',
        cargo_2: 'Administración',
      });

      expect(resultado.telefono).toBe('+34 912 345 678');
      expect(resultado.telefono_2).toBe('+34 912 345 679');
      expect(resultado.contacto_2).toBe('María López');
      expect(resultado.cargo_2).toBe('Administración');
    });

    it('permite guardar el cliente sin teléfonos aunque falten contacto y cargo', () => {
      expect(() =>
        validarYSanearPayloadCliente({ nombre: 'Cliente Sin Contacto' })
      ).not.toThrow();
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
            clientes_comerciales: [
              { comercial_id: 'com-1', comerciales: { id: 'com-1', nombre: 'Victor Garcia' } },
            ],
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
        'id, nombre, direccion, telefono, telefono_2, contacto, cargo, contacto_2, cargo_2, email, lat, lng, identificador_fiscal, razon_social, direccion_fiscal, regimen_tributario, situacion_fiscal, telefono_fiscal, created_at, clientes_comerciales(comercial_id, comerciales(id, nombre))'
      );
      expect(clientes).toHaveLength(1);
      expect(clientes[0].identificador_fiscal).toBe('20-11111111-1');
      expect(clientes[0].comerciales).toEqual([{ id: 'com-1', nombre: 'Victor Garcia' }]);
      expect(clientes[0].clientes_comerciales).toBeUndefined();
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

    it('crearCliente no toca las asignaciones de comerciales si no se envía comerciales_ids', async () => {
      const singleInsert = vi.fn().mockResolvedValue({
        data: { id: 'cli-nuevo', nombre: 'Cliente Nuevo' },
        error: null,
      });

      mockFrom.mockImplementation((tabla) => {
        if (tabla === 'clientes') {
          return {
            select: () => ({
              eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
            }),
            insert: () => ({ select: () => ({ single: singleInsert }) }),
          };
        }
        throw new Error(`Tabla inesperada: ${tabla}`);
      });

      await crearCliente({ nombre: 'Cliente Nuevo' });

      expect(mockFrom).not.toHaveBeenCalledWith('clientes_comerciales');
      expect(mockFrom).not.toHaveBeenCalledWith('comerciales');
    });

    it('crearCliente sincroniza los comerciales asignados cuando se envía comerciales_ids', async () => {
      const singleInsert = vi.fn().mockResolvedValue({
        data: { id: 'cli-nuevo', nombre: 'Cliente Nuevo' },
        error: null,
      });
      const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
      const insertComercialesMock = vi.fn().mockResolvedValue({ error: null });

      mockFrom.mockImplementation((tabla) => {
        if (tabla === 'clientes') {
          return {
            select: () => ({
              eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
            }),
            insert: () => ({ select: () => ({ single: singleInsert }) }),
          };
        }
        if (tabla === 'clientes_comerciales') {
          return {
            delete: () => ({ eq: deleteEqMock }),
            insert: insertComercialesMock,
          };
        }
        throw new Error(`Tabla inesperada: ${tabla}`);
      });

      await crearCliente({ nombre: 'Cliente Nuevo', comerciales_ids: ['com-a'] });

      expect(deleteEqMock).toHaveBeenCalledWith('cliente_id', 'cli-nuevo');
      expect(insertComercialesMock).toHaveBeenCalledWith([{ cliente_id: 'cli-nuevo', comercial_id: 'com-a' }]);
    });

    it('actualizarCliente asigna el comercial predeterminado si comerciales_ids llega vacío', async () => {
      const singleUpdate = vi.fn().mockResolvedValue({
        data: { id: 'cli-existente', nombre: 'Cliente Existente' },
        error: null,
      });
      const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
      const insertComercialesMock = vi.fn().mockResolvedValue({ error: null });

      mockFrom.mockImplementation((tabla) => {
        if (tabla === 'clientes') {
          return {
            select: () => ({
              eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
            }),
            update: () => ({ eq: () => ({ select: () => ({ single: singleUpdate }) }) }),
          };
        }
        if (tabla === 'clientes_comerciales') {
          return {
            delete: () => ({ eq: deleteEqMock }),
            insert: insertComercialesMock,
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

      await actualizarCliente('cli-existente', { nombre: 'Cliente Existente', comerciales_ids: [] });

      expect(insertComercialesMock).toHaveBeenCalledWith([{ cliente_id: 'cli-existente', comercial_id: 'com-victor' }]);
    });
  });

  describe('obtenerClienteCompleto', () => {
    it('lanza consultas en paralelo y agrupa cliente, equipos y ordenes', async () => {
      const clienteData = {
        id: 'cli-abc',
        nombre: 'Panadería El Horno',
        identificador_fiscal: '20-11111111-1',
        clientes_comerciales: [
          { comercial_id: 'com-x', comerciales: { id: 'com-x', nombre: 'Victor Garcia' } },
        ],
      };
      const equiposData = [
        { id: 'eq-1', cliente_id: 'cli-abc', nombre: 'Horno nº1', marca: 'Zanolli' },
      ];
      const ordenesData = [
        {
          id: 'ot-1',
          numero_ticket: 'T-0001',
          estado: 'finalizado',
          tiempo_empleado_minutos: 75,
          coste_total: 120.5,
          fecha_inicio: '2026-01-15T10:00:00Z',
          materiales_orden: [{ id: 'm1', nombre_material: 'Resistencia', cantidad: 1, precio_unitario: 30 }],
          tecnicos: [{ id: 't1', nombre: 'Tecnico A' }],
        },
      ];

      const selectCliente = vi.fn().mockReturnThis();
      const eqCliente = vi.fn().mockReturnThis();
      const maybeSingleCliente = vi.fn().mockResolvedValue({ data: clienteData, error: null });

      const selectEquipos = vi.fn().mockReturnThis();
      const eqEquipos = vi.fn().mockReturnThis();
      const orderEquipos = vi.fn().mockResolvedValue({ data: equiposData, error: null });

      const selectOrdenes = vi.fn().mockReturnThis();
      const eqOrdenes = vi.fn().mockReturnThis();
      const limitOrdenes = vi.fn().mockResolvedValue({ data: ordenesData, error: null });
      const orderOrdenes = vi.fn(() => ({ limit: limitOrdenes }));

      mockFrom.mockImplementation((tabla) => {
        if (tabla === 'clientes') {
          return { select: selectCliente, eq: eqCliente, maybeSingle: maybeSingleCliente };
        }
        if (tabla === 'equipos') {
          return { select: selectEquipos, eq: eqEquipos, order: orderEquipos };
        }
        if (tabla === 'ordenes_trabajo') {
          return { select: selectOrdenes, eq: eqOrdenes, order: orderOrdenes };
        }
        throw new Error(`Tabla inesperada en obtenerClienteCompleto: ${tabla}`);
      });

      const resultado = await obtenerClienteCompleto('cli-abc');

      expect(resultado.cliente.id).toBe('cli-abc');
      expect(resultado.cliente.nombre).toBe('Panadería El Horno');
      expect(resultado.equipos).toHaveLength(1);
      expect(resultado.equipos[0].marca).toBe('Zanolli');
      expect(resultado.ordenes).toHaveLength(1);
      expect(resultado.ordenes[0].materiales_orden).toHaveLength(1);
      expect(resultado.cliente.comerciales).toEqual([
        { id: 'com-x', nombre: 'Victor Garcia', es_predeterminado: false, activo: false },
      ]);
      expect(resultado.resumen.total_ordenes).toBe(1);
      expect(resultado.resumen.ordenes_finalizadas).toBe(1);
      expect(resultado.resumen.importe_total_facturado).toBe(120.5);
      expect(resultado.resumen.horas_totales_servicio).toBeGreaterThan(0);
      expect(limitOrdenes).toHaveBeenCalledWith(200);
    });

    it('lanza error claro si el cliente no existe en la tabla', async () => {
      const maybeSingleCliente = vi.fn().mockResolvedValue({ data: null, error: null });
      const orderEquiposEmpty = vi.fn().mockResolvedValue({ data: [], error: null });
      const limitOrdenesEmpty = vi.fn().mockResolvedValue({ data: [], error: null });
      const orderOrdenesEmpty = vi.fn(() => ({ limit: limitOrdenesEmpty }));
      mockFrom.mockImplementation((tabla) => {
        if (tabla === 'clientes') {
          return {
            select: () => ({ eq: () => ({ maybeSingle: maybeSingleCliente }) }),
          };
        }
        if (tabla === 'equipos') {
          return { select: () => ({ eq: () => ({ order: orderEquiposEmpty }) }) };
        }
        if (tabla === 'ordenes_trabajo') {
          return { select: () => ({ eq: () => ({ order: orderOrdenesEmpty }) }) };
        }
        throw new Error(`Tabla inesperada: ${tabla}`);
      });

      await expect(obtenerClienteCompleto('cli-inexistente')).rejects.toThrow(
        'El cliente indicado no existe o no tienes permiso para acceder a él.'
      );
    });
  });

  describe('registrarAuditoriaDescargaCliente', () => {
    it('intenta insertar en auditoria_descargas_clientes y no lanza error aunque la tabla no exista (degradación graciosa)', async () => {
      const maybeSingleAudit = vi.fn().mockRejectedValue(new Error('relation does not exist'));
      const insertAudit = vi.fn(() => ({ maybeSingle: maybeSingleAudit }));
      mockFrom.mockImplementation((tabla) => {
        if (tabla === 'auditoria_descargas_clientes') {
          return { insert: insertAudit };
        }
        throw new Error(`Tabla inesperada en auditoria: ${tabla}`);
      });
      const infoStub = vi.fn();
      vi.stubGlobal('console', { ...console, info: infoStub, error: vi.fn() });
      await expect(
        registrarAuditoriaDescargaCliente({
          clienteIds: ['cli-1', 'cli-2'],
          tipoDescarga: 'masiva',
          opciones: { anonimizar: true },
        })
      ).resolves.not.toThrow();
      expect(insertAudit).toHaveBeenCalled();
    });

    it('incluye clienteIds, tipoDescarga y opciones en el payload de inserción', async () => {
      const maybeSingleAudit = vi.fn().mockResolvedValue({ error: null, data: null });
      const insertAudit = vi.fn(() => ({ maybeSingle: maybeSingleAudit }));
      mockFrom.mockImplementation((tabla) => {
        if (tabla === 'auditoria_descargas_clientes') {
          return { insert: insertAudit };
        }
        throw new Error(`Tabla inesperada: ${tabla}`);
      });
      await registrarAuditoriaDescargaCliente({
        clienteIds: ['cli-1'],
        tipoDescarga: 'individual',
        opciones: { anonimizar: false },
      });
      expect(insertAudit).toHaveBeenCalledTimes(1);
      const payloadLlamada = insertAudit.mock.calls[0][0];
      expect(Array.isArray(payloadLlamada.cliente_ids)).toBe(true);
      expect(payloadLlamada.cliente_ids).toEqual(['cli-1']);
      expect(payloadLlamada.tipo_descarga).toBe('individual');
      expect(payloadLlamada.anonimizado).toBe(false);
      expect(typeof payloadLlamada.fecha_hora).toBe('string');
    });
  });
});