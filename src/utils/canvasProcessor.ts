import {
  VIRTUAL_BACKGROUNDS,
  type BackgroundSegmentationSettings,
  type ColorAdjustments,
  type FilterPresetId,
  type FocusSettings,
  type FrameFitMode,
  type OverlayBranding,
  type RotationDeg,
  type ScreenLayoutMode,
  type StabilizationSettings,
  type VisualEffectId,
} from '../types/camera';
import { segmentSubjectWithAi, setAiSegmentationSource, reportAiSegmentationFailure } from './aiVision';
import { applySubjectAlpha } from './subjectMatte';
import { applyWebglColorFilter, applyWebglVisualEffect } from './webglEffects';

export interface RenderPipelineOptions {
  width: number;
  height: number;
  mirror: boolean;
  flipVertical: boolean;
  rotation?: RotationDeg;
  fitMode: FrameFitMode;
  zoom: number;
  panX: number; // -1 to 1
  panY: number; // -1 to 1
  filterId: FilterPresetId;
  effectId: VisualEffectId;
  adjustments: ColorAdjustments;
  focus: FocusSettings;
  stabilization: StabilizationSettings;
  background: BackgroundSegmentationSettings;
  branding: OverlayBranding;
  abSplitEnabled: boolean;
  abSplitPosition: number; // 0 to 1
  screenLayout?: ScreenLayoutMode;
  pipCorner?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  pipSizeRatio?: number; // e.g. 0.24
  pipCircular?: boolean;
  /** True only for the isolated camera surface managed by Studio. */
  cameraOnlyAlpha?: boolean;
}

// Reusable offscreen buffers to prevent per-frame allocation
let workCanvas: HTMLCanvasElement | null = null;
let workCtx: CanvasRenderingContext2D | null = null;
let rawCanvas: HTMLCanvasElement | null = null;
let rawCtx: CanvasRenderingContext2D | null = null;
let pixelCanvas: HTMLCanvasElement | null = null;
let pixelCtx: CanvasRenderingContext2D | null = null;
let blurCanvas: HTMLCanvasElement | null = null;
let blurCtx: CanvasRenderingContext2D | null = null;
let rotCanvas: HTMLCanvasElement | null = null;
let rotCtx: CanvasRenderingContext2D | null = null;

export function getAlignedRawCanvas(): HTMLCanvasElement | null {
  return rawCanvas;
}

function ensureBuffers(width: number, height: number) {
  if (!workCanvas) {
    workCanvas = document.createElement('canvas');
    workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (workCanvas.width !== width || workCanvas.height !== height) {
    workCanvas.width = width;
    workCanvas.height = height;
  }

  if (!rawCanvas) {
    rawCanvas = document.createElement('canvas');
    rawCtx = rawCanvas.getContext('2d');
  }
  if (rawCanvas.width !== width || rawCanvas.height !== height) {
    rawCanvas.width = width;
    rawCanvas.height = height;
  }

  if (!pixelCanvas) {
    pixelCanvas = document.createElement('canvas');
    pixelCtx = pixelCanvas.getContext('2d');
  }

  if (!blurCanvas) {
    blurCanvas = document.createElement('canvas');
    blurCtx = blurCanvas.getContext('2d');
  }
  if (blurCanvas.width !== width || blurCanvas.height !== height) {
    blurCanvas.width = width;
    blurCanvas.height = height;
  }

  return { workCanvas, workCtx, rawCanvas, rawCtx, pixelCanvas, pixelCtx, blurCanvas, blurCtx };
}

export function buildCssFilterString(
  filterId: FilterPresetId,
  adjustments: ColorAdjustments
): string {
  const b = 100 + adjustments.brightness; // 50..150
  const c = 100 + adjustments.contrast; // 50..150
  const s = Math.max(0, 100 + adjustments.saturation); // 0..200

  let filterStr = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;

  if (adjustments.softSkin > 0) {
    const blurPx = (adjustments.softSkin / 100) * 1.4;
    filterStr += ` blur(${blurPx.toFixed(2)}px)`;
  }

  if (adjustments.temperature > 0) {
    const sepiaAmt = Math.min(35, adjustments.temperature * 0.65);
    filterStr += ` sepia(${sepiaAmt.toFixed(0)}%)`;
  } else if (adjustments.temperature < 0) {
    const hueShift = adjustments.temperature * 0.35;
    filterStr += ` hue-rotate(${hueShift.toFixed(1)}deg)`;
  }

  switch (filterId) {
    case 'ig-clarendon':
      filterStr += ' contrast(122%) saturate(126%) brightness(103%)';
      break;
    case 'ig-juno':
      filterStr += ' contrast(118%) saturate(134%) sepia(10%)';
      break;
    case 'ig-lark':
      filterStr += ' brightness(109%) contrast(95%) saturate(92%)';
      break;
    case 'ig-valencia':
      filterStr += ' sepia(18%) brightness(105%) contrast(98%) saturate(112%)';
      break;
    case 'ig-nashville':
      filterStr += ' sepia(24%) contrast(104%) brightness(105%) saturate(118%)';
      break;
    case 'ig-aden':
      filterStr += ' contrast(88%) brightness(106%) saturate(82%) sepia(12%)';
      break;
    case 'ig-hudson':
      filterStr += ' contrast(116%) brightness(104%) saturate(95%) hue-rotate(-8deg)';
      break;
    case 'ig-slumber':
      filterStr += ' contrast(90%) brightness(103%) saturate(78%) sepia(20%)';
      break;
    case 'leica-bw':
      filterStr += ' grayscale(100%) contrast(136%) brightness(98%)';
      break;
    case 'kodak-portra':
      filterStr += ' sepia(16%) saturate(116%) contrast(106%) brightness(104%)';
      break;
    case 'teal-orange':
      filterStr += ' contrast(120%) saturate(126%)';
      break;
    case 'cine-2383':
      filterStr += ' contrast(128%) saturate(118%) brightness(98%)';
      break;
    case 'cine-dune':
      filterStr += ' sepia(36%) contrast(114%) saturate(88%)';
      break;
    case 'cine-matrix':
      filterStr += ' contrast(120%) saturate(82%) hue-rotate(42deg)';
      break;
    case 'cine-neon':
      filterStr += ' contrast(124%) saturate(136%)';
      break;
    case 'vivid-pro':
      filterStr += ' contrast(114%) saturate(135%) brightness(103%)';
      break;
    case 'matte-film':
      filterStr += ' contrast(86%) brightness(107%) saturate(85%) sepia(10%)';
      break;
    case 'sepia-vintage':
      filterStr += ' sepia(88%) contrast(108%) brightness(96%)';
      break;
    case 'cyanotype':
      filterStr += ' grayscale(100%) contrast(125%)';
      break;
    case 'document-scan':
      filterStr += ' grayscale(100%) contrast(175%) brightness(112%)';
      break;
    default:
      break;
  }

  return filterStr;
}

// Stabilization inter-frame motion tracking buffers
const STAB_W = 80;
const STAB_H = 45;
let stabCanvas: HTMLCanvasElement | null = null;
let stabCtx: CanvasRenderingContext2D | null = null;
let prevStabLum: Float32Array | null = null;
let stabCompX = 0; // Normalized fraction of frame width
let stabCompY = 0; // Normalized fraction of frame height

export function resetStabilizationState() {
  prevStabLum = null;
  stabCompX = 0;
  stabCompY = 0;
}

function updateStabilizationDisplacement(
  source: HTMLVideoElement | HTMLCanvasElement,
  strength: number
): { compX: number; compY: number; overscan: number } {
  if (!stabCanvas) {
    stabCanvas = document.createElement('canvas');
    stabCanvas.width = STAB_W;
    stabCanvas.height = STAB_H;
    stabCtx = stabCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!stabCtx) return { compX: 0, compY: 0, overscan: 1 };

  stabCtx.drawImage(source, 0, 0, STAB_W, STAB_H);
  const data = stabCtx.getImageData(0, 0, STAB_W, STAB_H).data;
  const currLum = new Float32Array(STAB_W * STAB_H);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    currLum[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  const strengthNorm = Math.max(0.2, Math.min(1, strength / 100));
  const maxShiftNorm = 0.045 * strengthNorm; // Safe overscan margin
  const overscan = 1 + maxShiftNorm * 2.1;

  if (!prevStabLum) {
    prevStabLum = currLum;
    return { compX: 0, compY: 0, overscan };
  }

  // Fast 2D SAD block matching on central ROI (excluding outer border)
  const roiX0 = 12;
  const roiX1 = STAB_W - 12;
  const roiY0 = 8;
  const roiY1 = STAB_H - 8;
  const maxSearchX = 6;
  const maxSearchY = 4;

  let bestDx = 0;
  let bestDy = 0;
  let bestSad = Infinity;

  // Coarse step-2 pass
  for (let dy = -maxSearchY; dy <= maxSearchY; dy += 2) {
    for (let dx = -maxSearchX; dx <= maxSearchX; dx += 2) {
      let sad = 0;
      for (let y = roiY0; y < roiY1; y += 2) {
        const rowCurr = y * STAB_W;
        const rowPrev = (y - dy) * STAB_W;
        for (let x = roiX0; x < roiX1; x += 2) {
          sad += Math.abs(currLum[rowCurr + x] - prevStabLum[rowPrev + (x - dx)]);
        }
      }
      if (sad < bestSad) {
        bestSad = sad;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  // Fine ±1 refinement pass around coarse minimum
  const cDx = bestDx;
  const cDy = bestDy;
  for (let dy = cDy - 1; dy <= cDy + 1; dy++) {
    if (dy < -maxSearchY || dy > maxSearchY) continue;
    for (let dx = cDx - 1; dx <= cDx + 1; dx++) {
      if (dx < -maxSearchX || dx > maxSearchX) continue;
      let sad = 0;
      for (let y = roiY0; y < roiY1; y++) {
        const rowCurr = y * STAB_W;
        const rowPrev = (y - dy) * STAB_W;
        for (let x = roiX0; x < roiX1; x++) {
          sad += Math.abs(currLum[rowCurr + x] - prevStabLum[rowPrev + (x - dx)]);
        }
      }
      if (sad < bestSad) {
        bestSad = sad;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  prevStabLum = currLum;

  // Compensatory shift is opposite to inter-frame motion (dx, dy)
  const deltaNormX = -bestDx / STAB_W;
  const deltaNormY = -bestDy / STAB_H;

  // High-pass spring-damper filter: cancels shake while gently recentering on intentional pans
  const damping = 0.84;
  const gain = 0.78 * strengthNorm;
  stabCompX = Math.max(-maxShiftNorm, Math.min(maxShiftNorm, stabCompX * damping + deltaNormX * gain));
  stabCompY = Math.max(-maxShiftNorm, Math.min(maxShiftNorm, stabCompY * damping + deltaNormY * gain));

  return { compX: stabCompX, compY: stabCompY, overscan };
}

// Real-time Background Segmentation buffers
const SEG_W = 160;
const SEG_H = 90;
let segSampleCanvas: HTMLCanvasElement | null = null;
let segSampleCtx: CanvasRenderingContext2D | null = null;
let segMaskCanvas: HTMLCanvasElement | null = null;
let segMaskCtx: CanvasRenderingContext2D | null = null;
let segFgCanvas: HTMLCanvasElement | null = null;
let segFgCtx: CanvasRenderingContext2D | null = null;
let prevSegMask: Float32Array | null = null;
let calibratedBgYCbCr: Float32Array | null = null;
let requestCalibrateNextFrame = false;

const bgImageCache = new Map<string, HTMLImageElement>();

function getLoadedBackgroundImage(src: string): HTMLImageElement | null {
  let img = bgImageCache.get(src);
  if (!img) {
    img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    bgImageCache.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export function triggerBackgroundCalibration() {
  requestCalibrateNextFrame = true;
}

export function clearBackgroundCalibration() {
  calibratedBgYCbCr = null;
  prevSegMask = null;
}

function rgbToYCbCr(r: number, g: number, b: number): [number, number, number] {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return [y, cb, cr];
}

function applyBackgroundSegmentation(
  rawSourceCanvas: HTMLCanvasElement,
  filteredWorkCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bg: BackgroundSegmentationSettings,
  onCalibrated?: () => void
) {
  if (!segSampleCanvas) {
    segSampleCanvas = document.createElement('canvas');
    segSampleCanvas.width = SEG_W;
    segSampleCanvas.height = SEG_H;
    segSampleCtx = segSampleCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!segMaskCanvas) {
    segMaskCanvas = document.createElement('canvas');
    segMaskCanvas.width = SEG_W;
    segMaskCanvas.height = SEG_H;
    segMaskCtx = segMaskCanvas.getContext('2d');
  }
  if (!segFgCanvas) {
    segFgCanvas = document.createElement('canvas');
    segFgCtx = segFgCanvas.getContext('2d');
  }
  if (segFgCanvas.width !== width || segFgCanvas.height !== height) {
    segFgCanvas.width = width;
    segFgCanvas.height = height;
  }

  if (!segFgCtx) return;

  // 1. Primary path: Real-time MediaPipe Neural AI Subject Segmentation
  let maskSource: HTMLCanvasElement | null = null;
  let isAiMask = false;
  if (bg.useAi && !requestCalibrateNextFrame) {
    maskSource = segmentSubjectWithAi(rawSourceCanvas, bg.sensitivity, bg.edgeSoftness);
    if (maskSource) {
      isAiMask = true;
    }
  }

  // 2. Fallback / Manual Calibration path (YCbCr color separation while AI warms up or when manual mode selected)
  if (!maskSource) {
    if (!segSampleCanvas) {
      segSampleCanvas = document.createElement('canvas');
      segSampleCanvas.width = SEG_W;
      segSampleCanvas.height = SEG_H;
      segSampleCtx = segSampleCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (!segMaskCanvas) {
      segMaskCanvas = document.createElement('canvas');
      segMaskCanvas.width = SEG_W;
      segMaskCanvas.height = SEG_H;
      segMaskCtx = segMaskCanvas.getContext('2d');
    }
    if (!segSampleCtx || !segMaskCtx) return;

    segSampleCtx.drawImage(rawSourceCanvas, 0, 0, SEG_W, SEG_H);
    const frameData = segSampleCtx.getImageData(0, 0, SEG_W, SEG_H).data;
    const totalPixels = SEG_W * SEG_H;

    if (requestCalibrateNextFrame) {
      requestCalibrateNextFrame = false;
      calibratedBgYCbCr = new Float32Array(totalPixels * 3);
      for (let i = 0, p = 0; i < frameData.length; i += 4, p += 3) {
        const [y, cb, cr] = rgbToYCbCr(frameData[i], frameData[i + 1], frameData[i + 2]);
        calibratedBgYCbCr[p] = y;
        calibratedBgYCbCr[p + 1] = cb;
        calibratedBgYCbCr[p + 2] = cr;
      }
      onCalibrated?.();
    }

    if (!prevSegMask || prevSegMask.length !== totalPixels) {
      prevSegMask = new Float32Array(totalPixels);
    }

    const perimeterPalette: [number, number, number][] = [];
    if (!calibratedBgYCbCr) {
      const sampleStep = 4;
      for (let x = 0; x < SEG_W; x += sampleStep) {
        const idxTop = x * 4;
        perimeterPalette.push(
          rgbToYCbCr(frameData[idxTop], frameData[idxTop + 1], frameData[idxTop + 2])
        );
        const idxTop2 = (4 * SEG_W + x) * 4;
        perimeterPalette.push(
          rgbToYCbCr(frameData[idxTop2], frameData[idxTop2 + 1], frameData[idxTop2 + 2])
        );
      }
      for (let y = 6; y < SEG_H - 8; y += sampleStep) {
        const idxL = (y * SEG_W + 3) * 4;
        const idxR = (y * SEG_W + (SEG_W - 4)) * 4;
        perimeterPalette.push(rgbToYCbCr(frameData[idxL], frameData[idxL + 1], frameData[idxL + 2]));
        perimeterPalette.push(rgbToYCbCr(frameData[idxR], frameData[idxR + 1], frameData[idxR + 2]));
      }
    }

    const sensNorm = bg.sensitivity / 100;
    const distThreshold = 46 - sensNorm * 28;
    const maskImg = segMaskCtx.createImageData(SEG_W, SEG_H);
    const mData = maskImg.data;

    for (let y = 0; y < SEG_H; y++) {
      const ny = y / SEG_H;
      for (let x = 0; x < SEG_W; x++) {
        const nx = x / SEG_W;
        const pIdx = y * SEG_W + x;
        const i4 = pIdx * 4;
        const [py, pcb, pcr] = rgbToYCbCr(frameData[i4], frameData[i4 + 1], frameData[i4 + 2]);

        let fgLikelihood = 0;

        if (calibratedBgYCbCr) {
          const b3 = pIdx * 3;
          const dy = py - calibratedBgYCbCr[b3];
          const dcb = pcb - calibratedBgYCbCr[b3 + 1];
          const dcr = pcr - calibratedBgYCbCr[b3 + 2];
          const dist = Math.sqrt(0.28 * dy * dy + 1.45 * dcb * dcb + 1.45 * dcr * dcr);
          fgLikelihood = Math.max(0, Math.min(1, (dist - distThreshold * 0.55) / (distThreshold * 0.85)));
        } else {
          let minDist = 999;
          for (let k = 0; k < perimeterPalette.length; k++) {
            const [by, bcb, bcr] = perimeterPalette[k];
            const dy = py - by;
            const dcb = pcb - bcb;
            const dcr = pcr - bcr;
            const d = Math.sqrt(0.32 * dy * dy + 1.3 * dcb * dcb + 1.3 * dcr * dcr);
            if (d < minDist) minDist = d;
          }

          const colorScore = Math.max(
            0,
            Math.min(1, (minDist - distThreshold * 0.45) / (distThreshold * 0.9))
          );

          const centerDistX = Math.abs(nx - 0.5);
          const torsoWidth = 0.16 + ny * 0.24;
          const inPortraitZone =
            ny > 0.12 && centerDistX < torsoWidth
              ? Math.max(0, 1 - (centerDistX / torsoWidth) * 0.9)
              : 0;

          const isSkin = pcb >= 76 && pcb <= 129 && pcr >= 132 && pcr <= 176 ? 1 : 0;

          const combined =
            colorScore * 0.72 + inPortraitZone * 0.28 + isSkin * inPortraitZone * 0.38;
          fgLikelihood = Math.max(0, Math.min(1, (combined - (0.48 - sensNorm * 0.25)) * 2.4));
        }

        const smoothed = prevSegMask[pIdx] * 0.44 + fgLikelihood * 0.56;
        prevSegMask[pIdx] = smoothed;

        const alpha = Math.round(Math.max(0, Math.min(1, smoothed)) * 255);
        mData[i4] = 255;
        mData[i4 + 1] = 255;
        mData[i4 + 2] = 255;
        mData[i4 + 3] = alpha;
      }
    }

    segMaskCtx.putImageData(maskImg, 0, 0);
    maskSource = segMaskCanvas;
  }

  // Copy filtered foreground frame into segFgCanvas and apply feathered alpha mask
  segFgCtx.save();
  segFgCtx.clearRect(0, 0, width, height);
  segFgCtx.drawImage(filteredWorkCtx.canvas, 0, 0);
  segFgCtx.globalCompositeOperation = 'destination-in';
  const maxFeather = isAiMask ? 4.5 : 8;
  const featherPx = (bg.edgeSoftness / 100) * maxFeather;
  if (featherPx > 0.4) {
    segFgCtx.filter = `blur(${featherPx.toFixed(1)}px)`;
  }
  segFgCtx.imageSmoothingEnabled = true;
  segFgCtx.imageSmoothingQuality = 'high';
  segFgCtx.drawImage(maskSource, 0, 0, width, height);
  segFgCtx.restore();

  // Draw replacement background into filteredWorkCtx
  filteredWorkCtx.save();
  if (bg.mode === 'color') {
    filteredWorkCtx.fillStyle = bg.solidColor;
    filteredWorkCtx.fillRect(0, 0, width, height);
  } else if (bg.mode === 'blur') {
    const { blurCanvas: bC, blurCtx: bCtx } = ensureBuffers(width, height);
    if (bC && bCtx) {
      bCtx.save();
      bCtx.clearRect(0, 0, width, height);
      bCtx.filter = `blur(${bg.blurAmount}px)`;
      // Slight overscan avoids dark canvas border vignette from CSS blur
      const pad = Math.round(bg.blurAmount * 1.4);
      bCtx.drawImage(filteredWorkCtx.canvas, -pad, -pad, width + pad * 2, height + pad * 2);
      bCtx.restore();
      filteredWorkCtx.clearRect(0, 0, width, height);
      filteredWorkCtx.drawImage(bC, 0, 0);
    }
  } else if (bg.mode === 'image') {
    const chosenSrc =
      bg.imageId === 'custom' && bg.customImageUrl
        ? bg.customImageUrl
        : VIRTUAL_BACKGROUNDS.find((v) => v.id === bg.imageId)?.src || VIRTUAL_BACKGROUNDS[0].src;
    const bgImg = getLoadedBackgroundImage(chosenSrc);
    if (bgImg) {
      const imgRatio = bgImg.naturalWidth / bgImg.naturalHeight;
      const dstRatio = width / height;
      let sx = 0;
      let sy = 0;
      let sw = bgImg.naturalWidth;
      let sh = bgImg.naturalHeight;
      if (imgRatio > dstRatio) {
        sw = bgImg.naturalHeight * dstRatio;
        sx = (bgImg.naturalWidth - sw) / 2;
      } else {
        sh = bgImg.naturalWidth / dstRatio;
        sy = (bgImg.naturalHeight - sh) / 2;
      }
      filteredWorkCtx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, width, height);
    } else {
      filteredWorkCtx.fillStyle = '#18181b';
      filteredWorkCtx.fillRect(0, 0, width, height);
    }
  }

  // Composite segmented foreground person on top
  filteredWorkCtx.drawImage(segFgCanvas, 0, 0);
  filteredWorkCtx.restore();
}

function drawSourceTransformed(
  ctx: CanvasRenderingContext2D,
  source: HTMLVideoElement | HTMLCanvasElement,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  mirror: boolean,
  flipVertical: boolean,
  fitMode: FrameFitMode,
  zoom: number,
  panX: number,
  panY: number,
  stabOffsetX = 0,
  stabOffsetY = 0,
  stabOverscan = 1
) {
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;

  // Contain mode when aspect ratios differ so 100% of captured sensor is visible without cropping
  if (fitMode === 'contain' && Math.abs(srcRatio - dstRatio) > 0.01 && zoom <= 1.001) {
    ctx.save();
    ctx.fillStyle = '#050507';
    ctx.fillRect(0, 0, dstW, dstH);

    let drawW = dstW;
    let drawH = dstH;
    if (srcRatio > dstRatio) {
      drawW = dstW;
      drawH = dstW / srcRatio;
    } else {
      drawH = dstH;
      drawW = dstH * srcRatio;
    }
    const dx = (dstW - drawW) / 2;
    const dy = (dstH - drawH) / 2;

    const zoomedW = srcW / stabOverscan;
    const zoomedH = srcH / stabOverscan;
    const rawSx = (srcW - zoomedW) / 2 + stabOffsetX * srcW;
    const rawSy = (srcH - zoomedH) / 2 + stabOffsetY * srcH;
    const sx = Math.max(0, Math.min(srcW - zoomedW, rawSx));
    const sy = Math.max(0, Math.min(srcH - zoomedH, rawSy));

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(mirror ? dstW : 0, flipVertical ? dstH : 0);
    ctx.scale(mirror ? -1 : 1, flipVertical ? -1 : 1);
    ctx.drawImage(source, sx, sy, zoomedW, zoomedH, dx, dy, drawW, drawH);
    ctx.restore();
    return;
  }

  // Cover / zoomed transform
  let cropW = srcW;
  let cropH = srcH;
  if (Math.abs(srcRatio - dstRatio) > 0.005) {
    if (srcRatio > dstRatio) {
      cropW = srcH * dstRatio;
    } else {
      cropH = srcW / dstRatio;
    }
  }

  const effectiveZoom = zoom * stabOverscan;
  const zoomedW = cropW / effectiveZoom;
  const zoomedH = cropH / effectiveZoom;

  const maxOffsetX = Math.max(0, (srcW - zoomedW) / 2);
  const maxOffsetY = Math.max(0, (srcH - zoomedH) / 2);

  const rawSx =
    (srcW - zoomedW) / 2 +
    panX * maxOffsetX * (mirror ? -1 : 1) +
    stabOffsetX * srcW;
  const rawSy =
    (srcH - zoomedH) / 2 +
    panY * maxOffsetY * (flipVertical ? -1 : 1) +
    stabOffsetY * srcH;

  const sx = Math.max(0, Math.min(srcW - zoomedW, rawSx));
  const sy = Math.max(0, Math.min(srcH - zoomedH, rawSy));

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(mirror ? dstW : 0, flipVertical ? dstH : 0);
  ctx.scale(mirror ? -1 : 1, flipVertical ? -1 : 1);
  ctx.drawImage(source, sx, sy, zoomedW, zoomedH, 0, 0, dstW, dstH);
  ctx.restore();
}

function applyColorPresetPostGrade(
  ctx: CanvasRenderingContext2D,
  filterId: FilterPresetId,
  width: number,
  height: number
) {
  if (filterId === 'cyanotype') {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = '#0c3b75';
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#cbe7ff';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else if (filterId === 'teal-orange' || filterId === 'cine-2383') {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
    grad.addColorStop(1, 'rgba(249, 115, 22, 0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else if (filterId === 'cine-neon') {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, 'rgba(6, 182, 212, 0.42)');
    grad.addColorStop(1, 'rgba(217, 70, 239, 0.42)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else if (filterId === 'ig-nashville') {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(247, 176, 155, 0.16)';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else if (filterId === 'matte-film' || filterId === 'ig-slumber') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighten';
    ctx.fillStyle = 'rgba(28, 25, 23, 0.28)';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

export function applyFullColorGrade(
  srcCanvas: HTMLCanvasElement,
  dstCtx: CanvasRenderingContext2D,
  filterId: FilterPresetId,
  adjustments: ColorAdjustments,
  width: number,
  height: number
) {
  // Primary GPU WebGL2 LUT + Split-Tone + Film Curve shader
  if (applyWebglColorFilter(srcCanvas, dstCtx, filterId, adjustments, width, height)) {
    return;
  }

  // Fallback Canvas 2D CSS filter + overlay grade
  dstCtx.save();
  dstCtx.clearRect(0, 0, width, height);
  dstCtx.filter = buildCssFilterString(filterId, adjustments);
  dstCtx.drawImage(srcCanvas, 0, 0, width, height);
  dstCtx.filter = 'none';
  applyColorPresetPostGrade(dstCtx, filterId, width, height);
  dstCtx.restore();
}

function applyPixelVisualEffect(
  srcCtx: CanvasRenderingContext2D,
  dstCtx: CanvasRenderingContext2D,
  effectId: VisualEffectId,
  width: number,
  height: number,
  intensity: number
) {
  const strength = intensity / 100;

  if (effectId === 'none') {
    dstCtx.drawImage(srcCtx.canvas, 0, 0);
    return;
  }

  // GPU WebGL2 accelerated path (full native resolution at 60fps)
  if (applyWebglVisualEffect(srcCtx.canvas, dstCtx, effectId, width, height, intensity)) {
    return;
  }

  if (effectId === 'kaleidoscope-2') {
    const halfW = Math.floor(width / 2);
    dstCtx.drawImage(srcCtx.canvas, 0, 0, halfW, height, 0, 0, halfW, height);
    dstCtx.save();
    dstCtx.translate(width, 0);
    dstCtx.scale(-1, 1);
    dstCtx.drawImage(srcCtx.canvas, 0, 0, halfW, height, 0, 0, width - halfW, height);
    dstCtx.restore();
    return;
  }

  if (effectId === 'kaleidoscope-4') {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);
    // Top-left
    dstCtx.drawImage(srcCtx.canvas, 0, 0, halfW, halfH, 0, 0, halfW, halfH);
    // Top-right
    dstCtx.save();
    dstCtx.translate(width, 0);
    dstCtx.scale(-1, 1);
    dstCtx.drawImage(srcCtx.canvas, 0, 0, halfW, halfH, 0, 0, width - halfW, halfH);
    dstCtx.restore();
    // Bottom-left
    dstCtx.save();
    dstCtx.translate(0, height);
    dstCtx.scale(1, -1);
    dstCtx.drawImage(srcCtx.canvas, 0, 0, halfW, halfH, 0, 0, halfW, height - halfH);
    dstCtx.restore();
    // Bottom-right
    dstCtx.save();
    dstCtx.translate(width, height);
    dstCtx.scale(-1, -1);
    dstCtx.drawImage(srcCtx.canvas, 0, 0, halfW, halfH, 0, 0, width - halfW, height - halfH);
    dstCtx.restore();
    return;
  }

  if (effectId === 'pixelate') {
    const block = Math.max(4, Math.round(6 + strength * 26));
    const smallW = Math.max(8, Math.floor(width / block));
    const smallH = Math.max(8, Math.floor(height / block));
    const { pixelCanvas: pC, pixelCtx: pCtx } = ensureBuffers(width, height);
    if (pC && pCtx) {
      pC.width = smallW;
      pC.height = smallH;
      pCtx.drawImage(srcCtx.canvas, 0, 0, smallW, smallH);
      dstCtx.save();
      dstCtx.imageSmoothingEnabled = false;
      dstCtx.drawImage(pC, 0, 0, smallW, smallH, 0, 0, width, height);
      dstCtx.restore();
    }
    return;
  }

  if (effectId === 'pop-art') {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);
    const tints = [
      { filter: 'contrast(150%) saturate(220%) hue-rotate(0deg)', overlay: 'rgba(236, 72, 153, 0.28)' },
      { filter: 'contrast(150%) saturate(220%) hue-rotate(95deg)', overlay: 'rgba(234, 179, 8, 0.28)' },
      { filter: 'contrast(150%) saturate(220%) hue-rotate(190deg)', overlay: 'rgba(6, 182, 212, 0.28)' },
      { filter: 'contrast(150%) saturate(220%) hue-rotate(280deg)', overlay: 'rgba(34, 197, 94, 0.28)' },
    ];
    const coords = [
      [0, 0],
      [halfW, 0],
      [0, halfH],
      [halfW, halfH],
    ];
    coords.forEach(([x, y], idx) => {
      dstCtx.save();
      dstCtx.filter = tints[idx].filter;
      dstCtx.drawImage(srcCtx.canvas, 0, 0, width, height, x, y, halfW, halfH);
      dstCtx.filter = 'none';
      dstCtx.globalCompositeOperation = 'color';
      dstCtx.fillStyle = tints[idx].overlay;
      dstCtx.fillRect(x, y, halfW, halfH);
      dstCtx.restore();
    });
    return;
  }

  // Pixel-buffer based shaders (Thermal, Night Vision, VHS, Sketch)
  // Downscale slightly for high-intensity pixel shaders if resolution > 960px to keep 60fps silky smooth
  const imgData = srcCtx.getImageData(0, 0, width, height);
  const data = imgData.data;

  if (effectId === 'thermal') {
    for (let i = 0; i < data.length; i += 4) {
      const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      const t = Math.min(1, Math.max(0, lum * (0.85 + strength * 0.35)));
      let r = 0;
      let g = 0;
      let b = 0;
      if (t < 0.25) {
        const k = t / 0.25;
        r = 15 + k * 75;
        g = 10;
        b = 60 + k * 140;
      } else if (t < 0.5) {
        const k = (t - 0.25) / 0.25;
        r = 90 + k * 145;
        g = 10 + k * 30;
        b = 200 - k * 140;
      } else if (t < 0.78) {
        const k = (t - 0.5) / 0.28;
        r = 235 + k * 20;
        g = 40 + k * 165;
        b = 60 - k * 55;
      } else {
        const k = (t - 0.78) / 0.22;
        r = 255;
        g = 205 + k * 50;
        b = 5 + k * 220;
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
    dstCtx.putImageData(imgData, 0, 0);
    return;
  }

  if (effectId === 'night-vision') {
    const noiseAmp = 18 + strength * 26;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const boosted = Math.min(255, lum * (1.25 + strength * 0.45));
      const grain = (Math.random() - 0.5) * noiseAmp;
      data[i] = Math.max(0, Math.min(255, boosted * 0.18 + grain * 0.3));
      data[i + 1] = Math.max(0, Math.min(255, boosted * 1.08 + grain));
      data[i + 2] = Math.max(0, Math.min(255, boosted * 0.25 + grain * 0.3));
    }
    dstCtx.putImageData(imgData, 0, 0);
    // Subtle phosphor scanlines
    dstCtx.save();
    dstCtx.fillStyle = 'rgba(0, 15, 0, 0.22)';
    for (let y = 0; y < height; y += 3) {
      dstCtx.fillRect(0, y, width, 1);
    }
    dstCtx.restore();
    return;
  }

  if (effectId === 'vhs-retro') {
    const shift = Math.max(2, Math.round(3 + strength * 9));
    const copy = new Uint8ClampedArray(data);
    for (let y = 0; y < height; y++) {
      // Occasional subtle horizontal jitter line
      const jitter = y % 47 === 0 ? Math.round((Math.random() - 0.5) * shift * 2) : 0;
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const rx = Math.min(width - 1, Math.max(0, x + shift + jitter));
        const bx = Math.min(width - 1, Math.max(0, x - shift + jitter));
        const rIdx = (y * width + rx) * 4;
        const bIdx = (y * width + bx) * 4;

        data[idx] = copy[rIdx];
        data[idx + 1] = copy[idx + 1] * 0.96;
        data[idx + 2] = copy[bIdx + 2];
      }
    }
    dstCtx.putImageData(imgData, 0, 0);

    // Scanlines + VHS date stamp
    dstCtx.save();
    dstCtx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    for (let y = 0; y < height; y += 3) {
      dstCtx.fillRect(0, y, width, 1);
    }
    const now = new Date();
    const stamp = `PLAY ►  ${now.toLocaleDateString('es-ES')}  ${now.toLocaleTimeString('es-ES')}`;
    dstCtx.font = `600 ${Math.max(14, Math.round(height * 0.032))}px "JetBrains Mono", monospace`;
    dstCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    dstCtx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    dstCtx.shadowBlur = 4;
    dstCtx.fillText(stamp, Math.round(width * 0.04), Math.round(height * 0.92));
    dstCtx.restore();
    return;
  }

  if (effectId === 'sketch-ink') {
    const copy = new Uint8ClampedArray(data);
    const threshold = 240 - strength * 80;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        const idxR = (y * width + (x + 1)) * 4;
        const idxD = ((y + 1) * width + x) * 4;

        const lumC = 0.3 * copy[idx] + 0.59 * copy[idx + 1] + 0.11 * copy[idx + 2];
        const lumR = 0.3 * copy[idxR] + 0.59 * copy[idxR + 1] + 0.11 * copy[idxR + 2];
        const lumD = 0.3 * copy[idxD] + 0.59 * copy[idxD + 1] + 0.11 * copy[idxD + 2];

        const edge = Math.abs(lumC - lumR) + Math.abs(lumC - lumD);
        const ink = Math.max(18, Math.min(250, 250 - edge * (3.2 + strength * 3.5)));
        const paper = ink > threshold ? 248 : ink;
        data[idx] = paper;
        data[idx + 1] = paper - 2;
        data[idx + 2] = paper - 6;
      }
    }
    dstCtx.putImageData(imgData, 0, 0);
  }
}

export function renderCameraFrame(
  dstCtx: CanvasRenderingContext2D,
  primarySource: HTMLVideoElement | HTMLCanvasElement,
  primaryW: number,
  primaryH: number,
  options: RenderPipelineOptions,
  screenSource?: { el: HTMLVideoElement; w: number; h: number } | null,
  onBackgroundCalibrated?: () => void,
  dualCamSource?: { el: HTMLVideoElement; w: number; h: number; mirror: boolean } | null
) {
  const {
    width,
    height,
    mirror,
    flipVertical,
    rotation = 0,
    fitMode,
    zoom,
    panX,
    panY,
    filterId,
    effectId: requestedEffectId,
    adjustments,
    stabilization,
    background,
    branding,
  } = options;

  const transparentRequested = background.mode === 'transparent' && options.cameraOnlyAlpha === true && !screenSource && !dualCamSource;
  const geometricEffects = ['kaleidoscope-2', 'kaleidoscope-4', 'pop-art', 'pixelate', 'cyberpunk-glitch', 'vhs-retro'];
  const effectId = transparentRequested && geometricEffects.includes(requestedEffectId) ? 'none' : requestedEffectId;
  const streamIdentity = 'srcObject' in primarySource && primarySource.srcObject && typeof primarySource.srcObject === 'object'
    ? primarySource.srcObject : primarySource;
  setAiSegmentationSource(streamIdentity, [primaryW, primaryH, width, height, mirror, flipVertical, rotation, fitMode, zoom, panX, panY].join(':'));
  let transparentMask: HTMLCanvasElement | null = null;
  const { workCanvas: wC, workCtx: wCtx, rawCanvas: rC, rawCtx: rCtx } = ensureBuffers(width, height);
  if (!wC || !wCtx || !rC || !rCtx) return false;
  dstCtx.clearRect(0, 0, width, height);

  // Apply 90/180/270 source rotation before stabilization & aspect-ratio fitting
  let effectiveSource: HTMLVideoElement | HTMLCanvasElement = primarySource;
  let effW = primaryW;
  let effH = primaryH;
  if (rotation !== 0) {
    const swapDims = rotation === 90 || rotation === 270;
    effW = swapDims ? primaryH : primaryW;
    effH = swapDims ? primaryW : primaryH;
    if (!rotCanvas) {
      rotCanvas = document.createElement('canvas');
      rotCtx = rotCanvas.getContext('2d');
    }
    if (rotCanvas.width !== effW || rotCanvas.height !== effH) {
      rotCanvas.width = effW;
      rotCanvas.height = effH;
    }
    if (rotCtx) {
      rotCtx.save();
      rotCtx.clearRect(0, 0, effW, effH);
      rotCtx.translate(effW / 2, effH / 2);
      rotCtx.rotate((rotation * Math.PI) / 180);
      rotCtx.drawImage(primarySource, -primaryW / 2, -primaryH / 2, primaryW, primaryH);
      rotCtx.restore();
      effectiveSource = rotCanvas;
    }
  }

  // Compute consecutive-frame stabilization offset if enabled
  let stabX = 0;
  let stabY = 0;
  let stabOverscan = 1;
  if (stabilization.enabled) {
    const res = updateStabilizationDisplacement(effectiveSource, stabilization.strength);
    stabX = res.compX;
    stabY = res.compY;
    stabOverscan = res.overscan;
  } else if (prevStabLum !== null) {
    resetStabilizationState();
  }

  // 1. Render primary camera into raw buffer (unfiltered, transformed, stabilized)
  rCtx.clearRect(0, 0, width, height);
  drawSourceTransformed(
    rCtx,
    effectiveSource,
    effW,
    effH,
    width,
    height,
    mirror,
    flipVertical,
    fitMode,
    zoom,
    panX,
    panY,
    stabX,
    stabY,
    stabOverscan
  );

  // 2. Render filtered camera into work buffer (GPU WebGL2 LUT + Split-Tone + Adjustments)
  applyFullColorGrade(rC, wCtx, filterId, adjustments, width, height);

  // 2b. Real-time Foreground Segmentation & Background Replacement
  if (transparentRequested) {
    requestCalibrateNextFrame = false;
    transparentMask = segmentSubjectWithAi(rC, background.sensitivity, background.edgeSoftness, true);
  } else if (background.mode !== 'transparent' && (background.mode !== 'none' || requestCalibrateNextFrame)) {
    if (background.mode === 'none' && requestCalibrateNextFrame) {
      // Allow pre-calibrating empty background even before turning mode on
      applyBackgroundSegmentation(rC, wCtx, width, height, { ...background, mode: 'blur' }, onBackgroundCalibrated);
    } else {
      applyBackgroundSegmentation(rC, wCtx, width, height, background, onBackgroundCalibrated);
    }
  }

  // 3. Apply visual effect (or Screen Share PiP composition)
  if (screenSource && screenSource.w > 0 && screenSource.h > 0) {
    // Draw screen share full canvas
    drawSourceTransformed(
      dstCtx,
      screenSource.el,
      screenSource.w,
      screenSource.h,
      width,
      height,
      false,
      false,
      'contain',
      1,
      0,
      0
    );

    // Draw filtered/effected camera in PiP window unless 'screen-only' mode is active
    if (options.screenLayout !== 'screen-only') {
    const pipW = Math.round(width * (options.pipSizeRatio ?? 0.24));
    const pipH = Math.round(pipW * (height / width));
    const margin = Math.round(width * 0.025);
    const corner = options.pipCorner ?? 'bottom-right';
    const pipX = corner.includes('right') ? width - pipW - margin : margin;
    const pipY = corner.includes('bottom') ? height - pipH - margin : margin;

    // Process effect into a temporary draw if needed
    dstCtx.save();
    dstCtx.shadowColor = 'rgba(0,0,0,0.55)';
    dstCtx.shadowBlur = 24;
    dstCtx.beginPath();
    if (options.pipCircular) {
      const size = Math.min(pipW, pipH);
      const cx = pipX + pipW / 2;
      const cy = pipY + pipH / 2;
      dstCtx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    } else {
      dstCtx.roundRect(pipX, pipY, pipW, pipH, 14);
    }
    dstCtx.clip();

    if (effectId === 'none') {
      dstCtx.drawImage(wC, 0, 0, width, height, pipX, pipY, pipW, pipH);
    } else {
      // Apply effect to work canvas then draw into PiP
      const tempC = document.createElement('canvas');
      tempC.width = width;
      tempC.height = height;
      const tempCtx = tempC.getContext('2d');
      if (tempCtx) {
        applyPixelVisualEffect(wCtx, tempCtx, effectId, width, height, adjustments.effectIntensity);
        dstCtx.drawImage(tempC, 0, 0, width, height, pipX, pipY, pipW, pipH);
      }
    }
    dstCtx.restore();

    // Crisp PiP border
    dstCtx.save();
    dstCtx.strokeStyle = 'rgba(255,255,255,0.28)';
    dstCtx.lineWidth = 2;
    dstCtx.beginPath();
    if (options.pipCircular) {
      const size = Math.min(pipW, pipH);
      dstCtx.arc(pipX + pipW / 2, pipY + pipH / 2, size / 2, 0, Math.PI * 2);
    } else {
      dstCtx.roundRect(pipX, pipY, pipW, pipH, 14);
    }
    dstCtx.stroke();
    dstCtx.restore();
    }
  } else {
    // Standard full-frame camera output
    applyPixelVisualEffect(wCtx, dstCtx, effectId, width, height, adjustments.effectIntensity);

    // Selective Focus Area (Depth-of-Field Bokeh) & Manual Focus Rack Defocus
    const { focus } = options;
    const manualRackDefocus =
      focus.mode === 'manual' ? (Math.abs(focus.manualDistance - 50) / 50) * 7.5 : 0;
    const outerBlurPx = (focus.apertureBlur / 100) * 14;

    if (outerBlurPx > 0.3 || manualRackDefocus > 0.3) {
      const { blurCanvas: bC, blurCtx: bCtx } = ensureBuffers(width, height);
      if (bC && bCtx) {
        // Apply global manual rack defocus if lens is pulled away from subject focal plane
        if (manualRackDefocus > 0.3) {
          bCtx.save();
          bCtx.clearRect(0, 0, width, height);
          bCtx.filter = `blur(${manualRackDefocus.toFixed(1)}px)`;
          bCtx.drawImage(dstCtx.canvas, 0, 0);
          bCtx.restore();
          dstCtx.drawImage(bC, 0, 0);
        }

        // Apply selective out-of-focus bokeh outside the selected focus area
        if (outerBlurPx > 0.3) {
          bCtx.save();
          bCtx.clearRect(0, 0, width, height);
          bCtx.filter = `blur(${outerBlurPx.toFixed(1)}px)`;
          bCtx.drawImage(dstCtx.canvas, 0, 0);
          bCtx.restore();

          // Punch a soft feathered clear hole at (focus.areaX, focus.areaY) in the blurred layer
          const fx = focus.areaX * width;
          const fy = focus.areaY * height;
          const minDim = Math.min(width, height);
          const innerR =
            focus.areaSize === 'spot'
              ? minDim * 0.1
              : focus.areaSize === 'zone'
                ? minDim * 0.2
                : minDim * 0.34;
          const outerR = innerR * 1.95;

          bCtx.save();
          bCtx.globalCompositeOperation = 'destination-out';
          const maskGrad = bCtx.createRadialGradient(fx, fy, innerR, fx, fy, outerR);
          maskGrad.addColorStop(0, 'rgba(0,0,0,1)');
          maskGrad.addColorStop(0.55, 'rgba(0,0,0,0.65)');
          maskGrad.addColorStop(1, 'rgba(0,0,0,0)');
          bCtx.fillStyle = maskGrad;
          bCtx.fillRect(0, 0, width, height);
          bCtx.restore();

          dstCtx.drawImage(bC, 0, 0);
        }
      }
    }

    // Vignette
    if (adjustments.vignette > 0) {
      const vAlpha = (adjustments.vignette / 100) * 0.78;
      const grad = dstCtx.createRadialGradient(
        width / 2,
        height / 2,
        width * 0.25,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.68
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${vAlpha.toFixed(2)})`);
      dstCtx.save();
      dstCtx.fillStyle = grad;
      dstCtx.fillRect(0, 0, width, height);
      dstCtx.restore();
    }

    // A/B split wipe (raw unfiltered on left)
    if (options.abSplitEnabled) {
      const splitX = Math.round(width * options.abSplitPosition);
      dstCtx.save();
      dstCtx.beginPath();
      dstCtx.rect(0, 0, splitX, height);
      dstCtx.clip();
      dstCtx.drawImage(rC, 0, 0);
      dstCtx.restore();

      // Split line
      dstCtx.save();
      dstCtx.strokeStyle = '#fafafa';
      dstCtx.lineWidth = 2;
      dstCtx.beginPath();
      dstCtx.moveTo(splitX, 0);
      dstCtx.lineTo(splitX, height);
      dstCtx.stroke();
      dstCtx.restore();
    }

    // Dual Camera Picture-in-Picture overlay (e.g., MacBook FaceTime + iPhone Continuity / USB cam)
    if (dualCamSource && dualCamSource.w > 0 && dualCamSource.h > 0) {
      const pipW = Math.round(width * (options.pipSizeRatio ?? 0.24));
      const pipH = Math.round(pipW * (height / width));
      const margin = Math.round(width * 0.025);
      const corner = options.pipCorner ?? 'bottom-right';
      const pipX = corner.includes('right') ? width - pipW - margin : margin;
      const pipY = corner.includes('bottom') ? height - pipH - margin : margin;

      dstCtx.save();
      dstCtx.shadowColor = 'rgba(0,0,0,0.55)';
      dstCtx.shadowBlur = 24;
      dstCtx.beginPath();
      if (options.pipCircular) {
        const size = Math.min(pipW, pipH);
        dstCtx.arc(pipX + pipW / 2, pipY + pipH / 2, size / 2, 0, Math.PI * 2);
      } else {
        dstCtx.roundRect(pipX, pipY, pipW, pipH, 16);
      }
      dstCtx.clip();

      // Cover crop secondary camera cleanly into PiP frame
      const secRatio = dualCamSource.w / dualCamSource.h;
      const pipRatio = pipW / pipH;
      let sx = 0;
      let sy = 0;
      let sw = dualCamSource.w;
      let sh = dualCamSource.h;
      if (secRatio > pipRatio) {
        sw = dualCamSource.h * pipRatio;
        sx = (dualCamSource.w - sw) / 2;
      } else {
        sh = dualCamSource.w / pipRatio;
        sy = (dualCamSource.h - sh) / 2;
      }

      if (dualCamSource.mirror) {
        dstCtx.translate(pipX + pipW, pipY);
        dstCtx.scale(-1, 1);
        dstCtx.drawImage(dualCamSource.el, sx, sy, sw, sh, 0, 0, pipW, pipH);
      } else {
        dstCtx.drawImage(dualCamSource.el, sx, sy, sw, sh, pipX, pipY, pipW, pipH);
      }
      dstCtx.restore();

      dstCtx.save();
      dstCtx.strokeStyle = 'rgba(255,255,255,0.34)';
      dstCtx.lineWidth = 2;
      dstCtx.beginPath();
      if (options.pipCircular) {
        const size = Math.min(pipW, pipH);
        dstCtx.arc(pipX + pipW / 2, pipY + pipH / 2, size / 2, 0, Math.PI * 2);
      } else {
        dstCtx.roundRect(pipX, pipY, pipW, pipH, 16);
      }
      dstCtx.stroke();
      dstCtx.restore();
    }
  }

  // Apply the real matte LAST, after opaque GPU/2D color and effects.
  // The isolated camera surface is cleared every frame; no shared-screen pixels are touched.
  if (transparentRequested) {
    if (!transparentMask) return false;
    try {
      applySubjectAlpha(dstCtx, transparentMask, width, height, background.edgeSoftness);
      return true;
    } catch (error) {
      reportAiSegmentationFailure(error);
      dstCtx.clearRect(0, 0, width, height);
      dstCtx.drawImage(wC, 0, 0, width, height);
      return false;
    }
  }

  // 4. Baked overlays (Cinema letterbox, Timestamp, Lower Third)
  if (branding.cinemaFrame) {
    const barH = Math.round(height * 0.11);
    dstCtx.fillStyle = '#050505';
    dstCtx.fillRect(0, 0, width, barH);
    dstCtx.fillRect(0, height - barH, width, barH);
  }

  if (branding.showTimestamp && effectId !== 'vhs-retro') {
    const now = new Date();
    const label = `${now.toLocaleDateString('es-ES')} · ${now.toLocaleTimeString('es-ES')}`;
    const fontSize = Math.max(12, Math.round(height * 0.022));
    dstCtx.save();
    dstCtx.font = `500 ${fontSize}px "JetBrains Mono", monospace`;
    const padX = 12;
    const textW = dstCtx.measureText(label).width;
    const yBase = branding.cinemaFrame ? height - Math.round(height * 0.135) : height - 20;
    dstCtx.fillStyle = 'rgba(9, 9, 11, 0.65)';
    dstCtx.beginPath();
    dstCtx.roundRect(width - textW - padX * 2 - 20, yBase - fontSize - 6, textW + padX * 2, fontSize + 14, 6);
    dstCtx.fill();
    dstCtx.fillStyle = '#f4f4f5';
    dstCtx.fillText(label, width - textW - padX - 20, yBase);
    dstCtx.restore();
  }

  if (branding.showLowerThird && (branding.lowerThirdName || branding.lowerThirdTitle)) {
    const marginX = Math.round(width * 0.035);
    const baseY = branding.cinemaFrame ? height - Math.round(height * 0.14) : height - Math.round(height * 0.05);
    const nameSize = Math.max(16, Math.round(height * 0.034));
    const titleSize = Math.max(12, Math.round(height * 0.022));
    dstCtx.save();
    dstCtx.font = `700 ${nameSize}px "Plus Jakarta Sans", sans-serif`;
    const w1 = dstCtx.measureText(branding.lowerThirdName).width;
    dstCtx.font = `500 ${titleSize}px "Plus Jakarta Sans", sans-serif`;
    const w2 = dstCtx.measureText(branding.lowerThirdTitle).width;
    const boxW = Math.max(w1, w2) + 36;
    const boxH = nameSize + (branding.lowerThirdTitle ? titleSize + 22 : 16);

    dstCtx.fillStyle = 'rgba(9, 9, 11, 0.82)';
    dstCtx.beginPath();
    dstCtx.roundRect(marginX, baseY - boxH, boxW, boxH, 8);
    dstCtx.fill();

    dstCtx.fillStyle = '#f59e0b';
    dstCtx.fillRect(marginX + 12, baseY - boxH + 12, 3, boxH - 24);

    dstCtx.fillStyle = '#fafafa';
    dstCtx.font = `700 ${nameSize}px "Plus Jakarta Sans", sans-serif`;
    dstCtx.fillText(branding.lowerThirdName, marginX + 24, baseY - boxH + nameSize + 8);

    if (branding.lowerThirdTitle) {
      dstCtx.fillStyle = '#a1a1aa';
      dstCtx.font = `500 ${titleSize}px "Plus Jakarta Sans", sans-serif`;
      dstCtx.fillText(branding.lowerThirdTitle, marginX + 24, baseY - 12);
    }
    dstCtx.restore();
  }
  return false;
}

export interface HistogramData {
  r: number[];
  g: number[];
  b: number[];
  l: number[];
}

export function computeHistogram(ctx: CanvasRenderingContext2D, width: number, height: number): HistogramData {
  const bins = 48;
  const r = new Array(bins).fill(0);
  const g = new Array(bins).fill(0);
  const b = new Array(bins).fill(0);
  const l = new Array(bins).fill(0);

  const img = ctx.getImageData(0, 0, width, height).data;
  const step = Math.max(4, Math.floor((width * height) / 4500)) * 4;
  let count = 0;

  for (let i = 0; i < img.length; i += step) {
    const rv = img[i];
    const gv = img[i + 1];
    const bv = img[i + 2];
    const lv = 0.299 * rv + 0.587 * gv + 0.114 * bv;

    r[Math.min(bins - 1, Math.floor((rv / 256) * bins))]++;
    g[Math.min(bins - 1, Math.floor((gv / 256) * bins))]++;
    b[Math.min(bins - 1, Math.floor((bv / 256) * bins))]++;
    l[Math.min(bins - 1, Math.floor((lv / 256) * bins))]++;
    count++;
  }

  if (count > 0) {
    const maxVal = Math.max(...r, ...g, ...b, ...l, 1);
    for (let i = 0; i < bins; i++) {
      r[i] = r[i] / maxVal;
      g[i] = g[i] / maxVal;
      b[i] = b[i] / maxVal;
      l[i] = l[i] / maxVal;
    }
  }

  return { r, g, b, l };
}

let prevMotionBuffer: Uint8ClampedArray | null = null;
let motionSampleCanvas: HTMLCanvasElement | null = null;
let motionSampleCtx: CanvasRenderingContext2D | null = null;

export function computeMotionScore(sourceCanvas: HTMLCanvasElement): number {
  const sw = 64;
  const sh = 36;
  if (!motionSampleCanvas) {
    motionSampleCanvas = document.createElement('canvas');
    motionSampleCanvas.width = sw;
    motionSampleCanvas.height = sh;
    motionSampleCtx = motionSampleCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!motionSampleCtx) return 0;

  motionSampleCtx.drawImage(sourceCanvas, 0, 0, sw, sh);
  const curr = motionSampleCtx.getImageData(0, 0, sw, sh).data;

  if (!prevMotionBuffer || prevMotionBuffer.length !== curr.length) {
    prevMotionBuffer = new Uint8ClampedArray(curr);
    return 0;
  }

  let changedPixels = 0;
  const totalPixels = sw * sh;
  for (let i = 0; i < curr.length; i += 4) {
    const l1 = 0.3 * curr[i] + 0.59 * curr[i + 1] + 0.11 * curr[i + 2];
    const l2 = 0.3 * prevMotionBuffer[i] + 0.59 * prevMotionBuffer[i + 1] + 0.11 * prevMotionBuffer[i + 2];
    if (Math.abs(l1 - l2) > 22) {
      changedPixels++;
    }
  }

  prevMotionBuffer.set(curr);
  return Math.min(100, Math.round((changedPixels / totalPixels) * 100 * 2.5));
}

export function renderFocusPeakingOverlay(
  srcCanvas: HTMLCanvasElement,
  overlayCanvas: HTMLCanvasElement
) {
  const w = 320;
  const h = Math.round((srcCanvas.height / srcCanvas.width) * w) || 180;
  if (overlayCanvas.width !== w || overlayCanvas.height !== h) {
    overlayCanvas.width = w;
    overlayCanvas.height = h;
  }
  const ctx = overlayCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  ctx.drawImage(srcCanvas, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const out = ctx.createImageData(w, h);
  const o = out.data;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const ir = (y * w + x + 1) * 4;
      const id = ((y + 1) * w + x) * 4;
      const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
      const lr = 0.3 * d[ir] + 0.59 * d[ir + 1] + 0.11 * d[ir + 2];
      const ld = 0.3 * d[id] + 0.59 * d[id + 1] + 0.11 * d[id + 2];
      const edge = Math.abs(l - lr) + Math.abs(l - ld);
      if (edge > 28) {
        o[i] = 245;
        o[i + 1] = 158;
        o[i + 2] = 11;
        o[i + 3] = 210;
      }
    }
  }
  ctx.putImageData(out, 0, 0);
}

/** Neutral background for unavailable camera input; never simulate a person or test pattern. */
export function renderUnavailableCameraFrame(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
