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

interface SidebarControlsProps {
  activeTab: WorkspaceTab;
  onChangeTab: (tab: WorkspaceTab) => void;
  videoDevices: MediaDeviceInfo[];
  audioDevices: MediaDeviceInfo[];
  selectedVideoId: string;
  selectedAudioId: string;
  sensorSize: { w: number; h: number };
  cameraStatus: 'idle' | 'live' | 'demo' | 'error';
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
}

const AppleToggle: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  subtle?: boolean;
}> = ({ checked, onChange, label, subtle }) => (
  <div className="flex items-center justify-between gap-3 py-1.5">
    <span
      onClick={() => onChange(!checked)}
      className={`text-xs select-none cursor-pointer ${
        subtle ? 'text-zinc-300/80' : 'text-zinc-100'
      }`}
    >
      {label}
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-checked={checked ? 'true' : 'false'}
      onClick={() => onChange(!checked)}
      className="apple-switch"
    >
      <span className="apple-switch-thumb" />
    </button>
  </div>
);

export const SidebarControls: React.FC<SidebarControlsProps> = (props) => {
  const { activeTab } = props;
  const [studioSubTab, setStudioSubTab] = useState<'optics' | 'utilities' | 'overlays'>('optics');
  const [filterCat, setFilterCat] = useState<'all' | 'instagram' | 'cinema' | 'classic'>('all');
  const [effectCat, setEffectCat] = useState<'all' | 'cartoon' | 'cinema' | 'retro' | 'geometry'>('all');
  const [copiedHex, setCopiedHex] = useState(false);
  const [copiedQr, setCopiedQr] = useState(false);

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

  return (
    <aside className="w-full lg:w-[344px] xl:w-[372px] p-2.5 lg:py-2.5 lg:pr-3 lg:pl-0 flex flex-col shrink-0 max-h-[48vh] lg:max-h-none overflow-hidden">
      <div className="liquid-glass-panel rounded-[26px] flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Studio Sub-Navigation Segmented Capsule */}
        {(activeTab === 'studio' || activeTab === 'utilities') && (
          <div className="px-4 pt-3.5 pb-2.5 border-b border-white/[0.10] shrink-0">
            <div className="liquid-segmented grid grid-cols-3 gap-0.5">
              <button
                type="button"
                onClick={() => setStudioSubTab('optics')}
                className={`px-2 py-1.5 text-[11px] font-medium rounded-full transition-all whitespace-nowrap truncate cursor-pointer ${
                  studioSubTab === 'optics'
                    ? 'liquid-segment-thumb text-white'
                    : 'text-zinc-300/75 hover:text-white'
                }`}
              >
                Óptica
              </button>
              <button
                type="button"
                onClick={() => setStudioSubTab('utilities')}
                className={`px-2 py-1.5 text-[11px] font-medium rounded-full transition-all whitespace-nowrap truncate cursor-pointer ${
                  studioSubTab === 'utilities'
                    ? 'liquid-segment-thumb text-white'
                    : 'text-zinc-300/75 hover:text-white'
                }`}
              >
                Utilidades
              </button>
              <button
                type="button"
                onClick={() => setStudioSubTab('overlays')}
                className={`px-2 py-1.5 text-[11px] font-medium rounded-full transition-all whitespace-nowrap truncate cursor-pointer ${
                  studioSubTab === 'overlays'
                    ? 'liquid-segment-thumb text-white'
                    : 'text-zinc-300/75 hover:text-white'
                }`}
              >
                Marcos
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto studio-scroll p-5 space-y-5">
          {/* ======================== STUDIO -> OPTICS, ZOOM & FOCUS ======================== */}
          {(activeTab === 'studio' || activeTab === 'utilities') && studioSubTab === 'optics' && (
            <>
              {/* Active Camera & Horizontal Framing */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold tracking-tight text-white">
                    Cámara y Encuadre
                  </h2>
                  <button
                    type="button"
                    onClick={props.onRefreshDevices}
                    title="Actualizar lista de cámaras"
                    className="liquid-glass-btn inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] text-zinc-200 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Detectar</span>
                  </button>
                </div>

                <div className="space-y-2">
                  <select
                    value={props.selectedVideoId}
                    onChange={(e) => props.onSelectVideoDevice(e.target.value)}
                    className="liquid-input w-full rounded-2xl px-3.5 py-2 text-xs cursor-pointer"
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
                  </select>
                  <div className="flex items-center justify-between px-1 text-[11px] font-mono text-zinc-300/75">
                    <span>
                      Sensor {props.sensorSize.w}×{props.sensorSize.h}
                    </span>
                    <span
                      className={
                        props.cameraStatus === 'live' &&
                        props.sensorSize.w < props.sensorSize.h &&
                        props.rotation % 180 === 0
                          ? 'text-amber-300'
                          : 'text-emerald-300'
                      }
                    >
                      {props.sensorSize.w < props.sensorSize.h ? 'Vertical' : 'Horizontal'}
                      {props.rotation !== 0 ? ` · ${props.rotation}°` : ''}
                    </span>
                  </div>
                </div>

                <div className="liquid-segmented grid grid-cols-5 gap-0.5">
                  {(
                    [
                      { id: '16:9', label: '16:9' },
                      { id: 'native', label: 'Sensor' },
                      { id: '4:3', label: '4:3' },
                      { id: '1:1', label: '1:1' },
                      { id: '9:16', label: '9:16' },
                    ] as { id: AspectRatioId; label: string }[]
                  ).map((ar) => (
                    <button
                      key={ar.id}
                      type="button"
                      onClick={() => props.onChangeAspectRatio(ar.id)}
                      className={`py-1.5 rounded-full text-[11px] font-mono transition-all cursor-pointer ${
                        props.aspectRatio === ar.id
                          ? 'liquid-segment-thumb text-white font-semibold'
                          : 'text-zinc-300/75 hover:text-white'
                      }`}
                    >
                      {ar.label}
                    </button>
                  ))}
                </div>

                <div className="liquid-segmented grid grid-cols-2 gap-0.5">
                  {(
                    [
                      { id: 'cover', label: 'Llenar bordes' },
                      { id: 'contain', label: 'Todo sin recorte' },
                    ] as { id: FrameFitMode; label: string }[]
                  ).map((fm) => (
                    <button
                      key={fm.id}
                      type="button"
                      onClick={() => props.onChangeFitMode(fm.id)}
                      className={`py-1.5 px-2 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                        props.fitMode === fm.id
                          ? 'liquid-segment-thumb text-white'
                          : 'text-zinc-300/75 hover:text-white'
                      }`}
                    >
                      {fm.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={props.onToggleMirror}
                    className={`inline-flex items-center justify-center gap-1.5 py-2 px-2 rounded-full text-xs font-medium cursor-pointer ${
                      props.mirror
                        ? 'liquid-glass-btn-active text-amber-200'
                        : 'liquid-glass-btn text-zinc-300'
                    }`}
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                    <span>Espejo</span>
                  </button>
                  <button
                    type="button"
                    onClick={props.onRotate90}
                    className={`inline-flex items-center justify-center gap-1.5 py-2 px-2 rounded-full text-xs font-medium cursor-pointer ${
                      props.rotation !== 0
                        ? 'liquid-glass-btn-active text-amber-200'
                        : 'liquid-glass-btn text-zinc-300'
                    }`}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>{props.rotation === 0 ? 'Rotar 90°' : `${props.rotation}°`}</span>
                  </button>
                  <button
                    type="button"
                    onClick={props.onToggleFlipVertical}
                    className={`inline-flex items-center justify-center gap-1.5 py-2 px-2 rounded-full text-xs font-medium cursor-pointer ${
                      props.flipVertical
                        ? 'liquid-glass-btn-active text-amber-200'
                        : 'liquid-glass-btn text-zinc-300'
                    }`}
                  >
                    <FlipVertical className="w-3.5 h-3.5" />
                    <span>Voltear</span>
                  </button>
                </div>
              </div>

              <div className="liquid-divider" />

              {/* Digital Zoom & Pan */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold tracking-tight text-white">
                    Zoom Digital
                  </h2>
                  <span className="font-mono text-xs text-sky-300 font-semibold">
                    {props.zoom.toFixed(1)}×
                  </span>
                </div>

                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.1}
                  value={props.zoom}
                  onChange={(e) => props.onChangeZoom(parseFloat(e.target.value))}
                  className="w-full studio-slider"
                  aria-label="Nivel de zoom digital"
                />

                <div className="liquid-segmented grid grid-cols-5 gap-0.5">
                  {[1, 1.5, 2, 3, 4].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        props.onChangeZoom(preset);
                        if (preset === 1) props.onChangePan(0, 0);
                      }}
                      className={`py-1.5 rounded-full font-mono text-xs transition-all cursor-pointer ${
                        Math.abs(props.zoom - preset) < 0.08
                          ? 'liquid-segment-thumb text-white font-semibold'
                          : 'text-zinc-300/75 hover:text-white'
                      }`}
                    >
                      {preset}×
                    </button>
                  ))}
                </div>

                {props.zoom > 1.05 && (
                  <div className="flex items-center justify-between pt-0.5 text-xs text-zinc-300/80">
                    <span>Arrastra en el visor para mover</span>
                    <button
                      type="button"
                      onClick={() => props.onChangePan(0, 0)}
                      className="text-sky-300 hover:text-sky-200 font-medium cursor-pointer"
                    >
                      Centrar
                    </button>
                  </div>
                )}
              </div>

              <div className="liquid-divider" />

              {/* Manual Focus & Selectable Focus Area */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                    <Focus className="w-4 h-4 text-amber-300" />
                    <span>Enfoque y Área</span>
                  </h2>
                  <button
                    type="button"
                    onClick={() => props.onChangeFocus(() => DEFAULT_FOCUS_SETTINGS)}
                    className="text-xs text-zinc-300/75 hover:text-white cursor-pointer"
                  >
                    Restablecer
                  </button>
                </div>

                {/* AF / MF Apple Capsule Toggle */}
                <div className="liquid-segmented grid grid-cols-2 gap-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      props.onChangeFocus((p) => ({ ...p, mode: 'auto', manualDistance: 50 }))
                    }
                    className={`py-1.5 text-xs font-medium rounded-full transition-all cursor-pointer ${
                      props.focus.mode === 'auto'
                        ? 'liquid-segment-thumb text-white'
                        : 'text-zinc-300/75 hover:text-white'
                    }`}
                  >
                    AF Automático
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onChangeFocus((p) => ({ ...p, mode: 'manual' }))}
                    className={`py-1.5 text-xs font-medium rounded-full transition-all cursor-pointer ${
                      props.focus.mode === 'manual'
                        ? 'liquid-glass-amber font-semibold'
                        : 'text-zinc-300/75 hover:text-white'
                    }`}
                  >
                    MF Manual
                  </button>
                </div>

                {/* Interactive Focus Area Selection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-300">Área de Enfoque</span>
                    <span className="font-mono text-[11px] text-zinc-400">
                      X:{Math.round(props.focus.areaX * 100)}% · Y:{Math.round(props.focus.areaY * 100)}%
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        props.onChangeFocus((p) => ({ ...p, selectingArea: !p.selectingArea }))
                      }
                      className={`flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-full text-xs font-medium cursor-pointer ${
                        props.focus.selectingArea
                          ? 'liquid-glass-amber'
                          : 'liquid-glass-btn text-zinc-100'
                      }`}
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>
                        {props.focus.selectingArea ? 'Clic en visor activo...' : 'Elegir en visor'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        props.onChangeFocus((p) => ({ ...p, areaX: 0.5, areaY: 0.5 }))
                      }
                      className="liquid-glass-btn py-2 px-3.5 rounded-full text-xs text-zinc-200 cursor-pointer"
                    >
                      Centro
                    </button>
                  </div>

                  {/* Area Size */}
                  <div className="liquid-segmented grid grid-cols-3 gap-0.5">
                    {(
                      [
                        { id: 'spot', label: 'Puntual' },
                        { id: 'zone', label: 'Zona Media' },
                        { id: 'wide', label: 'Amplia' },
                      ] as { id: FocusAreaSize; label: string }[]
                    ).map((sz) => (
                      <button
                        key={sz.id}
                        type="button"
                        onClick={() => props.onChangeFocus((p) => ({ ...p, areaSize: sz.id }))}
                        className={`py-1.5 rounded-full text-xs transition-all cursor-pointer ${
                          props.focus.areaSize === sz.id
                            ? 'liquid-segment-thumb text-white font-medium'
                            : 'text-zinc-300/75 hover:text-white'
                        }`}
                      >
                        {sz.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Manual Focus Distance Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-200">Plano de Enfoque Manual</span>
                    <span className="font-mono text-zinc-300">
                      {props.focus.manualDistance}%
                      {props.hardwareFocusSupported ? ' (Óptica)' : ''}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={props.focus.manualDistance}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      props.onChangeFocus((p) => ({
                        ...p,
                        mode: 'manual',
                        manualDistance: val,
                      }));
                    }}
                    className="w-full studio-slider"
                  />
                  <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                    <span>Macro (0)</span>
                    <button
                      type="button"
                      onClick={() =>
                        props.onChangeFocus((p) => ({ ...p, manualDistance: 50 }))
                      }
                      className="text-zinc-300 hover:text-amber-300 cursor-pointer"
                    >
                      Plano Sujeto (50)
                    </button>
                    <span>Infinito (100)</span>
                  </div>
                </div>

                {/* Selective Aperture Bokeh Blur */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-200">Desenfoque fuera de área (Bokeh)</span>
                    <span className="font-mono text-zinc-300">
                      {props.focus.apertureBlur === 0
                        ? 'f/16 (Nítido)'
                        : `f/${Math.max(1.4, 16 - (props.focus.apertureBlur / 100) * 14.6).toFixed(1)}`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={props.focus.apertureBlur}
                    onChange={(e) =>
                      props.onChangeFocus((p) => ({
                        ...p,
                        apertureBlur: parseInt(e.target.value, 10),
                      }))
                    }
                    className="w-full studio-slider"
                  />
                </div>

                <AppleToggle
                  label="Focus Peaking (Resalte nítido)"
                  checked={props.focus.peakingEnabled}
                  onChange={(checked) =>
                    props.onChangeFocus((p) => ({ ...p, peakingEnabled: checked }))
                  }
                />

                {/* AI Subject Recognition & Eye Auto-Focus Tracking */}
                <div className="pt-2 border-t border-white/[0.10] space-y-1.5">
                  <div className="flex items-center justify-between text-xs pb-0.5">
                    <span className="text-white font-medium">Reconocimiento de Sujeto IA</span>
                    <span className="font-mono text-[11px] text-emerald-300">
                      {props.aiStatus.detector === 'loading'
                        ? 'Cargando IA...'
                        : props.detectedSubjects.length > 0
                          ? `${props.detectedSubjects.length} sujeto · ${Math.round(props.detectedSubjects[0].confidence * 100)}%`
                          : 'Buscando'}
                    </span>
                  </div>

                  <AppleToggle
                    label="Marco de seguimiento IA en visor"
                    subtle
                    checked={props.focus.aiTrackingEnabled}
                    onChange={(checked) =>
                      props.onChangeFocus((p) => ({ ...p, aiTrackingEnabled: checked }))
                    }
                  />

                  <AppleToggle
                    label="Seguir rostro con área de enfoque"
                    subtle
                    checked={props.focus.aiAutoFocus}
                    onChange={(checked) =>
                      props.onChangeFocus((p) => ({ ...p, aiAutoFocus: checked }))
                    }
                  />
                </div>
              </div>

              <div className="liquid-divider" />

              {/* Electronic Video Stabilization (EIS) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                    <Move className="w-4 h-4 text-emerald-300" />
                    <span>Estabilización (EIS)</span>
                  </h2>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={props.stabilization.enabled}
                    aria-label="Activar estabilización EIS"
                    data-checked={props.stabilization.enabled ? 'true' : 'false'}
                    onClick={() =>
                      props.onChangeStabilization((p) => ({ ...p, enabled: !p.enabled }))
                    }
                    className="apple-switch"
                  >
                    <span className="apple-switch-thumb" />
                  </button>
                </div>
                <p className="text-xs text-zinc-300/75 leading-relaxed">
                  Analiza el desplazamiento entre fotogramas consecutivos y compensa vibraciones en tiempo real.
                </p>

                {props.stabilization.enabled && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-zinc-300">
                      <span>Compensación de movimiento</span>
                      <span className="font-mono text-emerald-300">
                        {props.stabilization.strength}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      value={props.stabilization.strength}
                      onChange={(e) =>
                        props.onChangeStabilization((p) => ({
                          ...p,
                          strength: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-full studio-slider"
                    />
                  </div>
                )}
              </div>

              <div className="liquid-divider" />

              {/* Mic & Resolution Hardware Settings */}
              <div className="space-y-3">
                <h2 className="text-[13px] font-semibold tracking-tight text-white">
                  Audio y Calidad
                </h2>

                <div className="space-y-1.5">
                  <label className="block text-xs text-zinc-300/80">Micrófono</label>
                  <select
                    value={props.selectedAudioId}
                    onChange={(e) => props.onSelectAudioDevice(e.target.value)}
                    className="liquid-input w-full rounded-2xl px-3.5 py-2 text-xs cursor-pointer"
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
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-zinc-300/80 mb-1.5">
                    Calidad / Resolución
                  </label>
                  <div className="liquid-segmented grid grid-cols-4 gap-0.5">
                    {(
                      [
                        { id: 'max', label: 'Máxima' },
                        { id: '4k', label: '4K' },
                        { id: '1080p', label: '1080p' },
                        { id: '720p', label: '720p' },
                      ] as { id: ResolutionPresetId; label: string }[]
                    ).map((res) => (
                      <button
                        key={res.id}
                        type="button"
                        onClick={() => props.onChangeResolution(res.id)}
                        className={`py-1.5 rounded-full text-xs font-mono transition-all cursor-pointer ${
                          props.resolutionPreset === res.id
                            ? 'liquid-segment-thumb text-white font-semibold'
                            : 'text-zinc-300/75 hover:text-white'
                        }`}
                      >
                        {res.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="liquid-divider" />

              {/* Virtual Ring Light */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                    <Sun className="w-4 h-4 text-amber-300" />
                    <span>Luz de Relleno en Pantalla</span>
                  </h2>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={props.ringLight.enabled}
                    aria-label="Activar luz de relleno"
                    data-checked={props.ringLight.enabled ? 'true' : 'false'}
                    onClick={() =>
                      props.onChangeRingLight((p) => ({ ...p, enabled: !p.enabled }))
                    }
                    className="apple-switch"
                  >
                    <span className="apple-switch-thumb" />
                  </button>
                </div>

                {props.ringLight.enabled && (
                  <div className="space-y-3 pt-1">
                    <div className="liquid-segmented grid grid-cols-4 gap-0.5">
                      {(
                        [
                          { id: 'warm', label: '3200K' },
                          { id: 'neutral', label: '5500K' },
                          { id: 'cool', label: '7500K' },
                          { id: 'rose', label: 'Rosa' },
                        ] as const
                      ).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() =>
                            props.onChangeRingLight((p) => ({ ...p, temperature: t.id }))
                          }
                          className={`py-1.5 rounded-full text-xs font-mono cursor-pointer ${
                            props.ringLight.temperature === t.id
                              ? 'liquid-segment-thumb text-white font-semibold'
                              : 'text-zinc-300/75 hover:text-white'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-zinc-300">
                        <span>Intensidad</span>
                        <span className="font-mono">{props.ringLight.intensity}%</span>
                      </div>
                      <input
                        type="range"
                        min={15}
                        max={100}
                        value={props.ringLight.intensity}
                        onChange={(e) =>
                          props.onChangeRingLight((p) => ({
                            ...p,
                            intensity: parseInt(e.target.value, 10),
                          }))
                        }
                        className="w-full studio-slider"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="liquid-divider" />

              {/* Dual Camera Simultaneous Mode (e.g. MacBook FaceTime + iPhone Continuity / USB) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                    <Camera className="w-4 h-4 text-sky-300" />
                    <span>Doble Cámara Simultánea</span>
                  </h2>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={props.dualCam.enabled}
                    aria-label="Activar doble cámara"
                    data-checked={props.dualCam.enabled ? 'true' : 'false'}
                    onClick={() =>
                      props.onChangeDualCam((p) => ({
                        ...p,
                        enabled: !p.enabled,
                        deviceId:
                          p.deviceId ||
                          props.videoDevices.find((d) => d.deviceId !== props.selectedVideoId)
                            ?.deviceId ||
                          '',
                      }))
                    }
                    className="apple-switch"
                  >
                    <span className="apple-switch-thumb" />
                  </button>
                </div>
                <p className="text-xs text-zinc-300/75">
                  Combina la cámara principal con una segunda cámara (iPhone Continuity o USB) en burbuja PiP.
                </p>

                {props.dualCam.enabled && (
                  <div className="space-y-2.5">
                    <select
                      value={props.dualCam.deviceId}
                      onChange={(e) =>
                        props.onChangeDualCam((p) => ({ ...p, deviceId: e.target.value }))
                      }
                      className="liquid-input w-full rounded-2xl px-3.5 py-2 text-xs cursor-pointer"
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
                    </select>

                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={props.onSwapCameras}
                        className="liquid-glass-btn py-1.5 px-3 rounded-full text-xs text-zinc-100 cursor-pointer"
                      >
                        Intercambiar planos
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          props.onChangeDualCam((p) => ({ ...p, mirror: !p.mirror }))
                        }
                        className={`py-1.5 px-3 rounded-full text-xs cursor-pointer ${
                          props.dualCam.mirror
                            ? 'liquid-glass-btn-active font-medium'
                            : 'liquid-glass-btn text-zinc-300'
                        }`}
                      >
                        Espejo PiP
                      </button>
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
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => props.onChangePipCorner(c.id)}
                          className={`py-1.5 rounded-full text-[11px] cursor-pointer ${
                            props.pipCorner === c.id
                              ? 'liquid-glass-btn-active font-medium'
                              : 'liquid-glass-btn text-zinc-300'
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="liquid-divider" />

              <button
                type="button"
                onClick={props.onResetAllPreferences}
                className="liquid-glass-btn w-full inline-flex items-center justify-center gap-1.5 py-2 px-4 rounded-full text-xs text-zinc-300 hover:text-white cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restablecer ajustes guardados</span>
              </button>
            </>
          )}

          {/* ======================== STUDIO -> UTILITIES ======================== */}
          {(activeTab === 'studio' || activeTab === 'utilities') && studioSubTab === 'utilities' && (
            <>
              {/* Live RGB Histogram */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-sky-300" />
                    <span>Histograma RGB en Vivo</span>
                  </h2>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={props.showHistogram}
                    aria-label="Mostrar histograma RGB"
                    data-checked={props.showHistogram ? 'true' : 'false'}
                    onClick={props.onToggleHistogram}
                    className="apple-switch"
                  >
                    <span className="apple-switch-thumb" />
                  </button>
                </div>

                {props.showHistogram && props.histogram && (
                  <div className="h-24 bg-black/35 border border-white/[0.12] rounded-2xl p-2.5 flex items-end gap-px shadow-inner">
                    {props.histogram.l.map((lv, idx) => (
                      <div key={idx} className="flex-1 h-full relative flex items-end">
                        <div
                          className="w-full bg-white/55 rounded-t-[2px]"
                          style={{ height: `${Math.round(lv * 100)}%` }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="liquid-divider" />

              {/* Composition Grids */}
              <div className="space-y-2.5">
                <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                  <Grid className="w-4 h-4 text-zinc-300" />
                  <span>Guías de Encuadre</span>
                </h2>
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
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => props.onChangeGridOverlay(g.id)}
                      className={`py-2 px-2 rounded-full text-xs cursor-pointer ${
                        props.gridOverlay === g.id
                          ? 'liquid-glass-btn-active font-medium'
                          : 'liquid-glass-btn text-zinc-300'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="liquid-divider" />

              {/* Document Scanner Shortcut */}
              <div className="space-y-2.5">
                <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-zinc-300" />
                  <span>Escáner de Documentos</span>
                </h2>
                <p className="text-xs text-zinc-300/75 leading-relaxed">
                  Optimiza contraste y nitidez en blanco y negro para capturar apuntes, recibos o pizarras.
                </p>
                <button
                  type="button"
                  onClick={props.onQuickDocumentScan}
                  className={`w-full py-2.5 px-4 rounded-full text-xs font-medium cursor-pointer ${
                    props.filterId === 'document-scan'
                      ? 'liquid-glass-blue'
                      : 'liquid-glass-btn text-zinc-100'
                  }`}
                >
                  {props.filterId === 'document-scan'
                    ? 'Modo Escáner Activo (Clic para restaurar)'
                    : 'Activar Modo Escáner de Documento'}
                </button>
              </div>

              <div className="liquid-divider" />

              {/* Color Eyedropper */}
              <div className="space-y-2.5">
                <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                  <Pipette className="w-4 h-4 text-zinc-300" />
                  <span>Cuentagotas de Color en Vivo</span>
                </h2>
                <button
                  type="button"
                  onClick={props.onToggleEyedropper}
                  className={`w-full py-2.5 px-4 rounded-full text-xs font-medium cursor-pointer ${
                    props.eyedropperActive
                      ? 'liquid-glass-amber font-semibold'
                      : 'liquid-glass-btn text-zinc-100'
                  }`}
                >
                  {props.eyedropperActive ? 'Haz clic en el visor para medir...' : 'Activar Cuentagotas'}
                </button>

                {props.sampledColor && (
                  <div className="flex items-center justify-between p-2.5 rounded-2xl bg-white/[0.06] border border-white/[0.12]">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-xl border border-white/25 shrink-0 shadow-sm"
                        style={{ backgroundColor: props.sampledColor.hex }}
                      />
                      <div className="font-mono text-xs">
                        <div className="text-white font-semibold">{props.sampledColor.hex}</div>
                        <div className="text-zinc-300/75 text-[11px]">
                          rgb({props.sampledColor.r}, {props.sampledColor.g}, {props.sampledColor.b})
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyText(props.sampledColor!.hex, 'hex')}
                      className="liquid-glass-btn p-2 rounded-full text-zinc-100 cursor-pointer"
                      title="Copiar HEX"
                    >
                      {copiedHex ? (
                        <Check className="w-3.5 h-3.5 text-emerald-300" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div className="liquid-divider" />

              {/* QR / Barcode Scanner */}
              <div className="space-y-2.5">
                <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-zinc-300" />
                  <span>Lector QR y Códigos</span>
                </h2>
                {props.qrSupported ? (
                  <>
                    <button
                      type="button"
                      onClick={props.onToggleQrScanning}
                      className={`w-full py-2.5 px-4 rounded-full text-xs font-medium cursor-pointer ${
                        props.qrScanning
                          ? 'liquid-glass-amber font-semibold'
                          : 'liquid-glass-btn text-zinc-100'
                      }`}
                    >
                      {props.qrScanning ? 'Escaneando en vivo... (Detener)' : 'Iniciar Escaneo QR'}
                    </button>
                    {props.lastQrResult && (
                      <div className="p-2.5 rounded-2xl bg-white/[0.06] border border-white/[0.14] flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-white truncate">
                          {props.lastQrResult}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(props.lastQrResult!, 'qr')}
                          className="liquid-glass-btn p-1.5 rounded-full text-zinc-100 shrink-0 cursor-pointer"
                        >
                          {copiedQr ? (
                            <Check className="w-3.5 h-3.5 text-emerald-300" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-zinc-400">
                    La detección nativa de códigos QR requiere Chrome o Edge en macOS.
                  </p>
                )}
              </div>
            </>
          )}

          {/* ======================== STUDIO -> OVERLAYS & BRANDING ======================== */}
          {(activeTab === 'studio' || activeTab === 'utilities') && studioSubTab === 'overlays' && (
            <div className="space-y-4">
              <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-300" />
                <span>Marcos y Rótulos en Grabación</span>
              </h2>
              <p className="text-xs text-zinc-300/75">
                Estos elementos se renderizan directamente sobre la imagen final de fotos y videos.
              </p>

              <div className="space-y-1">
                <AppleToggle
                  label="Barras Cinematográficas 2.39:1"
                  checked={props.branding.cinemaFrame}
                  onChange={(checked) =>
                    props.onChangeBranding((p) => ({ ...p, cinemaFrame: checked }))
                  }
                />
                <div className="liquid-divider" />
                <AppleToggle
                  label="Estampa de Fecha y Hora"
                  checked={props.branding.showTimestamp}
                  onChange={(checked) =>
                    props.onChangeBranding((p) => ({ ...p, showTimestamp: checked }))
                  }
                />
                <div className="liquid-divider" />
                <AppleToggle
                  label="Rótulo Inferior (Lower Third)"
                  checked={props.branding.showLowerThird}
                  onChange={(checked) =>
                    props.onChangeBranding((p) => ({ ...p, showLowerThird: checked }))
                  }
                />
              </div>

              {props.branding.showLowerThird && (
                <div className="space-y-2.5 pt-1">
                  <div>
                    <label className="block text-[11px] text-zinc-300/80 mb-1">
                      Nombre / Título
                    </label>
                    <input
                      type="text"
                      value={props.branding.lowerThirdName}
                      onChange={(e) =>
                        props.onChangeBranding((p) => ({ ...p, lowerThirdName: e.target.value }))
                      }
                      placeholder="Tu nombre"
                      className="liquid-input w-full rounded-2xl px-3.5 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-300/80 mb-1">
                      Cargo o Subtítulo
                    </label>
                    <input
                      type="text"
                      value={props.branding.lowerThirdTitle}
                      onChange={(e) =>
                        props.onChangeBranding((p) => ({ ...p, lowerThirdTitle: e.target.value }))
                      }
                      placeholder="Presentación en directo"
                      className="liquid-input w-full rounded-2xl px-3.5 py-2 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================== FILTERS & REAL-TIME EFFECTS TAB ======================== */}
          {activeTab === 'filters' && (
            <>
              {/* Live A/B Comparison Toggle */}
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-[13px] font-semibold tracking-tight text-white">
                    Comparativa Antes / Después
                  </h2>
                  <p className="text-xs text-zinc-300/75">Desliza sobre el visor en vivo</p>
                </div>
                <button
                  type="button"
                  onClick={props.onToggleAbSplit}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium cursor-pointer shrink-0 ${
                    props.abSplitEnabled
                      ? 'liquid-glass-amber font-semibold'
                      : 'liquid-glass-btn text-zinc-200'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{props.abSplitEnabled ? 'Comparando' : 'Comparar'}</span>
                </button>
              </div>

              <div className="liquid-divider" />

              {/* Color & Film Filter Presets */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-300" />
                    <span>Filtros de Color y Película</span>
                  </h2>
                  {props.filterId !== 'none' && (
                    <button
                      type="button"
                      onClick={() => props.onChangeFilter('none')}
                      className="text-xs text-zinc-300/75 hover:text-white cursor-pointer"
                    >
                      Quitar
                    </button>
                  )}
                </div>

                {/* Filter Category Segmented Pill */}
                <div className="liquid-segmented grid grid-cols-4 gap-0.5">
                  {(
                    [
                      { id: 'all', label: 'Todos' },
                      { id: 'instagram', label: 'Instagram' },
                      { id: 'cinema', label: 'Cine' },
                      { id: 'classic', label: 'Clásicos' },
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setFilterCat(cat.id)}
                      className={`py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer ${
                        filterCat === cat.id
                          ? 'liquid-segment-thumb text-white'
                          : 'text-zinc-300/75 hover:text-white'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2">
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
                        className={`text-left rounded-2xl p-1.5 transition-all cursor-pointer ${
                          active ? 'liquid-glass-btn-active' : 'liquid-glass-btn'
                        }`}
                      >
                        <div
                          className={`h-8 w-full rounded-xl bg-gradient-to-br ${preset.swatchGradient} mb-1.5 shadow-inner`}
                        />
                        <div className="text-[11px] font-medium text-white truncate px-0.5">
                          {preset.name}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="liquid-divider" />

              {/* Real-Time Visual Effects */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-amber-300" />
                    <span>Efectos Especiales y Estilos</span>
                  </h2>
                  {props.effectId !== 'none' && (
                    <button
                      type="button"
                      onClick={() => props.onChangeEffect('none')}
                      className="text-xs text-zinc-300/75 hover:text-white cursor-pointer"
                    >
                      Quitar
                    </button>
                  )}
                </div>

                {/* Effect Category Segmented Pill */}
                <div className="liquid-segmented grid grid-cols-5 gap-0.5">
                  {(
                    [
                      { id: 'all', label: 'Todos' },
                      { id: 'cartoon', label: 'Caricatura' },
                      { id: 'cinema', label: 'Glow' },
                      { id: 'retro', label: 'Retro' },
                      { id: 'geometry', label: 'Óptico' },
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setEffectCat(cat.id)}
                      className={`py-1 rounded-full text-[10px] font-medium transition-all truncate px-1 cursor-pointer ${
                        effectCat === cat.id
                          ? 'liquid-segment-thumb text-white'
                          : 'text-zinc-300/75 hover:text-white'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

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
                        className={`text-left px-3 py-2 rounded-2xl transition-all cursor-pointer ${
                          active
                            ? 'liquid-glass-amber'
                            : 'liquid-glass-btn text-zinc-200'
                        }`}
                      >
                        <div className="text-xs font-medium truncate">{eff.name}</div>
                        <div className="text-[10px] opacity-70 truncate">{eff.description}</div>
                      </button>
                    );
                  })}
                </div>

                {props.effectId !== 'none' && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-xs text-zinc-300">
                      <span>Intensidad del Efecto</span>
                      <span className="font-mono">{props.adjustments.effectIntensity}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={props.adjustments.effectIntensity}
                      onChange={(e) =>
                        props.onChangeAdjustments((p) => ({
                          ...p,
                          effectIntensity: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-full studio-slider"
                    />
                  </div>
                )}
              </div>

              <div className="liquid-divider" />

              {/* Real-Time AI Subject Segmentation & Background Replacement */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-300" />
                    <span>Recorte de Sujeto con IA</span>
                  </h2>
                  {props.background.mode !== 'none' && (
                    <button
                      type="button"
                      onClick={() =>
                        props.onChangeBackground((p) => ({ ...p, mode: 'none' }))
                      }
                      className="text-xs text-zinc-300/75 hover:text-white cursor-pointer"
                    >
                      Desactivar
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] bg-white/[0.05] border border-white/[0.12] rounded-full px-3 py-1.5">
                  <span className="font-mono text-zinc-200 truncate">
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
                    className="text-sky-300 hover:text-sky-200 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {props.background.useAi ? 'Usar Color' : 'Usar IA'}
                  </button>
                </div>

                <div className="liquid-segmented grid grid-cols-4 gap-0.5">
                  {(
                    [
                      { id: 'none', label: 'Original' },
                      { id: 'blur', label: 'Desenfoque' },
                      { id: 'color', label: 'Color' },
                      { id: 'image', label: 'Imagen' },
                    ] as { id: BackgroundReplaceMode; label: string }[]
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => props.onChangeBackground((p) => ({ ...p, mode: m.id }))}
                      className={`py-1.5 text-[11px] font-medium rounded-full transition-all cursor-pointer ${
                        props.background.mode === m.id
                          ? 'liquid-segment-thumb text-white'
                          : 'text-zinc-300/75 hover:text-white'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {props.background.mode === 'image' && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-3 gap-2">
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
                            className={`rounded-2xl overflow-hidden text-left transition-all cursor-pointer p-1 ${
                              active ? 'liquid-glass-btn-active' : 'liquid-glass-btn'
                            }`}
                          >
                            <div className="aspect-video bg-black/40 rounded-xl overflow-hidden">
                              <img
                                src={bg.src}
                                alt={bg.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="px-1 pt-1 pb-0.5 text-[10px] font-medium text-white truncate">
                              {bg.name}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <label className="liquid-glass-btn w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-full text-xs font-medium text-zinc-100 cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-amber-300" />
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

                    <button
                      type="button"
                      onClick={props.onCaptureWindowAsBackground}
                      className="liquid-glass-btn w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-full text-xs font-medium text-zinc-100 cursor-pointer"
                    >
                      <Monitor className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Capturar otra ventana como fondo</span>
                    </button>
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
                              ? 'border-white scale-110 ring-2 ring-white/40'
                              : 'border-white/25 hover:border-white/60'
                          }`}
                          style={{ backgroundColor: c.hex }}
                        />
                      );
                    })}
                    <label
                      title="Color personalizado"
                      className="ml-auto flex items-center gap-1.5 text-xs text-zinc-200 cursor-pointer"
                    >
                      <span className="font-mono text-[11px] text-zinc-300">
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
                        className="w-7 h-7 rounded-full bg-transparent border border-white/25 cursor-pointer overflow-hidden"
                      />
                    </label>
                  </div>
                )}

                {props.background.mode === 'blur' && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-zinc-300">
                      <span>Desenfoque de fondo</span>
                      <span className="font-mono">{props.background.blurAmount}px</span>
                    </div>
                    <input
                      type="range"
                      min={4}
                      max={28}
                      value={props.background.blurAmount}
                      onChange={(e) =>
                        props.onChangeBackground((p) => ({
                          ...p,
                          blurAmount: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-full studio-slider"
                    />
                  </div>
                )}

                {props.background.mode !== 'none' && (
                  <div className="space-y-2.5 pt-1">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-zinc-300">
                        <span>Umbral de recorte</span>
                        <span className="font-mono">{props.background.sensitivity}%</span>
                      </div>
                      <input
                        type="range"
                        min={15}
                        max={85}
                        value={props.background.sensitivity}
                        onChange={(e) =>
                          props.onChangeBackground((p) => ({
                            ...p,
                            sensitivity: parseInt(e.target.value, 10),
                          }))
                        }
                        className="w-full studio-slider"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-zinc-300">
                        <span>Suavizado de contorno</span>
                        <span className="font-mono">{props.background.edgeSoftness}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={props.background.edgeSoftness}
                        onChange={(e) =>
                          props.onChangeBackground((p) => ({
                            ...p,
                            edgeSoftness: parseInt(e.target.value, 10),
                          }))
                        }
                        className="w-full studio-slider"
                      />
                    </div>

                    {!props.background.useAi && (
                      <div className="flex items-center gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={props.onCalibrateBackground}
                          className="liquid-glass-btn flex-1 py-1.5 px-3 rounded-full text-[11px] font-medium text-zinc-100 cursor-pointer"
                        >
                          {props.background.hasCalibratedBg
                            ? 'Recalibrar fondo vacío'
                            : 'Calibrar fondo vacío'}
                        </button>
                        {props.background.hasCalibratedBg && (
                          <button
                            type="button"
                            onClick={props.onClearBackgroundCalibration}
                            className="liquid-glass-btn py-1.5 px-3 rounded-full text-[11px] text-zinc-300 cursor-pointer"
                          >
                            Auto
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="liquid-divider" />

              {/* Fine Color & Tone Adjustments */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold tracking-tight text-white">
                    Ajustes de Imagen
                  </h2>
                  <button
                    type="button"
                    onClick={() => props.onChangeAdjustments(() => DEFAULT_ADJUSTMENTS)}
                    className="inline-flex items-center gap-1 text-xs text-zinc-300/75 hover:text-white cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" /> Restablecer
                  </button>
                </div>

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
                  <div key={ctrl.key} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-200">{ctrl.label}</span>
                      <span className="font-mono text-zinc-300">{props.adjustments[ctrl.key]}</span>
                    </div>
                    <input
                      type="range"
                      min={ctrl.min}
                      max={ctrl.max}
                      value={props.adjustments[ctrl.key]}
                      onChange={(e) =>
                        props.onChangeAdjustments((p) => ({
                          ...p,
                          [ctrl.key]: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-full studio-slider"
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ======================== BOOTH, BURST & SURVEILLANCE TAB ======================== */}
          {activeTab === 'booth' && (
            <>
              {/* Timer & Shutter Settings */}
              <div className="space-y-3">
                <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                  <Timer className="w-4 h-4 text-amber-300" />
                  <span>Temporizador y Disparador</span>
                </h2>
                <div className="liquid-segmented grid grid-cols-4 gap-0.5">
                  {[0, 3, 5, 10].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => props.onChangeTimerSeconds(sec)}
                      className={`py-1.5 rounded-full font-mono text-xs transition-all cursor-pointer ${
                        props.timerSeconds === sec
                          ? 'liquid-segment-thumb text-white font-semibold'
                          : 'text-zinc-300/75 hover:text-white'
                      }`}
                    >
                      {sec === 0 ? 'Directo' : `${sec}s`}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={props.onToggleFlash}
                    className={`py-2 px-3 rounded-full text-xs font-medium cursor-pointer ${
                      props.flashEnabled
                        ? 'liquid-glass-btn-active font-semibold'
                        : 'liquid-glass-btn text-zinc-200'
                    }`}
                  >
                    Flash Pantalla: {props.flashEnabled ? 'Sí' : 'No'}
                  </button>
                  <button
                    type="button"
                    onClick={props.onToggleSoundMuted}
                    className="liquid-glass-btn inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-full text-xs text-zinc-200 cursor-pointer"
                  >
                    {props.soundMuted ? (
                      <VolumeX className="w-3.5 h-3.5" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
                    <span>{props.soundMuted ? 'Sonido Off' : 'Sonido On'}</span>
                  </button>
                </div>
              </div>

              <div className="liquid-divider" />

              {/* Photo Booth 4-Strip */}
              <div className="space-y-3">
                <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                  <Camera className="w-4 h-4 text-amber-300" />
                  <span>Cabina Photo Booth (Tira 4×)</span>
                </h2>
                <p className="text-xs text-zinc-300/75">
                  Captura 4 fotos secuenciales con el filtro activo y arma una tira lista para descargar.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => props.onStartPhotoBooth('dark')}
                    className="liquid-glass-btn py-2.5 px-3 rounded-full text-xs font-semibold text-white cursor-pointer"
                  >
                    Tira Oscura
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onStartPhotoBooth('polaroid')}
                    className="py-2.5 px-3 rounded-full bg-white/95 hover:bg-white text-xs font-semibold text-zinc-950 shadow-[0_6px_18px_rgba(255,255,255,0.2)] transition-all active:scale-95 cursor-pointer"
                  >
                    Tira Polaroid
                  </button>
                </div>
              </div>

              <div className="liquid-divider" />

              {/* Burst, Windows & Intervalometer */}
              <div className="space-y-3">
                <h2 className="text-[13px] font-semibold tracking-tight text-white">
                  Ráfaga, Ventanas e Intervalómetro
                </h2>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={props.onStartBurst}
                    className="liquid-glass-btn w-full py-2.5 px-4 rounded-full text-xs font-medium text-zinc-100 cursor-pointer"
                  >
                    Ráfaga Rápida (5 fotos en 1.5s)
                  </button>
                  <button
                    type="button"
                    onClick={props.onCaptureWindow}
                    className="liquid-glass-btn w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-full text-xs font-medium text-zinc-100 cursor-pointer"
                  >
                    <Monitor className="w-3.5 h-3.5 text-sky-300" />
                    <span>Capturar otra ventana (PNG)</span>
                  </button>
                </div>

                <div className="pt-1 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-200">Intervalómetro (Time-Lapse)</span>
                    {props.timelapseActive && (
                      <span className="font-mono text-amber-300">{props.timelapseCount} fotos</span>
                    )}
                  </div>
                  <div className="liquid-segmented grid grid-cols-4 gap-0.5">
                    {[2, 5, 10, 30].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => props.onChangeTimelapseInterval(sec)}
                        className={`py-1.5 rounded-full font-mono text-xs cursor-pointer ${
                          props.timelapseIntervalSec === sec
                            ? 'liquid-segment-thumb text-white font-semibold'
                            : 'text-zinc-300/75 hover:text-white'
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={props.onToggleTimelapse}
                    className={`w-full py-2.5 px-4 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      props.timelapseActive
                        ? 'bg-gradient-to-b from-[#FF453A] to-[#E02424] text-white border border-rose-300/45 shadow-lg'
                        : 'liquid-glass-btn text-zinc-100'
                    }`}
                  >
                    {props.timelapseActive
                      ? `Detener Time-Lapse (${props.timelapseCount})`
                      : `Iniciar Time-Lapse cada ${props.timelapseIntervalSec}s`}
                  </button>
                </div>
              </div>

              <div className="liquid-divider" />

              {/* Motion Detection Mode */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-300" />
                    <span>Detector de Movimiento</span>
                  </h2>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={props.motionActive}
                    aria-label="Activar detector de movimiento"
                    data-checked={props.motionActive ? 'true' : 'false'}
                    onClick={props.onToggleMotion}
                    className="apple-switch"
                  >
                    <span className="apple-switch-thumb" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-zinc-300">
                    <span>Sensibilidad (Umbral)</span>
                    <span className="font-mono">{props.motionSensitivity}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={60}
                    value={props.motionSensitivity}
                    onChange={(e) => props.onChangeMotionSensitivity(parseInt(e.target.value, 10))}
                    className="w-full studio-slider"
                  />
                </div>

                {props.motionActive && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-[11px] font-mono text-zinc-300">
                      <span>Actividad actual</span>
                      <span>{props.motionScore}%</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-100 rounded-full ${
                          props.motionScore >= props.motionSensitivity
                            ? 'bg-rose-400'
                            : 'bg-amber-300'
                        }`}
                        style={{ width: `${Math.min(100, props.motionScore)}%` }}
                      />
                    </div>
                    {props.motionEvents.length > 0 && (
                      <div className="max-h-28 overflow-y-auto studio-scroll space-y-1 pt-1">
                        {props.motionEvents.slice(0, 5).map((ev) => (
                          <div
                            key={ev.id}
                            className="flex items-center justify-between text-[11px] font-mono text-zinc-300/80 py-1 border-b border-white/[0.08]"
                          >
                            <span>Movimiento ({ev.score}%)</span>
                            <span>{new Date(ev.timestamp).toLocaleTimeString('es-ES')}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ======================== RECORDING, SCREEN PIP & TELEPROMPTER TAB ======================== */}
          {activeTab === 'record' && (
            <>
              {/* Video & Audio Console Control */}
              <div className="space-y-3">
                <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                  <Video className="w-4 h-4 text-rose-400" />
                  <span>Grabación y Consola de Audio</span>
                </h2>
                <p className="text-xs text-zinc-300/75">
                  Los filtros, efectos, zoom y doble cámara se graban directo en MP4 o WebM.
                </p>

                {/* Video Format Selector */}
                <div className="space-y-1">
                  <span className="text-[11px] text-zinc-300/80">Formato de salida</span>
                  <div className="liquid-segmented grid grid-cols-2 gap-0.5">
                    {(
                      [
                        { id: 'auto-mp4', label: 'MP4 (Preferido)' },
                        { id: 'webm', label: 'WebM (VP9)' },
                      ] as { id: RecordingFormatPref; label: string }[]
                    ).map((fmt) => (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => props.onChangeRecordingFormatPref(fmt.id)}
                        className={`py-1.5 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                          props.recordingFormatPref === fmt.id
                            ? 'liquid-segment-thumb text-white'
                            : 'text-zinc-300/75 hover:text-white'
                        }`}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={props.onToggleRecord}
                    className={`flex-1 py-2.5 px-4 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      props.isRecording
                        ? 'bg-gradient-to-b from-[#FF453A] to-[#E02424] text-white border border-rose-300/45 shadow-lg'
                        : 'liquid-glass-btn-active text-white'
                    }`}
                  >
                    {props.isRecording ? 'Detener y Guardar Video' : 'Iniciar Grabación HD'}
                  </button>

                  <button
                    type="button"
                    onClick={props.onToggleMicMuted}
                    title={props.micMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
                    className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer ${
                      props.micMuted
                        ? 'bg-rose-500/25 border border-rose-400/50 text-rose-200'
                        : 'liquid-glass-btn text-zinc-100'
                    }`}
                  >
                    {props.micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-mono text-zinc-300/80">
                    <span>Nivel de entrada</span>
                    <span>{props.micMuted ? 'MUTE' : `${Math.round(props.audioLevel)}%`}</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden border border-white/10">
                    <div
                      className={`h-full transition-all duration-75 rounded-full ${
                        props.audioLevel > 82
                          ? 'bg-rose-400'
                          : props.audioLevel > 50
                            ? 'bg-amber-300'
                            : 'bg-emerald-400'
                      }`}
                      style={{ width: `${props.micMuted ? 0 : Math.min(100, props.audioLevel)}%` }}
                    />
                  </div>
                </div>

                {/* Web Audio Gain & Noise Compressor */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs text-zinc-300">
                    <span>Ganancia de micrófono</span>
                    <span className="font-mono text-sky-300">{props.audioConsole.micGain}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={5}
                    value={props.audioConsole.micGain}
                    onChange={(e) =>
                      props.onChangeAudioConsole((p) => ({
                        ...p,
                        micGain: parseInt(e.target.value, 10),
                      }))
                    }
                    className="w-full studio-slider"
                  />
                </div>

                <AppleToggle
                  label="Compresor de voz y nivelación"
                  subtle
                  checked={props.audioConsole.compressorEnabled}
                  onChange={(checked) =>
                    props.onChangeAudioConsole((p) => ({ ...p, compressorEnabled: checked }))
                  }
                />

                <AppleToggle
                  label="Capturar audio de ventana compartida"
                  subtle
                  checked={props.audioConsole.includeSystemAudio}
                  onChange={(checked) =>
                    props.onChangeAudioConsole((p) => ({ ...p, includeSystemAudio: checked }))
                  }
                />
              </div>

              <div className="liquid-divider" />

              {/* Native Floating Output Picture-in-Picture Monitor */}
              <div className="space-y-2.5">
                <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                  <PictureInPicture2 className="w-4 h-4 text-sky-300" />
                  <span>Ventana Flotante del Sistema</span>
                </h2>
                <p className="text-xs text-zinc-300/75">
                  Abre tu cámara ya filtrada en una ventana flotante siempre visible sobre otras apps del Mac.
                </p>
                <button
                  type="button"
                  onClick={props.onToggleOutputPip}
                  className={`w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-full text-xs font-semibold cursor-pointer ${
                    props.isOutputPipActive ? 'liquid-glass-blue' : 'liquid-glass-btn text-zinc-100'
                  }`}
                >
                  <PictureInPicture2 className="w-3.5 h-3.5" />
                  <span>
                    {props.isOutputPipActive ? 'Cerrar Ventana Flotante' : 'Abrir Ventana Flotante (PiP)'}
                  </span>
                </button>
              </div>

              <div className="liquid-divider" />

              {/* Screen Share + Camera Picture-in-Picture */}
              <div className="space-y-3">
                <h2 className="text-[13px] font-semibold tracking-tight text-white flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-sky-300" />
                  <span>Pantalla + Cámara (PiP)</span>
                </h2>
                <p className="text-xs text-zinc-300/75">
                  Comparte otra ventana de tu MacBook en vivo (con o sin tu cámara encima) o captura una imagen fija.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={props.onToggleScreenPip}
                    className={`w-full py-2.5 px-4 rounded-full text-xs font-semibold cursor-pointer ${
                      props.isScreenPipActive
                        ? 'liquid-glass-amber'
                        : 'liquid-glass-blue'
                    }`}
                  >
                    {props.isScreenPipActive
                      ? 'Detener Ventana Compartida'
                      : 'Compartir Otra Ventana en Vivo'}
                  </button>
                  <button
                    type="button"
                    onClick={props.onCaptureWindow}
                    className="liquid-glass-btn w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-full text-xs font-medium text-zinc-100 cursor-pointer"
                  >
                    <Monitor className="w-3.5 h-3.5 text-sky-300" />
                    <span>Tomar Captura de Ventana (PNG)</span>
                  </button>
                </div>

                {props.isScreenPipActive && (
                  <div className="space-y-3 pt-1">
                    <div className="liquid-segmented grid grid-cols-2 gap-0.5">
                      {(
                        [
                          { id: 'pip', label: 'Ventana + PiP' },
                          { id: 'screen-only', label: 'Solo Ventana' },
                        ] as const
                      ).map((lm) => (
                        <button
                          key={lm.id}
                          type="button"
                          onClick={() => props.onChangeScreenLayout(lm.id)}
                          className={`py-1.5 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                            props.screenLayout === lm.id
                              ? 'liquid-segment-thumb text-white'
                              : 'text-zinc-300/75 hover:text-white'
                          }`}
                        >
                          {lm.label}
                        </button>
                      ))}
                    </div>

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
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => props.onChangePipCorner(c.id)}
                              className={`py-1.5 rounded-full text-xs cursor-pointer ${
                                props.pipCorner === c.id
                                  ? 'liquid-glass-btn-active font-medium'
                                  : 'liquid-glass-btn text-zinc-300'
                              }`}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={props.onTogglePipCircular}
                            className="liquid-glass-btn flex-1 py-1.5 px-3 rounded-full text-xs text-zinc-100 cursor-pointer"
                          >
                            Forma: {props.pipCircular ? 'Circular' : 'Rectángulo'}
                          </button>
                          <div className="liquid-segmented flex items-center gap-0.5">
                            {[0.18, 0.24, 0.32].map((sz, i) => (
                              <button
                                key={sz}
                                type="button"
                                onClick={() => props.onChangePipSizeRatio(sz)}
                                className={`px-2.5 py-1 rounded-full text-xs font-mono cursor-pointer ${
                                  Math.abs(props.pipSizeRatio - sz) < 0.02
                                    ? 'liquid-segment-thumb text-white font-semibold'
                                    : 'text-zinc-300/75 hover:text-white'
                                }`}
                              >
                                {['S', 'M', 'L'][i]}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="liquid-divider" />

              {/* Integrated Teleprompter */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold tracking-tight text-white">
                    Teleprompter
                  </h2>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={props.teleprompter.enabled}
                    aria-label="Mostrar teleprompter"
                    data-checked={props.teleprompter.enabled ? 'true' : 'false'}
                    onClick={() =>
                      props.onChangeTeleprompter((p) => ({ ...p, enabled: !p.enabled }))
                    }
                    className="apple-switch"
                  >
                    <span className="apple-switch-thumb" />
                  </button>
                </div>

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
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] text-zinc-300">
                      <span>Velocidad</span>
                      <span className="font-mono">{props.teleprompter.speed}×</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={props.teleprompter.speed}
                      onChange={(e) =>
                        props.onChangeTeleprompter((p) => ({
                          ...p,
                          speed: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-full studio-slider"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] text-zinc-300">
                      <span>Tamaño</span>
                      <span className="font-mono">{props.teleprompter.fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={16}
                      max={40}
                      value={props.teleprompter.fontSize}
                      onChange={(e) =>
                        props.onChangeTeleprompter((p) => ({
                          ...p,
                          fontSize: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-full studio-slider"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
};
