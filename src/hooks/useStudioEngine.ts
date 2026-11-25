import { useCallback, useEffect, useRef, useState } from 'react';
import {
  readPersistedEngineMode,
  STUDIO_ENGINE_COMPATIBILITY_MATRIX,
  type EngineCompatibilityItem,
  type EngineMode,
} from '../engine/engineCompatibility';
import type {
  CompositorBackendKind,
  CompositorFrameStats,
  CompositorTargetFps,
  ProcessedLayerSurface,
  ProgramSurfaceLike,
} from '../engine/programCompositor';
import type { SourceRuntimeEntry } from '../engine/sourceManager';
import {
  createStarterStudioProject,
  StudioCoordinator,
  type LegacyStreamHandoff,
  type ModeSwitchResult,
  type PreferredCompositorBackend,
  type StudioDiagnosticsSnapshot,
} from '../engine/studioCoordinator';
import type { AspectRatioId, ResolutionPresetId } from '../types/camera';
import type {
  SceneTransition,
  StudioPresetId,
  StudioProject,
  StudioScene,
} from '../types/studio';

export interface UseStudioEngineOptions {
  resolutionPreset: ResolutionPresetId;
  aspectRatio: AspectRatioId;
  fps?: CompositorTargetFps;
  initialMode?: EngineMode;
  persistModePreference?: boolean;
  onRecordingSafetyStop?: (reason: string) => void;
}

export interface StudioEngineUiSnapshot {
  engineMode: EngineMode;
  backendKind: CompositorBackendKind | 'none';
  preferredBackend: PreferredCompositorBackend;
  isRecordingLocked: boolean;
  activeSceneId: string;
  scenes: StudioScene[];
  sources: StudioDiagnosticsSnapshot['sources'];
  activeTransitionType: 'cut' | 'fade' | null;
  lastError: string | null;
  hasLiveDisplaySource: boolean;
  hasLiveCameraSource: boolean;
}

export interface UseStudioEngineResult {
  engineMode: EngineMode;
  backendKind: CompositorBackendKind | 'none';
  preferredBackend: PreferredCompositorBackend;
  isRecordingLocked: boolean;
  activeSceneId: string;
  scenes: StudioScene[];
  sources: StudioDiagnosticsSnapshot['sources'];
  hasLiveDisplaySource: boolean;
  hasLiveCameraSource: boolean;
  lastError: string | null;
  diagnosticsSnapshot: StudioDiagnosticsSnapshot | null;
  compatibilityMatrix: readonly EngineCompatibilityItem[];

  getProgramCanvas: () => HTMLCanvasElement | null;
  getProject: () => StudioProject;
  getActiveCameraVideoElement: () => HTMLVideoElement | null;
  getActiveSourceRuntimeEntries: () => SourceRuntimeEntry[];
  getActiveAudioMediaTracks: () => MediaStreamTrack[];
  getDiagnosticsSnapshot: () => StudioDiagnosticsSnapshot;
  refreshDiagnostics: () => StudioDiagnosticsSnapshot;

  registerFrameRenderedListener: (
    listener: ((stats: CompositorFrameStats, surface: ProgramSurfaceLike) => void) | null
  ) => void;

  activateStudioMode: (handoff?: LegacyStreamHandoff) => Promise<ModeSwitchResult>;
  deactivateStudioMode: () => ModeSwitchResult;
  switchScene: (
    sceneId: string,
    transitionOverride?: Partial<Pick<SceneTransition, 'type' | 'durationMs'>>
  ) => Promise<boolean>;
  activatePresetScene: (
    presetId: StudioPresetId,
    transitionOverride?: Partial<Pick<SceneTransition, 'type' | 'durationMs'>>
  ) => Promise<StudioScene | null>;
  authorizeDisplaySource: (sourceId?: string) => Promise<SourceRuntimeEntry | null>;
  reconnectSource: (sourceId: string, force?: boolean) => Promise<SourceRuntimeEntry | null>;
  setResolutionProfile: (
    resolutionPreset: ResolutionPresetId,
    aspectRatio: AspectRatioId,
    fps?: CompositorTargetFps
  ) => { ok: boolean; reason?: string };
  setBackendPreference: (backend: PreferredCompositorBackend) => { ok: boolean; reason?: string };
  recoverLostContextWithCanvas2d: () => { ok: boolean; reason?: string };
  setRecordingLocked: (locked: boolean) => void;
  setProcessedCameraSurface: (frame: ProcessedLayerSurface | null) => void;
  resetProject: () => Promise<void>;
}

function buildUiSnapshot(coord: StudioCoordinator): StudioEngineUiSnapshot {
  const diag = coord.getDiagnosticsSnapshot();
  const project = coord.getProject();
  return {
    engineMode: diag.engineMode,
    backendKind: diag.backendKind,
    preferredBackend: coord.getPreferredBackend(),
    isRecordingLocked: diag.recordingLocked,
    activeSceneId: diag.activeSceneId ?? project.activeSceneId,
    scenes: project.scenes,
    sources: diag.sources,
    activeTransitionType: diag.activeTransition?.type ?? null,
    lastError: diag.lastError,
    hasLiveDisplaySource: diag.sources.some(
      (s) => (s.kind === 'window' || s.kind === 'screen') && s.status === 'live'
    ),
    hasLiveCameraSource: diag.sources.some(
      (s) => s.kind === 'camera' && s.status === 'live'
    ),
  };
}

/**
 * Hook central que expone `StudioCoordinator` (`SourceManager` + `ProgramCompositor` + `studioStorage`)
 * a React con seguridad ante montaje/desmontaje/remontaje de React StrictMode y sin re-renderizar a 60 FPS.
 */
export function useStudioEngine(options: UseStudioEngineOptions): UseStudioEngineResult {
  const {
    resolutionPreset,
    aspectRatio,
    fps = 30,
    initialMode,
    persistModePreference = true,
    onRecordingSafetyStop,
  } = options;

  const coordinatorRef = useRef<StudioCoordinator | null>(null);
  const frameListenerRef = useRef<
    ((stats: CompositorFrameStats, surface: ProgramSurfaceLike) => void) | null
  >(null);
  const safetyStopRef = useRef(onRecordingSafetyStop);
  safetyStopRef.current = onRecordingSafetyStop;

  const initialUiRef = useRef<StudioEngineUiSnapshot | null>(null);
  if (!initialUiRef.current) {
    const fallbackProject = createStarterStudioProject(resolutionPreset, aspectRatio);
    const resolvedInitialMode =
      initialMode ?? (persistModePreference ? readPersistedEngineMode() : 'legacy');
    initialUiRef.current = {
      engineMode: resolvedInitialMode,
      backendKind: 'none',
      preferredBackend: 'auto',
      isRecordingLocked: false,
      activeSceneId: fallbackProject.activeSceneId,
      scenes: fallbackProject.scenes,
      sources: [],
      activeTransitionType: null,
      lastError: null,
      hasLiveDisplaySource: false,
      hasLiveCameraSource: false,
    };
  }

  const [uiState, setUiState] = useState<StudioEngineUiSnapshot>(initialUiRef.current);
  const [diagnosticsSnapshot, setDiagnosticsSnapshot] =
    useState<StudioDiagnosticsSnapshot | null>(null);

  const ensureCoordinator = useCallback((): StudioCoordinator => {
    if (coordinatorRef.current && !coordinatorRef.current.isDisposed()) {
      return coordinatorRef.current;
    }

    const coord = new StudioCoordinator({
      initialMode: initialMode ?? (persistModePreference ? readPersistedEngineMode() : 'legacy'),
      persistModePreference,
      resolutionPreset,
      aspectRatio,
      fps,
      onStateChange: () => {
        if (!coord.isDisposed()) {
          setUiState(buildUiSnapshot(coord));
        }
      },
      onFrameRendered: (stats, surface) => {
        // Notifica directamente al consumidor de presentación sin disparar setState a 60 FPS
        frameListenerRef.current?.(stats, surface);
      },
      onRecordingSafetyStop: (reason) => {
        safetyStopRef.current?.(reason);
      },
    });
    coordinatorRef.current = coord;
    return coord;
    // Las instancias principales no deben recrearse en cada renderizado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ciclo de vida compatible con React StrictMode (mount -> cleanup -> remount limpio)
  useEffect(() => {
    const coord = ensureCoordinator();
    void coord.mount().then(() => {
      if (!coord.isDisposed()) {
        setUiState(buildUiSnapshot(coord));
      }
    });

    return () => {
      coord.dispose();
      if (coordinatorRef.current === coord) {
        coordinatorRef.current = null;
      }
    };
  }, [ensureCoordinator]);

  // Sincronización segura de resolución cuando cambia fuera de grabación activa
  useEffect(() => {
    const coord = coordinatorRef.current;
    if (!coord || coord.isDisposed() || !coord.isMounted()) return;
    coord.setResolutionProfile(resolutionPreset, aspectRatio, fps);
  }, [resolutionPreset, aspectRatio, fps]);

  const getProgramCanvas = useCallback((): HTMLCanvasElement | null => {
    const coord = coordinatorRef.current;
    if (!coord || coord.isDisposed()) return null;
    const surf = coord.getProgramSurface();
    return typeof HTMLCanvasElement !== 'undefined' && surf instanceof HTMLCanvasElement
      ? surf
      : (surf as unknown as HTMLCanvasElement);
  }, []);

  const getProject = useCallback((): StudioProject => {
    const coord = ensureCoordinator();
    return coord.getProject();
  }, [ensureCoordinator]);

  const getActiveCameraVideoElement = useCallback((): HTMLVideoElement | null => {
    const coord = coordinatorRef.current;
    if (!coord || coord.isDisposed()) return null;
    const camSrc = coord.getProject().sources.find((s) => s.kind === 'camera');
    if (!camSrc) return null;
    const entry = coord.sourceManager.getEntry(camSrc.id);
    return entry?.resources.videoElement ?? null;
  }, []);

  const getActiveSourceRuntimeEntries = useCallback((): SourceRuntimeEntry[] => {
    const coord = coordinatorRef.current;
    if (!coord || coord.isDisposed()) return [];
    return coord.sourceManager.listEntries();
  }, []);

  const getActiveAudioMediaTracks = useCallback((): MediaStreamTrack[] => {
    const coord = coordinatorRef.current;
    if (!coord || coord.isDisposed()) return [];
    const tracks: MediaStreamTrack[] = [];
    for (const entry of coord.sourceManager.listEntries()) {
      if (entry.state.status !== 'live') continue;
      const stream = entry.resources.mediaStream;
      if (!stream) continue;
      for (const t of stream.getAudioTracks()) {
        if (t.readyState !== 'ended' && !tracks.includes(t)) {
          tracks.push(t);
        }
      }
    }
    return tracks;
  }, []);

  const getDiagnosticsSnapshot = useCallback((): StudioDiagnosticsSnapshot => {
    const coord = ensureCoordinator();
    return coord.getDiagnosticsSnapshot();
  }, [ensureCoordinator]);

  const refreshDiagnostics = useCallback((): StudioDiagnosticsSnapshot => {
    const snap = getDiagnosticsSnapshot();
    setDiagnosticsSnapshot(snap);
    return snap;
  }, [getDiagnosticsSnapshot]);

  const registerFrameRenderedListener = useCallback(
    (listener: ((stats: CompositorFrameStats, surface: ProgramSurfaceLike) => void) | null) => {
      frameListenerRef.current = listener;
    },
    []
  );

  const activateStudioMode = useCallback(
    async (handoff?: LegacyStreamHandoff): Promise<ModeSwitchResult> => {
      const coord = ensureCoordinator();
      const res = await coord.activateStudioMode(handoff);
      if (!coord.isDisposed()) {
        setUiState(buildUiSnapshot(coord));
      }
      return res;
    },
    [ensureCoordinator]
  );

  const deactivateStudioMode = useCallback((): ModeSwitchResult => {
    const coord = ensureCoordinator();
    const res = coord.deactivateStudioMode();
    if (!coord.isDisposed()) {
      setUiState(buildUiSnapshot(coord));
    }
    return res;
  }, [ensureCoordinator]);

  const switchScene = useCallback(
    async (
      sceneId: string,
      transitionOverride?: Partial<Pick<SceneTransition, 'type' | 'durationMs'>>
    ): Promise<boolean> => {
      const coord = ensureCoordinator();
      return coord.switchScene(sceneId, transitionOverride);
    },
    [ensureCoordinator]
  );

  const activatePresetScene = useCallback(
    async (
      presetId: StudioPresetId,
      transitionOverride?: Partial<Pick<SceneTransition, 'type' | 'durationMs'>>
    ): Promise<StudioScene | null> => {
      const coord = ensureCoordinator();
      return coord.activatePresetScene(presetId, transitionOverride);
    },
    [ensureCoordinator]
  );

  const authorizeDisplaySource = useCallback(
    async (sourceId?: string): Promise<SourceRuntimeEntry | null> => {
      const coord = ensureCoordinator();
      return coord.authorizeDisplaySource(sourceId);
    },
    [ensureCoordinator]
  );

  const reconnectSource = useCallback(
    async (sourceId: string, force = false): Promise<SourceRuntimeEntry | null> => {
      const coord = ensureCoordinator();
      return coord.reconnectSource(sourceId, force);
    },
    [ensureCoordinator]
  );

  const setResolutionProfile = useCallback(
    (
      nextPreset: ResolutionPresetId,
      nextAspect: AspectRatioId,
      nextFps?: CompositorTargetFps
    ) => {
      const coord = ensureCoordinator();
      return coord.setResolutionProfile(nextPreset, nextAspect, nextFps);
    },
    [ensureCoordinator]
  );

  const setBackendPreference = useCallback(
    (backend: PreferredCompositorBackend) => {
      const coord = ensureCoordinator();
      return coord.setBackendPreference(backend);
    },
    [ensureCoordinator]
  );

  const recoverLostContextWithCanvas2d = useCallback(() => {
    const coord = ensureCoordinator();
    return coord.recoverLostContextWithCanvas2dFallback();
  }, [ensureCoordinator]);

  const setRecordingLocked = useCallback((locked: boolean) => {
    const coord = coordinatorRef.current;
    if (!coord || coord.isDisposed()) return;
    coord.setRecordingLocked(locked);
  }, []);

  const setProcessedCameraSurface = useCallback((frame: ProcessedLayerSurface | null) => {
    const coord = coordinatorRef.current;
    if (!coord || coord.isDisposed()) return;
    coord.setProcessedCameraSurface(frame);
  }, []);

  const resetProject = useCallback(async () => {
    const coord = ensureCoordinator();
    await coord.resetProjectToStarter();
    setDiagnosticsSnapshot(coord.getDiagnosticsSnapshot());
  }, [ensureCoordinator]);

  return {
    engineMode: uiState.engineMode,
    backendKind: uiState.backendKind,
    preferredBackend: uiState.preferredBackend,
    isRecordingLocked: uiState.isRecordingLocked,
    activeSceneId: uiState.activeSceneId,
    scenes: uiState.scenes,
    sources: uiState.sources,
    hasLiveDisplaySource: uiState.hasLiveDisplaySource,
    hasLiveCameraSource: uiState.hasLiveCameraSource,
    lastError: uiState.lastError,
    diagnosticsSnapshot,
    compatibilityMatrix: STUDIO_ENGINE_COMPATIBILITY_MATRIX,

    getProgramCanvas,
    getProject,
    getActiveCameraVideoElement,
    getActiveSourceRuntimeEntries,
    getActiveAudioMediaTracks,
    getDiagnosticsSnapshot,
    refreshDiagnostics,

    registerFrameRenderedListener,

    activateStudioMode,
    deactivateStudioMode,
    switchScene,
    activatePresetScene,
    authorizeDisplaySource,
    reconnectSource,
    setResolutionProfile,
    setBackendPreference,
    recoverLostContextWithCanvas2d,
    setRecordingLocked,
    setProcessedCameraSurface,
    resetProject,
  };
}
