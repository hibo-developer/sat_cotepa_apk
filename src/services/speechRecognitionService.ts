/**
 * speechRecognitionService.ts
 * Servicio de reconocimiento de voz para SAT COTEPA.
 * Soporta Web Speech API (Desktop/Electron) y Capacitor Speech Recognition (Android).
 */

import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { obtenerClienteSupabase } from './supabaseClient';
import { estaOnline } from './offlineSyncService';
import { subirArchivoSAT } from './storageSat';
import db from './offlineDb';

export interface SpeechRecognitionResult {
  transcript: string;
  isFinal: boolean;
  audioBlob?: Blob;
}

export interface AudioPendiente {
  id?: number;
  ot_id: string;
  blob_base64: string;
  timestamp: number;
  created_at?: Date;
}

const PENDING_AUDIO_TABLE = 'pending_audio';

const pendingAudioTable = db.table<AudioPendiente>(PENDING_AUDIO_TABLE);

let recognitionInstance: SpeechRecognition | null = null;
let mediaRecorderInstance: MediaRecorder | null = null;
let audioChunks: Blob[] = [];

/**
 * Verifica si el reconocimiento de voz está disponible.
 */
export async function estaDisponibleReconocimientoVoz(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { available } = await SpeechRecognition.available();
      return available;
    } catch {
      return false;
    }
  }

  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

/**
 * Solicita permisos de micrófono.
 * @returns true si los permisos fueron concedidos.
 */
export async function solicitarPermisosMicrofono(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { speechRecognition } = await SpeechRecognition.requestPermissions();
      return speechRecognition === 'granted';
    } catch {
      return false;
    }
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

/**
 * Inicia el reconocimiento de voz.
 * @param onResult Callback llamado con cada resultado parcial o final.
 * @param onComplete Callback llamado cuando termina el reconocimiento.
 * @param grabarAudio Si true, graba el audio además de transcribir.
 * @param otId ID de la orden de trabajo para guardar el audio.
 */
export async function iniciarReconocimientoVoz(
  onResult: (resultado: SpeechRecognitionResult) => void,
  onComplete?: () => void,
  grabarAudio: boolean = true,
  otId?: string,
): Promise<() => void> {
  const tienePermisos = await solicitarPermisosMicrofono();
  if (!tienePermisos) {
    throw new Error('PERMISO_MICROFONO_DENEGADO');
  }

  let mediaStream: MediaStream | null = null;

  // Iniciar grabación de audio si está habilitada
  if (grabarAudio) {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderInstance = new MediaRecorder(mediaStream, {
        mimeType: 'audio/webm;codecs=opus',
      });
      audioChunks = [];

      mediaRecorderInstance.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorderInstance.start();
    } catch {
      // Si falla la grabación, continuamos solo con transcripción
      mediaRecorderInstance = null;
    }
  }

  if (Capacitor.isNativePlatform()) {
    // Android con Capacitor
    try {
      await SpeechRecognition.start({
        language: 'es-ES',
        maxResults: 1,
        prompt: 'Habla ahora...',
        partialResults: true,
        popup: false,
      });

      SpeechRecognition.addListener('partialResults', (data) => {
        const transcript = (data.results || []).join(' ');
        onResult({
          transcript,
          isFinal: false,
        });
      });

      SpeechRecognition.addListener('results', async (data) => {
        const transcript = (data.results || []).join(' ');
        let audioBlob: Blob | undefined;

        if (grabarAudio && mediaRecorderInstance && audioChunks.length > 0) {
          mediaRecorderInstance.stop();
          audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          audioChunks = [];

          if (otId) {
            await guardarAudio(audioBlob, otId);
          }
        }

        onResult({
          transcript,
          isFinal: true,
          audioBlob,
        });

        onComplete?.();
      });
    } catch (error) {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }
      throw error;
    }

    return async () => {
      try {
        await SpeechRecognition.stop();
        if (mediaStream) {
          mediaStream.getTracks().forEach((track) => track.stop());
        }
      } catch {
        // Ignorar errores al detener
      }
    };
  }

  // Desktop/Electron con Web Speech API
  const SpeechRecognitionClass =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
    }
    throw new Error('RECONOCIMIENTO_NO_SOPORTADO');
  }

  recognitionInstance = new SpeechRecognitionClass();
  recognitionInstance.lang = 'es-ES';
  recognitionInstance.continuous = true;
  recognitionInstance.interimResults = true;
  recognitionInstance.maxAlternatives = 1;

  recognitionInstance.onresult = async (event: any) => {
    const results = event.results;
    const lastResult = results[results.length - 1];
    const transcript = lastResult[0]?.transcript || '';
    const isFinal = lastResult.isFinal;

    let audioBlob: Blob | undefined;

    if (isFinal && grabarAudio && mediaRecorderInstance && audioChunks.length > 0) {
      mediaRecorderInstance.stop();
      audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      audioChunks = [];

      if (otId && audioBlob) {
        await guardarAudio(audioBlob, otId);
      }

      // Reiniciar grabación para siguiente segmento
      if (mediaStream) {
        audioChunks = [];
        mediaRecorderInstance = new MediaRecorder(mediaStream, {
          mimeType: 'audio/webm;codecs=opus',
        });
        mediaRecorderInstance.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunks.push(e.data);
          }
        };
        mediaRecorderInstance.start();
      }
    }

    onResult({
      transcript,
      isFinal,
      audioBlob,
    });
  };

  recognitionInstance.onerror = (event: any) => {
    console.error('Error de reconocimiento de voz:', event.error);
    if (event.error === 'not-allowed') {
      onResult({
        transcript: '',
        isFinal: true,
      });
    }
  };

  recognitionInstance.onend = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
    }
    onComplete?.();
  };

  recognitionInstance.start();

  return () => {
    try {
      recognitionInstance?.stop();
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }
      if (mediaRecorderInstance && mediaRecorderInstance.state !== 'inactive') {
        mediaRecorderInstance.stop();
      }
    } catch {
      // Ignorar errores al detener
    }
  };
}

/**
 * Detiene el reconocimiento de voz activo.
 */
export async function detenerReconocimientoVoz(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await SpeechRecognition.stop();
    } catch {
      // Ignorar
    }
  } else if (recognitionInstance) {
    try {
      recognitionInstance.stop();
    } catch {
      // Ignorar
    }
  }

  if (mediaRecorderInstance && mediaRecorderInstance.state !== 'inactive') {
    mediaRecorderInstance.stop();
  }
}

/**
 * Guarda el audio en Supabase Storage o IndexedDB si está offline.
 */
async function guardarAudio(audioBlob: Blob, otId: string): Promise<void> {
  const timestamp = Date.now();
  const path = `${otId}/${timestamp}.webm`;

  if (!estaOnline()) {
    // Guardar en IndexedDB para subir después
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      await pendingAudioTable.add({
        ot_id: otId,
        blob_base64: base64,
        timestamp,
        created_at: new Date(),
      });
    };
    reader.readAsDataURL(audioBlob);
    return;
  }

  try {
    await subirArchivoSAT(audioBlob, {
      otNumero: otId,
      parteId: otId,
      tipo: 'audio-cliente',
      indice: 0,
    });
  } catch (error) {
    console.error('Error al subir audio:', error);
    // Guardar en IndexedDB como fallback
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      await pendingAudioTable.add({
        ot_id: otId,
        blob_base64: base64,
        timestamp,
        created_at: new Date(),
      });
    };
    reader.readAsDataURL(audioBlob);
  }
}

/**
 * Sincroniza los audios pendientes cuando hay conexión.
 */
export async function sincronizarAudiosPendientes(): Promise<number> {
  if (!estaOnline()) {
    return 0;
  }

  const pendientes = await pendingAudioTable.toArray();
  let subidos = 0;

  for (const audio of pendientes) {
    try {
      const base64Data = audio.blob_base64.split(',')[1];
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'audio/webm' });

      await subirArchivoSAT(blob, {
        otNumero: audio.ot_id,
        parteId: audio.ot_id,
        tipo: 'audio-cliente',
        indice: 0,
      });

      await pendingAudioTable.delete(audio.id!);
      subidos += 1;
    } catch (error) {
      console.error('Error al sincronizar audio pendiente:', error);
    }
  }

  return subidos;
}

/**
 * Obtiene el número de audios pendientes de sincronizar.
 */
export async function contarAudiosPendientes(): Promise<number> {
  return pendingAudioTable.count();
}
