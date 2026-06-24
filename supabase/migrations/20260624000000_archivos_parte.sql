-- Tabla para registrar archivos asociados a partes de trabajo
-- Cada archivo tiene path en Storage, tipo, y referencia a OT/parte

CREATE TABLE IF NOT EXISTS public.archivos_parte (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parte_id UUID NOT NULL,
  ot_numero TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('foto-evidencia', 'audio-cliente', 'firma-cliente', 'pdf-parte')),
  path TEXT NOT NULL,
  bucket TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_archivos_parte_parte_id ON public.archivos_parte(parte_id);
CREATE INDEX IF NOT EXISTS idx_archivos_parte_ot_numero ON public.archivos_parte(ot_numero);
CREATE INDEX IF NOT EXISTS idx_archivos_parte_tipo ON public.archivos_parte(tipo);

-- RLS: habilitar
ALTER TABLE public.archivos_parte ENABLE ROW LEVEL SECURITY;

-- Política: usuarios autenticados pueden leer archivos de sus partes asignados o todos si son admin
CREATE POLICY "Usuarios autenticados pueden leer archivos de partes"
  ON public.archivos_parte
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ordenes_trabajo ot
      WHERE ot.id = archivos_parte.parte_id
      AND (
        ot.tecnico_id = (
          SELECT t.id FROM public.tecnicos t WHERE t.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.usuarios_sat us WHERE us.user_id = auth.uid() AND us.rol = 'admin'
        )
      )
    )
  );

-- Política: usuarios autenticados pueden insertar archivos en sus partes
CREATE POLICY "Usuarios autenticados pueden insertar archivos en sus partes"
  ON public.archivos_parte
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ordenes_trabajo ot
      WHERE ot.id = archivos_parte.parte_id
      AND (
        ot.tecnico_id = (
          SELECT t.id FROM public.tecnicos t WHERE t.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.usuarios_sat us WHERE us.user_id = auth.uid() AND us.rol = 'admin'
        )
      )
    )
  );

-- Política: admins pueden eliminar archivos
CREATE POLICY "Admins pueden eliminar archivos"
  ON public.archivos_parte
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios_sat us WHERE us.user_id = auth.uid() AND us.rol = 'admin'
    )
  );

-- Comentario
COMMENT ON TABLE public.archivos_parte IS 'Registra archivos (fotos, audios, firmas, PDFs) asociados a partes de trabajo';
