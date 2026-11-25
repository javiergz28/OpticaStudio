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
  createScene,
  setActiveScene,
} from './sceneEngine';
import { instantiatePresetProject } from './scenePresets';
import {
  SourceManager,
  type MediaStreamLike,
  type MediaStreamTrackLike,
  type SourceManagerOptions,
  type SourceRuntimeEntry,
} from './sourceManager';
import type { AspectRatioId, ResolutionPresetId } from '../types/camera';
import type {
  SceneTransition,
  StudioPresetId,
  StudioProject,
  StudioScene,
  StudioSource,
} from '../types/studio';
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

  async resetProjectToStarter(): Promise<void> {
    if (this.recordingLocked) return;

    this.saver.cancel();
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
