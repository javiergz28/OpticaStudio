import {
  FaceDetector,
  FilesetResolver,
  ImageSegmenter,
} from '@mediapipe/tasks-vision';
import type { AiSubjectBox, AiVisionStatus } from '../types/camera';

type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

const LOCAL_WASM_PATH = '/mediapipe/wasm';
const CDN_WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm';

const SEGMENTER_LOCAL_MODEL = '/mediapipe/models/selfie_segmenter_landscape.tflite';
const SEGMENTER_CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite';

const FACE_LOCAL_MODEL = '/mediapipe/models/blaze_face_short_range.tflite';
const FACE_CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite';

let visionFilesetPromise: Promise<WasmFileset> | null = null;
let segmenterInstance: ImageSegmenter | null = null;
let segmenterPromise: Promise<ImageSegmenter | null> | null = null;
let segmenterStatus: AiVisionStatus = 'idle';

let faceDetectorInstance: FaceDetector | null = null;
let faceDetectorPromise: Promise<FaceDetector | null> | null = null;
let faceDetectorStatus: AiVisionStatus = 'idle';

const statusListeners = new Set<() => void>();

function notifyStatusChange() {
  statusListeners.forEach((cb) => cb());
}

export function subscribeAiStatus(cb: () => void): () => void {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
}

export function getAiVisionStatus(): {
  segmenter: AiVisionStatus;
  detector: AiVisionStatus;
} {
  return {
    segmenter: segmenterStatus,
    detector: faceDetectorStatus,
  };
}

async function getVisionFileset(): Promise<WasmFileset> {
  if (!visionFilesetPromise) {
    visionFilesetPromise = FilesetResolver.forVisionTasks(LOCAL_WASM_PATH).catch(() =>
      FilesetResolver.forVisionTasks(CDN_WASM_PATH)
    );
  }
  return visionFilesetPromise;
}

async function createSegmenterWithFallback(
  vision: WasmFileset,
  modelPath: string
): Promise<ImageSegmenter> {
  try {
    return await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelPath,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  } catch {
    return await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelPath,
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  }
}

async function createFaceDetectorWithFallback(
  vision: WasmFileset,
  modelPath: string
): Promise<FaceDetector> {
  try {
    return await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelPath,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.48,
      minSuppressionThreshold: 0.3,
    });
  } catch {
    return await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelPath,
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.48,
      minSuppressionThreshold: 0.3,
    });
  }
}

export function ensureAiSegmenter(): Promise<ImageSegmenter | null> {
  if (segmenterInstance) return Promise.resolve(segmenterInstance);
  if (segmenterPromise) return segmenterPromise;

  segmenterStatus = 'loading';
  notifyStatusChange();

  segmenterPromise = (async () => {
    try {
      const vision = await getVisionFileset();
      try {
        segmenterInstance = await createSegmenterWithFallback(vision, SEGMENTER_LOCAL_MODEL);
      } catch {
        segmenterInstance = await createSegmenterWithFallback(vision, SEGMENTER_CDN_MODEL);
      }
      segmenterStatus = 'ready';
      notifyStatusChange();
      return segmenterInstance;
    } catch {
      segmenterStatus = 'error';
      segmenterPromise = null;
      notifyStatusChange();
      return null;
    }
  })();

  return segmenterPromise;
}

export function ensureAiFaceDetector(): Promise<FaceDetector | null> {
  if (faceDetectorInstance) return Promise.resolve(faceDetectorInstance);
  if (faceDetectorPromise) return faceDetectorPromise;

  faceDetectorStatus = 'loading';
  notifyStatusChange();

  faceDetectorPromise = (async () => {
    try {
      const vision = await getVisionFileset();
      try {
        faceDetectorInstance = await createFaceDetectorWithFallback(vision, FACE_LOCAL_MODEL);
      } catch {
        faceDetectorInstance = await createFaceDetectorWithFallback(vision, FACE_CDN_MODEL);
      }
      faceDetectorStatus = 'ready';
      notifyStatusChange();
      return faceDetectorInstance;
    } catch {
      faceDetectorStatus = 'error';
      faceDetectorPromise = null;
      notifyStatusChange();
      return null;
    }
  })();

  return faceDetectorPromise;
}

// Reusable canvases for fast AI inference without allocations
let segInputCanvas: HTMLCanvasElement | null = null;
let segInputCtx: CanvasRenderingContext2D | null = null;
let segOutCanvas: HTMLCanvasElement | null = null;
let segOutCtx: CanvasRenderingContext2D | null = null;
let segOutImgData: ImageData | null = null;
let prevAiAlpha: Float32Array | null = null;
let lastSegTs = 0;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(0.0001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Runs MediaPipe neural Selfie Segmentation on an already-aligned source canvas
 * and returns a feathered RGBA alpha mask canvas matching the source aspect ratio.
 * Returns null while the neural model is still loading (caller uses fast fallback).
 */
export function segmentSubjectWithAi(
  sourceCanvas: HTMLCanvasElement,
  sensitivity: number,
  edgeSoftness: number
): HTMLCanvasElement | null {
  if (!segmenterInstance) {
    void ensureAiSegmenter();
    return null;
  }

  const srcW = sourceCanvas.width || 320;
  const srcH = sourceCanvas.height || 180;
  const inW = 320;
  const inH = Math.max(120, Math.round((srcH / srcW) * inW));

  if (!segInputCanvas) {
    segInputCanvas = document.createElement('canvas');
    segInputCtx = segInputCanvas.getContext('2d', { willReadFrequently: false });
  }
  if (segInputCanvas.width !== inW || segInputCanvas.height !== inH) {
    segInputCanvas.width = inW;
    segInputCanvas.height = inH;
  }
  if (!segInputCtx) return null;

  segInputCtx.drawImage(sourceCanvas, 0, 0, inW, inH);

  const ts = Math.max(lastSegTs + 1, Math.round(performance.now()));
  lastSegTs = ts;

  const labels = segmenterInstance.getLabels();
  let produced = false;

  try {
    segmenterInstance.segmentForVideo(segInputCanvas, ts, (result) => {
      const masks = result.confidenceMasks;
      if (!masks || masks.length === 0) return;

      let fgMask = masks[0];
      let invertMask = false;

      if (masks.length >= 2) {
        const personIdx = labels.findIndex((l) => l.toLowerCase() !== 'background');
        fgMask = masks[personIdx >= 0 ? personIdx : 1];
      } else if (labels[0]?.toLowerCase() === 'background') {
        invertMask = true;
      }

      const mw = fgMask.width;
      const mh = fgMask.height;
      const total = mw * mh;
      const conf = fgMask.getAsFloat32Array();
      if (!conf || conf.length < total) return;

      if (!segOutCanvas) {
        segOutCanvas = document.createElement('canvas');
        segOutCtx = segOutCanvas.getContext('2d');
      }
      if (!segOutCtx) return;

      if (segOutCanvas.width !== mw || segOutCanvas.height !== mh || !segOutImgData) {
        segOutCanvas.width = mw;
        segOutCanvas.height = mh;
        segOutImgData = segOutCtx.createImageData(mw, mh);
      }
      if (!prevAiAlpha || prevAiAlpha.length !== total) {
        prevAiAlpha = new Float32Array(total);
      }

      // Sensitivity (15..85) shifts decision midpoint; edgeSoftness (0..100) adjusts smoothstep band
      const sensNorm = Math.max(0.1, Math.min(0.9, sensitivity / 100));
      const mid = 0.84 - sensNorm * 0.64; // 50% -> ~0.52, 80% -> ~0.33, 20% -> ~0.71
      const halfBand = 0.06 + (edgeSoftness / 100) * 0.18;
      const edge0 = Math.max(0.02, mid - halfBand);
      const edge1 = Math.min(0.98, mid + halfBand);

      const out = segOutImgData.data;
      for (let i = 0; i < total; i++) {
        const rawProb = invertMask ? 1 - conf[i] : conf[i];
        const matte = smoothstep(edge0, edge1, rawProb);
        // Temporal EMA smoothing eliminates edge flicker around hair & shoulders
        const smoothAlpha = prevAiAlpha[i] * 0.34 + matte * 0.66;
        prevAiAlpha[i] = smoothAlpha;

        const i4 = i * 4;
        out[i4] = 255;
        out[i4 + 1] = 255;
        out[i4 + 2] = 255;
        out[i4 + 3] = Math.round(smoothAlpha * 255);
      }

      segOutCtx.putImageData(segOutImgData, 0, 0);
      produced = true;
    });
  } catch {
    return null;
  }

  return produced ? segOutCanvas : null;
}

export function resetAiSegmentationTemporalBuffer() {
  prevAiAlpha = null;
}

// Reusable canvas for FaceDetector subject recognition
let detInputCanvas: HTMLCanvasElement | null = null;
let detInputCtx: CanvasRenderingContext2D | null = null;
let lastDetTs = 0;

/**
 * Runs MediaPipe neural FaceDetector on an aligned frame canvas and returns
 * normalized subject bounding boxes + eye-level auto-focus targets.
 */
export function detectSubjectsWithAi(sourceCanvas: HTMLCanvasElement): AiSubjectBox[] {
  if (!faceDetectorInstance) {
    void ensureAiFaceDetector();
    return [];
  }

  const srcW = sourceCanvas.width || 320;
  const srcH = sourceCanvas.height || 180;
  const inW = 320;
  const inH = Math.max(120, Math.round((srcH / srcW) * inW));

  if (!detInputCanvas) {
    detInputCanvas = document.createElement('canvas');
    detInputCtx = detInputCanvas.getContext('2d', { willReadFrequently: false });
  }
  if (detInputCanvas.width !== inW || detInputCanvas.height !== inH) {
    detInputCanvas.width = inW;
    detInputCanvas.height = inH;
  }
  if (!detInputCtx) return [];

  detInputCtx.drawImage(sourceCanvas, 0, 0, inW, inH);

  const ts = Math.max(lastDetTs + 1, Math.round(performance.now()));
  lastDetTs = ts;

  try {
    const res = faceDetectorInstance.detectForVideo(detInputCanvas, ts);
    if (!res.detections || res.detections.length === 0) return [];

    const boxes: AiSubjectBox[] = res.detections
      .filter((d) => d.boundingBox && d.boundingBox.width > 0 && d.boundingBox.height > 0)
      .map((d) => {
        const bb = d.boundingBox!;
        const x = Math.max(0, Math.min(1, bb.originX / inW));
        const y = Math.max(0, Math.min(1, bb.originY / inH));
        const width = Math.max(0.02, Math.min(1 - x, bb.width / inW));
        const height = Math.max(0.02, Math.min(1 - y, bb.height / inH));
        const confidence = d.categories?.[0]?.score ?? 0.9;

        // Use eye keypoints when available for accurate optical focus lock
        let focusX = x + width * 0.5;
        let focusY = y + height * 0.38;
        if (d.keypoints && d.keypoints.length >= 2) {
          focusX = Math.max(0, Math.min(1, (d.keypoints[0].x + d.keypoints[1].x) * 0.5));
          focusY = Math.max(0, Math.min(1, (d.keypoints[0].y + d.keypoints[1].y) * 0.5));
        }

        return {
          x,
          y,
          width,
          height,
          confidence,
          focusX,
          focusY,
        };
      });

    // Primary largest subject first
    boxes.sort((a, b) => b.width * b.height - a.width * a.height);
    return boxes;
  } catch {
    return [];
  }
}
