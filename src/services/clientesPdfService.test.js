import { beforeEach, describe, expect, it, vi } from 'vitest';

class JsPdfMock {
  constructor() {
    this.pages = 1;
    this.internal = {
      pages: [{ getWidth: () => 210, getHeight: () => 297 }],
    };
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
      return new Blob(['pdf-dummy'], { type: 'application/pdf' });
    }
    return '';
  });

  addImage = vi.fn(() => this);
}

vi.mock('jspdf', () => ({
  jsPDF: JsPdfMock,
}));

let mockPdfLibLoad = vi.fn();
let mockPdfLibSave = vi.fn();
vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: (...args) => mockPdfLibLoad(...args),
  },
}));

beforeEach(() => {
  mockPdfLibLoad = vi.fn(async () => ({
    save: async (opts) => {
      mockPdfLibSave(opts);
      const payload = opts && opts.encrypt ? 'pdf-cifrado' : 'pdf-plain';
      return new TextEncoder().encode(payload).buffer;
    },
  }));
  mockPdfLibSave = vi.fn();
});

describe('clientesPdfService', () => {
  beforeEach(() => {
    const createElementFn = vi.fn(() => {
      const a = {
        click: vi.fn(),
        remove: vi.fn(),
        style: {},
        setAttribute: vi.fn(),
      };
      return a;
    });
    vi.stubGlobal('document', {
      createElement: createElementFn,
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob) => `blob:mock-${(blob && blob.size) || 0}`),
      revokeObjectURL: vi.fn(),
    });
  });

  describe('autorizadoParaDescargarPdfCliente', () => {
    it('permite descarga a rol admin', async () => {
      const { autorizadoParaDescargarPdfCliente } = await import('./clientesPdfService');
      expect(autorizadoParaDescargarPdfCliente('admin')).toBe(true);
    });

    it('permite descarga a rol oficina', async () => {
      const { autorizadoParaDescargarPdfCliente } = await import('./clientesPdfService');
      expect(autorizadoParaDescargarPdfCliente('oficina')).toBe(true);
    });

    it('permite descarga a rol comercial', async () => {
      const { autorizadoParaDescargarPdfCliente } = await import('./clientesPdfService');
      expect(autorizadoParaDescargarPdfCliente('comercial')).toBe(true);
    });

    it('bloquea descarga a rol técnico', async () => {
      const { autorizadoParaDescargarPdfCliente } = await import('./clientesPdfService');
      expect(autorizadoParaDescargarPdfCliente('tecnico')).toBe(false);
    });

    it('bloquea descarga a roles desconocidos o vacíos', async () => {
      const { autorizadoParaDescargarPdfCliente } = await import('./clientesPdfService');
      expect(autorizadoParaDescargarPdfCliente(null)).toBe(false);
      expect(autorizadoParaDescargarPdfCliente('')).toBe(false);
      expect(autorizadoParaDescargarPdfCliente('invitado')).toBe(false);
      expect(autorizadoParaDescargarPdfCliente(undefined)).toBe(false);
    });
  });

  describe('obtenerMaxClientesDescargaMasiva', () => {
    it('devuelve 50 como límite máximo', async () => {
      const { obtenerMaxClientesDescargaMasiva } = await import('./clientesPdfService');
      expect(obtenerMaxClientesDescargaMasiva()).toBe(50);
    });
  });

  describe('construirMensajeErrorUsuario', () => {
    it('traduce error de permisos a mensaje legible', async () => {
      const { construirMensajeErrorUsuario } = await import('./clientesPdfService');
      const err = new Error('El usuario no tiene permisos suficientes.');
      const msj = construirMensajeErrorUsuario(err);
      expect(msj).toContain('permiso');
      expect(msj).toContain('administración');
    });

    it('traduce error de generación PDF por tamaño excedido usando la rama PDF', async () => {
      const { construirMensajeErrorUsuario } = await import('./clientesPdfService');
      const err = new Error('Fallo al generar PDF: tamaño 22MB sobrepasa el máximo configurado');
      const msj = construirMensajeErrorUsuario(err);
      expect(msj).toContain('generar el archivo PDF');
      expect(msj).toContain('segundos');
    });

    it('traduce error de límite masivo cuando viene con los dígitos del servicio', async () => {
      const { construirMensajeErrorUsuario } = await import('./clientesPdfService');
      const err = new Error('Se han seleccionado 51 clientes. El límite para descarga masiva es 50.');
      const msj = construirMensajeErrorUsuario(err);
      expect(msj).toMatch(/límite/i);
      expect(msj).toContain('clientes');
    });

    it('mantiene un mensaje genérico con pasos para errores desconocidos', async () => {
      const { construirMensajeErrorUsuario } = await import('./clientesPdfService');
      const msj = construirMensajeErrorUsuario(new Error('Internal crash 500'));
      expect(msj).toContain('problema persiste');
      expect(msj).toContain('soporte técnico');
    });

    it('maneja entradas que no son instancias de Error (string)', async () => {
      const { construirMensajeErrorUsuario } = await import('./clientesPdfService');
      const msj = construirMensajeErrorUsuario('fallo-raro-string');
      expect(typeof msj).toBe('string');
      expect(msj.length).toBeGreaterThan(0);
    });
  });

  describe('generarDemoPdfCliente', () => {
    it('genera un blob PDF y un nombre de archivo estructurado', async () => {
      const { generarDemoPdfCliente } = await import('./clientesPdfService');
      const resultado = await generarDemoPdfCliente();
      expect(resultado).toBeDefined();
      expect(resultado.nombreArchivo).toMatch(/^FICHA-CLIENTE-/);
      expect(resultado.nombreArchivo.endsWith('.pdf')).toBe(true);
      expect(resultado.referencia).toBeTruthy();
      expect(typeof resultado.fechaGeneracion).toBe('string');
      expect(() => new Date(resultado.fechaGeneracion).toISOString()).not.toThrow();
      expect(resultado.pdfBlob).toBeInstanceOf(Blob);
      expect(resultado.pdfBlob.type).toBe('application/pdf');
    });
  });

  describe('generarPdfClientesMasivo', () => {
    it('rechaza explícitamente listados mayores que el límite 50', async () => {
      const { generarPdfClientesMasivo, obtenerMaxClientesDescargaMasiva } = await import('./clientesPdfService');
      const limite = obtenerMaxClientesDescargaMasiva();
      const demasiados = Array.from({ length: limite + 1 }, (_, i) => ({
        id: `cli-${i}`,
        cliente: { id: `cli-${i}`, nombre: `Cliente ${i}` },
        equipos: [],
        ordenes: [],
        resumen: {},
      }));
      await expect(
        generarPdfClientesMasivo({ listaDatosCompletos: demasiados })
      ).rejects.toThrow(/límite para descarga masiva es 50/);
    });

    it('informa progreso y produce blob PDF con lista pequeña', async () => {
      const { generarPdfClientesMasivo } = await import('./clientesPdfService');
      const onProgreso = vi.fn();
      const lista = [
        {
          id: 'cli-1',
          cliente: { id: 'cli-1', nombre: 'Cliente Uno' },
          equipos: [],
          ordenes: [],
          resumen: {},
        },
        {
          id: 'cli-2',
          cliente: { id: 'cli-2', nombre: 'Cliente Dos' },
          equipos: [],
          ordenes: [],
          resumen: {},
        },
      ];
      const resultado = await generarPdfClientesMasivo({
        listaDatosCompletos: lista,
        opciones: { onProgreso },
      });
      expect(resultado.numeroClientesExito).toBe(2);
      expect(resultado.numeroClientesError).toBe(0);
      expect(resultado.pdfBlob).toBeInstanceOf(Blob);
      expect(resultado.nombreArchivo.startsWith('CLIENTES-FICHA-MASIVA-')).toBe(true);
      expect(onProgreso).toHaveBeenCalled();
      expect(onProgreso.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('generarPdfClienteIndividual', () => {
    it('devuelve referencia y nombre de archivo para datos mínimos', async () => {
      const { generarPdfClienteIndividual } = await import('./clientesPdfService');
      const resultado = await generarPdfClienteIndividual({
        datosCompletos: {
          id: 'cli-test',
          cliente: { id: 'cli-test', nombre: 'Acme Test' },
          equipos: [],
          ordenes: [],
          resumen: {},
        },
      });
      expect(resultado.nombreArchivo).toMatch(/^FICHA-CLIENTE-.*\.pdf$/);
      expect(resultado.referencia.startsWith('FICHA-CLIENTE-')).toBe(true);
      expect(typeof resultado.fechaGeneracion).toBe('string');
      expect(Number.isNaN(Date.parse(resultado.fechaGeneracion))).toBe(false);
    });

    it('acepta la opción anonimizar sin fallar', async () => {
      const { generarPdfClienteIndividual } = await import('./clientesPdfService');
      await expect(
        generarPdfClienteIndividual({
          datosCompletos: {
            id: 'cli-test-2',
            cliente: {
              id: 'cli-test-2',
              nombre: 'Empresa S.A.',
              identificador_fiscal: '20-12345678-9',
              email: 'admin@empresa.test',
              telefono: '+34 900 000 000',
            },
            equipos: [],
            ordenes: [],
            resumen: {},
          },
          opciones: { anonimizar: true },
        })
      ).resolves.toBeDefined();
    });
  });

  describe('descargarBlobEnNavegador', () => {
    it('invoca la descarga por clic en enlace temporal y limpia URL', async () => {
      const { descargarBlobEnNavegador } = await import('./clientesPdfService');
      const blob = new Blob(['hola'], { type: 'application/pdf' });
      descargarBlobEnNavegador({ blob, nombreArchivo: 'demo.pdf' });
      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(document.createElement).toHaveBeenCalledWith('a');
    });

    it('limpia el nombre de archivo quitando caracteres no seguros', async () => {
      const { descargarBlobEnNavegador } = await import('./clientesPdfService');
      const blob = new Blob(['hola'], { type: 'application/pdf' });
      const enlace = document.createElement('a');
      enlace.click = vi.fn();
      vi.spyOn(document, 'createElement').mockReturnValue(enlace);
      descargarBlobEnNavegador({ blob, nombreArchivo: 'mal/nombre<script>.pdf' });
      expect(enlace.download).not.toContain('/');
      expect(enlace.download).not.toContain('<');
      expect(enlace.download).not.toContain('>');
    });
  });

  describe('obtenerLongitudMinContrasenaPdf', () => {
    it('devuelve un número entero mayor o igual que 4', async () => {
      const { obtenerLongitudMinContrasenaPdf } = await import('./clientesPdfService');
      const valor = obtenerLongitudMinContrasenaPdf();
      expect(Number.isInteger(valor)).toBe(true);
      expect(valor).toBeGreaterThanOrEqual(4);
    });
  });

  describe('encriptarPdfConContrasena', () => {
    it('lanza error explícito si no se pasa blob de entrada', async () => {
      const { encriptarPdfConContrasena } = await import('./clientesPdfService');
      await expect(encriptarPdfConContrasena(null, 'abcd1234')).rejects.toThrow(/contenido PDF para encriptar/);
    });

    it('lanza error si la contraseña es demasiado corta', async () => {
      const { encriptarPdfConContrasena, obtenerLongitudMinContrasenaPdf } = await import('./clientesPdfService');
      const min = obtenerLongitudMinContrasenaPdf();
      const corta = 'x'.repeat(Math.max(0, min - 1));
      const blob = new Blob(['dummypdf'], { type: 'application/pdf' });
      await expect(encriptarPdfConContrasena(blob, corta)).rejects.toThrow(/contrase/);
    });

    it('devuelve un Blob application/pdf y llama a pdf-lib.save con encrypt', async () => {
      const { encriptarPdfConContrasena } = await import('./clientesPdfService');
      const blob = new Blob(['dummypdf'], { type: 'application/pdf' });
      const resultado = await encriptarPdfConContrasena(blob, 'MiClaveSegura123');
      expect(resultado).toBeInstanceOf(Blob);
      expect(resultado.type).toBe('application/pdf');
      expect(mockPdfLibLoad).toHaveBeenCalled();
      expect(mockPdfLibSave).toHaveBeenCalledWith(
        expect.objectContaining({
          encrypt: expect.objectContaining({
            password: 'MiClaveSegura123',
            permissions: expect.any(Object),
          }),
        })
      );
    });
  });

  describe('generarPdfClienteIndividual con contraseña', () => {
    it('marca protegidoConContrasena=true y encripta el blob cuando se pasa contraseña', async () => {
      const { generarPdfClienteIndividual } = await import('./clientesPdfService');
      const resultado = await generarPdfClienteIndividual({
        datosCompletos: {
          id: 'cli-pwd',
          cliente: { id: 'cli-pwd', nombre: 'Cliente Protegido S.L.' },
          equipos: [],
          ordenes: [],
          resumen: {},
        },
        opciones: { contrasena: 'PassW0rd!' },
      });
      expect(resultado.protegidoConContrasena).toBe(true);
      expect(mockPdfLibLoad).toHaveBeenCalled();
      expect(mockPdfLibSave).toHaveBeenCalledWith(
        expect.objectContaining({
          encrypt: expect.objectContaining({ password: 'PassW0rd!' }),
        })
      );
      expect(resultado.pdfBlob).toBeInstanceOf(Blob);
    });

    it('marca protegidoConContrasena=false cuando no se pasa contraseña', async () => {
      const { generarPdfClienteIndividual } = await import('./clientesPdfService');
      const resultado = await generarPdfClienteIndividual({
        datosCompletos: {
          id: 'cli-sin-pwd',
          cliente: { id: 'cli-sin-pwd', nombre: 'Cliente Sin Protección S.L.' },
          equipos: [],
          ordenes: [],
          resumen: {},
        },
      });
      expect(resultado.protegidoConContrasena).toBe(false);
      expect(mockPdfLibLoad).not.toHaveBeenCalled();
    });
  });

  describe('generarPdfClientesMasivo con contraseña', () => {
    it('aplica protegidoConContrasena=true al PDF combinado si hay contraseña', async () => {
      const { generarPdfClientesMasivo } = await import('./clientesPdfService');
      const lista = [
        {
          id: 'cli-m1',
          cliente: { id: 'cli-m1', nombre: 'Masivo Uno' },
          equipos: [],
          ordenes: [],
          resumen: {},
        },
      ];
      const resultado = await generarPdfClientesMasivo({
        listaDatosCompletos: lista,
        opciones: { contrasena: 'Masiva2026!' },
      });
      expect(resultado.protegidoConContrasena).toBe(true);
      expect(resultado.numeroClientesExito).toBe(1);
      expect(mockPdfLibLoad).toHaveBeenCalledTimes(1);
      expect(mockPdfLibSave).toHaveBeenCalledWith(
        expect.objectContaining({
          encrypt: expect.objectContaining({ password: 'Masiva2026!' }),
        })
      );
    });
  });
});
