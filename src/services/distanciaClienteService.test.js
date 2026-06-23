import { describe, expect, it } from 'vitest';
import {
  analizarConsistenciaKmCliente,
  calcularDistanciaFacturableMetros,
  calcularDistanciaMetros,
  normalizarKmDesplazamientoFacturable,
  resolverDestinoFacturable,
  UBICACION_COTEPA,
} from './distanciaClienteService';

describe('distanciaClienteService', () => {
  it('usa las coordenadas fijas del cliente como destino facturable aunque el GPS capturado varíe', () => {
    const cliente = {
      id: 'cliente-1',
      lat: 39.4699,
      lng: -0.3763,
    };
    const gpsCapturado = {
      latitud: 39.4708,
      longitud: -0.3815,
    };

    const referencia = resolverDestinoFacturable({
      cliente,
      ubicacionActual: gpsCapturado,
    });

    expect(referencia.fuente).toBe('cliente');
    expect(referencia.destino).toEqual({
      latitud: 39.4699,
      longitud: -0.3763,
    });
    expect(referencia.desviacionGpsMetros).toBeGreaterThan(0);
  });

  it('devuelve un cálculo determinista para el mismo trayecto', () => {
    const destino = { latitud: 39.4699, longitud: -0.3763 };

    const primera = calcularDistanciaFacturableMetros(UBICACION_COTEPA, destino);
    const segunda = calcularDistanciaFacturableMetros(UBICACION_COTEPA, destino);

    expect(primera).toBe(segunda);
    expect(primera).toBeGreaterThan(calcularDistanciaMetros(UBICACION_COTEPA, destino));
  });

  it('detecta variaciones superiores al 5% frente al histórico del cliente', () => {
    const analisis = analizarConsistenciaKmCliente({
      kmActual: 31.5,
      historicoKms: [24.9, 25.1, 25.0, 24.8],
      umbralPct: 5,
    });

    expect(analisis.alerta).toBe(true);
    expect(analisis.kmReferencia).toBe(24.95);
    expect(analisis.variacionPct).toBeGreaterThan(5);
  });

  it('normaliza kilómetros facturables como ida y vuelta con dos decimales', () => {
    expect(normalizarKmDesplazamientoFacturable(12456)).toBe(24.91);
  });
});
