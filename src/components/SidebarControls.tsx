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
  PreferredCompositorBackend,
  StudioDiagnosticsSnapshot,
} from '../engine/studioCoordinator';
import type { SceneTransition, StudioPresetId, StudioScene } from '../types/studio';
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
  sources: StudioDiagnosticsSnapshot['sources'];
  hasLiveDisplaySource: boolean;
  lastError: string | null;
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
  onAuthorizeDisplaySource: () => void;
  onChangeBackendPreference: (backend: PreferredCompositorBackend) => void;
  onRecoverCanvas2dFallback: () => void;
  onRefreshDiagnostics: () => void;
  onResetProject: () => void;
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
              title="Cámara y Encuadre"
              defaultOpen
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

            <GlassDisclosure
              title="Zoom Digital"
              defaultOpen
              badge={
                <span className="font-mono tabular-nums text-[11px] font-semibold text-[var(--accent-blue)]">
                  {props.zoom.toFixed(1)}×
                </span>
              }
            >
              <GlassSlider
                label="Ampliación óptica digital"
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
                  label="Marco de seguimiento IA en visor"
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
                  {props.background.useAi
                    ? props.aiStatus.segmenter === 'loading'
                      ? 'Cargando red neuronal...'
                      : props.aiStatus.segmenter === 'error'
                        ? 'Respaldo cromático activo'
                        : 'IA Neural MediaPipe activa'
                    : 'Modo cromático manual'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    props.onChangeBackground((p) => ({ ...p, useAi: !p.useAi }))
                  }
                  className="text-[var(--accent-blue)] hover:underline font-medium whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {props.background.useAi ? 'Usar Color' : 'Usar IA'}
                </button>
              </div>

              <GlassSegmentedControl<BackgroundReplaceMode>
                fullWidth
                size="xs"
                layoutGroupId="inspector-bg-mode"
                ariaLabel="Modo de reemplazo de fondo"
                value={props.background.mode}
                onChange={(mode) => props.onChangeBackground((p) => ({ ...p, mode }))}
                options={[
                  { id: 'none', label: 'Original' },
                  { id: 'blur', label: 'Desenfoque' },
                  { id: 'color', label: 'Color' },
                  { id: 'image', label: 'Imagen' },
                ]}
              />

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

                  {!props.background.useAi && (
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
                        onClick={props.studioEnginePanel.onAuthorizeDisplaySource}
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
