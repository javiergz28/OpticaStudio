import {
  STUDIO_COORDINATE_SYSTEM,
  type ColorSourceDefinition,
  type GradientSourceDefinition,
  type LayerBlendMode,
  type LayerCrop,
  type LayerMaskShape,
  type LayerStyle,
  type LayerTransform,
  type SceneLayer,
  type SceneTransition,
  type SourceExecutionStatus,
  type StudioScene,
  type StudioSource,
  type TextSourceDefinition,
} from '../types/studio';
import type { AspectRatioId, ResolutionPresetId } from '../types/camera';
import type { SourceRuntimeEntry } from './sourceManager';

// ============================================================================
// TIPOS PÚBLICOS Y CONTRATOS DEL COMPOSITOR DE PROGRAMA
// ============================================================================

export type CompositorTargetFps = 24 | 25 | 30 | 60;
export type CompositorBackendKind = 'webgl2' | 'canvas2d' | 'custom';
export type UnavailableSourcePolicy = 'last-frame' | 'hide' | 'neutral-placeholder';
export type AlphaCompositionMode = 'straight' | 'premultiplied';

export interface OutputDimensions {
  width: number;
  height: number;
}

export const INITIAL_PROGRAM_PROFILE = {
  width: 1920,
  height: 1080,
  fps: 30 as CompositorTargetFps,
} as const;

export const STANDARD_COMPOSITION_FORMATS = {
  '1080p-horizontal': { width: 1920, height: 1080 },
  '1440p-horizontal': { width: 2560, height: 1440 },
  '4k-horizontal': { width: 3840, height: 2160 },
  '1080p-vertical': { width: 1080, height: 1920 },
  '1080p-square': { width: 1080, height: 1080 },
} as const;

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayerRenderGeometry {
  layerId: string;
  sourceId: string;
  /** Rectángulo de origen recortado en píxeles de la fuente (aplicado Crop + Cover si procede). */
  sourceRect: { sx: number; sy: number; sw: number; sh: number };
  /** Cuadro completo de la capa en píxeles del lienzo antes de rotar/invertir. */
  layerBox: { x: number; y: number; width: number; height: number };
  /** Rectángulo destino del contenido dentro del espacio local (0..layerBox.width, 0..layerBox.height). */
  contentLocalRect: { x: number; y: number; width: number; height: number };
  /** Punto pivote absoluto en el lienzo de salida `(x * canvasW, y * canvasH)`. */
  anchorPoint: { x: number; y: number };
  /** Desplazamiento desde el origen de la capa al centro del cuadro local tras anclaje. */
  rotationDeg: number;
  flipH: boolean;
  flipV: boolean;
  borderRadiusPx: number;
  borderWidthPx: number;
  shadowBlurPx: number;
  featherPx: number;
  /** Factor de escala respecto a altura/lado menor de referencia 1080p. */
  resolutionScale: number;
}

/**
 * Contrato para recibir fotogramas ya segmentados con canal alfa (e.g. presentador sin fondo)
 * desde el futuro pipeline GPU + MediaPipe sin acoplar ProgramCompositor a aiVision.
 */
export interface ProcessedLayerSurface {
  surface: TexImageSourceLike;
  width: number;
  height: number;
  alphaMode: AlphaCompositionMode;
  frameVersion?: number;
  hasTransparentSubject?: boolean;
}

export interface TexImageSourceLike {
  width?: number;
  height?: number;
  videoWidth?: number;
  videoHeight?: number;
  naturalWidth?: number;
  naturalHeight?: number;
  readyState?: number;
  currentTime?: number;
}

export interface RenderableGraphicContent {
  kind: 'color' | 'gradient' | 'text';
  color?: ColorSourceDefinition;
  gradient?: GradientSourceDefinition;
  text?: TextSourceDefinition;
}

export interface LayerRenderCommand {
  layerId: string;
  sourceId: string;
  sourceKind: StudioSource['kind'];
  zIndex: number;
  geometry: LayerRenderGeometry;
  style: LayerStyle;
  opacity: number;
  blendMode: LayerBlendMode;
  alphaMode: AlphaCompositionMode;
  hasTransparentAlpha: boolean;
  /** Recurso de textura o superficie gráfica listo para subir/dibujar. */
  surface: TexImageSourceLike | null;
  graphic?: RenderableGraphicContent;
  frameSignature: string;
  usingCachedFrame: boolean;
  unavailableFallbackMode: 'none' | 'neutral-placeholder';
}

export interface SceneRenderPlan {
  sceneId: string;
  backgroundColor: string;
  outputWidth: number;
  outputHeight: number;
  layers: LayerRenderCommand[];
  diagnostics: LayerDiagnosticItem[];
}

export interface LayerDiagnosticItem {
  layerId: string;
  sourceId: string;
  sourceKind: StudioSource['kind'] | 'missing';
  sourceStatus: SourceExecutionStatus | 'missing';
  rendered: boolean;
  usingCachedFrame: boolean;
  appliedFallback: 'none' | 'last-frame' | 'hidden' | 'neutral-placeholder';
  intrinsicWidth: number;
  intrinsicHeight: number;
}

export interface ActiveTransitionState {
  type: 'cut' | 'fade';
  fromSceneId: string;
  toSceneId: string;
  startedAt: number;
  durationMs: number;
  progress: number;
}

export interface CompositorFrameStats {
  renderedFrames: number;
  droppedOrSkippedTicks: number;
  lastRenderAt: number;
  lastRenderDurationMs: number;
  effectiveFps: number;
  targetFps: CompositorTargetFps;
  outputWidth: number;
  outputHeight: number;
  backendKind: CompositorBackendKind;
  contextLost: boolean;
  textureUploadsCount: number;
  cachedTexturesCount: number;
}

export interface ProgramSurfaceLike {
  width: number;
  height: number;
  getContext?: (contextId: string, options?: unknown) => unknown;
  addEventListener?: (type: string, listener: (event?: unknown) => void) => void;
  removeEventListener?: (type: string, listener: (event?: unknown) => void) => void;
}

export interface FrameSchedulerAdapter {
  requestFrame: (cb: (ts: number) => void) => number;
  cancelFrame: (handle: number) => void;
}

export interface CompositorRenderBackend {
  readonly kind: CompositorBackendKind;
  readonly isContextLost: boolean;
  initialize: (surface: ProgramSurfaceLike, width: number, height: number) => boolean;
  resize: (width: number, height: number) => void;
  renderScene: (plan: SceneRenderPlan) => void;
  renderFadeTransition: (
    outgoingPlan: SceneRenderPlan,
    incomingPlan: SceneRenderPlan,
    alphaIncoming: number
  ) => void;
  pruneUnusedSources: (activeSourceIds: Set<string>) => void;
  invalidateAllTextures: () => void;
  getStats: () => { textureUploadsCount: number; cachedTexturesCount: number };
  dispose: () => void;
}

export interface ProgramCompositorOptions {
  surface: ProgramSurfaceLike;
  width?: number;
  height?: number;
  fps?: CompositorTargetFps;
  unavailableSourcePolicy?: UnavailableSourcePolicy;
  lastFrameHoldMaxMs?: number;
  preferredBackend?: 'auto' | 'webgl2' | 'canvas2d';
  customBackend?: CompositorRenderBackend;
  scheduler?: FrameSchedulerAdapter;
  now?: () => number;
  onFrameRendered?: (stats: CompositorFrameStats) => void;
  onTransitionComplete?: (outgoingSceneId: string, incomingSceneId: string) => void;
  onContextLostChange?: (lost: boolean) => void;
}

// ============================================================================
// RESOLUCIÓN DE SALIDA Y MATEMÁTICA PURA DE COORDENADAS (INDEPENDIENTE DE DOM)
// ============================================================================

export function resolveOutputDimensions(
  resolutionPreset: ResolutionPresetId,
  aspectRatio: AspectRatioId
): OutputDimensions {
  const shortEdge =
    resolutionPreset === '4k'
      ? 2160
      : resolutionPreset === '720p'
        ? 720
        : 1080;

  if (aspectRatio === '9:16') {
    const height = Math.round((shortEdge * 16) / 9);
    return { width: shortEdge, height };
  }
  if (aspectRatio === '1:1') {
    return { width: shortEdge, height: shortEdge };
  }
  if (aspectRatio === '4:3') {
    return { width: Math.round((shortEdge * 4) / 3), height: shortEdge };
  }
  // '16:9' o 'native' por defecto en compositor de programa
  if (resolutionPreset === '4k') return { width: 3840, height: 2160 };
  if (resolutionPreset === '720p') return { width: 1280, height: 720 };
  return { width: 1920, height: 1080 };
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

export function sanitizeCrop(crop: LayerCrop): LayerCrop {
  const maxSide = STUDIO_COORDINATE_SYSTEM.maxCropPerSide;
  const top = clamp(crop.top, 0, maxSide);
  const right = clamp(crop.right, 0, maxSide);
  const bottom = clamp(crop.bottom, 0, maxSide);
  const left = clamp(crop.left, 0, maxSide);
  return {
    top,
    left,
    bottom: top + bottom >= 0.98 ? Math.max(0, 0.98 - top) : bottom,
    right: left + right >= 0.98 ? Math.max(0, 0.98 - left) : right,
  };
}

/**
 * Orden explícito y determinista de transformación de una capa:
 * 1. Recorte (`crop` normalizado) sobre dimensiones intrínsecas `(sourceW, sourceH)`.
 * 2. Conversión de `(x, y, width, height, anchorX, anchorY)` normalizados a píxeles de `ProgramCanvas`.
 * 3. Ajuste de relación de aspecto (`contain`, `cover`, `stretch`) preservando proporción sin distorsión.
 * 4. Punto pivote `(anchorPoint)` + rotación (`rotationDeg`) + inversión (`flipH`, `flipV`).
 * 5. Escalado proporcional de bordes/radios/sombras respecto a 1080p de referencia.
 */
export function computeLayerRenderGeometry(
  layer: SceneLayer,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number
): LayerRenderGeometry {
  const safeOutW = Math.max(1, outputWidth);
  const safeOutH = Math.max(1, outputHeight);
  const safeSrcW = Math.max(1, sourceWidth > 0 ? sourceWidth : safeOutW);
  const safeSrcH = Math.max(1, sourceHeight > 0 ? sourceHeight : safeOutH);

  const t: LayerTransform = layer.transform;
  const crop = sanitizeCrop(t.crop);

  // 1. Sub-rectángulo recortado de la fuente original
  let sx = crop.left * safeSrcW;
  let sy = crop.top * safeSrcH;
  let sw = Math.max(1, (1 - crop.left - crop.right) * safeSrcW);
  let sh = Math.max(1, (1 - crop.top - crop.bottom) * safeSrcH);

  // 2. Cuadro destino de la capa en coordenadas normalizadas -> píxeles
  const boxW = Math.max(1, t.width * safeOutW);
  const boxH = Math.max(1, t.height * safeOutH);
  const anchorCanvasX = t.x * safeOutW;
  const anchorCanvasY = t.y * safeOutH;
  const boxX = anchorCanvasX - t.anchorX * boxW;
  const boxY = anchorCanvasY - t.anchorY * boxH;

  // 3. Modo de ajuste (`contain`, `cover`, `stretch`) y encuadre interno (`contentZoom`, `contentOffsetX/Y`)
  const srcAspect = sw / sh;
  const boxAspect = boxW / boxH;
  const contentZoom = clamp(t.contentZoom ?? 1, 1, 4);
  const contentOffsetX = clamp(t.contentOffsetX ?? 0, -1, 1);
  const contentOffsetY = clamp(t.contentOffsetY ?? 0, -1, 1);

  let contentLocalRect = { x: 0, y: 0, width: boxW, height: boxH };

  if (t.fitMode === 'contain') {
    if (srcAspect > boxAspect) {
      const fittedH = boxW / srcAspect;
      contentLocalRect = {
        x: 0,
        y: (boxH - fittedH) * 0.5,
        width: boxW,
        height: fittedH,
      };
    } else {
      const fittedW = boxH * srcAspect;
      contentLocalRect = {
        x: (boxW - fittedW) * 0.5,
        y: 0,
        width: fittedW,
        height: boxH,
      };
    }

    if (contentZoom > 1.001) {
      const zoomedSw = sw / contentZoom;
      const zoomedSh = sh / contentZoom;
      const slackX = (sw - zoomedSw) * 0.5;
      const slackY = (sh - zoomedSh) * 0.5;
      sx += slackX + contentOffsetX * slackX;
      sy += slackY + contentOffsetY * slackY;
      sw = zoomedSw;
      sh = zoomedSh;
    }
  } else if (t.fitMode === 'cover') {
    let baseVisSw = sw;
    let baseVisSh = sh;
    if (srcAspect > boxAspect) {
      baseVisSw = sh * boxAspect;
    } else {
      baseVisSh = sw / boxAspect;
    }
    const zoomedSw = baseVisSw / contentZoom;
    const zoomedSh = baseVisSh / contentZoom;
    const slackX = Math.max(0, (sw - zoomedSw) * 0.5);
    const slackY = Math.max(0, (sh - zoomedSh) * 0.5);
    sx += slackX + contentOffsetX * slackX;
    sy += slackY + contentOffsetY * slackY;
    sw = zoomedSw;
    sh = zoomedSh;
  }
  // En 'stretch' se conserva sourceRect completo y contentLocalRect llena (0, 0, boxW, boxH)

  // 4. Escala proporcional de acabados respecto a 1080p
  const resolutionScale = Math.min(safeOutW, safeOutH) / 1080;
  const effectiveBorderWidth =
    layer.style.borderEnabled === false ? 0 : layer.style.borderWidthPx;

  return {
    layerId: layer.id,
    sourceId: layer.sourceId,
    sourceRect: { sx, sy, sw, sh },
    layerBox: { x: boxX, y: boxY, width: boxW, height: boxH },
    contentLocalRect,
    anchorPoint: { x: anchorCanvasX, y: anchorCanvasY },
    rotationDeg: t.rotationDeg,
    flipH: t.flipH,
    flipV: t.flipV,
    borderRadiusPx: layer.style.borderRadiusPx * resolutionScale,
    borderWidthPx: effectiveBorderWidth * resolutionScale,
    shadowBlurPx: layer.style.shadowBlurPx * resolutionScale,
    featherPx: Math.max(0, layer.style.featherPx ?? 0) * resolutionScale,
    resolutionScale,
  };
}

/**
 * Composición matemática recta (straight alpha) sobre un fondo RGBA para
 * verificar ausencia de halos oscuros en pruebas unitarias/píxeles.
 */
export function compositeStraightAlphaPixel(
  dst: [number, number, number, number],
  src: [number, number, number, number],
  layerOpacity = 1
): [number, number, number, number] {
  const sa = clamp((src[3] / 255) * clamp(layerOpacity, 0, 1), 0, 1);
  const da = clamp(dst[3] / 255, 0, 1);
  const outA = sa + da * (1 - sa);
  if (outA <= 0.0001) return [0, 0, 0, 0];

  const r = (src[0] * sa + dst[0] * da * (1 - sa)) / outA;
  const g = (src[1] * sa + dst[1] * da * (1 - sa)) / outA;
  const b = (src[2] * sa + dst[2] * da * (1 - sa)) / outA;

  return [
    Math.round(clamp(r, 0, 255)),
    Math.round(clamp(g, 0, 255)),
    Math.round(clamp(b, 0, 255)),
    Math.round(clamp(outA * 255, 0, 255)),
  ];
}

function sdRoundedBoxCpu(px: number, py: number, bx: number, by: number, r: number): number {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(ox, oy) - r;
}

/**
 * Distancia firmada en píxeles respecto al borde de cualquiera de las 6 formas de máscara.
 * Negativo = dentro de la máscara; 0 = borde exacto; Positivo = fuera.
 */
export function computeSignedMaskDistancePx(
  px: number,
  py: number,
  width: number,
  height: number,
  maskShape: LayerMaskShape,
  borderRadiusPx: number
): number {
  const hx = Math.max(1, width * 0.5);
  const hy = Math.max(1, height * 0.5);
  const dx = px - hx;
  const dy = py - hy;

  if (maskShape === 'circle') {
    const r = Math.min(hx, hy);
    return Math.hypot(dx, dy) - r;
  }

  if (maskShape === 'ellipse') {
    const qx = dx / hx;
    const qy = dy / hy;
    const k0 = Math.hypot(qx, qy);
    if (k0 < 0.0001) return -Math.min(hx, hy);
    const k1 = Math.hypot(qx / hx, qy / hy);
    return (k0 * (k0 - 1)) / Math.max(0.0001, k1);
  }

  if (maskShape === 'square') {
    const sideHalf = Math.min(hx, hy);
    const sr = Math.min(Math.max(0, borderRadiusPx), sideHalf);
    if (sr <= 0.5) {
      const qx = Math.abs(dx) - sideHalf;
      const qy = Math.abs(dy) - sideHalf;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
    }
    return sdRoundedBoxCpu(dx, dy, sideHalf, sideHalf, sr);
  }

  if (maskShape === 'rect' || borderRadiusPx <= 0.5) {
    const qx = Math.abs(dx) - hx;
    const qy = Math.abs(dy) - hy;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  }

  const maxR = Math.min(hx, hy);
  const r = Math.min(borderRadiusPx, maxR);

  if (maskShape === 'squircle') {
    const sr = Math.min(maxR, r * 1.35);
    const innerX = Math.max(hx - sr, 0.001);
    const innerY = Math.max(hy - sr, 0.001);
    const ex = Math.max(Math.abs(dx) - innerX, 0);
    const ey = Math.max(Math.abs(dy) - innerY, 0);
    if (ex === 0 && ey === 0) {
      return Math.max(Math.abs(dx) - hx, Math.abs(dy) - hy);
    }
    const nx = ex / sr;
    const ny = ey / sr;
    const p4 = Math.pow(Math.pow(nx, 4) + Math.pow(ny, 4), 0.25);
    return (p4 - 1) * sr;
  }

  return sdRoundedBoxCpu(dx, dy, hx, hy, r);
}

/**
 * Curva suave hermítica hacia el interior para el difuminado alfa perimetral sin halos.
 */
export function computeNormalizedFeatherAlpha(distPx: number, featherPx: number): number {
  const aa = 1.0;
  const edgeT = clamp((distPx + aa) / (2 * aa), 0, 1);
  const edgeAlpha = 1 - edgeT * edgeT * (3 - 2 * edgeT);
  if (edgeAlpha <= 0) return 0;
  if (featherPx <= 0.25) return edgeAlpha;

  const t = clamp(-distPx / Math.max(0.001, featherPx), 0, 1);
  const featherAlpha = t * t * (3 - 2 * t);
  return edgeAlpha * featherAlpha;
}

/**
 * Aplica difuminado perimetral en alpha recto sobre un buffer RGBA sin alterar los canales RGB.
 */
export function applyPerimeterFeatherToRgbaBuffer(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  maskShape: LayerMaskShape,
  borderRadiusPx: number,
  featherPx: number
): void {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  for (let y = 0; y < safeH; y++) {
    for (let x = 0; x < safeW; x++) {
      const dist = computeSignedMaskDistancePx(
        x + 0.5,
        y + 0.5,
        safeW,
        safeH,
        maskShape,
        borderRadiusPx
      );
      const maskA = computeNormalizedFeatherAlpha(dist, featherPx);
      const idx = (y * safeW + x) * 4;
      data[idx + 3] = Math.round(data[idx + 3] * maskA);
    }
  }
}

export function isVisualSourceKind(kind: StudioSource['kind']): boolean {
  return kind !== 'microphone' && kind !== 'system-audio' && kind !== 'audio-file';
}

export function mapBlendModeToCompositeOp(blend: LayerBlendMode): GlobalCompositeOperation {
  if (blend === 'screen') return 'screen';
  if (blend === 'multiply') return 'multiply';
  if (blend === 'overlay') return 'overlay';
  return 'source-over';
}

export function traceMaskPathOn2dContext(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  maskShape: LayerMaskShape,
  borderRadiusPx: number
): void {
  ctx.beginPath();

  if (maskShape === 'circle') {
    const r = Math.min(width, height) * 0.5;
    ctx.arc(width * 0.5, height * 0.5, r, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }

  if (maskShape === 'ellipse') {
    const rx = width * 0.5;
    const ry = height * 0.5;
    if (typeof ctx.ellipse === 'function') {
      ctx.ellipse(rx, ry, rx, ry, 0, 0, Math.PI * 2);
    } else {
      ctx.save();
      ctx.translate(rx, ry);
      ctx.scale(rx, ry);
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.restore();
    }
    ctx.closePath();
    return;
  }

  if (maskShape === 'square') {
    const side = Math.min(width, height);
    const sx = (width - side) * 0.5;
    const sy = (height - side) * 0.5;
    const r = Math.min(Math.max(0, borderRadiusPx), side * 0.5);
    if (r <= 0.5) {
      ctx.rect(sx, sy, side, side);
    } else if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(sx, sy, side, side, r);
    } else {
      ctx.rect(sx, sy, side, side);
    }
    ctx.closePath();
    return;
  }

  if (maskShape === 'rect' || borderRadiusPx <= 0.5) {
    ctx.rect(0, 0, width, height);
    ctx.closePath();
    return;
  }

  const maxR = Math.min(width, height) * 0.5;
  const r = Math.min(borderRadiusPx, maxR);

  if (maskShape === 'squircle') {
    // Superelipse continua (n ≈ 4.2) estilo Apple Liquid Glass con suavizado en tangentes
    const k = Math.min(maxR, r * 1.38);
    const c = k * 0.18;
    ctx.moveTo(k, 0);
    ctx.lineTo(width - k, 0);
    ctx.bezierCurveTo(width - c, 0, width, c, width, k);
    ctx.lineTo(width, height - k);
    ctx.bezierCurveTo(width, height - c, width - c, height, width - k, height);
    ctx.lineTo(k, height);
    ctx.bezierCurveTo(c, height, 0, height - c, 0, height - k);
    ctx.lineTo(0, k);
    ctx.bezierCurveTo(0, c, c, 0, k, 0);
    ctx.closePath();
    return;
  }

  // 'rounded'
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(0, 0, width, height, r);
  } else {
    ctx.moveTo(r, 0);
    ctx.lineTo(width - r, 0);
    ctx.quadraticCurveTo(width, 0, width, r);
    ctx.lineTo(width, height - r);
    ctx.quadraticCurveTo(width, height, width - r, height);
    ctx.lineTo(r, height);
    ctx.quadraticCurveTo(0, height, 0, height - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
  }
  ctx.closePath();
}

// ============================================================================
// CACHÉ DE SUPERFICIES GRÁFICAS ESTÁTICAS (EVITA CREAR CANVAS POR FOTOGRAMA)
// ============================================================================

interface CachedGraphicEntry {
  signature: string;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

class StaticGraphicRasterCache {
  private cache = new Map<string, CachedGraphicEntry>();

  getOrRender(
    sourceId: string,
    graphic: RenderableGraphicContent,
    targetW: number,
    targetH: number
  ): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;

    const w = Math.max(16, Math.round(targetW));
    const h = Math.max(16, Math.round(targetH));
    const signature = `${w}x${h}:${JSON.stringify(graphic)}`;
    const existing = this.cache.get(sourceId);
    if (existing && existing.signature === signature) {
      return existing.canvas;
    }

    const canvas = existing?.canvas ?? document.createElement('canvas');
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, w, h);

    if (graphic.kind === 'color' && graphic.color) {
      ctx.fillStyle = graphic.color.color;
      ctx.fillRect(0, 0, w, h);
    } else if (graphic.kind === 'gradient' && graphic.gradient) {
      const g = graphic.gradient;
      const rad = (g.angleDeg * Math.PI) / 180;
      const dx = Math.cos(rad) * w * 0.5;
      const dy = Math.sin(rad) * h * 0.5;
      const grad = ctx.createLinearGradient(w * 0.5 - dx, h * 0.5 - dy, w * 0.5 + dx, h * 0.5 + dy);
      grad.addColorStop(0, g.startColor);
      grad.addColorStop(1, g.endColor);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    } else if (graphic.kind === 'text' && graphic.text) {
      this.drawProductionTextCard(ctx, graphic.text, w, h);
    }

    this.cache.set(sourceId, { signature, canvas, width: w, height: h });
    return canvas;
  }

  private drawProductionTextCard(
    ctx: CanvasRenderingContext2D,
    src: TextSourceDefinition,
    w: number,
    h: number
  ): void {
    ctx.save();
    if (src.glassBackdrop) {
      const radius = Math.min(20, Math.min(w, h) * 0.25);
      ctx.fillStyle = 'rgba(14, 18, 28, 0.72)';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(0, 0, w, h, radius);
      } else {
        ctx.rect(0, 0, w, h);
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = Math.max(1, h * 0.02);
      ctx.stroke();
    }

    const padX = w * 0.06;
    const textX =
      src.align === 'center' ? w * 0.5 : src.align === 'right' ? w - padX : padX;
    ctx.textAlign = src.align;
    ctx.textBaseline = 'middle';

    const family =
      src.fontFamily === 'mono'
        ? '"JetBrains Mono", ui-monospace, monospace'
        : '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    const scaleFactor = Math.max(0.5, h / 100);
    const titleSize = Math.max(14, Math.round(src.fontSizePx * scaleFactor));

    if (src.subtitle) {
      ctx.font = `700 ${titleSize}px ${family}`;
      ctx.fillStyle = src.textColor;
      ctx.fillText(src.text, textX, h * 0.38, w - padX * 2);

      const subSize = Math.max(11, Math.round(titleSize * 0.65));
      ctx.font = `500 ${subSize}px ${family}`;
      ctx.fillStyle = src.accentColor;
      ctx.fillText(src.subtitle, textX, h * 0.69, w - padX * 2);
    } else {
      ctx.font = `700 ${titleSize}px ${family}`;
      ctx.fillStyle = src.textColor;
      ctx.fillText(src.text, textX, h * 0.5, w - padX * 2);
    }
    ctx.restore();
  }

  prune(activeIds: Set<string>): void {
    for (const key of this.cache.keys()) {
      if (!activeIds.has(key)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

// ============================================================================
// BACKEND WEBGL2 (FBO TRANSITIONS + TEXTURE CACHE + SDF MASK + STRAIGHT ALPHA)
// ============================================================================

const COMPOSITOR_VERT_SRC = `#version 300 es
in vec2 a_unitPos;
uniform mat3 u_matrix;
out vec2 v_localUv;

void main() {
  // Quad local [0..1] -> transformado a coordenadas clip [-1..1]
  vec3 world = u_matrix * vec3(a_unitPos, 1.0);
  gl_Position = vec4(world.xy, 0.0, 1.0);
  v_localUv = a_unitPos;
}
`;

const COMPOSITOR_FRAG_SRC = `#version 300 es
precision highp float;

in vec2 v_localUv;

uniform sampler2D u_tex;
uniform vec4 u_srcUvRect;
uniform int u_useSolidColor;
uniform vec4 u_solidColor;
uniform vec2 u_boxSizePx;
uniform vec2 u_quadSizePx;
uniform vec2 u_quadPaddingPx;
uniform vec2 u_contentMinUv;
uniform vec2 u_contentMaxUv;
uniform int u_maskShape; // 0=rect, 1=rounded, 2=circle, 3=squircle, 4=square, 5=ellipse
uniform float u_borderRadiusPx;
uniform float u_borderWidthPx;
uniform vec4 u_borderColor;
uniform float u_featherPx;
uniform int u_renderPass; // 0=content, 1=shadow
uniform vec4 u_shadowColor;
uniform float u_shadowBlurPx;
uniform float u_shadowOpacity;
uniform int u_hasTransparentAlpha;
uniform float u_opacity;
uniform int u_alphaMode; // 0=straight, 1=premultiplied

out vec4 outColor;

float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + vec2(r);
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float sdSquircleBox(vec2 p, vec2 b, float r) {
  vec2 inner = max(b - vec2(r), vec2(0.001));
  vec2 d = max(abs(p) - inner, vec2(0.0));
  if (r <= 0.5) {
    vec2 boxD = abs(p) - b;
    return length(max(boxD, 0.0)) + min(max(boxD.x, boxD.y), 0.0);
  }
  vec2 norm = d / r;
  // Curva superelíptica n=4 continua para esquinas Liquid Glass
  float p4 = pow(pow(norm.x, 4.0) + pow(norm.y, 4.0), 0.25);
  return (p4 - 1.0) * r;
}

float sdEllipsePx(vec2 p, vec2 ab) {
  vec2 safeAb = max(ab, vec2(1.0));
  vec2 q = p / safeAb;
  float k0 = length(q);
  if (k0 < 0.0001) {
    return -min(safeAb.x, safeAb.y);
  }
  float k1 = length(q / safeAb);
  return (k0 * (k0 - 1.0)) / max(k1, 0.0001);
}

float computeMaskDistance(vec2 pxPos, vec2 sizePx) {
  vec2 halfSize = sizePx * 0.5;
  vec2 p = pxPos - halfSize;

  if (u_maskShape == 2) {
    float rad = min(halfSize.x, halfSize.y);
    return length(p) - rad;
  }
  if (u_maskShape == 5) {
    return sdEllipsePx(p, halfSize);
  }
  if (u_maskShape == 4) {
    float sideHalf = min(halfSize.x, halfSize.y);
    float sr = min(u_borderRadiusPx, sideHalf);
    if (sr <= 0.5) {
      vec2 d = abs(p) - vec2(sideHalf);
      return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
    }
    return sdRoundedBox(p, vec2(sideHalf), sr);
  }
  if (u_maskShape == 0 || u_borderRadiusPx <= 0.5) {
    vec2 d = abs(p) - halfSize;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }
  float r = min(u_borderRadiusPx, min(halfSize.x, halfSize.y));
  if (u_maskShape == 3) {
    return sdSquircleBox(p, halfSize, min(min(halfSize.x, halfSize.y), r * 1.35));
  }
  return sdRoundedBox(p, halfSize, r);
}

void main() {
  vec2 pxPos = v_localUv * u_quadSizePx - u_quadPaddingPx;
  float dist = computeMaskDistance(pxPos, u_boxSizePx);
  float aa = 1.0;

  if (u_renderPass == 1) {
    float spread = max(1.0, u_shadowBlurPx * 1.8);
    float outerNorm = clamp(dist / spread, 0.0, 1.0);
    float falloff = (1.0 - outerNorm);
    falloff = falloff * falloff;
    float interiorGuard = (u_featherPx > 0.25 || u_hasTransparentAlpha == 1)
      ? smoothstep(-2.0, 2.0, dist)
      : 1.0;
    float shadowA = falloff * interiorGuard * u_shadowColor.a * u_shadowOpacity * u_opacity;
    if (shadowA <= 0.001) discard;
    outColor = vec4(u_shadowColor.rgb, shadowA);
    return;
  }

  float maskAlpha = 1.0 - smoothstep(-aa, aa, dist);
  if (u_featherPx > 0.25) {
    float tFeather = clamp((-dist) / max(0.001, u_featherPx), 0.0, 1.0);
    float featherCurve = tFeather * tFeather * (3.0 - 2.0 * tFeather);
    maskAlpha *= featherCurve;
  }
  if (maskAlpha <= 0.001) discard;

  vec4 texSample = vec4(0.0);
  bool insideContent =
    v_localUv.x >= u_contentMinUv.x &&
    v_localUv.x <= u_contentMaxUv.x &&
    v_localUv.y >= u_contentMinUv.y &&
    v_localUv.y <= u_contentMaxUv.y;

  if (u_useSolidColor == 1) {
    texSample = u_solidColor;
  } else if (insideContent) {
    vec2 mappedUv = (v_localUv - u_contentMinUv) / max(u_contentMaxUv - u_contentMinUv, vec2(0.0001));
    vec2 croppedUv = mix(u_srcUvRect.xy, u_srcUvRect.zw, clamp(mappedUv, 0.0, 1.0));
    texSample = texture(u_tex, croppedUv);
    if (u_alphaMode == 1 && texSample.a > 0.001) {
      // Des-premultiplicar para evitar halos oscuros al componer con SRC_ALPHA
      texSample.rgb = clamp(texSample.rgb / texSample.a, 0.0, 1.0);
    }
    if (u_hasTransparentAlpha == 1 && u_alphaMode == 1 && texSample.a > 0.005 && texSample.a < 0.92) {
      // Descontaminación GPU de borde: reemplaza tinte de pared en píxeles semitransparentes
      vec2 texelStep = vec2(2.0) / max(vec2(textureSize(u_tex, 0)), vec2(1.0));
      vec2 uvMin = min(u_srcUvRect.xy, u_srcUvRect.zw);
      vec2 uvMax = max(u_srcUvRect.xy, u_srcUvRect.zw);
      vec3 fgAcc = vec3(0.0);
      float fgW = 0.0;
      vec2 offsets[4] = vec2[4](
        vec2(-texelStep.x, 0.0),
        vec2(texelStep.x, 0.0),
        vec2(0.0, -texelStep.y),
        vec2(0.0, texelStep.y)
      );
      for (int k = 0; k < 4; k++) {
        vec4 nb = texture(u_tex, clamp(croppedUv + offsets[k], uvMin, uvMax));
        if (nb.a > 0.01) {
          vec3 nbRgb = clamp(nb.rgb / nb.a, 0.0, 1.0);
          float w = max(0.0, nb.a - texSample.a * 0.5);
          fgAcc += nbRgb * w;
          fgW += w;
        }
      }
      if (fgW > 0.001) {
        vec3 fgRgb = fgAcc / fgW;
        float deconMix = clamp((0.92 - texSample.a) * 0.78, 0.0, 0.72);
        texSample.rgb = mix(texSample.rgb, fgRgb, deconMix);
      }
    }
    if (texSample.a < 0.004) {
      texSample = vec4(0.0);
    }
  }

  vec4 finalColor = vec4(texSample.rgb, texSample.a * maskAlpha * u_opacity);

  if (u_borderWidthPx > 0.25 && u_borderColor.a > 0.001) {
    float innerEdge = dist + u_borderWidthPx;
    float borderFill = (1.0 - smoothstep(-aa, aa, dist)) * smoothstep(-aa, aa, innerEdge);
    float bAlpha = borderFill * u_borderColor.a * u_opacity;
    finalColor.rgb = mix(finalColor.rgb, u_borderColor.rgb, bAlpha);
    finalColor.a = max(finalColor.a, bAlpha);
  }

  outColor = finalColor;
}
`;

const BLEND_TRANSITION_FRAG_SRC = `#version 300 es
precision highp float;
in vec2 v_localUv;
uniform sampler2D u_texA;
uniform sampler2D u_texB;
uniform float u_mix;
out vec4 outColor;
void main() {
  vec4 a = texture(u_texA, v_localUv);
  vec4 b = texture(u_texB, v_localUv);
  outColor = mix(a, b, clamp(u_mix, 0.0, 1.0));
}
`;

function parseCssColorRgba(colorStr: string): [number, number, number, number] {
  const s = colorStr.trim();
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16) / 255;
      const g = parseInt(hex[1] + hex[1], 16) / 255;
      const b = parseInt(hex[2] + hex[2], 16) / 255;
      return [r, g, b, 1];
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return [r, g, b, a];
    }
  }
  const match = s.match(/rgba?\(([^)]+)\)/i);
  if (match) {
    const parts = match[1].split(',').map((p) => parseFloat(p.trim()));
    if (parts.length >= 3) {
      return [
        clamp(parts[0] / 255, 0, 1),
        clamp(parts[1] / 255, 0, 1),
        clamp(parts[2] / 255, 0, 1),
        parts.length >= 4 && Number.isFinite(parts[3]) ? clamp(parts[3], 0, 1) : 1,
      ];
    }
  }
  return [0.024, 0.027, 0.039, 1];
}

interface CachedWebglTexture {
  texture: WebGLTexture;
  signature: string;
  alphaMode: 'straight' | 'premultiplied';
  width: number;
  height: number;
}

interface FboTarget {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

export class Webgl2CompositorBackend implements CompositorRenderBackend {
  readonly kind: CompositorBackendKind = 'webgl2';

  private surface: ProgramSurfaceLike | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private contextLost = false;
  private width: number = INITIAL_PROGRAM_PROFILE.width;
  private height: number = INITIAL_PROGRAM_PROFILE.height;

  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private layerProgram: WebGLProgram | null = null;
  private fadeProgram: WebGLProgram | null = null;

  private sourceTextures = new Map<string, CachedWebglTexture>();
  private staticGraphicCache = new StaticGraphicRasterCache();
  private fboA: FboTarget | null = null;
  private fboB: FboTarget | null = null;
  private textureUploadsCount = 0;

  private lostListener: ((e?: unknown) => void) | null = null;
  private restoredListener: ((e?: unknown) => void) | null = null;
  private onContextLostCallback?: (lost: boolean) => void;

  constructor(onContextLostCallback?: (lost: boolean) => void) {
    this.onContextLostCallback = onContextLostCallback;
  }

  get isContextLost(): boolean {
    return this.contextLost;
  }

  initialize(surface: ProgramSurfaceLike, width: number, height: number): boolean {
    this.surface = surface;
    this.width = width;
    this.height = height;

    const rawCtx = surface.getContext?.('webgl2', {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });

    if (!rawCtx || typeof (rawCtx as WebGL2RenderingContext).createProgram !== 'function') {
      return false;
    }

    this.gl = rawCtx as WebGL2RenderingContext;
    this.attachContextLossHandlers();
    return this.rebuildGpuObjects();
  }

  private attachContextLossHandlers(): void {
    if (!this.surface?.addEventListener) return;
    this.detachContextLossHandlers();

    this.lostListener = (ev?: unknown) => {
      (ev as { preventDefault?: () => void } | undefined)?.preventDefault?.();
      this.contextLost = true;
      this.onContextLostCallback?.(true);
    };

    this.restoredListener = () => {
      this.contextLost = false;
      this.invalidateAllTextures();
      this.rebuildGpuObjects();
      this.onContextLostCallback?.(false);
    };

    this.surface.addEventListener('webglcontextlost', this.lostListener);
    this.surface.addEventListener('webglcontextrestored', this.restoredListener);
  }

  private detachContextLossHandlers(): void {
    if (!this.surface?.removeEventListener) return;
    if (this.lostListener) {
      this.surface.removeEventListener('webglcontextlost', this.lostListener);
      this.lostListener = null;
    }
    if (this.restoredListener) {
      this.surface.removeEventListener('webglcontextrestored', this.restoredListener);
      this.restoredListener = null;
    }
  }

  private compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private buildProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): WebGLProgram | null {
    const vs = this.compileShader(gl, gl.VERTEX_SHADER, vertSrc);
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return null;
    }
    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  private rebuildGpuObjects(): boolean {
    const gl = this.gl;
    if (!gl || this.contextLost) return false;

    this.layerProgram = this.buildProgram(gl, COMPOSITOR_VERT_SRC, COMPOSITOR_FRAG_SRC);
    this.fadeProgram = this.buildProgram(gl, COMPOSITOR_VERT_SRC, BLEND_TRANSITION_FRAG_SRC);
    if (!this.layerProgram || !this.fadeProgram) return false;

    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();
    if (!this.vao || !this.vbo) return false;

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    // Quad unitario [0..1]
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    const loc = gl.getAttribLocation(this.layerProgram, 'a_unitPos');
    if (loc >= 0) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    return true;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    if (this.surface) {
      this.surface.width = this.width;
      this.surface.height = this.height;
    }
    this.releaseFbos();
  }

  private ensureFbo(slot: 'a' | 'b'): FboTarget | null {
    const gl = this.gl;
    if (!gl || this.contextLost) return null;
    const current = slot === 'a' ? this.fboA : this.fboB;
    if (current && current.width === this.width && current.height === this.height) {
      return current;
    }

    if (current) {
      gl.deleteFramebuffer(current.fbo);
      gl.deleteTexture(current.texture);
    }

    const texture = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!texture || !fbo) return null;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const created: FboTarget = { fbo, texture, width: this.width, height: this.height };
    if (slot === 'a') this.fboA = created;
    else this.fboB = created;
    return created;
  }

  private releaseFbos(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.fboA) {
      gl.deleteFramebuffer(this.fboA.fbo);
      gl.deleteTexture(this.fboA.texture);
      this.fboA = null;
    }
    if (this.fboB) {
      gl.deleteFramebuffer(this.fboB.fbo);
      gl.deleteTexture(this.fboB.texture);
      this.fboB = null;
    }
  }

  renderScene(plan: SceneRenderPlan): void {
    const gl = this.gl;
    if (!gl || this.contextLost || !this.layerProgram || !this.vao) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.drawPlanIntoBoundTarget(plan);
  }

  renderFadeTransition(
    outgoingPlan: SceneRenderPlan,
    incomingPlan: SceneRenderPlan,
    alphaIncoming: number
  ): void {
    const gl = this.gl;
    if (!gl || this.contextLost || !this.fadeProgram || !this.vao) return;

    const targetA = this.ensureFbo('a');
    const targetB = this.ensureFbo('b');
    if (!targetA || !targetB) {
      this.renderScene(alphaIncoming >= 0.5 ? incomingPlan : outgoingPlan);
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetA.fbo);
    this.drawPlanIntoBoundTarget(outgoingPlan);

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetB.fbo);
    this.drawPlanIntoBoundTarget(incomingPlan);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.fadeProgram);
    gl.bindVertexArray(this.vao);

    // Matriz identidad full-screen [-1..1] desde quad [0..1]
    const fullMat = new Float32Array([2, 0, 0, 0, 2, 0, -1, -1, 1]);
    gl.uniformMatrix3fv(gl.getUniformLocation(this.fadeProgram, 'u_matrix'), false, fullMat);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, targetA.texture);
    gl.uniform1i(gl.getUniformLocation(this.fadeProgram, 'u_texA'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, targetB.texture);
    gl.uniform1i(gl.getUniformLocation(this.fadeProgram, 'u_texB'), 1);

    gl.uniform1f(gl.getUniformLocation(this.fadeProgram, 'u_mix'), clamp(alphaIncoming, 0, 1));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawPlanIntoBoundTarget(plan: SceneRenderPlan): void {
    const gl = this.gl!;
    const prog = this.layerProgram!;

    gl.viewport(0, 0, plan.outputWidth, plan.outputHeight);
    const [br, bg, bb, ba] = parseCssColorRgba(plan.backgroundColor);
    gl.clearColor(br, bg, bb, ba);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(prog);
    gl.bindVertexArray(this.vao);

    for (const cmd of plan.layers) {
      const hasShadow =
        cmd.geometry.shadowBlurPx > 0.25 && cmd.style.shadowOpacity > 0.005;

      if (cmd.unavailableFallbackMode === 'neutral-placeholder') {
        if (hasShadow) this.drawShadowQuad(cmd);
        this.drawSolidQuad(cmd, [0.06, 0.08, 0.12, 0.88]);
        continue;
      }

      let uploadSource: TexImageSourceLike | null = cmd.surface;
      if (!uploadSource && cmd.graphic) {
        if (cmd.graphic.kind === 'color' && cmd.graphic.color) {
          if (hasShadow) this.drawShadowQuad(cmd);
          this.drawSolidQuad(cmd, parseCssColorRgba(cmd.graphic.color.color));
          continue;
        }
        uploadSource = this.staticGraphicCache.getOrRender(
          cmd.sourceId,
          cmd.graphic,
          cmd.geometry.layerBox.width,
          cmd.geometry.layerBox.height
        );
      }

      if (!uploadSource) continue;

      const tex = this.getOrUploadTexture(cmd.sourceId, uploadSource, cmd.frameSignature, cmd.alphaMode);
      if (!tex) continue;

      if (hasShadow) {
        this.drawShadowQuad(cmd);
      }
      this.drawTexturedLayerQuad(cmd, tex, uploadSource);
    }
  }

  private getOrUploadTexture(
    sourceId: string,
    surface: TexImageSourceLike,
    signature: string,
    alphaMode: 'straight' | 'premultiplied'
  ): WebGLTexture | null {
    const gl = this.gl!;
    let cached = this.sourceTextures.get(sourceId);
    if (!cached) {
      const tex = gl.createTexture();
      if (!tex) return null;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      cached = { texture: tex, signature: '', alphaMode, width: 0, height: 0 };
      this.sourceTextures.set(sourceId, cached);
    }

    if (cached.signature !== signature || cached.alphaMode !== alphaMode) {
      gl.bindTexture(gl.TEXTURE_2D, cached.texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, alphaMode === 'premultiplied' ? 1 : 0);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        surface as unknown as TexImageSource
      );
      cached.signature = signature;
      cached.alphaMode = alphaMode;
      this.textureUploadsCount += 1;
    }

    return cached.texture;
  }

  private computeClipSpaceMatrix(geom: LayerRenderGeometry, outW: number, outH: number): Float32Array {
    const { layerBox, anchorPoint, rotationDeg, flipH, flipV } = geom;
    const rad = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Origen local dentro del espacio anclado
    const offsetX = layerBox.x - anchorPoint.x;
    const offsetY = layerBox.y - anchorPoint.y;

    const sx = flipH ? -layerBox.width : layerBox.width;
    const sy = flipV ? -layerBox.height : layerBox.height;
    const baseTx = flipH ? offsetX + layerBox.width : offsetX;
    const baseTy = flipV ? offsetY + layerBox.height : offsetY;

    // 1. Escala quad unitario + desplazamiento respecto al pivote
    // 2. Rotación alrededor de anchorPoint
    // 3. Conversión píxeles -> WebGL clip space [-1..1] (invirtiendo eje Y)
    const m00 = (sx * cos * 2) / outW;
    const m01 = (sx * sin * -2) / outH;
    const m10 = (-sy * sin * 2) / outW;
    const m11 = (sy * cos * -2) / outH;

    const rotTx = baseTx * cos - baseTy * sin + anchorPoint.x;
    const rotTy = baseTx * sin + baseTy * cos + anchorPoint.y;
    const m20 = (rotTx * 2) / outW - 1;
    const m21 = 1 - (rotTy * 2) / outH;

    return new Float32Array([m00, m01, 0, m10, m11, 0, m20, m21, 1]);
  }

  private drawShadowQuad(cmd: LayerRenderCommand): void {
    const gl = this.gl!;
    const prog = this.layerProgram!;
    const pad = Math.ceil(cmd.geometry.shadowBlurPx * 2.0);
    const paddedGeometry: LayerRenderGeometry = {
      ...cmd.geometry,
      layerBox: {
        x: cmd.geometry.layerBox.x - pad,
        y: cmd.geometry.layerBox.y - pad,
        width: cmd.geometry.layerBox.width + pad * 2,
        height: cmd.geometry.layerBox.height + pad * 2,
      },
    };
    const mat = this.computeClipSpaceMatrix(paddedGeometry, this.width, this.height);

    gl.uniformMatrix3fv(gl.getUniformLocation(prog, 'u_matrix'), false, mat);
    gl.uniform4f(gl.getUniformLocation(prog, 'u_srcUvRect'), 0, 0, 1, 1);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_useSolidColor'), 1);
    gl.uniform4f(gl.getUniformLocation(prog, 'u_solidColor'), 0, 0, 0, 0);
    this.bindCommonStyleUniforms(cmd, 1, pad, paddedGeometry.layerBox.width, paddedGeometry.layerBox.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawSolidQuad(cmd: LayerRenderCommand, rgba: [number, number, number, number]): void {
    const gl = this.gl!;
    const prog = this.layerProgram!;
    const mat = this.computeClipSpaceMatrix(cmd.geometry, this.width, this.height);

    gl.uniformMatrix3fv(gl.getUniformLocation(prog, 'u_matrix'), false, mat);
    gl.uniform4f(gl.getUniformLocation(prog, 'u_srcUvRect'), 0, 0, 1, 1);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_useSolidColor'), 1);
    gl.uniform4f(gl.getUniformLocation(prog, 'u_solidColor'), rgba[0], rgba[1], rgba[2], rgba[3]);
    this.bindCommonStyleUniforms(cmd, 0, 0, cmd.geometry.layerBox.width, cmd.geometry.layerBox.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private drawTexturedLayerQuad(
    cmd: LayerRenderCommand,
    tex: WebGLTexture,
    surface: TexImageSourceLike
  ): void {
    const gl = this.gl!;
    const prog = this.layerProgram!;
    const mat = this.computeClipSpaceMatrix(cmd.geometry, this.width, this.height);

    const srcW = surface.videoWidth || surface.naturalWidth || surface.width || 1;
    const srcH = surface.videoHeight || surface.naturalHeight || surface.height || 1;
    const { sx, sy, sw, sh } = cmd.geometry.sourceRect;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_tex'), 0);
    gl.uniformMatrix3fv(gl.getUniformLocation(prog, 'u_matrix'), false, mat);
    gl.uniform4f(
      gl.getUniformLocation(prog, 'u_srcUvRect'),
      sx / srcW,
      sy / srcH,
      (sx + sw) / srcW,
      (sy + sh) / srcH
    );
    gl.uniform1i(gl.getUniformLocation(prog, 'u_useSolidColor'), 0);
    this.bindCommonStyleUniforms(cmd, 0, 0, cmd.geometry.layerBox.width, cmd.geometry.layerBox.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private bindCommonStyleUniforms(
    cmd: LayerRenderCommand,
    renderPass: 0 | 1,
    quadPadPx: number,
    quadWidthPx: number,
    quadHeightPx: number
  ): void {
    const gl = this.gl!;
    const prog = this.layerProgram!;
    const { layerBox, contentLocalRect, borderRadiusPx, borderWidthPx, featherPx, shadowBlurPx } =
      cmd.geometry;

    const minU = contentLocalRect.x / Math.max(1, layerBox.width);
    const minV = contentLocalRect.y / Math.max(1, layerBox.height);
    const maxU = (contentLocalRect.x + contentLocalRect.width) / Math.max(1, layerBox.width);
    const maxV = (contentLocalRect.y + contentLocalRect.height) / Math.max(1, layerBox.height);

    const maskInt =
      cmd.style.maskShape === 'rounded'
        ? 1
        : cmd.style.maskShape === 'circle'
          ? 2
          : cmd.style.maskShape === 'squircle'
            ? 3
            : cmd.style.maskShape === 'square'
              ? 4
              : cmd.style.maskShape === 'ellipse'
                ? 5
                : 0;
    const [br, bg, bb, ba] = parseCssColorRgba(cmd.style.borderColor);
    const [sr, sg, sb, sa] = parseCssColorRgba(cmd.style.shadowColor);

    gl.uniform2f(gl.getUniformLocation(prog, 'u_boxSizePx'), layerBox.width, layerBox.height);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_quadSizePx'), quadWidthPx, quadHeightPx);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_quadPaddingPx'), quadPadPx, quadPadPx);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_contentMinUv'), minU, minV);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_contentMaxUv'), maxU, maxV);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_maskShape'), maskInt);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_borderRadiusPx'), borderRadiusPx);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_borderWidthPx'), borderWidthPx);
    gl.uniform4f(gl.getUniformLocation(prog, 'u_borderColor'), br, bg, bb, ba);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_featherPx'), featherPx);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_renderPass'), renderPass);
    gl.uniform4f(gl.getUniformLocation(prog, 'u_shadowColor'), sr, sg, sb, sa);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_shadowBlurPx'), shadowBlurPx);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_shadowOpacity'), cmd.style.shadowOpacity);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_hasTransparentAlpha'), cmd.hasTransparentAlpha ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_opacity'), cmd.opacity);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_alphaMode'), cmd.alphaMode === 'premultiplied' ? 1 : 0);
  }

  pruneUnusedSources(activeSourceIds: Set<string>): void {
    const gl = this.gl;
    for (const [id, item] of this.sourceTextures.entries()) {
      if (!activeSourceIds.has(id)) {
        if (gl && !this.contextLost) {
          gl.deleteTexture(item.texture);
        }
        this.sourceTextures.delete(id);
      }
    }
    this.staticGraphicCache.prune(activeSourceIds);
  }

  invalidateAllTextures(): void {
    const gl = this.gl;
    for (const item of this.sourceTextures.values()) {
      if (gl && !this.contextLost) {
        gl.deleteTexture(item.texture);
      }
    }
    this.sourceTextures.clear();
  }

  getStats(): { textureUploadsCount: number; cachedTexturesCount: number } {
    return {
      textureUploadsCount: this.textureUploadsCount,
      cachedTexturesCount: this.sourceTextures.size,
    };
  }

  dispose(): void {
    this.detachContextLossHandlers();
    this.invalidateAllTextures();
    this.staticGraphicCache.clear();
    this.releaseFbos();

    const gl = this.gl;
    if (gl && !this.contextLost) {
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.vbo) gl.deleteBuffer(this.vbo);
      if (this.layerProgram) gl.deleteProgram(this.layerProgram);
      if (this.fadeProgram) gl.deleteProgram(this.fadeProgram);
    }
    this.gl = null;
    this.surface = null;
  }
}

// ============================================================================
// BACKEND CANVAS 2D (COMPATIBILIDAD / SOFTWARE / ENTORNO DE PRUEBAS)
// ============================================================================

export class Canvas2dCompositorBackend implements CompositorRenderBackend {
  readonly kind: CompositorBackendKind = 'canvas2d';
  readonly isContextLost = false;

  private surface: ProgramSurfaceLike | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width: number = INITIAL_PROGRAM_PROFILE.width;
  private height: number = INITIAL_PROGRAM_PROFILE.height;
  private staticGraphicCache = new StaticGraphicRasterCache();
  // Buffers reutilizables para fade transition y difuminado alfa perimetral sin asignar canvas por fotograma
  private outgoingScratch: HTMLCanvasElement | null = null;
  private outgoingScratchCtx: CanvasRenderingContext2D | null = null;
  private incomingScratch: HTMLCanvasElement | null = null;
  private incomingScratchCtx: CanvasRenderingContext2D | null = null;
  private layerScratch: HTMLCanvasElement | null = null;
  private layerScratchCtx: CanvasRenderingContext2D | null = null;
  private maskScratch: HTMLCanvasElement | null = null;
  private maskScratchCtx: CanvasRenderingContext2D | null = null;
  private cachedFeatherMaskKey = '';

  initialize(surface: ProgramSurfaceLike, width: number, height: number): boolean {
    this.surface = surface;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const ctx = surface.getContext?.('2d', { alpha: false });
    if (!ctx) return false;
    this.ctx = ctx as CanvasRenderingContext2D;
    return true;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    if (this.surface) {
      this.surface.width = this.width;
      this.surface.height = this.height;
    }
    if (this.outgoingScratch) {
      this.outgoingScratch.width = this.width;
      this.outgoingScratch.height = this.height;
    }
    if (this.incomingScratch) {
      this.incomingScratch.width = this.width;
      this.incomingScratch.height = this.height;
    }
  }

  renderScene(plan: SceneRenderPlan): void {
    if (!this.ctx) return;
    this.drawPlanToCtx(this.ctx, plan);
  }

  renderFadeTransition(
    outgoingPlan: SceneRenderPlan,
    incomingPlan: SceneRenderPlan,
    alphaIncoming: number
  ): void {
    if (!this.ctx) return;
    const t = clamp(alphaIncoming, 0, 1);

    if (t <= 0) {
      this.drawPlanToCtx(this.ctx, outgoingPlan);
      return;
    }
    if (t >= 1) {
      this.drawPlanToCtx(this.ctx, incomingPlan);
      return;
    }

    if (typeof document !== 'undefined') {
      this.ensureFadeScratchBuffers();
      if (
        this.outgoingScratch &&
        this.outgoingScratchCtx &&
        this.incomingScratch &&
        this.incomingScratchCtx
      ) {
        this.drawPlanToCtx(this.outgoingScratchCtx, outgoingPlan);
        this.drawPlanToCtx(this.incomingScratchCtx, incomingPlan);

        this.ctx.save();
        this.ctx.globalAlpha = 1;
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.drawImage(this.outgoingScratch, 0, 0, this.width, this.height);
        this.ctx.globalAlpha = t;
        this.ctx.drawImage(this.incomingScratch, 0, 0, this.width, this.height);
        this.ctx.restore();
        return;
      }
    }

    // Fallback directo en entornos sin DOM (ej. pruebas con Mock 2D Context)
    this.drawPlanToCtx(this.ctx, outgoingPlan, 1);
    this.drawLayersOntoCtx(this.ctx, incomingPlan.layers, t);
  }

  private ensureFadeScratchBuffers(): void {
    if (!this.outgoingScratch) {
      this.outgoingScratch = document.createElement('canvas');
      this.outgoingScratch.width = this.width;
      this.outgoingScratch.height = this.height;
      this.outgoingScratchCtx = this.outgoingScratch.getContext('2d');
    }
    if (!this.incomingScratch) {
      this.incomingScratch = document.createElement('canvas');
      this.incomingScratch.width = this.width;
      this.incomingScratch.height = this.height;
      this.incomingScratchCtx = this.incomingScratch.getContext('2d');
    }
  }

  private ensureFeatherScratchBuffers(
    targetW: number,
    targetH: number,
    maskShape: LayerMaskShape,
    borderRadiusPx: number,
    featherPx: number
  ): boolean {
    if (typeof document === 'undefined') return false;
    const w = Math.max(1, Math.round(targetW));
    const h = Math.max(1, Math.round(targetH));

    if (!this.layerScratch) {
      this.layerScratch = document.createElement('canvas');
      this.layerScratchCtx = this.layerScratch.getContext('2d');
    }
    if (!this.maskScratch) {
      this.maskScratch = document.createElement('canvas');
      this.maskScratchCtx = this.maskScratch.getContext('2d');
    }
    if (!this.layerScratch || !this.layerScratchCtx || !this.maskScratch || !this.maskScratchCtx) {
      return false;
    }

    if (this.layerScratch.width !== w || this.layerScratch.height !== h) {
      this.layerScratch.width = w;
      this.layerScratch.height = h;
    }
    if (this.maskScratch.width !== w || this.maskScratch.height !== h) {
      this.maskScratch.width = w;
      this.maskScratch.height = h;
      this.cachedFeatherMaskKey = '';
    }

    const maskKey = `${w}x${h}:${maskShape}:${borderRadiusPx.toFixed(1)}:${featherPx.toFixed(1)}`;
    if (this.cachedFeatherMaskKey !== maskKey) {
      const imgData = this.maskScratchCtx.createImageData(w, h);
      const data = imgData.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dist = computeSignedMaskDistancePx(
            x + 0.5,
            y + 0.5,
            w,
            h,
            maskShape,
            borderRadiusPx
          );
          const alpha = computeNormalizedFeatherAlpha(dist, featherPx);
          const idx = (y * w + x) * 4;
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
          data[idx + 3] = Math.round(alpha * 255);
        }
      }
      this.maskScratchCtx.putImageData(imgData, 0, 0);
      this.cachedFeatherMaskKey = maskKey;
    }

    return true;
  }

  private drawLayerContentCore(
    targetCtx: CanvasRenderingContext2D,
    cmd: LayerRenderCommand
  ): void {
    const { geometry } = cmd;
    const { layerBox, contentLocalRect, sourceRect } = geometry;

    if (cmd.unavailableFallbackMode === 'neutral-placeholder') {
      targetCtx.fillStyle = 'rgba(14, 18, 28, 0.88)';
      targetCtx.fillRect(0, 0, layerBox.width, layerBox.height);
    } else if (cmd.graphic?.kind === 'color' && cmd.graphic.color) {
      targetCtx.fillStyle = cmd.graphic.color.color;
      targetCtx.fillRect(0, 0, layerBox.width, layerBox.height);
    } else if (cmd.graphic) {
      const renderedGraphic = this.staticGraphicCache.getOrRender(
        cmd.sourceId,
        cmd.graphic,
        layerBox.width,
        layerBox.height
      );
      if (renderedGraphic) {
        targetCtx.drawImage(renderedGraphic, 0, 0, layerBox.width, layerBox.height);
      } else if (cmd.graphic.kind === 'gradient' && cmd.graphic.gradient) {
        const g = cmd.graphic.gradient;
        const grad = targetCtx.createLinearGradient(0, 0, layerBox.width, layerBox.height);
        grad.addColorStop(0, g.startColor);
        grad.addColorStop(1, g.endColor);
        targetCtx.fillStyle = grad;
        targetCtx.fillRect(0, 0, layerBox.width, layerBox.height);
      } else if (cmd.graphic.kind === 'text' && cmd.graphic.text) {
        targetCtx.fillStyle = cmd.graphic.text.textColor;
        targetCtx.fillText(cmd.graphic.text.text, 16, layerBox.height * 0.5);
      }
    } else if (cmd.surface) {
      targetCtx.drawImage(
        cmd.surface as unknown as CanvasImageSource,
        sourceRect.sx,
        sourceRect.sy,
        sourceRect.sw,
        sourceRect.sh,
        contentLocalRect.x,
        contentLocalRect.y,
        contentLocalRect.width,
        contentLocalRect.height
      );
    }
  }

  private drawPlanToCtx(
    ctx: CanvasRenderingContext2D,
    plan: SceneRenderPlan,
    alphaMultiplier = 1
  ): void {
    ctx.save();
    ctx.globalAlpha = alphaMultiplier;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = plan.backgroundColor;
    ctx.fillRect(0, 0, plan.outputWidth, plan.outputHeight);
    ctx.restore();

    this.drawLayersOntoCtx(ctx, plan.layers, alphaMultiplier);
  }

  private drawLayersOntoCtx(
    ctx: CanvasRenderingContext2D,
    layers: LayerRenderCommand[],
    alphaMultiplier = 1
  ): void {
    for (const cmd of layers) {
      const { geometry, style } = cmd;
      const { layerBox, anchorPoint } = geometry;
      const effectiveAlpha = clamp(cmd.opacity * alphaMultiplier, 0, 1);
      if (effectiveAlpha <= 0.001) continue;

      const useOffscreenFeather =
        typeof document !== 'undefined' &&
        geometry.featherPx > 0.25 &&
        this.ensureFeatherScratchBuffers(
          layerBox.width,
          layerBox.height,
          style.maskShape,
          geometry.borderRadiusPx,
          geometry.featherPx
        );

      if (useOffscreenFeather && this.layerScratch && this.layerScratchCtx && this.maskScratch) {
        const sCtx = this.layerScratchCtx;
        const sw = this.layerScratch.width;
        const sh = this.layerScratch.height;
        sCtx.save();
        sCtx.globalAlpha = 1;
        sCtx.globalCompositeOperation = 'source-over';
        sCtx.clearRect(0, 0, sw, sh);
        sCtx.save();
        sCtx.scale(sw / Math.max(1, layerBox.width), sh / Math.max(1, layerBox.height));
        this.drawLayerContentCore(sCtx, cmd);
        sCtx.restore();
        sCtx.globalCompositeOperation = 'destination-in';
        sCtx.drawImage(this.maskScratch, 0, 0, sw, sh);
        sCtx.restore();
      }

      ctx.save();
      ctx.globalAlpha = effectiveAlpha;
      ctx.globalCompositeOperation = mapBlendModeToCompositeOp(cmd.blendMode);

      // Transformación alrededor del punto de anclaje `(anchorPoint.x, anchorPoint.y)`
      ctx.translate(anchorPoint.x, anchorPoint.y);
      if (geometry.rotationDeg !== 0) {
        ctx.rotate((geometry.rotationDeg * Math.PI) / 180);
      }
      const localOffsetX = layerBox.x - anchorPoint.x;
      const localOffsetY = layerBox.y - anchorPoint.y;
      ctx.translate(localOffsetX, localOffsetY);

      if (geometry.flipH || geometry.flipV) {
        ctx.translate(
          geometry.flipH ? layerBox.width : 0,
          geometry.flipV ? layerBox.height : 0
        );
        ctx.scale(geometry.flipH ? -1 : 1, geometry.flipV ? -1 : 1);
      }

      // Sombra exterior dibujada ANTES del recorte (respetando shadowOpacity y evitando halo negro con feather/alfa)
      if (geometry.shadowBlurPx > 0 && style.shadowOpacity > 0.005) {
        const [sr, sg, sb, sa] = parseCssColorRgba(style.shadowColor);
        const resolvedShadowCss = `rgba(${Math.round(sr * 255)}, ${Math.round(sg * 255)}, ${Math.round(
          sb * 255
        )}, ${(sa * style.shadowOpacity).toFixed(3)})`;
        ctx.save();
        ctx.shadowColor = resolvedShadowCss;
        ctx.shadowBlur = geometry.shadowBlurPx;
        if (useOffscreenFeather && this.layerScratch) {
          ctx.drawImage(this.layerScratch, 0, 0, layerBox.width, layerBox.height);
        } else if (geometry.featherPx <= 0.25 && !cmd.hasTransparentAlpha) {
          ctx.fillStyle = resolvedShadowCss;
          traceMaskPathOn2dContext(
            ctx,
            layerBox.width,
            layerBox.height,
            style.maskShape,
            geometry.borderRadiusPx
          );
          ctx.fill();
        }
        ctx.restore();
      }

      if (useOffscreenFeather && this.layerScratch) {
        ctx.drawImage(this.layerScratch, 0, 0, layerBox.width, layerBox.height);
      } else {
        // Recorte con máscara limpia (sin halos)
        ctx.save();
        traceMaskPathOn2dContext(
          ctx,
          layerBox.width,
          layerBox.height,
          style.maskShape,
          geometry.borderRadiusPx
        );
        ctx.clip();
        this.drawLayerContentCore(ctx, cmd);
        ctx.restore();
      }

      // Borde nítido en el contorno exacto de la máscara cuando está habilitado
      if (geometry.borderWidthPx > 0) {
        traceMaskPathOn2dContext(
          ctx,
          layerBox.width,
          layerBox.height,
          style.maskShape,
          geometry.borderRadiusPx
        );
        ctx.strokeStyle = style.borderColor;
        ctx.lineWidth = geometry.borderWidthPx;
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  pruneUnusedSources(activeSourceIds: Set<string>): void {
    this.staticGraphicCache.prune(activeSourceIds);
  }

  invalidateAllTextures(): void {
    this.staticGraphicCache.clear();
  }

  getStats(): { textureUploadsCount: number; cachedTexturesCount: number } {
    return { textureUploadsCount: 0, cachedTexturesCount: 0 };
  }

  dispose(): void {
    this.staticGraphicCache.clear();
    this.outgoingScratch = null;
    this.outgoingScratchCtx = null;
    this.incomingScratch = null;
    this.incomingScratchCtx = null;
    this.layerScratch = null;
    this.layerScratchCtx = null;
    this.maskScratch = null;
    this.maskScratchCtx = null;
    this.cachedFeatherMaskKey = '';
    this.ctx = null;
    this.surface = null;
  }
}

// ============================================================================
// UTILIDADES DE PLANIFICACIÓN Y PROGRAM COMPOSITOR
// ============================================================================

interface CachedFrameSurface {
  surface: TexImageSourceLike;
  width: number;
  height: number;
  capturedAt: number;
  signature: string;
}

interface VideoFrameTrackerEntry {
  videoEl: unknown;
  frameSeq: number;
  cancelCallback?: () => void;
}

function createDefaultFrameScheduler(): FrameSchedulerAdapter {
  if (typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function') {
    return {
      requestFrame: (cb) => requestAnimationFrame(cb),
      cancelFrame: (id) => cancelAnimationFrame(id),
    };
  }
  return {
    requestFrame: (cb) => setTimeout(() => cb(Date.now()), 16) as unknown as number,
    cancelFrame: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
  };
}

function isSurfaceReady(
  source: StudioSource,
  entry: SourceRuntimeEntry | undefined,
  processedOverride?: ProcessedLayerSurface
): { ready: boolean; surface: TexImageSourceLike | null; width: number; height: number } {
  if (processedOverride && processedOverride.width > 0 && processedOverride.height > 0) {
    return {
      ready: true,
      surface: processedOverride.surface,
      width: processedOverride.width,
      height: processedOverride.height,
    };
  }

  if (source.kind === 'color' || source.kind === 'gradient' || source.kind === 'text') {
    return {
      ready: true,
      surface: null,
      width: entry?.state.intrinsicWidth || 1920,
      height: entry?.state.intrinsicHeight || 1080,
    };
  }

  if (!entry || entry.state.status !== 'live') {
    return { ready: false, surface: null, width: 0, height: 0 };
  }

  if (source.kind === 'image') {
    const img = entry.resources.imageElement as unknown as TexImageSourceLike | null;
    const w = img?.naturalWidth || img?.width || entry.state.intrinsicWidth;
    const h = img?.naturalHeight || img?.height || entry.state.intrinsicHeight;
    if (img && w > 0 && h > 0) {
      return { ready: true, surface: img, width: w, height: h };
    }
    return { ready: false, surface: null, width: 0, height: 0 };
  }

  const video = entry.resources.videoElement as unknown as TexImageSourceLike | null;
  if (video) {
    const readyState = video.readyState ?? 2;
    const w = video.videoWidth || entry.state.intrinsicWidth;
    const h = video.videoHeight || entry.state.intrinsicHeight;
    if (readyState >= 2 && w > 0 && h > 0) {
      return { ready: true, surface: video, width: w, height: h };
    }
  }

  return { ready: false, surface: null, width: 0, height: 0 };
}

export class ProgramCompositor {
  private readonly surface: ProgramSurfaceLike;
  private readonly backend: CompositorRenderBackend;
  private readonly scheduler: FrameSchedulerAdapter;
  private readonly now: () => number;

  private outputWidth: number;
  private outputHeight: number;
  private targetFps: CompositorTargetFps;
  private unavailableSourcePolicy: UnavailableSourcePolicy;
  private lastFrameHoldMaxMs: number;

  private activeScene: StudioScene | null = null;
  private outgoingScene: StudioScene | null = null;
  private activeTransition: ActiveTransitionState | null = null;

  private projectSources = new Map<string, StudioSource>();
  private runtimeEntries = new Map<string, SourceRuntimeEntry>();
  private processedSurfaces = new Map<string, ProcessedLayerSurface>();
  private lastAvailableFrames = new Map<string, CachedFrameSurface>();
  private videoFrameTrackers = new Map<string, VideoFrameTrackerEntry>();

  private latestDiagnostics: LayerDiagnosticItem[] = [];
  private loopHandle: number | null = null;
  private isRunning = false;
  private disposed = false;

  private renderedFrames = 0;
  private droppedOrSkippedTicks = 0;
  private lastRenderAt = 0;
  private lastRenderDurationMs = 0;
  private effectiveFps = 0;

  private onFrameRendered?: (stats: CompositorFrameStats) => void;
  private onTransitionComplete?: (outgoingSceneId: string, incomingSceneId: string) => void;

  constructor(options: ProgramCompositorOptions) {
    this.surface = options.surface;
    this.outputWidth = Math.max(1, options.width ?? INITIAL_PROGRAM_PROFILE.width);
    this.outputHeight = Math.max(1, options.height ?? INITIAL_PROGRAM_PROFILE.height);
    this.targetFps = options.fps ?? INITIAL_PROGRAM_PROFILE.fps;
    this.unavailableSourcePolicy = options.unavailableSourcePolicy ?? 'last-frame';
    this.lastFrameHoldMaxMs = options.lastFrameHoldMaxMs ?? 3000;
    this.scheduler = options.scheduler ?? createDefaultFrameScheduler();
    this.now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.onFrameRendered = options.onFrameRendered;
    this.onTransitionComplete = options.onTransitionComplete;

    if (options.customBackend) {
      this.backend = options.customBackend;
      this.backend.initialize(this.surface, this.outputWidth, this.outputHeight);
    } else if (options.preferredBackend === 'canvas2d') {
      this.backend = new Canvas2dCompositorBackend();
      this.backend.initialize(this.surface, this.outputWidth, this.outputHeight);
    } else {
      const glBackend = new Webgl2CompositorBackend(options.onContextLostChange);
      if (glBackend.initialize(this.surface, this.outputWidth, this.outputHeight)) {
        this.backend = glBackend;
      } else {
        glBackend.dispose();
        const c2d = new Canvas2dCompositorBackend();
        c2d.initialize(this.surface, this.outputWidth, this.outputHeight);
        this.backend = c2d;
      }
    }
  }

  // --------------------------------------------------------------------------
  // CONFIGURACIÓN Y CONTINUIDAD DE SUPERFICIE / ESCENAS
  // --------------------------------------------------------------------------

  getProgramSurface(): ProgramSurfaceLike {
    return this.surface;
  }

  getBackendKind(): CompositorBackendKind {
    return this.backend.kind;
  }

  setOutputResolution(width: number, height: number): void {
    const nextW = Math.max(1, Math.round(width));
    const nextH = Math.max(1, Math.round(height));
    if (nextW === this.outputWidth && nextH === this.outputHeight) return;
    this.outputWidth = nextW;
    this.outputHeight = nextH;
    this.backend.resize(nextW, nextH);
  }

  setTargetFps(fps: CompositorTargetFps): void {
    this.targetFps = fps;
  }

  setUnavailableSourcePolicy(policy: UnavailableSourcePolicy): void {
    this.unavailableSourcePolicy = policy;
  }

  setSceneData(
    scene: StudioScene,
    sources: StudioSource[],
    runtimeEntries?: Map<string, SourceRuntimeEntry> | SourceRuntimeEntry[]
  ): void {
    this.activeScene = scene;
    this.syncSourcesAndRuntime(sources, runtimeEntries);
  }

  syncSourcesAndRuntime(
    sources: StudioSource[],
    runtimeEntries?: Map<string, SourceRuntimeEntry> | SourceRuntimeEntry[]
  ): void {
    this.projectSources.clear();
    for (const s of sources) {
      this.projectSources.set(s.id, s);
    }

    if (runtimeEntries) {
      this.runtimeEntries.clear();
      if (Array.isArray(runtimeEntries)) {
        for (const entry of runtimeEntries) {
          this.runtimeEntries.set(entry.source.id, entry);
        }
      } else {
        for (const [id, entry] of runtimeEntries.entries()) {
          this.runtimeEntries.set(id, entry);
        }
      }
    }

    // Registrar callback ligero de fotogramas nuevos en elementos de vídeo activos
    for (const [sourceId, entry] of this.runtimeEntries.entries()) {
      const videoEl = entry.resources.videoElement;
      if (videoEl) {
        this.ensureVideoFrameTracker(sourceId, videoEl);
      }
    }
  }

  /**
   * Contrato para inyectar fotogramas procesados con transparencia alfa (e.g. presentador sin fondo)
   * por `layerId` o `sourceId` sin acoplar el compositor a MediaPipe.
   */
  setProcessedLayerSurface(layerOrSourceKey: string, frame: ProcessedLayerSurface | null): void {
    if (!frame) {
      this.processedSurfaces.delete(layerOrSourceKey);
      return;
    }
    this.processedSurfaces.set(layerOrSourceKey, frame);
  }

  /**
   * Inicia un cambio de escena conservando la misma superficie `ProgramCanvas`
   * y protegiendo las fuentes salientes durante una transición `fade`.
   */
  transitionToScene(
    nextScene: StudioScene,
    transitionOverride?: Partial<Pick<SceneTransition, 'type' | 'durationMs'>>
  ): void {
    const requestedType = transitionOverride?.type ?? nextScene.transition.type;
    const transitionType: 'cut' | 'fade' = requestedType === 'fade' ? 'fade' : 'cut';
    const durationMs = Math.max(0, transitionOverride?.durationMs ?? nextScene.transition.durationMs);

    if (!this.activeScene || transitionType === 'cut' || durationMs <= 0) {
      const prevId = this.activeScene?.id ?? null;
      this.outgoingScene = null;
      this.activeTransition = null;
      this.activeScene = nextScene;
      this.pruneUnusedResources();
      if (prevId && prevId !== nextScene.id) {
        this.onTransitionComplete?.(prevId, nextScene.id);
      }
      return;
    }

    this.outgoingScene = this.activeScene;
    this.activeScene = nextScene;
    this.activeTransition = {
      type: 'fade',
      fromSceneId: this.outgoingScene.id,
      toSceneId: nextScene.id,
      startedAt: this.now(),
      durationMs,
      progress: 0,
    };
  }

  getActiveTransition(): ActiveTransitionState | null {
    return this.activeTransition ? { ...this.activeTransition } : null;
  }

  /**
   * Devuelve todos los `sourceId` necesarios actualmente por la composición:
   * incluye la escena saliente mientras dure una transición `fade`.
   */
  getRequiredSourceIds(): string[] {
    const ids = new Set<string>();
    if (this.activeScene) {
      for (const layer of this.activeScene.layers) ids.add(layer.sourceId);
    }
    if (this.outgoingScene && this.activeTransition) {
      for (const layer of this.outgoingScene.layers) ids.add(layer.sourceId);
    }
    return Array.from(ids);
  }

  // --------------------------------------------------------------------------
  // BUCLE TEMPORAL CONTROLADO (ÚNICA INSTANCIA ACTIVA)
  // --------------------------------------------------------------------------

  start(): boolean {
    if (this.disposed || this.isRunning) return false;
    this.isRunning = true;

    const tick = () => {
      if (!this.isRunning || this.disposed) return;
      this.step();
      if (this.isRunning && !this.disposed) {
        this.loopHandle = this.scheduler.requestFrame(tick);
      }
    };

    this.loopHandle = this.scheduler.requestFrame(tick);
    return true;
  }

  stop(): void {
    this.isRunning = false;
    if (this.loopHandle !== null) {
      this.scheduler.cancelFrame(this.loopHandle);
      this.loopHandle = null;
    }
  }

  isLoopRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Evalúa un tick temporal respetando `targetFps` mediante tiempo real transcurrido.
   * Devuelve `true` si se renderizó un nuevo fotograma de composición.
   */
  step(forceRender = false): boolean {
    if (this.disposed || !this.activeScene) return false;

    const timestamp = this.now();
    const frameIntervalMs = 1000 / this.targetFps;

    if (!forceRender && this.lastRenderAt > 0 && timestamp - this.lastRenderAt < frameIntervalMs) {
      this.droppedOrSkippedTicks += 1;
      return false;
    }

    return this.renderFrameAt(timestamp);
  }

  renderFrameNow(): boolean {
    if (this.disposed || !this.activeScene) return false;
    return this.renderFrameAt(this.now());
  }

  private renderFrameAt(timestamp: number): boolean {
    if (!this.activeScene) return false;
    const renderStart = this.now();

    if (this.lastRenderAt > 0) {
      const dt = Math.max(1, timestamp - this.lastRenderAt);
      this.effectiveFps = Math.round((1000 / dt) * 10) / 10;
    }
    this.lastRenderAt = timestamp;

    if (this.activeTransition && this.outgoingScene) {
      const elapsed = Math.max(0, timestamp - this.activeTransition.startedAt);
      const rawProgress =
        this.activeTransition.durationMs > 0
          ? clamp(elapsed / this.activeTransition.durationMs, 0, 1)
          : 1;
      this.activeTransition.progress = rawProgress;

      const outgoingPlan = this.buildSceneRenderPlan(this.outgoingScene, timestamp);
      const incomingPlan = this.buildSceneRenderPlan(this.activeScene, timestamp);

      this.backend.renderFadeTransition(outgoingPlan, incomingPlan, rawProgress);
      this.latestDiagnostics = incomingPlan.diagnostics;

      if (rawProgress >= 1) {
        const finishedFrom = this.outgoingScene.id;
        const finishedTo = this.activeScene.id;
        this.outgoingScene = null;
        this.activeTransition = null;
        this.pruneUnusedResources();
        this.onTransitionComplete?.(finishedFrom, finishedTo);
      }
    } else {
      const plan = this.buildSceneRenderPlan(this.activeScene, timestamp);
      this.backend.renderScene(plan);
      this.latestDiagnostics = plan.diagnostics;
    }

    this.renderedFrames += 1;
    this.lastRenderDurationMs = Math.max(0, this.now() - renderStart);
    this.onFrameRendered?.(this.getStats());
    return true;
  }

  // --------------------------------------------------------------------------
  // GENERACIÓN DEL PLAN DE ESCENA (SOLO CAPAS VISIBLES DE PROGRAMA)
  // --------------------------------------------------------------------------

  buildSceneRenderPlan(scene: StudioScene, timestamp = this.now()): SceneRenderPlan {
    const sortedLayers = scene.layers
      .map((layer, index) => ({ layer, index }))
      .sort((a, b) =>
        a.layer.zIndex !== b.layer.zIndex ? a.layer.zIndex - b.layer.zIndex : a.index - b.index
      );

    const commands: LayerRenderCommand[] = [];
    const diagnostics: LayerDiagnosticItem[] = [];

    for (const { layer } of sortedLayers) {
      const source = this.projectSources.get(layer.sourceId);
      const entry = this.runtimeEntries.get(layer.sourceId);

      // Fuentes de audio nunca se renderizan como capas visuales
      if (source && !isVisualSourceKind(source.kind)) {
        diagnostics.push({
          layerId: layer.id,
          sourceId: layer.sourceId,
          sourceKind: source.kind,
          sourceStatus: entry?.state.status ?? 'idle',
          rendered: false,
          usingCachedFrame: false,
          appliedFallback: 'hidden',
          intrinsicWidth: 0,
          intrinsicHeight: 0,
        });
        continue;
      }

      if (!layer.visible || layer.style.opacity <= 0.001) {
        diagnostics.push({
          layerId: layer.id,
          sourceId: layer.sourceId,
          sourceKind: source?.kind ?? 'missing',
          sourceStatus: entry?.state.status ?? 'missing',
          rendered: false,
          usingCachedFrame: false,
          appliedFallback: 'hidden',
          intrinsicWidth: entry?.state.intrinsicWidth ?? 0,
          intrinsicHeight: entry?.state.intrinsicHeight ?? 0,
        });
        continue;
      }

      if (!source) {
        diagnostics.push({
          layerId: layer.id,
          sourceId: layer.sourceId,
          sourceKind: 'missing',
          sourceStatus: 'missing',
          rendered: false,
          usingCachedFrame: false,
          appliedFallback: 'hidden',
          intrinsicWidth: 0,
          intrinsicHeight: 0,
        });
        continue;
      }

      const processed =
        this.processedSurfaces.get(layer.id) ?? this.processedSurfaces.get(source.id);
      const availability = isSurfaceReady(source, entry, processed);

      let finalSurface = availability.surface;
      let width = availability.width;
      let height = availability.height;
      let usingCachedFrame = false;
      let fallbackMode: 'none' | 'neutral-placeholder' = 'none';
      let appliedDiag: LayerDiagnosticItem['appliedFallback'] = 'none';

      if (availability.ready) {
        const frameSig = this.computeFrameSignature(source, availability.surface, processed);
        if (availability.surface) {
          this.lastAvailableFrames.set(source.id, {
            surface: availability.surface,
            width,
            height,
            capturedAt: timestamp,
            signature: frameSig,
          });
        }
      } else {
        const cached = this.lastAvailableFrames.get(source.id);
        const canUseLastFrame =
          this.unavailableSourcePolicy === 'last-frame' &&
          cached &&
          timestamp - cached.capturedAt <= this.lastFrameHoldMaxMs;

        if (canUseLastFrame && cached) {
          finalSurface = cached.surface;
          width = cached.width;
          height = cached.height;
          usingCachedFrame = true;
          appliedDiag = 'last-frame';
        } else if (this.unavailableSourcePolicy === 'neutral-placeholder') {
          width = this.outputWidth;
          height = this.outputHeight;
          fallbackMode = 'neutral-placeholder';
          appliedDiag = 'neutral-placeholder';
        } else {
          diagnostics.push({
            layerId: layer.id,
            sourceId: source.id,
            sourceKind: source.kind,
            sourceStatus: entry?.state.status ?? 'idle',
            rendered: false,
            usingCachedFrame: false,
            appliedFallback: 'hidden',
            intrinsicWidth: entry?.state.intrinsicWidth ?? 0,
            intrinsicHeight: entry?.state.intrinsicHeight ?? 0,
          });
          continue;
        }
      }

      const geometry = computeLayerRenderGeometry(
        layer,
        width,
        height,
        this.outputWidth,
        this.outputHeight
      );

      const graphic: RenderableGraphicContent | undefined =
        source.kind === 'color'
          ? { kind: 'color', color: source }
          : source.kind === 'gradient'
            ? { kind: 'gradient', gradient: source }
            : source.kind === 'text'
              ? { kind: 'text', text: source }
              : undefined;

      const alphaMode: AlphaCompositionMode = processed?.alphaMode ?? 'straight';
      const frameSignature =
        fallbackMode === 'neutral-placeholder'
          ? 'placeholder'
          : this.computeFrameSignature(source, finalSurface, processed);

      commands.push({
        layerId: layer.id,
        sourceId: source.id,
        sourceKind: source.kind,
        zIndex: layer.zIndex,
        geometry,
        style: { ...layer.style },
        opacity: layer.style.opacity,
        blendMode: layer.style.blendMode,
        alphaMode,
        hasTransparentAlpha: Boolean(processed?.hasTransparentSubject),
        surface: finalSurface,
        graphic,
        frameSignature,
        usingCachedFrame,
        unavailableFallbackMode: fallbackMode,
      });

      diagnostics.push({
        layerId: layer.id,
        sourceId: source.id,
        sourceKind: source.kind,
        sourceStatus: entry?.state.status ?? 'idle',
        rendered: true,
        usingCachedFrame,
        appliedFallback: appliedDiag,
        intrinsicWidth: width,
        intrinsicHeight: height,
      });
    }

    return {
      sceneId: scene.id,
      backgroundColor: scene.backgroundColor || '#06070a',
      outputWidth: this.outputWidth,
      outputHeight: this.outputHeight,
      layers: commands,
      diagnostics,
    };
  }

  private computeFrameSignature(
    source: StudioSource,
    surface: TexImageSourceLike | null,
    processed?: ProcessedLayerSurface
  ): string {
    if (processed?.frameVersion !== undefined) {
      return `proc_${processed.frameVersion}`;
    }
    if (source.kind === 'color' || source.kind === 'gradient' || source.kind === 'text') {
      return `gfx_${JSON.stringify(source)}`;
    }
    const videoTracker = this.videoFrameTrackers.get(source.id);
    if (videoTracker && videoTracker.frameSeq > 0) {
      return `vseq_${videoTracker.frameSeq}`;
    }
    if (surface && typeof surface.currentTime === 'number') {
      return `ctime_${surface.currentTime.toFixed(4)}`;
    }
    if (source.kind === 'image') {
      return `img_${source.assetRef}`;
    }
    return `live_${source.id}_${this.renderedFrames}`;
  }

  private ensureVideoFrameTracker(sourceId: string, videoEl: unknown): void {
    const existing = this.videoFrameTrackers.get(sourceId);
    if (existing && existing.videoEl === videoEl) return;
    if (existing?.cancelCallback) {
      existing.cancelCallback();
    }

    const tracker: VideoFrameTrackerEntry = {
      videoEl,
      frameSeq: 0,
    };

    const withRvfc = videoEl as {
      requestVideoFrameCallback?: (cb: () => void) => number;
      cancelVideoFrameCallback?: (id: number) => void;
    };

    if (typeof withRvfc.requestVideoFrameCallback === 'function') {
      let handle = 0;
      let cancelled = false;
      const onFrame = () => {
        if (cancelled || this.disposed) return;
        tracker.frameSeq += 1;
        handle = withRvfc.requestVideoFrameCallback!(onFrame);
      };
      handle = withRvfc.requestVideoFrameCallback(onFrame);
      tracker.cancelCallback = () => {
        cancelled = true;
        withRvfc.cancelVideoFrameCallback?.(handle);
      };
    }

    this.videoFrameTrackers.set(sourceId, tracker);
  }

  // --------------------------------------------------------------------------
  // DIAGNÓSTICO, ESTADÍSTICAS Y LIMPIEZA DETERMINISTA
  // --------------------------------------------------------------------------

  getDiagnostics(): LayerDiagnosticItem[] {
    return this.latestDiagnostics.map((d) => ({ ...d }));
  }

  getStats(): CompositorFrameStats {
    const backendStats = this.backend.getStats();
    return {
      renderedFrames: this.renderedFrames,
      droppedOrSkippedTicks: this.droppedOrSkippedTicks,
      lastRenderAt: this.lastRenderAt,
      lastRenderDurationMs: this.lastRenderDurationMs,
      effectiveFps: this.effectiveFps,
      targetFps: this.targetFps,
      outputWidth: this.outputWidth,
      outputHeight: this.outputHeight,
      backendKind: this.backend.kind,
      contextLost: this.backend.isContextLost,
      textureUploadsCount: backendStats.textureUploadsCount,
      cachedTexturesCount: backendStats.cachedTexturesCount,
    };
  }

  pruneUnusedResources(): void {
    const activeIds = new Set(this.getRequiredSourceIds());
    this.backend.pruneUnusedSources(activeIds);

    for (const id of Array.from(this.lastAvailableFrames.keys())) {
      if (!activeIds.has(id)) {
        this.lastAvailableFrames.delete(id);
      }
    }
    for (const [id, tracker] of Array.from(this.videoFrameTrackers.entries())) {
      if (!activeIds.has(id)) {
        tracker.cancelCallback?.();
        this.videoFrameTrackers.delete(id);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();

    for (const tracker of this.videoFrameTrackers.values()) {
      tracker.cancelCallback?.();
    }
    this.videoFrameTrackers.clear();
    this.lastAvailableFrames.clear();
    this.processedSurfaces.clear();
    this.runtimeEntries.clear();
    this.projectSources.clear();
    this.activeScene = null;
    this.outgoingScene = null;
    this.activeTransition = null;

    // Nunca detiene MediaStreams/tracks pertenecientes a SourceManager
    this.backend.dispose();
  }
}
