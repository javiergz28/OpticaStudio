import React, { useState } from 'react';
import {
  Activity,
  Camera,
  Check,
  Copy,
  Crosshair,
  Eye,
  FileText,
  FlipHorizontal,
  FlipVertical,
  Focus,
  Grid,
  Layers,
  Lock,
  Maximize2,
  Mic,
  MicOff,
  Monitor,
  Move,
  Palette,
  PictureInPicture2,
  Pipette,
  QrCode,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ShieldAlert,
  Sliders,
  Sun,
  Timer,
  Unlock,
  Upload,
  UserCheck,
  Video,
  Volume2,
  VolumeX,
  Wand2,
} from 'lucide-react';
import {
  DEFAULT_ADJUSTMENTS,
  DEFAULT_FOCUS_SETTINGS,
  FILTER_PRESETS,
  SOLID_BACKGROUND_COLORS,
  VIRTUAL_BACKGROUNDS,
  VISUAL_EFFECTS,
  type AiSubjectBox,
  type AiVisionStatus,
  type AspectRatioId,
  type AudioConsoleSettings,
  type BackgroundReplaceMode,
  type BackgroundSegmentationSettings,
  type ColorAdjustments,
  type DualCameraSettings,
  type FilterPresetId,
  type FocusAreaSize,
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
} from '../types/camera';
import type { HistogramData } from '../utils/canvasProcessor';
import type { EngineCompatibilityItem, EngineMode } from '../engine/engineCompatibility';
import type { CompositorBackendKind } from '../engine/programCompositor';
import type {
  AddRealSourceRequest,
  AddRealSourceResult,
  CompositionHistoryStatus,
  PreferredCompositorBackend,
  RemoveSourceResult,
  StudioDiagnosticsSnapshot,
} from '../engine/studioCoordinator';
import type {
  CameraAspectPreset,
  LayerMaskShape,
  LayerStyle,
  LayerTransform,
  SceneLayer,
  SceneTransition,
  StudioPresetId,
  StudioScene,
  StudioSource,
} from '../types/studio';
import {
  ADAPTABLE_COMPOSITIONS,
  type AdaptableSceneLayoutId,
  computeLayerAspectTransform,
  computeProportionalLayerTransform,
  computeScaledLayerWidthTransform,
  getLayerNormalizedRect,
  isVisualSourceEditable,
  rectToLayerTransform,
  resolveTargetEditableLayer,
} from '../engine/layerEditor';
import type {
  AppearanceSettings,
  ResolvedAppearanceState,
} from '../utils/appearanceSettings';
import { AppearanceControls } from './AppearanceControls';
import {
  GlassButton,
  GlassDisclosure,
  GlassIconButton,
  GlassInspector,
  GlassSegmentedControl,
  GlassSelect,
  GlassSlider,
  GlassStatusIndicator,
  GlassToggle,
} from './glass';

export interface StudioEnginePanelProps {
  engineMode: EngineMode;
  backendKind: CompositorBackendKind | 'none';
  preferredBackend: PreferredCompositorBackend;
  isRecordingLocked: boolean;
  activeSceneId: string;
  scenes: StudioScene[];
  projectSources: StudioSource[];
  sources: StudioDiagnosticsSnapshot['sources'];
  outputWidth: number;
  outputHeight: number;
  selectedLayerId: string | null;
  hasLiveDisplaySource: boolean;
  lastError: string | null;
  historyStatus?: CompositionHistoryStatus;
  diagnosticsSnapshot: StudioDiagnosticsSnapshot | null;
  compatibilityMatrix: readonly EngineCompatibilityItem[];
  onSwitchEngineMode: (mode: EngineMode) => Promise<void> | void;
  onSwitchScene: (
    sceneId: string,
    transitionOverride?: Partial<Pick<SceneTransition, 'type' | 'durationMs'>>
  ) => void;
  onActivatePresetScene: (
    presetId: StudioPresetId,
    transitionOverride?: Partial<Pick<SceneTransition, 'type' | 'durationMs'>>
  ) => void;
  onAuthorizeDisplaySource: (sourceId?: string) => void;
  onReconnectSource?: (sourceId: string) => void;
  onAddDisplaySource?: (kind: 'screen' | 'window') => Promise<void> | void;
  onChangeBackendPreference: (backend: PreferredCompositorBackend) => void;
  onRecoverCanvas2dFallback: () => void;
  onRefreshDiagnostics: () => void;
  onResetProject: () => void;
  onSelectLayer: (layerId: string | null) => void;
  onUpdateLayerTransform: (
    sceneId: string,
    layerId: string,
    transformPatch: Partial<LayerTransform>,
    options?: { preserveAspectK?: number; historyGroupKey?: string; historyLabel?: string }
  ) => void;
  onUpdateLayerStyle?: (
    sceneId: string,
    layerId: string,
    stylePatch: Partial<LayerStyle>,
    options?: { historyGroupKey?: string; historyLabel?: string }
  ) => void;
  onApplyAdaptableLayout?: (
    sceneId: string,
    layoutId: AdaptableSceneLayoutId,
    options?: {
      participatingLayerIds?: string[];
      primaryDisplayLayerId?: string;
      secondaryDisplayLayerId?: string;
      primaryCameraLayerId?: string;
    }
  ) => void;
  onToggleLayerLock: (sceneId: string, layerId: string, locked: boolean) => void;
  onReorderLayers?: (sceneId: string, orderedLayerIds: string[]) => void;
  onMoveLayerOrder?: (
    sceneId: string,
    layerId: string,
    direction: 'up' | 'down' | 'top' | 'bottom'
  ) => void;
  onPlaceLayerBehindCamera?: (sceneId: string, layerId: string) => void;
  onToggleLayerVisible?: (
    sceneId: string,
    layerId: string,
    visible: boolean
  ) => Promise<{ ok: boolean; reason?: string } | void> | void;
  onRenameLayer?: (sceneId: string, layerId: string, newName: string) => void;
  onDuplicateLayer?: (
    sceneId: string,
    layerId: string
  ) => { ok: boolean; layer?: SceneLayer | null } | void;
  onResetLayerTransform?: (sceneId: string, layerId: string) => void;
  onResetLayerStyle?: (sceneId: string, layerId: string) => void;
  onRemoveLayer?: (sceneId: string, layerId: string) => { ok: boolean; reason?: string } | void;
  onAddRealSource?: (
    sceneId: string,
    request: AddRealSourceRequest
  ) => Promise<AddRealSourceResult>;
  onAddExistingSourceToScene?: (
    sceneId: string,
    sourceId: string,
    options?: { placement?: 'behind-camera' | 'top'; name?: string }
  ) => Promise<AddRealSourceResult>;
  onRenameProjectSource?: (
    sourceId: string,
    newName: string
  ) => { ok: boolean; reason?: string };
  onRemoveSourceSafely?: (sourceId: string) => Promise<RemoveSourceResult>;
  onEnumerateDevices?: () => Promise<Array<{ deviceId: string; kind: string; label: string }>>;
  onUndo?: () => Promise<void> | void;
  onRedo?: () => Promise<void> | void;
}

interface SidebarControlsProps {
  activeTab: WorkspaceTab;
  onChangeTab: (tab: WorkspaceTab) => void;
  videoDevices: MediaDeviceInfo[];
  audioDevices: MediaDeviceInfo[];
  selectedVideoId: string;
  selectedAudioId: string;
  sensorSize: { w: number; h: number };
  cameraStatus: 'idle' | 'live' | 'error';
  onRefreshDevices: () => void;
  onSelectVideoDevice: (id: string) => void;
  onSelectAudioDevice: (id: string) => void;
  resolutionPreset: ResolutionPresetId;
  onChangeResolution: (r: ResolutionPresetId) => void;
  aspectRatio: AspectRatioId;
  onChangeAspectRatio: (a: AspectRatioId) => void;
  fitMode: FrameFitMode;
  onChangeFitMode: (f: FrameFitMode) => void;
  rotation: RotationDeg;
  onRotate90: () => void;
  mirror: boolean;
  onToggleMirror: () => void;
  flipVertical: boolean;
  onToggleFlipVertical: () => void;
  zoom: number;
  onChangeZoom: (z: number) => void;
  panX: number;
  panY: number;
  onChangePan: (x: number, y: number) => void;
  focus: FocusSettings;
  onChangeFocus: (updater: (prev: FocusSettings) => FocusSettings) => void;
  hardwareFocusSupported: boolean;
  stabilization: StabilizationSettings;
  onChangeStabilization: (
    updater: (prev: StabilizationSettings) => StabilizationSettings
  ) => void;
  filterId: FilterPresetId;
  onChangeFilter: (f: FilterPresetId) => void;
  effectId: VisualEffectId;
  onChangeEffect: (e: VisualEffectId) => void;
  background: BackgroundSegmentationSettings;
  onChangeBackground: (
    updater: (prev: BackgroundSegmentationSettings) => BackgroundSegmentationSettings
  ) => void;
  onCalibrateBackground: () => void;
  onClearBackgroundCalibration: () => void;
  onCaptureWindowAsBackground: () => void;
  onCaptureWindow: () => void;
  detectedSubjects: AiSubjectBox[];
  aiStatus: { segmenter: AiVisionStatus; detector: AiVisionStatus };
  adjustments: ColorAdjustments;
  onChangeAdjustments: (updater: (prev: ColorAdjustments) => ColorAdjustments) => void;
  abSplitEnabled: boolean;
  onToggleAbSplit: () => void;
  ringLight: RingLightSettings;
  onChangeRingLight: (updater: (prev: RingLightSettings) => RingLightSettings) => void;
  timerSeconds: number;
  onChangeTimerSeconds: (s: number) => void;
  flashEnabled: boolean;
  onToggleFlash: () => void;
  soundMuted: boolean;
  onToggleSoundMuted: () => void;
  onStartPhotoBooth: (theme: 'dark' | 'polaroid') => void;
  onStartBurst: () => void;
  timelapseActive: boolean;
  timelapseIntervalSec: number;
  timelapseCount: number;
  onChangeTimelapseInterval: (s: number) => void;
  onToggleTimelapse: () => void;
  motionActive: boolean;
  onToggleMotion: () => void;
  motionSensitivity: number;
  onChangeMotionSensitivity: (s: number) => void;
  motionScore: number;
  motionEvents: MotionEvent[];
  isRecording: boolean;
  onToggleRecord: () => void;
  recordingFormatPref: RecordingFormatPref;
  onChangeRecordingFormatPref: (fmt: RecordingFormatPref) => void;
  audioConsole: AudioConsoleSettings;
  onChangeAudioConsole: (updater: (prev: AudioConsoleSettings) => AudioConsoleSettings) => void;
  micMuted: boolean;
  onToggleMicMuted: () => void;
  audioLevel: number;
  isScreenPipActive: boolean;
  onToggleScreenPip: () => void;
  screenLayout: ScreenLayoutMode;
  onChangeScreenLayout: (m: ScreenLayoutMode) => void;
  pipCorner: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  onChangePipCorner: (c: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left') => void;
  pipCircular: boolean;
  onTogglePipCircular: () => void;
  pipSizeRatio: number;
  onChangePipSizeRatio: (r: number) => void;
  dualCam: DualCameraSettings;
  onChangeDualCam: (updater: (prev: DualCameraSettings) => DualCameraSettings) => void;
  onSwapCameras: () => void;
  isOutputPipActive: boolean;
  onToggleOutputPip: () => void;
  onResetAllPreferences: () => void;
  teleprompter: TeleprompterSettings;
  onChangeTeleprompter: (updater: (prev: TeleprompterSettings) => TeleprompterSettings) => void;
  gridOverlay: GridOverlayId;
  onChangeGridOverlay: (g: GridOverlayId) => void;
  branding: OverlayBranding;
  onChangeBranding: (updater: (prev: OverlayBranding) => OverlayBranding) => void;
  histogram: HistogramData | null;
  showHistogram: boolean;
  onToggleHistogram: () => void;
  eyedropperActive: boolean;
  onToggleEyedropper: () => void;
  sampledColor: SampledColor | null;
  qrSupported: boolean;
  qrScanning: boolean;
  onToggleQrScanning: () => void;
  lastQrResult: string | null;
  onQuickDocumentScan: () => void;
  studioEnginePanel?: StudioEnginePanelProps;
  appearanceSettings?: AppearanceSettings;
  resolvedAppearance?: ResolvedAppearanceState;
  onUpdateAppearance?: (
    updater:
      | Partial<AppearanceSettings>
      | ((prev: AppearanceSettings) => AppearanceSettings)
  ) => void;
  onResetAppearance?: () => void;
  studioLabOpen?: boolean;
  onToggleStudioLabOpen?: (open: boolean) => void;
}

export const SidebarControls: React.FC<SidebarControlsProps> = (props) => {
  const { activeTab } = props;
  const [studioSubTab, setStudioSubTab] = useState<'optics' | 'utilities' | 'overlays'>('optics');
  const [filterCat, setFilterCat] = useState<'all' | 'instagram' | 'cinema' | 'classic'>('all');
  const [effectCat, setEffectCat] = useState<
    'all' | 'cartoon' | 'cinema' | 'retro' | 'geometry'
  >('all');
  const [copiedHex, setCopiedHex] = useState(false);
  const [copiedQr, setCopiedQr] = useState(false);
  const [internalStudioLabOpen, setInternalStudioLabOpen] = useState(false);
  const [studioTransitionType, setStudioTransitionType] = useState<'cut' | 'fade'>('fade');
  const [showCompatMatrix, setShowCompatMatrix] = useState(false);
  const [compPrimaryDisplayId, setCompPrimaryDisplayId] = useState<string>('');
  const [compSecondaryDisplayId, setCompSecondaryDisplayId] = useState<string>('');

  const isStudioLabOpen = props.studioLabOpen ?? internalStudioLabOpen;
  const setStudioLabOpen = (next: boolean) => {
    if (props.onToggleStudioLabOpen) {
      props.onToggleStudioLabOpen(next);
    } else {
      setInternalStudioLabOpen(next);
    }
  };

  const handleCopyText = (txt: string, type: 'hex' | 'qr') => {
    navigator.clipboard?.writeText(txt).catch(() => {});
    if (type === 'hex') {
      setCopiedHex(true);
      setTimeout(() => setCopiedHex(false), 1400);
    } else {
      setCopiedQr(true);
      setTimeout(() => setCopiedQr(false), 1400);
    }
  };

  if (activeTab === 'gallery') return null;

  const zoomPresetOptions = [
    { id: '1', label: '1×' },
    { id: '1.5', label: '1.5×' },
    { id: '2', label: '2×' },
    { id: '3', label: '3×' },
    { id: '4', label: '4×' },
  ] as const;

  const matchedZoomPreset =
    zoomPresetOptions.find((opt) => Math.abs(props.zoom - parseFloat(opt.id)) < 0.08)?.id ?? '1';

  const studioPanel = props.studioEnginePanel;
  const activeStudioScene =
    studioPanel?.engineMode === 'studio'
      ? studioPanel.scenes.find((s) => s.id === studioPanel.activeSceneId) ?? null
      : null;
  const projectSources = studioPanel?.projectSources ?? [];
  const visualLayersInScene = activeStudioScene
    ? [...activeStudioScene.layers]
        .filter((l) =>
          isVisualSourceEditable(projectSources.find((s) => s.id === l.sourceId))
        )
        .sort((a, b) => b.zIndex - a.zIndex)
    : [];
  const displayLayersInScene = visualLayersInScene.filter((l) => {
    const k = projectSources.find((s) => s.id === l.sourceId)?.kind;
    return k === 'screen' || k === 'window';
  });
  const resolvedPrimaryDisplayId = displayLayersInScene.some(
    (l) => l.id === compPrimaryDisplayId
  )
    ? compPrimaryDisplayId
    : displayLayersInScene[0]?.id ?? '';
  const secondaryDisplayCandidates = displayLayersInScene.filter(
    (l) => l.id !== resolvedPrimaryDisplayId
  );
  const resolvedSecondaryDisplayId = secondaryDisplayCandidates.some(
    (l) => l.id === compSecondaryDisplayId
  )
    ? compSecondaryDisplayId
    : secondaryDisplayCandidates[0]?.id ?? '';
  const activeEditableLayer = activeStudioScene
    ? resolveTargetEditableLayer(
        activeStudioScene,
        projectSources,
        studioPanel?.selectedLayerId ?? null
      )
    : null;
  const activeEditableSource = activeEditableLayer
    ? projectSources.find((s) => s.id === activeEditableLayer.sourceId) ?? null
    : null;
  const activeEditableRuntime = activeEditableSource
    ? studioPanel?.sources.find((s) => s.id === activeEditableSource.id) ?? null
    : null;
  const activeEditableDiagLayer = activeEditableLayer
    ? studioPanel?.diagnosticsSnapshot?.layerDiagnostics.find(
        (l) => l.layerId === activeEditableLayer.id
      ) ?? null
    : null;
  const isCameraTarget = activeEditableSource?.kind === 'camera';
  const isDisplayTarget =
    activeEditableSource?.kind === 'window' || activeEditableSource?.kind === 'screen';
  const activeIntrinsicW = isCameraTarget
    ? activeEditableDiagLayer?.intrinsicWidth || props.sensorSize.w
    : activeEditableDiagLayer?.intrinsicWidth ||
      (activeEditableSource &&
      'intrinsicWidth' in activeEditableSource &&
      activeEditableSource.intrinsicWidth
        ? activeEditableSource.intrinsicWidth
        : 0) ||
      studioPanel?.outputWidth ||
      1920;
  const activeIntrinsicH = isCameraTarget
    ? activeEditableDiagLayer?.intrinsicHeight || props.sensorSize.h
    : activeEditableDiagLayer?.intrinsicHeight ||
      (activeEditableSource &&
      'intrinsicHeight' in activeEditableSource &&
      activeEditableSource.intrinsicHeight
        ? activeEditableSource.intrinsicHeight
        : 0) ||
      studioPanel?.outputHeight ||
      1080;
  const editableLayerRect = activeEditableLayer
    ? getLayerNormalizedRect(activeEditableLayer.transform)
    : null;
  const isEditableLayerSelected = Boolean(
    activeEditableLayer && studioPanel?.selectedLayerId === activeEditableLayer.id
  );
  const editableAspectPreset: CameraAspectPreset =
    activeEditableLayer?.transform.aspectPreset ?? 'sensor';
  const editableMaskShape: LayerMaskShape =
    activeEditableLayer?.style.maskShape ?? 'rect';
  const editableBorderEnabled = activeEditableLayer
    ? (activeEditableLayer.style.borderEnabled ??
      activeEditableLayer.style.borderWidthPx > 0)
    : false;
  const editableFeatherPx = activeEditableLayer?.style.featherPx ?? 0;
  const editableCrop = activeEditableLayer?.transform.crop ?? {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  };
  const hasActiveCrop =
    editableCrop.top > 0.001 ||
    editableCrop.bottom > 0.001 ||
    editableCrop.left > 0.001 ||
    editableCrop.right > 0.001;
  const editableSourceKindLabel =
    activeEditableSource?.kind === 'camera'
      ? 'Cámara'
      : activeEditableSource?.kind === 'window'
        ? 'Ventana'
        : activeEditableSource?.kind === 'screen'
          ? 'Pantalla'
          : activeEditableSource?.kind === 'image'
            ? 'Imagen'
            : activeEditableSource?.kind === 'video-file'
              ? 'Video'
              : activeEditableSource?.kind === 'text'
                ? 'Texto'
                : activeEditableSource?.kind === 'color' ||
                    activeEditableSource?.kind === 'gradient'
                  ? 'Fondo'
                  : 'Capa visual';

  const maskShapeLabels: Record<LayerMaskShape, string> = {
    rect: 'Rectángulo',
    square: 'Cuadrado',
    rounded: 'Redondeado',
    squircle: 'Squircle',
    circle: 'Círculo',
    ellipse: 'Elipse',
  };

  return (
    <GlassInspector ariaLabel="Inspector contextual de Óptica Studio">
      {/* Subnavegación segmentada del espacio Estudio */}
      {(activeTab === 'studio' || activeTab === 'utilities') && (
        <div className="px-4 pt-3 pb-2.5 border-b border-[var(--border-hairline)] shrink-0">
          <GlassSegmentedControl<'optics' | 'utilities' | 'overlays'>
            fullWidth
            size="xs"
            layoutGroupId="inspector-studio-subtab"
            ariaLabel="Secciones del inspector de estudio"
            value={studioSubTab}
            onChange={setStudioSubTab}
            options={[
              { id: 'optics', label: 'Óptica' },
              { id: 'utilities', label: 'Utilidades' },
              { id: 'overlays', label: 'Marcos' },
            ]}
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto studio-scroll px-4 pb-4">
        {/* ======================== STUDIO -> OPTICS, ZOOM & FOCUS ======================== */}
        {(activeTab === 'studio' || activeTab === 'utilities') && studioSubTab === 'optics' && (
          <>
            <GlassDisclosure
              title="Cámara física"
              subtitle={
                studioPanel?.engineMode === 'studio'
                  ? 'Hardware y salida óptica base'
                  : undefined
              }
              defaultOpen={studioPanel?.engineMode !== 'studio' || isCameraTarget}
              badge={
                <GlassIconButton
                  size="sm"
                  label="Actualizar lista de cámaras"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onRefreshDevices();
                  }}
                >
                  <RefreshCw className="w-3 h-3" />
                </GlassIconButton>
              }
            >
              <div className="space-y-2">
                <GlassSelect
                  aria-label="Seleccionar cámara principal"
                  value={props.selectedVideoId}
                  onChange={(e) => props.onSelectVideoDevice(e.target.value)}
                >
                  {props.videoDevices.length === 0 ? (
                    <option value="">Cámara predeterminada (FaceTime HD)</option>
                  ) : (
                    props.videoDevices.map((d, idx) => (
                      <option key={d.deviceId || idx} value={d.deviceId}>
                        {d.label || `Cámara ${idx + 1}`}
                      </option>
                    ))
                  )}
                </GlassSelect>
                <div className="flex items-center justify-between px-1 text-[11px] font-mono tabular-nums text-[var(--text-tertiary)]">
                  <span>
                    Sensor {props.sensorSize.w}×{props.sensorSize.h}
                  </span>
                  <span
                    className={
                      props.cameraStatus === 'live' &&
                      props.sensorSize.w < props.sensorSize.h &&
                      props.rotation % 180 === 0
                        ? 'text-[var(--accent-amber)]'
                        : 'text-[var(--accent-green)]'
                    }
                  >
                    {props.sensorSize.w < props.sensorSize.h ? 'Vertical' : 'Horizontal'}
                    {props.rotation !== 0 ? ` · ${props.rotation}°` : ''}
                  </span>
                </div>
              </div>

              <GlassSegmentedControl<AspectRatioId>
                fullWidth
                size="xs"
                layoutGroupId="inspector-aspect-ratio"
                ariaLabel="Relación de aspecto"
                value={props.aspectRatio}
                onChange={props.onChangeAspectRatio}
                options={[
                  { id: '16:9', label: '16:9' },
                  { id: 'native', label: 'Sensor' },
                  { id: '4:3', label: '4:3' },
                  { id: '1:1', label: '1:1' },
                  { id: '9:16', label: '9:16' },
                ]}
              />

              <GlassSegmentedControl<FrameFitMode>
                fullWidth
                size="xs"
                layoutGroupId="inspector-fit-mode"
                ariaLabel="Ajuste de encuadre"
                value={props.fitMode}
                onChange={props.onChangeFitMode}
                options={[
                  { id: 'cover', label: 'Llenar bordes' },
                  { id: 'contain', label: 'Todo sin recorte' },
                ]}
              />

              <div className="grid grid-cols-3 gap-1.5">
                <GlassButton
                  size="sm"
                  variant={props.mirror ? 'amber' : 'regular'}
                  selected={props.mirror}
                  onClick={props.onToggleMirror}
                  leadingIcon={<FlipHorizontal className="w-3.5 h-3.5" />}
                >
                  Espejo
                </GlassButton>
                <GlassButton
                  size="sm"
                  variant={props.rotation !== 0 ? 'amber' : 'regular'}
                  selected={props.rotation !== 0}
                  onClick={props.onRotate90}
                  leadingIcon={<RotateCw className="w-3.5 h-3.5" />}
                >
                  {props.rotation === 0 ? 'Rotar 90°' : `${props.rotation}°`}
                </GlassButton>
                <GlassButton
                  size="sm"
                  variant={props.flipVertical ? 'amber' : 'regular'}
                  selected={props.flipVertical}
                  onClick={props.onToggleFlipVertical}
                  leadingIcon={<FlipVertical className="w-3.5 h-3.5" />}
                >
                  Voltear
                </GlassButton>
              </div>
            </GlassDisclosure>

            {studioPanel?.engineMode === 'studio' &&
              activeStudioScene &&
              activeEditableLayer &&
              editableLayerRect && (
                <>
                  <div className="py-2.5 border-b border-[var(--border-hairline)] space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--text-primary)] truncate">
                        {isDisplayTarget ? (
                          <Monitor className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0" />
                        ) : isCameraTarget ? (
                          <Camera className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0" />
                        ) : (
                          <Layers className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0" />
                        )}
                        Capa en edición · {editableSourceKindLabel}
                      </span>
                      <span className="font-mono tabular-nums text-[10px] text-[var(--text-tertiary)] shrink-0">
                        {isDisplayTarget && activeEditableRuntime?.status !== 'live'
                          ? 'Sin captura'
                          : `${Math.round(activeIntrinsicW)}×${Math.round(activeIntrinsicH)}`}
                      </span>
                    </div>

                    {visualLayersInScene.length > 0 && (
                      <GlassSelect
                        aria-label="Seleccionar capa visual a editar"
                        value={activeEditableLayer.id}
                        onChange={(e) => studioPanel.onSelectLayer(e.target.value)}
                      >
                        {visualLayersInScene.map((layer) => {
                          const src = projectSources.find((s) => s.id === layer.sourceId);
                          const tag =
                            src?.kind === 'camera'
                              ? 'Cámara'
                              : src?.kind === 'window'
                                ? 'Ventana'
                                : src?.kind === 'screen'
                                  ? 'Pantalla'
                                  : src?.kind === 'image'
                                    ? 'Imagen'
                                    : src?.kind === 'video-file'
                                      ? 'Video'
                                      : src?.kind === 'text'
                                        ? 'Texto'
                                        : 'Fondo';
                          return (
                            <option key={layer.id} value={layer.id}>
                              {layer.name} ({tag} · z:{layer.zIndex})
                            </option>
                          );
                        })}
                      </GlassSelect>
                    )}

                    {isDisplayTarget && activeEditableSource && (
                      <GlassButton
                        size="xs"
                        className="w-full"
                        variant={activeEditableRuntime?.status === 'live' ? 'regular' : 'primary'}
                        onClick={() => studioPanel.onAuthorizeDisplaySource(activeEditableSource.id)}
                        leadingIcon={<Monitor className="w-3.5 h-3.5" />}
                      >
                        {activeEditableRuntime?.status === 'live'
                          ? 'Cambiar ventana o pantalla'
                          : 'Compartir ventana o pantalla'}
                      </GlassButton>
                    )}

                    {!isCameraTarget && (
                      <p className="text-[10px] text-[var(--text-tertiary)] leading-snug">
                        Editando «{activeEditableLayer.name}» con resolución original. Los filtros, enfoque e IA solo se aplican a la cámara física.
                      </p>
                    )}
                  </div>

                  <GlassDisclosure
                    title="Transformación"
                    subtitle="Posición, tamaño, rotación y composición"
                    defaultOpen
                    icon={<Move className="w-4 h-4 text-[var(--accent-blue)]" />}
                    badge={
                      <span className="font-mono tabular-nums text-[10px] text-[var(--text-tertiary)]">
                        {activeEditableLayer.locked
                          ? 'Bloqueada'
                          : `${Math.round(editableLayerRect.width * 100)}×${Math.round(
                              editableLayerRect.height * 100
                            )}%`}
                      </span>
                    }
                  >
                    <div className="flex items-center gap-1.5">
                      <GlassButton
                        size="xs"
                        className="flex-1"
                        variant={isEditableLayerSelected ? 'primary' : 'regular'}
                        selected={isEditableLayerSelected}
                        onClick={() =>
                          studioPanel.onSelectLayer(
                            isEditableLayerSelected ? null : activeEditableLayer.id
                          )
                        }
                        leadingIcon={<Move className="w-3 h-3" />}
                      >
                        {isEditableLayerSelected ? 'Seleccionada en visor' : 'Editar en visor'}
                      </GlassButton>
                      <GlassIconButton
                        size="sm"
                        variant={activeEditableLayer.locked ? 'amber' : 'regular'}
                        selected={activeEditableLayer.locked}
                        label={
                          activeEditableLayer.locked
                            ? `Desbloquear ${activeEditableLayer.name}`
                            : `Bloquear ${activeEditableLayer.name}`
                        }
                        onClick={() =>
                          studioPanel.onToggleLayerLock(
                            activeStudioScene.id,
                            activeEditableLayer.id,
                            !activeEditableLayer.locked
                          )
                        }
                      >
                        {activeEditableLayer.locked ? (
                          <Lock className="w-3.5 h-3.5" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5" />
                        )}
                      </GlassIconButton>
                    </div>

                    <div className="grid grid-cols-4 gap-1">
                      <GlassButton
                        size="xs"
                        title="Colocar inmediatamente detrás de la cámara"
                        onClick={() =>
                          studioPanel.onPlaceLayerBehindCamera?.(
                            activeStudioScene.id,
                            activeEditableLayer.id
                          )
                        }
                      >
                        Detrás
                      </GlassButton>
                      <GlassButton
                        size="xs"
                        title="Traer al frente"
                        onClick={() =>
                          studioPanel.onMoveLayerOrder?.(
                            activeStudioScene.id,
                            activeEditableLayer.id,
                            'top'
                          )
                        }
                      >
                        Frente
                      </GlassButton>
                      <GlassButton
                        size="xs"
                        title="Subir un nivel"
                        onClick={() =>
                          studioPanel.onMoveLayerOrder?.(
                            activeStudioScene.id,
                            activeEditableLayer.id,
                            'up'
                          )
                        }
                      >
                        Subir
                      </GlassButton>
                      <GlassButton
                        size="xs"
                        title="Bajar un nivel"
                        onClick={() =>
                          studioPanel.onMoveLayerOrder?.(
                            activeStudioScene.id,
                            activeEditableLayer.id,
                            'down'
                          )
                        }
                      >
                        Bajar
                      </GlassButton>
                    </div>
                    {isDisplayTarget &&
                      props.background.mode !== 'transparent' &&
                      visualLayersInScene.some((camL) => {
                        const camSrc = projectSources.find((s) => s.id === camL.sourceId);
                        return (
                          camSrc?.kind === 'camera' &&
                          camL.visible &&
                          camL.zIndex > activeEditableLayer.zIndex &&
                          camL.transform.width >= 0.92 &&
                          camL.transform.height >= 0.92 &&
                          camL.style.opacity >= 0.98
                        );
                      }) && (
                        <p className="text-[10px] text-[var(--accent-amber)] leading-snug">
                          Detrás de cámara a pantalla completa · activa Transparencia IA o aplica una composición PiP.
                        </p>
                      )}

                    <GlassSlider
                      label="Tamaño libre de capa"
                      min={8}
                      max={100}
                      step={1}
                      disabled={activeEditableLayer.locked}
                      value={Math.round(editableLayerRect.width * 100)}
                      displayValue={`${Math.round(editableLayerRect.width * 100)}%`}
                      onChange={(pct) => {
                        const next = computeScaledLayerWidthTransform(
                          activeEditableLayer.transform,
                          pct / 100,
                          {
                            scene: activeStudioScene,
                            layer: activeEditableLayer,
                            sources: studioPanel.projectSources,
                          }
                        );
                        studioPanel.onUpdateLayerTransform(
                          activeStudioScene.id,
                          activeEditableLayer.id,
                          next.transform,
                          {
                            preserveAspectK:
                              next.transform.height / Math.max(0.01, next.transform.width),
                            historyGroupKey: `layer-width-${activeEditableLayer.id}`,
                            historyLabel: 'Escalar capa',
                          }
                        );
                      }}
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <GlassSlider
                        label="Posición X"
                        min={0}
                        max={Math.max(0, Math.round((1 - editableLayerRect.width) * 100))}
                        step={1}
                        disabled={activeEditableLayer.locked || editableLayerRect.width >= 0.995}
                        value={Math.round(editableLayerRect.left * 100)}
                        displayValue={`${Math.round(editableLayerRect.left * 100)}%`}
                        onChange={(leftPct) => {
                          const next = rectToLayerTransform(
                            {
                              left: leftPct / 100,
                              top: editableLayerRect.top,
                              width: editableLayerRect.width,
                              height: editableLayerRect.height,
                            },
                            activeEditableLayer.transform
                          );
                          studioPanel.onUpdateLayerTransform(
                            activeStudioScene.id,
                            activeEditableLayer.id,
                            next,
                            {
                              historyGroupKey: `layer-x-${activeEditableLayer.id}`,
                              historyLabel: 'Mover capa horizontalmente',
                            }
                          );
                        }}
                      />
                      <GlassSlider
                        label="Posición Y"
                        min={0}
                        max={Math.max(0, Math.round((1 - editableLayerRect.height) * 100))}
                        step={1}
                        disabled={activeEditableLayer.locked || editableLayerRect.height >= 0.995}
                        value={Math.round(editableLayerRect.top * 100)}
                        displayValue={`${Math.round(editableLayerRect.top * 100)}%`}
                        onChange={(topPct) => {
                          const next = rectToLayerTransform(
                            {
                              left: editableLayerRect.left,
                              top: topPct / 100,
                              width: editableLayerRect.width,
                              height: editableLayerRect.height,
                            },
                            activeEditableLayer.transform
                          );
                          studioPanel.onUpdateLayerTransform(
                            activeStudioScene.id,
                            activeEditableLayer.id,
                            next,
                            {
                              historyGroupKey: `layer-y-${activeEditableLayer.id}`,
                              historyLabel: 'Mover capa verticalmente',
                            }
                          );
                        }}
                      />
                    </div>

                    <GlassSlider
                      label="Rotación de capa"
                      min={0}
                      max={359}
                      step={1}
                      disabled={activeEditableLayer.locked}
                      value={Math.round(
                        ((activeEditableLayer.transform.rotationDeg % 360) + 360) % 360
                      )}
                      displayValue={`${Math.round(
                        ((activeEditableLayer.transform.rotationDeg % 360) + 360) % 360
                      )}°`}
                      onReset={() =>
                        studioPanel.onUpdateLayerTransform(
                          activeStudioScene.id,
                          activeEditableLayer.id,
                          { rotationDeg: 0 }
                        )
                      }
                      onChange={(deg) =>
                        studioPanel.onUpdateLayerTransform(
                          activeStudioScene.id,
                          activeEditableLayer.id,
                          { rotationDeg: deg },
                          {
                            historyGroupKey: `layer-rot-${activeEditableLayer.id}`,
                            historyLabel: 'Rotar capa',
                          }
                        )
                      }
                    />

                    <div className="grid grid-cols-3 gap-1.5">
                      <GlassButton
                        size="xs"
                        disabled={activeEditableLayer.locked}
                        selected={Boolean(activeEditableLayer.transform.flipH)}
                        variant={activeEditableLayer.transform.flipH ? 'amber' : 'regular'}
                        onClick={() =>
                          studioPanel.onUpdateLayerTransform(
                            activeStudioScene.id,
                            activeEditableLayer.id,
                            { flipH: !activeEditableLayer.transform.flipH }
                          )
                        }
                        leadingIcon={<FlipHorizontal className="w-3 h-3" />}
                      >
                        Espejo H
                      </GlassButton>
                      <GlassButton
                        size="xs"
                        disabled={activeEditableLayer.locked}
                        selected={Boolean(activeEditableLayer.transform.flipV)}
                        variant={activeEditableLayer.transform.flipV ? 'amber' : 'regular'}
                        onClick={() =>
                          studioPanel.onUpdateLayerTransform(
                            activeStudioScene.id,
                            activeEditableLayer.id,
                            { flipV: !activeEditableLayer.transform.flipV }
                          )
                        }
                        leadingIcon={<FlipVertical className="w-3 h-3" />}
                      >
                        Volteo V
                      </GlassButton>
                      <GlassButton
                        size="xs"
                        disabled={activeEditableLayer.locked}
                        onClick={() =>
                          studioPanel.onUpdateLayerTransform(
                            activeStudioScene.id,
                            activeEditableLayer.id,
                            {
                              rotationDeg:
                                (Math.round(activeEditableLayer.transform.rotationDeg) + 90) % 360,
                            }
                          )
                        }
                        leadingIcon={<RotateCw className="w-3 h-3" />}
                      >
                        +90°
                      </GlassButton>
                    </div>

                    <div className="space-y-2 pt-1">
                      <div className="text-[11px] font-medium text-[var(--text-secondary)]">
                        Composición adaptable
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            { id: 'corner-top-left', label: 'Sup. Izq' },
                            { id: 'corner-top-right', label: 'Sup. Der' },
                            { id: 'center', label: 'Centro' },
                            { id: 'corner-bottom-left', label: 'Inf. Izq' },
                            { id: 'corner-bottom-right', label: 'Inf. Der' },
                            { id: 'camera-full', label: '100%' },
                          ] as const satisfies ReadonlyArray<{
                            id: AdaptableSceneLayoutId;
                            label: string;
                          }>
                        ).map((layout) => (
                          <GlassButton
                            key={layout.id}
                            size="xs"
                            disabled={activeEditableLayer.locked}
                            onClick={() =>
                              studioPanel.onApplyAdaptableLayout?.(
                                activeStudioScene.id,
                                layout.id
                              )
                            }
                          >
                            {layout.label}
                          </GlassButton>
                        ))}
                      </div>

                      <div className="text-[10px] font-medium text-[var(--text-tertiary)] pt-1">
                        Composición multicapa
                      </div>
                      {displayLayersInScene.length >= 2 && (
                        <div className="grid grid-cols-2 gap-1.5 pb-1">
                          <label className="space-y-0.5">
                            <span className="text-[10px] text-[var(--text-tertiary)]">
                              Principal
                            </span>
                            <GlassSelect
                              aria-label="Pantalla o ventana principal para composición"
                              value={resolvedPrimaryDisplayId}
                              onChange={(e) => setCompPrimaryDisplayId(e.target.value)}
                            >
                              {displayLayersInScene.map((dl) => (
                                <option key={`comp-pri-${dl.id}`} value={dl.id}>
                                  {dl.name}
                                </option>
                              ))}
                            </GlassSelect>
                          </label>
                          <label className="space-y-0.5">
                            <span className="text-[10px] text-[var(--text-tertiary)]">
                              Secundaria
                            </span>
                            <GlassSelect
                              aria-label="Pantalla o ventana secundaria para composición"
                              value={resolvedSecondaryDisplayId}
                              onChange={(e) => setCompSecondaryDisplayId(e.target.value)}
                            >
                              {displayLayersInScene
                                .filter((dl) => dl.id !== resolvedPrimaryDisplayId)
                                .map((dl) => (
                                  <option key={`comp-sec-${dl.id}`} value={dl.id}>
                                    {dl.name}
                                  </option>
                                ))}
                            </GlassSelect>
                          </label>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-1.5">
                        {ADAPTABLE_COMPOSITIONS.map((comp) => (
                          <GlassButton
                            key={comp.id}
                            size="xs"
                            title={comp.description}
                            onClick={() =>
                              studioPanel.onApplyAdaptableLayout?.(
                                activeStudioScene.id,
                                comp.id,
                                displayLayersInScene.length >= 2
                                  ? {
                                      primaryDisplayLayerId: resolvedPrimaryDisplayId || undefined,
                                      secondaryDisplayLayerId:
                                        resolvedSecondaryDisplayId || undefined,
                                    }
                                  : undefined
                              )
                            }
                          >
                            {comp.label}
                          </GlassButton>
                        ))}
                      </div>
                    </div>

                    <p className="text-[10px] text-[var(--text-tertiary)] leading-snug">
                      {activeEditableLayer.locked
                        ? 'Capa bloqueada: desbloquea para mover, escalar o rotar.'
                        : 'Escala libre hasta el 100% para cualquier capa visual sin reiniciar pistas. Flechas mueven · Esc deselecciona.'}
                    </p>
                  </GlassDisclosure>

                  <GlassDisclosure
                    title="Proporción"
                    subtitle="Contenedor de capa independiente"
                    defaultOpen={false}
                    icon={<Maximize2 className="w-4 h-4 text-[var(--accent-blue)]" />}
                    badge={
                      <span className="font-mono tabular-nums text-[10px] text-[var(--text-tertiary)]">
                        {editableAspectPreset === 'sensor'
                          ? isCameraTarget
                            ? 'Sensor'
                            : 'Original'
                          : editableAspectPreset === 'custom'
                            ? `${(activeEditableLayer.transform.customAspectRatio ?? 1.78).toFixed(2)}:1`
                            : editableAspectPreset}
                      </span>
                    }
                  >
                    <p className="text-[10px] text-[var(--text-tertiary)] leading-snug">
                      Cambia el formato de «{activeEditableLayer.name}» sin deformar la fuente ni
                      alterar ProgramCanvas ({studioPanel.outputWidth}×{studioPanel.outputHeight}).
                    </p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(
                        [
                          {
                            id: 'sensor',
                            label: isCameraTarget ? 'Sensor' : 'Original',
                            box: 'w-4 h-2.5',
                          },
                          { id: '16:9', label: '16:9', box: 'w-4 h-2.5' },
                          { id: '4:3', label: '4:3', box: 'w-3.5 h-2.5' },
                          { id: '9:16', label: '9:16', box: 'w-2 h-3.5' },
                          { id: '3:4', label: '3:4', box: 'w-2.5 h-3.5' },
                          { id: '1:1', label: '1:1', box: 'w-3 h-3' },
                          { id: 'custom', label: 'Pers.', box: 'w-3.5 h-3' },
                        ] as const satisfies ReadonlyArray<{
                          id: CameraAspectPreset;
                          label: string;
                          box: string;
                        }>
                      ).map((opt) => (
                        <GlassButton
                          key={opt.id}
                          size="xs"
                          disabled={activeEditableLayer.locked}
                          selected={editableAspectPreset === opt.id}
                          variant={editableAspectPreset === opt.id ? 'primary' : 'regular'}
                          onClick={() => {
                            const next = computeLayerAspectTransform(
                              activeEditableLayer.transform,
                              {
                                scene: activeStudioScene,
                                layer: activeEditableLayer,
                                sources: studioPanel.projectSources,
                                aspectPreset: opt.id,
                                customAspectRatio:
                                  activeEditableLayer.transform.customAspectRatio,
                                intrinsicWidth: activeIntrinsicW,
                                intrinsicHeight: activeIntrinsicH,
                                outputWidth: studioPanel.outputWidth,
                                outputHeight: studioPanel.outputHeight,
                              }
                            );
                            studioPanel.onUpdateLayerTransform(
                              activeStudioScene.id,
                              activeEditableLayer.id,
                              next.transform,
                              {
                                preserveAspectK:
                                  next.transform.height / Math.max(0.01, next.transform.width),
                              }
                            );
                          }}
                          leadingIcon={
                            <span
                              aria-hidden="true"
                              className={`inline-block rounded-[2px] border border-current/80 ${opt.box}`}
                            />
                          }
                        >
                          {opt.label}
                        </GlassButton>
                      ))}
                    </div>

                    {editableAspectPreset === 'custom' && (
                      <GlassSlider
                        label="Proporción personalizada"
                        min={0.4}
                        max={2.5}
                        step={0.05}
                        disabled={activeEditableLayer.locked}
                        value={activeEditableLayer.transform.customAspectRatio ?? 1.78}
                        displayValue={`${(
                          activeEditableLayer.transform.customAspectRatio ?? 1.78
                        ).toFixed(2)}:1`}
                        onChange={(ratio) => {
                          const next = computeLayerAspectTransform(
                            activeEditableLayer.transform,
                            {
                              scene: activeStudioScene,
                              layer: activeEditableLayer,
                              sources: studioPanel.projectSources,
                              aspectPreset: 'custom',
                              customAspectRatio: ratio,
                              intrinsicWidth: activeIntrinsicW,
                              intrinsicHeight: activeIntrinsicH,
                              outputWidth: studioPanel.outputWidth,
                              outputHeight: studioPanel.outputHeight,
                            }
                          );
                          studioPanel.onUpdateLayerTransform(
                            activeStudioScene.id,
                            activeEditableLayer.id,
                            next.transform,
                            {
                              preserveAspectK:
                                next.transform.height / Math.max(0.01, next.transform.width),
                            }
                          );
                        }}
                      />
                    )}

                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={activeEditableLayer.locked}
                        onClick={() => {
                          const next = computeProportionalLayerTransform(
                            activeEditableLayer.transform,
                            {
                              scene: activeStudioScene,
                              layer: activeEditableLayer,
                              sources: studioPanel.projectSources,
                              intrinsicWidth: activeIntrinsicW,
                              intrinsicHeight: activeIntrinsicH,
                              outputWidth: studioPanel.outputWidth,
                              outputHeight: studioPanel.outputHeight,
                            }
                          );
                          studioPanel.onUpdateLayerTransform(
                            activeStudioScene.id,
                            activeEditableLayer.id,
                            next.transform,
                            {
                              preserveAspectK:
                                next.transform.height / Math.max(0.01, next.transform.width),
                            }
                          );
                        }}
                        className="text-[11px] font-medium text-[var(--accent-blue)] hover:underline disabled:opacity-40 cursor-pointer inline-flex items-center gap-1"
                      >
                        <Maximize2 className="w-3 h-3" />
                        {isCameraTarget
                          ? 'Ajustar a proporción del sensor'
                          : 'Ajustar a proporción original'}
                      </button>
                    </div>
                  </GlassDisclosure>

                  <GlassDisclosure
                    title="Encuadre"
                    subtitle="Recorte por bordes, zoom interno y desplazamiento"
                    defaultOpen={isDisplayTarget}
                    icon={<Crosshair className="w-4 h-4 text-[var(--accent-blue)]" />}
                    badge={
                      <span className="font-mono tabular-nums text-[10px] text-[var(--text-tertiary)]">
                        {activeEditableLayer.transform.fitMode === 'contain' ? 'Contener' : 'Llenar'}{' '}
                        · {(activeEditableLayer.transform.contentZoom ?? 1).toFixed(1)}×
                      </span>
                    }
                  >
                    <p className="text-[10px] text-[var(--text-tertiary)] leading-snug">
                      Zoom interno escala solo el contenido dentro de esta capa (distinto de
                      Tamaño libre y del Zoom Digital del visor).
                    </p>

                    <GlassSegmentedControl<'cover' | 'contain'>
                      fullWidth
                      size="xs"
                      layoutGroupId="active-layer-fit-mode"
                      ariaLabel="Modo de encuadre de la capa seleccionada"
                      disabled={activeEditableLayer.locked}
                      value={
                        activeEditableLayer.transform.fitMode === 'contain' ? 'contain' : 'cover'
                      }
                      onChange={(mode) =>
                        studioPanel.onUpdateLayerTransform(
                          activeStudioScene.id,
                          activeEditableLayer.id,
                          { fitMode: mode }
                        )
                      }
                      options={[
                        { id: 'cover', label: 'Llenar (Cover)' },
                        { id: 'contain', label: 'Todo (Contain)' },
                      ]}
                    />

                    <GlassSlider
                      label="Zoom interno de contenido"
                      min={1}
                      max={4}
                      step={0.05}
                      disabled={activeEditableLayer.locked}
                      value={activeEditableLayer.transform.contentZoom ?? 1}
                      displayValue={`${(activeEditableLayer.transform.contentZoom ?? 1).toFixed(2)}×`}
                      onReset={() =>
                        studioPanel.onUpdateLayerTransform(
                          activeStudioScene.id,
                          activeEditableLayer.id,
                          { contentZoom: 1 }
                        )
                      }
                      onChange={(contentZoom) =>
                        studioPanel.onUpdateLayerTransform(
                          activeStudioScene.id,
                          activeEditableLayer.id,
                          { contentZoom }
                        )
                      }
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <GlassSlider
                        label="Pan X"
                        min={-100}
                        max={100}
                        step={1}
                        disabled={activeEditableLayer.locked}
                        value={Math.round((activeEditableLayer.transform.contentOffsetX ?? 0) * 100)}
                        displayValue={`${Math.round(
                          (activeEditableLayer.transform.contentOffsetX ?? 0) * 100
                        )}%`}
                        onReset={() =>
                          studioPanel.onUpdateLayerTransform(
                            activeStudioScene.id,
                            activeEditableLayer.id,
                            { contentOffsetX: 0 }
                          )
                        }
                        onChange={(pct) =>
                          studioPanel.onUpdateLayerTransform(
                            activeStudioScene.id,
                            activeEditableLayer.id,
                            { contentOffsetX: pct / 100 }
                          )
                        }
                      />
                      <GlassSlider
                        label="Pan Y"
                        min={-100}
                        max={100}
                        step={1}
                        disabled={activeEditableLayer.locked}
                        value={Math.round((activeEditableLayer.transform.contentOffsetY ?? 0) * 100)}
                        displayValue={`${Math.round(
                          (activeEditableLayer.transform.contentOffsetY ?? 0) * 100
                        )}%`}
                        onReset={() =>
                          studioPanel.onUpdateLayerTransform(
                            activeStudioScene.id,
                            activeEditableLayer.id,
                            { contentOffsetY: 0 }
                          )
                        }
                        onChange={(pct) =>
                          studioPanel.onUpdateLayerTransform(
                            activeStudioScene.id,
                            activeEditableLayer.id,
                            { contentOffsetY: pct / 100 }
                          )
                        }
                      />
                    </div>

                    <div className="space-y-1.5 pt-1 border-t border-[var(--border-hairline)]">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-medium text-[var(--text-secondary)]">
                          Recorte independiente por bordes
                        </span>
                        <span className="font-mono tabular-nums text-[10px] text-[var(--text-tertiary)]">
                          {Math.round(editableCrop.top * 100)}·{Math.round(editableCrop.right * 100)}·
                          {Math.round(editableCrop.bottom * 100)}·{Math.round(editableCrop.left * 100)}%
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <GlassSlider
                          label="Recorte superior"
                          min={0}
                          max={49}
                          step={1}
                          disabled={activeEditableLayer.locked}
                          value={Math.round(editableCrop.top * 100)}
                          displayValue={`${Math.round(editableCrop.top * 100)}%`}
                          onReset={() =>
                            studioPanel.onUpdateLayerTransform(
                              activeStudioScene.id,
                              activeEditableLayer.id,
                              { crop: { ...editableCrop, top: 0 } }
                            )
                          }
                          onChange={(pct) =>
                            studioPanel.onUpdateLayerTransform(
                              activeStudioScene.id,
                              activeEditableLayer.id,
                              { crop: { ...editableCrop, top: pct / 100 } }
                            )
                          }
                        />
                        <GlassSlider
                          label="Recorte inferior"
                          min={0}
                          max={49}
                          step={1}
                          disabled={activeEditableLayer.locked}
                          value={Math.round(editableCrop.bottom * 100)}
                          displayValue={`${Math.round(editableCrop.bottom * 100)}%`}
                          onReset={() =>
                            studioPanel.onUpdateLayerTransform(
                              activeStudioScene.id,
                              activeEditableLayer.id,
                              { crop: { ...editableCrop, bottom: 0 } }
                            )
                          }
                          onChange={(pct) =>
                            studioPanel.onUpdateLayerTransform(
                              activeStudioScene.id,
                              activeEditableLayer.id,
                              { crop: { ...editableCrop, bottom: pct / 100 } }
                            )
                          }
                        />
                        <GlassSlider
                          label="Recorte izquierdo"
                          min={0}
                          max={49}
                          step={1}
                          disabled={activeEditableLayer.locked}
                          value={Math.round(editableCrop.left * 100)}
                          displayValue={`${Math.round(editableCrop.left * 100)}%`}
                          onReset={() =>
                            studioPanel.onUpdateLayerTransform(
                              activeStudioScene.id,
                              activeEditableLayer.id,
                              { crop: { ...editableCrop, left: 0 } }
                            )
                          }
                          onChange={(pct) =>
                            studioPanel.onUpdateLayerTransform(
                              activeStudioScene.id,
                              activeEditableLayer.id,
                              { crop: { ...editableCrop, left: pct / 100 } }
                            )
                          }
                        />
                        <GlassSlider
                          label="Recorte derecho"
                          min={0}
                          max={49}
                          step={1}
                          disabled={activeEditableLayer.locked}
                          value={Math.round(editableCrop.right * 100)}
                          displayValue={`${Math.round(editableCrop.right * 100)}%`}
                          onReset={() =>
                            studioPanel.onUpdateLayerTransform(
                              activeStudioScene.id,
                              activeEditableLayer.id,
                              { crop: { ...editableCrop, right: 0 } }
                            )
                          }
                          onChange={(pct) =>
                            studioPanel.onUpdateLayerTransform(
                              activeStudioScene.id,
                              activeEditableLayer.id,
                              { crop: { ...editableCrop, right: pct / 100 } }
                            )
                          }
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3">
                      {hasActiveCrop && (
                        <button
                          type="button"
                          disabled={activeEditableLayer.locked}
                          onClick={() =>
                            studioPanel.onUpdateLayerTransform(
                              activeStudioScene.id,
                              activeEditableLayer.id,
                              { crop: { top: 0, right: 0, bottom: 0, left: 0 } }
                            )
                          }
                          className="text-[11px] font-medium text-[var(--accent-blue)] hover:underline disabled:opacity-40 cursor-pointer"
                        >
                          Restablecer recorte
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={activeEditableLayer.locked}
                        onClick={() =>
                          studioPanel.onUpdateLayerTransform(
                            activeStudioScene.id,
                            activeEditableLayer.id,
                            { contentZoom: 1, contentOffsetX: 0, contentOffsetY: 0 }
                          )
                        }
                        className="text-[11px] font-medium text-[var(--accent-blue)] hover:underline disabled:opacity-40 cursor-pointer inline-flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Centrar encuadre
                      </button>
                    </div>
                  </GlassDisclosure>

                  <GlassDisclosure
                    title="Forma"
                    subtitle="Máscara geométrica en tiempo real"
                    defaultOpen
                    icon={<Layers className="w-4 h-4 text-[var(--accent-blue)]" />}
                    badge={
                      <span className="font-mono tabular-nums text-[10px] text-[var(--text-tertiary)]">
                        {maskShapeLabels[editableMaskShape]}
                      </span>
                    }
                  >
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'rect', label: 'Rectángulo' },
                          { id: 'square', label: 'Cuadrado' },
                          { id: 'rounded', label: 'Redondeado' },
                          { id: 'squircle', label: 'Squircle' },
                          { id: 'circle', label: 'Círculo' },
                          { id: 'ellipse', label: 'Elipse' },
                        ] as const satisfies ReadonlyArray<{ id: LayerMaskShape; label: string }>
                      ).map((shapeOpt) => (
                        <GlassButton
                          key={shapeOpt.id}
                          size="xs"
                          disabled={activeEditableLayer.locked}
                          selected={editableMaskShape === shapeOpt.id}
                          variant={editableMaskShape === shapeOpt.id ? 'primary' : 'regular'}
                          onClick={() => {
                            const patch: Partial<LayerStyle> = { maskShape: shapeOpt.id };
                            if (
                              (shapeOpt.id === 'rounded' || shapeOpt.id === 'squircle') &&
                              activeEditableLayer.style.borderRadiusPx === 0
                            ) {
                              patch.borderRadiusPx = 28;
                            }
                            studioPanel.onUpdateLayerStyle?.(
                              activeStudioScene.id,
                              activeEditableLayer.id,
                              patch
                            );
                          }}
                        >
                          {shapeOpt.label}
                        </GlassButton>
                      ))}
                    </div>

                    {(editableMaskShape === 'rounded' ||
                      editableMaskShape === 'squircle' ||
                      editableMaskShape === 'square') && (
                      <GlassSlider
                        label="Radio de esquina"
                        min={0}
                        max={180}
                        step={2}
                        disabled={activeEditableLayer.locked}
                        value={Math.round(activeEditableLayer.style.borderRadiusPx)}
                        displayValue={`${Math.round(activeEditableLayer.style.borderRadiusPx)} px`}
                        onReset={() =>
                          studioPanel.onUpdateLayerStyle?.(
                            activeStudioScene.id,
                            activeEditableLayer.id,
                            { borderRadiusPx: 28 }
                          )
                        }
                        onChange={(borderRadiusPx) =>
                          studioPanel.onUpdateLayerStyle?.(
                            activeStudioScene.id,
                            activeEditableLayer.id,
                            { borderRadiusPx },
                            {
                              historyGroupKey: `style-radius-${activeEditableLayer.id}`,
                              historyLabel: 'Ajustar radio de esquina',
                            }
                          )
                        }
                      />
                    )}
                  </GlassDisclosure>

                  <GlassDisclosure
                    title="Apariencia"
                    subtitle="Opacidad, borde y sombra difuminada"
                    defaultOpen={false}
                    icon={<Palette className="w-4 h-4 text-[var(--accent-blue)]" />}
                    badge={
                      <span className="font-mono tabular-nums text-[10px] text-[var(--text-tertiary)]">
                        {Math.round(activeEditableLayer.style.opacity * 100)}%
                      </span>
                    }
                  >
                    <GlassSlider
                      label="Opacidad global"
                      min={0}
                      max={100}
                      step={1}
                      disabled={activeEditableLayer.locked}
                      value={Math.round(activeEditableLayer.style.opacity * 100)}
                      displayValue={`${Math.round(activeEditableLayer.style.opacity * 100)}%`}
                      onReset={() =>
                        studioPanel.onUpdateLayerStyle?.(
                          activeStudioScene.id,
                          activeEditableLayer.id,
                          { opacity: 1 }
                        )
                      }
                      onChange={(pct) =>
                        studioPanel.onUpdateLayerStyle?.(
                          activeStudioScene.id,
                          activeEditableLayer.id,
                          { opacity: pct / 100 },
                          {
                            historyGroupKey: `style-opacity-${activeEditableLayer.id}`,
                            historyLabel: 'Ajustar opacidad de capa',
                          }
                        )
                      }
                    />

                    <GlassToggle
                      label="Borde visible"
                      description="Se aplica sin reiniciar fuentes y respeta la forma activa"
                      checked={editableBorderEnabled}
                      disabled={activeEditableLayer.locked}
                      onChange={(enabled) =>
                        studioPanel.onUpdateLayerStyle?.(
                          activeStudioScene.id,
                          activeEditableLayer.id,
                          enabled
                            ? {
                                borderEnabled: true,
                                borderWidthPx: Math.max(
                                  4,
                                  activeEditableLayer.style.borderWidthPx || 0
                                ),
                              }
                            : { borderEnabled: false }
                        )
                      }
                    />

                    {editableBorderEnabled && (
                      <>
                        <GlassSlider
                          label="Grosor del borde"
                          min={1}
                          max={24}
                          step={1}
                          disabled={activeEditableLayer.locked}
                          value={Math.max(
                            1,
                            Math.round(activeEditableLayer.style.borderWidthPx)
                          )}
                          displayValue={`${Math.max(
                            1,
                            Math.round(activeEditableLayer.style.borderWidthPx)
                          )} px`}
                          onChange={(borderWidthPx) =>
                            studioPanel.onUpdateLayerStyle?.(
                              activeStudioScene.id,
                              activeEditableLayer.id,
                              { borderEnabled: true, borderWidthPx }
                            )
                          }
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-[var(--text-secondary)]">Color de borde</span>
                          <div className="flex items-center gap-1.5">
                            {['#FFFFFF', '#0A84FF', '#30D158', '#FF9F0A', '#FF453A', '#000000'].map(
                              (hex) => (
                                <button
                                  key={hex}
                                  type="button"
                                  disabled={activeEditableLayer.locked}
                                  aria-label={`Color de borde ${hex}`}
                                  onClick={() =>
                                    studioPanel.onUpdateLayerStyle?.(
                                      activeStudioScene.id,
                                      activeEditableLayer.id,
                                      { borderColor: hex, borderEnabled: true }
                                    )
                                  }
                                  className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${
                                    activeEditableLayer.style.borderColor.toUpperCase() === hex
                                      ? 'scale-110 ring-2 ring-[var(--accent-blue)] border-white'
                                      : 'border-white/30'
                                  }`}
                                  style={{ backgroundColor: hex }}
                                />
                              )
                            )}
                            <input
                              type="color"
                              aria-label="Selector personalizado de color de borde"
                              disabled={activeEditableLayer.locked}
                              value={activeEditableLayer.style.borderColor}
                              onChange={(e) =>
                                studioPanel.onUpdateLayerStyle?.(
                                  activeStudioScene.id,
                                  activeEditableLayer.id,
                                  { borderColor: e.target.value, borderEnabled: true }
                                )
                              }
                              className="w-6 h-6 rounded-full bg-transparent cursor-pointer border border-white/25"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    <GlassSlider
                      label="Sombra difuminada"
                      min={0}
                      max={96}
                      step={2}
                      disabled={activeEditableLayer.locked}
                      value={Math.round(activeEditableLayer.style.shadowBlurPx)}
                      displayValue={`${Math.round(activeEditableLayer.style.shadowBlurPx)} px`}
                      onReset={() =>
                        studioPanel.onUpdateLayerStyle?.(
                          activeStudioScene.id,
                          activeEditableLayer.id,
                          { shadowBlurPx: 24, shadowOpacity: 0.35 }
                        )
                      }
                      onChange={(shadowBlurPx) =>
                        studioPanel.onUpdateLayerStyle?.(
                          activeStudioScene.id,
                          activeEditableLayer.id,
                          { shadowBlurPx }
                        )
                      }
                    />

                    <GlassSlider
                      label="Opacidad de sombra"
                      min={0}
                      max={100}
                      step={1}
                      disabled={
                        activeEditableLayer.locked || activeEditableLayer.style.shadowBlurPx <= 0
                      }
                      value={Math.round(activeEditableLayer.style.shadowOpacity * 100)}
                      displayValue={`${Math.round(
                        activeEditableLayer.style.shadowOpacity * 100
                      )}%`}
                      onChange={(pct) =>
                        studioPanel.onUpdateLayerStyle?.(
                          activeStudioScene.id,
                          activeEditableLayer.id,
                          { shadowOpacity: pct / 100 }
                        )
                      }
                    />

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[var(--text-secondary)]">Color de sombra</span>
                      <div className="flex items-center gap-1.5">
                        {['#000000', '#0F172A', '#1E3A8A', '#FFFFFF'].map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            disabled={activeEditableLayer.locked}
                            aria-label={`Color de sombra ${hex}`}
                            onClick={() =>
                              studioPanel.onUpdateLayerStyle?.(
                                activeStudioScene.id,
                                activeEditableLayer.id,
                                { shadowColor: hex }
                              )
                            }
                            className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${
                              activeEditableLayer.style.shadowColor.toUpperCase() === hex
                                ? 'scale-110 ring-2 ring-[var(--accent-blue)] border-white'
                                : 'border-white/30'
                            }`}
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                    </div>
                  </GlassDisclosure>

                  <GlassDisclosure
                    title="Integración alfa"
                    subtitle="Difuminado perimetral sin halos"
                    defaultOpen={false}
                    icon={<Wand2 className="w-4 h-4 text-[var(--accent-blue)]" />}
                    badge={
                      <span className="font-mono tabular-nums text-[10px] text-[var(--text-tertiary)]">
                        {Math.round(editableFeatherPx)} px
                      </span>
                    }
                  >
                    <GlassSlider
                      label="Difuminado perimetral"
                      min={0}
                      max={140}
                      step={1}
                      disabled={activeEditableLayer.locked}
                      value={Math.round(editableFeatherPx)}
                      displayValue={`${Math.round(editableFeatherPx)} px`}
                      onReset={() =>
                        studioPanel.onUpdateLayerStyle?.(
                          activeStudioScene.id,
                          activeEditableLayer.id,
                          { featherPx: 0 }
                        )
                      }
                      onChange={(featherPx) =>
                        studioPanel.onUpdateLayerStyle?.(
                          activeStudioScene.id,
                          activeEditableLayer.id,
                          { featherPx }
                        )
                      }
                    />

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-[var(--text-tertiary)] leading-snug">
                        Alfa recto hacia el interior en todas las formas, sin borde obligatorio y
                        aplicable a cámara, ventana, pantalla o imagen.
                      </span>
                      {editableFeatherPx > 0 && (
                        <button
                          type="button"
                          disabled={activeEditableLayer.locked}
                          onClick={() =>
                            studioPanel.onUpdateLayerStyle?.(
                              activeStudioScene.id,
                              activeEditableLayer.id,
                              { featherPx: 0 }
                            )
                          }
                          className="text-[11px] font-medium text-[var(--accent-blue)] hover:underline shrink-0 cursor-pointer"
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  </GlassDisclosure>
                </>
              )}

            <GlassDisclosure
              title={
                studioPanel?.engineMode === 'studio'
                  ? 'Zoom Digital del visor'
                  : 'Zoom Digital'
              }
              subtitle={
                studioPanel?.engineMode === 'studio'
                  ? 'Ampliación global de cámara física'
                  : undefined
              }
              defaultOpen={studioPanel?.engineMode !== 'studio'}
              badge={
                <span className="font-mono tabular-nums text-[11px] font-semibold text-[var(--accent-blue)]">
                  {props.zoom.toFixed(1)}×
                </span>
              }
            >
              <GlassSlider
                label="Ampliación digital del visor"
                min={1}
                max={4}
                step={0.1}
                value={props.zoom}
                displayValue={`${props.zoom.toFixed(1)}×`}
                onChange={props.onChangeZoom}
                onReset={() => {
                  props.onChangeZoom(1);
                  props.onChangePan(0, 0);
                }}
              />

              <GlassSegmentedControl<string>
                fullWidth
                size="xs"
                layoutGroupId="inspector-zoom-presets"
                ariaLabel="Presets de zoom"
                value={matchedZoomPreset}
                onChange={(val) => {
                  const num = parseFloat(val);
                  props.onChangeZoom(num);
                  if (num === 1) props.onChangePan(0, 0);
                }}
                options={zoomPresetOptions}
              />

              {props.zoom > 1.05 && (
                <div className="flex items-center justify-between pt-0.5 text-xs text-[var(--text-tertiary)]">
                  <span>Arrastra en el visor para mover</span>
                  <button
                    type="button"
                    onClick={() => props.onChangePan(0, 0)}
                    className="text-[var(--accent-blue)] hover:underline font-medium cursor-pointer"
                  >
                    Centrar
                  </button>
                </div>
              )}
            </GlassDisclosure>

            <GlassDisclosure
              title="Enfoque y Área"
              defaultOpen
              icon={<Focus className="w-4 h-4 text-[var(--accent-amber)]" />}
              badge={
                <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                  {props.focus.mode === 'manual' ? `MF ${props.focus.manualDistance}%` : 'AF'}
                </span>
              }
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-tertiary)]">
                  Modo de enfoque
                </span>
                <button
                  type="button"
                  onClick={() => props.onChangeFocus(() => DEFAULT_FOCUS_SETTINGS)}
                  className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Restablecer
                </button>
              </div>

              <GlassSegmentedControl<'auto' | 'manual'>
                fullWidth
                size="xs"
                layoutGroupId="inspector-focus-mode"
                ariaLabel="Modo AF o MF"
                value={props.focus.mode}
                onChange={(mode) =>
                  props.onChangeFocus((p) =>
                    mode === 'auto'
                      ? { ...p, mode: 'auto', manualDistance: 50 }
                      : { ...p, mode: 'manual' }
                  )
                }
                options={[
                  { id: 'auto', label: 'AF Automático' },
                  { id: 'manual', label: 'MF Manual' },
                ]}
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-secondary)]">Área de Enfoque</span>
                  <span className="font-mono tabular-nums text-[11px] text-[var(--text-tertiary)]">
                    X:{Math.round(props.focus.areaX * 100)}% · Y:
                    {Math.round(props.focus.areaY * 100)}%
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <GlassButton
                    size="sm"
                    className="flex-1"
                    variant={props.focus.selectingArea ? 'amber' : 'regular'}
                    selected={props.focus.selectingArea}
                    onClick={() =>
                      props.onChangeFocus((p) => ({
                        ...p,
                        selectingArea: !p.selectingArea,
                      }))
                    }
                    leadingIcon={<Crosshair className="w-3.5 h-3.5" />}
                  >
                    {props.focus.selectingArea ? 'Clic en visor activo...' : 'Elegir en visor'}
                  </GlassButton>

                  <GlassButton
                    size="sm"
                    onClick={() =>
                      props.onChangeFocus((p) => ({ ...p, areaX: 0.5, areaY: 0.5 }))
                    }
                  >
                    Centro
                  </GlassButton>
                </div>

                <GlassSegmentedControl<FocusAreaSize>
                  fullWidth
                  size="xs"
                  layoutGroupId="inspector-focus-size"
                  ariaLabel="Tamaño de área de enfoque"
                  value={props.focus.areaSize}
                  onChange={(areaSize) => props.onChangeFocus((p) => ({ ...p, areaSize }))}
                  options={[
                    { id: 'spot', label: 'Puntual' },
                    { id: 'zone', label: 'Zona Media' },
                    { id: 'wide', label: 'Amplia' },
                  ]}
                />
              </div>

              <div className="space-y-1">
                <GlassSlider
                  label="Plano de Enfoque Manual"
                  min={0}
                  max={100}
                  value={props.focus.manualDistance}
                  displayValue={`${props.focus.manualDistance}%${
                    props.hardwareFocusSupported ? ' (Óptica)' : ''
                  }`}
                  onChange={(val) =>
                    props.onChangeFocus((p) => ({
                      ...p,
                      mode: 'manual',
                      manualDistance: val,
                    }))
                  }
                  onReset={() => props.onChangeFocus((p) => ({ ...p, manualDistance: 50 }))}
                />
                <div className="flex justify-between text-[11px] font-mono text-[var(--text-tertiary)]">
                  <span>Macro (0)</span>
                  <button
                    type="button"
                    onClick={() =>
                      props.onChangeFocus((p) => ({ ...p, manualDistance: 50 }))
                    }
                    className="text-[var(--text-secondary)] hover:text-[var(--accent-amber)] cursor-pointer"
                  >
                    Plano Sujeto (50)
                  </button>
                  <span>Infinito (100)</span>
                </div>
              </div>

              <GlassSlider
                label="Desenfoque fuera de área (Bokeh)"
                min={0}
                max={100}
                value={props.focus.apertureBlur}
                displayValue={
                  props.focus.apertureBlur === 0
                    ? 'f/16 (Nítido)'
                    : `f/${Math.max(1.4, 16 - (props.focus.apertureBlur / 100) * 14.6).toFixed(1)}`
                }
                onChange={(apertureBlur) =>
                  props.onChangeFocus((p) => ({ ...p, apertureBlur }))
                }
                onReset={() => props.onChangeFocus((p) => ({ ...p, apertureBlur: 0 }))}
              />

              <GlassToggle
                label="Focus Peaking (Resalte nítido)"
                checked={props.focus.peakingEnabled}
                onChange={(peakingEnabled) =>
                  props.onChangeFocus((p) => ({ ...p, peakingEnabled }))
                }
              />

              <div className="pt-2 border-t border-[var(--border-hairline)] space-y-1.5">
                <div className="flex items-center justify-between text-xs pb-0.5">
                  <span className="text-[var(--text-primary)] font-medium">
                    Reconocimiento de Sujeto IA
                  </span>
                  <span className="font-mono tabular-nums text-[11px] text-[var(--accent-green)]">
                    {props.aiStatus.detector === 'loading'
                      ? 'Cargando IA...'
                      : props.detectedSubjects.length > 0
                        ? `${props.detectedSubjects.length} sujeto · ${Math.round(
                            props.detectedSubjects[0].confidence * 100
                          )}%`
                        : 'Buscando'}
                  </span>
                </div>

                <GlassToggle
                  label="Reconocer sujetos con IA"
                  subtle
                  checked={props.focus.aiTrackingEnabled}
                  onChange={(aiTrackingEnabled) =>
                    props.onChangeFocus((p) => ({ ...p, aiTrackingEnabled }))
                  }
                />

                <GlassToggle
                  label="Seguir rostro con área de enfoque"
                  subtle
                  checked={props.focus.aiAutoFocus}
                  onChange={(aiAutoFocus) =>
                    props.onChangeFocus((p) => ({ ...p, aiAutoFocus }))
                  }
                />
              </div>
            </GlassDisclosure>

            <GlassDisclosure
              title="Audio y Calidad"
              defaultOpen
              badge={
                <span className="font-mono text-[10px] text-[var(--text-tertiary)] uppercase">
                  {props.resolutionPreset}
                </span>
              }
            >
              <GlassSelect
                label="Micrófono"
                value={props.selectedAudioId}
                onChange={(e) => props.onSelectAudioDevice(e.target.value)}
              >
                {props.audioDevices.length === 0 ? (
                  <option value="">Micrófono integrado MacBook</option>
                ) : (
                  props.audioDevices.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId}>
                      {d.label || `Micrófono ${idx + 1}`}
                    </option>
                  ))
                )}
              </GlassSelect>

              <div className="space-y-1.5">
                <span className="block text-[11px] text-[var(--text-tertiary)]">
                  Calidad / Resolución
                </span>
                <GlassSegmentedControl<ResolutionPresetId>
                  fullWidth
                  size="xs"
                  layoutGroupId="inspector-resolution"
                  ariaLabel="Resolución de salida"
                  value={props.resolutionPreset}
                  onChange={props.onChangeResolution}
                  options={[
                    { id: 'max', label: 'Máxima' },
                    { id: '4k', label: '4K' },
                    { id: '1080p', label: '1080p' },
                    { id: '720p', label: '720p' },
                  ]}
                />
              </div>
            </GlassDisclosure>

            <GlassDisclosure
              title="Estabilización (EIS)"
              defaultOpen={false}
              icon={<Move className="w-4 h-4 text-[var(--accent-green)]" />}
              badge={
                props.stabilization.enabled ? (
                  <GlassStatusIndicator compact tone="live" label="ON" />
                ) : undefined
              }
            >
              <GlassToggle
                label="Activar estabilización EIS"
                description="Analiza el desplazamiento entre fotogramas consecutivos y compensa vibraciones en tiempo real."
                checked={props.stabilization.enabled}
                onChange={(enabled) =>
                  props.onChangeStabilization((p) => ({ ...p, enabled }))
                }
              />

              {props.stabilization.enabled && (
                <GlassSlider
                  label="Compensación de movimiento"
                  min={20}
                  max={100}
                  value={props.stabilization.strength}
                  displayValue={`${props.stabilization.strength}%`}
                  onChange={(strength) =>
                    props.onChangeStabilization((p) => ({ ...p, strength }))
                  }
                />
              )}
            </GlassDisclosure>

            <GlassDisclosure
              title="Luz de Relleno en Pantalla"
              defaultOpen={false}
              icon={<Sun className="w-4 h-4 text-[var(--accent-amber)]" />}
              badge={
                props.ringLight.enabled ? (
                  <span className="font-mono text-[10px] text-[var(--accent-amber)]">
                    {props.ringLight.intensity}%
                  </span>
                ) : undefined
              }
            >
              <GlassToggle
                label="Activar luz de relleno"
                checked={props.ringLight.enabled}
                onChange={(enabled) => props.onChangeRingLight((p) => ({ ...p, enabled }))}
              />

              {props.ringLight.enabled && (
                <div className="space-y-3 pt-1">
                  <GlassSegmentedControl<'warm' | 'neutral' | 'cool' | 'rose'>
                    fullWidth
                    size="xs"
                    layoutGroupId="inspector-ringlight-temp"
                    ariaLabel="Temperatura de luz de relleno"
                    value={props.ringLight.temperature}
                    onChange={(temperature) =>
                      props.onChangeRingLight((p) => ({ ...p, temperature }))
                    }
                    options={[
                      { id: 'warm', label: '3200K' },
                      { id: 'neutral', label: '5500K' },
                      { id: 'cool', label: '7500K' },
                      { id: 'rose', label: 'Rosa' },
                    ]}
                  />
                  <GlassSlider
                    label="Intensidad"
                    min={15}
                    max={100}
                    value={props.ringLight.intensity}
                    displayValue={`${props.ringLight.intensity}%`}
                    onChange={(intensity) =>
                      props.onChangeRingLight((p) => ({ ...p, intensity }))
                    }
                  />
                </div>
              )}
            </GlassDisclosure>

            <GlassDisclosure
              title="Doble Cámara Simultánea"
              defaultOpen={false}
              icon={<Camera className="w-4 h-4 text-[var(--accent-blue)]" />}
              badge={
                props.dualCam.enabled ? (
                  <GlassStatusIndicator compact tone="live" label="PiP" />
                ) : undefined
              }
            >
              <GlassToggle
                label="Activar doble cámara"
                description="Combina la cámara principal con una segunda cámara (iPhone Continuity o USB) en burbuja PiP."
                checked={props.dualCam.enabled}
                onChange={(enabled) =>
                  props.onChangeDualCam((p) => ({
                    ...p,
                    enabled,
                    deviceId:
                      p.deviceId ||
                      props.videoDevices.find((d) => d.deviceId !== props.selectedVideoId)
                        ?.deviceId ||
                      '',
                  }))
                }
              />

              {props.dualCam.enabled && (
                <div className="space-y-2.5">
                  <GlassSelect
                    aria-label="Cámara secundaria"
                    value={props.dualCam.deviceId}
                    onChange={(e) =>
                      props.onChangeDualCam((p) => ({ ...p, deviceId: e.target.value }))
                    }
                  >
                    {props.videoDevices.filter((d) => d.deviceId !== props.selectedVideoId)
                      .length === 0 ? (
                      <option value="">Conecta una 2ª cámara (iPhone o USB)</option>
                    ) : (
                      props.videoDevices
                        .filter((d) => d.deviceId !== props.selectedVideoId)
                        .map((d, idx) => (
                          <option key={d.deviceId || idx} value={d.deviceId}>
                            {d.label || `Cámara secundaria ${idx + 1}`}
                          </option>
                        ))
                    )}
                  </GlassSelect>

                  <div className="grid grid-cols-2 gap-1.5">
                    <GlassButton size="xs" onClick={props.onSwapCameras}>
                      Intercambiar planos
                    </GlassButton>
                    <GlassButton
                      size="xs"
                      selected={props.dualCam.mirror}
                      onClick={() =>
                        props.onChangeDualCam((p) => ({ ...p, mirror: !p.mirror }))
                      }
                    >
                      Espejo PiP
                    </GlassButton>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'top-left', label: 'Sup. Izq' },
                        { id: 'top-right', label: 'Sup. Der' },
                        { id: 'bottom-left', label: 'Inf. Izq' },
                        { id: 'bottom-right', label: 'Inf. Der' },
                      ] as const
                    ).map((c) => (
                      <GlassButton
                        key={c.id}
                        size="xs"
                        selected={props.pipCorner === c.id}
                        onClick={() => props.onChangePipCorner(c.id)}
                      >
                        {c.label}
                      </GlassButton>
                    ))}
                  </div>
                </div>
              )}
            </GlassDisclosure>

            <div className="pt-3.5">
              <GlassButton
                size="sm"
                className="w-full"
                onClick={props.onResetAllPreferences}
                leadingIcon={<RotateCcw className="w-3.5 h-3.5" />}
              >
                Restablecer ajustes guardados
              </GlassButton>
            </div>
          </>
        )}

        {/* ======================== STUDIO -> UTILITIES ======================== */}
        {(activeTab === 'studio' || activeTab === 'utilities') && studioSubTab === 'utilities' && (
          <>
            <GlassDisclosure
              title="Histograma RGB en Vivo"
              defaultOpen
              icon={<Activity className="w-4 h-4 text-[var(--accent-blue)]" />}
            >
              <GlassToggle
                label="Mostrar histograma RGB"
                checked={props.showHistogram}
                onChange={() => props.onToggleHistogram()}
              />

              {props.showHistogram && props.histogram && (
                <div className="h-20 rounded-xl bg-[var(--studio-surface-well)] p-2 flex items-end gap-px">
                  {props.histogram.l.map((lv, idx) => (
                    <div key={idx} className="flex-1 h-full relative flex items-end">
                      <div
                        className="w-full bg-[var(--text-primary)] opacity-60 rounded-t-[2px]"
                        style={{ height: `${Math.round(lv * 100)}%` }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </GlassDisclosure>

            <GlassDisclosure
              title="Guías de Encuadre"
              defaultOpen
              icon={<Grid className="w-4 h-4 text-[var(--text-secondary)]" />}
            >
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'none', label: 'Ninguna' },
                    { id: 'thirds', label: 'Tercios' },
                    { id: 'golden', label: 'Áurea' },
                    { id: 'crosshair', label: 'Cruz' },
                    { id: 'cinema', label: 'Zona Segura' },
                  ] as { id: GridOverlayId; label: string }[]
                ).map((g) => (
                  <GlassButton
                    key={g.id}
                    size="xs"
                    selected={props.gridOverlay === g.id}
                    onClick={() => props.onChangeGridOverlay(g.id)}
                  >
                    {g.label}
                  </GlassButton>
                ))}
              </div>
            </GlassDisclosure>

            <GlassDisclosure
              title="Escáner de Documentos"
              defaultOpen
              icon={<FileText className="w-4 h-4 text-[var(--text-secondary)]" />}
            >
              <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                Optimiza contraste y nitidez en blanco y negro para capturar apuntes, recibos o pizarras.
              </p>
              <GlassButton
                size="sm"
                className="w-full"
                variant={props.filterId === 'document-scan' ? 'primary' : 'regular'}
                selected={props.filterId === 'document-scan'}
                onClick={props.onQuickDocumentScan}
              >
                {props.filterId === 'document-scan'
                  ? 'Modo Escáner Activo (Clic para restaurar)'
                  : 'Activar Modo Escáner de Documento'}
              </GlassButton>
            </GlassDisclosure>

            <GlassDisclosure
              title="Cuentagotas de Color en Vivo"
              defaultOpen
              icon={<Pipette className="w-4 h-4 text-[var(--text-secondary)]" />}
            >
              <GlassButton
                size="sm"
                className="w-full"
                variant={props.eyedropperActive ? 'amber' : 'regular'}
                selected={props.eyedropperActive}
                onClick={props.onToggleEyedropper}
              >
                {props.eyedropperActive ? 'Haz clic en el visor para medir...' : 'Activar Cuentagotas'}
              </GlassButton>

              {props.sampledColor && (
                <div className="flex items-center justify-between pt-2.5 border-t border-[var(--border-hairline)]">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-7 h-7 rounded-lg border border-[var(--border-hairline)] shrink-0"
                      style={{ backgroundColor: props.sampledColor.hex }}
                    />
                    <div className="font-mono tabular-nums text-xs">
                      <div className="text-[var(--text-primary)] font-semibold">
                        {props.sampledColor.hex}
                      </div>
                      <div className="text-[var(--text-tertiary)] text-[11px]">
                        rgb({props.sampledColor.r}, {props.sampledColor.g}, {props.sampledColor.b})
                      </div>
                    </div>
                  </div>
                  <GlassIconButton
                    size="sm"
                    label="Copiar código HEX"
                    onClick={() => handleCopyText(props.sampledColor!.hex, 'hex')}
                  >
                    {copiedHex ? (
                      <Check className="w-3.5 h-3.5 text-[var(--accent-green)]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </GlassIconButton>
                </div>
              )}
            </GlassDisclosure>

            <GlassDisclosure
              title="Lector QR y Códigos"
              defaultOpen
              icon={<QrCode className="w-4 h-4 text-[var(--text-secondary)]" />}
            >
              {props.qrSupported ? (
                <>
                  <GlassButton
                    size="sm"
                    className="w-full"
                    variant={props.qrScanning ? 'amber' : 'regular'}
                    selected={props.qrScanning}
                    onClick={props.onToggleQrScanning}
                  >
                    {props.qrScanning ? 'Escaneando en vivo... (Detener)' : 'Iniciar Escaneo QR'}
                  </GlassButton>
                  {props.lastQrResult && (
                    <div className="pt-2.5 border-t border-[var(--border-hairline)] flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-[var(--text-primary)] truncate">
                        {props.lastQrResult}
                      </span>
                      <GlassIconButton
                        size="sm"
                        label="Copiar resultado QR"
                        onClick={() => handleCopyText(props.lastQrResult!, 'qr')}
                      >
                        {copiedQr ? (
                          <Check className="w-3.5 h-3.5 text-[var(--accent-green)]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </GlassIconButton>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-[var(--text-tertiary)]">
                  La detección nativa de códigos QR requiere Chrome o Edge en macOS.
                </p>
              )}
            </GlassDisclosure>
          </>
        )}

        {/* ======================== STUDIO -> OVERLAYS & BRANDING ======================== */}
        {(activeTab === 'studio' || activeTab === 'utilities') && studioSubTab === 'overlays' && (
          <GlassDisclosure
            title="Marcos y Rótulos en Grabación"
            defaultOpen
            icon={<Layers className="w-4 h-4 text-[var(--accent-amber)]" />}
          >
            <p className="text-xs text-[var(--text-tertiary)]">
              Estos elementos se renderizan directamente sobre la imagen final de fotos y videos.
            </p>

            <div className="divide-y divide-[var(--border-hairline)]">
              <GlassToggle
                label="Barras Cinematográficas 2.39:1"
                checked={props.branding.cinemaFrame}
                onChange={(cinemaFrame) =>
                  props.onChangeBranding((p) => ({ ...p, cinemaFrame }))
                }
              />
              <GlassToggle
                label="Estampa de Fecha y Hora"
                checked={props.branding.showTimestamp}
                onChange={(showTimestamp) =>
                  props.onChangeBranding((p) => ({ ...p, showTimestamp }))
                }
              />
              <GlassToggle
                label="Rótulo Inferior (Lower Third)"
                checked={props.branding.showLowerThird}
                onChange={(showLowerThird) =>
                  props.onChangeBranding((p) => ({ ...p, showLowerThird }))
                }
              />
            </div>

            {props.branding.showLowerThird && (
              <div className="space-y-2.5 pt-1">
                <div>
                  <label className="block text-[11px] text-[var(--text-tertiary)] mb-1">
                    Nombre / Título
                  </label>
                  <input
                    type="text"
                    value={props.branding.lowerThirdName}
                    onChange={(e) =>
                      props.onChangeBranding((p) => ({ ...p, lowerThirdName: e.target.value }))
                    }
                    placeholder="Tu nombre"
                    className="liquid-input w-full rounded-xl px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[var(--text-tertiary)] mb-1">
                    Cargo o Subtítulo
                  </label>
                  <input
                    type="text"
                    value={props.branding.lowerThirdTitle}
                    onChange={(e) =>
                      props.onChangeBranding((p) => ({ ...p, lowerThirdTitle: e.target.value }))
                    }
                    placeholder="Presentación en directo"
                    className="liquid-input w-full rounded-xl px-3 py-2 text-xs"
                  />
                </div>
              </div>
            )}
          </GlassDisclosure>
        )}

        {/* ======================== FILTERS & REAL-TIME EFFECTS TAB ======================== */}
        {activeTab === 'filters' && (
          <>
            <div className="flex items-center justify-between gap-2 py-3.5 border-b border-[var(--border-hairline)]">
              <div className="min-w-0">
                <h2 className="text-[13px] font-semibold tracking-tight text-[var(--text-primary)]">
                  Comparativa Antes / Después
                </h2>
                <p className="text-xs text-[var(--text-tertiary)]">Desliza sobre el visor en vivo</p>
              </div>
              <GlassButton
                size="sm"
                variant={props.abSplitEnabled ? 'amber' : 'regular'}
                selected={props.abSplitEnabled}
                onClick={props.onToggleAbSplit}
                leadingIcon={<Eye className="w-3.5 h-3.5" />}
              >
                {props.abSplitEnabled ? 'Comparando' : 'Comparar'}
              </GlassButton>
            </div>

            <GlassDisclosure
              title="Filtros de Color y Película"
              defaultOpen
              icon={<Sliders className="w-4 h-4 text-[var(--accent-amber)]" />}
              badge={
                props.filterId !== 'none' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onChangeFilter('none');
                    }}
                    className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    Quitar
                  </button>
                ) : undefined
              }
            >
              <GlassSegmentedControl<'all' | 'instagram' | 'cinema' | 'classic'>
                fullWidth
                size="xs"
                layoutGroupId="inspector-filter-cat"
                ariaLabel="Categorías de filtro"
                value={filterCat}
                onChange={setFilterCat}
                options={[
                  { id: 'all', label: 'Todos' },
                  { id: 'instagram', label: 'Instagram' },
                  { id: 'cinema', label: 'Cine' },
                  { id: 'classic', label: 'Clásicos' },
                ]}
              />

              <div className="grid grid-cols-3 gap-1.5">
                {FILTER_PRESETS.filter(
                  (preset) => filterCat === 'all' || preset.category === filterCat
                ).map((preset) => {
                  const active = props.filterId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => props.onChangeFilter(preset.id)}
                      title={preset.description}
                      className={`glass-focus-ring text-left rounded-xl p-1 border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[var(--control-active-bg)] border-[var(--control-active-border)]'
                          : 'border-transparent hover:bg-[var(--studio-surface-subtle)]'
                      }`}
                    >
                      <div
                        className={`h-8 w-full rounded-lg bg-gradient-to-br ${preset.swatchGradient} mb-1`}
                      />
                      <div className="text-[11px] font-medium text-[var(--text-primary)] truncate px-0.5">
                        {preset.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            </GlassDisclosure>

            <GlassDisclosure
              title="Efectos Especiales y Estilos"
              defaultOpen
              icon={<Wand2 className="w-4 h-4 text-[var(--accent-amber)]" />}
              badge={
                props.effectId !== 'none' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onChangeEffect('none');
                    }}
                    className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    Quitar
                  </button>
                ) : undefined
              }
            >
              <GlassSegmentedControl<'all' | 'cartoon' | 'cinema' | 'retro' | 'geometry'>
                fullWidth
                size="xs"
                layoutGroupId="inspector-effect-cat"
                ariaLabel="Categorías de efectos"
                value={effectCat}
                onChange={setEffectCat}
                options={[
                  { id: 'all', label: 'Todos' },
                  { id: 'cartoon', label: 'Comic' },
                  { id: 'cinema', label: 'Glow' },
                  { id: 'retro', label: 'Retro' },
                  { id: 'geometry', label: 'Óptico' },
                ]}
              />

              <div className="grid grid-cols-2 gap-1.5">
                {VISUAL_EFFECTS.filter(
                  (eff) => effectCat === 'all' || eff.category === effectCat
                ).map((eff) => {
                  const active = props.effectId === eff.id;
                  return (
                    <button
                      key={eff.id}
                      type="button"
                      onClick={() => props.onChangeEffect(eff.id)}
                      className={`glass-focus-ring text-left px-2.5 py-2 rounded-xl border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[var(--accent-amber-soft)] border-amber-400/45 text-[var(--accent-amber)]'
                          : 'bg-[var(--studio-surface-subtle)] border-transparent hover:border-[var(--border-hairline)]'
                      }`}
                    >
                      <div className="text-xs font-medium text-[var(--text-primary)] truncate">
                        {eff.name}
                      </div>
                      <div className="text-[10px] text-[var(--text-tertiary)] truncate">
                        {eff.description}
                      </div>
                    </button>
                  );
                })}
              </div>

              {props.effectId !== 'none' && (
                <GlassSlider
                  label="Intensidad del Efecto"
                  min={10}
                  max={100}
                  value={props.adjustments.effectIntensity}
                  displayValue={`${props.adjustments.effectIntensity}%`}
                  onChange={(effectIntensity) =>
                    props.onChangeAdjustments((p) => ({ ...p, effectIntensity }))
                  }
                  onReset={() =>
                    props.onChangeAdjustments((p) => ({
                      ...p,
                      effectIntensity: DEFAULT_ADJUSTMENTS.effectIntensity,
                    }))
                  }
                />
              )}
            </GlassDisclosure>

            <GlassDisclosure
              title="Recorte de Sujeto con IA"
              defaultOpen
              icon={<UserCheck className="w-4 h-4 text-[var(--accent-green)]" />}
              badge={
                props.background.mode !== 'none' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onChangeBackground((p) => ({ ...p, mode: 'none' }));
                    }}
                    className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    Desactivar
                  </button>
                ) : undefined
              }
            >
              <div className="flex items-center justify-between text-[11px] py-0.5">
                <span className="font-mono text-[var(--text-tertiary)] truncate">
                  {props.background.mode === 'transparent'
                    ? props.aiStatus.segmenter === 'error'
                      ? 'Recorte no disponible · cámara original'
                      : props.aiStatus.segmenter === 'loading' || props.aiStatus.segmenter === 'idle'
                        ? 'Preparando recorte · cámara original'
                        : 'Modelo IA listo'
                    : props.background.useAi
                      ? props.aiStatus.segmenter === 'error'
                        ? 'Respaldo cromático activo'
                        : props.aiStatus.segmenter === 'ready'
                          ? 'Modelo MediaPipe listo'
                          : 'Preparando red neuronal...'
                      : 'Modo cromático manual'}
                </span>
                <button
                  type="button"
                  disabled={props.background.mode === 'transparent'}
                  onClick={() =>
                    props.onChangeBackground((p) => ({ ...p, useAi: !p.useAi }))
                  }
                  className="text-[var(--accent-blue)] hover:underline font-medium whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {props.background.mode === 'transparent' ? 'IA requerida' : props.background.useAi ? 'Usar Color' : 'Usar IA'}
                </button>
              </div>

              <GlassSegmentedControl<BackgroundReplaceMode>
                fullWidth
                size="xs"
                layoutGroupId="inspector-bg-mode"
                ariaLabel="Modo de reemplazo de fondo"
                value={props.background.mode}
                onChange={(mode) => props.onChangeBackground((p) => ({ ...p, mode, useAi: mode === 'transparent' ? true : p.useAi }))}
                options={[
                  { id: 'none', label: 'Original' },
                  { id: 'blur', label: 'Desenfoque' },
                  { id: 'color', label: 'Color' },
                  { id: 'image', label: 'Imagen' },
                ]}
              />
              {studioPanel?.engineMode === 'studio' && (
                <GlassButton size="sm" className="w-full"
                  onClick={() => props.onChangeBackground((p) => ({ ...p, mode: p.mode === 'transparent' ? 'none' : 'transparent', useAi: true }))}>
                  {props.background.mode === 'transparent' ? 'Restaurar fondo original' : 'Quitar fondo · Transparente'}
                </GlassButton>
              )}
              {props.background.mode === 'transparent' && (
                <p className="text-[11px] text-[var(--text-tertiary)]">
                  {studioPanel?.engineMode !== 'studio'
                    ? 'La transparencia requiere el motor Studio. Se conserva la cámara original.'
                    : 'Compone sobre las capas inferiores. Si falla la IA, vuelve a la cámara original. Los efectos geométricos se suspenden durante el recorte.'}
                </p>
              )}

              {props.background.mode === 'image' && (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-3 gap-1.5">
                    {VIRTUAL_BACKGROUNDS.map((bg) => {
                      const active = props.background.imageId === bg.id;
                      return (
                        <button
                          key={bg.id}
                          type="button"
                          onClick={() =>
                            props.onChangeBackground((p) => ({
                              ...p,
                              mode: 'image',
                              imageId: bg.id,
                            }))
                          }
                          className={`glass-focus-ring rounded-xl overflow-hidden text-left border transition-colors cursor-pointer p-1 ${
                            active
                              ? 'bg-[var(--control-active-bg)] border-[var(--control-active-border)]'
                              : 'border-transparent hover:bg-[var(--studio-surface-subtle)]'
                          }`}
                        >
                          <div className="aspect-video bg-black/40 rounded-lg overflow-hidden">
                            <img
                              src={bg.src}
                              alt={bg.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="px-0.5 pt-1 text-[10px] font-medium text-[var(--text-primary)] truncate">
                            {bg.name}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <label className="liquid-glass-btn w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-full text-xs font-medium text-[var(--text-primary)] cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-[var(--accent-amber)]" />
                    <span>
                      {props.background.customImageUrl
                        ? 'Cambiar imagen propia'
                        : 'Subir fondo personalizado'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const url = URL.createObjectURL(file);
                        props.onChangeBackground((p) => ({
                          ...p,
                          mode: 'image',
                          imageId: 'custom',
                          customImageUrl: url,
                        }));
                      }}
                    />
                  </label>

                  <GlassButton
                    size="sm"
                    className="w-full"
                    onClick={props.onCaptureWindowAsBackground}
                    leadingIcon={<Monitor className="w-3.5 h-3.5 text-[var(--accent-green)]" />}
                  >
                    Capturar otra ventana como fondo
                  </GlassButton>
                </div>
              )}

              {props.background.mode === 'color' && (
                <div className="flex items-center gap-2">
                  {SOLID_BACKGROUND_COLORS.map((c) => {
                    const active =
                      props.background.solidColor.toLowerCase() === c.hex.toLowerCase();
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        title={c.name}
                        onClick={() =>
                          props.onChangeBackground((p) => ({ ...p, solidColor: c.hex }))
                        }
                        className={`w-8 h-8 rounded-full border transition-transform cursor-pointer shadow-sm ${
                          active
                            ? 'border-[var(--text-primary)] scale-110 ring-2 ring-[var(--border-focus)]'
                            : 'border-[var(--border-hairline)] hover:scale-105'
                        }`}
                        style={{ backgroundColor: c.hex }}
                      />
                    );
                  })}
                  <label
                    title="Color personalizado"
                    className="ml-auto flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer"
                  >
                    <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
                      {props.background.solidColor.toUpperCase()}
                    </span>
                    <input
                      type="color"
                      value={props.background.solidColor}
                      onChange={(e) =>
                        props.onChangeBackground((p) => ({
                          ...p,
                          solidColor: e.target.value,
                        }))
                      }
                      className="w-7 h-7 rounded-full bg-transparent border border-[var(--border-hairline)] cursor-pointer overflow-hidden"
                    />
                  </label>
                </div>
              )}

              {props.background.mode === 'blur' && (
                <GlassSlider
                  label="Desenfoque de fondo"
                  min={4}
                  max={28}
                  value={props.background.blurAmount}
                  displayValue={`${props.background.blurAmount}px`}
                  onChange={(blurAmount) =>
                    props.onChangeBackground((p) => ({ ...p, blurAmount }))
                  }
                />
              )}

              {props.background.mode !== 'none' && (
                <div className="space-y-2.5 pt-1">
                  <GlassSlider
                    label="Umbral de recorte"
                    min={15}
                    max={85}
                    value={props.background.sensitivity}
                    displayValue={`${props.background.sensitivity}%`}
                    onChange={(sensitivity) =>
                      props.onChangeBackground((p) => ({ ...p, sensitivity }))
                    }
                  />

                  <GlassSlider
                    label="Suavizado de contorno"
                    min={0}
                    max={100}
                    value={props.background.edgeSoftness}
                    displayValue={`${props.background.edgeSoftness}%`}
                    onChange={(edgeSoftness) =>
                      props.onChangeBackground((p) => ({ ...p, edgeSoftness }))
                    }
                  />

                  {!props.background.useAi && props.background.mode !== 'transparent' && (
                    <div className="flex items-center gap-2 pt-0.5">
                      <GlassButton
                        size="xs"
                        className="flex-1"
                        onClick={props.onCalibrateBackground}
                      >
                        {props.background.hasCalibratedBg
                          ? 'Recalibrar fondo vacío'
                          : 'Calibrar fondo vacío'}
                      </GlassButton>
                      {props.background.hasCalibratedBg && (
                        <GlassButton size="xs" onClick={props.onClearBackgroundCalibration}>
                          Auto
                        </GlassButton>
                      )}
                    </div>
                  )}
                </div>
              )}
            </GlassDisclosure>

            <GlassDisclosure
              title="Ajustes de Imagen"
              defaultOpen
              badge={
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onChangeAdjustments(() => DEFAULT_ADJUSTMENTS);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" /> Restablecer
                </button>
              }
            >
              {(
                [
                  { key: 'brightness', label: 'Brillo / Exposición', min: -50, max: 50 },
                  { key: 'contrast', label: 'Contraste', min: -50, max: 50 },
                  { key: 'saturation', label: 'Saturación', min: -100, max: 100 },
                  { key: 'temperature', label: 'Temperatura (Frío / Cálido)', min: -50, max: 50 },
                  { key: 'softSkin', label: 'Suavizado Retrato', min: 0, max: 100 },
                  { key: 'vignette', label: 'Viñeta Óptica', min: 0, max: 100 },
                ] as const
              ).map((ctrl) => (
                <GlassSlider
                  key={ctrl.key}
                  label={ctrl.label}
                  min={ctrl.min}
                  max={ctrl.max}
                  value={props.adjustments[ctrl.key]}
                  onChange={(val) =>
                    props.onChangeAdjustments((p) => ({ ...p, [ctrl.key]: val }))
                  }
                  onReset={() =>
                    props.onChangeAdjustments((p) => ({
                      ...p,
                      [ctrl.key]: DEFAULT_ADJUSTMENTS[ctrl.key],
                    }))
                  }
                />
              ))}
            </GlassDisclosure>
          </>
        )}

        {/* ======================== BOOTH, BURST & SURVEILLANCE TAB ======================== */}
        {activeTab === 'booth' && (
          <>
            <GlassDisclosure
              title="Temporizador y Disparador"
              defaultOpen
              icon={<Timer className="w-4 h-4 text-[var(--accent-amber)]" />}
            >
              <GlassSegmentedControl<string>
                fullWidth
                size="xs"
                layoutGroupId="inspector-booth-timer"
                ariaLabel="Temporizador de captura"
                value={String(props.timerSeconds)}
                onChange={(val) => props.onChangeTimerSeconds(parseInt(val, 10))}
                options={[
                  { id: '0', label: 'Directo' },
                  { id: '3', label: '3s' },
                  { id: '5', label: '5s' },
                  { id: '10', label: '10s' },
                ]}
              />

              <div className="grid grid-cols-2 gap-2 pt-1">
                <GlassButton
                  size="sm"
                  variant={props.flashEnabled ? 'amber' : 'regular'}
                  selected={props.flashEnabled}
                  onClick={props.onToggleFlash}
                >
                  Flash Pantalla: {props.flashEnabled ? 'Sí' : 'No'}
                </GlassButton>
                <GlassButton
                  size="sm"
                  onClick={props.onToggleSoundMuted}
                  leadingIcon={
                    props.soundMuted ? (
                      <VolumeX className="w-3.5 h-3.5" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )
                  }
                >
                  {props.soundMuted ? 'Sonido Off' : 'Sonido On'}
                </GlassButton>
              </div>
            </GlassDisclosure>

            <GlassDisclosure
              title="Cabina Photo Booth (Tira 4×)"
              defaultOpen
              icon={<Camera className="w-4 h-4 text-[var(--accent-amber)]" />}
            >
              <p className="text-xs text-[var(--text-tertiary)]">
                Captura 4 fotos secuenciales con el filtro activo y arma una tira lista para descargar.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <GlassButton size="md" onClick={() => props.onStartPhotoBooth('dark')}>
                  Tira Oscura
                </GlassButton>
                <button
                  type="button"
                  onClick={() => props.onStartPhotoBooth('polaroid')}
                  className="glass-focus-ring h-9 px-3 rounded-full bg-white/95 hover:bg-white text-xs font-semibold text-zinc-950 border border-black/10 shadow-[0_6px_18px_rgba(0,0,0,0.16)] transition-all active:scale-95 cursor-pointer"
                >
                  Tira Polaroid
                </button>
              </div>
            </GlassDisclosure>

            <GlassDisclosure title="Ráfaga, Ventanas e Intervalómetro" defaultOpen>
              <div className="grid grid-cols-1 gap-2">
                <GlassButton size="md" className="w-full" onClick={props.onStartBurst}>
                  Ráfaga Rápida (5 fotos en 1.5s)
                </GlassButton>
                <GlassButton
                  size="md"
                  className="w-full"
                  onClick={props.onCaptureWindow}
                  leadingIcon={<Monitor className="w-3.5 h-3.5 text-[var(--accent-blue)]" />}
                >
                  Capturar otra ventana (PNG)
                </GlassButton>
              </div>

              <div className="pt-1 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-secondary)]">Intervalómetro (Time-Lapse)</span>
                  {props.timelapseActive && (
                    <span className="font-mono tabular-nums text-[var(--accent-amber)]">
                      {props.timelapseCount} fotos
                    </span>
                  )}
                </div>
                <GlassSegmentedControl<string>
                  fullWidth
                  size="xs"
                  layoutGroupId="inspector-timelapse-interval"
                  ariaLabel="Intervalo Time-Lapse"
                  value={String(props.timelapseIntervalSec)}
                  onChange={(val) => props.onChangeTimelapseInterval(parseInt(val, 10))}
                  options={[
                    { id: '2', label: '2s' },
                    { id: '5', label: '5s' },
                    { id: '10', label: '10s' },
                    { id: '30', label: '30s' },
                  ]}
                />
                <GlassButton
                  size="md"
                  className="w-full"
                  variant={props.timelapseActive ? 'danger' : 'regular'}
                  onClick={props.onToggleTimelapse}
                >
                  {props.timelapseActive
                    ? `Detener Time-Lapse (${props.timelapseCount})`
                    : `Iniciar Time-Lapse cada ${props.timelapseIntervalSec}s`}
                </GlassButton>
              </div>
            </GlassDisclosure>

            <GlassDisclosure
              title="Detector de Movimiento"
              defaultOpen={false}
              icon={<ShieldAlert className="w-4 h-4 text-[var(--accent-amber)]" />}
              badge={
                props.motionActive ? (
                  <GlassStatusIndicator compact tone="warning" label={`${props.motionScore}%`} />
                ) : undefined
              }
            >
              <GlassToggle
                label="Activar detector de movimiento"
                checked={props.motionActive}
                onChange={() => props.onToggleMotion()}
              />

              <GlassSlider
                label="Sensibilidad (Umbral)"
                min={5}
                max={60}
                value={props.motionSensitivity}
                displayValue={`${props.motionSensitivity}%`}
                onChange={props.onChangeMotionSensitivity}
              />

              {props.motionActive && (
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
                    <span>Actividad actual</span>
                    <span>{props.motionScore}%</span>
                  </div>
                  <div className="h-1.5 bg-[var(--studio-surface-well)] rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-100 rounded-full ${
                        props.motionScore >= props.motionSensitivity
                          ? 'bg-rose-500'
                          : 'bg-amber-400'
                      }`}
                      style={{ width: `${Math.min(100, props.motionScore)}%` }}
                    />
                  </div>
                  {props.motionEvents.length > 0 && (
                    <div className="max-h-28 overflow-y-auto studio-scroll space-y-1 pt-1">
                      {props.motionEvents.slice(0, 5).map((ev) => (
                        <div
                          key={ev.id}
                          className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[var(--text-tertiary)] py-1 border-b border-[var(--border-hairline)]"
                        >
                          <span>Movimiento ({ev.score}%)</span>
                          <span>{new Date(ev.timestamp).toLocaleTimeString('es-ES')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </GlassDisclosure>
          </>
        )}

        {/* ======================== RECORDING, SCREEN PIP & TELEPROMPTER TAB ======================== */}
        {activeTab === 'record' && (
          <>
            <GlassDisclosure
              title="Grabación y Consola de Audio"
              defaultOpen
              icon={<Video className="w-4 h-4 text-[var(--accent-red)]" />}
              badge={
                props.isRecording ? (
                  <GlassStatusIndicator compact tone="recording" label="REC" />
                ) : undefined
              }
            >
              <p className="text-xs text-[var(--text-tertiary)]">
                Los filtros, efectos, zoom y doble cámara se graban directo en MP4 o WebM.
              </p>

              <div className="space-y-1">
                <span className="text-[11px] text-[var(--text-tertiary)]">Formato de salida</span>
                <GlassSegmentedControl<RecordingFormatPref>
                  fullWidth
                  size="xs"
                  layoutGroupId="inspector-rec-format"
                  ariaLabel="Formato de grabación"
                  value={props.recordingFormatPref}
                  onChange={props.onChangeRecordingFormatPref}
                  options={[
                    { id: 'auto-mp4', label: 'MP4 (Preferido)' },
                    { id: 'webm', label: 'WebM (VP9)' },
                  ]}
                />
              </div>

              <div className="flex items-center gap-2">
                <GlassButton
                  size="md"
                  className="flex-1"
                  variant={props.isRecording ? 'danger' : 'primary'}
                  onClick={props.onToggleRecord}
                >
                  {props.isRecording ? 'Detener y Guardar Video' : 'Iniciar Grabación HD'}
                </GlassButton>

                <GlassIconButton
                  size="lg"
                  variant={props.micMuted ? 'danger' : 'regular'}
                  label={props.micMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
                  onClick={props.onToggleMicMuted}
                >
                  {props.micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </GlassIconButton>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-mono tabular-nums text-[var(--text-tertiary)]">
                  <span>Nivel de entrada</span>
                  <span>{props.micMuted ? 'MUTE' : `${Math.round(props.audioLevel)}%`}</span>
                </div>
                <div className="h-2 bg-[var(--studio-surface-well)] rounded-full overflow-hidden border border-[var(--border-hairline)]">
                  <div
                    className={`h-full transition-all duration-75 rounded-full ${
                      props.audioLevel > 82
                        ? 'bg-rose-500'
                        : props.audioLevel > 50
                          ? 'bg-amber-400'
                          : 'bg-emerald-500'
                    }`}
                    style={{ width: `${props.micMuted ? 0 : Math.min(100, props.audioLevel)}%` }}
                  />
                </div>
              </div>

              <GlassSlider
                label="Ganancia de micrófono"
                min={0}
                max={200}
                step={5}
                value={props.audioConsole.micGain}
                displayValue={`${props.audioConsole.micGain}%`}
                onChange={(micGain) =>
                  props.onChangeAudioConsole((p) => ({ ...p, micGain }))
                }
                onReset={() =>
                  props.onChangeAudioConsole((p) => ({ ...p, micGain: 100 }))
                }
              />

              <GlassToggle
                label="Compresor de voz y nivelación"
                subtle
                checked={props.audioConsole.compressorEnabled}
                onChange={(compressorEnabled) =>
                  props.onChangeAudioConsole((p) => ({ ...p, compressorEnabled }))
                }
              />

              <GlassToggle
                label="Capturar audio de ventana compartida"
                subtle
                checked={props.audioConsole.includeSystemAudio}
                onChange={(includeSystemAudio) =>
                  props.onChangeAudioConsole((p) => ({ ...p, includeSystemAudio }))
                }
              />
            </GlassDisclosure>

            <GlassDisclosure
              title="Ventana Flotante del Sistema"
              defaultOpen={false}
              icon={<PictureInPicture2 className="w-4 h-4 text-[var(--accent-blue)]" />}
            >
              <p className="text-xs text-[var(--text-tertiary)]">
                Abre tu cámara ya filtrada en una ventana flotante siempre visible sobre otras apps del Mac.
              </p>
              <GlassButton
                size="md"
                className="w-full"
                variant={props.isOutputPipActive ? 'primary' : 'regular'}
                selected={props.isOutputPipActive}
                onClick={props.onToggleOutputPip}
                leadingIcon={<PictureInPicture2 className="w-3.5 h-3.5" />}
              >
                {props.isOutputPipActive
                  ? 'Cerrar Ventana Flotante'
                  : 'Abrir Ventana Flotante (PiP)'}
              </GlassButton>
            </GlassDisclosure>

            <GlassDisclosure
              title="Pantalla + Cámara (PiP)"
              defaultOpen
              icon={<Monitor className="w-4 h-4 text-[var(--accent-blue)]" />}
            >
              <p className="text-xs text-[var(--text-tertiary)]">
                Comparte otra ventana de tu MacBook en vivo (con o sin tu cámara encima) o captura una imagen fija.
              </p>
              <div className="grid grid-cols-1 gap-2">
                <GlassButton
                  size="md"
                  className="w-full"
                  variant={props.isScreenPipActive ? 'amber' : 'primary'}
                  onClick={props.onToggleScreenPip}
                >
                  {props.isScreenPipActive
                    ? 'Detener Ventana Compartida'
                    : 'Compartir Otra Ventana en Vivo'}
                </GlassButton>
                <GlassButton
                  size="md"
                  className="w-full"
                  onClick={props.onCaptureWindow}
                  leadingIcon={<Monitor className="w-3.5 h-3.5 text-[var(--accent-blue)]" />}
                >
                  Tomar Captura de Ventana (PNG)
                </GlassButton>
              </div>

              {props.isScreenPipActive && (
                <div className="space-y-3 pt-1">
                  <GlassSegmentedControl<ScreenLayoutMode>
                    fullWidth
                    size="xs"
                    layoutGroupId="inspector-screen-layout"
                    ariaLabel="Diseño de ventana compartida"
                    value={props.screenLayout}
                    onChange={props.onChangeScreenLayout}
                    options={[
                      { id: 'pip', label: 'Ventana + PiP' },
                      { id: 'screen-only', label: 'Solo Ventana' },
                    ]}
                  />

                  {props.screenLayout === 'pip' && (
                    <>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(
                          [
                            { id: 'top-left', label: 'Sup. Izquierda' },
                            { id: 'top-right', label: 'Sup. Derecha' },
                            { id: 'bottom-left', label: 'Inf. Izquierda' },
                            { id: 'bottom-right', label: 'Inf. Derecha' },
                          ] as const
                        ).map((c) => (
                          <GlassButton
                            key={c.id}
                            size="xs"
                            selected={props.pipCorner === c.id}
                            onClick={() => props.onChangePipCorner(c.id)}
                          >
                            {c.label}
                          </GlassButton>
                        ))}
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <GlassButton
                          size="xs"
                          className="flex-1"
                          onClick={props.onTogglePipCircular}
                        >
                          Forma: {props.pipCircular ? 'Circular' : 'Rectángulo'}
                        </GlassButton>
                        <GlassSegmentedControl<string>
                          size="xs"
                          layoutGroupId="inspector-pip-size"
                          ariaLabel="Tamaño PiP"
                          value={
                            [0.18, 0.24, 0.32]
                              .find((sz) => Math.abs(props.pipSizeRatio - sz) < 0.02)
                              ?.toString() ?? '0.24'
                          }
                          onChange={(val) => props.onChangePipSizeRatio(parseFloat(val))}
                          options={[
                            { id: '0.18', label: 'S' },
                            { id: '0.24', label: 'M' },
                            { id: '0.32', label: 'L' },
                          ]}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </GlassDisclosure>

            <GlassDisclosure
              title="Teleprompter"
              defaultOpen={false}
              badge={
                props.teleprompter.enabled ? (
                  <GlassStatusIndicator compact tone="live" label="Activo" />
                ) : undefined
              }
            >
              <GlassToggle
                label="Mostrar teleprompter"
                checked={props.teleprompter.enabled}
                onChange={(enabled) =>
                  props.onChangeTeleprompter((p) => ({ ...p, enabled }))
                }
              />

              <textarea
                rows={4}
                value={props.teleprompter.text}
                onChange={(e) =>
                  props.onChangeTeleprompter((p) => ({ ...p, text: e.target.value }))
                }
                placeholder="Escribe aquí tu guion para leer mirando directamente a la cámara del MacBook..."
                className="liquid-input w-full rounded-2xl p-3 text-xs leading-relaxed studio-scroll"
              />

              <div className="grid grid-cols-2 gap-3">
                <GlassSlider
                  label="Velocidad"
                  min={1}
                  max={10}
                  value={props.teleprompter.speed}
                  displayValue={`${props.teleprompter.speed}×`}
                  onChange={(speed) =>
                    props.onChangeTeleprompter((p) => ({ ...p, speed }))
                  }
                />
                <GlassSlider
                  label="Tamaño"
                  min={16}
                  max={40}
                  value={props.teleprompter.fontSize}
                  displayValue={`${props.teleprompter.fontSize}px`}
                  onChange={(fontSize) =>
                    props.onChangeTeleprompter((p) => ({ ...p, fontSize }))
                  }
                />
              </div>
            </GlassDisclosure>

            {props.appearanceSettings &&
              props.resolvedAppearance &&
              props.onUpdateAppearance &&
              props.onResetAppearance && (
                <GlassDisclosure
                  title="Apariencia y Material"
                  defaultOpen={false}
                  icon={<Palette className="w-4 h-4 text-[var(--accent-blue)]" />}
                  badge={
                    <span className="font-mono text-[10px] text-[var(--text-tertiary)] uppercase">
                      {props.resolvedAppearance.effectiveMaterialTier}
                    </span>
                  }
                >
                  <AppearanceControls
                    settings={props.appearanceSettings}
                    resolved={props.resolvedAppearance}
                    onUpdate={props.onUpdateAppearance}
                    onReset={props.onResetAppearance}
                  />
                </GlassDisclosure>
              )}

            {props.studioEnginePanel && (
              <GlassDisclosure
                  title="Laboratorio Experimental · Studio Engine"
                  open={isStudioLabOpen}
                  onToggleOpen={setStudioLabOpen}
                  icon={<Layers className="w-4 h-4 text-[var(--accent-blue)]" />}
                  badge={
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                        props.studioEnginePanel.engineMode === 'studio'
                          ? 'bg-[var(--accent-blue-soft)] text-[var(--accent-blue)] border border-[var(--border-focus)]'
                          : 'glass-surface-subtle text-[var(--text-tertiary)]'
                      }`}
                    >
                      {props.studioEnginePanel.engineMode === 'studio' ? 'STUDIO' : 'LEGACY'}
                    </span>
                  }
                >
                  <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                    Motor multipista con ProgramCanvas separado. Legacy sigue siendo la ruta estable por defecto.
                  </p>

                  <GlassSegmentedControl<EngineMode>
                    fullWidth
                    size="xs"
                    disabled={props.studioEnginePanel.isRecordingLocked}
                    layoutGroupId="inspector-studio-engine-mode"
                    ariaLabel="Selector de motor audiovisual"
                    value={props.studioEnginePanel.engineMode}
                    onChange={(modeOpt) => {
                      void props.studioEnginePanel!.onSwitchEngineMode(modeOpt);
                    }}
                    options={[
                      { id: 'legacy', label: 'Legacy (Estable)' },
                      { id: 'studio', label: 'Studio (Experimental)' },
                    ]}
                  />

                  {props.studioEnginePanel.isRecordingLocked && (
                    <div className="text-[11px] text-[var(--accent-amber)] bg-[var(--accent-amber-soft)] rounded-xl px-3 py-2">
                      Cambio de motor, backend y resolución bloqueados durante grabación activa.
                    </div>
                  )}

                  {props.studioEnginePanel.lastError && (
                    <div className="space-y-2 text-[11px] text-[var(--accent-red)] bg-[var(--accent-red-soft)] rounded-xl px-3 py-2">
                      <p>{props.studioEnginePanel.lastError}</p>
                      <GlassButton
                        size="xs"
                        className="w-full"
                        onClick={props.studioEnginePanel.onRecoverCanvas2dFallback}
                      >
                        Recuperar con respaldo Canvas 2D
                      </GlassButton>
                    </div>
                  )}

                  {props.studioEnginePanel.engineMode === 'studio' && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
                          <span>Escena activa</span>
                          <GlassSegmentedControl<'fade' | 'cut'>
                            size="xs"
                            layoutGroupId="inspector-studio-transition"
                            ariaLabel="Transición entre escenas"
                            value={studioTransitionType}
                            onChange={setStudioTransitionType}
                            options={[
                              { id: 'fade', label: 'FADE' },
                              { id: 'cut', label: 'CUT' },
                            ]}
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-1.5">
                          {props.studioEnginePanel.scenes.map((scene) => {
                            const isActive =
                              scene.id === props.studioEnginePanel!.activeSceneId;
                            return (
                              <GlassButton
                                key={scene.id}
                                size="xs"
                                className="w-full justify-start"
                                selected={isActive}
                                onClick={() =>
                                  props.studioEnginePanel!.onSwitchScene(scene.id, {
                                    type: studioTransitionType,
                                    durationMs: studioTransitionType === 'fade' ? 280 : 0,
                                  })
                                }
                              >
                                {scene.name}
                              </GlassButton>
                            );
                          })}
                        </div>

                        <div className="grid grid-cols-3 gap-1 pt-0.5">
                          {(
                            [
                              { id: 'ai-tutorial-pip', label: 'Tutorial PiP' },
                              { id: 'camera-primary', label: 'Solo Cámara' },
                              { id: 'fullscreen-demo', label: 'Pantalla Full' },
                            ] as const
                          ).map((preset) => (
                            <GlassButton
                              key={preset.id}
                              size="xs"
                              onClick={() =>
                                props.studioEnginePanel!.onActivatePresetScene(preset.id, {
                                  type: studioTransitionType,
                                  durationMs: studioTransitionType === 'fade' ? 280 : 0,
                                })
                              }
                            >
                              {preset.label}
                            </GlassButton>
                          ))}
                        </div>
                      </div>

                      <GlassButton
                        size="sm"
                        className="w-full"
                        variant={
                          props.studioEnginePanel.hasLiveDisplaySource ? 'amber' : 'primary'
                        }
                        onClick={() => props.studioEnginePanel?.onAuthorizeDisplaySource()}
                      >
                        {props.studioEnginePanel.hasLiveDisplaySource
                          ? 'Cambiar pantalla o ventana'
                          : 'Compartir pantalla o ventana'}
                      </GlassButton>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
                          <span>Backend gráfico</span>
                          <span className="font-mono text-[var(--accent-blue)]">
                            activo: {props.studioEnginePanel.backendKind}
                          </span>
                        </div>
                        <GlassSegmentedControl<PreferredCompositorBackend>
                          fullWidth
                          size="xs"
                          disabled={props.studioEnginePanel.isRecordingLocked}
                          layoutGroupId="inspector-studio-backend"
                          ariaLabel="Backend gráfico de compositor"
                          value={props.studioEnginePanel.preferredBackend}
                          onChange={props.studioEnginePanel.onChangeBackendPreference}
                          options={[
                            { id: 'auto', label: 'Auto' },
                            { id: 'webgl2', label: 'WebGL2' },
                            { id: 'canvas2d', label: 'Canvas2D' },
                          ]}
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-1.5">
                    <GlassButton size="xs" onClick={props.studioEnginePanel.onRefreshDiagnostics}>
                      Ver diagnóstico
                    </GlassButton>
                    <GlassButton
                      size="xs"
                      selected={showCompatMatrix}
                      onClick={() => setShowCompatMatrix((v) => !v)}
                    >
                      {showCompatMatrix ? 'Ocultar matriz' : 'Compatibilidad'}
                    </GlassButton>
                  </div>

                  {props.studioEnginePanel.diagnosticsSnapshot && (
                    <div className="pt-2.5 border-t border-[var(--border-hairline)] space-y-1.5 text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-tertiary)]">Estado</span>
                        <span>
                          {props.studioEnginePanel.diagnosticsSnapshot.compositorState} ·{' '}
                          {props.studioEnginePanel.diagnosticsSnapshot.backendKind}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-tertiary)]">Salida</span>
                        <span>
                          {props.studioEnginePanel.diagnosticsSnapshot.outputWidth}×
                          {props.studioEnginePanel.diagnosticsSnapshot.outputHeight} ·{' '}
                          {props.studioEnginePanel.diagnosticsSnapshot.effectiveFps.toFixed(1)} fps
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-tertiary)]">Render</span>
                        <span>
                          {props.studioEnginePanel.diagnosticsSnapshot.lastRenderDurationMs.toFixed(
                            2
                          )}{' '}
                          ms · {props.studioEnginePanel.diagnosticsSnapshot.renderedFrames} frames
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-tertiary)]">Fuentes / Tracks</span>
                        <span>
                          {props.studioEnginePanel.diagnosticsSnapshot.connectedSourcesCount}/
                          {props.studioEnginePanel.diagnosticsSnapshot.registeredSourcesCount} vivas
                          · {props.studioEnginePanel.diagnosticsSnapshot.activeTracksCount} pistas
                        </span>
                      </div>
                      {props.studioEnginePanel.diagnosticsSnapshot.sources.map((src) => (
                        <div
                          key={src.id}
                          className="flex justify-between text-[10px] text-[var(--text-tertiary)] border-t border-[var(--border-hairline)] pt-1"
                        >
                          <span className="truncate max-w-[140px]">
                            {src.name} ({src.kind})
                          </span>
                          <span>
                            {src.status} · c:{src.consumers}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {showCompatMatrix && (
                    <div className="pt-2.5 border-t border-[var(--border-hairline)] max-h-44 overflow-y-auto studio-scroll space-y-1.5 text-[10px]">
                      {props.studioEnginePanel.compatibilityMatrix.map((item) => (
                        <div
                          key={item.id}
                          className="border-b border-[var(--border-hairline)] pb-1 last:border-b-0"
                        >
                          <div className="flex justify-between text-[var(--text-primary)] font-medium">
                            <span>{item.feature}</span>
                            <span className="font-mono text-[var(--accent-blue)]">
                              {item.studioSupport}
                            </span>
                          </div>
                          <p className="text-[var(--text-tertiary)] leading-snug">{item.notes}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <GlassButton
                    size="xs"
                    className="w-full"
                    disabled={props.studioEnginePanel.isRecordingLocked}
                    onClick={props.studioEnginePanel.onResetProject}
                  >
                    Restablecer proyecto Studio
                  </GlassButton>
                </GlassDisclosure>
            )}
          </>
        )}
      </div>
    </GlassInspector>
  );
};
