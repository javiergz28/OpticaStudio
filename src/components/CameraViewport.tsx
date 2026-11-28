import React, { useEffect, useRef, useState } from 'react';
import {
  AppWindow,
  Camera,
  ChevronsDown,
  ChevronsUp,
  Crosshair,
  EyeOff,
  FlipHorizontal,
  Focus,
  Lock,
  Maximize2,
  Minimize2,
  Monitor,
  Move,
  Pause,
  PictureInPicture2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Snowflake,
  Square,
  Unlock,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
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
import type {
  LayerTransform,
  StudioScene,
  StudioSource,
} from '../types/studio';
import {
  computeLayerCornerResizeTransform,
  computeLayerDragTransform,
  findPrimaryVisualLayer,
  getLayerNormalizedRect,
  hitTestSceneLayerAtPoint,
  isVisualSourceEditable,
  type ResizeHandleId,
  type SnapGuide,
} from '../engine/layerEditor';
import {
  GlassButton,
  GlassContextMenu,
  GlassIconButton,
  GlassStatusIndicator,
  GlassTooltip,
  glassMaterialClass,
  type ContextMenuItem,
} from './glass';

export interface StudioLayerEditorProps {
  enabled: boolean;
  activeScene: StudioScene | null;
  sources: StudioSource[];
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onUpdateLayerTransform: (
    sceneId: string,
    layerId: string,
    transformPatch: Partial<LayerTransform>,
    options?: { preserveAspectK?: number }
  ) => void;
  onToggleLayerLock: (sceneId: string, layerId: string, locked: boolean) => void;
  onBeginLayerEdit?: (label: string) => void;
  onCommitLayerEdit?: () => void;
  onMoveLayerOrder?: (
    sceneId: string,
    layerId: string,
    direction: 'up' | 'down' | 'top' | 'bottom'
  ) => void;
  onToggleLayerVisible?: (sceneId: string, layerId: string, visible: boolean) => void;
  onResetLayerTransform?: (sceneId: string, layerId: string) => void;
}

export interface StudioDisplayPopoverProps {
  enabled: boolean;
  activeScene: StudioScene | null;
  sources: StudioSource[];
  runtimeSources: Array<{
    id: string;
    name: string;
    kind: StudioSource['kind'];
    status: string;
  }>;
  layerDiagnostics?: Array<{
    layerId: string;
    intrinsicWidth: number;
    intrinsicHeight: number;
  }>;
  selectedLayerId: string | null;
  onSelectOrAddDisplayLayer: (sourceId: string) => void;
  onChangeDisplayCapture: (sourceId: string) => void;
  onAddDisplaySource: (kind: 'screen' | 'window') => void;
  onPlaceLayerBehindCamera: (layerId: string) => void;
  onMoveLayerToTop: (layerId: string) => void;
}

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
  aiStatus: { segmenter: AiVisionStatus; detector: AiVisionStatus };
  cinemaMode?: boolean;
  onToggleCinemaMode?: () => void;
  hiddenForGallery?: boolean;
  studioLayerEditor?: StudioLayerEditorProps;
  studioDisplayPopover?: StudioDisplayPopoverProps;
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
  aiStatus,
  cinemaMode = false,
  onToggleCinemaMode,
  hiddenForGallery = false,
  studioLayerEditor,
  studioDisplayPopover,
}) => {
  const outerStageRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const peakingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prompterScrollRef = useRef<HTMLDivElement | null>(null);
  const shareDisplayBtnRef = useRef<HTMLButtonElement | null>(null);
  const displayPopoverRef = useRef<HTMLDivElement | null>(null);
  const [displayPopoverOpen, setDisplayPopoverOpen] = useState(false);
  const [stageBounds, setStageBounds] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [draggingSplit, setDraggingSplit] = useState(false);
  const [focusPulseKey, setFocusPulseKey] = useState(0);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [activeLayerEditMode, setActiveLayerEditMode] = useState<'drag' | 'resize' | null>(null);
  const layerInteractionRef = useRef<{
    mode: 'drag' | 'resize';
    handle?: ResizeHandleId;
    sceneId: string;
    layer: NonNullable<ReturnType<typeof findPrimaryVisualLayer>>;
    startTransform: LayerTransform;
    startPointerNormX: number;
    startPointerNormY: number;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ open: boolean; x: number; y: number }>({
    open: false,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    if (!displayPopoverOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setDisplayPopoverOpen(false);
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (displayPopoverRef.current?.contains(target)) return;
      if (shareDisplayBtnRef.current?.contains(target)) return;
      setDisplayPopoverOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [displayPopoverOpen]);

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

    if (
      studioLayerEditor?.enabled &&
      !cinemaMode &&
      studioLayerEditor.activeScene
    ) {
      const hitLayer = hitTestSceneLayerAtPoint(
        studioLayerEditor.activeScene,
        studioLayerEditor.sources,
        normX,
        normY
      );
      if (hitLayer) {
        studioLayerEditor.onSelectLayer(hitLayer.id);
        if (!hitLayer.locked && zoom <= 1.01) {
          studioLayerEditor.onBeginLayerEdit?.('Mover capa');
          layerInteractionRef.current = {
            mode: 'drag',
            sceneId: studioLayerEditor.activeScene.id,
            layer: hitLayer,
            startTransform: hitLayer.transform,
            startPointerNormX: normX,
            startPointerNormY: normY,
          };
          setActiveLayerEditMode('drag');
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
        if (zoom <= 1.01) {
          return;
        }
      } else if (studioLayerEditor.selectedLayerId !== null) {
        studioLayerEditor.onSelectLayer(null);
      }
    }

    if (zoom > 1.01) {
      setIsDraggingPan(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handleResizeHandlePointerDown = (
    handle: ResizeHandleId,
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (
      !studioLayerEditor?.enabled ||
      cinemaMode ||
      !studioLayerEditor.activeScene ||
      !selectedVisualLayer ||
      selectedVisualLayer.locked
    ) {
      return;
    }
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    studioLayerEditor.onBeginLayerEdit?.('Redimensionar capa');
    layerInteractionRef.current = {
      mode: 'resize',
      handle,
      sceneId: studioLayerEditor.activeScene.id,
      layer: selectedVisualLayer,
      startTransform: selectedVisualLayer.transform,
      startPointerNormX: normX,
      startPointerNormY: normY,
    };
    setActiveLayerEditMode('resize');
    try {
      stageRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if capture is unsupported
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

    if (layerInteractionRef.current && studioLayerEditor?.enabled) {
      const interaction = layerInteractionRef.current;
      const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const enableSnap = !e.altKey;

      if (interaction.mode === 'drag') {
        const res = computeLayerDragTransform(
          interaction.startTransform,
          normX - interaction.startPointerNormX,
          normY - interaction.startPointerNormY,
          {
            scene: studioLayerEditor.activeScene,
            layer: interaction.layer,
            sources: studioLayerEditor.sources,
            enableSnap,
          }
        );
        setSnapGuides(res.activeGuides);
        studioLayerEditor.onUpdateLayerTransform(
          interaction.sceneId,
          interaction.layer.id,
          res.transform
        );
      } else if (interaction.mode === 'resize' && interaction.handle) {
        const res = computeLayerCornerResizeTransform(
          interaction.startTransform,
          interaction.handle,
          normX,
          normY,
          {
            scene: studioLayerEditor.activeScene,
            layer: interaction.layer,
            sources: studioLayerEditor.sources,
            enableSnap,
          }
        );
        setSnapGuides(res.activeGuides);
        studioLayerEditor.onUpdateLayerTransform(
          interaction.sceneId,
          interaction.layer.id,
          res.transform,
          {
            preserveAspectK:
              res.transform.height / Math.max(0.01, res.transform.width),
          }
        );
      }
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
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
    if (layerInteractionRef.current) {
      layerInteractionRef.current = null;
      setActiveLayerEditMode(null);
      setSnapGuides([]);
      studioLayerEditor?.onCommitLayerEdit?.();
      try {
        stageRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
    if (isDraggingPan) {
      setIsDraggingPan(false);
      dragStartRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
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

  const primaryVisualLayer =
    studioLayerEditor?.enabled && studioLayerEditor.activeScene
      ? findPrimaryVisualLayer(studioLayerEditor.activeScene, studioLayerEditor.sources)
      : null;

  const selectedVisualLayer =
    studioLayerEditor?.enabled &&
    !cinemaMode &&
    !hiddenForGallery &&
    studioLayerEditor.activeScene &&
    studioLayerEditor.selectedLayerId
      ? studioLayerEditor.activeScene.layers.find(
          (l) =>
            l.id === studioLayerEditor.selectedLayerId &&
            l.visible &&
            isVisualSourceEditable(
              studioLayerEditor.sources.find((s) => s.id === l.sourceId)
            )
        ) ?? null
      : null;

  const selectedLayerRect = selectedVisualLayer
    ? getLayerNormalizedRect(selectedVisualLayer.transform)
    : null;

  const targetContextLayer = selectedVisualLayer ?? primaryVisualLayer;

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
    ...(studioLayerEditor?.enabled && studioLayerEditor.activeScene && targetContextLayer
      ? [
          {
            id: 'ctx-select-visual-layer',
            label:
              selectedVisualLayer?.id === targetContextLayer.id
                ? `Deseleccionar capa (${targetContextLayer.name})`
                : `Editar capa (${targetContextLayer.name})`,
            icon: <Move className="w-3.5 h-3.5" />,
            onSelect: () =>
              studioLayerEditor.onSelectLayer(
                selectedVisualLayer?.id === targetContextLayer.id
                  ? null
                  : targetContextLayer.id
              ),
          },
          {
            id: 'ctx-lock-visual-layer',
            label: targetContextLayer.locked
              ? `Desbloquear ${targetContextLayer.name}`
              : `Bloquear ${targetContextLayer.name}`,
            icon: targetContextLayer.locked ? (
              <Unlock className="w-3.5 h-3.5" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            ),
            onSelect: () =>
              studioLayerEditor.onToggleLayerLock(
                studioLayerEditor.activeScene!.id,
                targetContextLayer.id,
                !targetContextLayer.locked
              ),
          },
          ...(studioLayerEditor.onMoveLayerOrder
            ? [
                {
                  id: 'ctx-bring-front',
                  label: `Traer al frente (${targetContextLayer.name})`,
                  icon: <ChevronsUp className="w-3.5 h-3.5" />,
                  onSelect: () =>
                    studioLayerEditor.onMoveLayerOrder?.(
                      studioLayerEditor.activeScene!.id,
                      targetContextLayer.id,
                      'top'
                    ),
                },
                {
                  id: 'ctx-send-back',
                  label: `Enviar al fondo (${targetContextLayer.name})`,
                  icon: <ChevronsDown className="w-3.5 h-3.5" />,
                  onSelect: () =>
                    studioLayerEditor.onMoveLayerOrder?.(
                      studioLayerEditor.activeScene!.id,
                      targetContextLayer.id,
                      'bottom'
                    ),
                },
              ]
            : []),
          ...(studioLayerEditor.onToggleLayerVisible
            ? [
                {
                  id: 'ctx-hide-layer',
                  label: `Ocultar ${targetContextLayer.name}`,
                  icon: <EyeOff className="w-3.5 h-3.5" />,
                  onSelect: () =>
                    studioLayerEditor.onToggleLayerVisible?.(
                      studioLayerEditor.activeScene!.id,
                      targetContextLayer.id,
                      false
                    ),
                },
              ]
            : []),
          ...(studioLayerEditor.onResetLayerTransform
            ? [
                {
                  id: 'ctx-reset-layer-transform',
                  label: 'Restablecer transformación',
                  disabled: targetContextLayer.locked,
                  icon: <RotateCcw className="w-3.5 h-3.5" />,
                  onSelect: () =>
                    studioLayerEditor.onResetLayerTransform?.(
                      studioLayerEditor.activeScene!.id,
                      targetContextLayer.id
                    ),
                },
              ]
            : []),
        ]
      : []),
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
            onPointerCancel={handleViewportPointerUp}
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
                : activeLayerEditMode === 'drag'
                  ? 'cursor-grabbing'
                  : zoom > 1
                    ? isDraggingPan
                      ? 'cursor-grabbing'
                      : 'cursor-grab'
                    : 'cursor-default'
            }`}
          >
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

            {/* Guías visuales de alineación y marco interactivo de capa de cámara (solo UI, excluidos de ProgramCanvas) */}
            {snapGuides.length > 0 && !cinemaMode && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
                {snapGuides.map((g, idx) =>
                  g.axis === 'x' ? (
                    <div
                      key={`gx-${idx}-${g.position}`}
                      className={`absolute inset-y-0 w-px ${
                        g.kind === 'center' ? 'bg-amber-400/90' : 'bg-sky-400/85'
                      }`}
                      style={{ left: `${g.position * 100}%` }}
                    />
                  ) : (
                    <div
                      key={`gy-${idx}-${g.position}`}
                      className={`absolute inset-x-0 h-px ${
                        g.kind === 'center' ? 'bg-amber-400/90' : 'bg-sky-400/85'
                      }`}
                      style={{ top: `${g.position * 100}%` }}
                    />
                  )
                )}
              </div>
            )}

            {selectedVisualLayer && selectedLayerRect && studioLayerEditor?.activeScene && (
              <div
                aria-label={`Capa seleccionada: ${selectedVisualLayer.name}`}
                className={`pointer-events-none absolute z-10 border-[1.5px] transition-colors ${
                  selectedVisualLayer.style.maskShape === 'circle' ||
                  selectedVisualLayer.style.maskShape === 'ellipse'
                    ? 'rounded-full'
                    : selectedVisualLayer.style.maskShape === 'rounded' ||
                        selectedVisualLayer.style.maskShape === 'squircle'
                      ? 'rounded-2xl'
                      : 'rounded-sm'
                } ${
                  selectedVisualLayer.locked
                    ? 'border-amber-400/90 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]'
                    : 'border-sky-400/95 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]'
                }`}
                style={{
                  left: `${selectedLayerRect.left * 100}%`,
                  top: `${selectedLayerRect.top * 100}%`,
                  width: `${selectedLayerRect.width * 100}%`,
                  height: `${selectedLayerRect.height * 100}%`,
                }}
              >
                <div
                  className={`pointer-events-auto glass-clear absolute left-1.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums text-white max-w-[calc(100%-0.75rem)] ${
                    selectedLayerRect.top < 0.08 ? 'top-1.5' : '-top-7'
                  }`}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <span className="truncate font-sans font-medium text-sky-200 max-w-[140px]">
                    {selectedVisualLayer.name}
                  </span>
                  <span className="shrink-0">
                    {Math.round(selectedLayerRect.width * 100)}% ×{' '}
                    {Math.round(selectedLayerRect.height * 100)}%
                  </span>
                  <button
                    type="button"
                    title={
                      selectedVisualLayer.locked
                        ? 'Desbloquear capa'
                        : 'Bloquear capa'
                    }
                    aria-label={
                      selectedVisualLayer.locked
                        ? `Desbloquear ${selectedVisualLayer.name}`
                        : `Bloquear ${selectedVisualLayer.name}`
                    }
                    onClick={() =>
                      studioLayerEditor.onToggleLayerLock(
                        studioLayerEditor.activeScene!.id,
                        selectedVisualLayer.id,
                        !selectedVisualLayer.locked
                      )
                    }
                    className={`inline-flex items-center gap-1 rounded-full px-1 py-0.5 transition-colors cursor-pointer shrink-0 ${
                      selectedVisualLayer.locked
                        ? 'text-amber-300 hover:text-amber-200'
                        : 'text-white/80 hover:text-white'
                    }`}
                  >
                    {selectedVisualLayer.locked ? (
                      <>
                        <Lock className="w-2.5 h-2.5" />
                        <span>Bloqueada</span>
                      </>
                    ) : (
                      <Unlock className="w-2.5 h-2.5" />
                    )}
                  </button>
                </div>

                {!selectedVisualLayer.locked &&
                  (
                    [
                      {
                        id: 'top-left',
                        posClass: 'top-1 left-1 cursor-nwse-resize',
                        edgeClass: '-top-2 -left-2',
                        label: 'Redimensionar esquina superior izquierda',
                      },
                      {
                        id: 'top-right',
                        posClass: 'top-1 right-1 cursor-nesw-resize',
                        edgeClass: '-top-2 -right-2',
                        label: 'Redimensionar esquina superior derecha',
                      },
                      {
                        id: 'bottom-left',
                        posClass: 'bottom-1 left-1 cursor-nesw-resize',
                        edgeClass: '-bottom-2 -left-2',
                        label: 'Redimensionar esquina inferior izquierda',
                      },
                      {
                        id: 'bottom-right',
                        posClass: 'bottom-1 right-1 cursor-nwse-resize',
                        edgeClass: '-bottom-2 -right-2',
                        label: 'Redimensionar esquina inferior derecha',
                      },
                    ] as const
                  ).map((h) => {
                    const useInnerHandle =
                      selectedLayerRect.width >= 0.96 || selectedLayerRect.height >= 0.96;
                    return (
                      <button
                        key={h.id}
                        type="button"
                        aria-label={h.label}
                        onPointerDown={(e) => handleResizeHandlePointerDown(h.id, e)}
                        className={`pointer-events-auto absolute ${
                          useInnerHandle ? h.posClass : `${h.edgeClass} ${h.posClass.split(' ').pop()}`
                        } w-4 h-4 flex items-center justify-center focus:outline-none`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-white border-2 border-sky-500 shadow-sm" />
                      </button>
                    );
                  })}
              </div>
            )}

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
                ref={shareDisplayBtnRef}
                size="xs"
                onClick={() => {
                  if (studioDisplayPopover?.enabled) {
                    setDisplayPopoverOpen((v) => !v);
                  } else {
                    onShareDisplay();
                  }
                }}
                variant={displayShared ? 'amber' : 'regular'}
                aria-expanded={studioDisplayPopover?.enabled ? displayPopoverOpen : undefined}
                title={
                  studioDisplayPopover?.enabled
                    ? 'Administrar pantallas y ventanas compartidas'
                    : 'Compartir pantalla o ventana en vivo'
                }
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

      {!cinemaMode && studioDisplayPopover?.enabled && displayPopoverOpen && (
        <div
          ref={displayPopoverRef}
          role="dialog"
          aria-label="Fuentes compartidas"
          className={`${glassMaterialClass('dense')} absolute bottom-14 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,360px)] rounded-[20px] p-3.5 space-y-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.45)]`}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                Fuentes compartidas
              </h3>
              <p className="text-[10px] text-[var(--text-tertiary)]">
                Se insertan detrás de la cámara por defecto
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDisplayPopoverOpen(false)}
              className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Cerrar
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <GlassButton
              size="xs"
              variant="primary"
              leadingIcon={<Plus className="w-3 h-3" />}
              onClick={() => {
                setDisplayPopoverOpen(false);
                studioDisplayPopover.onAddDisplaySource('screen');
              }}
            >
              Añadir pantalla
            </GlassButton>
            <GlassButton
              size="xs"
              variant="regular"
              leadingIcon={<AppWindow className="w-3 h-3" />}
              onClick={() => {
                setDisplayPopoverOpen(false);
                studioDisplayPopover.onAddDisplaySource('window');
              }}
            >
              Añadir ventana
            </GlassButton>
          </div>

          {(() => {
            const displaySources = studioDisplayPopover.sources.filter(
              (s) => s.kind === 'screen' || s.kind === 'window'
            );
            if (displaySources.length === 0) {
              return (
                <p className="text-[11px] text-[var(--text-tertiary)] py-1">
                  Todavía no hay pantallas ni ventanas en el proyecto.
                </p>
              );
            }
            const runtimeById = new Map(
              studioDisplayPopover.runtimeSources.map((r) => [r.id, r])
            );
            const diagByLayerId = new Map(
              (studioDisplayPopover.layerDiagnostics ?? []).map((d) => [d.layerId, d])
            );
            return (
              <div className="divide-y divide-[var(--border-hairline)] max-h-56 overflow-y-auto studio-scroll">
                {displaySources.map((src) => {
                  const runtime = runtimeById.get(src.id);
                  const isLive = runtime?.status === 'live';
                  const sceneLayer =
                    studioDisplayPopover.activeScene?.layers.find(
                      (l) => l.sourceId === src.id
                    ) ?? null;
                  const diag = sceneLayer ? diagByLayerId.get(sceneLayer.id) : undefined;
                  const isSelected =
                    sceneLayer && studioDisplayPopover.selectedLayerId === sceneLayer.id;
                  const Icon = src.kind === 'window' ? AppWindow : Monitor;

                  return (
                    <div key={src.id} className="py-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Icon className="w-3.5 h-3.5 text-[var(--accent-blue)] shrink-0" />
                          <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                            {src.name}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-medium shrink-0 ${
                            isLive ? 'text-emerald-400' : 'text-[var(--text-tertiary)]'
                          }`}
                        >
                          {isLive
                            ? diag && diag.intrinsicWidth > 0
                              ? `En vivo · ${diag.intrinsicWidth}×${diag.intrinsicHeight}`
                              : 'En vivo'
                            : 'Autorizar'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <GlassButton
                          size="xs"
                          variant={isSelected ? 'primary' : 'regular'}
                          onClick={() => {
                            setDisplayPopoverOpen(false);
                            studioDisplayPopover.onSelectOrAddDisplayLayer(src.id);
                          }}
                        >
                          {sceneLayer ? (isSelected ? 'Seleccionada' : 'Seleccionar') : '+ Añadir detrás'}
                        </GlassButton>
                        <GlassButton
                          size="xs"
                          leadingIcon={<RefreshCw className="w-3 h-3" />}
                          onClick={() => {
                            setDisplayPopoverOpen(false);
                            studioDisplayPopover.onChangeDisplayCapture(src.id);
                          }}
                        >
                          {isLive ? 'Cambiar' : 'Autorizar'}
                        </GlassButton>
                        {sceneLayer && (
                          <>
                            <GlassButton
                              size="xs"
                              onClick={() =>
                                studioDisplayPopover.onPlaceLayerBehindCamera(sceneLayer.id)
                              }
                            >
                              Detrás
                            </GlassButton>
                            <GlassButton
                              size="xs"
                              onClick={() =>
                                studioDisplayPopover.onMoveLayerToTop(sceneLayer.id)
                              }
                            >
                              Frente
                            </GlassButton>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
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
