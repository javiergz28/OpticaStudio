import {
  readPersistedEngineMode,
  writePersistedEngineMode,
  type EngineMode,
} from './engineCompatibility';
import {
  INITIAL_PROGRAM_PROFILE,
  ProgramCompositor,
  resolveOutputDimensions,
  type ActiveTransitionState,
  type CompositorBackendKind,
  type CompositorFrameStats,
  type CompositorTargetFps,
  type FrameSchedulerAdapter,
  type LayerDiagnosticItem,
  type ProcessedLayerSurface,
  type ProgramSurfaceLike,
} from './programCompositor';
import {
  addLayerToScene,
  addSource,
  clampLayerStyle,
  clampLayerTransform,
  createScene,
  duplicateLayerInScene,
  moveLayerOrder,
  removeLayerFromScene,
  removeSourceSafely,
  renameLayerInScene,
  reorderSceneLayers,
  resetLayerStyleInScene,
  resetLayerTransformInScene,
  setActiveScene,
  setLayerLocked,
  setLayerVisibility,
  updateLayerStyle,
  updateLayerTransform,
  updateMultipleLayerTransforms,
  updateSource,
  validateProjectReferences,
} from './sceneEngine';
import {
  clampVisualLayerTransformForScene,
  computeAdaptableSceneLayout,
  isVisualSourceEditable,
  type AdaptableSceneLayoutId,
} from './layerEditor';
import {
  CompositionHistory,
  type CompositionHistoryStatus,
} from './compositionHistory';
import { instantiatePresetProject } from './scenePresets';
import {
  SourceManager,
  type MediaDeviceDescriptor,
  type MediaStreamLike,
  type MediaStreamTrackLike,
  type PlatformMediaCapabilities,
  type SourceManagerOptions,
  type SourceRuntimeEntry,
} from './sourceManager';
import type { AspectRatioId, ResolutionPresetId } from '../types/camera';
import type {
  LayerStyle,
  LayerTransform,
  SceneLayer,
  SceneTransition,
  StudioPresetId,
  StudioProject,
  StudioScene,
  StudioSource,
} from '../types/studio';
import {
  deleteStudioAssetBlob,
  isStudioAssetRef,
  saveStudioAssetBlob,
} from '../utils/studioAssetStore';
import {
  createBrowserStudioStorageAdapter,
  createControlledProjectSaver,
  loadStudioProject,
  saveStudioProject,
  type ProjectLoadResult,
  type StudioStorageAdapter,
} from '../utils/studioStorage';

export const COORDINATOR_CONSUMER_ID = 'studio-program-compositor';

export type PreferredCompositorBackend = 'auto' | 'webgl2' | 'canvas2d';

export interface StudioDiagnosticsSnapshot {
  engineMode: EngineMode;
  backendKind: CompositorBackendKind | 'none';
  compositorState: 'running' | 'stopped' | 'context-lost' | 'disposed';
  activeSceneId: string | null;
  activeSceneName: string | null;
  registeredSourcesCount: number;
  connectedSourcesCount: number;
  disconnectedOrErrorSourcesCount: number;
  totalConsumersCount: number;
  activeTracksCount: number;
  targetFps: CompositorTargetFps;
  effectiveFps: number;
  outputWidth: number;
  outputHeight: number;
  lastRenderDurationMs: number;
  renderedFrames: number;
  activeTransition: ActiveTransitionState | null;
  recordingLocked: boolean;
  surfaceReplacementsCount: number;
  lastError: string | null;
  sources: Array<{
    id: string;
    name: string;
    kind: StudioSource['kind'];
    status: string;
    consumers: number;
    hasVideoTrack: boolean;
    hasAudioTrack: boolean;
    errorMessage?: string;
    disconnectionReason: string;
  }>;
  layerDiagnostics: LayerDiagnosticItem[];
}

export interface LegacyStreamHandoff {
  /** Stream exclusivo de vídeo (cámara) o stream combinado cámara+mic del pipeline Legacy. */
  cameraStream?: MediaStreamLike | null;
  /** Stream opcional exclusivo de micrófono si ya viene separado. */
  microphoneStream?: MediaStreamLike | null;
  /** Stream de ventana/pantalla ya autorizado en Legacy. */
  screenStream?: MediaStreamLike | null;
}

export interface ModeSwitchResult {
  ok: boolean;
  mode: EngineMode;
  reason?: string;
  handedBackCameraStream?: MediaStream | null;
  handedBackMicStream?: MediaStream | null;
  handedBackCameraTracks?: MediaStreamTrackLike[];
  handedBackMicTracks?: MediaStreamTrackLike[];
}

export type { CompositionHistoryStatus };

export type AddRealSourceRequest =
  | {
      kind: 'camera';
      name?: string;
      deviceId?: string;
      deviceLabelHint?: string;
      preferredWidth?: number;
      preferredHeight?: number;
      preferredFps?: 30 | 60;
    }
  | {
      kind: 'window';
      name?: string;
      sourceTitleHint?: string;
      placement?: 'behind-camera';
      includeSystemAudio?: boolean;
    }
  | {
      kind: 'screen';
      name?: string;
      displayNameHint?: string;
      placement?: 'behind-camera';
      includeSystemAudio?: boolean;
    }
  | {
      kind: 'image';
      name?: string;
      file?: Blob;
      assetRef?: string;
      intrinsicWidth?: number;
      intrinsicHeight?: number;
    }
  | {
      kind: 'video-file';
      name?: string;
      file?: Blob;
      assetRef?: string;
      loop?: boolean;
      playbackRate?: number;
      mutedByDefault?: boolean;
    }
  | {
      kind: 'text';
      name?: string;
      text: string;
      subtitle?: string;
      fontFamily?: 'sans' | 'mono';
      fontSizePx?: number;
      textColor?: string;
      accentColor?: string;
      glassBackdrop?: boolean;
      align?: 'left' | 'center' | 'right';
    }
  | {
      kind: 'color';
      name?: string;
      color: string;
    }
  | {
      kind: 'gradient';
      name?: string;
      startColor: string;
      endColor: string;
      angleDeg?: number;
    }
  | {
      kind: 'microphone';
      name?: string;
      deviceId?: string;
      deviceLabelHint?: string;
      echoCancellation?: boolean;
      noiseSuppression?: boolean;
    }
  | {
      kind: 'audio-file';
      name?: string;
      file?: Blob;
      assetRef?: string;
      loop?: boolean;
    }
  | {
      kind: 'system-audio';
      name?: string;
      targetHint?: string;
    };

export interface AddRealSourceResult {
  ok: boolean;
  source?: StudioSource;
  layer?: SceneLayer | null;
  entry?: SourceRuntimeEntry | null;
  canceled?: boolean;
  reason?: string;
  platformCapability?: PlatformMediaCapabilities;
}

export interface RemoveSourceResult {
  ok: boolean;
  removed: boolean;
  usageCount: number;
  reason?: string;
}

export interface StudioCoordinatorOptions {
  initialMode?: EngineMode;
  persistModePreference?: boolean;
  preferredBackend?: PreferredCompositorBackend;
  resolutionPreset?: ResolutionPresetId;
  aspectRatio?: AspectRatioId;
  fps?: CompositorTargetFps;
  storageAdapter?: StudioStorageAdapter;
  sourceManagerOptions?: SourceManagerOptions;
  surfaceFactory?: (width: number, height: number) => ProgramSurfaceLike;
  scheduler?: FrameSchedulerAdapter;
  now?: () => number;
  onStateChange?: () => void;
  onFrameRendered?: (stats: CompositorFrameStats, surface: ProgramSurfaceLike) => void;
  onRecordingSafetyStop?: (reason: string) => void;
}

function createDefaultCanvasSurface(width: number, height: number): ProgramSurfaceLike {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return { width, height };
}

/**
 * Construye el proyecto inicial de Óptica Studio Pro centrado en `ai-tutorial-pip`
 * (Fondo Liquid Glass + Ventana Demo + Presentador redondeado squircle) junto con
 * escenas compatibles (`Cámara Principal` y `Solo Pantalla`) compartiendo cámara y micrófono.
 * No abre hardware ni solicita permisos durante su creación.
 */
function withRecordingProfile(
  project: StudioProject,
  patch: Partial<StudioProject['recordingProfile']>
): StudioProject {
  return {
    ...project,
    updatedAt: Date.now(),
    recordingProfile: {
      ...project.recordingProfile,
      ...patch,
    },
  };
}

export function createStarterStudioProject(
  resolutionPreset: ResolutionPresetId = '1080p',
  aspectRatio: AspectRatioId = '16:9'
): StudioProject {
  let project = instantiatePresetProject('ai-tutorial-pip');
  project = withRecordingProfile(project, {
    resolutionPreset,
    aspectRatio,
    fps: 30,
  });

  const tutScene = project.scenes[0];
  const camSource = project.sources.find((s) => s.kind === 'camera');
  const micSource = project.sources.find((s) => s.kind === 'microphone');
  const winSource = project.sources.find((s) => s.kind === 'window');

  // Añadir fondo Liquid Glass oscuro detrás de la ventana en ai-tutorial-pip
  const bgAdded = addSource(project, {
    kind: 'gradient',
    name: 'Fondo Liquid Glass',
    startColor: '#090d18',
    endColor: '#101624',
    angleDeg: 140,
  });
  project = bgAdded.project;

  if (tutScene) {
    // Reordenar capas de Tutorial IA: Fondo (0) -> Ventana (1) -> Presentador Squircle (2)
    project = addLayerToScene(project, tutScene.id, bgAdded.source.id, {
      name: 'Fondo Liquid Glass',
      transform: { x: 0, y: 0, width: 1, height: 1, fitMode: 'stretch' },
      locked: true,
    }).project;

    const updatedTut = project.scenes.find((s) => s.id === tutScene.id)!;
    const bgLayer = updatedTut.layers[updatedTut.layers.length - 1];
    const otherLayers = updatedTut.layers.slice(0, -1);
    const reordered = [bgLayer, ...otherLayers].map((l, idx) => ({ ...l, zIndex: idx }));
    project = {
      ...project,
      scenes: project.scenes.map((s) =>
        s.id === tutScene.id
          ? {
              ...s,
              name: '1. Tutorial IA (PiP)',
              transition: { type: 'fade', durationMs: 280 },
              layers: reordered,
            }
          : s
      ),
    };
  }

  // Escena 2: Cámara Principal (comparte cámara + micrófono)
  if (camSource) {
    const camSceneRes = createScene(project, {
      name: '2. Cámara Principal',
      presetId: 'camera-primary',
      transition: { type: 'fade', durationMs: 260 },
    });
    project = camSceneRes.project;
    project = addLayerToScene(project, camSceneRes.scene.id, camSource.id, {
      name: 'Cámara Principal',
      transform: { x: 0, y: 0, width: 1, height: 1, fitMode: 'cover' },
    }).project;
    if (micSource) {
      project = {
        ...project,
        scenes: project.scenes.map((s) =>
          s.id === camSceneRes.scene.id ? { ...s, audioSourceIds: [micSource.id] } : s
        ),
      };
    }
  }

  // Escena 3: Solo Pantalla (comparte ventana/pantalla + micrófono)
  if (winSource) {
    const screenSceneRes = createScene(project, {
      name: '3. Solo Pantalla',
      presetId: 'fullscreen-demo',
      transition: { type: 'cut', durationMs: 0 },
    });
    project = screenSceneRes.project;
    project = addLayerToScene(project, screenSceneRes.scene.id, bgAdded.source.id, {
      name: 'Fondo Pantalla',
      transform: { x: 0, y: 0, width: 1, height: 1, fitMode: 'stretch' },
      locked: true,
    }).project;
    project = addLayerToScene(project, screenSceneRes.scene.id, winSource.id, {
      name: 'Ventana a Pantalla Completa',
      transform: { x: 0, y: 0, width: 1, height: 1, fitMode: 'contain' },
    }).project;
    if (micSource) {
      project = {
        ...project,
        scenes: project.scenes.map((s) =>
          s.id === screenSceneRes.scene.id ? { ...s, audioSourceIds: [micSource.id] } : s
        ),
      };
    }
  }

  return project;
}

function splitCameraAndMicStream(stream: MediaStreamLike): {
  videoOnlyStream: MediaStreamLike | null;
  audioOnlyStream: MediaStreamLike | null;
} {
  const vTracks = stream.getVideoTracks().filter((t) => t.readyState !== 'ended');
  const aTracks = stream.getAudioTracks().filter((t) => t.readyState !== 'ended');

  const wrapTracks = (tracks: MediaStreamTrackLike[], suffix: string): MediaStreamLike | null => {
    if (tracks.length === 0) return null;
    if (typeof MediaStream !== 'undefined') {
      return new MediaStream(tracks as unknown as MediaStreamTrack[]) as unknown as MediaStreamLike;
    }
    return {
      id: `${stream.id}_${suffix}`,
      active: true,
      getTracks: () => tracks,
      getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
      getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    };
  };

  return {
    videoOnlyStream: wrapTracks(vTracks, 'v'),
    audioOnlyStream: wrapTracks(aTracks, 'a'),
  };
}

/**
 * Coordinador central desacoplado de React que gobierna el ciclo de vida conjunto de:
 * - `StudioProject` y persistencia versionada (`studioStorage.ts`)
 * - `SourceManager` (propiedad única de pistas)
 * - `ProgramCompositor` y superficie persistente `ProgramCanvas`
 */
export class StudioCoordinator {
  readonly sourceManager: SourceManager;

  private readonly storageAdapter: StudioStorageAdapter;
  private readonly saver: ReturnType<typeof createControlledProjectSaver>;
  private readonly history = new CompositionHistory({ maxEntries: 40 });
  private readonly surfaceFactory: (width: number, height: number) => ProgramSurfaceLike;
  private readonly scheduler?: FrameSchedulerAdapter;
  private readonly now: () => number;
  private readonly persistModePreference: boolean;

  private readonly onStateChange?: () => void;
  private readonly onFrameRendered?: (stats: CompositorFrameStats, surface: ProgramSurfaceLike) => void;
  private readonly onRecordingSafetyStop?: (reason: string) => void;

  private programSurface: ProgramSurfaceLike;
  private compositor: ProgramCompositor | null = null;

  private project: StudioProject;
  private engineMode: EngineMode;
  private preferredBackend: PreferredCompositorBackend;
  private outputWidth: number;
  private outputHeight: number;
  private targetFps: CompositorTargetFps;

  private recordingLocked = false;
  private surfaceReplacementsCount = 0;
  private lastError: string | null = null;
  private mounted = false;
  private disposed = false;
  private epoch = 0;
  private sceneOpToken = 0;
  private lastLoadSource: ProjectLoadResult['source'] = 'default';

  private unsubscribeSources: (() => void) | null = null;

  constructor(options: StudioCoordinatorOptions = {}) {
    this.storageAdapter = options.storageAdapter ?? createBrowserStudioStorageAdapter();
    this.saver = createControlledProjectSaver(this.storageAdapter, 300);
    this.surfaceFactory = options.surfaceFactory ?? createDefaultCanvasSurface;
    this.scheduler = options.scheduler;
    this.now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.persistModePreference = options.persistModePreference ?? false;

    this.onStateChange = options.onStateChange;
    this.onFrameRendered = options.onFrameRendered;
    this.onRecordingSafetyStop = options.onRecordingSafetyStop;

    this.engineMode =
      options.initialMode ?? (this.persistModePreference ? readPersistedEngineMode() : 'legacy');
    this.preferredBackend = options.preferredBackend ?? 'auto';

    const dims =
      options.resolutionPreset && options.aspectRatio
        ? resolveOutputDimensions(options.resolutionPreset, options.aspectRatio)
        : { width: INITIAL_PROGRAM_PROFILE.width, height: INITIAL_PROGRAM_PROFILE.height };

    this.outputWidth = dims.width;
    this.outputHeight = dims.height;
    this.targetFps = options.fps ?? INITIAL_PROGRAM_PROFILE.fps;

    this.project = createStarterStudioProject(
      options.resolutionPreset ?? '1080p',
      options.aspectRatio ?? '16:9'
    );

    this.sourceManager = new SourceManager(options.sourceManagerOptions);
    this.programSurface = this.surfaceFactory(this.outputWidth, this.outputHeight);

    this.unsubscribeSources = this.sourceManager.subscribe((ev) => {
      if (this.disposed) return;
      if (ev.type === 'disconnected' || ev.type === 'state-changed' || ev.type === 'reconnected') {
        this.syncCompositorRuntime();
        this.onStateChange?.();
      }
    });
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  isMounted(): boolean {
    return this.mounted;
  }

  getEngineMode(): EngineMode {
    return this.engineMode;
  }

  isRecordingLocked(): boolean {
    return this.recordingLocked;
  }

  getPreferredBackend(): PreferredCompositorBackend {
    return this.preferredBackend;
  }

  getProgramSurface(): ProgramSurfaceLike {
    return this.programSurface;
  }

  getCompositor(): ProgramCompositor | null {
    return this.compositor;
  }

  getProject(): StudioProject {
    return this.project;
  }

  getActiveScene(): StudioScene | null {
    return (
      this.project.scenes.find((s) => s.id === this.project.activeSceneId) ??
      this.project.scenes[0] ??
      null
    );
  }

  getLastLoadSource(): ProjectLoadResult['source'] {
    return this.lastLoadSource;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getOutputDimensions(): { width: number; height: number } {
    return { width: this.outputWidth, height: this.outputHeight };
  }

  /**
   * Restaura el proyecto persistido en `optica_studio_projects_db` sin solicitar permisos de hardware
   * ni abrir ventanas automáticamente. Si el modo inicial ya es `'studio'`, inicializa compositor
   * y fuentes no interactivas de la escena activa.
   */
  async mount(handoff?: LegacyStreamHandoff): Promise<void> {
    if (this.disposed || this.mounted) return;
    const mountEpoch = ++this.epoch;

    const loaded = await loadStudioProject(undefined, this.storageAdapter);
    if (this.disposed || mountEpoch !== this.epoch) return;

    this.lastLoadSource = loaded.source;
    if (loaded.source === 'default') {
      const starter = createStarterStudioProject(
        this.project.recordingProfile.resolutionPreset,
        this.project.recordingProfile.aspectRatio
      );
      this.project = starter;
      await saveStudioProject(starter, this.storageAdapter);
      if (this.disposed || mountEpoch !== this.epoch) return;
    } else {
      const builtInNames: Record<string, string> = {
        'Ventana Demo IA': 'Ventana de aplicación',
        'Ventana Código / Demo': 'Ventana de código',
        'Ventana Principal Demo': 'Ventana principal',
        'Ventana Demo': 'Ventana compartida',
        'Demo Vertical': 'Pantalla vertical',
        'Demo Superior': 'Pantalla superior',
      };
      this.project = {
        ...loaded.project,
        sources: loaded.project.sources.map(source => ({ ...source, name: builtInNames[source.name] ?? source.name })),
        scenes: loaded.project.scenes.map(scene => ({ ...scene, layers: scene.layers.map(layer => ({ ...layer, name: builtInNames[layer.name] ?? layer.name })) })),
      };
      const dims = resolveOutputDimensions(
        loaded.project.recordingProfile.resolutionPreset,
        loaded.project.recordingProfile.aspectRatio
      );
      this.outputWidth = dims.width;
      this.outputHeight = dims.height;
      this.programSurface.width = dims.width;
      this.programSurface.height = dims.height;
    }

    this.mounted = true;
    this.sourceManager.syncProjectDefinitions(this.project);

    if (this.engineMode === 'studio') {
      await this.activateStudioMode(handoff);
    } else {
      this.onStateChange?.();
    }
  }

  // --------------------------------------------------------------------------
  // CONMUTACIÓN SEGURA ENTRE LEGACY ENGINE Y STUDIO ENGINE
  // --------------------------------------------------------------------------

  async activateStudioMode(handoff?: LegacyStreamHandoff): Promise<ModeSwitchResult> {
    if (this.disposed) {
      return { ok: false, mode: this.engineMode, reason: 'Coordinador liberado.' };
    }
    if (this.recordingLocked) {
      return {
        ok: false,
        mode: this.engineMode,
        reason: 'Bloqueado: no se puede cambiar de motor durante una grabación activa.',
      };
    }

    const opEpoch = ++this.epoch;
    this.engineMode = 'studio';
    if (this.persistModePreference) writePersistedEngineMode('studio');

    this.ensureCompositorInitialized(false);
    this.sourceManager.syncProjectDefinitions(this.project);

    // Adoptar pistas vivas procedentes del pipeline Legacy sin duplicar hardware
    if (handoff) {
      await this.adoptLegacyStreamsIntoActiveScene(handoff);
      if (this.disposed || opEpoch !== this.epoch) {
        return { ok: false, mode: this.engineMode, reason: 'Operación cancelada.' };
      }
    }

    // Adquirir únicamente fuentes seguras (no picker) de la escena activa
    const activeScene = this.getActiveScene();
    if (activeScene) {
      await this.acquireNonInteractiveSourcesForScene(activeScene, opEpoch);
    }

    if (this.disposed || opEpoch !== this.epoch) {
      return { ok: false, mode: this.engineMode, reason: 'Operación cancelada.' };
    }

    this.syncCompositorSceneAndRuntime();
    this.compositor?.start();
    this.compositor?.renderFrameNow();
    this.onStateChange?.();

    return { ok: true, mode: 'studio' };
  }

  deactivateStudioMode(): ModeSwitchResult {
    if (this.recordingLocked) {
      return {
        ok: false,
        mode: this.engineMode,
        reason: 'Bloqueado: no se puede cambiar de motor durante una grabación activa.',
      };
    }

    this.epoch += 1;
    this.compositor?.stop();

    // Devolver pistas vivas de cámara principal y micrófono sin cerrarlas para no pedir permisos de nuevo
    const camSrc = this.project.sources.find((s) => s.kind === 'camera');
    const micSrc = this.project.sources.find((s) => s.kind === 'microphone');

    const detachedCam = camSrc
      ? this.sourceManager.detachExternalMediaStreamOwnership(camSrc.id)
      : null;
    const detachedMic = micSrc
      ? this.sourceManager.detachExternalMediaStreamOwnership(micSrc.id)
      : null;

    // Liberar todas las demás fuentes exclusivas de Studio Engine
    this.sourceManager.releaseConsumer(COORDINATOR_CONSUMER_ID);
    this.compositor?.pruneUnusedResources();

    this.engineMode = 'legacy';
    if (this.persistModePreference) writePersistedEngineMode('legacy');
    this.onStateChange?.();

    return {
      ok: true,
      mode: 'legacy',
      handedBackCameraStream: detachedCam?.mediaStream ?? null,
      handedBackMicStream: detachedMic?.mediaStream ?? null,
      handedBackCameraTracks: detachedCam?.videoTracks ?? [],
      handedBackMicTracks: detachedMic?.audioTracks ?? [],
    };
  }

  setRecordingLocked(locked: boolean): void {
    this.recordingLocked = locked;
    this.onStateChange?.();
  }

  // --------------------------------------------------------------------------
  // GESTIÓN DE COMPOSITOR Y ESTRATEGIA WEBGL2 / CANVAS2D (SIN CONTEXTOS MIXTOS)
  // --------------------------------------------------------------------------

  private ensureCompositorInitialized(forceFreshSurface: boolean): ProgramCompositor {
    if (this.compositor && !forceFreshSurface) {
      return this.compositor;
    }

    if (this.compositor) {
      this.compositor.dispose();
      this.compositor = null;
    }

    if (forceFreshSurface) {
      // Regla de navegador: nunca pedir '2d' sobre un canvas ya bloqueado por 'webgl2'
      this.programSurface = this.surfaceFactory(this.outputWidth, this.outputHeight);
      this.surfaceReplacementsCount += 1;
    }

    const createComp = (backend: PreferredCompositorBackend) =>
      new ProgramCompositor({
        surface: this.programSurface,
        width: this.outputWidth,
        height: this.outputHeight,
        fps: this.targetFps,
        preferredBackend: backend,
        unavailableSourcePolicy: 'last-frame',
        scheduler: this.scheduler,
        now: this.now,
        onFrameRendered: (stats) => {
          this.onFrameRendered?.(stats, this.programSurface);
        },
        onTransitionComplete: () => {
          // Solo tras finalizar Fade se liberan fuentes exclusivas de la escena saliente
          this.reconcileSourceConsumersAfterTransition();
          this.onStateChange?.();
        },
        onContextLostChange: (lost) => {
          if (lost) {
            this.lastError = 'Se perdió el contexto gráfico WebGL2.';
            if (this.recordingLocked) {
              this.onRecordingSafetyStop?.(
                'Pérdida del contexto gráfico WebGL2 durante grabación; grabación finalizada de forma controlada.'
              );
            }
          } else {
            this.lastError = null;
          }
          this.onStateChange?.();
        },
      });

    let comp = createComp(this.preferredBackend);

    // Si se pidió WebGL2 explícitamente y cayó internamente a Canvas2D sobre una superficie
    // que ya pudo quedar bloqueada por getContext('webgl2'), reemplazamos limpiamente la superficie
    // si WebGL2 falló tras bloquear el canvas (en mock/real).
    if (
      this.preferredBackend === 'webgl2' &&
      comp.getBackendKind() !== 'webgl2'
    ) {
      comp.dispose();
      this.programSurface = this.surfaceFactory(this.outputWidth, this.outputHeight);
      this.surfaceReplacementsCount += 1;
      comp = createComp('canvas2d');
    }

    this.compositor = comp;
    this.syncCompositorSceneAndRuntime();
    return comp;
  }

  /**
   * Permite cambiar de backend (`auto` / `webgl2` / `canvas2d`) cuando no hay grabación activa.
   * Crea una nueva superficie limpia para evitar la incompatibilidad `webgl2` vs `2d` en el mismo canvas.
   */
  setBackendPreference(backend: PreferredCompositorBackend): { ok: boolean; reason?: string } {
    if (this.recordingLocked) {
      return {
        ok: false,
        reason: 'Bloqueado: no se puede reemplazar el backend gráfico durante una grabación activa.',
      };
    }

    this.preferredBackend = backend;
    if (this.engineMode === 'studio' || this.compositor) {
      const wasRunning = this.compositor?.isLoopRunning() ?? false;
      const comp = this.ensureCompositorInitialized(true);
      if (wasRunning || this.engineMode === 'studio') {
        comp.start();
        comp.renderFrameNow();
      }
    }
    this.onStateChange?.();
    return { ok: true };
  }

  /**
   * Recuperación explícita tras una pérdida de contexto no recuperable.
   * Nunca sustituye la superficie en silencio durante una grabación activa.
   */
  recoverLostContextWithCanvas2dFallback(): { ok: boolean; reason?: string } {
    if (this.recordingLocked) {
      this.onRecordingSafetyStop?.(
        'Pérdida de contexto gráfico no recuperable; grabación detenida antes de reemplazar la superficie.'
      );
      return {
        ok: false,
        reason: 'Grabación finalizada por pérdida de contexto antes de reconstruir la superficie.',
      };
    }

    this.preferredBackend = 'canvas2d';
    const comp = this.ensureCompositorInitialized(true);
    if (this.engineMode === 'studio') {
      comp.start();
      comp.renderFrameNow();
    }
    this.lastError = null;
    this.onStateChange?.();
    return { ok: true };
  }

  // --------------------------------------------------------------------------
  // RESOLUCIÓN, ESCENAS Y TRANSICIONES (CUT / FADE)
  // --------------------------------------------------------------------------

  setResolutionProfile(
    resolutionPreset: ResolutionPresetId,
    aspectRatio: AspectRatioId,
    fps?: CompositorTargetFps
  ): { ok: boolean; reason?: string } {
    const dims = resolveOutputDimensions(resolutionPreset, aspectRatio);
    const sizeChanged = dims.width !== this.outputWidth || dims.height !== this.outputHeight;

    if (this.recordingLocked && sizeChanged) {
      return {
        ok: false,
        reason: 'Bloqueado: no se permite redimensionar ProgramCanvas durante una grabación activa.',
      };
    }

    this.outputWidth = dims.width;
    this.outputHeight = dims.height;
    if (fps) this.targetFps = fps;

    this.project = withRecordingProfile(this.project, {
      resolutionPreset,
      aspectRatio,
      fps: this.targetFps === 60 ? 60 : 30,
    });
    this.saver.schedule(this.project);

    if (this.compositor) {
      this.compositor.setOutputResolution(this.outputWidth, this.outputHeight);
      if (fps) this.compositor.setTargetFps(fps);
      if (this.engineMode === 'studio') {
        this.compositor.renderFrameNow();
      }
    } else {
      this.programSurface.width = this.outputWidth;
      this.programSurface.height = this.outputHeight;
    }

    this.onStateChange?.();
    return { ok: true };
  }

  async switchScene(
    sceneId: string,
    transitionOverride?: Partial<Pick<SceneTransition, 'type' | 'durationMs'>>
  ): Promise<boolean> {
    const nextScene = this.project.scenes.find((s) => s.id === sceneId);
    if (!nextScene) return false;

    const opToken = ++this.sceneOpToken;
    this.project = setActiveScene(this.project, sceneId);
    this.saver.schedule(this.project);

    if (this.engineMode === 'studio' && this.compositor) {
      // 1. Iniciar transición en el compositor conservando saliente si es Fade
      this.compositor.transitionToScene(nextScene, transitionOverride);
      this.syncCompositorSceneAndRuntime();

      // 2. Adquirir fuentes seguras necesarias (cámara/mic compartidos se reutilizan sin reiniciar)
      await this.acquireNonInteractiveSourcesForScene(nextScene, this.epoch, opToken);
      if (this.disposed || opToken !== this.sceneOpToken) return false;

      this.syncCompositorRuntime();
      this.compositor.renderFrameNow();

      // Para Cut (sin transición activa), reconciliar de inmediato
      if (!this.compositor.getActiveTransition()) {
        this.reconcileSourceConsumersAfterTransition();
      }
    }

    this.onStateChange?.();
    return true;
  }

  /**
   * Activa una de las plantillas principales (`ai-tutorial-pip`, `camera-primary`, `fullscreen-demo`)
   * seleccionando su escena existente o creándola si no existe todavía en el proyecto.
   */
  async activatePresetScene(
    presetId: StudioPresetId,
    transitionOverride?: Partial<Pick<SceneTransition, 'type' | 'durationMs'>>
  ): Promise<StudioScene | null> {
    const existing = this.project.scenes.find((s) => s.presetId === presetId);
    if (existing) {
      await this.switchScene(existing.id, transitionOverride);
      return existing;
    }

    // Si no existía una escena para esa plantilla, instanciar sus capas reutilizando cámara/mic/ventana existentes
    const templateProj = instantiatePresetProject(presetId);
    const tplScene = templateProj.scenes[0];
    if (!tplScene) return null;

    let proj = this.project;
    const sourceMap = new Map<string, string>();
    for (const tplSrc of templateProj.sources) {
      const existingMatch = proj.sources.find((s) => s.kind === tplSrc.kind);
      if (
        existingMatch &&
        (tplSrc.kind === 'camera' ||
          tplSrc.kind === 'microphone' ||
          tplSrc.kind === 'window' ||
          tplSrc.kind === 'screen')
      ) {
        sourceMap.set(tplSrc.id, existingMatch.id);
      } else {
        const added = addSource(proj, tplSrc);
        proj = added.project;
        sourceMap.set(tplSrc.id, added.source.id);
      }
    }

    const created = createScene(proj, {
      name: tplScene.name,
      presetId,
      transition: tplScene.transition,
      backgroundColor: tplScene.backgroundColor,
    });
    proj = created.project;

    for (const layer of tplScene.layers) {
      const mappedSrcId = sourceMap.get(layer.sourceId);
      if (!mappedSrcId) continue;
      proj = addLayerToScene(proj, created.scene.id, mappedSrcId, {
        name: layer.name,
        visible: layer.visible,
        locked: layer.locked,
        transform: layer.transform,
        style: layer.style,
        overrideSourceProcessing: layer.overrideSourceProcessing,
        processing: layer.processing,
      }).project;
    }

    this.project = proj;
    this.sourceManager.syncProjectDefinitions(this.project);
    await this.switchScene(created.scene.id, transitionOverride);
    return this.getActiveScene();
  }

  /**
   * Solicita autorización explícita del usuario para capturar una ventana o pantalla
   * y vincularla a la fuente `window`/`screen` correspondiente. Nunca se llama automáticamente al iniciar.
   */
  async authorizeDisplaySource(preferredSourceId?: string): Promise<SourceRuntimeEntry | null> {
    if (this.disposed) return null;

    const activeScene = this.getActiveScene();
    let targetSource: StudioSource | undefined = preferredSourceId
      ? this.project.sources.find((s) => s.id === preferredSourceId)
      : undefined;

    if (!targetSource && activeScene) {
      targetSource = activeScene.layers
        .map((l) => this.project.sources.find((s) => s.id === l.sourceId))
        .find((s) => s && (s.kind === 'window' || s.kind === 'screen'));
    }

    if (!targetSource) {
      targetSource = this.project.sources.find(
        (s) => s.kind === 'window' || s.kind === 'screen'
      );
    }

    if (!targetSource) return null;

    // An explicitly authorized capture must belong to a visible program scene.
    // Keep the current scene when possible; only switch after permission succeeds.
    const includesDisplay = (scene: StudioScene) => scene.layers.some(
      (layer) => layer.visible && layer.sourceId === targetSource!.id
    );
    const targetScene = activeScene && includesDisplay(activeScene)
      ? activeScene
      : this.project.scenes.find(includesDisplay);
    if (!targetScene) return null;
    const requestEpoch = this.epoch;
    const existing = this.sourceManager.getEntry(targetSource.id);
    const entry =
      existing && (existing.state.status === 'live' || existing.state.status === 'paused')
        ? await this.sourceManager.reconnectSource(targetSource.id, { force: true })
        : await this.sourceManager.acquireSource(
            targetSource,
            { id: COORDINATOR_CONSUMER_ID, kind: 'program-compositor' },
            { retryOnError: true }
          );

    if (!this.disposed && requestEpoch === this.epoch && entry?.state.status === 'live') {
      const current = this.getActiveScene();
      if (!current || !includesDisplay(current)) {
        await this.switchScene(targetScene.id, { type: 'cut', durationMs: 0 });
      }
    }
    this.syncCompositorRuntime();
    this.compositor?.renderFrameNow();
    this.onStateChange?.();
    return entry;
  }

  async reconnectSource(sourceId: string, force = false): Promise<SourceRuntimeEntry | null> {
    const entry = await this.sourceManager.reconnectSource(sourceId, { force });
    this.syncCompositorRuntime();
    this.compositor?.renderFrameNow();
    this.onStateChange?.();
    return entry;
  }

  setProcessedCameraSurface(frame: ProcessedLayerSurface | null): void {
    if (!this.compositor) return;
    const camSrc = this.project.sources.find((s) => s.kind === 'camera');
    if (!camSrc) return;
    this.compositor.setProcessedLayerSurface(camSrc.id, frame);
  }

  getHistoryStatus(): CompositionHistoryStatus {
    return this.history.getStatus();
  }

  beginCompositionGesture(label: string): void {
    this.history.beginGesture(this.project, label);
  }

  commitCompositionGesture(label?: string): boolean {
    const committed = this.history.commitGesture(this.project, label);
    if (committed) {
      this.onStateChange?.();
    }
    return committed;
  }

  cancelCompositionGesture(): void {
    this.history.cancelGesture();
  }

  async undoComposition(): Promise<{ ok: boolean; label?: string; reason?: string }> {
    if (this.disposed) {
      return { ok: false, reason: 'Coordinador liberado.' };
    }
    const undone = this.history.undo();
    if (!undone) {
      return { ok: false, reason: 'No hay acciones para deshacer.' };
    }
    await this.applyCompositionSnapshot(undone.snapshot);
    return { ok: true, label: undone.label };
  }

  async redoComposition(): Promise<{ ok: boolean; label?: string; reason?: string }> {
    if (this.disposed) {
      return { ok: false, reason: 'Coordinador liberado.' };
    }
    const redone = this.history.redo();
    if (!redone) {
      return { ok: false, reason: 'No hay acciones para rehacer.' };
    }
    await this.applyCompositionSnapshot(redone.snapshot);
    return { ok: true, label: redone.label };
  }

  private async applyCompositionSnapshot(snapshot: {
    scenes: StudioScene[];
    activeSceneId: string;
  }): Promise<void> {
    const validSourceIds = new Set(this.project.sources.map((s) => s.id));
    const sanitizedScenes = snapshot.scenes.map((scene) => ({
      ...scene,
      layers: scene.layers.filter((l) => validSourceIds.has(l.sourceId)),
      audioSourceIds: scene.audioSourceIds.filter((id) => validSourceIds.has(id)),
    }));
    const resolvedActiveId = sanitizedScenes.some((s) => s.id === snapshot.activeSceneId)
      ? snapshot.activeSceneId
      : sanitizedScenes[0]?.id ?? this.project.activeSceneId;

    const candidateProject: StudioProject = {
      ...this.project,
      scenes: sanitizedScenes,
      activeSceneId: resolvedActiveId,
      updatedAt: Date.now(),
    };
    const validation = validateProjectReferences(candidateProject);
    if (!validation.valid) {
      return;
    }

    this.project = candidateProject;
    this.saver.schedule(this.project);

    const activeScene = this.getActiveScene();
    if (this.engineMode === 'studio' && activeScene) {
      const byId = new Map(this.project.sources.map((s) => [s.id, s]));
      const consumer = { id: COORDINATOR_CONSUMER_ID, kind: 'program-compositor' as const };
      for (const layer of activeScene.layers) {
        if (!layer.visible) continue;
        const src = byId.get(layer.sourceId);
        if (!src) continue;
        const entry = this.sourceManager.getEntry(src.id);
        if (entry?.state.status === 'paused') {
          this.sourceManager.resumeSource(src.id);
        } else if (
          src.kind === 'color' ||
          src.kind === 'gradient' ||
          src.kind === 'text' ||
          src.kind === 'image' ||
          src.kind === 'video-file'
        ) {
          // Nunca dispara getUserMedia ni getDisplayMedia durante deshacer/rehacer
          await this.sourceManager.acquireSource(src, consumer);
        } else if (entry && entry.state.status === 'live') {
          await this.sourceManager.acquireSource(src, consumer);
        }
      }
    }

    if (this.compositor) {
      this.syncCompositorSceneAndRuntime();
      this.reconcileSourceConsumersAfterTransition();
      this.compositor.renderFrameNow();
    }
    this.onStateChange?.();
  }

  async enumerateAvailableDevices(): Promise<MediaDeviceDescriptor[]> {
    return this.sourceManager.queryAvailableDevices();
  }

  /**
   * Actualiza la transformación de una capa en una escena sin reiniciar pistas ni modificar ProgramCanvas.
   * Respeta el bloqueo (`locked`) y los límites del lienzo [0, 1] con relación de aspecto proporcional.
   */
  updateSceneLayerTransform(
    sceneId: string,
    layerId: string,
    transformPatch: Partial<LayerTransform>,
    options?: { preserveAspectK?: number; historyGroupKey?: string; historyLabel?: string }
  ): { ok: boolean; reason?: string; layer?: SceneLayer; constraintApplied?: boolean } {
    const scene = this.project.scenes.find((s) => s.id === sceneId);
    const layer = scene?.layers.find((l) => l.id === layerId);
    if (!scene || !layer) {
      return { ok: false, reason: 'Capa o escena no encontrada.' };
    }
    if (layer.locked) {
      return { ok: false, reason: 'La capa está bloqueada.' };
    }

    const merged = clampLayerTransform(transformPatch, layer.transform);
    const source = this.project.sources.find((s) => s.id === layer.sourceId);

    if (source && !isVisualSourceEditable(source)) {
      return { ok: false, reason: 'Las fuentes de solo audio no admiten transformación visual.' };
    }

    let nextTransform = merged;
    let constraintApplied = false;

    if (!source || isVisualSourceEditable(source)) {
      const clamped = clampVisualLayerTransformForScene(merged, {
        scene,
        layer,
        sources: this.project.sources,
        preserveAspectK: options?.preserveAspectK,
      });
      nextTransform = clamped.transform;
      constraintApplied = clamped.constraintApplied;
    }

    const prevProject = this.project;
    const nextProject = updateLayerTransform(this.project, sceneId, layerId, nextTransform);
    if (nextProject === this.project) {
      return { ok: false, reason: 'No se pudo aplicar la transformación.' };
    }

    this.project = nextProject;
    this.history.recordChange(prevProject, this.project, {
      label: options?.historyLabel ?? 'Transformar capa',
      groupKey: options?.historyGroupKey,
    });
    this.saver.schedule(this.project);

    const updatedScene = this.project.scenes.find((s) => s.id === sceneId);
    const updatedLayer = updatedScene?.layers.find((l) => l.id === layerId);

    if (this.engineMode === 'studio' && this.compositor) {
      const activeScene = this.getActiveScene();
      if (activeScene && activeScene.id === sceneId) {
        this.compositor.setSceneData(activeScene, this.project.sources);
        this.compositor.renderFrameNow();
      }
    }

    this.onStateChange?.();
    return {
      ok: true,
      layer: updatedLayer,
      constraintApplied,
    };
  }

  /**
   * Actualiza en vivo el estilo de una capa (forma, radio, borde, sombra, opacidad, difuminado alfa)
   * sin reiniciar ninguna pista ni recrear la superficie de salida.
   */
  updateSceneLayerStyle(
    sceneId: string,
    layerId: string,
    stylePatch: Partial<LayerStyle>,
    options?: { historyGroupKey?: string; historyLabel?: string }
  ): { ok: boolean; reason?: string; layer?: SceneLayer } {
    const scene = this.project.scenes.find((s) => s.id === sceneId);
    const layer = scene?.layers.find((l) => l.id === layerId);
    if (!scene || !layer) {
      return { ok: false, reason: 'Capa o escena no encontrada.' };
    }
    if (layer.locked) {
      return { ok: false, reason: 'La capa está bloqueada.' };
    }

    const prevProject = this.project;
    const mergedStyle = clampLayerStyle(stylePatch, layer.style);
    const nextProject = updateLayerStyle(this.project, sceneId, layerId, mergedStyle);
    if (nextProject === this.project) {
      return { ok: false, reason: 'No se pudo aplicar el estilo.' };
    }

    this.project = nextProject;
    this.history.recordChange(prevProject, this.project, {
      label: options?.historyLabel ?? 'Editar estilo de capa',
      groupKey: options?.historyGroupKey,
    });
    this.saver.schedule(this.project);

    const updatedScene = this.project.scenes.find((s) => s.id === sceneId);
    const updatedLayer = updatedScene?.layers.find((l) => l.id === layerId);

    if (this.engineMode === 'studio' && this.compositor) {
      const activeScene = this.getActiveScene();
      if (activeScene && activeScene.id === sceneId) {
        this.compositor.setSceneData(activeScene, this.project.sources);
        this.compositor.renderFrameNow();
      }
    }

    this.onStateChange?.();
    return {
      ok: true,
      layer: updatedLayer,
    };
  }

  /**
   * Aplica un preset de composición adaptable únicamente ante una acción explícita del usuario.
   * Nunca sobrescribe en segundo plano ajustes manuales previos.
   */
  applyAdaptableLayout(
    sceneId: string,
    layoutId: AdaptableSceneLayoutId,
    options?: {
      sensorWidth?: number;
      sensorHeight?: number;
      selectedLayerId?: string;
      participatingLayerIds?: string[];
      primaryDisplayLayerId?: string;
      secondaryDisplayLayerId?: string;
      primaryCameraLayerId?: string;
      intrinsicWidth?: number;
      intrinsicHeight?: number;
    }
  ): { ok: boolean; reason?: string; scene?: StudioScene } {
    const scene = this.project.scenes.find((s) => s.id === sceneId);
    if (!scene) {
      return { ok: false, reason: 'Escena no encontrada.' };
    }

    if (layoutId === 'freeform') {
      return { ok: true, scene };
    }

    const selectedLayer = options?.selectedLayerId
      ? scene.layers.find((l) => l.id === options.selectedLayerId)
      : undefined;
    const selectedRuntime = selectedLayer
      ? this.sourceManager.getEntry(selectedLayer.sourceId)
      : undefined;

    const dims = this.getOutputDimensions();
    const patches = computeAdaptableSceneLayout(scene, this.project.sources, layoutId, {
      outputWidth: dims.width,
      outputHeight: dims.height,
      sensorWidth: options?.sensorWidth,
      sensorHeight: options?.sensorHeight,
      selectedLayerId: options?.selectedLayerId,
      participatingLayerIds: options?.participatingLayerIds,
      primaryDisplayLayerId: options?.primaryDisplayLayerId,
      secondaryDisplayLayerId: options?.secondaryDisplayLayerId,
      primaryCameraLayerId: options?.primaryCameraLayerId,
      intrinsicWidth:
        options?.intrinsicWidth ??
        (selectedRuntime?.state.intrinsicWidth || undefined),
      intrinsicHeight:
        options?.intrinsicHeight ??
        (selectedRuntime?.state.intrinsicHeight || undefined),
    });

    if (patches.size === 0) {
      return { ok: false, reason: 'Sin cambios aplicables o capa bloqueada.' };
    }

    const prevProject = this.project;
    let nextProject = updateMultipleLayerTransforms(this.project, sceneId, patches);

    const updatedTargetScene = nextProject.scenes.find((s) => s.id === sceneId);
    if (updatedTargetScene) {
      const asc = [...updatedTargetScene.layers].sort((a, b) => a.zIndex - b.zIndex);
      const sourceById = new Map(this.project.sources.map((s) => [s.id, s]));
      const patchedIds = Array.from(patches.keys());
      const camLayer =
        (options?.primaryCameraLayerId
          ? asc.find((l) => l.id === options.primaryCameraLayerId && patches.has(l.id))
          : undefined) ??
        asc.find((l) => patches.has(l.id) && sourceById.get(l.sourceId)?.kind === 'camera');
      const primaryDisplay =
        (options?.primaryDisplayLayerId
          ? asc.find((l) => l.id === options.primaryDisplayLayerId && patches.has(l.id))
          : undefined) ??
        asc.find((l) => {
          const k = sourceById.get(l.sourceId)?.kind;
          return patches.has(l.id) && (k === 'window' || k === 'screen');
        }) ??
        asc.find((l) => patches.has(l.id) && l.id !== camLayer?.id);
      const secondaryDisplay =
        (options?.secondaryDisplayLayerId
          ? asc.find((l) => l.id === options.secondaryDisplayLayerId && patches.has(l.id))
          : undefined) ??
        asc.find((l) => {
          const k = sourceById.get(l.sourceId)?.kind;
          return (
            patches.has(l.id) &&
            l.id !== primaryDisplay?.id &&
            l.id !== camLayer?.id &&
            (k === 'window' || k === 'screen' || patchedIds.length > 2)
          );
        });

      let orderChanged = false;
      const moveAbove = (lowerId: string | undefined, upperId: string | undefined) => {
        if (!lowerId || !upperId || lowerId === upperId) return;
        const lowerIdx = asc.findIndex((l) => l.id === lowerId);
        const upperIdx = asc.findIndex((l) => l.id === upperId);
        if (lowerIdx < 0 || upperIdx < 0 || asc[lowerIdx].locked || asc[upperIdx].locked) return;
        if (upperIdx < lowerIdx) {
          const [upperLayer] = asc.splice(upperIdx, 1);
          const nextLowerIdx = asc.findIndex((l) => l.id === lowerId);
          asc.splice(nextLowerIdx + 1, 0, upperLayer);
          orderChanged = true;
        }
      };

      if (
        layoutId === 'pip-overlay' ||
        layoutId === 'screen-main-cam-pip' ||
        layoutId === 'screen-main-transparent-presenter'
      ) {
        moveAbove(primaryDisplay?.id, camLayer?.id);
      } else if (layoutId === 'cam-main-window-pip') {
        moveAbove(camLayer?.id, primaryDisplay?.id);
      } else if (layoutId === 'screen-main-window-pip') {
        moveAbove(primaryDisplay?.id, secondaryDisplay?.id);
        if (camLayer && secondaryDisplay) {
          moveAbove(secondaryDisplay.id, camLayer.id);
        } else if (camLayer && primaryDisplay) {
          moveAbove(primaryDisplay.id, camLayer.id);
        }
      }

      if (orderChanged) {
        nextProject = reorderSceneLayers(
          nextProject,
          sceneId,
          asc.map((l) => l.id)
        );
      }
    }

    if (nextProject === this.project) {
      return { ok: false, reason: 'No se modificó la escena (capas bloqueadas).' };
    }

    this.project = nextProject;
    this.history.recordChange(prevProject, this.project, {
      label: 'Aplicar composición',
    });
    this.saver.schedule(this.project);

    const updatedScene = this.project.scenes.find((s) => s.id === sceneId);
    if (this.engineMode === 'studio' && this.compositor) {
      const activeScene = this.getActiveScene();
      if (activeScene && activeScene.id === sceneId) {
        this.compositor.setSceneData(activeScene, this.project.sources);
        this.compositor.renderFrameNow();
      }
    }

    this.onStateChange?.();
    return {
      ok: true,
      scene: updatedScene,
    };
  }

  /**
   * Bloquea o desbloquea una capa en la escena indicada y persiste el cambio en studioStorage.
   */
  setSceneLayerLocked(sceneId: string, layerId: string, locked: boolean): boolean {
    const prevProject = this.project;
    const nextProject = setLayerLocked(this.project, sceneId, layerId, locked);
    if (nextProject === this.project) return false;

    this.project = nextProject;
    this.history.recordChange(prevProject, this.project, {
      label: locked ? 'Bloquear capa' : 'Desbloquear capa',
    });
    this.saver.schedule(this.project);

    if (this.engineMode === 'studio' && this.compositor) {
      const activeScene = this.getActiveScene();
      if (activeScene && activeScene.id === sceneId) {
        this.compositor.setSceneData(activeScene, this.project.sources);
      }
    }

    this.onStateChange?.();
    return true;
  }

  reorderSceneLayers(
    sceneId: string,
    orderedLayerIds: string[]
  ): { ok: boolean; scene?: StudioScene; reason?: string } {
    const prevProject = this.project;
    const nextProject = reorderSceneLayers(this.project, sceneId, orderedLayerIds);
    if (nextProject === this.project) {
      return { ok: false, reason: 'No se pudo reordenar las capas.' };
    }

    this.project = nextProject;
    this.history.recordChange(prevProject, this.project, { label: 'Reordenar capas' });
    this.saver.schedule(this.project);

    const updatedScene = this.project.scenes.find((s) => s.id === sceneId);
    if (this.engineMode === 'studio' && this.compositor) {
      const activeScene = this.getActiveScene();
      if (activeScene && activeScene.id === sceneId) {
        this.compositor.setSceneData(activeScene, this.project.sources);
        this.compositor.renderFrameNow();
      }
    }

    this.onStateChange?.();
    return { ok: true, scene: updatedScene };
  }

  moveSceneLayerOrder(
    sceneId: string,
    layerId: string,
    direction: 'up' | 'down' | 'top' | 'bottom'
  ): { ok: boolean; scene?: StudioScene; reason?: string } {
    const prevProject = this.project;
    const nextProject = moveLayerOrder(this.project, sceneId, layerId, direction);
    if (nextProject === this.project) {
      return { ok: false, reason: 'La capa ya se encuentra en esa posición.' };
    }

    this.project = nextProject;
    this.history.recordChange(prevProject, this.project, { label: 'Reordenar capa' });
    this.saver.schedule(this.project);

    const updatedScene = this.project.scenes.find((s) => s.id === sceneId);
    if (this.engineMode === 'studio' && this.compositor) {
      const activeScene = this.getActiveScene();
      if (activeScene && activeScene.id === sceneId) {
        this.compositor.setSceneData(activeScene, this.project.sources);
        this.compositor.renderFrameNow();
      }
    }

    this.onStateChange?.();
    return { ok: true, scene: updatedScene };
  }

  /**
   * Coloca una capa visual inmediatamente detrás de la cámara visible inferior en la escena
   * (o al fondo si no hay cámara visible). Registra historial reversible sin reiniciar pistas.
   */
  placeSceneLayerBehindCamera(
    sceneId: string,
    layerId: string
  ): { ok: boolean; scene?: StudioScene; reason?: string } {
    const scene = this.project.scenes.find((s) => s.id === sceneId);
    const target = scene?.layers.find((l) => l.id === layerId);
    if (!scene || !target) {
      return { ok: false, reason: 'Capa o escena no encontrada.' };
    }

    const asc = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);
    const filtered = asc.filter((l) => l.id !== layerId);
    const firstVisibleCamIdx = filtered.findIndex(
      (l) =>
        l.visible &&
        this.project.sources.some((s) => s.id === l.sourceId && s.kind === 'camera')
    );

    if (firstVisibleCamIdx >= 0) {
      filtered.splice(firstVisibleCamIdx, 0, target);
    } else {
      filtered.unshift(target);
    }

    const prevIds = asc.map((l) => l.id);
    const nextIds = filtered.map((l) => l.id);
    if (prevIds.every((id, idx) => id === nextIds[idx])) {
      return { ok: true, scene };
    }

    return this.reorderSceneLayers(sceneId, nextIds);
  }

  async setSceneLayerVisible(
    sceneId: string,
    layerId: string,
    visible: boolean
  ): Promise<{ ok: boolean; layer?: SceneLayer; reason?: string }> {
    const prevProject = this.project;
    const nextProject = setLayerVisibility(this.project, sceneId, layerId, visible);
    if (nextProject === this.project) {
      return { ok: false, reason: 'No cambió la visibilidad de la capa.' };
    }

    this.project = nextProject;
    this.history.recordChange(prevProject, this.project, {
      label: visible ? 'Mostrar capa' : 'Ocultar capa',
    });
    this.saver.schedule(this.project);

    const updatedScene = this.project.scenes.find((s) => s.id === sceneId);
    const updatedLayer = updatedScene?.layers.find((l) => l.id === layerId);
    const source = updatedLayer
      ? this.project.sources.find((s) => s.id === updatedLayer.sourceId)
      : undefined;

    let infoMessage: string | undefined;
    if (visible && source && this.engineMode === 'studio') {
      const entry = this.sourceManager.getEntry(source.id);
      if (entry?.state.status === 'paused') {
        this.sourceManager.resumeSource(source.id);
      } else if (source.kind === 'window' || source.kind === 'screen') {
        if (!entry || entry.state.status === 'idle' || entry.state.status === 'disconnected' || entry.state.status === 'error') {
          infoMessage = 'Capa visible: autoriza o reconecta la pantalla manualmente cuando desees.';
        }
      } else if (
        source.kind === 'image' ||
        source.kind === 'video-file' ||
        source.kind === 'color' ||
        source.kind === 'gradient' ||
        source.kind === 'text' ||
        source.kind === 'camera'
      ) {
        await this.sourceManager.acquireSource(source, {
          id: COORDINATOR_CONSUMER_ID,
          kind: 'program-compositor',
        });
      }
    }

    if (this.engineMode === 'studio' && this.compositor) {
      const activeScene = this.getActiveScene();
      if (activeScene && activeScene.id === sceneId) {
        this.syncCompositorSceneAndRuntime();
        this.compositor.renderFrameNow();
      }
    }

    this.onStateChange?.();
    return { ok: true, layer: updatedLayer, reason: infoMessage };
  }

  renameSceneLayer(
    sceneId: string,
    layerId: string,
    newName: string
  ): { ok: boolean; layer?: SceneLayer; reason?: string } {
    const trimmed = newName.trim();
    if (!trimmed) {
      return { ok: false, reason: 'El nombre de la capa no puede estar vacío.' };
    }
    const prevProject = this.project;
    const nextProject = renameLayerInScene(this.project, sceneId, layerId, trimmed);
    if (nextProject === this.project) {
      return { ok: false, reason: 'No se pudo renombrar la capa.' };
    }

    this.project = nextProject;
    this.history.recordChange(prevProject, this.project, { label: 'Renombrar capa' });
    this.saver.schedule(this.project);

    const updatedScene = this.project.scenes.find((s) => s.id === sceneId);
    const updatedLayer = updatedScene?.layers.find((l) => l.id === layerId);

    if (this.engineMode === 'studio' && this.compositor) {
      const activeScene = this.getActiveScene();
      if (activeScene && activeScene.id === sceneId) {
        this.compositor.setSceneData(activeScene, this.project.sources);
      }
    }

    this.onStateChange?.();
    return { ok: true, layer: updatedLayer };
  }

  duplicateSceneLayer(
    sceneId: string,
    layerId: string
  ): { ok: boolean; layer?: SceneLayer | null; reason?: string } {
    const prevProject = this.project;
    const dupRes = duplicateLayerInScene(this.project, sceneId, layerId);
    if (!dupRes.layer || dupRes.project === this.project) {
      return { ok: false, layer: null, reason: 'No se pudo duplicar la capa.' };
    }

    this.project = dupRes.project;
    this.history.recordChange(prevProject, this.project, { label: 'Duplicar capa' });
    this.saver.schedule(this.project);

    if (this.engineMode === 'studio' && this.compositor) {
      const activeScene = this.getActiveScene();
      if (activeScene && activeScene.id === sceneId) {
        this.compositor.setSceneData(activeScene, this.project.sources);
        this.compositor.renderFrameNow();
      }
    }

    this.onStateChange?.();
    return { ok: true, layer: dupRes.layer };
  }

  resetSceneLayerTransform(
    sceneId: string,
    layerId: string
  ): { ok: boolean; layer?: SceneLayer; reason?: string } {
    const scene = this.project.scenes.find((s) => s.id === sceneId);
    const layer = scene?.layers.find((l) => l.id === layerId);
    if (!scene || !layer) {
      return { ok: false, reason: 'Capa o escena no encontrada.' };
    }
    if (layer.locked) {
      return { ok: false, reason: 'La capa está bloqueada.' };
    }

    const prevProject = this.project;
    const nextProject = resetLayerTransformInScene(this.project, sceneId, layerId);
    if (nextProject === this.project) {
      return { ok: true, layer };
    }

    this.project = nextProject;
    this.history.recordChange(prevProject, this.project, {
      label: 'Restablecer transformación',
    });
    this.saver.schedule(this.project);

    const updatedLayer = this.project.scenes
      .find((s) => s.id === sceneId)
      ?.layers.find((l) => l.id === layerId);

    if (this.engineMode === 'studio' && this.compositor) {
      const activeScene = this.getActiveScene();
      if (activeScene && activeScene.id === sceneId) {
        this.compositor.setSceneData(activeScene, this.project.sources);
        this.compositor.renderFrameNow();
      }
    }

    this.onStateChange?.();
    return { ok: true, layer: updatedLayer };
  }

  resetSceneLayerStyle(
    sceneId: string,
    layerId: string
  ): { ok: boolean; layer?: SceneLayer; reason?: string } {
    const scene = this.project.scenes.find((s) => s.id === sceneId);
    const layer = scene?.layers.find((l) => l.id === layerId);
    if (!scene || !layer) {
      return { ok: false, reason: 'Capa o escena no encontrada.' };
    }
    if (layer.locked) {
      return { ok: false, reason: 'La capa está bloqueada.' };
    }

    const prevProject = this.project;
    const nextProject = resetLayerStyleInScene(this.project, sceneId, layerId);
    if (nextProject === this.project) {
      return { ok: true, layer };
    }

    this.project = nextProject;
    this.history.recordChange(prevProject, this.project, {
      label: 'Restablecer apariencia',
    });
    this.saver.schedule(this.project);

    const updatedLayer = this.project.scenes
      .find((s) => s.id === sceneId)
      ?.layers.find((l) => l.id === layerId);

    if (this.engineMode === 'studio' && this.compositor) {
      const activeScene = this.getActiveScene();
      if (activeScene && activeScene.id === sceneId) {
        this.compositor.setSceneData(activeScene, this.project.sources);
        this.compositor.renderFrameNow();
      }
    }

    this.onStateChange?.();
    return { ok: true, layer: updatedLayer };
  }

  removeSceneLayer(
    sceneId: string,
    layerId: string
  ): { ok: boolean; reason?: string } {
    const scene = this.project.scenes.find((s) => s.id === sceneId);
    const layer = scene?.layers.find((l) => l.id === layerId);
    if (!scene || !layer) {
      return { ok: false, reason: 'Capa o escena no encontrada.' };
    }

    if (this.recordingLocked && sceneId === this.project.activeSceneId) {
      const otherUsesInScene =
        scene.layers.some((l) => l.id !== layerId && l.sourceId === layer.sourceId) ||
        scene.audioSourceIds.includes(layer.sourceId);
      const entry = this.sourceManager.getEntry(layer.sourceId);
      if (!otherUsesInScene && entry?.state.status === 'live' && entry.details.hasAudioTrack) {
        return {
          ok: false,
          reason:
            'Bloqueado durante grabación activa: la capa aporta una pista de audio en directo.',
        };
      }
    }

    const prevProject = this.project;
    const nextProject = removeLayerFromScene(this.project, sceneId, layerId);
    if (nextProject === this.project) {
      return { ok: false, reason: 'No se pudo quitar la capa de la escena.' };
    }

    // Nunca borra la fuente subyacente de `project.sources`: otras escenas pueden compartirla.
    this.project = nextProject;
    this.history.recordChange(prevProject, this.project, { label: 'Eliminar capa' });
    this.saver.schedule(this.project);

    if (this.engineMode === 'studio' && this.compositor) {
      this.syncCompositorSceneAndRuntime();
      this.reconcileSourceConsumersAfterTransition();
      this.compositor.renderFrameNow();
    }

    this.onStateChange?.();
    return { ok: true };
  }

  async addRealSourceToScene(
    sceneId: string,
    request: AddRealSourceRequest
  ): Promise<AddRealSourceResult> {
    if (this.disposed) {
      return { ok: false, reason: 'Coordinador liberado.' };
    }
    const targetScene = this.project.scenes.find((s) => s.id === sceneId);
    if (!targetScene) {
      return { ok: false, reason: 'Escena no encontrada.' };
    }

    const platformCapability = this.sourceManager.getPlatformCapabilities();
    const consumer = { id: COORDINATOR_CONSUMER_ID, kind: 'program-compositor' as const };
    const prevProject = this.project;

    if (request.kind === 'system-audio') {
      const liveDonor = this.sourceManager
        .listEntries()
        .find(
          (e) =>
            (e.source.kind === 'window' || e.source.kind === 'screen') &&
            (e.state.status === 'live' || e.state.status === 'paused') &&
            Boolean(e.resources.mediaStream?.getAudioTracks().length) &&
            (!request.targetHint ||
              e.source.name.toLowerCase().includes(request.targetHint.toLowerCase()))
        );

      if (!liveDonor) {
        const msg =
          platformCapability.platform === 'darwin' ||
          !platformCapability.supportsPerAppIsolatedAudioOnMacOS
            ? 'En macOS el audio del sistema requiere compartir primero una pantalla o ventana con la opción de audio activada.'
            : 'No hay ninguna fuente de pantalla o ventana compartiendo audio del sistema en este momento.';
        return {
          ok: false,
          reason: msg,
          platformCapability,
        };
      }

      const addedSys = addSource(this.project, {
        kind: 'system-audio',
        name: request.name?.trim() || `Audio del sistema (${liveDonor.source.name})`,
        targetHint: request.targetHint,
      });
      const updatedProject: StudioProject = {
        ...addedSys.project,
        scenes: addedSys.project.scenes.map((s) =>
          s.id === sceneId && !s.audioSourceIds.includes(addedSys.source.id)
            ? { ...s, audioSourceIds: [...s.audioSourceIds, addedSys.source.id], updatedAt: Date.now() }
            : s
        ),
      };
      this.project = updatedProject;
      this.sourceManager.syncProjectDefinitions(this.project);
      const entry = await this.sourceManager.acquireSource(addedSys.source, consumer, {
        linkedDisplaySourceId: liveDonor.source.id,
        retryOnError: true,
      });
      if (entry.state.status !== 'live') {
        this.project = prevProject;
        this.sourceManager.releaseSource(addedSys.source.id, COORDINATOR_CONSUMER_ID);
        this.sourceManager.syncProjectDefinitions(this.project);
        this.onStateChange?.();
        return {
          ok: false,
          entry,
          reason: entry.state.errorMessage || 'Audio del sistema no disponible.',
          platformCapability,
        };
      }
      this.history.recordChange(prevProject, this.project, { label: 'Añadir audio del sistema' });
      this.saver.schedule(this.project);
      this.syncCompositorSceneAndRuntime();
      this.onStateChange?.();
      return { ok: true, source: addedSys.source, entry, platformCapability };
    }

    let uploadedAssetRef: string | null = null;
    try {
      let added: { project: StudioProject; source: StudioSource };
      let layerTransform: Partial<LayerTransform> = { x: 0.15, y: 0.15, width: 0.7, height: 0.7, fitMode: 'contain' };
      let layerStyle: Partial<LayerStyle> | undefined;
      let isAudioOnly = false;

      if (request.kind === 'image') {
        const assetRef = request.file
          ? await saveStudioAssetBlob(request.file)
          : request.assetRef?.trim() || '';
        if (!assetRef) {
          return { ok: false, reason: 'Selecciona una imagen válida para añadir a la escena.' };
        }
        if (request.file) uploadedAssetRef = assetRef;
        added = addSource(this.project, {
          kind: 'image',
          name:
            request.name?.trim() ||
            (request.file instanceof File && request.file.name ? request.file.name : 'Imagen'),
          assetRef,
          intrinsicWidth: request.intrinsicWidth,
          intrinsicHeight: request.intrinsicHeight,
        });
      } else if (request.kind === 'video-file') {
        const assetRef = request.file
          ? await saveStudioAssetBlob(request.file)
          : request.assetRef?.trim() || '';
        if (!assetRef) {
          return { ok: false, reason: 'Selecciona un archivo de vídeo válido.' };
        }
        if (request.file) uploadedAssetRef = assetRef;
        added = addSource(this.project, {
          kind: 'video-file',
          name:
            request.name?.trim() ||
            (request.file instanceof File && request.file.name ? request.file.name : 'Vídeo local'),
          assetRef,
          loop: request.loop ?? true,
          playbackRate: request.playbackRate ?? 1,
          mutedByDefault: request.mutedByDefault ?? true,
        });
      } else if (request.kind === 'audio-file') {
        isAudioOnly = true;
        const assetRef = request.file
          ? await saveStudioAssetBlob(request.file)
          : request.assetRef?.trim() || '';
        if (!assetRef) {
          return { ok: false, reason: 'Selecciona un archivo de audio válido.' };
        }
        if (request.file) uploadedAssetRef = assetRef;
        added = addSource(this.project, {
          kind: 'audio-file',
          name:
            request.name?.trim() ||
            (request.file instanceof File && request.file.name ? request.file.name : 'Audio local'),
          assetRef,
          loop: request.loop ?? false,
        });
      } else if (request.kind === 'text') {
        layerTransform = { x: 0.1, y: 0.74, width: 0.8, height: 0.18, fitMode: 'contain' };
        layerStyle = { maskShape: 'rounded', borderRadiusPx: 16 };
        added = addSource(this.project, {
          kind: 'text',
          name: request.name?.trim() || request.text.trim().slice(0, 28) || 'Rótulo de texto',
          text: request.text.trim() || 'Texto en vivo',
          subtitle: request.subtitle?.trim(),
          fontFamily: request.fontFamily ?? 'sans',
          fontSizePx: request.fontSizePx ?? 42,
          textColor: request.textColor ?? '#ffffff',
          accentColor: request.accentColor ?? '#38bdf8',
          glassBackdrop: request.glassBackdrop ?? true,
          align: request.align ?? 'center',
        });
      } else if (request.kind === 'color') {
        layerTransform = { x: 0, y: 0, width: 1, height: 1, fitMode: 'stretch' };
        added = addSource(this.project, {
          kind: 'color',
          name: request.name?.trim() || `Color ${request.color}`,
          color: request.color,
        });
      } else if (request.kind === 'gradient') {
        layerTransform = { x: 0, y: 0, width: 1, height: 1, fitMode: 'stretch' };
        added = addSource(this.project, {
          kind: 'gradient',
          name: request.name?.trim() || 'Fondo degradado',
          startColor: request.startColor,
          endColor: request.endColor,
          angleDeg: request.angleDeg ?? 135,
        });
      } else if (request.kind === 'camera') {
        layerTransform = { x: 0.66, y: 0.62, width: 0.3, height: 0.3, fitMode: 'cover' };
        layerStyle = { maskShape: 'rounded', borderRadiusPx: 18 };
        const baseCamName = request.name?.trim() || request.deviceLabelHint?.trim() || 'Cámara';
        const camCount = this.project.sources.filter((s) => s.kind === 'camera').length;
        const resolvedCamName =
          request.name?.trim() ||
          request.deviceLabelHint?.trim() ||
          (camCount === 0 ? baseCamName : `${baseCamName} ${camCount + 1}`);
        added = addSource(this.project, {
          kind: 'camera',
          name: resolvedCamName,
          deviceId: request.deviceId || 'default',
          deviceLabelHint: request.deviceLabelHint,
          preferredWidth: request.preferredWidth ?? 1920,
          preferredHeight: request.preferredHeight ?? 1080,
          preferredFps: request.preferredFps ?? 30,
        });
      } else if (request.kind === 'microphone') {
        isAudioOnly = true;
        const micCount = this.project.sources.filter((s) => s.kind === 'microphone').length;
        const resolvedMicName =
          request.name?.trim() ||
          request.deviceLabelHint?.trim() ||
          (micCount === 0 ? 'Micrófono' : `Micrófono ${micCount + 1}`);
        added = addSource(this.project, {
          kind: 'microphone',
          name: resolvedMicName,
          deviceId: request.deviceId || 'default',
          deviceLabelHint: request.deviceLabelHint,
          echoCancellation: request.echoCancellation ?? true,
          noiseSuppression: request.noiseSuppression ?? true,
        });
      } else if (request.kind === 'window') {
        layerTransform = { x: 0.05, y: 0.05, width: 0.9, height: 0.9, fitMode: 'contain' };
        const winCount = this.project.sources.filter((s) => s.kind === 'window').length;
        const resolvedWinName =
          request.name?.trim() ||
          (winCount === 0 ? 'Ventana de aplicación' : `Ventana de aplicación ${winCount + 1}`);
        added = addSource(this.project, {
          kind: 'window',
          name: resolvedWinName,
          sourceTitleHint: request.sourceTitleHint,
          includeSystemAudio: request.includeSystemAudio ?? true,
        });
      } else {
        layerTransform = { x: 0, y: 0, width: 1, height: 1, fitMode: 'contain' };
        const screenCount = this.project.sources.filter((s) => s.kind === 'screen').length;
        const resolvedScreenName =
          request.name?.trim() ||
          (screenCount === 0 ? 'Pantalla compartida' : `Pantalla compartida ${screenCount + 1}`);
        added = addSource(this.project, {
          kind: 'screen',
          name: resolvedScreenName,
          displayNameHint: request.displayNameHint,
          includeSystemAudio: request.includeSystemAudio ?? true,
        });
      }

      let nextProject = added.project;
      let addedLayer: SceneLayer | null = null;
      if (isAudioOnly) {
        nextProject = {
          ...nextProject,
          scenes: nextProject.scenes.map((s) =>
            s.id === sceneId
              ? { ...s, audioSourceIds: [...s.audioSourceIds, added.source.id], updatedAt: Date.now() }
              : s
          ),
        };
      } else {
        const layerRes = addLayerToScene(nextProject, sceneId, added.source.id, {
          name: added.source.name,
          transform: layerTransform,
          style: layerStyle,
        });
        nextProject = layerRes.project;
        addedLayer = layerRes.layer;
        if (addedLayer && (request.kind === 'screen' || request.kind === 'window') && request.placement === 'behind-camera') {
          const scene = nextProject.scenes.find(s => s.id === sceneId)!;
          const ordered = [...scene.layers].sort((a,b) => a.zIndex-b.zIndex).filter(l => l.id !== addedLayer!.id);
          const cameraIndex = ordered.findIndex(l => l.visible && nextProject.sources.some(s => s.id === l.sourceId && s.kind === 'camera'));
          if (cameraIndex >= 0) {
            ordered.splice(cameraIndex, 0, addedLayer);
            nextProject = reorderSceneLayers(nextProject, sceneId, ordered.map(l => l.id));
            addedLayer = nextProject.scenes.find(s => s.id === sceneId)!.layers.find(l => l.id === addedLayer!.id)!;
          }
        }
      }

      this.project = nextProject;
      this.sourceManager.syncProjectDefinitions(this.project);

      let entry: SourceRuntimeEntry | null = null;
      if (added.source.kind === 'window' || added.source.kind === 'screen') {
        entry = await this.authorizeDisplaySource(added.source.id);
      } else {
        entry = await this.sourceManager.acquireSource(added.source, consumer, { retryOnError: true });
      }

      if (!entry || entry.state.status !== 'live') {
        const isCanceled = entry?.details.errorCode === 'user-canceled';
        const reason =
          entry?.state.errorMessage ||
          (isCanceled ? 'Selección cancelada por el usuario.' : 'No se pudo iniciar la fuente.');
        this.project = prevProject;
        this.sourceManager.releaseSource(added.source.id, COORDINATOR_CONSUMER_ID);
        this.sourceManager.syncProjectDefinitions(this.project);
        if (uploadedAssetRef) {
          await deleteStudioAssetBlob(uploadedAssetRef);
        }
        this.syncCompositorSceneAndRuntime();
        this.onStateChange?.();
        return {
          ok: false,
          canceled: isCanceled,
          entry,
          reason,
          platformCapability,
        };
      }

      this.history.recordChange(prevProject, this.project, { label: `Añadir ${added.source.name}` });
      this.saver.schedule(this.project);
      this.syncCompositorSceneAndRuntime();
      this.compositor?.renderFrameNow();
      this.onStateChange?.();
      return {
        ok: true,
        source: added.source,
        layer: addedLayer,
        entry,
        platformCapability,
      };
    } catch (err) {
      this.project = prevProject;
      this.sourceManager.syncProjectDefinitions(this.project);
      if (uploadedAssetRef) {
        await deleteStudioAssetBlob(uploadedAssetRef);
      }
      this.onStateChange?.();
      return {
        ok: false,
        reason: err instanceof Error ? err.message : 'No se pudo añadir la fuente.',
        platformCapability,
      };
    }
  }

  /**
   * Renombra una fuente persistente del proyecto sin interrumpir pistas activas ni reiniciar ProgramCanvas.
   */
  renameProjectSource(
    sourceId: string,
    newName: string
  ): { ok: boolean; source?: StudioSource; reason?: string } {
    const trimmed = newName.trim();
    if (!trimmed) {
      return { ok: false, reason: 'El nombre de la fuente no puede estar vacío.' };
    }
    const existing = this.project.sources.find((s) => s.id === sourceId);
    if (!existing) {
      return { ok: false, reason: 'Fuente no encontrada en el proyecto.' };
    }
    if (existing.name === trimmed) {
      return { ok: true, source: existing };
    }

    const nextProject = updateSource(this.project, sourceId, (src) => ({
      ...src,
      name: trimmed,
    }));
    this.project = nextProject;
    this.sourceManager.syncProjectDefinitions(this.project);
    this.saver.schedule(this.project);

    if (this.engineMode === 'studio' && this.compositor) {
      const activeScene = this.getActiveScene();
      if (activeScene) {
        this.compositor.setSceneData(activeScene, this.project.sources);
      }
    }

    this.onStateChange?.();
    return {
      ok: true,
      source: this.project.sources.find((s) => s.id === sourceId),
    };
  }

  /**
   * Incorpora una fuente existente del proyecto como capa independiente en una escena
   * sin duplicar hardware ni abrir selectores del sistema si ya está activa.
   */
  async addExistingSourceToScene(
    sceneId: string,
    sourceId: string,
    options?: { placement?: 'behind-camera' | 'top'; name?: string }
  ): Promise<AddRealSourceResult> {
    if (this.disposed) {
      return { ok: false, reason: 'Coordinador liberado.' };
    }
    const scene = this.project.scenes.find((s) => s.id === sceneId);
    const source = this.project.sources.find((s) => s.id === sourceId);
    if (!scene || !source) {
      return { ok: false, reason: 'Escena o fuente no encontrada.' };
    }

    const prevProject = this.project;
    let nextProject = prevProject;
    let addedLayer: SceneLayer | null = null;

    if (
      source.kind === 'microphone' ||
      source.kind === 'audio-file' ||
      source.kind === 'system-audio'
    ) {
      if (!scene.audioSourceIds.includes(source.id)) {
        nextProject = {
          ...nextProject,
          scenes: nextProject.scenes.map((s) =>
            s.id === sceneId
              ? { ...s, audioSourceIds: [...s.audioSourceIds, source.id], updatedAt: Date.now() }
              : s
          ),
        };
      }
    } else {
      const defaultTransform: Partial<LayerTransform> =
        source.kind === 'screen'
          ? { x: 0, y: 0, width: 1, height: 1, fitMode: 'contain' }
          : source.kind === 'window'
            ? { x: 0.05, y: 0.05, width: 0.9, height: 0.9, fitMode: 'contain' }
            : source.kind === 'camera'
              ? { x: 0.66, y: 0.62, width: 0.3, height: 0.3, fitMode: 'cover' }
              : { x: 0.15, y: 0.15, width: 0.7, height: 0.7, fitMode: 'contain' };

      const layerRes = addLayerToScene(nextProject, sceneId, source.id, {
        name: options?.name?.trim() || source.name,
        transform: defaultTransform,
      });
      nextProject = layerRes.project;
      addedLayer = layerRes.layer;

      if (addedLayer && options?.placement === 'behind-camera') {
        const targetScene = nextProject.scenes.find((s) => s.id === sceneId)!;
        const asc = [...targetScene.layers]
          .sort((a, b) => a.zIndex - b.zIndex)
          .filter((l) => l.id !== addedLayer!.id);
        const camIdx = asc.findIndex(
          (l) =>
            l.visible &&
            nextProject.sources.some((s) => s.id === l.sourceId && s.kind === 'camera')
        );
        if (camIdx >= 0) {
          asc.splice(camIdx, 0, addedLayer);
          nextProject = reorderSceneLayers(
            nextProject,
            sceneId,
            asc.map((l) => l.id)
          );
          addedLayer =
            nextProject.scenes
              .find((s) => s.id === sceneId)
              ?.layers.find((l) => l.id === addedLayer!.id) ?? addedLayer;
        }
      }
    }

    this.project = nextProject;
    this.history.recordChange(prevProject, this.project, { label: `Añadir ${source.name}` });
    this.saver.schedule(this.project);

    const existingEntry = this.sourceManager.getEntry(source.id);
    if (
      this.engineMode === 'studio' &&
      source.kind !== 'window' &&
      source.kind !== 'screen' &&
      source.kind !== 'system-audio'
    ) {
      await this.sourceManager.acquireSource(source, {
        id: COORDINATOR_CONSUMER_ID,
        kind: 'program-compositor',
      });
    } else if (existingEntry && existingEntry.state.status === 'live') {
      await this.sourceManager.acquireSource(source, {
        id: COORDINATOR_CONSUMER_ID,
        kind: 'program-compositor',
      });
    }

    this.syncCompositorSceneAndRuntime();
    this.compositor?.renderFrameNow();
    this.onStateChange?.();
    return {
      ok: true,
      source,
      layer: addedLayer,
      entry: this.sourceManager.getEntry(source.id),
    };
  }

  async removeProjectSourceSafely(sourceId: string): Promise<RemoveSourceResult> {
    if (this.recordingLocked) {
      return {
        ok: false,
        removed: false,
        usageCount: 0,
        reason: 'Bloqueado durante grabación activa.',
      };
    }
    const target = this.project.sources.find((s) => s.id === sourceId);
    const res = removeSourceSafely(this.project, sourceId);
    if (!res.removed) {
      return {
        ok: false,
        removed: false,
        usageCount: res.usageCount,
        reason:
          res.reason === 'source-in-use'
            ? `La fuente sigue en uso en ${res.usageCount} capa(s) o escena(s). Quita primero las capas que la usan.`
            : 'Fuente no encontrada en el proyecto.',
      };
    }

    this.project = res.project;
    this.sourceManager.releaseSource(sourceId, COORDINATOR_CONSUMER_ID);
    this.sourceManager.syncProjectDefinitions(this.project);
    if (
      target &&
      (target.kind === 'image' || target.kind === 'video-file' || target.kind === 'audio-file') &&
      isStudioAssetRef(target.assetRef)
    ) {
      await deleteStudioAssetBlob(target.assetRef);
    }

    this.saver.schedule(this.project);
    this.syncCompositorRuntime();
    this.onStateChange?.();
    return {
      ok: true,
      removed: true,
      usageCount: 0,
    };
  }

  async resetProjectToStarter(): Promise<void> {
    if (this.recordingLocked) return;

    this.saver.cancel();
    this.history.clear();
    this.sourceManager.releaseConsumer(COORDINATOR_CONSUMER_ID);
    const fresh = createStarterStudioProject(
      this.project.recordingProfile.resolutionPreset,
      this.project.recordingProfile.aspectRatio
    );
    this.project = fresh;
    await saveStudioProject(fresh, this.storageAdapter);
    this.sourceManager.syncProjectDefinitions(fresh);

    if (this.engineMode === 'studio') {
      const activeScene = this.getActiveScene();
      if (activeScene) {
        await this.acquireNonInteractiveSourcesForScene(activeScene, this.epoch);
      }
      this.syncCompositorSceneAndRuntime();
      this.compositor?.renderFrameNow();
    }
    this.onStateChange?.();
  }

  async flushPersistence(): Promise<void> {
    await this.saver.flush();
  }

  // --------------------------------------------------------------------------
  // PROPIEDAD, ADOPCIÓN Y PROTECCIÓN DE FUENTES DURANTE TRANSICIONES
  // --------------------------------------------------------------------------

  private async adoptLegacyStreamsIntoActiveScene(handoff: LegacyStreamHandoff): Promise<void> {
    const consumer = { id: COORDINATOR_CONSUMER_ID, kind: 'program-compositor' as const };

    if (handoff.cameraStream) {
      const camSource = this.project.sources.find((s) => s.kind === 'camera');
      const micSource = this.project.sources.find((s) => s.kind === 'microphone');
      const { videoOnlyStream, audioOnlyStream } = splitCameraAndMicStream(handoff.cameraStream);

      if (camSource && videoOnlyStream) {
        await this.sourceManager.adoptExternalMediaStream(camSource, consumer, videoOnlyStream);
      }
      if (micSource && (handoff.microphoneStream || audioOnlyStream)) {
        await this.sourceManager.adoptExternalMediaStream(
          micSource,
          consumer,
          (handoff.microphoneStream ?? audioOnlyStream)!
        );
      }
    } else if (handoff.microphoneStream) {
      const micSource = this.project.sources.find((s) => s.kind === 'microphone');
      if (micSource) {
        await this.sourceManager.adoptExternalMediaStream(micSource, consumer, handoff.microphoneStream);
      }
    }

    if (handoff.screenStream) {
      const displaySource = this.project.sources.find(
        (s) => s.kind === 'window' || s.kind === 'screen'
      );
      if (displaySource) {
        await this.sourceManager.adoptExternalMediaStream(
          displaySource,
          consumer,
          handoff.screenStream
        );
      }
    }
  }

  private async acquireNonInteractiveSourcesForScene(
    scene: StudioScene,
    expectedEpoch: number,
    expectedSceneOp?: number
  ): Promise<void> {
    const byId = new Map(this.project.sources.map((s) => [s.id, s]));
    const requiredIds = new Set<string>();
    for (const layer of scene.layers) requiredIds.add(layer.sourceId);
    for (const audioId of scene.audioSourceIds) requiredIds.add(audioId);

    const consumer = { id: COORDINATOR_CONSUMER_ID, kind: 'program-compositor' as const };

    for (const id of requiredIds) {
      if (this.disposed || this.epoch !== expectedEpoch) return;
      if (expectedSceneOp !== undefined && this.sceneOpToken !== expectedSceneOp) return;

      const src = byId.get(id);
      if (!src) continue;

      // CRÍTICO: Nunca abrir automáticamente cuadros de permiso getDisplayMedia() para ventanas/pantallas
      if (src.kind === 'window' || src.kind === 'screen' || src.kind === 'system-audio') {
        continue;
      }

      const existing = this.sourceManager.getEntry(src.id);
      if (existing && (existing.state.status === 'live' || existing.state.status === 'paused')) {
        // Ya está activa: asegurar únicamente que tiene al coordinador como consumidor
        await this.sourceManager.acquireSource(src, consumer);
        continue;
      }

      await this.sourceManager.acquireSource(src, consumer);
    }
  }

  private reconcileSourceConsumersAfterTransition(): void {
    if (!this.compositor || this.disposed) return;

    const requiredVisualIds = new Set(this.compositor.getRequiredSourceIds());
    const activeScene = this.getActiveScene();
    if (activeScene) {
      for (const audioId of activeScene.audioSourceIds) {
        requiredVisualIds.add(audioId);
      }
    }

    for (const entry of this.sourceManager.listEntries()) {
      if (
        entry.details.consumerIds.includes(COORDINATOR_CONSUMER_ID) &&
        !requiredVisualIds.has(entry.source.id)
      ) {
        this.sourceManager.releaseSource(entry.source.id, COORDINATOR_CONSUMER_ID);
      }
    }
    this.compositor.pruneUnusedResources();
  }

  private syncCompositorSceneAndRuntime(): void {
    if (!this.compositor) return;
    const activeScene = this.getActiveScene();
    if (!activeScene) return;
    const entries = new Map<string, SourceRuntimeEntry>(
      this.sourceManager.listEntries().map((e) => [e.source.id, e])
    );
    this.compositor.setSceneData(activeScene, this.project.sources, entries);
  }

  private syncCompositorRuntime(): void {
    if (!this.compositor) return;
    const entries = new Map<string, SourceRuntimeEntry>(
      this.sourceManager.listEntries().map((e) => [e.source.id, e])
    );
    this.compositor.syncSourcesAndRuntime(this.project.sources, entries);
  }

  // --------------------------------------------------------------------------
  // DIAGNÓSTICOS REALES Y LIMPIEZA
  // --------------------------------------------------------------------------

  getDiagnosticsSnapshot(): StudioDiagnosticsSnapshot {
    const entries = this.sourceManager.listEntries();
    const stats = this.compositor?.getStats();
    const activeScene = this.getActiveScene();

    let connectedSourcesCount = 0;
    let disconnectedOrErrorSourcesCount = 0;
    let totalConsumersCount = 0;
    let activeTracksCount = 0;

    for (const e of entries) {
      if (e.state.status === 'live') connectedSourcesCount += 1;
      if (e.state.status === 'disconnected' || e.state.status === 'error') {
        disconnectedOrErrorSourcesCount += 1;
      }
      totalConsumersCount += e.details.referenceCount;
      const stream = e.resources.mediaStream;
      if (stream) {
        activeTracksCount += stream.getTracks().filter((t) => t.readyState !== 'ended').length;
      }
    }

    const compositorState: StudioDiagnosticsSnapshot['compositorState'] = this.disposed
      ? 'disposed'
      : stats?.contextLost
        ? 'context-lost'
        : this.compositor?.isLoopRunning()
          ? 'running'
          : 'stopped';

    return {
      engineMode: this.engineMode,
      backendKind: this.compositor ? this.compositor.getBackendKind() : 'none',
      compositorState,
      activeSceneId: activeScene?.id ?? null,
      activeSceneName: activeScene?.name ?? null,
      registeredSourcesCount: entries.length,
      connectedSourcesCount,
      disconnectedOrErrorSourcesCount,
      totalConsumersCount,
      activeTracksCount,
      targetFps: stats?.targetFps ?? this.targetFps,
      effectiveFps: stats?.effectiveFps ?? 0,
      outputWidth: stats?.outputWidth ?? this.outputWidth,
      outputHeight: stats?.outputHeight ?? this.outputHeight,
      lastRenderDurationMs: stats?.lastRenderDurationMs ?? 0,
      renderedFrames: stats?.renderedFrames ?? 0,
      activeTransition: this.compositor?.getActiveTransition() ?? null,
      recordingLocked: this.recordingLocked,
      surfaceReplacementsCount: this.surfaceReplacementsCount,
      lastError: this.lastError,
      sources: entries.map((e) => ({
        id: e.source.id,
        name: e.source.name,
        kind: e.source.kind,
        status: e.state.status,
        consumers: e.details.referenceCount,
        hasVideoTrack: e.details.hasVideoTrack,
        hasAudioTrack: e.details.hasAudioTrack,
        errorMessage: e.state.errorMessage,
        disconnectionReason: e.details.disconnectionReason,
      })),
      layerDiagnostics: this.compositor?.getDiagnostics() ?? [],
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mounted = false;
    this.epoch += 1;
    this.sceneOpToken += 1;

    this.saver.cancel();
    if (this.unsubscribeSources) {
      this.unsubscribeSources();
      this.unsubscribeSources = null;
    }

    this.compositor?.dispose();
    this.compositor = null;
    this.sourceManager.disposeAll();
  }
}
