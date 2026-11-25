export type EngineMode = 'legacy' | 'studio';

export type FeatureSupportLevel =
  | 'full'
  | 'bridged-camera'
  | 'legacy-overlay'
  | 'experimental'
  | 'partial'
  | 'none';

export interface EngineCompatibilityItem {
  id: string;
  feature: string;
  legacySupport: FeatureSupportLevel;
  studioSupport: FeatureSupportLevel;
  notes: string;
}

export const ENGINE_MODE_STORAGE_KEY = 'optica_studio_engine_mode_v1';

export function readPersistedEngineMode(): EngineMode {
  if (typeof window === 'undefined') return 'legacy';
  try {
    const raw = window.localStorage?.getItem(ENGINE_MODE_STORAGE_KEY);
    return raw === 'studio' ? 'studio' : 'legacy';
  } catch {
    return 'legacy';
  }
}

export function writePersistedEngineMode(mode: EngineMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(ENGINE_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignorar errores de almacenamiento restringido
  }
}

/**
 * Matriz honesta de compatibilidad entre Legacy Engine y Studio Engine (CP-P01-D).
 * Ninguna función se declara soportada en Studio Engine si depende exclusivamente del pipeline Legacy
 * o si requiere un checkpoint futuro (CP-P02, CP-P03, CP-P04, CP-P05).
 */
export const STUDIO_ENGINE_COMPATIBILITY_MATRIX: readonly EngineCompatibilityItem[] = [
  {
    id: 'primary-camera',
    feature: 'Cámara principal',
    legacySupport: 'full',
    studioSupport: 'full',
    notes: 'Propiedad única sin duplicar hardware; transferencia de pistas sin re-autorizar.',
  },
  {
    id: 'secondary-camera',
    feature: 'Cámara secundaria (Doble Cámara)',
    legacySupport: 'full',
    studioSupport: 'partial',
    notes: 'Operativa por completo en Legacy; en Studio Engine las fuentes multi-cámara dedicadas en UI llegarán en CP-P02.',
  },
  {
    id: 'cinema-filters',
    feature: 'Filtros cinematográficos WebGL2',
    legacySupport: 'full',
    studioSupport: 'bridged-camera',
    notes: 'Puente vía setProcessedLayerSurface() solo sobre capa de cámara (nunca altera ventanas de apps).',
  },
  {
    id: 'color-adjustments',
    feature: 'Ajustes de color y exposición',
    legacySupport: 'full',
    studioSupport: 'bridged-camera',
    notes: 'Puente sobre cámara; LUTs GPU independientes por capa llegarán en CP-P03.',
  },
  {
    id: 'mediapipe-segmentation',
    feature: 'Segmentación mediante MediaPipe',
    legacySupport: 'full',
    studioSupport: 'bridged-camera',
    notes: 'Reutiliza estado actual en cámara; extracción transparente sobre ventanas llegará en CP-P03.',
  },
  {
    id: 'background-blur-virtual',
    feature: 'Desenfoque de fondo y fondos virtuales',
    legacySupport: 'full',
    studioSupport: 'bridged-camera',
    notes: 'Aplicado únicamente sobre la fuente cámara antes de componer en ProgramCanvas.',
  },
  {
    id: 'face-tracking',
    feature: 'Seguimiento facial y autoenfoque IA',
    legacySupport: 'full',
    studioSupport: 'legacy-overlay',
    notes: 'Las cajas de seguimiento siguen renderizándose solo en el visor UI sin contaminar ProgramCanvas.',
  },
  {
    id: 'photo-booth',
    feature: 'Cabina fotográfica 4×',
    legacySupport: 'full',
    studioSupport: 'full',
    notes: 'Captura 4 tomas limpias desde la salida activa (ProgramCanvas en Studio Engine).',
  },
  {
    id: 'teleprompter',
    feature: 'Teleprompter privado',
    legacySupport: 'full',
    studioSupport: 'full',
    notes: 'Capa privada de interfaz excluida de ProgramCanvas y de la grabación.',
  },
  {
    id: 'qr-scanner',
    feature: 'Escáner QR y códigos',
    legacySupport: 'full',
    studioSupport: 'full',
    notes: 'Escanea desde la superficie de presentación vinculada al lienzo activo.',
  },
  {
    id: 'photo-capture',
    feature: 'Captura de fotografías (PNG)',
    legacySupport: 'full',
    studioSupport: 'full',
    notes: 'En Studio Engine captura directamente desde ProgramCanvas limpio.',
  },
  {
    id: 'video-recording',
    feature: 'Grabación de vídeo (MediaRecorder)',
    legacySupport: 'full',
    studioSupport: 'experimental',
    notes: 'En Studio Engine graba desde ProgramCanvas.captureStream(). Sigue limitada a RAM hasta CP-P05.',
  },
  {
    id: 'floating-pip',
    feature: 'Monitor flotante Picture-in-Picture',
    legacySupport: 'full',
    studioSupport: 'full',
    notes: 'Emite la salida limpia activa hacia la ventana PiP nativa.',
  },
  {
    id: 'gallery-export',
    feature: 'Galería IndexedDB y exportación',
    legacySupport: 'full',
    studioSupport: 'full',
    notes: 'Base optica_studio_db intacta e independiente de optica_studio_projects_db.',
  },
  {
    id: 'shortcuts-menus',
    feature: 'Atajos de teclado y menús Electron',
    legacySupport: 'full',
    studioSupport: 'full',
    notes: 'Mismos atajos (Espacio, R, M, F, G, L, H) y menús macOS.',
  },
  {
    id: 'scenes-transitions',
    feature: 'Escenas multipista y transiciones Cut/Fade',
    legacySupport: 'none',
    studioSupport: 'full',
    notes: 'Exclusivo de Studio Engine: ai-tutorial-pip, Cámara Principal y Solo Pantalla con protección de fuentes en Fade.',
  },
];
