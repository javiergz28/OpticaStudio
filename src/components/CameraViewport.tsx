import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Crosshair,
  FlipHorizontal,
  Focus,
  Maximize2,
  Minimize2,
  Monitor,
  Move,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Snowflake,
  Square,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  AiSubjectBox,
  AiVisionStatus,
  AspectRatioId,
  CapturedMediaItem,
  ColorAdjustments,
  FilterPresetId,
  FocusSettings,
  GridOverlayId,
  OverlayBranding,
  RingLightSettings,
  RotationDeg,
  SampledColor,
  StabilizationSettings,
  TeleprompterSettings,
  VisualEffectId,
} from '../types/camera';
import { renderFocusPeakingOverlay } from '../utils/canvasProcessor';
import {
  GlassButton,
  GlassContextMenu,
  GlassIconButton,
  GlassStatusIndicator,
  GlassTooltip,
  type ContextMenuItem,
} from './glass';

interface CameraViewportProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  aspectRatio: AspectRatioId;
  resolutionWidth: number;
  resolutionHeight: number;
  sensorSize: { w: number; h: number };
  cameraStatus: 'idle' | 'live' | 'error';
  cameraLabel: string;
  videoDevices: MediaDeviceInfo[];
  selectedVideoId: string;
  onSelectVideoDevice: (id: string) => void;
  rotation: RotationDeg;
  onRotate90: () => void;
  mirror: boolean;
  onToggleMirror: () => void;
  frozen: boolean;
  onToggleFreeze: () => void;
  zoom: number;
  onChangeZoom: (z: number) => void;
  panX: number;
  panY: number;
  onChangePan: (px: number, py: number) => void;
  focus: FocusSettings;
  onChangeFocus: (updater: (prev: FocusSettings) => FocusSettings) => void;
  stabilization: StabilizationSettings;
  onToggleStabilization: () => void;
  filterId: FilterPresetId;
  effectId: VisualEffectId;
  adjustments: ColorAdjustments;
  gridOverlay: GridOverlayId;
  ringLight: RingLightSettings;
  teleprompter: TeleprompterSettings;
  onChangeTeleprompter: (updater: (prev: TeleprompterSettings) => TeleprompterSettings) => void;
  branding: OverlayBranding;
  abSplitEnabled: boolean;
  abSplitPosition: number;
  onChangeAbSplitPosition: (pos: number) => void;
  eyedropperActive: boolean;
  onSampleColor: (color: SampledColor) => void;
  countdownValue: number | null;
  flashActive: boolean;
  isRecording: boolean;
  isRecordingPaused: boolean;
  recordingSeconds: number;
  onCapturePhoto: () => void;
  onCaptureWindow: () => void;
  onShareDisplay: () => void;
  displayShared: boolean;
  onToggleRecord: () => void;
  onTogglePauseRecord: () => void;
  audioLevel: number;
  recentMedia: CapturedMediaItem[];
  onOpenGallery: () => void;
  boothProgress: { current: number; total: number } | null;
  isScreenPipActive: boolean;
  isDualCamActive: boolean;
  isOutputPipActive: boolean;
  onToggleOutputPip: () => void;
  detectedSubjects: AiSubjectBox[];
  aiStatus: { segmenter: AiVisionStatus; detector: AiVisionStatus };
  cinemaMode?: boolean;
  onToggleCinemaMode?: () => void;
  hiddenForGallery?: boolean;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export const CameraViewport: React.FC<CameraViewportProps> = ({
  canvasRef,
  aspectRatio,
  resolutionWidth,
  resolutionHeight,
  sensorSize,
  cameraStatus,
  cameraLabel,
  videoDevices,
  selectedVideoId,
  onSelectVideoDevice,
  rotation,
  onRotate90,
  mirror,
  onToggleMirror,
  frozen,
  onToggleFreeze,
  zoom,
  onChangeZoom,
  panX,
  panY,
  onChangePan,
  focus,
  onChangeFocus,
  stabilization,
  onToggleStabilization,
  gridOverlay,
  ringLight,
  teleprompter,
  onChangeTeleprompter,
  abSplitEnabled,
  abSplitPosition,
  onChangeAbSplitPosition,
  eyedropperActive,
  onSampleColor,
  countdownValue,
  flashActive,
  isRecording,
  isRecordingPaused,
  recordingSeconds,
  onCapturePhoto,
  onCaptureWindow,
  onShareDisplay,
  displayShared,
  onToggleRecord,
  onTogglePauseRecord,
  audioLevel,
  recentMedia,
  onOpenGallery,
  boothProgress,
  isScreenPipActive,
  isDualCamActive,
  isOutputPipActive,
  onToggleOutputPip,
  detectedSubjects,
  aiStatus,
  cinemaMode = false,
  onToggleCinemaMode,
  hiddenForGallery = false,
}) => {
  const outerStageRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const peakingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prompterScrollRef = useRef<HTMLDivElement | null>(null);
  const [stageBounds, setStageBounds] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [draggingSplit, setDraggingSplit] = useState(false);
  const [focusPulseKey, setFocusPulseKey] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ open: boolean; x: number; y: number }>({
    open: false,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    const el = outerStageRef.current;
    if (!el) return;
    const updateSize = () => {
      const availW = Math.max(120, el.clientWidth);
      const availH = Math.max(120, el.clientHeight);
      setStageBounds({ w: availW, h: availH });
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hiddenForGallery, cinemaMode]);

  useEffect(() => {
    if (!focus.peakingEnabled || hiddenForGallery) return;
    let rafId = 0;
    let lastUpdate = 0;
    const tick = (now: number) => {
      if (now - lastUpdate > 90 && canvasRef.current && peakingCanvasRef.current) {
        renderFocusPeakingOverlay(canvasRef.current, peakingCanvasRef.current);
        lastUpdate = now;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [focus.peakingEnabled, canvasRef, hiddenForGallery]);

  useEffect(() => {
    if (!teleprompter.enabled || !teleprompter.playing || hiddenForGallery) return;
    let rafId = 0;
    let last = performance.now();
    const scrollStep = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (prompterScrollRef.current) {
        prompterScrollRef.current.scrollTop += dt * teleprompter.speed * 16;
      }
      rafId = requestAnimationFrame(scrollStep);
    };
    rafId = requestAnimationFrame(scrollStep);
    return () => cancelAnimationFrame(rafId);
  }, [teleprompter.enabled, teleprompter.playing, teleprompter.speed, hiddenForGallery]);

  const handleViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;

    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (eyedropperActive && canvasRef.current) {
      const c = canvasRef.current;
      const ctx = c.getContext('2d');
      if (ctx) {
        const px = Math.min(c.width - 1, Math.max(0, Math.floor(normX * c.width)));
        const py = Math.min(c.height - 1, Math.max(0, Math.floor(normY * c.height)));
        const pixel = ctx.getImageData(px, py, 1, 1).data;
        const hex = `#${[pixel[0], pixel[1], pixel[2]]
          .map((v) => v.toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase()}`;
        onSampleColor({ hex, r: pixel[0], g: pixel[1], b: pixel[2], x: px, y: py });
      }
      return;
    }

    if (abSplitEnabled && Math.abs(normX - abSplitPosition) < 0.04) {
      setDraggingSplit(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (focus.selectingArea) {
      onChangeFocus((prev) => ({
        ...prev,
        areaX: normX,
        areaY: normY,
      }));
      setFocusPulseKey((k) => k + 1);
      return;
    }

    if (zoom > 1.01) {
      setIsDraggingPan(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handleViewportPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (draggingSplit) {
      const normX = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
      onChangeAbSplitPosition(normX);
      return;
    }

    if (isDraggingPan && dragStartRef.current) {
      const dx = (e.clientX - dragStartRef.current.x) / (rect.width * 0.45);
      const dy = (e.clientY - dragStartRef.current.y) / (rect.height * 0.45);
      const nextX = Math.max(-1, Math.min(1, dragStartRef.current.panX - dx));
      const nextY = Math.max(-1, Math.min(1, dragStartRef.current.panY - dy));
      onChangePan(nextX, nextY);
    }
  };

  const handleViewportPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingSplit) {
      setDraggingSplit(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (isDraggingPan) {
      setIsDraggingPan(false);
      dragStartRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) < 2) return;
    const step = e.deltaY < 0 ? 0.12 : -0.12;
    const next = Math.max(1, Math.min(4, Number((zoom + step).toFixed(2))));
    if (next !== zoom) {
      onChangeZoom(next);
    }
  };

  const ringColor =
    ringLight.temperature === 'warm'
      ? `rgba(255, 214, 153, ${ringLight.intensity / 100})`
      : ringLight.temperature === 'cool'
        ? `rgba(205, 232, 255, ${ringLight.intensity / 100})`
        : ringLight.temperature === 'rose'
          ? `rgba(255, 198, 219, ${ringLight.intensity / 100})`
          : `rgba(255, 255, 255, ${ringLight.intensity / 100})`;

  const targetRatio =
    aspectRatio === '16:9'
      ? 16 / 9
      : aspectRatio === '4:3'
        ? 4 / 3
        : aspectRatio === '1:1'
          ? 1
          : aspectRatio === '9:16'
            ? 9 / 16
            : resolutionWidth / Math.max(1, resolutionHeight);

  let fittedW = stageBounds.w;
  let fittedH = stageBounds.h;
  if (stageBounds.w > 0 && stageBounds.h > 0) {
    if (stageBounds.w / stageBounds.h > targetRatio) {
      fittedH = stageBounds.h;
      fittedW = Math.floor(fittedH * targetRatio);
    } else {
      fittedW = stageBounds.w;
      fittedH = Math.floor(fittedW / targetRatio);
    }
  }

  const reticleSizePx =
    focus.areaSize === 'spot' ? 56 : focus.areaSize === 'zone' ? 104 : 164;

  const showFocusReticle =
    focus.selectingArea || focus.mode === 'manual' || focus.apertureBlur > 0;

  const contextMenuItems: ContextMenuItem[] = [
    {
      id: 'ctx-photo',
      label: 'Tomar fotografía',
      shortcut: 'Espacio',
      icon: <Camera className="w-3.5 h-3.5" />,
      onSelect: onCapturePhoto,
    },
    {
      id: 'ctx-mirror',
      label: mirror ? 'Desactivar espejo' : 'Espejo horizontal',
      shortcut: 'M',
      icon: <FlipHorizontal className="w-3.5 h-3.5" />,
      onSelect: onToggleMirror,
    },
    {
      id: 'ctx-rotate',
      label: 'Rotar 90°',
      icon: <RotateCw className="w-3.5 h-3.5" />,
      onSelect: onRotate90,
    },
    {
      id: 'ctx-freeze',
      label: frozen ? 'Reanudar cuadro' : 'Congelar cuadro',
      shortcut: 'F',
      icon: <Snowflake className="w-3.5 h-3.5" />,
      onSelect: onToggleFreeze,
    },
    {
      id: 'ctx-reset-zoom',
      label: 'Restablecer zoom (1.0×)',
      disabled: zoom <= 1.01,
      icon: <ZoomOut className="w-3.5 h-3.5" />,
      onSelect: () => {
        onChangeZoom(1);
        onChangePan(0, 0);
      },
    },
    ...(onToggleCinemaMode
      ? [
          {
            id: 'ctx-cinema',
            label: cinemaMode ? 'Salir de Modo Cine' : 'Modo Cine',
            shortcut: 'C',
            icon: cinemaMode ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            ),
            onSelect: onToggleCinemaMode,
          },
        ]
      : []),
  ];

  return (
    <section
      aria-hidden={hiddenForGallery || undefined}
      className={`${
        hiddenForGallery
          ? 'fixed -left-[99999px] top-0 w-[1280px] h-[720px] opacity-0 pointer-events-none'
          : 'stage-container flex-1 flex flex-col min-w-0 min-h-0 relative overflow-hidden bg-[var(--studio-stage-well)]'
      }`}
    >
      {/* Área central protagonista */}
      <div className="relative flex-1 min-w-0 min-h-0 overflow-hidden">
        {ringLight.enabled && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-2.5 rounded-2xl transition-all duration-200 z-20"
            style={{
              border: `${ringLight.thickness}px solid ${ringColor}`,
              boxShadow: `inset 0 0 60px ${ringColor}, 0 0 40px ${ringColor}`,
            }}
          />
        )}

        <div
          ref={outerStageRef}
          className={`absolute flex items-center justify-center ${
            cinemaMode
              ? 'inset-2 min-[1100px]:inset-3'
              : 'inset-1.5 min-[1100px]:inset-2.5 min-[1440px]:inset-3.5'
          }`}
        >
          <div
            ref={stageRef}
            onPointerDown={handleViewportPointerDown}
            onPointerMove={handleViewportPointerMove}
            onPointerUp={handleViewportPointerUp}
            onWheel={handleWheelZoom}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ open: true, x: e.clientX, y: e.clientY });
            }}
            style={
              fittedW > 0 && fittedH > 0
                ? { width: `${fittedW}px`, height: `${fittedH}px` }
                : { width: '100%', height: '100%' }
            }
            className={`relative bg-black rounded-2xl overflow-hidden border border-[var(--studio-stage-frame-border)] shadow-[0_18px_48px_-14px_rgba(0,0,0,0.68)] select-none shrink-0 ${
              eyedropperActive || focus.selectingArea
                ? 'cursor-crosshair'
                : zoom > 1
                  ? isDraggingPan
                    ? 'cursor-grabbing'
                    : 'cursor-grab'
                  : 'cursor-default'
            }`}
          >
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

            {focus.peakingEnabled && (
              <canvas
                ref={peakingCanvasRef}
                className="pointer-events-none absolute inset-0 w-full h-full opacity-90"
              />
            )}

            {gridOverlay === 'thirds' && (
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
                <div className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
              </div>
            )}
            {gridOverlay === 'golden' && (
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-y-0 left-[38.2%] w-px bg-amber-300/35" />
                <div className="absolute inset-y-0 left-[61.8%] w-px bg-amber-300/35" />
                <div className="absolute inset-x-0 top-[38.2%] h-px bg-amber-300/35" />
                <div className="absolute inset-x-0 top-[61.8%] h-px bg-amber-300/35" />
              </div>
            )}
            {gridOverlay === 'crosshair' && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-px bg-amber-300/70" />
                <div className="h-10 w-px bg-amber-300/70 absolute" />
                <div className="w-24 h-24 rounded-full border border-white/25 absolute" />
              </div>
            )}
            {gridOverlay === 'cinema' && (
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-4 border border-dashed border-white/25 rounded-xl" />
                <div className="absolute inset-10 border border-white/15 rounded-lg" />
              </div>
            )}

            {focus.aiTrackingEnabled &&
              detectedSubjects.map((subj, idx) => (
                <div
                  key={idx}
                  className="pointer-events-none absolute transition-all duration-75"
                  style={{
                    left: `${subj.x * 100}%`,
                    top: `${subj.y * 100}%`,
                    width: `${subj.width * 100}%`,
                    height: `${subj.height * 100}%`,
                  }}
                >
                  <span className="absolute top-0 left-0 w-3.5 h-3.5 border-t-2 border-l-2 border-emerald-300/95 rounded-tl-md" />
                  <span className="absolute top-0 right-0 w-3.5 h-3.5 border-t-2 border-r-2 border-emerald-300/95 rounded-tr-md" />
                  <span className="absolute bottom-0 left-0 w-3.5 h-3.5 border-b-2 border-l-2 border-emerald-300/95 rounded-bl-md" />
                  <span className="absolute bottom-0 right-0 w-3.5 h-3.5 border-b-2 border-r-2 border-emerald-300/95 rounded-br-md" />
                  <span className="glass-clear absolute -top-6 left-0 whitespace-nowrap font-mono tabular-nums text-[10px] tracking-wider text-emerald-200 px-2 py-0.5 rounded-full">
                    Sujeto {idx + 1} · {Math.round(subj.confidence * 100)}%
                  </span>
                </div>
              ))}

            {showFocusReticle && (
              <div
                key={focusPulseKey}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-150"
                style={{
                  left: `${focus.areaX * 100}%`,
                  top: `${focus.areaY * 100}%`,
                  width: `${reticleSizePx}px`,
                  height: `${reticleSizePx}px`,
                }}
              >
                <span className="absolute top-0 left-0 w-3.5 h-3.5 border-t-2 border-l-2 border-amber-300 rounded-tl-md" />
                <span className="absolute top-0 right-0 w-3.5 h-3.5 border-t-2 border-r-2 border-amber-300 rounded-tr-md" />
                <span className="absolute bottom-0 left-0 w-3.5 h-3.5 border-b-2 border-l-2 border-amber-300 rounded-bl-md" />
                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 border-b-2 border-r-2 border-amber-300 rounded-br-md" />
                <span className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full bg-amber-300/90" />
                <span className="glass-clear absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono tabular-nums text-[10px] tracking-wider text-amber-200 px-2 py-0.5 rounded-full">
                  {focus.mode === 'manual' ? `MF ${focus.manualDistance}%` : 'AF Zona'}
                </span>
              </div>
            )}

            {abSplitEnabled && (
              <div
                className="pointer-events-none absolute inset-y-0"
                style={{ left: `${abSplitPosition * 100}%` }}
              >
                <div className="glass-clear absolute top-3 -left-24 font-mono text-[11px] text-white px-2.5 py-0.5 rounded-full">
                  Original
                </div>
                <div className="liquid-glass-amber backdrop-blur-xl absolute top-3 left-3 font-mono text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                  Filtro
                </div>
                <div className="glass-clear absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full text-white flex items-center justify-center text-xs font-bold">
                  ↔
                </div>
              </div>
            )}

            {/* Teleprompter privado excluido de ProgramCanvas */}
            {teleprompter.enabled && (
              <div
                className="glass-dense absolute top-3 left-1/2 -translate-x-1/2 w-[78%] max-w-xl rounded-2xl overflow-hidden z-20"
                style={{
                  backgroundColor: `rgba(14, 16, 22, ${teleprompter.opacity / 100})`,
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.12] text-[11px] text-zinc-200">
                  <span className="font-mono tabular-nums">
                    Teleprompter · {teleprompter.speed}×
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        onChangeTeleprompter((p) => ({ ...p, playing: !p.playing }))
                      }
                      className="inline-flex items-center gap-1 text-white hover:text-amber-300 cursor-pointer"
                    >
                      {teleprompter.playing ? (
                        <>
                          <Pause className="w-3 h-3" /> Pausar
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3" /> Iniciar
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (prompterScrollRef.current) prompterScrollRef.current.scrollTop = 0;
                      }}
                      className="inline-flex items-center gap-1 text-zinc-300 hover:text-white cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" /> Reiniciar
                    </button>
                  </div>
                </div>
                <div
                  ref={prompterScrollRef}
                  className="h-32 overflow-y-auto px-5 py-3 studio-scroll leading-relaxed text-center text-white font-medium"
                  style={{ fontSize: `${teleprompter.fontSize}px` }}
                >
                  <div className="pb-20 whitespace-pre-wrap">{teleprompter.text}</div>
                </div>
              </div>
            )}

            {/* Indicadores flotantes Glass Clear (solo estado real) */}
            {isRecording && (
              <div className="glass-clear absolute top-3.5 left-3.5 px-3 py-1.5 rounded-full z-20">
                <GlassStatusIndicator
                  tone={isRecordingPaused ? 'paused' : 'recording'}
                  label={isRecordingPaused ? 'Pausa' : 'REC'}
                  monoDetail={formatDuration(recordingSeconds)}
                />
              </div>
            )}

            {cinemaMode && onToggleCinemaMode && (
              <div className="absolute bottom-3.5 right-3.5 z-20 flex items-center gap-2">
                {!isRecording && (
                  <GlassButton
                    variant="clear"
                    size="xs"
                    onClick={onCapturePhoto}
                    leadingIcon={<Camera className="w-3 h-3" />}
                  >
                    Foto
                  </GlassButton>
                )}
                <GlassButton
                  variant="clear"
                  size="xs"
                  onClick={onToggleCinemaMode}
                  leadingIcon={<Minimize2 className="w-3 h-3" />}
                >
                  Salir de Cine · C
                </GlassButton>
              </div>
            )}

            <div className="pointer-events-none absolute top-3.5 right-3.5 flex flex-col items-end gap-1.5 z-20">
              {frozen && (
                <span className="glass-clear font-mono text-[11px] text-sky-200 font-medium px-3 py-1 rounded-full">
                  Cuadro congelado
                </span>
              )}
              {isScreenPipActive && (
                <span className="glass-clear font-mono text-[11px] text-amber-200 font-medium px-3 py-1 rounded-full">
                  Ventana compartida en vivo
                </span>
              )}
              {isDualCamActive && !isScreenPipActive && (
                <span className="glass-clear font-mono text-[11px] text-sky-200 font-medium px-3 py-1 rounded-full">
                  Doble Cámara PiP
                </span>
              )}
              {isOutputPipActive && (
                <span className="glass-clear font-mono text-[11px] text-emerald-200 font-medium px-3 py-1 rounded-full">
                  Monitor Flotante activo
                </span>
              )}
              {focus.selectingArea && (
                <span className="glass-clear font-mono text-[11px] text-amber-200 px-3 py-1 rounded-full">
                  Haz clic en la imagen para fijar área de enfoque
                </span>
              )}
              {(aiStatus.segmenter === 'loading' || aiStatus.detector === 'loading') && (
                <span className="glass-clear font-mono text-[11px] text-emerald-200 px-3 py-1 rounded-full">
                  Cargando modelo IA...
                </span>
              )}
              {eyedropperActive && (
                <span className="glass-clear font-mono text-[11px] text-white px-3 py-1 rounded-full">
                  Haz clic en cualquier píxel para medir color
                </span>
              )}
            </div>

            {boothProgress && (
              <div className="glass-clear pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full font-mono tabular-nums text-xs text-white z-20">
                Cabina · Toma {boothProgress.current} de {boothProgress.total}
              </div>
            )}

            {countdownValue !== null && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[2px] z-30">
                <span className="font-mono tabular-nums text-7xl font-bold text-white drop-shadow-[0_6px_30px_rgba(0,0,0,0.85)]">
                  {countdownValue}
                </span>
              </div>
            )}

            {flashActive && (
              <div className="pointer-events-none fixed inset-0 bg-white/95 z-50 transition-opacity duration-150" />
            )}
          </div>
        </div>
      </div>

      {/* Barra de transporte inferior integrada (oculta en Modo Cine para maximizar superficie) */}
      {!cinemaMode && (
        <div className="studio-chrome-bar border-t border-[var(--border-hairline)] min-h-[48px] px-3 py-1.5 flex items-center justify-between gap-2 shrink-0 overflow-x-auto no-scrollbar">
          {/* Fuente activa, resolución y vúmetro (visible desde >=760px de escenario) */}
          <div className="stage-meta-group items-center gap-2 min-w-0 shrink">
            {cameraStatus === 'live' && videoDevices.length > 0 ? (
              <select
                value={selectedVideoId}
                onChange={(e) => onSelectVideoDevice(e.target.value)}
                title={`Cámara activa: ${cameraLabel}`}
                aria-label="Seleccionar cámara activa"
                className="liquid-input rounded-full px-2.5 py-1 text-[11px] max-w-[148px] truncate cursor-pointer"
              >
                {videoDevices.map((d, idx) => (
                  <option key={d.deviceId || idx} value={d.deviceId}>
                    {d.label || `Cámara ${idx + 1}`}
                  </option>
                ))}
              </select>
            ) : (
              <span
                className="text-[11px] font-medium text-[var(--text-secondary)] truncate max-w-[140px]"
                title={cameraLabel}
              >
                {cameraStatus === 'live' ? cameraLabel : 'Sin cámara'}
              </span>
            )}

            <span
              title={`Sensor nativo: ${sensorSize.w}×${sensorSize.h} · Salida: ${resolutionWidth}×${resolutionHeight}`}
              className={`font-mono tabular-nums text-[11px] whitespace-nowrap ${
                cameraStatus === 'live' && sensorSize.w < sensorSize.h && rotation % 180 === 0
                  ? 'text-[var(--accent-amber)]'
                  : 'text-[var(--text-tertiary)]'
              }`}
            >
              {cameraStatus === 'live'
                ? `${sensorSize.w}×${sensorSize.h}${sensorSize.w < sensorSize.h ? ' (V)' : ''}`
                : `${resolutionWidth}×${resolutionHeight}`}
            </span>

            <div
              className="flex items-center pl-2 border-l border-[var(--border-hairline)] shrink-0"
              title="Nivel de entrada de micrófono"
            >
              <div className="w-12 h-1.5 bg-[var(--studio-surface-well)] rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-75 rounded-full ${
                    audioLevel > 82
                      ? 'bg-rose-400'
                      : audioLevel > 55
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, audioLevel)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Controles ópticos + disparo / grabación en una sola fila equilibrada */}
          <div className="flex items-center justify-center gap-1.5 mx-auto shrink-0">
            <div className="flex items-center gap-1 shrink-0">
              <GlassTooltip content="Espejo horizontal" shortcut="M" side="top">
                <GlassIconButton
                  size="sm"
                  selected={mirror}
                  label="Espejo horizontal"
                  onClick={onToggleMirror}
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                </GlassIconButton>
              </GlassTooltip>

              <GlassTooltip content={`Rotar 90° (Actual: ${rotation}°)`} side="top">
                <GlassButton
                  size="xs"
                  selected={rotation !== 0}
                  onClick={onRotate90}
                  leadingIcon={<RotateCw className="w-3.5 h-3.5" />}
                >
                  {rotation === 0 ? '90°' : `${rotation}°`}
                </GlassButton>
              </GlassTooltip>

              <GlassTooltip content="Congelar cuadro" shortcut="F" side="top">
                <GlassIconButton
                  size="sm"
                  variant={frozen ? 'primary' : 'regular'}
                  selected={frozen}
                  label="Congelar cuadro"
                  onClick={onToggleFreeze}
                >
                  <Snowflake className="w-3.5 h-3.5" />
                </GlassIconButton>
              </GlassTooltip>

              <GlassButton
                size="xs"
                variant={focus.selectingArea ? 'amber' : 'regular'}
                selected={focus.selectingArea}
                onClick={() =>
                  onChangeFocus((prev) => ({ ...prev, selectingArea: !prev.selectingArea }))
                }
                leadingIcon={<Crosshair className="w-3.5 h-3.5" />}
              >
                <span className="stage-pip-label">Enfoque</span>
              </GlassButton>

              <GlassButton
                size="xs"
                selected={stabilization.enabled}
                onClick={onToggleStabilization}
                leadingIcon={<Move className="w-3.5 h-3.5" />}
                className={stabilization.enabled ? 'liquid-glass-green' : ''}
              >
                <span className="font-mono">EIS</span>
              </GlassButton>

              <GlassButton
                size="xs"
                variant={focus.mode === 'manual' ? 'amber' : 'regular'}
                selected={focus.mode === 'manual'}
                onClick={() =>
                  onChangeFocus((prev) => ({
                    ...prev,
                    mode: prev.mode === 'auto' ? 'manual' : 'auto',
                  }))
                }
                leadingIcon={<Focus className="w-3.5 h-3.5" />}
              >
                <span className="font-mono">{focus.mode === 'manual' ? 'MF' : 'AF'}</span>
              </GlassButton>

              {/* Stepper Zoom */}
              <div className="flex items-center liquid-segmented h-7 px-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onChangeZoom(Math.max(1, Number((zoom - 0.5).toFixed(1))))}
                  disabled={zoom <= 1}
                  title="Alejar zoom"
                  aria-label="Alejar zoom"
                  className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChangeZoom(1);
                    onChangePan(0, 0);
                  }}
                  title="Restablecer zoom 1.0×"
                  className="px-1.5 font-mono tabular-nums text-[11px] text-[var(--text-primary)] cursor-pointer"
                >
                  {zoom.toFixed(1)}×
                </button>
                <button
                  type="button"
                  onClick={() => onChangeZoom(Math.min(4, Number((zoom + 0.5).toFixed(1))))}
                  disabled={zoom >= 4}
                  title="Acercar zoom"
                  aria-label="Acercar zoom"
                  className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 cursor-pointer"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="w-px h-4 bg-[var(--divider-line)] mx-0.5 shrink-0" />

            <div className="flex items-center gap-1.5 shrink-0">
              <GlassTooltip content="Tomar fotografía" shortcut="Espacio" side="top">
                <button
                  type="button"
                  onClick={onCapturePhoto}
                  aria-label="Tomar fotografía"
                  className="glass-focus-ring group relative w-8 h-8 rounded-full p-[2.5px] border-2 border-[var(--text-primary)] bg-[var(--studio-surface-subtle)] active:scale-90 transition-transform shrink-0 cursor-pointer"
                >
                  <span className="block w-full h-full rounded-full bg-[var(--text-primary)] group-hover:opacity-90 transition-opacity" />
                </button>
              </GlassTooltip>

              <GlassButton
                size="xs"
                onClick={onShareDisplay}
                variant={displayShared ? 'amber' : 'regular'}
                title="Compartir pantalla o ventana en vivo"
                leadingIcon={<Monitor className="w-3.5 h-3.5 text-[var(--accent-blue)]" />}
              >
                {displayShared ? 'Pantalla activa' : 'Compartir pantalla'}
              </GlassButton>

              <GlassButton
                size="xs"
                variant={isOutputPipActive ? 'primary' : 'regular'}
                selected={isOutputPipActive}
                onClick={onToggleOutputPip}
                leadingIcon={<PictureInPicture2 className="w-3.5 h-3.5" />}
              >
                <span className="stage-pip-label">Flotante</span>
              </GlassButton>

              {!isRecording ? (
                <GlassButton
                  size="xs"
                  variant="danger"
                  title="Iniciar grabación de video (R)"
                  onClick={onToggleRecord}
                  leadingIcon={<span className="w-2 h-2 rounded-full bg-white" />}
                >
                  Grabar
                </GlassButton>
              ) : (
                <div className="flex items-center gap-1 shrink-0">
                  <GlassIconButton
                    size="sm"
                    label={isRecordingPaused ? 'Reanudar grabación' : 'Pausar grabación'}
                    onClick={onTogglePauseRecord}
                  >
                    {isRecordingPaused ? (
                      <Play className="w-3.5 h-3.5" />
                    ) : (
                      <Pause className="w-3.5 h-3.5" />
                    )}
                  </GlassIconButton>
                  <GlassButton
                    size="xs"
                    variant="danger"
                    onClick={onToggleRecord}
                    leadingIcon={<Square className="w-3 h-3 fill-current" />}
                  >
                    Detener
                  </GlassButton>
                </div>
              )}
            </div>
          </div>

          {/* Tira reciente y acceso rápido a Galería (visible desde >=920px de escenario) */}
          <div className="stage-recent-strip items-center gap-1.5 shrink-0">
            {recentMedia.slice(0, 3).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={onOpenGallery}
                title={item.label}
                className="glass-focus-ring w-8 h-5 rounded-md overflow-hidden border border-[var(--border-hairline)] hover:border-[var(--border-specular)] transition-colors shrink-0 bg-black cursor-pointer"
              >
                {item.type === 'video' ? (
                  <video src={item.url} className="w-full h-full object-cover" muted />
                ) : (
                  <img
                    src={item.url}
                    alt={item.label}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                )}
              </button>
            ))}
            <GlassButton
              size="xs"
              onClick={onOpenGallery}
              leadingIcon={<Maximize2 className="w-3 h-3" />}
            >
              Galería
            </GlassButton>
          </div>
        </div>
      )}

      <GlassContextMenu
        open={contextMenu.open}
        x={contextMenu.x}
        y={contextMenu.y}
        items={contextMenuItems}
        onClose={() => setContextMenu((prev) => ({ ...prev, open: false }))}
      />
    </section>
  );
};
