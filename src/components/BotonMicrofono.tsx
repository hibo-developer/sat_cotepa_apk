/**
 * BotonMicrofono.tsx
 * Botón de micrófono para dictado por voz.
 */

import { useState, useCallback } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { ToastEstado } from './ToastEstado';
import {
  iniciarReconocimientoVoz,
  detenerReconocimientoVoz,
  estaDisponibleReconocimientoVoz,
} from '../services/speechRecognitionService';

interface BotonMicrofonoProps {
  onTextoReconocido: (texto: string) => void;
  grabarAudio?: boolean;
  otId?: string;
  disabled?: boolean;
  className?: string;
}

export function BotonMicrofono({
  onTextoReconocido,
  grabarAudio = true,
  otId,
  disabled = false,
  className = '',
}: BotonMicrofonoProps) {
  const [escuchando, setEscuchando] = useState(false);
  const [disponible, setDisponible] = useState<boolean | null>(null);

  const handleClick = useCallback(async () => {
    if (escuchando) {
      await detenerReconocimientoVoz();
      setEscuchando(false);
      return;
    }

    try {
      const ok = await estaDisponibleReconocimientoVoz();
      setDisponible(ok);

      if (!ok) {
        ToastEstado('Reconocimiento de voz no disponible en este dispositivo', 'error');
        return;
      }

      setEscuchando(true);

      await iniciarReconocimientoVoz(
        (resultado) => {
          if (resultado.transcript) {
            onTextoReconocido(resultado.transcript);
          }
        },
        () => {
          setEscuchando(false);
        },
        grabarAudio,
        otId,
      );
    } catch (error: any) {
      setEscuchando(false);

      if (error.message === 'PERMISO_MICROFONO_DENEGADO') {
        ToastEstado('Activa permisos de micrófono', 'error');
      } else if (error.message === 'RECONOCIMIENTO_NO_SOPORTADO') {
        ToastEstado('Reconocimiento de voz no soportado', 'error');
      } else {
        ToastEstado('Error al iniciar reconocimiento de voz', 'error');
      }
    }
  }, [escuchando, grabarAudio, otId, onTextoReconocido]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-lg p-2 transition-all ${
        escuchando
          ? 'bg-red-500 text-white hover:bg-red-600'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      title={escuchando ? 'Detener dictado' : 'Iniciar dictado por voz'}
    >
      {escuchando ? (
        <>
          <MicOff className="h-5 w-5 animate-pulse" />
          <span className="ml-2 text-sm font-medium">Detener</span>
        </>
      ) : (
        <>
          <Mic className="h-5 w-5" />
          <span className="ml-2 text-sm font-medium">Dictar</span>
        </>
      )}
    </button>
  );
}
