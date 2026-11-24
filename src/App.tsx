import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TopBar } from './components/TopBar';
import { CameraViewport } from './components/CameraViewport';
import { SidebarControls } from './components/SidebarControls';
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
  renderSyntheticCameraFeed,
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

  // Streams & Hardware
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'live' | 'demo' | 'error'>('idle');
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
  const syntheticCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
    data: Uint8Array<ArrayBuffer>;
  } | null>(null);

  const dims = useMemo(
    () => getDimensions(resolutionPreset, aspectRatio, sensorSize),
    [resolutionPreset, aspectRatio, sensorSize]
  );

  const qrSupported = useMemo(
    () => typeof window !== 'undefined' && 'BarcodeDetector' in window,
    []
  );

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

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
    if ((background.mode !== 'none' || activeTab === 'filters') && background.useAi) {
      void ensureAiSegmenter();
    }
    if (background.mode === 'none') {
      resetAiSegmentationTemporalBuffer();
    }
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
        setCameraStatus('demo');
        setCameraErrorMsg('Navegador sin soporte de cámara WebRTC. Usando Modo Demo Óptico.');
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
        // Fallback smoothly to demo optical mode if permission denied or no camera attached
        setCameraStatus('demo');
        const msg =
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Permiso de cámara denegado. Puedes usar el Modo Demo o habilitar el permiso en tu navegador.'
            : 'No se detectó cámara activa. Mostrando Modo Demo Óptico.';
        setCameraErrorMsg(msg);
      }
    },
    [aspectRatio, refreshDevices, resolutionPreset, setupAudioAnalyser]
  );

  // Initialize camera on mount
  useEffect(() => {
    startCameraStream();
    return () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      secondaryStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioAnalyserRef.current?.ctx.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }, [micMuted, audioConsole.micGain, audioConsole.compressorEnabled]);

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

  // Capture Single Filtered Frame Helper
  const captureCurrentCanvasItem = useCallback(
    async (
      customLabel?: string,
      type: 'photo' | 'booth' = 'photo'
    ): Promise<CapturedMediaItem | null> => {
      const canvas = canvasRef.current;
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
    [filterId, effectId]
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

        if (canvasRef.current) {
          const snap = document.createElement('canvas');
          snap.width = canvasRef.current.width;
          snap.height = canvasRef.current.height;
          snap.getContext('2d')?.drawImage(canvasRef.current, 0, 0);
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
    [boothProgress, soundMuted, flashEnabled, filterId, effectId, showToast]
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

    const canvas = canvasRef.current;
    if (!canvas || typeof MediaRecorder === 'undefined') {
      showToast('Grabación de video no soportada en este navegador');
      return;
    }

    const canvasStream = canvas.captureStream(60);
    const combinedTracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
    if (audioAnalyserRef.current) {
      if (audioAnalyserRef.current.ctx.state === 'suspended') {
        void audioAnalyserRef.current.ctx.resume();
      }
      combinedTracks.push(...audioAnalyserRef.current.dest.stream.getAudioTracks());
    } else if (mediaStreamRef.current && !micMuted) {
      combinedTracks.push(...mediaStreamRef.current.getAudioTracks());
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
  }, [isRecording, micMuted, recordingFormatPref, filterId, effectId, showToast]);

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

  // Screen Share + Camera PiP (+ optional shared system/tab audio into Web Audio mixer)
  const toggleScreenPip = useCallback(async () => {
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

      if (sStream.getAudioTracks().length > 0 && audioAnalyserRef.current) {
        const graph = audioAnalyserRef.current;
        try {
          const sSrc = graph.ctx.createMediaStreamSource(sStream);
          sSrc.connect(graph.analyser);
          sSrc.connect(graph.dest);
          graph.screenAudioSource = sSrc;
        } catch {
          // Ignore if display stream audio track cannot be routed
        }
      }

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
    } catch {
      // User cancelled screen share picker
    }
  }, [isScreenPipActive, audioConsole.includeSystemAudio, showToast]);

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

    const canvas = canvasRef.current;
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
  }, [showToast]);

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
    const startTime = performance.now();

    if (!syntheticCanvasRef.current) {
      syntheticCanvasRef.current = document.createElement('canvas');
    }

    const renderLoop = (now: number) => {
      const s = renderStateRef.current;
      const canvas = canvasRef.current;
      if (canvas) {
        const targetW = s.dims.w;
        const targetH = s.dims.h;

        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx && !s.frozen) {
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
            const synth = syntheticCanvasRef.current!;
            if (synth.width !== 1920 || synth.height !== 1080) {
              synth.width = 1920;
              synth.height = 1080;
            }
            const sCtx = synth.getContext('2d');
            if (sCtx) {
              renderSyntheticCameraFeed(sCtx, 1920, 1080, (now - startTime) / 1000);
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

          // Live Histogram (~8fps)
          if (s.showHistogram && now - lastHistogramTime > 125) {
            setHistogram(computeHistogram(ctx, targetW, targetH));
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

  // Keyboard shortcuts (Space, R, M, F, G, L, H)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

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
      } else if (e.key.toLowerCase() === 'h') {
        setInspectorCollapsed((v) => !v);
      } else if (e.key.toLowerCase() === 'g') {
        const order: GridOverlayId[] = ['none', 'thirds', 'golden', 'crosshair', 'cinema'];
        setGridOverlay((curr) => order[(order.indexOf(curr) + 1) % order.length]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [triggerPhotoCapture, toggleRecording]);

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

  return (
    <div className="h-screen w-screen flex flex-col studio-ambient-bg text-zinc-100 overflow-hidden">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        galleryCount={galleryItems.length}
        cameraStatus={cameraStatus}
        onConnectCamera={() => startCameraStream(selectedVideoId, selectedAudioId)}
        onQuickCapture={() => triggerPhotoCapture()}
        inspectorCollapsed={inspectorCollapsed}
        onToggleInspectorCollapsed={() => setInspectorCollapsed((v) => !v)}
      />

      {/* Camera permission / demo info strip (only shown if camera isn't live yet) */}
      {cameraStatus !== 'live' && cameraErrorMsg && (
        <div className="px-4 pt-1.5 shrink-0">
          <div className="liquid-glass-dock rounded-full px-4 py-1.5 flex items-center justify-between gap-4 text-xs">
            <span className="text-zinc-200 truncate">{cameraErrorMsg}</span>
            <button
              type="button"
              onClick={() => startCameraStream(selectedVideoId, selectedAudioId)}
              className="text-sky-300 hover:text-sky-200 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              Reintentar permiso de cámara
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {activeTab === 'gallery' ? (
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
        ) : (
          <>
            <CameraViewport
              canvasRef={canvasRef}
              aspectRatio={aspectRatio}
              resolutionWidth={dims.w}
              resolutionHeight={dims.h}
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
              detectedSubjects={detectedSubjects}
              aiStatus={aiStatus}
            />

            {!inspectorCollapsed && (
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
                startCameraStream(id, selectedAudioId, resolutionPreset, aspectRatio);
              }}
              onSelectAudioDevice={(id) => {
                setSelectedAudioId(id);
                startCameraStream(selectedVideoId, id, resolutionPreset, aspectRatio);
              }}
              resolutionPreset={resolutionPreset}
              onChangeResolution={(r) => {
                setResolutionPreset(r);
                startCameraStream(selectedVideoId, selectedAudioId, r, aspectRatio);
              }}
              aspectRatio={aspectRatio}
              onChangeAspectRatio={(ar) => {
                setAspectRatio(ar);
                if (cameraStatus === 'live') {
                  startCameraStream(selectedVideoId, selectedAudioId, resolutionPreset, ar);
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
            />
            )}
          </>
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
        <div className="liquid-glass-dock fixed bottom-20 left-1/2 -translate-x-1/2 z-50 text-white px-4 py-2 rounded-full text-xs font-medium flex items-center gap-3">
          <span>{toastMsg}</span>
          <button
            type="button"
            onClick={() => {
              setToastMsg(null);
              setActiveTab('gallery');
            }}
            className="text-sky-300 hover:text-sky-200 font-semibold cursor-pointer"
          >
            Ver galería
          </button>
        </div>
      )}
    </div>
  );
}
