import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TopBar } from './components/TopBar';
import { LeftStudioPanel } from './components/LeftStudioPanel';
import { CameraViewport } from './components/CameraViewport';
import { SidebarControls, type StudioEnginePanelProps } from './components/SidebarControls';
import { GalleryView } from './components/GalleryView';
import {
  DEFAULT_ADJUSTMENTS,
  DEFAULT_AUDIO_CONSOLE_SETTINGS,
  DEFAULT_BACKGROUND_SETTINGS,
  DEFAULT_DUAL_CAMERA_SETTINGS,
  DEFAULT_FOCUS_SETTINGS,
  DEFAULT_STABILIZATION_SETTINGS,
  type AiSubjectBox,
  type AiVisionStatus,
  type AspectRatioId,
  type AudioConsoleSettings,
  type BackgroundSegmentationSettings,
  type CapturedMediaItem,
  type ColorAdjustments,
  type DualCameraSettings,
  type FilterPresetId,
  type FocusSettings,
  type FrameFitMode,
  type GridOverlayId,
  type MotionEvent,
  type OverlayBranding,
  type RecordingFormatPref,
  type ResolutionPresetId,
  type RingLightSettings,
  type RotationDeg,
  type SampledColor,
  type ScreenLayoutMode,
  type StabilizationSettings,
  type TeleprompterSettings,
  type VisualEffectId,
  type WorkspaceTab,
} from './types/camera';
import {
  clearBackgroundCalibration,
  computeHistogram,
  computeMotionScore,
  getAlignedRawCanvas,
  renderCameraFrame,
  renderUnavailableCameraFrame,
  triggerBackgroundCalibration,
  type HistogramData,
} from './utils/canvasProcessor';
import {
  detectSubjectsWithAi,
  ensureAiFaceDetector,
  ensureAiSegmenter,
  getAiVisionStatus,
  resetAiSegmentationTemporalBuffer,
  subscribeAiStatus,
} from './utils/aiVision';
import { playCountdownBeep, playShutterSound } from './utils/audio';
import {
  clearAllMediaFromDB,
  deleteMediaItemFromDB,
  loadAllMediaItems,
  saveMediaItem,
} from './utils/storage';
import {
  readPersistedEngineMode,
  type EngineMode,
} from './engine/engineCompatibility';
import type { PreferredCompositorBackend } from './engine/studioCoordinator';
import type { MediaStreamLike } from './engine/sourceManager';
import {
  computeKeyboardNudgeTransform,
  isVisualSourceEditable,
} from './engine/layerEditor';
import { useStudioEngine } from './hooks/useStudioEngine';
import { useAppearance } from './hooks/useAppearance';

function getDimensions(
  preset: ResolutionPresetId,
  aspect: AspectRatioId,
  sensorSize: { w: number; h: number }
): { w: number; h: number } {
  if (preset === 'max' && aspect === 'native') {
    return { w: sensorSize.w, h: sensorSize.h };
  }

  const minSensorDim = Math.min(sensorSize.w, sensorSize.h);
  const baseH =
    preset === 'max'
      ? Math.max(minSensorDim, 1080)
      : preset === '4k'
        ? 2160
        : preset === '1080p'
          ? 1080
          : 720;

  const nativeRatio = sensorSize.w / Math.max(1, sensorSize.h);
  switch (aspect) {
    case 'native':
      return { w: Math.round(baseH * nativeRatio), h: baseH };
    case '16:9':
      return { w: Math.round((baseH * 16) / 9), h: baseH };
    case '4:3':
      return { w: Math.round((baseH * 4) / 3), h: baseH };
    case '1:1':
      return { w: baseH, h: baseH };
    case '9:16':
      return { w: Math.round((baseH * 9) / 16), h: baseH };
  }
}

const PREFS_STORAGE_KEY = 'optica_studio_prefs_v1';

interface PersistedStudioPrefs {
  resolutionPreset?: ResolutionPresetId;
  aspectRatio?: AspectRatioId;
  fitMode?: FrameFitMode;
  rotation?: RotationDeg;
  mirror?: boolean;
  flipVertical?: boolean;
  zoom?: number;
  focus?: Partial<FocusSettings>;
  stabilization?: Partial<StabilizationSettings>;
  filterId?: FilterPresetId;
  effectId?: VisualEffectId;
  adjustments?: Partial<ColorAdjustments>;
  background?: Partial<BackgroundSegmentationSettings>;
  ringLight?: Partial<RingLightSettings>;
  branding?: Partial<OverlayBranding>;
  audioConsole?: Partial<AudioConsoleSettings>;
  recordingFormatPref?: RecordingFormatPref;
  gridOverlay?: GridOverlayId;
  showHistogram?: boolean;
  screenLayout?: ScreenLayoutMode;
  pipCorner?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  pipCircular?: boolean;
  pipSizeRatio?: number;
  soundMuted?: boolean;
  flashEnabled?: boolean;
  timerSeconds?: number;
}

function loadSavedPrefs(): PersistedStudioPrefs {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedStudioPrefs;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export default function App() {
  const initialPrefs = useMemo(() => loadSavedPrefs(), []);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('studio');
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [cinemaMode, setCinemaMode] = useState(false);
  const [studioLabOpen, setStudioLabOpen] = useState(false);

  // Streams & Hardware
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'live' | 'error'>('idle');
  const [cameraErrorMsg, setCameraErrorMsg] = useState<string | null>(null);
  const [cameraLabel, setCameraLabel] = useState<string>('FaceTime HD');
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');
  const [hardwareFocusSupported, setHardwareFocusSupported] = useState(false);
  const [sensorSize, setSensorSize] = useState<{ w: number; h: number }>({ w: 1920, h: 1080 });

  // Resolution & Geometry (default to horizontal 16:9 edge-to-edge fill at maximum quality)
  const [resolutionPreset, setResolutionPreset] = useState<ResolutionPresetId>(
    initialPrefs.resolutionPreset || 'max'
  );
  const [aspectRatio, setAspectRatio] = useState<AspectRatioId>(
    initialPrefs.aspectRatio || '16:9'
  );
  const [fitMode, setFitMode] = useState<FrameFitMode>(initialPrefs.fitMode || 'cover');
  const [rotation, setRotation] = useState<RotationDeg>(initialPrefs.rotation ?? 0);
  const [mirror, setMirror] = useState(initialPrefs.mirror ?? true);
  const [flipVertical, setFlipVertical] = useState(initialPrefs.flipVertical ?? false);
  const [frozen, setFrozen] = useState(false);

  // Digital Zoom & Pan
  const [zoom, setZoom] = useState(initialPrefs.zoom ?? 1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  // Manual Focus, Area Selection & Stabilization
  const [focus, setFocus] = useState<FocusSettings>(() => ({
    ...DEFAULT_FOCUS_SETTINGS,
    ...initialPrefs.focus,
    selectingArea: false,
  }));
  const [stabilization, setStabilization] = useState<StabilizationSettings>(() => ({
    ...DEFAULT_STABILIZATION_SETTINGS,
    ...initialPrefs.stabilization,
  }));

  // Real-time Filters, Visual Effects & Background Segmentation
  const [filterId, setFilterId] = useState<FilterPresetId>(initialPrefs.filterId || 'none');
  const [effectId, setEffectId] = useState<VisualEffectId>(initialPrefs.effectId || 'none');
  const [background, setBackground] = useState<BackgroundSegmentationSettings>(() => ({
    ...DEFAULT_BACKGROUND_SETTINGS,
    ...initialPrefs.background,
    customImageUrl: null,
    hasCalibratedBg: false,
  }));
  const [adjustments, setAdjustments] = useState<ColorAdjustments>(() => ({
    ...DEFAULT_ADJUSTMENTS,
    ...initialPrefs.adjustments,
  }));
  const [abSplitEnabled, setAbSplitEnabled] = useState(false);
  const [abSplitPosition, setAbSplitPosition] = useState(0.5);

  // Ring Light
  const [ringLight, setRingLight] = useState<RingLightSettings>(() => ({
    enabled: false,
    intensity: 75,
    temperature: 'warm',
    thickness: 44,
    ...initialPrefs.ringLight,
  }));

  // Capture & Photo Booth
  const [timerSeconds, setTimerSeconds] = useState(initialPrefs.timerSeconds ?? 0);
  const [flashEnabled, setFlashEnabled] = useState(initialPrefs.flashEnabled ?? false);
  const [soundMuted, setSoundMuted] = useState(initialPrefs.soundMuted ?? false);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [flashActive, setFlashActive] = useState(false);
  const [boothProgress, setBoothProgress] = useState<{ current: number; total: number } | null>(null);

  // Timelapse
  const [timelapseActive, setTimelapseActive] = useState(false);
  const [timelapseIntervalSec, setTimelapseIntervalSec] = useState(5);
  const [timelapseCount, setTimelapseCount] = useState(0);

  // Motion Detection
  const [motionActive, setMotionActive] = useState(false);
  const [motionSensitivity, setMotionSensitivity] = useState(20);
  const [motionScore, setMotionScore] = useState(0);
  const [motionEvents, setMotionEvents] = useState<MotionEvent[]>([]);
  const lastMotionCaptureRef = useRef<number>(0);

  // Video Recording, Format & Web Audio Console
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const appearance = useAppearance(isRecording);
  const [recordingFormatPref, setRecordingFormatPref] = useState<RecordingFormatPref>(
    initialPrefs.recordingFormatPref || 'auto-mp4'
  );
  const [audioConsole, setAudioConsole] = useState<AudioConsoleSettings>(() => ({
    ...DEFAULT_AUDIO_CONSOLE_SETTINGS,
    ...initialPrefs.audioConsole,
  }));
  const [micMuted, setMicMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  // Screen Share PiP, Dual Camera & Floating Output PiP
  const [isScreenPipActive, setIsScreenPipActive] = useState(false);
  const [screenLayout, setScreenLayout] = useState<ScreenLayoutMode>(
    initialPrefs.screenLayout || 'pip'
  );
  const [pipCorner, setPipCorner] = useState<
    'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  >(initialPrefs.pipCorner || 'bottom-right');
  const [pipCircular, setPipCircular] = useState(initialPrefs.pipCircular ?? true);
  const [pipSizeRatio, setPipSizeRatio] = useState(initialPrefs.pipSizeRatio ?? 0.24);
  const [dualCam, setDualCam] = useState<DualCameraSettings>(DEFAULT_DUAL_CAMERA_SETTINGS);
  const [isOutputPipActive, setIsOutputPipActive] = useState(false);

  // Teleprompter
  const [teleprompter, setTeleprompter] = useState<TeleprompterSettings>({
    enabled: false,
    playing: false,
    text: 'Bienvenidos a Óptica Studio.\n\nMira directamente hacia la cámara de tu MacBook mientras lees tu guion con fluidez.\n\nPuedes ajustar la velocidad de desplazamiento, el tamaño de la tipografía y aplicar filtros cinematográficos en tiempo real.',
    speed: 2,
    fontSize: 22,
    opacity: 72,
  });

  // Utilities & Overlays
  const [gridOverlay, setGridOverlay] = useState<GridOverlayId>(
    initialPrefs.gridOverlay || 'none'
  );
  const [branding, setBranding] = useState<OverlayBranding>(() => ({
    showTimestamp: false,
    showLowerThird: false,
    lowerThirdName: 'Estudio MacBook',
    lowerThirdTitle: 'Transmisión en directo',
    cinemaFrame: false,
    ...initialPrefs.branding,
  }));
  const [showHistogram, setShowHistogram] = useState(initialPrefs.showHistogram ?? true);
  const [histogram, setHistogram] = useState<HistogramData | null>(null);
  const [eyedropperActive, setEyedropperActive] = useState(false);
  const [sampledColor, setSampledColor] = useState<SampledColor | null>(null);
  const [qrScanning, setQrScanning] = useState(false);
  const [lastQrResult, setLastQrResult] = useState<string | null>(null);

  // Real-time AI Subject Recognition & Segmentation Status
  const [detectedSubjects, setDetectedSubjects] = useState<AiSubjectBox[]>([]);
  const [aiStatus, setAiStatus] = useState<{
    segmenter: AiVisionStatus;
    detector: AiVisionStatus;
  }>(() => getAiVisionStatus());

  // Gallery & Toast
  const [galleryItems, setGalleryItems] = useState<CapturedMediaItem[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Refs for DOM elements & live streams
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoElRef = useRef<HTMLVideoElement | null>(null);
  const secondaryVideoElRef = useRef<HTMLVideoElement | null>(null);
  const outputPipVideoRef = useRef<HTMLVideoElement | null>(null);
  const unavailableCameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const processedCameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const processedCameraVersionRef = useRef<number>(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const secondaryStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const recordingStartRef = useRef<number>(0);
  const audioAnalyserRef = useRef<{
    ctx: AudioContext;
    analyser: AnalyserNode;
    gainNode: GainNode;
    compressorNode: DynamicsCompressorNode;
    dest: MediaStreamAudioDestinationNode;
    micSource: MediaStreamAudioSourceNode;
    screenAudioSource?: MediaStreamAudioSourceNode;
    displayAudioSources?: Map<string, MediaStreamAudioSourceNode>;
    data: Uint8Array<ArrayBuffer>;
  } | null>(null);

  const initialEngineMode = useMemo(() => readPersistedEngineMode(), []);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  const studioEngine = useStudioEngine({
    resolutionPreset,
    aspectRatio,
    fps: 30,
    initialMode: initialEngineMode,
    persistModePreference: true,
    onRecordingSafetyStop: (reason) => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Ignore stop errors
        }
      }
      setIsRecording(false);
      setIsRecordingPaused(false);
      showToast(reason);
    },
  });

  const engineModeRef = useRef<EngineMode>(studioEngine.engineMode);
  engineModeRef.current = studioEngine.engineMode;
  const studioEngineRef = useRef(studioEngine);
  studioEngineRef.current = studioEngine;

  useEffect(() => {
    studioEngine.setRecordingLocked(isRecording);
  }, [isRecording, studioEngine.setRecordingLocked]);

  const getOutputCaptureCanvas = useCallback((): HTMLCanvasElement | null => {
    if (engineModeRef.current === 'studio') {
      return studioEngineRef.current.getProgramCanvas() ?? canvasRef.current;
    }
    return canvasRef.current;
  }, []);

  const [selectedStudioLayerId, setSelectedStudioLayerId] = useState<string | null>(null);

  const activeStudioScene = useMemo(
    () =>
      studioEngine.scenes.find((s) => s.id === studioEngine.activeSceneId) ?? null,
    [studioEngine.scenes, studioEngine.activeSceneId]
  );

  useEffect(() => {
    if (studioEngine.engineMode !== 'studio') {
      setSelectedStudioLayerId(null);
      return;
    }
    if (!selectedStudioLayerId) return;
    const stillValid = activeStudioScene?.layers.some(
      (l) => l.id === selectedStudioLayerId && l.visible
    );
    if (!stillValid) {
      setSelectedStudioLayerId(null);
    }
  }, [studioEngine.engineMode, activeStudioScene, selectedStudioLayerId]);

  const dims = useMemo(
    () => getDimensions(resolutionPreset, aspectRatio, sensorSize),
    [resolutionPreset, aspectRatio, sensorSize]
  );

  const qrSupported = useMemo(
    () => typeof window !== 'undefined' && 'BarcodeDetector' in window,
    []
  );

  // Load persisted gallery items on mount
  useEffect(() => {
    loadAllMediaItems().then((items) => {
      if (items.length > 0) setGalleryItems(items);
    });
  }, []);

  // Subscribe to MediaPipe AI model status and warm up models when needed
  useEffect(() => {
    const unsub = subscribeAiStatus(() => {
      setAiStatus(getAiVisionStatus());
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (focus.aiTrackingEnabled || focus.aiAutoFocus) {
      void ensureAiFaceDetector();
    }
  }, [focus.aiTrackingEnabled, focus.aiAutoFocus]);

  useEffect(() => {
    if (background.mode === 'transparent' || ((background.mode !== 'none' || activeTab === 'filters') && background.useAi)) {
      void ensureAiSegmenter();
    }
    resetAiSegmentationTemporalBuffer();
  }, [background.mode, background.useAi, activeTab]);

  const refreshDevices = useCallback(async (): Promise<{
    vids: MediaDeviceInfo[];
    auds: MediaDeviceInfo[];
  }> => {
    if (!navigator.mediaDevices?.enumerateDevices) return { vids: [], auds: [] };
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const vids = devices.filter((d) => d.kind === 'videoinput');
      const auds = devices.filter((d) => d.kind === 'audioinput');
      setVideoDevices(vids);
      setAudioDevices(auds);
      return { vids, auds };
    } catch {
      return { vids: [], auds: [] };
    }
  }, []);

  // Persist user preferences in localStorage
  useEffect(() => {
    try {
      const payload: PersistedStudioPrefs = {
        resolutionPreset,
        aspectRatio,
        fitMode,
        rotation,
        mirror,
        flipVertical,
        zoom,
        focus: {
          mode: focus.mode,
          manualDistance: focus.manualDistance,
          apertureBlur: focus.apertureBlur,
          areaSize: focus.areaSize,
          peakingEnabled: focus.peakingEnabled,
          aiTrackingEnabled: focus.aiTrackingEnabled,
          aiAutoFocus: focus.aiAutoFocus,
        },
        stabilization,
        filterId,
        effectId,
        adjustments,
        background: {
          ...background,
          customImageUrl: null,
          hasCalibratedBg: false,
        },
        ringLight,
        branding,
        audioConsole,
        recordingFormatPref,
        gridOverlay,
        showHistogram,
        screenLayout,
        pipCorner,
        pipCircular,
        pipSizeRatio,
        soundMuted,
        flashEnabled,
        timerSeconds,
      };
      window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }, [
    resolutionPreset,
    aspectRatio,
    fitMode,
    rotation,
    mirror,
    flipVertical,
    zoom,
    focus,
    stabilization,
    filterId,
    effectId,
    adjustments,
    background,
    ringLight,
    branding,
    audioConsole,
    recordingFormatPref,
    gridOverlay,
    showHistogram,
    screenLayout,
    pipCorner,
    pipCircular,
    pipSizeRatio,
    soundMuted,
    flashEnabled,
    timerSeconds,
  ]);

  const resetAllPreferences = useCallback(() => {
    try {
      window.localStorage.removeItem(PREFS_STORAGE_KEY);
    } catch {
      // Ignore
    }
    clearBackgroundCalibration();
    setResolutionPreset('max');
    setAspectRatio('16:9');
    setFitMode('cover');
    setRotation(0);
    setMirror(true);
    setFlipVertical(false);
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setFocus(DEFAULT_FOCUS_SETTINGS);
    setStabilization(DEFAULT_STABILIZATION_SETTINGS);
    setFilterId('none');
    setEffectId('none');
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setBackground(DEFAULT_BACKGROUND_SETTINGS);
    setRingLight({ enabled: false, intensity: 75, temperature: 'warm', thickness: 44 });
    setBranding({
      showTimestamp: false,
      showLowerThird: false,
      lowerThirdName: 'Estudio MacBook',
      lowerThirdTitle: 'Transmisión en directo',
      cinemaFrame: false,
    });
    setAudioConsole(DEFAULT_AUDIO_CONSOLE_SETTINGS);
    setRecordingFormatPref('auto-mp4');
    setGridOverlay('none');
    setShowHistogram(true);
    setScreenLayout('pip');
    setPipCorner('bottom-right');
    setPipCircular(true);
    setPipSizeRatio(0.24);
    setSoundMuted(false);
    setFlashEnabled(false);
    setTimerSeconds(0);
    showToast('Ajustes restablecidos a valores de fábrica');
  }, [showToast]);

  const setupAudioAnalyser = useCallback((stream: MediaStream) => {
    if (audioAnalyserRef.current) {
      audioAnalyserRef.current.ctx.close().catch(() => {});
      audioAnalyserRef.current = null;
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const micSource = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      const compressorNode = ctx.createDynamicsCompressor();
      const analyser = ctx.createAnalyser();
      const dest = ctx.createMediaStreamDestination();
      analyser.fftSize = 256;

      micSource.connect(gainNode);
      gainNode.connect(compressorNode);
      compressorNode.connect(analyser);
      analyser.connect(dest);

      const data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      audioAnalyserRef.current = {
        ctx,
        analyser,
        gainNode,
        compressorNode,
        dest,
        micSource,
        data,
      };
    } catch {
      // AudioContext unavailable
    }
  }, []);

  const startCameraStream = useCallback(
    async (
      videoId?: string,
      audioId?: string,
      resPreset: ResolutionPresetId = resolutionPreset,
      targetAspect: AspectRatioId = aspectRatio
    ) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus('error');
        setCameraErrorMsg('La cámara no está disponible en este entorno.');
        return;
      }

      // Stop previous tracks cleanly
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      const isPortraitTarget = targetAspect === '9:16';
      const baseH =
        resPreset === 'max' || resPreset === '4k'
          ? 2160
          : resPreset === '1080p'
            ? 1080
            : 720;
      const baseW =
        resPreset === 'max' || resPreset === '4k'
          ? 3840
          : resPreset === '1080p'
            ? 1920
            : 1280;

      const idealAspect =
        targetAspect === '9:16'
          ? 9 / 16
          : targetAspect === '4:3'
            ? 4 / 3
            : targetAspect === '1:1'
              ? 1
              : 16 / 9;

      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: videoId ? { exact: videoId } : undefined,
          width: { ideal: isPortraitTarget ? baseH : baseW },
          height: { ideal: isPortraitTarget ? baseW : baseH },
          aspectRatio: { ideal: idealAspect },
          frameRate: { ideal: 30 },
        },
        audio: audioId
          ? { deviceId: { exact: audioId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true },
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        mediaStreamRef.current = stream;

        if (!videoElRef.current) {
          const v = document.createElement('video');
          v.playsInline = true;
          v.muted = true;
          videoElRef.current = v;
        }
        videoElRef.current.srcObject = stream;
        await videoElRef.current.play();

        const vidW = videoElRef.current.videoWidth;
        const vidH = videoElRef.current.videoHeight;
        if (vidW > 0 && vidH > 0) {
          setSensorSize({ w: vidW, h: vidH });
        }

        const vTrack = stream.getVideoTracks()[0];
        const aTrack = stream.getAudioTracks()[0];
        const vSettings = vTrack?.getSettings ? vTrack.getSettings() : {};
        const aSettings = aTrack?.getSettings ? aTrack.getSettings() : {};

        if (vTrack) {
          setCameraLabel(vTrack.label || 'Cámara MacBook');
          const caps = vTrack.getCapabilities ? vTrack.getCapabilities() : {};
          setHardwareFocusSupported('focusMode' in caps || 'focusDistance' in caps);
          if (vSettings.width && vSettings.height && (!vidW || !vidH)) {
            setSensorSize({ w: vSettings.width, h: vSettings.height });
          }
        }

        const { vids } = await refreshDevices();
        const activeVidId = vSettings.deviceId || videoId || '';
        const activeAudId = aSettings.deviceId || audioId || '';
        if (activeVidId) setSelectedVideoId(activeVidId);
        if (activeAudId) setSelectedAudioId(activeAudId);

        // On macOS, Continuity Camera (iPhone) or virtual cameras can hijack default and stream vertically.
        // If no specific camera was requested yet, automatically switch to the MacBook's built-in landscape camera.
        if (!videoId && vTrack && vids.length > 1) {
          const label = vTrack.label || '';
          const isPortraitFeed = vidW > 0 && vidH > 0 && vidW < vidH;
          const isSecondaryOrPhoneCam =
            /iphone|ipad|continuity|desk view|obs|virtual|snap|epoccam|camo/i.test(label);

          if (isSecondaryOrPhoneCam || isPortraitFeed) {
            const macCam = vids.find(
              (d) =>
                d.deviceId !== activeVidId &&
                /facetime|macbook|built-in|isight|integrated|studio display/i.test(d.label) &&
                !/iphone|ipad|continuity|desk view|obs|virtual/i.test(d.label)
            );
            if (macCam?.deviceId) {
              return startCameraStream(macCam.deviceId, activeAudId || audioId, resPreset, targetAspect);
            }
          }
        }

        setupAudioAnalyser(stream);
        setCameraStatus('live');
        setCameraErrorMsg(null);
      } catch (err) {
        // Report camera errors without synthetic camera content
        setCameraStatus('error');
        const msg =
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Permiso de cámara denegado. Revisa Privacidad y seguridad de macOS.'
            : 'No se detectó una cámara activa. Conecta o selecciona una cámara.';
        setCameraErrorMsg(msg);
      }
    },
    [aspectRatio, refreshDevices, resolutionPreset, setupAudioAnalyser]
  );

  // Initialize camera on mount only when starting in Legacy mode (no race with Studio Engine)
  useEffect(() => {
    if (initialEngineMode !== 'studio') {
      startCameraStream();
    } else {
      void refreshDevices();
    }
    return () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      secondaryStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioAnalyserRef.current?.ctx.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync camera/audio UI status when Studio Engine owns live hardware
  useEffect(() => {
    if (studioEngine.engineMode !== 'studio') return;
    if (studioEngine.hasLiveCameraSource) {
      setCameraStatus('live');
      setCameraErrorMsg(null);
      const vid = studioEngine.getActiveCameraVideoElement();
      if (vid && vid.videoWidth > 0 && vid.videoHeight > 0) {
        setSensorSize({ w: vid.videoWidth, h: vid.videoHeight });
      }
      void refreshDevices();
    } else if (cameraStatus === 'live') {
      setCameraStatus('idle');
    }
    if (!audioAnalyserRef.current) {
      const tracks = studioEngine.getActiveAudioMediaTracks();
      if (tracks.length > 0 && typeof MediaStream !== 'undefined') {
        setupAudioAnalyser(new MediaStream(tracks));
      }
    }
  }, [
    studioEngine.engineMode,
    studioEngine.hasLiveCameraSource,
    studioEngine.sources,
    cameraStatus,
    refreshDevices,
    setupAudioAnalyser,
    studioEngine,
  ]);

  // Apply hardware focus constraints if supported by MacBook/USB camera
  useEffect(() => {
    const stream = mediaStreamRef.current;
    if (!stream || !hardwareFocusSupported) return;
    const vTrack = stream.getVideoTracks()[0];
    if (!vTrack?.applyConstraints) return;

    const caps = vTrack.getCapabilities() as MediaTrackCapabilities & {
      focusMode?: string[];
      focusDistance?: { min: number; max: number };
    };

    const advanced: Record<string, unknown> = {};
    if (caps.focusMode) {
      if (focus.mode === 'manual' && caps.focusMode.includes('manual')) {
        advanced.focusMode = 'manual';
      } else if (focus.mode === 'auto' && caps.focusMode.includes('continuous')) {
        advanced.focusMode = 'continuous';
      }
    }
    if (focus.mode === 'manual' && caps.focusDistance) {
      const { min, max } = caps.focusDistance;
      advanced.focusDistance = min + (focus.manualDistance / 100) * (max - min);
    }

    if (Object.keys(advanced).length > 0) {
      vTrack.applyConstraints({ advanced: [advanced as MediaTrackConstraintSet] }).catch(() => {});
    }
  }, [focus.mode, focus.manualDistance, focus.areaX, focus.areaY, hardwareFocusSupported]);

  // Sync microphone mute, gain (0–200%), and DynamicsCompressor voice leveling
  useEffect(() => {
    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !micMuted;
      });
    }
    for (const track of studioEngine.getActiveAudioMediaTracks()) {
      track.enabled = !micMuted;
    }
    const graph = audioAnalyserRef.current;
    if (graph) {
      const targetGain = micMuted ? 0 : Math.max(0, Math.min(2, audioConsole.micGain / 100));
      graph.gainNode.gain.setTargetAtTime(targetGain, graph.ctx.currentTime, 0.02);
      if (audioConsole.compressorEnabled) {
        graph.compressorNode.threshold.setValueAtTime(-24, graph.ctx.currentTime);
        graph.compressorNode.knee.setValueAtTime(18, graph.ctx.currentTime);
        graph.compressorNode.ratio.setValueAtTime(6, graph.ctx.currentTime);
        graph.compressorNode.attack.setValueAtTime(0.004, graph.ctx.currentTime);
        graph.compressorNode.release.setValueAtTime(0.2, graph.ctx.currentTime);
      } else {
        graph.compressorNode.threshold.setValueAtTime(0, graph.ctx.currentTime);
        graph.compressorNode.knee.setValueAtTime(0, graph.ctx.currentTime);
        graph.compressorNode.ratio.setValueAtTime(1, graph.ctx.currentTime);
      }
    }
  }, [micMuted, audioConsole.micGain, audioConsole.compressorEnabled, studioEngine]);

  // Dual Camera simultaneous stream lifecycle
  useEffect(() => {
    if (!dualCam.enabled) {
      if (secondaryStreamRef.current) {
        secondaryStreamRef.current.getTracks().forEach((t) => t.stop());
        secondaryStreamRef.current = null;
      }
      if (secondaryVideoElRef.current) {
        secondaryVideoElRef.current.srcObject = null;
      }
      return;
    }

    let cancelled = false;
    const startSecondary = async () => {
      if (!navigator.mediaDevices?.getUserMedia) return;
      const targetId =
        dualCam.deviceId ||
        videoDevices.find((d) => d.deviceId !== selectedVideoId)?.deviceId ||
        '';
      if (!targetId) {
        showToast('Conecta una segunda cámara (iPhone o USB) para usar Doble Cámara');
        setDualCam((p) => ({ ...p, enabled: false }));
        return;
      }

      if (secondaryStreamRef.current) {
        secondaryStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      try {
        const sStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: targetId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          sStream.getTracks().forEach((t) => t.stop());
          return;
        }
        secondaryStreamRef.current = sStream;
        if (!secondaryVideoElRef.current) {
          const sv = document.createElement('video');
          sv.playsInline = true;
          sv.muted = true;
          secondaryVideoElRef.current = sv;
        }
        secondaryVideoElRef.current.srcObject = sStream;
        await secondaryVideoElRef.current.play();
      } catch {
        if (!cancelled) {
          showToast('No se pudo abrir la segunda cámara');
          setDualCam((p) => ({ ...p, enabled: false }));
        }
      }
    };

    void startSecondary();
    return () => {
      cancelled = true;
    };
  }, [dualCam.enabled, dualCam.deviceId, selectedVideoId, videoDevices, showToast]);

  const swapCameras = useCallback(async () => {
    if (videoDevices.length < 2) {
      showToast('Se necesitan al menos 2 cámaras conectadas para intercambiar');
      return;
    }
    const nextPrimary =
      dualCam.deviceId || videoDevices.find((d) => d.deviceId !== selectedVideoId)?.deviceId || '';
    if (!nextPrimary) return;
    const prevPrimary = selectedVideoId;

    if (secondaryStreamRef.current) {
      secondaryStreamRef.current.getTracks().forEach((t) => t.stop());
      secondaryStreamRef.current = null;
    }
    if (secondaryVideoElRef.current) {
      secondaryVideoElRef.current.srcObject = null;
    }

    setSelectedVideoId(nextPrimary);
    await startCameraStream(nextPrimary, selectedAudioId, resolutionPreset, aspectRatio);
    setDualCam((p) => ({ ...p, enabled: true, deviceId: prevPrimary }));
    showToast('Planos de cámara intercambiados');
  }, [
    videoDevices,
    dualCam.deviceId,
    selectedVideoId,
    selectedAudioId,
    resolutionPreset,
    aspectRatio,
    startCameraStream,
    showToast,
  ]);

  // Audio level polling
  useEffect(() => {
    const id = window.setInterval(() => {
      if ((micMuted && !isScreenPipActive) || !audioAnalyserRef.current) {
        setAudioLevel(0);
        return;
      }
      const { analyser, data } = audioAnalyserRef.current;
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length;
      setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
    }, 80);
    return () => clearInterval(id);
  }, [micMuted, isScreenPipActive]);

  // Capture Single Filtered Frame Helper (reads clean ProgramCanvas in Studio mode)
  const captureCurrentCanvasItem = useCallback(
    async (
      customLabel?: string,
      type: 'photo' | 'booth' = 'photo'
    ): Promise<CapturedMediaItem | null> => {
      const canvas = getOutputCaptureCanvas();
      if (!canvas) return null;

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );
      if (!blob) return null;

      const item: CapturedMediaItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        url: URL.createObjectURL(blob),
        blob,
        mimeType: 'image/png',
        createdAt: Date.now(),
        width: canvas.width,
        height: canvas.height,
        filterId,
        effectId,
        label:
          customLabel ||
          `Captura ${new Date().toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}`,
      };

      setGalleryItems((prev) => [item, ...prev]);
      await saveMediaItem(item);
      return item;
    },
    [filterId, effectId, getOutputCaptureCanvas]
  );

  // Trigger single shot with optional timer & flash
  const triggerPhotoCapture = useCallback(
    async (customLabel?: string) => {
      if (timerSeconds > 0 && countdownValue === null) {
        for (let s = timerSeconds; s >= 1; s--) {
          setCountdownValue(s);
          playCountdownBeep(false, soundMuted);
          await new Promise((r) => setTimeout(r, 1000));
        }
        setCountdownValue(null);
      }

      if (flashEnabled) {
        setFlashActive(true);
        await new Promise((r) => setTimeout(r, 140));
      }

      playShutterSound(soundMuted);
      const item = await captureCurrentCanvasItem(customLabel);
      setFlashActive(false);

      if (item) {
        showToast('Fotografía guardada en la galería');
      }
    },
    [timerSeconds, countdownValue, soundMuted, flashEnabled, captureCurrentCanvasItem, showToast]
  );

  // Photo Booth 4-Strip Sequence
  const startPhotoBooth = useCallback(
    async (theme: 'dark' | 'polaroid') => {
      if (boothProgress) return;
      const frames: HTMLCanvasElement[] = [];

      for (let shot = 1; shot <= 4; shot++) {
        setBoothProgress({ current: shot, total: 4 });
        for (let s = 3; s >= 1; s--) {
          setCountdownValue(s);
          playCountdownBeep(false, soundMuted);
          await new Promise((r) => setTimeout(r, 700));
        }
        setCountdownValue(null);
        if (flashEnabled) {
          setFlashActive(true);
          await new Promise((r) => setTimeout(r, 100));
        }
        playShutterSound(soundMuted);
        setFlashActive(false);

        const activeCaptureCanvas = getOutputCaptureCanvas();
        if (activeCaptureCanvas) {
          const snap = document.createElement('canvas');
          snap.width = activeCaptureCanvas.width;
          snap.height = activeCaptureCanvas.height;
          snap.getContext('2d')?.drawImage(activeCaptureCanvas, 0, 0);
          frames.push(snap);
        }
        await new Promise((r) => setTimeout(r, 400));
      }

      setBoothProgress(null);
      if (frames.length === 4) {
        const frameW = 720;
        const frameH = Math.round(frameW * (frames[0].height / frames[0].width));
        const pad = 32;
        const footerH = 84;
        const totalW = frameW + pad * 2;
        const totalH = pad + (frameH + 22) * 4 + footerH;

        const strip = document.createElement('canvas');
        strip.width = totalW;
        strip.height = totalH;
        const sCtx = strip.getContext('2d');
        if (sCtx) {
          sCtx.fillStyle = theme === 'polaroid' ? '#f8fafc' : '#0b0b0e';
          sCtx.fillRect(0, 0, totalW, totalH);

          frames.forEach((f, idx) => {
            const y = pad + idx * (frameH + 22);
            sCtx.drawImage(f, pad, y, frameW, frameH);
          });

          sCtx.fillStyle = theme === 'polaroid' ? '#18181b' : '#f4f4f5';
          sCtx.font = '700 22px "Plus Jakarta Sans", sans-serif';
          sCtx.fillText('Óptica Studio · Photo Booth', pad, totalH - 42);
          sCtx.fillStyle = theme === 'polaroid' ? '#52525b' : '#a1a1aa';
          sCtx.font = '500 14px "JetBrains Mono", monospace';
          sCtx.fillText(new Date().toLocaleString('es-ES'), pad, totalH - 18);

          const blob = await new Promise<Blob | null>((res) =>
            strip.toBlob((b) => res(b), 'image/png')
          );
          if (blob) {
            const item: CapturedMediaItem = {
              id: `${Date.now()}-booth`,
              type: 'booth',
              url: URL.createObjectURL(blob),
              blob,
              mimeType: 'image/png',
              createdAt: Date.now(),
              width: totalW,
              height: totalH,
              filterId,
              effectId,
              label: 'Tira Photo Booth (4×)',
            };
            setGalleryItems((prev) => [item, ...prev]);
            await saveMediaItem(item);
            showToast('Tira Photo Booth guardada en la galería');
          }
        }
      }
    },
    [boothProgress, soundMuted, flashEnabled, filterId, effectId, getOutputCaptureCanvas, showToast]
  );

  // Burst Capture (5 rapid shots)
  const startBurst = useCallback(async () => {
    for (let i = 1; i <= 5; i++) {
      playShutterSound(soundMuted);
      await captureCurrentCanvasItem(`Ráfaga ${i}/5`);
      await new Promise((r) => setTimeout(r, 280));
    }
    showToast('Ráfaga de 5 fotos guardada');
  }, [soundMuted, captureCurrentCanvasItem, showToast]);

  // Timelapse Intervalometer
  useEffect(() => {
    if (!timelapseActive) return;
    const id = window.setInterval(async () => {
      playShutterSound(soundMuted);
      setTimelapseCount((c) => {
        const next = c + 1;
        captureCurrentCanvasItem(`Time-Lapse #${next}`);
        return next;
      });
    }, timelapseIntervalSec * 1000);
    return () => clearInterval(id);
  }, [timelapseActive, timelapseIntervalSec, soundMuted, captureCurrentCanvasItem]);

  // Video Recording (Canvas + Web Audio Mixer + MP4/WebM)
  const toggleRecording = useCallback(() => {
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsRecordingPaused(false);
      return;
    }

    const canvas = getOutputCaptureCanvas();
    if (!canvas || typeof MediaRecorder === 'undefined') {
      showToast('Grabación de video no soportada en este navegador');
      return;
    }

    const captureFps = engineModeRef.current === 'studio' ? 30 : 60;
    const canvasStream = canvas.captureStream(captureFps);
    const combinedTracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
    if (audioAnalyserRef.current) {
      if (audioAnalyserRef.current.ctx.state === 'suspended') {
        void audioAnalyserRef.current.ctx.resume();
      }
      combinedTracks.push(...audioAnalyserRef.current.dest.stream.getAudioTracks());
    } else if (!micMuted) {
      const fallbackAudioTracks =
        engineModeRef.current === 'studio'
          ? studioEngineRef.current.getActiveAudioMediaTracks()
          : mediaStreamRef.current?.getAudioTracks() ?? [];
      combinedTracks.push(...fallbackAudioTracks);
    }
    const combinedStream = new MediaStream(combinedTracks);

    const mp4Candidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4;codecs=h264',
      'video/mp4',
    ];
    const webmCandidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    const mimeCandidates =
      recordingFormatPref === 'auto-mp4'
        ? [...mp4Candidates, ...webmCandidates]
        : webmCandidates;

    const chosenMime =
      mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

    try {
      const recorder = chosenMime
        ? new MediaRecorder(combinedStream, {
            mimeType: chosenMime,
            videoBitsPerSecond: 14_000_000,
          })
        : new MediaRecorder(combinedStream, { videoBitsPerSecond: 14_000_000 });

      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const finalMime = chosenMime || 'video/webm';
        const blob = new Blob(recordedChunksRef.current, {
          type: finalMime,
        });
        const actualMime = blob.type || finalMime;
        const isMp4 = actualMime.toLowerCase().includes('mp4');
        const duration = Math.max(
          1,
          Math.round((Date.now() - recordingStartRef.current) / 1000)
        );
        const item: CapturedMediaItem = {
          id: `${Date.now()}-vid`,
          type: 'video',
          url: URL.createObjectURL(blob),
          blob,
          mimeType: actualMime,
          createdAt: Date.now(),
          width: canvas.width,
          height: canvas.height,
          durationSec: duration,
          filterId,
          effectId,
          label: `Video ${isMp4 ? 'MP4' : 'WebM'} (${duration}s)`,
        };
        setGalleryItems((prev) => [item, ...prev]);
        await saveMediaItem(item);
        showToast(`Video ${isMp4 ? 'MP4' : 'WebM'} guardado en la galería`);
      };

      recordingStartRef.current = Date.now();
      setRecordingSeconds(0);
      mediaRecorderRef.current = recorder;
      recorder.start(500);
      setIsRecording(true);
      setIsRecordingPaused(false);
    } catch {
      showToast('No se pudo iniciar la grabación de video');
    }
  }, [isRecording, micMuted, recordingFormatPref, filterId, effectId, getOutputCaptureCanvas, showToast]);

  const togglePauseRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec || !isRecording) return;
    if (rec.state === 'recording') {
      rec.pause();
      setIsRecordingPaused(true);
    } else if (rec.state === 'paused') {
      rec.resume();
      setIsRecordingPaused(false);
    }
  }, [isRecording]);

  // Recording clock
  useEffect(() => {
    if (!isRecording || isRecordingPaused) return;
    const id = window.setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [isRecording, isRecordingPaused]);

  const routeDisplayAudioToMixer = useCallback(
    (sStream: MediaStream, sourceKey = 'legacy-display') => {
      if (sStream.getAudioTracks().length === 0 || !audioAnalyserRef.current) return;
      const graph = audioAnalyserRef.current;
      if (!graph.displayAudioSources) {
        graph.displayAudioSources = new Map();
      }
      const prevNode = graph.displayAudioSources.get(sourceKey);
      if (prevNode) {
        try {
          prevNode.disconnect();
        } catch {
          // Ignore
        }
        graph.displayAudioSources.delete(sourceKey);
      }
      if (sourceKey === 'legacy-display' && graph.screenAudioSource) {
        try {
          graph.screenAudioSource.disconnect();
        } catch {
          // Ignore
        }
        graph.screenAudioSource = undefined;
      }
      try {
        const sSrc = graph.ctx.createMediaStreamSource(sStream);
        sSrc.connect(graph.analyser);
        sSrc.connect(graph.dest);
        graph.displayAudioSources.set(sourceKey, sSrc);
        if (sourceKey === 'legacy-display') {
          graph.screenAudioSource = sSrc;
        }
      } catch {
        // Ignore if display stream audio track cannot be routed
      }
    },
    []
  );

  // Screen Share + Camera PiP (+ optional shared system/tab audio into Web Audio mixer)
  const toggleScreenPip = useCallback(async () => {
    if (engineModeRef.current === 'studio') {
      const engine = studioEngineRef.current;
      const project = engine.getProject();
      const scene = project.scenes.find((s) => s.id === project.activeSceneId);
      if (!scene) {
        showToast('No hay una escena activa.');
        return;
      }
      const existing = [...scene.layers]
        .sort((a, b) => b.zIndex - a.zIndex)
        .find((l) =>
          l.visible &&
          project.sources.some(
            (s) => s.id === l.sourceId && (s.kind === 'screen' || s.kind === 'window')
          )
        );
      let entry;
      let layerId = existing?.id;
      if (existing) {
        entry =
          engine
            .getActiveSourceRuntimeEntries()
            .find((e) => e.source.id === existing.sourceId && e.state.status === 'live') ??
          (await engine.authorizeDisplaySource(existing.sourceId));
      } else {
        const result = await engine.addRealSourceToScene(scene.id, {
          kind: 'screen',
          includeSystemAudio: audioConsole.includeSystemAudio,
          placement: 'behind-camera',
        });
        if (!result.ok) {
          if (result.canceled) {
            showToast('Selección de pantalla cancelada.');
          } else {
            showToast(result.reason || 'No se pudo añadir la pantalla.');
          }
          return;
        }
        entry = result.entry;
        layerId = result.layer?.id;
      }
      if (entry?.state.status === 'live' && entry.resources.mediaStream) {
        routeDisplayAudioToMixer(
          entry.resources.mediaStream as MediaStream,
          entry.source.id
        );
        if (layerId) setSelectedStudioLayerId(layerId);
        appearance.updateLeftPanel({ expanded: true, activeSection: 'layers' });
        showToast('Pantalla conectada detrás de cámara');
      } else if (entry?.details.errorCode === 'user-canceled') {
        showToast('Selección de pantalla cancelada.');
      } else {
        showToast(
          entry?.state.errorMessage ||
            'No se pudo conectar la pantalla. Comprueba los permisos de macOS.'
        );
      }
      return;
    }

    if (isScreenPipActive) {
      if (audioAnalyserRef.current?.screenAudioSource) {
        try {
          audioAnalyserRef.current.screenAudioSource.disconnect();
        } catch {
          // Ignore
        }
        audioAnalyserRef.current.screenAudioSource = undefined;
      }
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      if (screenVideoElRef.current) screenVideoElRef.current.srcObject = null;
      setIsScreenPipActive(false);
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      showToast('Compartir pantalla no está disponible en este navegador');
      return;
    }

    try {
      const sStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: audioConsole.includeSystemAudio,
      });
      screenStreamRef.current = sStream;
      if (!screenVideoElRef.current) {
        const sv = document.createElement('video');
        sv.playsInline = true;
        sv.muted = true;
        screenVideoElRef.current = sv;
      }
      screenVideoElRef.current.srcObject = sStream;
      await screenVideoElRef.current.play();

      routeDisplayAudioToMixer(sStream);

      sStream.getVideoTracks()[0].onended = () => {
        if (audioAnalyserRef.current?.screenAudioSource) {
          try {
            audioAnalyserRef.current.screenAudioSource.disconnect();
          } catch {
            // Ignore
          }
          audioAnalyserRef.current.screenAudioSource = undefined;
        }
        setIsScreenPipActive(false);
        screenStreamRef.current = null;
      };
      setIsScreenPipActive(true);
    } catch (err) {
      const name = err instanceof Error ? err.name : 'Error';
      console.warn('[Optica] Display capture:', name);
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      if (screenVideoElRef.current) screenVideoElRef.current.srcObject = null;
      setIsScreenPipActive(false);
      showToast(name === 'NotAllowedError'
        ? 'Captura cancelada o permiso denegado. Revisa Privacidad y seguridad → Grabación de pantalla y audio del sistema.'
        : `No se pudo compartir pantalla (${name}). Intenta nuevamente.`);
    }
  }, [isScreenPipActive, audioConsole.includeSystemAudio, routeDisplayAudioToMixer, showToast, appearance.updateLeftPanel]);

  // Native System Floating Window (Output Picture-in-Picture)
  const toggleOutputPip = useCallback(async () => {
    if (typeof document === 'undefined' || !('pictureInPictureEnabled' in document)) {
      showToast('Ventana flotante PiP no soportada en este navegador');
      return;
    }
    if (document.pictureInPictureElement) {
      try {
        await document.exitPictureInPicture();
      } catch {
        // Ignore
      }
      setIsOutputPipActive(false);
      return;
    }

    const canvas = getOutputCaptureCanvas();
    const vid = outputPipVideoRef.current;
    if (!canvas || !vid || typeof vid.requestPictureInPicture !== 'function') {
      showToast('No se pudo abrir la ventana flotante del monitor');
      return;
    }

    try {
      const stream = canvas.captureStream(30);
      vid.srcObject = stream;
      await vid.play();
      await vid.requestPictureInPicture();
      setIsOutputPipActive(true);
    } catch {
      showToast('Activa permisos o haz clic de nuevo para abrir la ventana flotante');
    }
  }, [getOutputCaptureCanvas, showToast]);

  const handleAuthorizeStudioDisplaySource = useCallback(
    async (preferredSourceId?: string) => {
      if (engineModeRef.current !== 'studio') return;
      if (!preferredSourceId) {
        await toggleScreenPip();
        return;
      }
      const engine = studioEngineRef.current;
      const entry =
        (await engine.authorizeDisplaySource(preferredSourceId)) ??
        (await engine.reconnectSource(preferredSourceId, true));
      if (entry?.state.status === 'live' && entry.resources.mediaStream) {
        routeDisplayAudioToMixer(
          entry.resources.mediaStream as MediaStream,
          entry.source.id
        );
        const scene = engine.getProject().scenes.find((s) => s.id === engine.getProject().activeSceneId);
        const matchedLayer = scene?.layers.find((l) => l.sourceId === entry.source.id);
        if (matchedLayer) setSelectedStudioLayerId(matchedLayer.id);
        showToast(`Captura activa: ${entry.source.name}`);
      } else if (entry?.details.errorCode === 'user-canceled') {
        showToast('Selección cancelada · se conservó la fuente actual.');
      } else if (entry?.state.errorMessage) {
        showToast(entry.state.errorMessage);
      }
    },
    [routeDisplayAudioToMixer, showToast, toggleScreenPip]
  );

  const handleAddStudioDisplaySource = useCallback(
    async (kind: 'screen' | 'window') => {
      if (engineModeRef.current !== 'studio') return;
      const engine = studioEngineRef.current;
      const project = engine.getProject();
      const scene = project.scenes.find((s) => s.id === project.activeSceneId);
      if (!scene) {
        showToast('No hay una escena activa.');
        return;
      }
      const result = await engine.addRealSourceToScene(scene.id, {
        kind,
        includeSystemAudio: audioConsole.includeSystemAudio,
        placement: 'behind-camera',
      });
      if (!result.ok) {
        if (result.canceled) {
          showToast('Selección cancelada.');
        } else {
          showToast(
            result.reason ||
              (kind === 'window'
                ? 'No se pudo añadir la ventana.'
                : 'No se pudo añadir la pantalla.')
          );
        }
        return;
      }
      if (result.entry?.resources.mediaStream) {
        routeDisplayAudioToMixer(
          result.entry.resources.mediaStream as MediaStream,
          result.entry.source.id
        );
      }
      if (result.layer) {
        setSelectedStudioLayerId(result.layer.id);
      }
      showToast(`${result.source?.name ?? 'Fuente'} añadida detrás de la cámara`);
    },
    [audioConsole.includeSystemAudio, routeDisplayAudioToMixer, showToast]
  );

  const handleSwitchEngineMode = useCallback(
    async (nextMode: EngineMode) => {
      if (nextMode === studioEngine.engineMode) return;
      if (isRecording) {
        showToast('Detén la grabación activa antes de cambiar de motor');
        return;
      }

      if (nextMode === 'studio') {
        const camStream = mediaStreamRef.current;
        const scrStream = screenStreamRef.current;

        // Desactivar listener legacy antes de ceder la pista de ventana
        const scrVidTrack = scrStream?.getVideoTracks()[0];
        if (scrVidTrack) {
          scrVidTrack.onended = null;
        }

        if (dualCam.enabled) {
          setDualCam((p) => ({ ...p, enabled: false }));
        }

        const res = await studioEngine.activateStudioMode({
          cameraStream: camStream as unknown as MediaStreamLike | null,
          screenStream: scrStream as unknown as MediaStreamLike | null,
        });
        if (!res.ok) {
          showToast(res.reason || 'No se pudo activar Studio Engine');
          return;
        }

        // Entregar propiedad exclusiva de streams a SourceManager sin cerrarlos
        mediaStreamRef.current = null;
        screenStreamRef.current = null;
        if (videoElRef.current) videoElRef.current.srcObject = null;
        if (screenVideoElRef.current) screenVideoElRef.current.srcObject = null;
        setIsScreenPipActive(false);
        showToast('Studio Engine (Experimental) activado con ProgramCanvas');
        return;
      }

      const res = studioEngine.deactivateStudioMode();
      if (!res.ok) {
        showToast(res.reason || 'No se pudo volver a Legacy Engine');
        return;
      }

      studioEngine.setProcessedCameraSurface(null);
      setIsScreenPipActive(false);

      const handedTracks = [
        ...(res.handedBackCameraTracks ?? []),
        ...(res.handedBackMicTracks ?? []),
      ] as unknown as MediaStreamTrack[];

      if (handedTracks.length > 0 && typeof MediaStream !== 'undefined') {
        const restored = new MediaStream(handedTracks);
        mediaStreamRef.current = restored;
        if ((res.handedBackCameraTracks?.length ?? 0) > 0) {
          if (!videoElRef.current) {
            const v = document.createElement('video');
            v.playsInline = true;
            v.muted = true;
            videoElRef.current = v;
          }
          videoElRef.current.srcObject = restored;
          await videoElRef.current.play().catch(() => {});
          setCameraStatus('live');
          setCameraErrorMsg(null);
        } else {
          setCameraStatus('error');
        }
        if (!audioAnalyserRef.current && (res.handedBackMicTracks?.length ?? 0) > 0) {
          setupAudioAnalyser(restored);
        }
      } else {
        await startCameraStream(selectedVideoId, selectedAudioId, resolutionPreset, aspectRatio);
      }

      showToast('Legacy Engine (Estable) restaurado');
    },
    [
      studioEngine,
      isRecording,
      dualCam.enabled,
      selectedVideoId,
      selectedAudioId,
      resolutionPreset,
      aspectRatio,
      setupAudioAnalyser,
      startCameraStream,
      showToast,
    ]
  );

  const handleChangeStudioBackend = useCallback(
    (backend: PreferredCompositorBackend) => {
      const res = studioEngine.setBackendPreference(backend);
      if (!res.ok) {
        showToast(res.reason || 'No se puede cambiar el backend gráfico ahora');
        return;
      }
      showToast(`Backend Studio Engine: ${backend}`);
    },
    [studioEngine, showToast]
  );

  const handleRecoverStudioCanvas2d = useCallback(() => {
    const res = studioEngine.recoverLostContextWithCanvas2d();
    showToast(
      res.ok
        ? 'Superficie recuperada en respaldo Canvas 2D'
        : res.reason || 'Grabación detenida para reconstruir superficie'
    );
  }, [studioEngine, showToast]);

  useEffect(() => {
    const vid = outputPipVideoRef.current;
    if (!vid) return;
    const onLeave = () => {
      setIsOutputPipActive(false);
      if (vid.srcObject instanceof MediaStream) {
        vid.srcObject.getTracks().forEach((t) => t.stop());
      }
      vid.srcObject = null;
    };
    vid.addEventListener('leavepictureinpicture', onLeave);
    return () => vid.removeEventListener('leavepictureinpicture', onLeave);
  }, []);

  // One-click screenshot of another window/tab/screen saved directly to Gallery (or set as virtual background)
  const captureOtherWindowScreenshot = useCallback(
    async (setAsBackground = false) => {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        showToast('Captura de ventana no disponible en este navegador');
        return;
      }

      try {
        const tempStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30 },
          audio: false,
        });
        const track = tempStream.getVideoTracks()[0];
        const tempVideo = document.createElement('video');
        tempVideo.playsInline = true;
        tempVideo.muted = true;
        tempVideo.srcObject = tempStream;

        await new Promise<void>((resolve) => {
          tempVideo.onloadeddata = () => resolve();
          tempVideo.play().catch(() => resolve());
        });
        // Small settle frame so macOS WindowServer composites crisp content
        await new Promise((r) => setTimeout(r, 120));

        const w = tempVideo.videoWidth || 1920;
        const h = tempVideo.videoHeight || 1080;
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const oCtx = off.getContext('2d');
        if (oCtx) {
          oCtx.drawImage(tempVideo, 0, 0, w, h);
        }

        // Stop temporary display stream immediately after snapshot
        tempStream.getTracks().forEach((t) => t.stop());
        tempVideo.srcObject = null;

        const blob = await new Promise<Blob | null>((resolve) =>
          off.toBlob((b) => resolve(b), 'image/png')
        );
        if (!blob) return;

        playShutterSound(soundMuted);
        const url = URL.createObjectURL(blob);
        const trackName = track?.label ? ` (${track.label.slice(0, 26)})` : '';
        const item: CapturedMediaItem = {
          id: `${Date.now()}-screen`,
          type: 'screen',
          url,
          blob,
          mimeType: 'image/png',
          createdAt: Date.now(),
          width: w,
          height: h,
          filterId: 'none',
          effectId: 'none',
          label: `Ventana${trackName} · ${new Date().toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}`,
        };

        setGalleryItems((prev) => [item, ...prev]);
        await saveMediaItem(item);

        if (setAsBackground) {
          setBackground((p) => ({
            ...p,
            mode: 'image',
            imageId: 'custom',
            customImageUrl: url,
          }));
          showToast('Ventana capturada y aplicada como fondo IA');
        } else {
          showToast('Captura de ventana guardada en la galería');
        }
      } catch {
        // User cancelled window picker
      }
    },
    [soundMuted, showToast]
  );

  // Import external screenshots / images from files or macOS clipboard paste (Cmd+V)
  const importExternalScreenshots = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (list.length === 0) return;

      for (const file of list) {
        const url = URL.createObjectURL(file);
        const dimsImg = await new Promise<{ w: number; h: number }>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth || 1920, h: img.naturalHeight || 1080 });
          img.onerror = () => resolve({ w: 1920, h: 1080 });
          img.src = url;
        });

        const item: CapturedMediaItem = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-scr`,
          type: 'screen',
          url,
          blob: file,
          mimeType: file.type || 'image/png',
          createdAt: Date.now(),
          width: dimsImg.w,
          height: dimsImg.h,
          filterId: 'none',
          effectId: 'none',
          label:
            file.name && file.name !== 'image.png'
              ? file.name.replace(/\.[^.]+$/, '')
              : `Captura pegada ${new Date().toLocaleTimeString('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}`,
        };
        setGalleryItems((prev) => [item, ...prev]);
        await saveMediaItem(item);
      }
      showToast(
        list.length === 1
          ? 'Captura agregada a la galería'
          : `${list.length} capturas agregadas a la galería`
      );
    },
    [showToast]
  );

  // Global Cmd+V / Ctrl+V paste support for macOS screenshots from clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const f = items[i].getAsFile();
          if (f) imageFiles.push(f);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        void importExternalScreenshots(imageFiles);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [importExternalScreenshots]);

  // Decoupled 60fps Canvas Render Loop (never tears down when sliders/controls update)
  const renderStateRef = useRef({
    dims,
    sensorSize,
    cameraStatus,
    frozen,
    mirror,
    flipVertical,
    rotation,
    fitMode,
    zoom,
    panX,
    panY,
    filterId,
    effectId,
    adjustments,
    focus,
    stabilization,
    background,
    branding,
    abSplitEnabled,
    abSplitPosition,
    isScreenPipActive,
    screenLayout,
    pipCorner,
    pipSizeRatio,
    pipCircular,
    dualCam,
    showHistogram,
    motionActive,
    motionSensitivity,
    qrScanning,
    qrSupported,
    captureCurrentCanvasItem,
    showToast,
  });

  renderStateRef.current = {
    dims,
    sensorSize,
    cameraStatus,
    frozen,
    mirror,
    flipVertical,
    rotation,
    fitMode,
    zoom,
    panX,
    panY,
    filterId,
    effectId,
    adjustments,
    focus,
    stabilization,
    background,
    branding,
    abSplitEnabled,
    abSplitPosition,
    isScreenPipActive,
    screenLayout,
    pipCorner,
    pipSizeRatio,
    pipCircular,
    dualCam,
    showHistogram,
    motionActive,
    motionSensitivity,
    qrScanning,
    qrSupported,
    captureCurrentCanvasItem,
    showToast,
  };

  const lastKnownSensorRef = useRef<{ w: number; h: number }>({ w: 1920, h: 1080 });

  useEffect(() => {
    let rafId = 0;
    let lastHistogramTime = 0;
    let lastMotionTime = 0;
    let lastQrTime = 0;
    let lastAiDetTime = 0;
    let hadSubjectsPreviously = false;

    if (!unavailableCameraCanvasRef.current) {
      unavailableCameraCanvasRef.current = document.createElement('canvas');
    }
    if (!processedCameraCanvasRef.current) {
      processedCameraCanvasRef.current = document.createElement('canvas');
    }

    const renderLoop = (now: number) => {
      const s = renderStateRef.current;
      const canvas = canvasRef.current;
      const isStudioMode = engineModeRef.current === 'studio';

      if (canvas) {
        const targetW = s.dims.w;
        const targetH = s.dims.h;

        if (!isStudioMode && (canvas.width !== targetW || canvas.height !== targetH)) {
          canvas.width = targetW;
          canvas.height = targetH;
        }

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx && !s.frozen) {
          if (isStudioMode) {
            // Modo Studio Engine: ProgramCompositor gobierna la composición maestra sin duplicar motores.
            const coordEngine = studioEngineRef.current;
            const camVid = coordEngine.getActiveCameraVideoElement();
            const camLive =
              Boolean(camVid && camVid.readyState >= 2 && camVid.videoWidth > 0);

            if (camLive && camVid) {
              const vidW = camVid.videoWidth;
              const vidH = camVid.videoHeight;
              if (
                vidW !== lastKnownSensorRef.current.w ||
                vidH !== lastKnownSensorRef.current.h
              ) {
                lastKnownSensorRef.current = { w: vidW, h: vidH };
                setSensorSize({ w: vidW, h: vidH });
              }
            }

            const hasColorAdjustments =
              s.adjustments.brightness !== 0 ||
              s.adjustments.contrast !== 0 ||
              s.adjustments.saturation !== 0 ||
              s.adjustments.temperature !== 0 ||
              s.adjustments.softSkin !== 0 ||
              s.adjustments.vignette !== 0;

            const needsCameraBridge =
              s.mirror ||
              s.flipVertical ||
              s.rotation !== 0 ||
              s.zoom > 1.01 ||
              s.filterId !== 'none' ||
              s.effectId !== 'none' ||
              s.background.mode !== 'none' ||
              s.stabilization.enabled ||
              s.focus.apertureBlur > 0 ||
              s.focus.mode === 'manual' ||
              s.focus.aiTrackingEnabled ||
              s.focus.aiAutoFocus ||
              hasColorAdjustments;

            if (camLive && camVid && needsCameraBridge) {
              const bridgeSrc = camVid;
              const bSrcW = camVid.videoWidth;
              const bSrcH = camVid.videoHeight;
              const swapBridgeDims = s.rotation === 90 || s.rotation === 270;
              const effectiveSrcW = swapBridgeDims ? bSrcH : bSrcW;
              const effectiveSrcH = swapBridgeDims ? bSrcW : bSrcH;

              const procCanvas = processedCameraCanvasRef.current!;
              const procW = Math.min(s.background.mode === 'transparent' ? 1920 : 1280, effectiveSrcW);
              const procH = Math.round(procW * (effectiveSrcH / Math.max(1, effectiveSrcW)));
              if (procCanvas.width !== procW || procCanvas.height !== procH) {
                procCanvas.width = procW;
                procCanvas.height = procH;
              }
              const procCtx = procCanvas.getContext('2d');
              if (procCtx) {
                // Solo procesa la capa de cámara; jamás aplica filtros a la ventana compartida
                const hasTransparentSubject = renderCameraFrame(
                  procCtx,
                  bridgeSrc,
                  bSrcW,
                  bSrcH,
                  {
                    width: procW,
                    height: procH,
                    cameraOnlyAlpha: true,
                    mirror: s.mirror,
                    flipVertical: s.flipVertical,
                    rotation: s.rotation,
                    fitMode: s.fitMode,
                    zoom: s.zoom,
                    panX: s.panX,
                    panY: s.panY,
                    filterId: s.filterId,
                    effectId: s.effectId,
                    adjustments: s.adjustments,
                    focus: s.focus,
                    stabilization: s.stabilization,
                    background: s.background,
                    branding: {
                      showTimestamp: false,
                      showLowerThird: false,
                      lowerThirdName: '',
                      lowerThirdTitle: '',
                      cinemaFrame: false,
                    },
                    abSplitEnabled: false,
                    abSplitPosition: 0.5,
                  },
                  null,
                  () => {
                    setBackground((prev) => ({ ...prev, hasCalibratedBg: true }));
                    s.showToast('Fondo vacío calibrado');
                  },
                  null
                );
                processedCameraVersionRef.current += 1;
                coordEngine.setProcessedCameraSurface({
                  surface: procCanvas,
                  width: procW,
                  height: procH,
                  alphaMode: hasTransparentSubject ? 'premultiplied' : 'straight',
                  frameVersion: processedCameraVersionRef.current,
                  hasTransparentSubject,
                });
              }
            } else {
              resetAiSegmentationTemporalBuffer();
              coordEngine.setProcessedCameraSurface(null);
            }

            // Presentación 1:1 en CameraViewport desde ProgramCanvas (sin duplicar composición)
            const progCanvas = coordEngine.getProgramCanvas();
            if (progCanvas && progCanvas.width > 0 && progCanvas.height > 0) {
              if (canvas.width !== progCanvas.width || canvas.height !== progCanvas.height) {
                canvas.width = progCanvas.width;
                canvas.height = progCanvas.height;
              }
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(progCanvas, 0, 0, canvas.width, canvas.height);
            }
          } else {
            let primarySource: HTMLVideoElement | HTMLCanvasElement | null = null;
            let srcW = 1920;
            let srcH = 1080;

            if (
              s.cameraStatus === 'live' &&
              videoElRef.current &&
              videoElRef.current.readyState >= 2 &&
              videoElRef.current.videoWidth > 0
            ) {
              primarySource = videoElRef.current;
              srcW = videoElRef.current.videoWidth;
              srcH = videoElRef.current.videoHeight;
              if (
                srcW !== lastKnownSensorRef.current.w ||
                srcH !== lastKnownSensorRef.current.h
              ) {
                lastKnownSensorRef.current = { w: srcW, h: srcH };
                setSensorSize({ w: srcW, h: srcH });
              }
            } else {
              const synth = unavailableCameraCanvasRef.current!;
              if (synth.width !== 1920 || synth.height !== 1080) {
                synth.width = 1920;
                synth.height = 1080;
              }
              const sCtx = synth.getContext('2d');
              if (sCtx) {
                renderUnavailableCameraFrame(sCtx, 1920, 1080);
              }
              primarySource = synth;
              srcW = 1920;
              srcH = 1080;
            }

            const screenSource =
              s.isScreenPipActive &&
              screenVideoElRef.current &&
              screenVideoElRef.current.readyState >= 2
                ? {
                    el: screenVideoElRef.current,
                    w: screenVideoElRef.current.videoWidth,
                    h: screenVideoElRef.current.videoHeight,
                  }
                : null;

            const dualCamSource =
              s.dualCam.enabled &&
              secondaryVideoElRef.current &&
              secondaryVideoElRef.current.readyState >= 2 &&
              secondaryVideoElRef.current.videoWidth > 0
                ? {
                    el: secondaryVideoElRef.current,
                    w: secondaryVideoElRef.current.videoWidth,
                    h: secondaryVideoElRef.current.videoHeight,
                    mirror: s.dualCam.mirror,
                  }
                : null;

            if (primarySource) {
              renderCameraFrame(
                ctx,
                primarySource,
                srcW,
                srcH,
                {
                  width: targetW,
                  height: targetH,
                  mirror: s.mirror,
                  flipVertical: s.flipVertical,
                  rotation: s.rotation,
                  fitMode: s.fitMode,
                  zoom: s.zoom,
                  panX: s.panX,
                  panY: s.panY,
                  filterId: s.filterId,
                  effectId: s.effectId,
                  adjustments: s.adjustments,
                  focus: s.focus,
                  stabilization: s.stabilization,
                  background: s.background,
                  branding: s.branding,
                  abSplitEnabled: s.abSplitEnabled,
                  abSplitPosition: s.abSplitPosition,
                  screenLayout: s.screenLayout,
                  pipCorner: s.pipCorner,
                  pipSizeRatio: s.pipSizeRatio,
                  pipCircular: s.pipCircular,
                },
                screenSource,
                () => {
                  setBackground((prev) => ({ ...prev, hasCalibratedBg: true }));
                  s.showToast('Fondo vacío calibrado');
                },
                dualCamSource
              );
            }
          }

          // Live Histogram (~8fps)
          if (s.showHistogram && now - lastHistogramTime > 125) {
            setHistogram(computeHistogram(ctx, canvas.width, canvas.height));
            lastHistogramTime = now;
          }

          // Motion Detection (~6fps)
          if (s.motionActive && now - lastMotionTime > 160) {
            const score = computeMotionScore(canvas);
            setMotionScore(score);
            if (score >= s.motionSensitivity && now - lastMotionCaptureRef.current > 3000) {
              lastMotionCaptureRef.current = now;
              s.captureCurrentCanvasItem(`Alerta Movimiento (${score}%)`).then((item) => {
                setMotionEvents((prev) => [
                  {
                    id: `${Date.now()}`,
                    timestamp: Date.now(),
                    score,
                    capturedUrl: item?.url,
                  },
                  ...prev.slice(0, 14),
                ]);
              });
            }
            lastMotionTime = now;
          }

          // Real-time AI Subject / Face Recognition (~12fps on aligned raw frame)
          if ((s.focus.aiTrackingEnabled || s.focus.aiAutoFocus) && now - lastAiDetTime > 85) {
            lastAiDetTime = now;
            const alignedRaw = getAlignedRawCanvas();
            if (alignedRaw) {
              const boxes = detectSubjectsWithAi(alignedRaw);
              hadSubjectsPreviously = boxes.length > 0;
              setDetectedSubjects(boxes);
              if (
                s.focus.aiAutoFocus &&
                !s.focus.selectingArea &&
                boxes.length > 0
              ) {
                const primary = boxes[0];
                setFocus((prev) => {
                  const dx = primary.focusX - prev.areaX;
                  const dy = primary.focusY - prev.areaY;
                  if (Math.hypot(dx, dy) < 0.018) return prev;
                  return {
                    ...prev,
                    areaX: prev.areaX + dx * 0.42,
                    areaY: prev.areaY + dy * 0.42,
                  };
                });
              }
            }
          } else if (!s.focus.aiTrackingEnabled && !s.focus.aiAutoFocus && hadSubjectsPreviously) {
            hadSubjectsPreviously = false;
            setDetectedSubjects([]);
          }

          // Native Barcode / QR Detection (~2.5fps)
          if (s.qrScanning && s.qrSupported && now - lastQrTime > 400) {
            lastQrTime = now;
            const Detector = (
              window as unknown as {
                BarcodeDetector?: new () => {
                  detect: (source: HTMLCanvasElement) => Promise<Array<{ rawValue: string }>>;
                };
              }
            ).BarcodeDetector;
            if (Detector) {
              new Detector()
                .detect(canvas)
                .then((codes) => {
                  if (codes.length > 0 && codes[0].rawValue) {
                    setLastQrResult(codes[0].rawValue);
                  }
                })
                .catch(() => {});
            }
          }
        }
      }
      rafId = requestAnimationFrame(renderLoop);
    };

    rafId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Keyboard shortcuts (Space, R, M, F, G, L, H, C, Escape, Arrow nudges for Studio camera layer)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === 'z' &&
        studioEngine.engineMode === 'studio' &&
        activeTab !== 'gallery'
      ) {
        e.preventDefault();
        if (e.shiftKey) {
          void studioEngine.redoComposition().then((res) => {
            if (res.ok) {
              showToast(`Rehacer: ${res.label ?? 'composición'}`);
            }
          });
        } else {
          void studioEngine.undoComposition().then((res) => {
            if (res.ok) {
              showToast(`Deshacer: ${res.label ?? 'composición'}`);
            }
          });
        }
        return;
      }

      if (e.key === 'Escape') {
        if (cinemaMode) {
          setCinemaMode(false);
          return;
        }
        if (selectedStudioLayerId) {
          setSelectedStudioLayerId(null);
          return;
        }
      }

      if (
        (e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight' ||
          e.key === 'ArrowUp' ||
          e.key === 'ArrowDown') &&
        studioEngine.engineMode === 'studio' &&
        !cinemaMode &&
        activeTab !== 'gallery' &&
        selectedStudioLayerId &&
        activeStudioScene
      ) {
        const selectedLayer = activeStudioScene.layers.find(
          (l) => l.id === selectedStudioLayerId && l.visible
        );
        const selectedSource = selectedLayer
          ? studioEngine.projectSources.find((s) => s.id === selectedLayer.sourceId)
          : undefined;
        if (selectedLayer && isVisualSourceEditable(selectedSource)) {
          e.preventDefault();
          if (selectedLayer.locked) return;
          const res = computeKeyboardNudgeTransform(selectedLayer.transform, e.key, {
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            scene: activeStudioScene,
            layer: selectedLayer,
            sources: studioEngine.projectSources,
          });
          if (res) {
            studioEngine.updateSceneLayerTransform(
              activeStudioScene.id,
              selectedLayer.id,
              res.transform,
              {
                historyGroupKey: `nudge:${selectedLayer.id}`,
                historyLabel: 'Ajustar posición',
              }
            );
          }
          return;
        }
      }

      if (e.code === 'Space') {
        e.preventDefault();
        triggerPhotoCapture();
      } else if (e.key.toLowerCase() === 'r') {
        toggleRecording();
      } else if (e.key.toLowerCase() === 'm') {
        setMirror((v) => !v);
      } else if (e.key.toLowerCase() === 'f') {
        setFrozen((v) => !v);
      } else if (e.key.toLowerCase() === 'l') {
        setRingLight((p) => ({ ...p, enabled: !p.enabled }));
      } else if (e.key.toLowerCase() === 'c') {
        setCinemaMode((v) => !v);
      } else if (e.key.toLowerCase() === 'h') {
        if (cinemaMode) {
          setCinemaMode(false);
        } else {
          setInspectorCollapsed((v) => !v);
        }
      } else if (e.key.toLowerCase() === 'g') {
        const order: GridOverlayId[] = ['none', 'thirds', 'golden', 'crosshair', 'cinema'];
        setGridOverlay((curr) => order[(order.indexOf(curr) + 1) % order.length]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    triggerPhotoCapture,
    toggleRecording,
    cinemaMode,
    activeTab,
    selectedStudioLayerId,
    activeStudioScene,
    studioEngine,
    showToast,
  ]);

  // Native macOS Desktop Menu Actions & safe hardware release on window close
  useEffect(() => {
    const unsubMenu = window.opticaDesktop?.onMenuAction((action) => {
      switch (action) {
        case 'capture-photo':
          void triggerPhotoCapture();
          break;
        case 'capture-window':
          void captureOtherWindowScreenshot(false);
          break;
        case 'toggle-record':
          toggleRecording();
          break;
        case 'open-gallery':
          setActiveTab('gallery');
          break;
        case 'toggle-cinema-mode':
          setCinemaMode((v) => !v);
          break;
      }
    });

    const releaseStreamsOnUnload = () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      secondaryStreamRef.current?.getTracks().forEach((t) => t.stop());
      for (const entry of studioEngineRef.current.getActiveSourceRuntimeEntries()) {
        entry.resources.mediaStream?.getTracks().forEach((t) => t.stop());
      }
      audioAnalyserRef.current?.ctx.close().catch(() => {});
    };

    window.addEventListener('beforeunload', releaseStreamsOnUnload);
    return () => {
      unsubMenu?.();
      window.removeEventListener('beforeunload', releaseStreamsOnUnload);
    };
  }, [triggerPhotoCapture, captureOtherWindowScreenshot, toggleRecording]);

  const handleSaveEditedItem = useCallback(
    async (item: CapturedMediaItem, replaceId?: string) => {
      if (replaceId) {
        setGalleryItems((prev) => {
          const old = prev.find((i) => i.id === replaceId);
          if (old && old.url !== item.url) URL.revokeObjectURL(old.url);
          return prev.map((i) => (i.id === replaceId ? item : i));
        });
      } else {
        setGalleryItems((prev) => [item, ...prev]);
      }
      await saveMediaItem(item);
      showToast(
        replaceId ? 'Captura actualizada en la galería' : 'Edición guardada en la galería'
      );
    },
    [showToast]
  );

  const handleDeleteGalleryItem = async (id: string) => {
    setGalleryItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((i) => i.id !== id);
    });
    await deleteMediaItemFromDB(id);
  };

  const handleClearGallery = async () => {
    galleryItems.forEach((i) => URL.revokeObjectURL(i.url));
    setGalleryItems([]);
    await clearAllMediaFromDB();
  };

  const handleSelectWorkspaceTab = useCallback(
    (tab: WorkspaceTab) => {
      if (
        tab !== activeTab &&
        tab !== 'studio' &&
        tab !== 'gallery' &&
        appearance.leftPanel.expanded &&
        !appearance.leftPanel.pinned
      ) {
        appearance.updateLeftPanel({ expanded: false });
      }
      setActiveTab(tab);
    },
    [activeTab, appearance]
  );

  const studioEnginePanelProps: StudioEnginePanelProps = {
    engineMode: studioEngine.engineMode,
    backendKind: studioEngine.backendKind,
    preferredBackend: studioEngine.preferredBackend,
    isRecordingLocked: studioEngine.isRecordingLocked,
    activeSceneId: studioEngine.activeSceneId,
    scenes: studioEngine.scenes,
    projectSources: studioEngine.projectSources,
    sources: studioEngine.sources,
    outputWidth: studioEngine.outputWidth,
    outputHeight: studioEngine.outputHeight,
    selectedLayerId: selectedStudioLayerId,
    hasLiveDisplaySource: studioEngine.hasLiveDisplaySource,
    lastError: studioEngine.lastError,
    historyStatus: studioEngine.historyStatus,
    diagnosticsSnapshot: studioEngine.diagnosticsSnapshot,
    compatibilityMatrix: studioEngine.compatibilityMatrix,
    onSwitchEngineMode: (mode) => handleSwitchEngineMode(mode),
    onSwitchScene: (sceneId, transitionOverride) =>
      void studioEngine.switchScene(sceneId, transitionOverride),
    onActivatePresetScene: (presetId, transitionOverride) =>
      void studioEngine.activatePresetScene(presetId, transitionOverride),
    onAuthorizeDisplaySource: (sourceId?: string) =>
      void handleAuthorizeStudioDisplaySource(sourceId),
    onReconnectSource: (sourceId: string) =>
      void studioEngine.reconnectSource(sourceId, true),
    onAddDisplaySource: (kind: 'screen' | 'window') =>
      handleAddStudioDisplaySource(kind),
    onChangeBackendPreference: handleChangeStudioBackend,
    onRecoverCanvas2dFallback: handleRecoverStudioCanvas2d,
    onRefreshDiagnostics: () => {
      studioEngine.refreshDiagnostics();
    },
    onResetProject: () => void studioEngine.resetProject(),
    onSelectLayer: setSelectedStudioLayerId,
    onUpdateLayerTransform: (sceneId, layerId, patch, opts) => {
      studioEngine.updateSceneLayerTransform(sceneId, layerId, patch, opts);
    },
    onUpdateLayerStyle: (sceneId, layerId, stylePatch, opts) => {
      studioEngine.updateSceneLayerStyle(sceneId, layerId, stylePatch, opts);
    },
    onApplyAdaptableLayout: (sceneId, layoutId, opts) => {
      studioEngine.applyAdaptableLayout(sceneId, layoutId, {
        sensorWidth: sensorSize.w,
        sensorHeight: sensorSize.h,
        selectedLayerId: selectedStudioLayerId ?? undefined,
        participatingLayerIds: opts?.participatingLayerIds,
        primaryDisplayLayerId: opts?.primaryDisplayLayerId,
        secondaryDisplayLayerId: opts?.secondaryDisplayLayerId,
        primaryCameraLayerId: opts?.primaryCameraLayerId,
      });
    },
    onToggleLayerLock: (sceneId, layerId, locked) => {
      studioEngine.setSceneLayerLocked(sceneId, layerId, locked);
    },
    onReorderLayers: (sceneId, orderedLayerIds) => {
      studioEngine.reorderSceneLayers(sceneId, orderedLayerIds);
    },
    onMoveLayerOrder: (sceneId, layerId, direction) => {
      studioEngine.moveSceneLayerOrder(sceneId, layerId, direction);
    },
    onPlaceLayerBehindCamera: (sceneId, layerId) => {
      studioEngine.placeSceneLayerBehindCamera(sceneId, layerId);
    },
    onToggleLayerVisible: (sceneId, layerId, visible) =>
      studioEngine.setSceneLayerVisible(sceneId, layerId, visible),
    onRenameLayer: (sceneId, layerId, newName) => {
      studioEngine.renameSceneLayer(sceneId, layerId, newName);
    },
    onDuplicateLayer: (sceneId, layerId) =>
      studioEngine.duplicateSceneLayer(sceneId, layerId),
    onResetLayerTransform: (sceneId, layerId) => {
      studioEngine.resetSceneLayerTransform(sceneId, layerId);
    },
    onResetLayerStyle: (sceneId, layerId) => {
      studioEngine.resetSceneLayerStyle(sceneId, layerId);
    },
    onRemoveLayer: (sceneId, layerId) =>
      studioEngine.removeSceneLayer(sceneId, layerId),
    onAddRealSource: (sceneId, request) =>
      studioEngine.addRealSourceToScene(sceneId, request),
    onAddExistingSourceToScene: (sceneId, sourceId, opts) =>
      studioEngine.addExistingSourceToScene(sceneId, sourceId, opts),
    onRenameProjectSource: (sourceId, newName) =>
      studioEngine.renameProjectSource(sourceId, newName),
    onRemoveSourceSafely: (sourceId) =>
      studioEngine.removeProjectSourceSafely(sourceId),
    onEnumerateDevices: () => studioEngine.enumerateAvailableDevices(),
    onUndo: async () => {
      const res = await studioEngine.undoComposition();
      if (res.ok) {
        showToast(`Deshacer: ${res.label ?? 'composición'}`);
      }
    },
    onRedo: async () => {
      const res = await studioEngine.redoComposition();
      if (res.ok) {
        showToast(`Rehacer: ${res.label ?? 'composición'}`);
      }
    },
  };

  return (
    <div className="h-screen w-screen flex flex-col studio-ambient-bg text-[var(--text-primary)] overflow-hidden">
      {!cinemaMode && (
        <TopBar
          activeTab={activeTab}
          onSelectTab={handleSelectWorkspaceTab}
          galleryCount={galleryItems.length}
          cameraStatus={cameraStatus}
          onConnectCamera={() => {
            if (studioEngine.engineMode === 'studio') {
              const camSrc = studioEngine.sources.find((s) => s.kind === 'camera');
              if (camSrc) {
                void studioEngine.reconnectSource(camSrc.id, true);
              }
            } else {
              void startCameraStream(selectedVideoId, selectedAudioId);
            }
          }}
          onQuickCapture={() => triggerPhotoCapture()}
          inspectorCollapsed={inspectorCollapsed}
          onToggleInspectorCollapsed={() => setInspectorCollapsed((v) => !v)}
          leftPanelExpanded={appearance.leftPanel.expanded}
          onToggleLeftPanel={() =>
            appearance.updateLeftPanel((prev) => ({ ...prev, expanded: !prev.expanded }))
          }
          cinemaMode={cinemaMode}
          onToggleCinemaMode={() => setCinemaMode((v) => !v)}
          isRecording={isRecording}
          isRecordingPaused={isRecordingPaused}
          recordingSeconds={recordingSeconds}
          appearanceSettings={appearance.settings}
          resolvedAppearance={appearance.resolved}
          onUpdateAppearance={appearance.updateSettings}
          onResetAppearance={appearance.resetAppearance}
        />
      )}

      {/* Camera permission info strip (only shown if camera isn't live yet) */}
      {!cinemaMode && cameraStatus !== 'live' && cameraErrorMsg && (
        <div className="studio-chrome-bar border-b border-[var(--border-hairline)] px-4 py-1.5 flex items-center justify-between gap-4 text-xs shrink-0">
          <span className="text-[var(--text-secondary)] truncate">{cameraErrorMsg}</span>
          <button
            type="button"
            onClick={() => {
              if (studioEngine.engineMode === 'studio') {
                const camSrc = studioEngine.sources.find((s) => s.kind === 'camera');
                if (camSrc) void studioEngine.reconnectSource(camSrc.id, true);
              } else {
                void startCameraStream(selectedVideoId, selectedAudioId);
              }
            }}
            className="text-[var(--accent-blue)] hover:underline font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            Reintentar permiso de cámara
          </button>
        </div>
      )}

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col min-[880px]:flex-row min-h-0 overflow-hidden relative">
        {activeTab === 'gallery' && (
          <GalleryView
            items={galleryItems}
            onDeleteItem={handleDeleteGalleryItem}
            onClearAll={handleClearGallery}
            onBackToStudio={() => setActiveTab('studio')}
            onCaptureWindow={() => void captureOtherWindowScreenshot(false)}
            onImportImages={(files) => void importExternalScreenshots(files)}
            onUseAsBackground={(item) => {
              setBackground((p) => ({
                ...p,
                mode: 'image',
                imageId: 'custom',
                customImageUrl: item.url,
              }));
              setActiveTab('filters');
              showToast('Captura aplicada como fondo IA');
            }}
            onSaveEditedItem={handleSaveEditedItem}
          />
        )}

        {activeTab !== 'gallery' && !cinemaMode && (
          <LeftStudioPanel
            preferences={appearance.leftPanel}
            onUpdatePreferences={appearance.updateLeftPanel}
            studioEnginePanel={studioEnginePanelProps}
            cameraStatus={cameraStatus}
            cameraLabel={cameraLabel}
            isScreenPipActive={isScreenPipActive}
            isDualCamActive={dualCam.enabled}
            onToggleScreenPip={() => void toggleScreenPip()}
            onReconnectSource={(sourceId) => void studioEngine.reconnectSource(sourceId, true)}
            isTransparentCutoutActive={background.mode === 'transparent'}
            onOpenRecordingLab={() => {
              setActiveTab('record');
              setStudioLabOpen(true);
            }}
          />
        )}

        <CameraViewport
          hiddenForGallery={activeTab === 'gallery'}
          cinemaMode={cinemaMode}
          onToggleCinemaMode={() => setCinemaMode((v) => !v)}
          canvasRef={canvasRef}
          aspectRatio={aspectRatio}
          resolutionWidth={studioEngine.engineMode === 'studio' ? studioEngine.outputWidth : dims.w}
          resolutionHeight={studioEngine.engineMode === 'studio' ? studioEngine.outputHeight : dims.h}
          sensorSize={sensorSize}
          cameraStatus={cameraStatus}
          cameraLabel={cameraLabel}
          videoDevices={videoDevices}
          selectedVideoId={selectedVideoId}
          onSelectVideoDevice={(id) => {
            setSelectedVideoId(id);
            startCameraStream(id, selectedAudioId, resolutionPreset, aspectRatio);
          }}
          rotation={rotation}
          onRotate90={() => setRotation((r) => ((r + 90) % 360) as RotationDeg)}
          mirror={mirror}
          onToggleMirror={() => setMirror((v) => !v)}
          frozen={frozen}
          onToggleFreeze={() => setFrozen((v) => !v)}
          zoom={zoom}
          onChangeZoom={setZoom}
          panX={panX}
          panY={panY}
          onChangePan={(x, y) => {
            setPanX(x);
            setPanY(y);
          }}
          focus={focus}
          onChangeFocus={setFocus}
          stabilization={stabilization}
          onToggleStabilization={() =>
            setStabilization((p) => ({ ...p, enabled: !p.enabled }))
          }
          filterId={filterId}
          effectId={effectId}
          adjustments={adjustments}
          gridOverlay={gridOverlay}
          ringLight={ringLight}
          teleprompter={teleprompter}
          onChangeTeleprompter={setTeleprompter}
          branding={branding}
          abSplitEnabled={abSplitEnabled}
          abSplitPosition={abSplitPosition}
          onChangeAbSplitPosition={setAbSplitPosition}
          eyedropperActive={eyedropperActive}
          onSampleColor={(col) => {
            setSampledColor(col);
            setEyedropperActive(false);
            showToast(`Color muestreado: ${col.hex}`);
          }}
          countdownValue={countdownValue}
          flashActive={flashActive}
          isRecording={isRecording}
          isRecordingPaused={isRecordingPaused}
          recordingSeconds={recordingSeconds}
          onCapturePhoto={() => triggerPhotoCapture()}
          onCaptureWindow={() => void captureOtherWindowScreenshot(false)}
          onShareDisplay={() => void toggleScreenPip()}
          displayShared={studioEngine.engineMode === 'studio' ? studioEngine.hasLiveDisplaySource : isScreenPipActive}
          onToggleRecord={toggleRecording}
          onTogglePauseRecord={togglePauseRecording}
          audioLevel={micMuted ? 0 : audioLevel}
          recentMedia={galleryItems}
          onOpenGallery={() => setActiveTab('gallery')}
          boothProgress={boothProgress}
          isScreenPipActive={isScreenPipActive}
          isDualCamActive={dualCam.enabled}
          isOutputPipActive={isOutputPipActive}
          onToggleOutputPip={() => void toggleOutputPip()}
          aiStatus={aiStatus}
          studioLayerEditor={{
            enabled: studioEngine.engineMode === 'studio',
            activeScene: activeStudioScene,
            sources: studioEngine.projectSources,
            selectedLayerId: selectedStudioLayerId,
            onSelectLayer: setSelectedStudioLayerId,
            onUpdateLayerTransform: studioEngine.updateSceneLayerTransform,
            onToggleLayerLock: studioEngine.setSceneLayerLocked,
            onBeginLayerEdit: studioEngine.beginCompositionGesture,
            onCommitLayerEdit: () => {
              studioEngine.commitCompositionGesture();
              void studioEngine.flushPersistence();
            },
            onMoveLayerOrder: studioEngine.moveSceneLayerOrder,
            onToggleLayerVisible: (sceneId, layerId, visible) => {
              void studioEngine.setSceneLayerVisible(sceneId, layerId, visible);
            },
            onResetLayerTransform: studioEngine.resetSceneLayerTransform,
          }}
          studioDisplayPopover={{
            enabled: studioEngine.engineMode === 'studio',
            activeScene: activeStudioScene,
            sources: studioEngine.projectSources,
            runtimeSources: studioEngine.sources,
            layerDiagnostics: studioEngine.diagnosticsSnapshot?.layerDiagnostics,
            selectedLayerId: selectedStudioLayerId,
            onSelectOrAddDisplayLayer: (sourceId) => {
              if (!activeStudioScene) return;
              const existingLayer = activeStudioScene.layers.find(
                (l) => l.sourceId === sourceId
              );
              if (existingLayer) {
                setSelectedStudioLayerId(existingLayer.id);
              } else {
                void studioEngine
                  .addExistingSourceToScene(activeStudioScene.id, sourceId, {
                    placement: 'behind-camera',
                  })
                  .then((res) => {
                    if (res.ok && res.layer) {
                      setSelectedStudioLayerId(res.layer.id);
                    }
                  });
              }
            },
            onChangeDisplayCapture: (sourceId) =>
              void handleAuthorizeStudioDisplaySource(sourceId),
            onAddDisplaySource: (kind) => void handleAddStudioDisplaySource(kind),
            onPlaceLayerBehindCamera: (layerId) => {
              if (!activeStudioScene) return;
              studioEngine.placeSceneLayerBehindCamera(activeStudioScene.id, layerId);
            },
            onMoveLayerToTop: (layerId) => {
              if (!activeStudioScene) return;
              studioEngine.moveSceneLayerOrder(activeStudioScene.id, layerId, 'top');
            },
          }}
        />

        {activeTab !== 'gallery' && !cinemaMode && !inspectorCollapsed && (
          <SidebarControls
            activeTab={activeTab}
            onChangeTab={setActiveTab}
            videoDevices={videoDevices}
            audioDevices={audioDevices}
            selectedVideoId={selectedVideoId}
            selectedAudioId={selectedAudioId}
            sensorSize={sensorSize}
            cameraStatus={cameraStatus}
            onRefreshDevices={() => refreshDevices()}
            onSelectVideoDevice={(id) => {
              setSelectedVideoId(id);
              if (studioEngine.engineMode !== 'studio') {
                void startCameraStream(id, selectedAudioId, resolutionPreset, aspectRatio);
              }
            }}
            onSelectAudioDevice={(id) => {
              setSelectedAudioId(id);
              if (studioEngine.engineMode !== 'studio') {
                void startCameraStream(selectedVideoId, id, resolutionPreset, aspectRatio);
              }
            }}
            resolutionPreset={resolutionPreset}
            onChangeResolution={(r) => {
              if (isRecording) {
                showToast('No se permite cambiar la resolución durante la grabación');
                return;
              }
              setResolutionPreset(r);
              if (studioEngine.engineMode === 'studio') {
                studioEngine.setResolutionProfile(r, aspectRatio);
              } else {
                void startCameraStream(selectedVideoId, selectedAudioId, r, aspectRatio);
              }
            }}
            aspectRatio={aspectRatio}
            onChangeAspectRatio={(ar) => {
              if (isRecording) {
                showToast('No se permite cambiar la proporción durante la grabación');
                return;
              }
              setAspectRatio(ar);
              if (studioEngine.engineMode === 'studio') {
                studioEngine.setResolutionProfile(resolutionPreset, ar);
              } else if (cameraStatus === 'live') {
                void startCameraStream(selectedVideoId, selectedAudioId, resolutionPreset, ar);
              }
            }}
            fitMode={fitMode}
            onChangeFitMode={setFitMode}
            rotation={rotation}
            onRotate90={() => setRotation((r) => ((r + 90) % 360) as RotationDeg)}
            mirror={mirror}
            onToggleMirror={() => setMirror((v) => !v)}
            flipVertical={flipVertical}
            onToggleFlipVertical={() => setFlipVertical((v) => !v)}
            zoom={zoom}
            onChangeZoom={setZoom}
            panX={panX}
            panY={panY}
            onChangePan={(x, y) => {
              setPanX(x);
              setPanY(y);
            }}
            focus={focus}
            onChangeFocus={setFocus}
            hardwareFocusSupported={hardwareFocusSupported}
            stabilization={stabilization}
            onChangeStabilization={setStabilization}
            filterId={filterId}
            onChangeFilter={setFilterId}
            effectId={effectId}
            onChangeEffect={setEffectId}
            background={background}
            onChangeBackground={setBackground}
            onCalibrateBackground={() => triggerBackgroundCalibration()}
            onClearBackgroundCalibration={() => {
              clearBackgroundCalibration();
              setBackground((p) => ({ ...p, hasCalibratedBg: false }));
            }}
            onCaptureWindowAsBackground={() => void captureOtherWindowScreenshot(true)}
            onCaptureWindow={() => void captureOtherWindowScreenshot(false)}
            detectedSubjects={detectedSubjects}
            aiStatus={aiStatus}
            adjustments={adjustments}
            onChangeAdjustments={setAdjustments}
            abSplitEnabled={abSplitEnabled}
            onToggleAbSplit={() => setAbSplitEnabled((v) => !v)}
            ringLight={ringLight}
            onChangeRingLight={setRingLight}
            timerSeconds={timerSeconds}
            onChangeTimerSeconds={setTimerSeconds}
            flashEnabled={flashEnabled}
            onToggleFlash={() => setFlashEnabled((v) => !v)}
            soundMuted={soundMuted}
            onToggleSoundMuted={() => setSoundMuted((v) => !v)}
            onStartPhotoBooth={startPhotoBooth}
            onStartBurst={startBurst}
            timelapseActive={timelapseActive}
            timelapseIntervalSec={timelapseIntervalSec}
            timelapseCount={timelapseCount}
            onChangeTimelapseInterval={setTimelapseIntervalSec}
            onToggleTimelapse={() => {
              if (!timelapseActive) setTimelapseCount(0);
              setTimelapseActive((v) => !v);
            }}
            motionActive={motionActive}
            onToggleMotion={() => setMotionActive((v) => !v)}
            motionSensitivity={motionSensitivity}
            onChangeMotionSensitivity={setMotionSensitivity}
            motionScore={motionScore}
            motionEvents={motionEvents}
            isRecording={isRecording}
            onToggleRecord={toggleRecording}
            recordingFormatPref={recordingFormatPref}
            onChangeRecordingFormatPref={setRecordingFormatPref}
            audioConsole={audioConsole}
            onChangeAudioConsole={setAudioConsole}
            micMuted={micMuted}
            onToggleMicMuted={() => setMicMuted((v) => !v)}
            audioLevel={audioLevel}
            isScreenPipActive={isScreenPipActive}
            onToggleScreenPip={toggleScreenPip}
            screenLayout={screenLayout}
            onChangeScreenLayout={setScreenLayout}
            pipCorner={pipCorner}
            onChangePipCorner={setPipCorner}
            pipCircular={pipCircular}
            onTogglePipCircular={() => setPipCircular((v) => !v)}
            pipSizeRatio={pipSizeRatio}
            onChangePipSizeRatio={setPipSizeRatio}
            dualCam={dualCam}
            onChangeDualCam={setDualCam}
            onSwapCameras={() => void swapCameras()}
            isOutputPipActive={isOutputPipActive}
            onToggleOutputPip={() => void toggleOutputPip()}
            onResetAllPreferences={resetAllPreferences}
            teleprompter={teleprompter}
            onChangeTeleprompter={setTeleprompter}
            gridOverlay={gridOverlay}
            onChangeGridOverlay={setGridOverlay}
            branding={branding}
            onChangeBranding={setBranding}
            histogram={histogram}
            showHistogram={showHistogram}
            onToggleHistogram={() => setShowHistogram((v) => !v)}
            eyedropperActive={eyedropperActive}
            onToggleEyedropper={() => setEyedropperActive((v) => !v)}
            sampledColor={sampledColor}
            qrSupported={qrSupported}
            qrScanning={qrScanning}
            onToggleQrScanning={() => setQrScanning((v) => !v)}
            lastQrResult={lastQrResult}
            onQuickDocumentScan={() => {
              setFilterId((curr) => (curr === 'document-scan' ? 'none' : 'document-scan'));
            }}
            studioEnginePanel={studioEnginePanelProps}
            appearanceSettings={appearance.settings}
            resolvedAppearance={appearance.resolved}
            onUpdateAppearance={appearance.updateSettings}
            onResetAppearance={appearance.resetAppearance}
            studioLabOpen={studioLabOpen}
            onToggleStudioLabOpen={setStudioLabOpen}
          />
        )}
      </main>

      {/* Hidden video element powering native Floating System Picture-in-Picture */}
      <video
        ref={outputPipVideoRef}
        muted
        playsInline
        autoPlay
        className="fixed -left-[9999px] top-0 w-1 h-1 opacity-0 pointer-events-none"
      />

      {/* Subtle Liquid Glass Toast Confirmation */}
      {toastMsg && (
        <div className="glass-dense fixed bottom-16 left-1/2 -translate-x-1/2 z-50 text-[var(--text-primary)] px-4 py-2 rounded-full text-xs font-medium flex items-center gap-3">
          <span>{toastMsg}</span>
          <button
            type="button"
            onClick={() => {
              setToastMsg(null);
              setActiveTab('gallery');
            }}
            className="text-[var(--accent-blue)] hover:underline font-semibold cursor-pointer"
          >
            Ver galería
          </button>
        </div>
      )}
    </div>
  );
}
