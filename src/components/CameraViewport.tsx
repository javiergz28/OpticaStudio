import React, { useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  FlipHorizontal,
  Focus,
  Maximize2,
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

interface CameraViewportProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  aspectRatio: AspectRatioId;
  resolutionWidth: number;
  resolutionHeight: number;
  sensorSize: { w: number; h: number };
  cameraStatus: 'idle' | 'live' | 'demo' | 'error';
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
  onToggleRecord: () => void;
  onTogglePauseRecord: () => void;
  audioLevel: number; // 0 to 100
  recentMedia: CapturedMediaItem[];
  onOpenGallery: () => void;
  boothProgress: { current: number; total: number } | null;
  isScreenPipActive: boolean;
  isDualCamActive: boolean;
  isOutputPipActive: boolean;
  onToggleOutputPip: () => void;
  detectedSubjects: AiSubjectBox[];
  aiStatus: { segmenter: AiVisionStatus; detector: AiVisionStatus };
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

  // Measure isolated absolute container so canvas intrinsic size never breaks 16:9 horizontal layout
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
  }, []);

  // Focus peaking overlay updater
  useEffect(() => {
    if (!focus.peakingEnabled) return;
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
  }, [focus.peakingEnabled, canvasRef]);

  // Teleprompter auto-scroll
  useEffect(() => {
    if (!teleprompter.enabled || !teleprompter.playing) return;
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
  }, [teleprompter.enabled, teleprompter.playing, teleprompter.speed]);

  const handleViewportPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;

    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    // Eyedropper color sampling
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

    // A/B split handle dragging
    if (abSplitEnabled && Math.abs(normX - abSplitPosition) < 0.04) {
      setDraggingSplit(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // Click-to-select Focus Area
    if (focus.selectingArea) {
      onChangeFocus((prev) => ({
        ...prev,
        areaX: normX,
        areaY: normY,
      }));
      setFocusPulseKey((k) => k + 1);
      return;
    }

    // Digital Zoom Panning when zoomed > 1
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

  return (
    <section className="flex-1 flex flex-col min-w-0 min-h-0 relative overflow-hidden">
      {/* Main viewfinder stage */}
      <div className="relative flex-1 min-w-0 min-h-0 overflow-hidden">
        {/* Virtual Ring Light surround */}
        {ringLight.enabled && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-3 rounded-[26px] transition-all duration-200 z-20"
            style={{
              border: `${ringLight.thickness}px solid ${ringColor}`,
              boxShadow: `inset 0 0 60px ${ringColor}, 0 0 40px ${ringColor}`,
            }}
          />
        )}

        {/* Isolated absolute box so ResizeObserver never fights canvas intrinsic dimensions */}
        <div
          ref={outerStageRef}
          className="absolute inset-1.5 lg:inset-2.5 flex items-center justify-center"
        >
          {/* Apple squircle camera canvas stage */}
          <div
            ref={stageRef}
            onPointerDown={handleViewportPointerDown}
            onPointerMove={handleViewportPointerMove}
            onPointerUp={handleViewportPointerUp}
            onWheel={handleWheelZoom}
            style={
              fittedW > 0 && fittedH > 0
                ? { width: `${fittedW}px`, height: `${fittedH}px` }
                : { width: '100%', height: '100%' }
            }
            className={`relative bg-black rounded-[24px] overflow-hidden border border-white/[0.14] shadow-[0_24px_60px_-14px_rgba(0,0,0,0.85)] select-none shrink-0 ${
              eyedropperActive || focus.selectingArea
                ? 'cursor-crosshair'
                : zoom > 1
                  ? isDraggingPan
                    ? 'cursor-grabbing'
                    : 'cursor-grab'
                  : 'cursor-default'
            }`}
          >
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full block"
            />

            {/* Focus Peaking Edge Overlay */}
            {focus.peakingEnabled && (
              <canvas
                ref={peakingCanvasRef}
                className="pointer-events-none absolute inset-0 w-full h-full opacity-90"
              />
            )}

            {/* Composition Guides Overlay */}
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

            {/* AI Subject Recognition Boxes (Apple Camera-style squircle tracking frame) */}
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
                  <span className="liquid-glass-dock absolute -top-6 left-0 whitespace-nowrap font-mono text-[10px] tracking-wider text-emerald-200 px-2 py-0.5 rounded-full">
                    Sujeto {idx + 1} · {Math.round(subj.confidence * 100)}%
                  </span>
                </div>
              ))}

            {/* Interactive Focus Area Reticle */}
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
                <span className="liquid-glass-dock absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] tracking-wider text-amber-200 px-2 py-0.5 rounded-full">
                  {focus.mode === 'manual' ? `MF ${focus.manualDistance}%` : 'AF Zona'}
                </span>
              </div>
            )}

            {/* A/B Split Label & Glass Handle */}
            {abSplitEnabled && (
              <div
                className="pointer-events-none absolute inset-y-0"
                style={{ left: `${abSplitPosition * 100}%` }}
              >
                <div className="liquid-glass-dock absolute top-3 -left-24 font-mono text-[11px] text-white px-2.5 py-0.5 rounded-full">
                  Original
                </div>
                <div className="liquid-glass-amber backdrop-blur-xl absolute top-3 left-3 font-mono text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                  Filtro
                </div>
                <div className="liquid-glass-dock absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full text-white flex items-center justify-center text-xs font-bold">
                  ↔
                </div>
              </div>
            )}

            {/* Top-center Liquid Glass Teleprompter */}
            {teleprompter.enabled && (
              <div
                className="liquid-glass-panel absolute top-3 left-1/2 -translate-x-1/2 w-[78%] max-w-xl rounded-2xl overflow-hidden z-20"
                style={{
                  backgroundColor: `rgba(14, 16, 22, ${teleprompter.opacity / 100})`,
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.12] text-[11px] text-zinc-300">
                  <span className="font-mono">Teleprompter · {teleprompter.speed}×</span>
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

            {/* Live Recording Glass Capsule */}
            {isRecording && (
              <div className="liquid-glass-dock absolute top-3.5 left-3.5 flex items-center gap-2 px-3 py-1.5 rounded-full z-20">
                <span
                  className={`w-2 h-2 rounded-full bg-rose-500 ${
                    isRecordingPaused ? 'opacity-40' : 'animate-pulse'
                  }`}
                />
                <span className="font-mono text-xs font-semibold text-white">
                  {isRecordingPaused ? 'Pausa' : 'REC'} {formatDuration(recordingSeconds)}
                </span>
              </div>
            )}

            {/* Mode cues (Freeze / Screen PiP / Selecting Focus / AI Loading) */}
            <div className="pointer-events-none absolute top-3.5 right-3.5 flex flex-col items-end gap-1.5 z-20">
              {frozen && (
                <span className="liquid-glass-dock font-mono text-[11px] text-sky-200 font-medium px-3 py-1 rounded-full">
                  Cuadro congelado
                </span>
              )}
              {isScreenPipActive && (
                <span className="liquid-glass-dock font-mono text-[11px] text-amber-200 font-medium px-3 py-1 rounded-full">
                  Ventana compartida en vivo
                </span>
              )}
              {isDualCamActive && !isScreenPipActive && (
                <span className="liquid-glass-dock font-mono text-[11px] text-sky-200 font-medium px-3 py-1 rounded-full">
                  Doble Cámara PiP
                </span>
              )}
              {isOutputPipActive && (
                <span className="liquid-glass-dock font-mono text-[11px] text-emerald-200 font-medium px-3 py-1 rounded-full">
                  Monitor Flotante activo
                </span>
              )}
              {focus.selectingArea && (
                <span className="liquid-glass-dock font-mono text-[11px] text-amber-200 px-3 py-1 rounded-full">
                  Haz clic en la imagen para fijar área de enfoque
                </span>
              )}
              {(aiStatus.segmenter === 'loading' || aiStatus.detector === 'loading') && (
                <span className="liquid-glass-dock font-mono text-[11px] text-emerald-200 px-3 py-1 rounded-full">
                  Cargando modelo IA...
                </span>
              )}
              {eyedropperActive && (
                <span className="liquid-glass-dock font-mono text-[11px] text-white px-3 py-1 rounded-full">
                  Haz clic en cualquier píxel para medir color
                </span>
              )}
            </div>

            {/* Photo Booth Sequence Progress */}
            {boothProgress && (
              <div className="liquid-glass-dock pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full font-mono text-xs text-white z-20">
                Cabina Photo Booth · Toma {boothProgress.current} de {boothProgress.total}
              </div>
            )}

            {/* Countdown Overlay */}
            {countdownValue !== null && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[2px] z-30">
                <span className="font-mono text-7xl font-bold text-white drop-shadow-[0_6px_30px_rgba(0,0,0,0.85)]">
                  {countdownValue}
                </span>
              </div>
            )}

            {/* White Screen Flash Overlay */}
            {flashActive && (
              <div className="pointer-events-none fixed inset-0 bg-white/95 z-50 transition-opacity duration-150" />
            )}
          </div>
        </div>
      </div>

      {/* Floating Apple Liquid Glass Bottom Transport & Quick Optical Dock */}
      <div className="px-3 pb-3 pt-1 shrink-0">
        <div className="liquid-glass-dock rounded-[22px] px-4 py-2.5 flex flex-col gap-2">
          {/* Tier 1: Optical Quick Controls + Apple Shutter & Record Transport */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {/* Optical Toggles */}
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <button
                type="button"
                onClick={onToggleMirror}
                title="Espejo horizontal (M)"
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0 cursor-pointer ${
                  mirror ? 'liquid-glass-btn-active text-amber-200' : 'liquid-glass-btn text-zinc-300'
                }`}
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={onRotate90}
                title={`Rotar cámara 90° (Actual: ${rotation}°)`}
                className={`inline-flex items-center justify-center gap-1 h-8 px-2.5 rounded-full text-xs shrink-0 cursor-pointer ${
                  rotation !== 0
                    ? 'liquid-glass-btn-active text-amber-200'
                    : 'liquid-glass-btn text-zinc-300'
                }`}
              >
                <RotateCw className="w-3.5 h-3.5" />
                {rotation !== 0 && <span className="font-mono text-[10px]">{rotation}°</span>}
              </button>

              <button
                type="button"
                onClick={onToggleFreeze}
                title="Congelar cuadro (F)"
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0 cursor-pointer ${
                  frozen
                    ? 'liquid-glass-blue text-white'
                    : 'liquid-glass-btn text-zinc-300'
                }`}
              >
                <Snowflake className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() =>
                  onChangeFocus((prev) => ({ ...prev, selectingArea: !prev.selectingArea }))
                }
                title="Seleccionar área de enfoque en el visor"
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                  focus.selectingArea
                    ? 'liquid-glass-amber'
                    : 'liquid-glass-btn text-zinc-200'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>Enfoque</span>
              </button>

              <button
                type="button"
                onClick={onToggleStabilization}
                title="Estabilización electrónica de video (EIS)"
                className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-full font-mono text-xs whitespace-nowrap shrink-0 cursor-pointer ${
                  stabilization.enabled
                    ? 'liquid-glass-green font-semibold'
                    : 'liquid-glass-btn text-zinc-300'
                }`}
              >
                <Move className="w-3.5 h-3.5" />
                <span>EIS</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onChangeFocus((prev) => ({
                    ...prev,
                    mode: prev.mode === 'auto' ? 'manual' : 'auto',
                  }))
                }
                title="Alternar Autoenfoque / Enfoque Manual"
                className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-full font-mono text-xs whitespace-nowrap shrink-0 cursor-pointer ${
                  focus.mode === 'manual'
                    ? 'liquid-glass-amber font-semibold'
                    : 'liquid-glass-btn text-zinc-200'
                }`}
              >
                <Focus className="w-3.5 h-3.5" />
                <span>{focus.mode === 'manual' ? 'MF' : 'AF'}</span>
              </button>

              {/* Apple-style Capsule Zoom Stepper */}
              <div className="flex items-center liquid-segmented h-8 px-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onChangeZoom(Math.max(1, Number((zoom - 0.5).toFixed(1))))}
                  disabled={zoom <= 1}
                  title="Alejar zoom"
                  className="p-1.5 text-zinc-300 hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChangeZoom(1);
                    onChangePan(0, 0);
                  }}
                  title="Restablecer zoom 1.0×"
                  className="px-2 font-mono text-xs text-white hover:text-amber-300 cursor-pointer"
                >
                  {zoom.toFixed(1)}×
                </button>
                <button
                  type="button"
                  onClick={() => onChangeZoom(Math.min(4, Number((zoom + 0.5).toFixed(1))))}
                  disabled={zoom >= 4}
                  title="Acercar zoom"
                  className="p-1.5 text-zinc-300 hover:text-white disabled:opacity-30 cursor-pointer"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="hidden sm:block w-px h-5 bg-white/15 mx-1 shrink-0" />

            {/* Primary Capture Actions: Apple Shutter, Window Capture & Record */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onCapturePhoto}
                title="Tomar fotografía (Espacio)"
                aria-label="Tomar fotografía"
                className="group relative w-10 h-10 rounded-full p-[3px] border-2 border-white/85 bg-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.45)] active:scale-90 transition-transform shrink-0 cursor-pointer"
              >
                <span className="block w-full h-full rounded-full bg-white group-hover:bg-zinc-100 transition-colors shadow-inner" />
              </button>

              <button
                type="button"
                onClick={onCaptureWindow}
                title="Capturar pantalla de otra ventana hacia la galería"
                className="liquid-glass-btn inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-zinc-100 font-medium text-xs whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Monitor className="w-3.5 h-3.5 text-sky-300" />
                <span>Ventana</span>
              </button>

              <button
                type="button"
                onClick={onToggleOutputPip}
                title="Abrir monitor en ventana flotante del sistema (Picture-in-Picture)"
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full font-medium text-xs whitespace-nowrap shrink-0 cursor-pointer ${
                  isOutputPipActive
                    ? 'liquid-glass-blue'
                    : 'liquid-glass-btn text-zinc-100'
                }`}
              >
                <PictureInPicture2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Flotante</span>
              </button>

              {!isRecording ? (
                <button
                  type="button"
                  onClick={onToggleRecord}
                  title="Iniciar grabación de video (R)"
                  className="inline-flex items-center gap-2 h-8 px-3.5 rounded-full bg-gradient-to-b from-[#FF453A] to-[#E02424] border border-rose-300/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_18px_-4px_rgba(255,59,48,0.55)] hover:brightness-110 active:scale-95 text-white font-semibold text-xs transition-all whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-white shadow-sm" />
                  <span>Grabar</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={onTogglePauseRecord}
                    title={isRecordingPaused ? 'Reanudar grabación' : 'Pausar grabación'}
                    className="liquid-glass-btn w-8 h-8 rounded-full flex items-center justify-center text-white cursor-pointer"
                  >
                    {isRecordingPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={onToggleRecord}
                    title="Detener grabación"
                    className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-gradient-to-b from-[#FF453A] to-[#E02424] border border-rose-300/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_18px_-4px_rgba(255,59,48,0.55)] text-white font-semibold text-xs whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    <span>Detener</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Tier 2: Camera Source, Sensor Info, Audio Level & Recent Gallery Strip */}
          <div className="border-t border-white/[0.10] pt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {cameraStatus === 'live' && videoDevices.length > 0 ? (
                <select
                  value={selectedVideoId}
                  onChange={(e) => onSelectVideoDevice(e.target.value)}
                  title={`Cámara activa: ${cameraLabel}`}
                  aria-label="Seleccionar cámara activa"
                  className="liquid-input rounded-full px-3 py-1 text-xs font-sans max-w-[200px] truncate cursor-pointer"
                >
                  {videoDevices.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId}>
                      {d.label || `Cámara ${idx + 1}`}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs font-medium text-white/90 truncate max-w-[180px]" title={cameraLabel}>
                  {cameraStatus === 'live' ? cameraLabel : 'Modo Demo Óptico'}
                </span>
              )}

              <span aria-hidden="true" className="text-white/30 text-xs">·</span>

              <span
                title={`Sensor nativo: ${sensorSize.w}×${sensorSize.h} · Salida: ${resolutionWidth}×${resolutionHeight}`}
                className={`font-mono text-[11px] whitespace-nowrap ${
                  cameraStatus === 'live' && sensorSize.w < sensorSize.h && rotation % 180 === 0
                    ? 'text-amber-300'
                    : 'text-zinc-300/80'
                }`}
              >
                {cameraStatus === 'live'
                  ? `${sensorSize.w}×${sensorSize.h}${sensorSize.w < sensorSize.h ? ' (V)' : ''}`
                  : `${resolutionWidth}×${resolutionHeight}`}
              </span>

              <div
                className="hidden sm:flex items-center gap-1.5 pl-2.5 border-l border-white/15 shrink-0"
                title="Nivel de entrada de micrófono"
              >
                <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-75 rounded-full ${
                      audioLevel > 82 ? 'bg-rose-400' : audioLevel > 55 ? 'bg-amber-300' : 'bg-emerald-400'
                    }`}
                    style={{ width: `${Math.min(100, audioLevel)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {recentMedia.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={onOpenGallery}
                  title={item.label}
                  className="w-9 h-6 rounded-lg overflow-hidden border border-white/25 hover:border-white/60 transition-colors shrink-0 bg-black/50 cursor-pointer shadow-sm"
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
              <button
                type="button"
                onClick={onOpenGallery}
                title="Abrir galería completa"
                className="liquid-glass-btn inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-medium text-zinc-200 hover:text-white cursor-pointer"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Galería</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
