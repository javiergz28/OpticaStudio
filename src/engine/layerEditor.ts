import {
  STUDIO_COORDINATE_SYSTEM,
  type CameraAspectPreset,
  type LayerTransform,
  type SceneLayer,
  type StudioScene,
  type StudioSource,
  type StudioSourceKind,
} from '../types/studio';
import { clampLayerTransform } from './sceneEngine';

export type ResizeHandleId =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export interface LayerNormalizedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SnapGuide {
  axis: 'x' | 'y';
  position: number;
  kind: 'edge' | 'margin' | 'center';
}

export interface CameraOverlayConstraintInfo {
  constrained: boolean;
  maxWidth: number;
  maxArea: number;
  reason: string | null;
}

export interface LayerEditResult {
  transform: LayerTransform;
  activeGuides: SnapGuide[];
  constraintApplied: boolean;
}

export const EDITOR_MIN_LAYER_DIMENSION = Math.max(
  0.08,
  STUDIO_COORDINATE_SYSTEM.minLayerDimension
);
export const EDITOR_SAFE_MARGIN = 0.03;
export const EDITOR_DEFAULT_SNAP_THRESHOLD = 0.015;
/** Se mantiene por compatibilidad de importaciones; CP-P02-B habilita hasta 100% libremente. */
export const OVERLAY_MAX_WIDTH_RATIO = 1;
export const OVERLAY_MAX_AREA_RATIO = 1;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function getLayerNormalizedRect(transform: LayerTransform): LayerNormalizedRect {
  const width = Math.max(STUDIO_COORDINATE_SYSTEM.minLayerDimension, transform.width);
  const height = Math.max(STUDIO_COORDINATE_SYSTEM.minLayerDimension, transform.height);
  const left = transform.x - transform.anchorX * width;
  const top = transform.y - transform.anchorY * height;
  return { left, top, width, height };
}

export function rectToLayerTransform(
  rect: LayerNormalizedRect,
  base: LayerTransform
): LayerTransform {
  const x = rect.left + base.anchorX * rect.width;
  const y = rect.top + base.anchorY * rect.height;
  return clampLayerTransform(
    {
      x,
      y,
      width: rect.width,
      height: rect.height,
    },
    base
  );
}

function rectsOverlap(a: LayerNormalizedRect, b: LayerNormalizedRect): boolean {
  const eps = 0.002;
  return (
    a.left < b.left + b.width - eps &&
    a.left + a.width > b.left + eps &&
    a.top < b.top + b.height - eps &&
    a.top + a.height > b.top + eps
  );
}

export const AUDIO_ONLY_SOURCE_KINDS: ReadonlySet<StudioSourceKind> = new Set([
  'microphone',
  'system-audio',
  'audio-file',
]);

export function isVisualSourceEditable(
  source: Pick<StudioSource, 'kind'> | null | undefined
): boolean {
  return Boolean(source && !AUDIO_ONLY_SOURCE_KINDS.has(source.kind));
}

export function isVisualKindEditable(kind: StudioSourceKind | undefined): boolean {
  return Boolean(kind && !AUDIO_ONLY_SOURCE_KINDS.has(kind));
}

export function findPrimaryCameraLayer(
  scene: StudioScene | null | undefined,
  sources: StudioSource[]
): SceneLayer | null {
  if (!scene) return null;
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const sorted = [...scene.layers].sort((a, b) => b.zIndex - a.zIndex);
  for (const layer of sorted) {
    const src = sourceById.get(layer.sourceId);
    if (src?.kind === 'camera') {
      return layer;
    }
  }
  return null;
}

export function findPrimaryDisplayLayer(
  scene: StudioScene | null | undefined,
  sources: StudioSource[]
): SceneLayer | null {
  if (!scene) return null;
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const sorted = [...scene.layers].sort((a, b) => b.zIndex - a.zIndex);
  for (const layer of sorted) {
    const src = sourceById.get(layer.sourceId);
    if (src?.kind === 'screen' || src?.kind === 'window') {
      return layer;
    }
  }
  return null;
}

export function findPrimaryVisualLayer(
  scene: StudioScene | null | undefined,
  sources: StudioSource[]
): SceneLayer | null {
  if (!scene) return null;
  const cam = findPrimaryCameraLayer(scene, sources);
  if (cam) return cam;
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const sorted = [...scene.layers].sort((a, b) => b.zIndex - a.zIndex);
  const firstVisible = sorted.find(
    (layer) => layer.visible && isVisualSourceEditable(sourceById.get(layer.sourceId))
  );
  if (firstVisible) return firstVisible;
  return (
    sorted.find((layer) => isVisualSourceEditable(sourceById.get(layer.sourceId))) ?? null
  );
}

export function resolveTargetEditableLayer(
  scene: StudioScene | null | undefined,
  sources: StudioSource[],
  selectedLayerId?: string | null
): SceneLayer | null {
  if (!scene) return null;
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  if (selectedLayerId) {
    const selected = scene.layers.find((l) => l.id === selectedLayerId);
    if (selected && isVisualSourceEditable(sourceById.get(selected.sourceId))) {
      return selected;
    }
  }
  return findPrimaryVisualLayer(scene, sources);
}

/**
 * Determina de forma informativa si la escena superpone la cámara sobre una ventana o pantalla visible.
 * En CP-P02-B ya no impone restricción del 50%: la cámara puede escalarse libremente hasta el 100%.
 */
export function hasVisibleDisplayOverlayInScene(
  scene: StudioScene | null | undefined,
  sources: StudioSource[],
  cameraLayer?: SceneLayer | null,
  candidateCameraRect?: LayerNormalizedRect
): boolean {
  if (!scene) return false;
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const displayLayers = scene.layers.filter((l) => {
    if (!l.visible) return false;
    const src = sourceById.get(l.sourceId);
    return src?.kind === 'window' || src?.kind === 'screen';
  });

  if (displayLayers.length === 0) return false;

  const camLayer = cameraLayer ?? findPrimaryCameraLayer(scene, sources);
  if (!camLayer) return false;

  const camRect = candidateCameraRect ?? getLayerNormalizedRect(camLayer.transform);
  const overlapsDisplay = displayLayers.some((dl) =>
    rectsOverlap(camRect, getLayerNormalizedRect(dl.transform))
  );

  if (overlapsDisplay) return true;

  if (scene.presetId === 'vertical-reel') {
    return false;
  }

  return true;
}

export function getCameraOverlayConstraints(
  _scene: StudioScene | null | undefined,
  _cameraLayer: SceneLayer | null | undefined,
  _sources: StudioSource[],
  _candidateRect?: LayerNormalizedRect
): CameraOverlayConstraintInfo {
  return {
    constrained: false,
    maxWidth: 1,
    maxArea: 1,
    reason: null,
  };
}

function resolveDimensionLimits(
  aspectK: number,
  maxWidthBound = 1,
  maxHeightBound = 1
): { minW: number; maxW: number } {
  const safeK = Math.max(0.05, aspectK);
  const upperFromBounds = Math.min(maxWidthBound, maxHeightBound / safeK);
  const maxW = Math.max(0.02, Math.min(1, upperFromBounds));
  const rawMinW = Math.max(
    EDITOR_MIN_LAYER_DIMENSION,
    EDITOR_MIN_LAYER_DIMENSION / safeK
  );
  const minW = Math.min(rawMinW, maxW);
  return { minW, maxW };
}

export function clampVisualLayerTransformForScene(
  transform: LayerTransform,
  options: {
    scene: StudioScene | null | undefined;
    layer?: SceneLayer | null;
    cameraLayer?: SceneLayer | null;
    sources: StudioSource[];
    preserveAspectK?: number;
  }
): { transform: LayerTransform; constraintApplied: boolean } {
  const rect = getLayerNormalizedRect(transform);
  const safeW = Math.max(STUDIO_COORDINATE_SYSTEM.minLayerDimension, rect.width);
  const safeH = Math.max(STUDIO_COORDINATE_SYSTEM.minLayerDimension, rect.height);
  const aspectK = options.preserveAspectK ?? safeH / safeW;

  const { minW, maxW } = resolveDimensionLimits(aspectK, 1, 1);
  const clampedW = clamp(safeW, minW, maxW);
  const clampedH = clamp(clampedW * aspectK, STUDIO_COORDINATE_SYSTEM.minLayerDimension, 1);

  const clampedLeft = clamp(rect.left, 0, Math.max(0, 1 - clampedW));
  const clampedTop = clamp(rect.top, 0, Math.max(0, 1 - clampedH));

  const constraintApplied = safeW > maxW + 1e-4 || safeH > 1 + 1e-4;

  return {
    transform: rectToLayerTransform(
      {
        left: clampedLeft,
        top: clampedTop,
        width: clampedW,
        height: clampedH,
      },
      transform
    ),
    constraintApplied,
  };
}

export function clampCameraTransformForScene(
  transform: LayerTransform,
  options: {
    scene: StudioScene | null | undefined;
    cameraLayer?: SceneLayer | null;
    sources: StudioSource[];
    preserveAspectK?: number;
  }
): { transform: LayerTransform; constraintApplied: boolean } {
  return clampVisualLayerTransformForScene(transform, options);
}

export function hitTestSceneLayerAtPoint(
  scene: StudioScene | null | undefined,
  sources: StudioSource[],
  normX: number,
  normY: number,
  options?: { onlyKind?: StudioSource['kind'] }
): SceneLayer | null {
  if (!scene) return null;
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const sorted = [...scene.layers].sort((a, b) => b.zIndex - a.zIndex);

  for (const layer of sorted) {
    if (!layer.visible) continue;
    const src = sourceById.get(layer.sourceId);
    if (!src || !isVisualSourceEditable(src)) continue;
    if (options?.onlyKind && src.kind !== options.onlyKind) continue;

    const rect = getLayerNormalizedRect(layer.transform);
    if (
      normX >= rect.left &&
      normX <= rect.left + rect.width &&
      normY >= rect.top &&
      normY <= rect.top + rect.height
    ) {
      return layer;
    }
  }
  return null;
}

interface SnapAxisCandidate {
  pos: number;
  guidePos: number;
  kind: SnapGuide['kind'];
}

export function computeLayerDragTransform(
  startTransform: LayerTransform,
  deltaNormX: number,
  deltaNormY: number,
  options: {
    scene: StudioScene | null | undefined;
    layer: SceneLayer;
    sources: StudioSource[];
    snapThreshold?: number;
    enableSnap?: boolean;
  }
): LayerEditResult {
  if (options.layer.locked) {
    return {
      transform: startTransform,
      activeGuides: [],
      constraintApplied: false,
    };
  }

  const snapThreshold = options.snapThreshold ?? EDITOR_DEFAULT_SNAP_THRESHOLD;
  const enableSnap = options.enableSnap ?? true;

  const startRect = getLayerNormalizedRect(startTransform);
  const aspectK = startRect.height / Math.max(0.01, startRect.width);

  let rawLeft = clamp(
    startRect.left + deltaNormX,
    0,
    Math.max(0, 1 - startRect.width)
  );
  let rawTop = clamp(
    startRect.top + deltaNormY,
    0,
    Math.max(0, 1 - startRect.height)
  );

  const activeGuides: SnapGuide[] = [];

  if (enableSnap && snapThreshold > 0) {
    const xCandidates: SnapAxisCandidate[] = [
      { pos: 0, guidePos: 0, kind: 'edge' },
      { pos: EDITOR_SAFE_MARGIN, guidePos: EDITOR_SAFE_MARGIN, kind: 'margin' },
      { pos: 0.5 - startRect.width * 0.5, guidePos: 0.5, kind: 'center' },
      { pos: 0.5, guidePos: 0.5, kind: 'center' },
      { pos: 0.5 - startRect.width, guidePos: 0.5, kind: 'center' },
      {
        pos: 1 - EDITOR_SAFE_MARGIN - startRect.width,
        guidePos: 1 - EDITOR_SAFE_MARGIN,
        kind: 'margin',
      },
      { pos: 1 - startRect.width, guidePos: 1, kind: 'edge' },
    ];

    let bestX: SnapAxisCandidate | null = null;
    let bestDx = snapThreshold;
    for (const c of xCandidates) {
      if (c.pos < -1e-4 || c.pos > 1 - startRect.width + 1e-4) continue;
      const dist = Math.abs(rawLeft - c.pos);
      if (dist <= bestDx) {
        bestDx = dist;
        bestX = c;
      }
    }
    if (bestX) {
      rawLeft = clamp(bestX.pos, 0, Math.max(0, 1 - startRect.width));
      activeGuides.push({
        axis: 'x',
        position: bestX.guidePos,
        kind: bestX.kind,
      });
    }

    const yCandidates: SnapAxisCandidate[] = [
      { pos: 0, guidePos: 0, kind: 'edge' },
      { pos: EDITOR_SAFE_MARGIN, guidePos: EDITOR_SAFE_MARGIN, kind: 'margin' },
      { pos: 0.5 - startRect.height * 0.5, guidePos: 0.5, kind: 'center' },
      { pos: 0.5, guidePos: 0.5, kind: 'center' },
      { pos: 0.5 - startRect.height, guidePos: 0.5, kind: 'center' },
      {
        pos: 1 - EDITOR_SAFE_MARGIN - startRect.height,
        guidePos: 1 - EDITOR_SAFE_MARGIN,
        kind: 'margin',
      },
      { pos: 1 - startRect.height, guidePos: 1, kind: 'edge' },
    ];

    let bestY: SnapAxisCandidate | null = null;
    let bestDy = snapThreshold;
    for (const c of yCandidates) {
      if (c.pos < -1e-4 || c.pos > 1 - startRect.height + 1e-4) continue;
      const dist = Math.abs(rawTop - c.pos);
      if (dist <= bestDy) {
        bestDy = dist;
        bestY = c;
      }
    }
    if (bestY) {
      rawTop = clamp(bestY.pos, 0, Math.max(0, 1 - startRect.height));
      activeGuides.push({
        axis: 'y',
        position: bestY.guidePos,
        kind: bestY.kind,
      });
    }
  }

  const candidateTransform = rectToLayerTransform(
    {
      left: rawLeft,
      top: rawTop,
      width: startRect.width,
      height: startRect.height,
    },
    startTransform
  );

  const clamped = clampCameraTransformForScene(candidateTransform, {
    scene: options.scene,
    cameraLayer: options.layer,
    sources: options.sources,
    preserveAspectK: aspectK,
  });

  return {
    transform: clamped.transform,
    activeGuides,
    constraintApplied: clamped.constraintApplied,
  };
}

export function computeLayerCornerResizeTransform(
  startTransform: LayerTransform,
  handle: ResizeHandleId,
  pointerNormX: number,
  pointerNormY: number,
  options: {
    scene: StudioScene | null | undefined;
    layer: SceneLayer;
    sources: StudioSource[];
    snapThreshold?: number;
    enableSnap?: boolean;
  }
): LayerEditResult {
  if (options.layer.locked) {
    return {
      transform: startTransform,
      activeGuides: [],
      constraintApplied: false,
    };
  }

  const snapThreshold = options.snapThreshold ?? EDITOR_DEFAULT_SNAP_THRESHOLD;
  const enableSnap = options.enableSnap ?? true;

  const startRect = getLayerNormalizedRect(startTransform);
  const aspectK = Math.max(0.05, startRect.height / Math.max(0.01, startRect.width));

  const px = clamp(pointerNormX, 0, 1);
  const py = clamp(pointerNormY, 0, 1);

  const isLeft = handle === 'top-left' || handle === 'bottom-left';
  const isTop = handle === 'top-left' || handle === 'top-right';

  const fixedX = isLeft ? startRect.left + startRect.width : startRect.left;
  const fixedY = isTop ? startRect.top + startRect.height : startRect.top;

  const rawSpanX = isLeft ? fixedX - px : px - fixedX;
  const rawSpanY = isTop ? fixedY - py : py - fixedY;

  const candidateWFromX = rawSpanX;
  const candidateWFromY = rawSpanY / aspectK;
  const desiredW =
    Math.abs(candidateWFromX - startRect.width) >=
    Math.abs(candidateWFromY - startRect.width)
      ? candidateWFromX
      : candidateWFromY;

  const maxBoundW = isLeft ? fixedX : 1 - fixedX;
  const maxBoundH = isTop ? fixedY : 1 - fixedY;

  const { minW, maxW } = resolveDimensionLimits(aspectK, maxBoundW, maxBoundH);

  let nextW = clamp(desiredW, minW, maxW);
  const activeGuides: SnapGuide[] = [];

  if (enableSnap && snapThreshold > 0) {
    const snapEdges = [0, EDITOR_SAFE_MARGIN, 0.5, 1 - EDITOR_SAFE_MARGIN, 1];
    let bestSnapW: number | null = null;
    let bestSnapDist = snapThreshold;
    let bestGuide: SnapGuide | null = null;

    const movingX = isLeft ? fixedX - nextW : fixedX + nextW;
    for (const targetX of snapEdges) {
      const dist = Math.abs(movingX - targetX);
      const snappedW = isLeft ? fixedX - targetX : targetX - fixedX;
      if (dist <= bestSnapDist && snappedW >= minW - 1e-4 && snappedW <= maxW + 1e-4) {
        bestSnapDist = dist;
        bestSnapW = clamp(snappedW, minW, maxW);
        bestGuide = {
          axis: 'x',
          position: targetX,
          kind:
            targetX === 0.5
              ? 'center'
              : targetX === EDITOR_SAFE_MARGIN || targetX === 1 - EDITOR_SAFE_MARGIN
                ? 'margin'
                : 'edge',
        };
      }
    }

    const movingY = isTop ? fixedY - nextW * aspectK : fixedY + nextW * aspectK;
    for (const targetY of snapEdges) {
      const dist = Math.abs(movingY - targetY);
      const snappedH = isTop ? fixedY - targetY : targetY - fixedY;
      const snappedW = snappedH / aspectK;
      if (dist <= bestSnapDist && snappedW >= minW - 1e-4 && snappedW <= maxW + 1e-4) {
        bestSnapDist = dist;
        bestSnapW = clamp(snappedW, minW, maxW);
        bestGuide = {
          axis: 'y',
          position: targetY,
          kind:
            targetY === 0.5
              ? 'center'
              : targetY === EDITOR_SAFE_MARGIN || targetY === 1 - EDITOR_SAFE_MARGIN
                ? 'margin'
                : 'edge',
        };
      }
    }

    if (bestSnapW !== null && bestGuide) {
      nextW = bestSnapW;
      activeGuides.push(bestGuide);
    }
  }

  const nextH = nextW * aspectK;
  const nextLeft = clamp(isLeft ? fixedX - nextW : fixedX, 0, Math.max(0, 1 - nextW));
  const nextTop = clamp(isTop ? fixedY - nextH : fixedY, 0, Math.max(0, 1 - nextH));

  return {
    transform: rectToLayerTransform(
      {
        left: nextLeft,
        top: nextTop,
        width: nextW,
        height: nextH,
      },
      startTransform
    ),
    activeGuides,
    constraintApplied: desiredW > maxW + 1e-4,
  };
}

export function computeKeyboardNudgeTransform(
  currentTransform: LayerTransform,
  key: string,
  options: {
    shiftKey?: boolean;
    altKey?: boolean;
    scene: StudioScene | null | undefined;
    layer: SceneLayer;
    sources: StudioSource[];
  }
): LayerEditResult | null {
  if (
    key !== 'ArrowLeft' &&
    key !== 'ArrowRight' &&
    key !== 'ArrowUp' &&
    key !== 'ArrowDown'
  ) {
    return null;
  }

  if (options.layer.locked) {
    return {
      transform: currentTransform,
      activeGuides: [],
      constraintApplied: false,
    };
  }

  const step = options.shiftKey ? 0.04 : options.altKey ? 0.002 : 0.01;
  const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
  const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;

  return computeLayerDragTransform(currentTransform, dx, dy, {
    scene: options.scene,
    layer: options.layer,
    sources: options.sources,
    enableSnap: false,
  });
}

export type QuickCameraPlacement =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center'
  | 'full';

export function computeQuickPlacementTransform(
  currentTransform: LayerTransform,
  placement: QuickCameraPlacement,
  options: {
    scene: StudioScene | null | undefined;
    layer: SceneLayer;
    sources: StudioSource[];
    margin?: number;
  }
): LayerEditResult {
  if (options.layer.locked) {
    return {
      transform: currentTransform,
      activeGuides: [],
      constraintApplied: false,
    };
  }

  const margin = options.margin ?? EDITOR_SAFE_MARGIN;
  const rect = getLayerNormalizedRect(currentTransform);
  const aspectK = Math.max(0.05, rect.height / Math.max(0.01, rect.width));

  let targetW = rect.width;
  let targetH = rect.height;
  let targetLeft = rect.left;
  let targetTop = rect.top;

  if (placement === 'full') {
    return {
      transform: rectToLayerTransform(
        { left: 0, top: 0, width: 1, height: 1 },
        currentTransform
      ),
      activeGuides: [],
      constraintApplied: false,
    };
  } else if (placement === 'center') {
    targetLeft = (1 - targetW) * 0.5;
    targetTop = (1 - targetH) * 0.5;
  } else if (placement === 'top-left') {
    targetLeft = margin;
    targetTop = margin;
  } else if (placement === 'top-right') {
    targetLeft = 1 - margin - targetW;
    targetTop = margin;
  } else if (placement === 'bottom-left') {
    targetLeft = margin;
    targetTop = 1 - margin - targetH;
  } else if (placement === 'bottom-right') {
    targetLeft = 1 - margin - targetW;
    targetTop = 1 - margin - targetH;
  }

  const candidate = rectToLayerTransform(
    {
      left: targetLeft,
      top: targetTop,
      width: targetW,
      height: targetH,
    },
    currentTransform
  );

  const clamped = clampCameraTransformForScene(candidate, {
    scene: options.scene,
    cameraLayer: options.layer,
    sources: options.sources,
    preserveAspectK: aspectK,
  });

  return {
    transform: clamped.transform,
    activeGuides: [],
    constraintApplied: clamped.constraintApplied,
  };
}

export function resolveLayerSourceAspectRatio(
  preset: CameraAspectPreset,
  customRatio?: number,
  intrinsicWidth = 1920,
  intrinsicHeight = 1080
): number {
  switch (preset) {
    case '16:9':
      return 16 / 9;
    case '4:3':
      return 4 / 3;
    case '9:16':
      return 9 / 16;
    case '3:4':
      return 3 / 4;
    case '1:1':
      return 1;
    case 'custom':
      return clamp(customRatio ?? 16 / 9, 0.25, 4);
    case 'sensor':
    default:
      return Math.max(1, intrinsicWidth) / Math.max(1, intrinsicHeight);
  }
}

export function resolveCameraAspectRatio(
  preset: CameraAspectPreset,
  customRatio?: number,
  sensorWidth = 1920,
  sensorHeight = 1080
): number {
  return resolveLayerSourceAspectRatio(preset, customRatio, sensorWidth, sensorHeight);
}

export function computeLayerAspectTransform(
  currentTransform: LayerTransform,
  options: {
    scene: StudioScene | null | undefined;
    layer: SceneLayer;
    sources: StudioSource[];
    aspectPreset: CameraAspectPreset;
    customAspectRatio?: number;
    intrinsicWidth?: number;
    intrinsicHeight?: number;
    sensorWidth?: number;
    sensorHeight?: number;
    outputWidth: number;
    outputHeight: number;
  }
): LayerEditResult {
  if (options.layer.locked) {
    return {
      transform: currentTransform,
      activeGuides: [],
      constraintApplied: false,
    };
  }

  const srcW = options.intrinsicWidth ?? options.sensorWidth ?? 1920;
  const srcH = options.intrinsicHeight ?? options.sensorHeight ?? 1080;

  const targetLayerAspect = resolveLayerSourceAspectRatio(
    options.aspectPreset,
    options.customAspectRatio ?? currentTransform.customAspectRatio,
    srcW,
    srcH
  );
  const safeOutW = Math.max(1, options.outputWidth);
  const safeOutH = Math.max(1, options.outputHeight);
  const outputAspect = safeOutW / safeOutH;
  const targetK = outputAspect / targetLayerAspect;

  const rect = getLayerNormalizedRect(currentTransform);
  const centerX = rect.left + rect.width * 0.5;
  const centerY = rect.top + rect.height * 0.5;

  // Preservar aproximadamente el área/escala visual percibida cuando cambia la proporción
  const currentArea = rect.width * rect.height;
  const areaCandidateW = Math.sqrt(Math.max(0.01, currentArea) / targetK);
  const desiredW =
    Math.abs(rect.width - 1) < 0.02 && Math.abs(rect.height - 1) < 0.02
      ? Math.min(1, 1 / Math.max(0.25, targetK))
      : clamp(areaCandidateW, EDITOR_MIN_LAYER_DIMENSION, 1);

  const { minW, maxW } = resolveDimensionLimits(targetK, 1, 1);
  const nextW = clamp(desiredW, minW, maxW);
  const nextH = nextW * targetK;
  const nextLeft = clamp(centerX - nextW * 0.5, 0, Math.max(0, 1 - nextW));
  const nextTop = clamp(centerY - nextH * 0.5, 0, Math.max(0, 1 - nextH));

  const baseWithAspect: LayerTransform = {
    ...currentTransform,
    aspectPreset: options.aspectPreset,
    customAspectRatio:
      options.aspectPreset === 'custom'
        ? clamp(
            options.customAspectRatio ?? currentTransform.customAspectRatio ?? targetLayerAspect,
            0.25,
            4
          )
        : targetLayerAspect,
  };

  return {
    transform: rectToLayerTransform(
      {
        left: nextLeft,
        top: nextTop,
        width: nextW,
        height: nextH,
      },
      baseWithAspect
    ),
    activeGuides: [],
    constraintApplied: desiredW > maxW + 1e-4,
  };
}

export function computeCameraAspectTransform(
  currentTransform: LayerTransform,
  options: {
    scene: StudioScene | null | undefined;
    layer: SceneLayer;
    sources: StudioSource[];
    aspectPreset: CameraAspectPreset;
    customAspectRatio?: number;
    sensorWidth: number;
    sensorHeight: number;
    outputWidth: number;
    outputHeight: number;
  }
): LayerEditResult {
  return computeLayerAspectTransform(currentTransform, options);
}

export function computeProportionalLayerTransform(
  currentTransform: LayerTransform,
  options: {
    scene: StudioScene | null | undefined;
    layer: SceneLayer;
    sources: StudioSource[];
    intrinsicWidth?: number;
    intrinsicHeight?: number;
    sensorWidth?: number;
    sensorHeight?: number;
    outputWidth: number;
    outputHeight: number;
  }
): LayerEditResult {
  if (options.layer.locked) {
    return {
      transform: currentTransform,
      activeGuides: [],
      constraintApplied: false,
    };
  }

  const safeSrcW = Math.max(1, options.intrinsicWidth ?? options.sensorWidth ?? 1920);
  const safeSrcH = Math.max(1, options.intrinsicHeight ?? options.sensorHeight ?? 1080);
  const safeOutW = Math.max(1, options.outputWidth);
  const safeOutH = Math.max(1, options.outputHeight);

  const srcAspect = safeSrcW / safeSrcH;
  const outputAspect = safeOutW / safeOutH;
  const targetK = outputAspect / srcAspect;

  const rect = getLayerNormalizedRect(currentTransform);
  const centerX = rect.left + rect.width * 0.5;
  const centerY = rect.top + rect.height * 0.5;

  const { minW, maxW } = resolveDimensionLimits(targetK, 1, 1);
  const nextW = clamp(rect.width, minW, maxW);
  const nextH = nextW * targetK;
  const nextLeft = clamp(centerX - nextW * 0.5, 0, Math.max(0, 1 - nextW));
  const nextTop = clamp(centerY - nextH * 0.5, 0, Math.max(0, 1 - nextH));

  return {
    transform: rectToLayerTransform(
      {
        left: nextLeft,
        top: nextTop,
        width: nextW,
        height: nextH,
      },
      {
        ...currentTransform,
        aspectPreset: 'sensor',
      }
    ),
    activeGuides: [],
    constraintApplied: rect.width > maxW + 1e-4,
  };
}

export function computeProportionalCameraTransform(
  currentTransform: LayerTransform,
  options: {
    scene: StudioScene | null | undefined;
    layer: SceneLayer;
    sources: StudioSource[];
    sensorWidth: number;
    sensorHeight: number;
    outputWidth: number;
    outputHeight: number;
  }
): LayerEditResult {
  return computeProportionalLayerTransform(currentTransform, options);
}

export function computeScaledLayerWidthTransform(
  currentTransform: LayerTransform,
  targetWidth: number,
  options: {
    scene: StudioScene | null | undefined;
    layer: SceneLayer;
    sources: StudioSource[];
  }
): LayerEditResult {
  if (options.layer.locked) {
    return {
      transform: currentTransform,
      activeGuides: [],
      constraintApplied: false,
    };
  }

  const rect = getLayerNormalizedRect(currentTransform);
  const aspectK = Math.max(0.05, rect.height / Math.max(0.01, rect.width));
  const centerX = rect.left + rect.width * 0.5;
  const centerY = rect.top + rect.height * 0.5;

  const { minW, maxW } = resolveDimensionLimits(aspectK, 1, 1);
  const nextW = clamp(targetWidth, minW, maxW);
  const nextH = nextW * aspectK;
  const nextLeft = clamp(centerX - nextW * 0.5, 0, Math.max(0, 1 - nextW));
  const nextTop = clamp(centerY - nextH * 0.5, 0, Math.max(0, 1 - nextH));

  return {
    transform: rectToLayerTransform(
      {
        left: nextLeft,
        top: nextTop,
        width: nextW,
        height: nextH,
      },
      currentTransform
    ),
    activeGuides: [],
    constraintApplied: targetWidth > maxW + 1e-4,
  };
}

export function computeScaledCameraWidthTransform(
  currentTransform: LayerTransform,
  targetWidth: number,
  options: {
    scene: StudioScene | null | undefined;
    layer: SceneLayer;
    sources: StudioSource[];
  }
): LayerEditResult {
  return computeScaledLayerWidthTransform(currentTransform, targetWidth, options);
}

export type AdaptableSceneLayoutId =
  | 'corner-top-left'
  | 'corner-top-right'
  | 'corner-bottom-left'
  | 'corner-bottom-right'
  | 'center'
  | 'pip-overlay'
  | 'screen-main-cam-pip'
  | 'screen-main-transparent-presenter'
  | 'cam-main-window-pip'
  | 'screen-main-window-pip'
  | 'split-horizontal'
  | 'split-vertical'
  | 'dual-windows-side-by-side'
  | 'grid-multi'
  | 'camera-full'
  | 'freeform';

export interface AdaptableCompositionDescriptor {
  id: AdaptableSceneLayoutId;
  label: string;
  description: string;
  multiLayer: boolean;
}

export const ADAPTABLE_COMPOSITIONS: readonly AdaptableCompositionDescriptor[] = [
  {
    id: 'screen-main-cam-pip',
    label: 'Pantalla + cámara flotante',
    description: 'Pantalla o ventana principal al 100 % con cámara PiP en esquina inferior derecha.',
    multiLayer: true,
  },
  {
    id: 'screen-main-transparent-presenter',
    label: 'Presentador sobre pantalla',
    description: 'Pantalla o ventana principal al 100 % detrás y presentador al 100 % delante.',
    multiLayer: true,
  },
  {
    id: 'cam-main-window-pip',
    label: 'Cámara + ventana flotante',
    description: 'Cámara principal al 100 % con ventana de apoyo flotante.',
    multiLayer: true,
  },
  {
    id: 'screen-main-window-pip',
    label: 'Pantalla + ventana flotante',
    description: 'Pantalla principal al 100 % detrás con ventana secundaria flotante por encima.',
    multiLayer: true,
  },
  {
    id: 'split-horizontal',
    label: 'Lado a lado',
    description: 'Cámara y pantalla o dos fuentes repartidas en columnas.',
    multiLayer: true,
  },
  {
    id: 'split-vertical',
    label: 'Vertical apilada',
    description: 'Dos fuentes apiladas en mitad superior e inferior.',
    multiLayer: true,
  },
  {
    id: 'dual-windows-side-by-side',
    label: 'Dos ventanas',
    description: 'Dos ventanas o pantallas paralelas con margen seguro.',
    multiLayer: true,
  },
  {
    id: 'grid-multi',
    label: 'Cuadrícula múltiple',
    description: 'Distribuye varias fuentes visuales en una rejilla equilibrada.',
    multiLayer: true,
  },
  {
    id: 'freeform',
    label: 'Libre',
    description: 'Conserva las posiciones y tamaños manuales actuales sin sobrescribir.',
    multiLayer: true,
  },
] as const;

function resolveParticipatingVisualLayers(
  scene: StudioScene,
  sources: StudioSource[],
  participatingLayerIds?: string[],
  includeGraphicBackgrounds = false
): SceneLayer[] {
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const orderedDesc = [...scene.layers].sort((a, b) => b.zIndex - a.zIndex);
  const explicitSet =
    participatingLayerIds && participatingLayerIds.length > 0
      ? new Set(participatingLayerIds)
      : null;

  return orderedDesc.filter((layer) => {
    const src = sourceById.get(layer.sourceId);
    if (!isVisualSourceEditable(src)) return false;
    if (explicitSet) {
      return explicitSet.has(layer.id) && !layer.locked;
    }
    if (!layer.visible || layer.locked) return false;
    if (
      !includeGraphicBackgrounds &&
      (src?.kind === 'color' || src?.kind === 'gradient') &&
      layer.transform.width >= 0.96 &&
      layer.transform.height >= 0.96
    ) {
      return false;
    }
    return true;
  });
}

export function computeAdaptableSceneLayout(
  scene: StudioScene,
  sources: StudioSource[],
  layoutId: AdaptableSceneLayoutId,
  options: {
    outputWidth: number;
    outputHeight: number;
    sensorWidth?: number;
    sensorHeight?: number;
    selectedLayerId?: string;
    participatingLayerIds?: string[];
    primaryDisplayLayerId?: string;
    secondaryDisplayLayerId?: string;
    primaryCameraLayerId?: string;
    intrinsicWidth?: number;
    intrinsicHeight?: number;
    margin?: number;
  }
): Map<string, LayerTransform> {
  const patches = new Map<string, LayerTransform>();
  if (layoutId === 'freeform') {
    return patches;
  }

  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const explicitParticipating =
    options.participatingLayerIds && options.participatingLayerIds.length > 0
      ? resolveParticipatingVisualLayers(scene, sources, options.participatingLayerIds, true)
      : null;

  const foregroundParticipating =
    explicitParticipating ?? resolveParticipatingVisualLayers(scene, sources, undefined, false);

  const explicitCamera = options.primaryCameraLayerId
    ? foregroundParticipating.find(
        (l) =>
          l.id === options.primaryCameraLayerId &&
          sourceById.get(l.sourceId)?.kind === 'camera'
      )
    : undefined;

  const camLayer =
    explicitCamera ??
    (explicitParticipating
      ? explicitParticipating.find((l) => sourceById.get(l.sourceId)?.kind === 'camera')
      : null) ??
    findPrimaryCameraLayer(scene, sources);

  const participatingDisplays = foregroundParticipating.filter((l) => {
    const k = sourceById.get(l.sourceId)?.kind;
    return k === 'screen' || k === 'window';
  });

  const explicitPrimaryDisplay = options.primaryDisplayLayerId
    ? foregroundParticipating.find((l) => l.id === options.primaryDisplayLayerId)
    : undefined;

  const displayLayer =
    explicitPrimaryDisplay ??
    participatingDisplays[0] ??
    findPrimaryDisplayLayer(scene, sources);

  const explicitSecondaryDisplay = options.secondaryDisplayLayerId
    ? foregroundParticipating.find(
        (l) => l.id === options.secondaryDisplayLayerId && l.id !== displayLayer?.id
      )
    : undefined;

  const secondaryDisplayLayer =
    explicitSecondaryDisplay ??
    participatingDisplays.find((l) => l.id !== displayLayer?.id) ??
    null;

  const targetLayer =
    explicitParticipating?.[0] ??
    resolveTargetEditableLayer(scene, sources, options.selectedLayerId) ??
    camLayer ??
    displayLayer ??
    foregroundParticipating[0] ??
    null;

  if (!targetLayer && foregroundParticipating.length === 0) return patches;

  const margin = options.margin ?? EDITOR_SAFE_MARGIN;
  const safeOutW = Math.max(1, options.outputWidth);
  const safeOutH = Math.max(1, options.outputHeight);
  const outputAspect = safeOutW / safeOutH;

  const getLayerK = (layer: SceneLayer | null): number => {
    if (!layer) return outputAspect / (16 / 9);
    const src = sourceById.get(layer.sourceId);
    const defW =
      src?.kind === 'camera'
        ? options.sensorWidth ?? 1920
        : layer.id === options.selectedLayerId && options.intrinsicWidth
          ? options.intrinsicWidth
          : safeOutW;
    const defH =
      src?.kind === 'camera'
        ? options.sensorHeight ?? 1080
        : layer.id === options.selectedLayerId && options.intrinsicHeight
          ? options.intrinsicHeight
          : safeOutH;
    const aspect = resolveLayerSourceAspectRatio(
      layer.transform.aspectPreset ?? 'sensor',
      layer.transform.customAspectRatio,
      defW,
      defH
    );
    return outputAspect / aspect;
  };

  if (layoutId === 'split-horizontal') {
    const primaryLeft =
      displayLayer ??
      foregroundParticipating.find((l) => l.id !== camLayer?.id) ??
      foregroundParticipating[0] ??
      null;
    const secondaryRight =
      (camLayer && camLayer.id !== primaryLeft?.id ? camLayer : null) ??
      secondaryDisplayLayer ??
      foregroundParticipating.find((l) => l.id !== primaryLeft?.id) ??
      null;

    if (primaryLeft && !primaryLeft.locked) {
      patches.set(
        primaryLeft.id,
        rectToLayerTransform(
          { left: 0, top: 0, width: 0.5, height: 1 },
          primaryLeft.transform
        )
      );
    }
    if (secondaryRight && !secondaryRight.locked) {
      patches.set(
        secondaryRight.id,
        rectToLayerTransform(
          { left: primaryLeft ? 0.5 : 0.25, top: 0, width: 0.5, height: 1 },
          { ...secondaryRight.transform, fitMode: 'cover' }
        )
      );
    }
  } else if (layoutId === 'split-vertical') {
    const primaryTop =
      displayLayer ??
      foregroundParticipating.find((l) => l.id !== camLayer?.id) ??
      foregroundParticipating[0] ??
      null;
    const secondaryBottom =
      (camLayer && camLayer.id !== primaryTop?.id ? camLayer : null) ??
      secondaryDisplayLayer ??
      foregroundParticipating.find((l) => l.id !== primaryTop?.id) ??
      null;

    if (primaryTop && !primaryTop.locked) {
      patches.set(
        primaryTop.id,
        rectToLayerTransform(
          { left: 0, top: 0, width: 1, height: 0.5 },
          primaryTop.transform
        )
      );
    }
    if (secondaryBottom && !secondaryBottom.locked) {
      patches.set(
        secondaryBottom.id,
        rectToLayerTransform(
          { left: 0, top: primaryTop ? 0.5 : 0.25, width: 1, height: 0.5 },
          { ...secondaryBottom.transform, fitMode: 'cover' }
        )
      );
    }
  } else if (layoutId === 'screen-main-transparent-presenter') {
    const mainLayer =
      displayLayer ??
      foregroundParticipating.find((l) => l.id !== camLayer?.id) ??
      targetLayer;
    const presenterLayer =
      (camLayer && camLayer.id !== mainLayer?.id ? camLayer : null) ??
      foregroundParticipating.find((l) => l.id !== mainLayer?.id) ??
      null;

    if (mainLayer && !mainLayer.locked) {
      patches.set(
        mainLayer.id,
        rectToLayerTransform(
          { left: 0, top: 0, width: 1, height: 1 },
          mainLayer.transform
        )
      );
    }
    if (presenterLayer && !presenterLayer.locked) {
      patches.set(
        presenterLayer.id,
        rectToLayerTransform(
          { left: 0, top: 0, width: 1, height: 1 },
          presenterLayer.transform
        )
      );
    }
  } else if (layoutId === 'pip-overlay' || layoutId === 'screen-main-cam-pip') {
    const mainLayer =
      displayLayer ??
      foregroundParticipating.find((l) => l.id !== camLayer?.id) ??
      targetLayer;
    const pipLayer =
      (camLayer && camLayer.id !== mainLayer?.id ? camLayer : null) ??
      foregroundParticipating.find((l) => l.id !== mainLayer?.id) ??
      null;

    if (mainLayer && !mainLayer.locked) {
      patches.set(
        mainLayer.id,
        rectToLayerTransform(
          { left: 0, top: 0, width: 1, height: 1 },
          mainLayer.transform
        )
      );
    }
    if (pipLayer && !pipLayer.locked) {
      const targetK = getLayerK(pipLayer);
      const { minW, maxW } = resolveDimensionLimits(targetK, 1 - margin * 2, 1 - margin * 2);
      const pipW = clamp(0.28, minW, maxW);
      const pipH = pipW * targetK;
      patches.set(
        pipLayer.id,
        rectToLayerTransform(
          {
            left: Math.max(0, 1 - margin - pipW),
            top: Math.max(0, 1 - margin - pipH),
            width: pipW,
            height: pipH,
          },
          pipLayer.transform
        )
      );
    }
  } else if (layoutId === 'cam-main-window-pip') {
    const mainCam =
      camLayer ??
      foregroundParticipating[0] ??
      targetLayer;
    const pipWin =
      (displayLayer && displayLayer.id !== mainCam?.id ? displayLayer : null) ??
      foregroundParticipating.find((l) => l.id !== mainCam?.id) ??
      null;

    if (mainCam && !mainCam.locked) {
      patches.set(
        mainCam.id,
        rectToLayerTransform(
          { left: 0, top: 0, width: 1, height: 1 },
          mainCam.transform
        )
      );
    }
    if (pipWin && !pipWin.locked) {
      const targetK = getLayerK(pipWin);
      const { minW, maxW } = resolveDimensionLimits(targetK, 1 - margin * 2, 1 - margin * 2);
      const pipW = clamp(0.36, minW, maxW);
      const pipH = pipW * targetK;
      patches.set(
        pipWin.id,
        rectToLayerTransform(
          {
            left: Math.max(0, 1 - margin - pipW),
            top: Math.max(0, 1 - margin - pipH),
            width: pipW,
            height: pipH,
          },
          pipWin.transform
        )
      );
    }
  } else if (layoutId === 'screen-main-window-pip') {
    const mainDisplay =
      displayLayer ??
      foregroundParticipating.find((l) => l.id !== camLayer?.id) ??
      targetLayer;
    const secondaryWin =
      (secondaryDisplayLayer && secondaryDisplayLayer.id !== mainDisplay?.id
        ? secondaryDisplayLayer
        : null) ??
      foregroundParticipating.find(
        (l) => l.id !== mainDisplay?.id && l.id !== camLayer?.id
      ) ??
      null;

    if (mainDisplay && !mainDisplay.locked) {
      patches.set(
        mainDisplay.id,
        rectToLayerTransform(
          { left: 0, top: 0, width: 1, height: 1 },
          mainDisplay.transform
        )
      );
    }
    if (secondaryWin && !secondaryWin.locked) {
      const targetK = getLayerK(secondaryWin);
      const { minW, maxW } = resolveDimensionLimits(targetK, 1 - margin * 2, 1 - margin * 2);
      const pipW = clamp(0.34, minW, maxW);
      const pipH = pipW * targetK;
      patches.set(
        secondaryWin.id,
        rectToLayerTransform(
          {
            left: Math.max(0, 1 - margin - pipW),
            top: margin,
            width: pipW,
            height: pipH,
          },
          secondaryWin.transform
        )
      );
    }
    if (
      camLayer &&
      !camLayer.locked &&
      camLayer.id !== mainDisplay?.id &&
      camLayer.id !== secondaryWin?.id
    ) {
      const targetK = getLayerK(camLayer);
      const { minW, maxW } = resolveDimensionLimits(targetK, 1 - margin * 2, 1 - margin * 2);
      const camW = clamp(0.26, minW, maxW);
      const camH = camW * targetK;
      patches.set(
        camLayer.id,
        rectToLayerTransform(
          {
            left: Math.max(0, 1 - margin - camW),
            top: Math.max(0, 1 - margin - camH),
            width: camW,
            height: camH,
          },
          camLayer.transform
        )
      );
    }
  } else if (layoutId === 'dual-windows-side-by-side') {
    const displayCandidates = foregroundParticipating.filter((l) => {
      const k = sourceById.get(l.sourceId)?.kind;
      return k === 'window' || k === 'screen' || k === 'image' || k === 'video-file';
    });
    const pair: SceneLayer[] = [];
    if (displayLayer) pair.push(displayLayer);
    if (secondaryDisplayLayer && secondaryDisplayLayer.id !== displayLayer?.id) {
      pair.push(secondaryDisplayLayer);
    }
    for (const candidate of displayCandidates) {
      if (pair.length >= 2) break;
      if (!pair.some((p) => p.id === candidate.id)) pair.push(candidate);
    }
    for (const candidate of foregroundParticipating) {
      if (pair.length >= 2) break;
      if (!pair.some((p) => p.id === candidate.id)) pair.push(candidate);
    }

    const gap = 0.02;
    const cellW = (1 - margin * 2 - gap) * 0.5;
    const cellH = 1 - margin * 2;
    pair.slice(0, 2).forEach((layer, index) => {
      if (layer.locked) return;
      const left = margin + index * (cellW + gap);
      patches.set(
        layer.id,
        rectToLayerTransform(
          { left, top: margin, width: cellW, height: cellH },
          { ...layer.transform, fitMode: 'contain' }
        )
      );
    });
  } else if (layoutId === 'grid-multi') {
    const items =
      foregroundParticipating.length > 0
        ? foregroundParticipating
        : targetLayer && !targetLayer.locked
          ? [targetLayer]
          : [];

    if (items.length === 1) {
      const single = items[0];
      if (!single.locked) {
        patches.set(
          single.id,
          rectToLayerTransform(
            {
              left: margin,
              top: margin,
              width: 1 - margin * 2,
              height: 1 - margin * 2,
            },
            single.transform
          )
        );
      }
    } else if (items.length > 1) {
      const orderedAsc = [...items].reverse();
      const count = orderedAsc.length;
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      const gap = 0.02;
      const cellW = Math.max(
        EDITOR_MIN_LAYER_DIMENSION,
        (1 - margin * 2 - gap * (cols - 1)) / cols
      );
      const cellH = Math.max(
        EDITOR_MIN_LAYER_DIMENSION,
        (1 - margin * 2 - gap * (rows - 1)) / rows
      );

      orderedAsc.forEach((layer, index) => {
        if (layer.locked) return;
        const col = index % cols;
        const row = Math.floor(index / cols);
        const left = clamp(margin + col * (cellW + gap), 0, Math.max(0, 1 - cellW));
        const top = clamp(margin + row * (cellH + gap), 0, Math.max(0, 1 - cellH));
        patches.set(
          layer.id,
          rectToLayerTransform(
            { left, top, width: cellW, height: cellH },
            layer.transform
          )
        );
      });
    }
  } else if (targetLayer && !targetLayer.locked) {
    if (layoutId === 'camera-full') {
      patches.set(
        targetLayer.id,
        rectToLayerTransform({ left: 0, top: 0, width: 1, height: 1 }, targetLayer.transform)
      );
    } else {
      const quickMap: Record<
        | 'corner-top-left'
        | 'corner-top-right'
        | 'corner-bottom-left'
        | 'corner-bottom-right'
        | 'center',
        QuickCameraPlacement
      > = {
        'corner-top-left': 'top-left',
        'corner-top-right': 'top-right',
        'corner-bottom-left': 'bottom-left',
        'corner-bottom-right': 'bottom-right',
        center: 'center',
      };
      const curRect = getLayerNormalizedRect(targetLayer.transform);
      const targetSrc = sourceById.get(targetLayer.sourceId);
      const targetLayerK = getLayerK(targetLayer);
      let baseTransform = targetLayer.transform;
      if (curRect.width > 0.72 && curRect.height > 0.72 && layoutId !== 'center') {
        const { minW, maxW } = resolveDimensionLimits(
          targetLayerK,
          1 - margin * 2,
          1 - margin * 2
        );
        const preferredCompact =
          targetSrc?.kind === 'window' || targetSrc?.kind === 'screen' ? 0.42 : 0.3;
        const compactW = clamp(preferredCompact, minW, maxW);
        const compactH = compactW * targetLayerK;
        baseTransform = rectToLayerTransform(
          {
            left: curRect.left,
            top: curRect.top,
            width: compactW,
            height: compactH,
          },
          targetLayer.transform
        );
      }
      const res = computeQuickPlacementTransform(baseTransform, quickMap[layoutId], {
        scene,
        layer: targetLayer,
        sources,
        margin,
      });
      patches.set(targetLayer.id, res.transform);
    }
  }

  return patches;
}
