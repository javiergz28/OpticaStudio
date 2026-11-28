import type {
  AspectRatioId,
  BackgroundReplaceMode,
  BackgroundSegmentationSettings,
  ColorAdjustments,
  FilterPresetId,
  FocusSettings,
  RecordingFormatPref,
  ResolutionPresetId,
  StabilizationSettings,
  VisualEffectId,
} from './camera';

/**
 * Versión actual del esquema persistente de Óptica Studio Pro.
 * Incrementar únicamente cuando se añada una ruta de migración no destructiva.
 */
export const CURRENT_STUDIO_SCHEMA_VERSION = 1 as const;
export type StudioSchemaVersion = typeof CURRENT_STUDIO_SCHEMA_VERSION;

/**
 * Límites y sistema de coordenadas normalizado para capas:
 * - Origen (0, 0): esquina superior izquierda del lienzo de Programa.
 * - Coordenadas normalizadas (x, y, width, height): rango [0, 1] relativo al ancho/alto del lienzo maestro.
 * - Punto de anclaje (anchorX, anchorY): rango [0, 1] relativo al cuadro de la propia capa
 *   (por defecto (0, 0) = esquina superior izquierda; (0.5, 0.5) = centro geométrico).
 * - Recorte (crop): fracción normalizada [0, 0.49] recortada desde cada borde de la fuente original.
 */
export const STUDIO_COORDINATE_SYSTEM = {
  minNormalizedCoord: -1,
  maxNormalizedCoord: 2,
  minLayerDimension: 0.04,
  maxLayerDimension: 2,
  maxCropPerSide: 0.49,
  minOpacity: 0,
  maxOpacity: 1,
} as const;

export type VisualSourceKind =
  | 'camera'
  | 'window'
  | 'screen'
  | 'image'
  | 'video-file'
  | 'color'
  | 'gradient'
  | 'text';

export type AudioOnlySourceKind = 'microphone' | 'system-audio' | 'audio-file';

export type StudioSourceKind = VisualSourceKind | AudioOnlySourceKind;

export type LayerFitMode = 'contain' | 'cover' | 'stretch';
export type LayerMaskShape =
  | 'rect'
  | 'square'
  | 'rounded'
  | 'squircle'
  | 'circle'
  | 'ellipse';
export type CameraAspectPreset =
  | 'sensor'
  | '16:9'
  | '4:3'
  | '9:16'
  | '3:4'
  | '1:1'
  | 'custom';
export type LayerBlendMode = 'normal' | 'screen' | 'multiply' | 'overlay';
export type SceneTransitionType = 'cut' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up';

export interface LayerCrop {
  top: number; // 0..0.49
  right: number; // 0..0.49
  bottom: number; // 0..0.49
  left: number; // 0..0.49
}

export interface LayerTransform {
  /** Posición horizontal normalizada (0..1 respecto al lienzo maestro). */
  x: number;
  /** Posición vertical normalizada (0..1 respecto al lienzo maestro). */
  y: number;
  /** Ancho normalizado (0.04..2 respecto al lienzo maestro). */
  width: number;
  /** Alto normalizado (0.04..2 respecto al lienzo maestro). */
  height: number;
  /** Punto de anclaje horizontal dentro de la capa (0 = izq, 0.5 = centro, 1 = der). */
  anchorX: number;
  /** Punto de anclaje vertical dentro de la capa (0 = arriba, 0.5 = centro, 1 = abajo). */
  anchorY: number;
  /** Rotación en grados (-360..360). */
  rotationDeg: number;
  flipH: boolean;
  flipV: boolean;
  fitMode: LayerFitMode;
  crop: LayerCrop;
  /** Proporción deseada del contenedor de capa (independiente del aspecto de ProgramCanvas). */
  aspectPreset?: CameraAspectPreset;
  /** Relación ancho/alto personalizada cuando aspectPreset === 'custom' (0.25..4). */
  customAspectRatio?: number;
  /** Acercamiento interno del encuadre dentro de la máscara sin deformar la imagen (1..4). */
  contentZoom?: number;
  /** Desplazamiento horizontal del encuadre interno (-1..1). */
  contentOffsetX?: number;
  /** Desplazamiento vertical del encuadre interno (-1..1). */
  contentOffsetY?: number;
}

export interface LayerStyle {
  /** Opacidad de la capa (0..1). */
  opacity: number;
  blendMode: LayerBlendMode;
  maskShape: LayerMaskShape;
  /** Radio de esquina en píxeles de referencia (sobre lienzo 1080p). */
  borderRadiusPx: number;
  /** Activación explícita de contorno/borde de máscara. */
  borderEnabled?: boolean;
  borderWidthPx: number;
  borderColor: string;
  shadowBlurPx: number;
  shadowOpacity: number;
  shadowColor: string;
  /** Difuminado suave alfa perimetral hacia el interior en píxeles de referencia 1080p (0..180). */
  featherPx?: number;
}

export interface LayerBackgroundSettings
  extends Omit<BackgroundSegmentationSettings, 'mode' | 'customImageUrl' | 'hasCalibratedBg'> {
  /** Incluye 'transparent' para componer presentador recortado sobre ventanas/apps. */
  mode: BackgroundReplaceMode | 'transparent';
  /** Referencia persistente opcional a asset/fuente de imagen, nunca Blob URL efímero. */
  customAssetRef: string | null;
}

/**
 * Procesamiento visual y óptico configurable por fuente (compartido)
 * o sobrescrito por instancia de capa dentro de una escena.
 */
export interface LayerProcessing {
  filterId: FilterPresetId;
  effectId: VisualEffectId;
  adjustments: ColorAdjustments;
  stabilization: StabilizationSettings;
  focus: FocusSettings;
  background: LayerBackgroundSettings;
}

export interface AudioSourceSettings {
  enabled: boolean;
  /** Ganancia de canal en porcentaje (0..200). */
  gainPercent: number;
  muted: boolean;
  solo: boolean;
  compressorEnabled: boolean;
  /** Compensación de sincronización labial en milisegundos (0..500). */
  syncDelayMs: number;
  /** Balance estéreo (-1 izquierda .. 0 centro .. +1 derecha). */
  pan: number;
  monitorEnabled: boolean;
}

export interface RecordingProfile {
  resolutionPreset: ResolutionPresetId;
  aspectRatio: AspectRatioId;
  fps: 30 | 60;
  videoBitsPerSecond: number;
  formatPref: RecordingFormatPref;
  separateAudioTracks: boolean;
}

export interface SceneTransition {
  type: SceneTransitionType;
  durationMs: number;
}

// ============================================================================
// 1. DEFINICIÓN PERSISTENTE DE FUENTES (SERIALIZABLE, SIN RECURSOS ACTIVOS)
// ============================================================================

interface StudioSourceBase {
  id: string;
  name: string;
  createdAt: number;
  /** Ajustes de procesamiento compartidos por defecto entre todas las escenas. */
  sharedProcessing?: Partial<LayerProcessing>;
  audio?: AudioSourceSettings;
}

export interface CameraSourceDefinition extends StudioSourceBase {
  kind: 'camera';
  deviceId: string;
  deviceLabelHint?: string;
  preferredWidth: number;
  preferredHeight: number;
  preferredFps: 30 | 60;
}

export interface WindowSourceDefinition extends StudioSourceBase {
  kind: 'window';
  sourceTitleHint?: string;
  includeSystemAudio: boolean;
}

export interface ScreenSourceDefinition extends StudioSourceBase {
  kind: 'screen';
  displayNameHint?: string;
  includeSystemAudio: boolean;
}

export interface ImageSourceDefinition extends StudioSourceBase {
  kind: 'image';
  /** Ruta estática, asset ID o referencia de galería (evita blobs/base64 masivos en JSON). */
  assetRef: string;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
}

export interface VideoFileSourceDefinition extends StudioSourceBase {
  kind: 'video-file';
  assetRef: string;
  loop: boolean;
  playbackRate: number;
  mutedByDefault: boolean;
}

export interface ColorSourceDefinition extends StudioSourceBase {
  kind: 'color';
  color: string;
}

export interface GradientSourceDefinition extends StudioSourceBase {
  kind: 'gradient';
  startColor: string;
  endColor: string;
  angleDeg: number;
}

export interface TextSourceDefinition extends StudioSourceBase {
  kind: 'text';
  text: string;
  subtitle?: string;
  fontFamily: 'sans' | 'mono';
  fontSizePx: number;
  textColor: string;
  accentColor: string;
  glassBackdrop: boolean;
  align: 'left' | 'center' | 'right';
}

export interface MicrophoneSourceDefinition extends StudioSourceBase {
  kind: 'microphone';
  deviceId: string;
  deviceLabelHint?: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
}

export interface SystemAudioSourceDefinition extends StudioSourceBase {
  kind: 'system-audio';
  targetHint?: string;
}

export interface AudioFileSourceDefinition extends StudioSourceBase {
  kind: 'audio-file';
  assetRef: string;
  loop: boolean;
}

export type StudioSource =
  | CameraSourceDefinition
  | WindowSourceDefinition
  | ScreenSourceDefinition
  | ImageSourceDefinition
  | VideoFileSourceDefinition
  | ColorSourceDefinition
  | GradientSourceDefinition
  | TextSourceDefinition
  | MicrophoneSourceDefinition
  | SystemAudioSourceDefinition
  | AudioFileSourceDefinition;

// ============================================================================
// 2. INSTANCIA DE FUENTE EN ESCENA (CAPA)
// ============================================================================

export interface SceneLayer {
  id: string;
  sourceId: string;
  name: string;
  /** Índice de composición ascendente (0 = fondo, mayor = más arriba). */
  zIndex: number;
  visible: boolean;
  locked: boolean;
  transform: LayerTransform;
  style: LayerStyle;
  /**
   * Si es true, la instancia combina/sobrescribe los ajustes de procesamiento
   * compartidos de la fuente mediante `processing`.
   */
  overrideSourceProcessing: boolean;
  processing?: Partial<LayerProcessing>;
}

export interface StudioScene {
  id: string;
  name: string;
  presetId?: StudioPresetId | 'custom';
  backgroundColor: string;
  transition: SceneTransition;
  layers: SceneLayer[];
  /** Fuentes solo de audio activas en esta escena (además del audio embebido de capas). */
  audioSourceIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface StudioProject {
  schemaVersion: StudioSchemaVersion;
  id: string;
  name: string;
  activeSceneId: string;
  /** Escena opcional en vista previa previa a transición (futuro Studio Mode). */
  previewSceneId: string | null;
  recordingProfile: RecordingProfile;
  sources: StudioSource[];
  scenes: StudioScene[];
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// 3. PLANTILLAS INICIALES
// ============================================================================

export type StudioPresetId =
  | 'camera-primary'
  | 'ai-tutorial-pip'
  | 'split-screen'
  | 'dual-app-comparison'
  | 'fullscreen-demo'
  | 'vertical-reel'
  | 'intro-outro';

export interface StudioPreset {
  id: StudioPresetId;
  name: string;
  description: string;
  category: 'camera' | 'tutorial' | 'comparison' | 'vertical' | 'production';
  recommendedAspectRatio: AspectRatioId;
  recommendedResolution: ResolutionPresetId;
  tags: string[];
}

// ============================================================================
// 4. ESTADO DE EJECUCIÓN Y RECURSOS ACTIVOS (NO SERIALIZABLE)
// ============================================================================

export type SourceExecutionStatus =
  | 'idle'
  | 'initializing'
  | 'live'
  | 'paused'
  | 'disconnected'
  | 'error';

export interface SourceRuntimeState {
  sourceId: string;
  status: SourceExecutionStatus;
  intrinsicWidth: number;
  intrinsicHeight: number;
  activeFps?: number;
  audioLevel?: number;
  errorMessage?: string;
  lastUpdatedAt: number;
}

/**
 * Contenedor exclusivo de memoria de ejecución para recursos multimedia vivos.
 * NUNCA debe serializarse dentro de StudioProject ni guardarse en almacenamiento persistente.
 */
export interface SourceRuntimeResources {
  sourceId: string;
  mediaStream?: MediaStream | null;
  videoElement?: HTMLVideoElement | null;
  imageElement?: HTMLImageElement | null;
  audioElement?: HTMLAudioElement | null;
  audioNode?: AudioNode | null;
  webglTexture?: WebGLTexture | null;
}

// ============================================================================
// 5. VALIDACIÓN Y RESULTADOS DE OPERACIONES
// ============================================================================

export interface ProjectValidationIssue {
  code:
    | 'empty-scenes'
    | 'invalid-active-scene'
    | 'duplicate-scene-id'
    | 'duplicate-source-id'
    | 'duplicate-layer-id'
    | 'orphan-layer-source'
    | 'orphan-audio-source'
    | 'invalid-transform'
    | 'runtime-resource-detected';
  message: string;
  sceneId?: string;
  layerId?: string;
  sourceId?: string;
}

export interface ProjectValidationResult {
  valid: boolean;
  issues: ProjectValidationIssue[];
}
