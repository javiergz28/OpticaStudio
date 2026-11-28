import {
  DEFAULT_ADJUSTMENTS,
  DEFAULT_BACKGROUND_SETTINGS,
  DEFAULT_FOCUS_SETTINGS,
  DEFAULT_STABILIZATION_SETTINGS,
} from '../types/camera';
import {
  CURRENT_STUDIO_SCHEMA_VERSION,
  STUDIO_COORDINATE_SYSTEM,
  type AudioFileSourceDefinition,
  type AudioSourceSettings,
  type CameraSourceDefinition,
  type ColorSourceDefinition,
  type GradientSourceDefinition,
  type ImageSourceDefinition,
  type LayerCrop,
  type LayerProcessing,
  type LayerStyle,
  type LayerTransform,
  type MicrophoneSourceDefinition,
  type ProjectValidationIssue,
  type ProjectValidationResult,
  type RecordingProfile,
  type SceneLayer,
  type SceneTransition,
  type ScreenSourceDefinition,
  type StudioProject,
  type StudioScene,
  type StudioSource,
  type SystemAudioSourceDefinition,
  type TextSourceDefinition,
  type VideoFileSourceDefinition,
  type WindowSourceDefinition,
} from '../types/studio';

let idSequence = 0;

export function createStudioId(prefix: string): string {
  idSequence += 1;
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '') || 'id';
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${cleanPrefix}_${globalThis.crypto.randomUUID().slice(0, 8)}_${idSequence}`;
  }
  return `${cleanPrefix}_${Date.now().toString(36)}_${idSequence}`;
}

export const DEFAULT_LAYER_CROP: LayerCrop = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

export const DEFAULT_LAYER_TRANSFORM: LayerTransform = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  anchorX: 0,
  anchorY: 0,
  rotationDeg: 0,
  flipH: false,
  flipV: false,
  fitMode: 'cover',
  crop: { ...DEFAULT_LAYER_CROP },
  aspectPreset: 'sensor',
  customAspectRatio: 16 / 9,
  contentZoom: 1,
  contentOffsetX: 0,
  contentOffsetY: 0,
};

export const DEFAULT_LAYER_STYLE: LayerStyle = {
  opacity: 1,
  blendMode: 'normal',
  maskShape: 'rect',
  borderRadiusPx: 0,
  borderEnabled: false,
  borderWidthPx: 0,
  borderColor: 'rgba(255, 255, 255, 0.28)',
  shadowBlurPx: 0,
  shadowOpacity: 0,
  shadowColor: 'rgba(0, 0, 0, 0.55)',
  featherPx: 0,
};

export const DEFAULT_AUDIO_SOURCE_SETTINGS: AudioSourceSettings = {
  enabled: true,
  gainPercent: 100,
  muted: false,
  solo: false,
  compressorEnabled: true,
  syncDelayMs: 0,
  pan: 0,
  monitorEnabled: false,
};

export const DEFAULT_RECORDING_PROFILE: RecordingProfile = {
  resolutionPreset: '1080p',
  aspectRatio: '16:9',
  fps: 60,
  videoBitsPerSecond: 14_000_000,
  formatPref: 'auto-mp4',
  separateAudioTracks: false,
};

export const DEFAULT_SCENE_TRANSITION: SceneTransition = {
  type: 'fade',
  durationMs: 240,
};

export function createDefaultLayerProcessing(): LayerProcessing {
  return {
    filterId: 'none',
    effectId: 'none',
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    stabilization: { ...DEFAULT_STABILIZATION_SETTINGS },
    focus: { ...DEFAULT_FOCUS_SETTINGS },
    background: {
      mode: 'none',
      useAi: DEFAULT_BACKGROUND_SETTINGS.useAi,
      solidColor: DEFAULT_BACKGROUND_SETTINGS.solidColor,
      imageId: DEFAULT_BACKGROUND_SETTINGS.imageId,
      customAssetRef: null,
      sensitivity: DEFAULT_BACKGROUND_SETTINGS.sensitivity,
      edgeSoftness: DEFAULT_BACKGROUND_SETTINGS.edgeSoftness,
      blurAmount: DEFAULT_BACKGROUND_SETTINGS.blurAmount,
    },
  };
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export function clampLayerCrop(crop?: Partial<LayerCrop>): LayerCrop {
  const maxCrop = STUDIO_COORDINATE_SYSTEM.maxCropPerSide;
  const top = clampNumber(crop?.top ?? 0, 0, maxCrop, 0);
  const bottom = clampNumber(crop?.bottom ?? 0, 0, maxCrop, 0);
  const left = clampNumber(crop?.left ?? 0, 0, maxCrop, 0);
  const right = clampNumber(crop?.right ?? 0, 0, maxCrop, 0);

  // Asegurar que quede área visible positiva horizontal y verticalmente
  const safeBottom = top + bottom >= 0.98 ? Math.max(0, 0.98 - top) : bottom;
  const safeRight = left + right >= 0.98 ? Math.max(0, 0.98 - left) : right;

  return {
    top,
    right: safeRight,
    bottom: safeBottom,
    left,
  };
}

export function clampLayerTransform(
  transform?: Partial<LayerTransform>,
  base: LayerTransform = DEFAULT_LAYER_TRANSFORM
): LayerTransform {
  const { minNormalizedCoord, maxNormalizedCoord, minLayerDimension, maxLayerDimension } =
    STUDIO_COORDINATE_SYSTEM;

  const rawRot = transform?.rotationDeg ?? base.rotationDeg;
  const safeRot = Number.isFinite(rawRot) ? ((rawRot % 360) + 360) % 360 : 0;

  const aspectPreset = transform?.aspectPreset ?? base.aspectPreset ?? 'sensor';
  const customAspectRatio = clampNumber(
    transform?.customAspectRatio ?? base.customAspectRatio ?? 16 / 9,
    0.25,
    4,
    16 / 9
  );
  const contentZoom = clampNumber(transform?.contentZoom ?? base.contentZoom ?? 1, 1, 4, 1);
  const contentOffsetX = clampNumber(
    transform?.contentOffsetX ?? base.contentOffsetX ?? 0,
    -1,
    1,
    0
  );
  const contentOffsetY = clampNumber(
    transform?.contentOffsetY ?? base.contentOffsetY ?? 0,
    -1,
    1,
    0
  );

  return {
    x: clampNumber(transform?.x ?? base.x, minNormalizedCoord, maxNormalizedCoord, base.x),
    y: clampNumber(transform?.y ?? base.y, minNormalizedCoord, maxNormalizedCoord, base.y),
    width: clampNumber(
      transform?.width ?? base.width,
      minLayerDimension,
      maxLayerDimension,
      base.width
    ),
    height: clampNumber(
      transform?.height ?? base.height,
      minLayerDimension,
      maxLayerDimension,
      base.height
    ),
    anchorX: clampNumber(transform?.anchorX ?? base.anchorX, 0, 1, base.anchorX),
    anchorY: clampNumber(transform?.anchorY ?? base.anchorY, 0, 1, base.anchorY),
    rotationDeg: safeRot === 360 ? 0 : safeRot,
    flipH: transform?.flipH ?? base.flipH,
    flipV: transform?.flipV ?? base.flipV,
    fitMode: transform?.fitMode ?? base.fitMode,
    crop: clampLayerCrop({ ...base.crop, ...transform?.crop }),
    aspectPreset,
    customAspectRatio,
    contentZoom,
    contentOffsetX,
    contentOffsetY,
  };
}

const VALID_MASK_SHAPES = new Set<LayerStyle['maskShape']>([
  'rect',
  'square',
  'rounded',
  'squircle',
  'circle',
  'ellipse',
]);

export function clampLayerStyle(
  style?: Partial<LayerStyle>,
  base: LayerStyle = DEFAULT_LAYER_STYLE
): LayerStyle {
  const nextBorderWidthPx = clampNumber(
    style?.borderWidthPx ?? base.borderWidthPx,
    0,
    48,
    base.borderWidthPx
  );
  const resolvedBorderEnabled =
    typeof style?.borderEnabled === 'boolean'
      ? style.borderEnabled
      : typeof base.borderEnabled === 'boolean'
        ? style?.borderWidthPx !== undefined
          ? nextBorderWidthPx > 0
          : base.borderEnabled
        : nextBorderWidthPx > 0;
  const candidateMaskShape = style?.maskShape ?? base.maskShape;
  const maskShape = VALID_MASK_SHAPES.has(candidateMaskShape) ? candidateMaskShape : 'rect';

  return {
    opacity: clampNumber(
      style?.opacity ?? base.opacity,
      STUDIO_COORDINATE_SYSTEM.minOpacity,
      STUDIO_COORDINATE_SYSTEM.maxOpacity,
      base.opacity
    ),
    blendMode: style?.blendMode ?? base.blendMode,
    maskShape,
    borderRadiusPx: clampNumber(
      style?.borderRadiusPx ?? base.borderRadiusPx,
      0,
      512,
      base.borderRadiusPx
    ),
    borderEnabled: resolvedBorderEnabled,
    borderWidthPx: nextBorderWidthPx,
    borderColor: style?.borderColor ?? base.borderColor,
    shadowBlurPx: clampNumber(style?.shadowBlurPx ?? base.shadowBlurPx, 0, 128, base.shadowBlurPx),
    shadowOpacity: clampNumber(style?.shadowOpacity ?? base.shadowOpacity, 0, 1, base.shadowOpacity),
    shadowColor: style?.shadowColor ?? base.shadowColor,
    featherPx: clampNumber(style?.featherPx ?? base.featherPx ?? 0, 0, 180, 0),
  };
}

export function normalizeLayerZIndexes(layers: SceneLayer[]): SceneLayer[] {
  return [...layers]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((layer, index) => ({
      ...layer,
      zIndex: index,
    }));
}

export type CreateSourceInput =
  | (Omit<CameraSourceDefinition, 'id' | 'createdAt'> & { id?: string })
  | (Omit<WindowSourceDefinition, 'id' | 'createdAt'> & { id?: string })
  | (Omit<ScreenSourceDefinition, 'id' | 'createdAt'> & { id?: string })
  | (Omit<ImageSourceDefinition, 'id' | 'createdAt'> & { id?: string })
  | (Omit<VideoFileSourceDefinition, 'id' | 'createdAt'> & { id?: string })
  | (Omit<ColorSourceDefinition, 'id' | 'createdAt'> & { id?: string })
  | (Omit<GradientSourceDefinition, 'id' | 'createdAt'> & { id?: string })
  | (Omit<TextSourceDefinition, 'id' | 'createdAt'> & { id?: string })
  | (Omit<MicrophoneSourceDefinition, 'id' | 'createdAt'> & { id?: string })
  | (Omit<SystemAudioSourceDefinition, 'id' | 'createdAt'> & { id?: string })
  | (Omit<AudioFileSourceDefinition, 'id' | 'createdAt'> & { id?: string });

export function createSourceDefinition(input: CreateSourceInput): StudioSource {
  const now = Date.now();
  const id = input.id?.trim() || createStudioId(`src_${input.kind}`);
  return {
    ...input,
    id,
    name: input.name.trim() || `Fuente ${input.kind}`,
    createdAt: now,
  } as StudioSource;
}

export function createEmptyProject(options?: {
  name?: string;
  initialSceneName?: string;
  recordingProfile?: Partial<RecordingProfile>;
}): StudioProject {
  const now = Date.now();
  const sceneId = createStudioId('scene');
  const initialScene: StudioScene = {
    id: sceneId,
    name: options?.initialSceneName?.trim() || 'Escena 1',
    presetId: 'custom',
    backgroundColor: '#06070a',
    transition: { ...DEFAULT_SCENE_TRANSITION },
    layers: [],
    audioSourceIds: [],
    createdAt: now,
    updatedAt: now,
  };

  return {
    schemaVersion: CURRENT_STUDIO_SCHEMA_VERSION,
    id: createStudioId('proj'),
    name: options?.name?.trim() || 'Proyecto Óptica Studio',
    activeSceneId: sceneId,
    previewSceneId: null,
    recordingProfile: {
      ...DEFAULT_RECORDING_PROFILE,
      ...options?.recordingProfile,
    },
    sources: [],
    scenes: [initialScene],
    createdAt: now,
    updatedAt: now,
  };
}

export function addSource(
  project: StudioProject,
  sourceInput: CreateSourceInput
): { project: StudioProject; source: StudioSource } {
  const candidate = createSourceDefinition(sourceInput);
  const idCollision = project.sources.some((s) => s.id === candidate.id);
  const source: StudioSource = idCollision
    ? { ...candidate, id: createStudioId(`src_${candidate.kind}`) }
    : candidate;

  return {
    source,
    project: {
      ...project,
      sources: [...project.sources, source],
      updatedAt: Date.now(),
    },
  };
}

export function updateSource(
  project: StudioProject,
  sourceId: string,
  updater: (source: StudioSource) => StudioSource
): StudioProject {
  let changed = false;
  const nextSources = project.sources.map((src) => {
    if (src.id !== sourceId) return src;
    changed = true;
    const updated = updater(src);
    return { ...updated, id: src.id };
  });
  if (!changed) return project;
  return {
    ...project,
    sources: nextSources,
    updatedAt: Date.now(),
  };
}

export function getSourceUsageCount(project: StudioProject, sourceId: string): number {
  let count = 0;
  for (const scene of project.scenes) {
    for (const layer of scene.layers) {
      if (layer.sourceId === sourceId) count += 1;
    }
    if (scene.audioSourceIds.includes(sourceId)) count += 1;
  }
  return count;
}

export function removeSourceIfUnused(
  project: StudioProject,
  sourceId: string
): { project: StudioProject; removed: boolean; reason?: string } {
  const exists = project.sources.some((s) => s.id === sourceId);
  if (!exists) {
    return { project, removed: false, reason: 'source-not-found' };
  }

  const usageCount = getSourceUsageCount(project, sourceId);
  if (usageCount > 0) {
    return { project, removed: false, reason: 'source-in-use' };
  }

  return {
    removed: true,
    project: {
      ...project,
      sources: project.sources.filter((s) => s.id !== sourceId),
      updatedAt: Date.now(),
    },
  };
}

export function removeSourceSafely(
  project: StudioProject,
  sourceId: string
): {
  project: StudioProject;
  removed: boolean;
  reason?: string;
  usageCount: number;
} {
  const usageCount = getSourceUsageCount(project, sourceId);
  const res = removeSourceIfUnused(project, sourceId);
  return {
    ...res,
    usageCount,
  };
}

export function createScene(
  project: StudioProject,
  input?: {
    name?: string;
    backgroundColor?: string;
    transition?: Partial<SceneTransition>;
    activate?: boolean;
    presetId?: StudioScene['presetId'];
  }
): { project: StudioProject; scene: StudioScene } {
  const now = Date.now();
  const scene: StudioScene = {
    id: createStudioId('scene'),
    name: input?.name?.trim() || `Escena ${project.scenes.length + 1}`,
    presetId: input?.presetId ?? 'custom',
    backgroundColor: input?.backgroundColor ?? '#06070a',
    transition: {
      ...DEFAULT_SCENE_TRANSITION,
      ...input?.transition,
    },
    layers: [],
    audioSourceIds: [],
    createdAt: now,
    updatedAt: now,
  };

  return {
    scene,
    project: {
      ...project,
      activeSceneId: input?.activate ? scene.id : project.activeSceneId,
      scenes: [...project.scenes, scene],
      updatedAt: now,
    },
  };
}

export function renameScene(
  project: StudioProject,
  sceneId: string,
  newName: string
): StudioProject {
  const trimmed = newName.trim();
  if (!trimmed) return project;
  let changed = false;
  const now = Date.now();
  const scenes = project.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene;
    changed = true;
    return { ...scene, name: trimmed, updatedAt: now };
  });
  return changed ? { ...project, scenes, updatedAt: now } : project;
}

export function duplicateScene(
  project: StudioProject,
  sceneId: string,
  newName?: string
): { project: StudioProject; scene: StudioScene | null } {
  const sourceScene = project.scenes.find((s) => s.id === sceneId);
  if (!sourceScene) return { project, scene: null };

  const now = Date.now();
  const clonedLayers: SceneLayer[] = normalizeLayerZIndexes(
    sourceScene.layers.map((layer) => ({
      ...layer,
      id: createStudioId('layer'),
      // Preserva referencia compartida `layer.sourceId`
      transform: clampLayerTransform(layer.transform),
      style: clampLayerStyle(layer.style),
      processing: layer.processing
        ? {
            ...layer.processing,
            adjustments: layer.processing.adjustments
              ? { ...layer.processing.adjustments }
              : undefined,
            stabilization: layer.processing.stabilization
              ? { ...layer.processing.stabilization }
              : undefined,
            focus: layer.processing.focus ? { ...layer.processing.focus } : undefined,
            background: layer.processing.background
              ? { ...layer.processing.background }
              : undefined,
          }
        : undefined,
    }))
  );

  const duplicated: StudioScene = {
    ...sourceScene,
    id: createStudioId('scene'),
    name: newName?.trim() || `${sourceScene.name} (Copia)`,
    layers: clonedLayers,
    audioSourceIds: [...sourceScene.audioSourceIds],
    createdAt: now,
    updatedAt: now,
  };

  const idx = project.scenes.findIndex((s) => s.id === sceneId);
  const nextScenes = [...project.scenes];
  nextScenes.splice(idx + 1, 0, duplicated);

  return {
    scene: duplicated,
    project: {
      ...project,
      scenes: nextScenes,
      updatedAt: now,
    },
  };
}

export function deleteScene(
  project: StudioProject,
  sceneId: string
): { project: StudioProject; deleted: boolean; reason?: 'last-scene' | 'scene-not-found' } {
  if (project.scenes.length <= 1) {
    return { project, deleted: false, reason: 'last-scene' };
  }

  const index = project.scenes.findIndex((s) => s.id === sceneId);
  if (index === -1) {
    return { project, deleted: false, reason: 'scene-not-found' };
  }

  const nextScenes = project.scenes.filter((s) => s.id !== sceneId);
  let nextActiveId = project.activeSceneId;
  if (project.activeSceneId === sceneId) {
    const fallbackIndex = Math.min(index, nextScenes.length - 1);
    nextActiveId = nextScenes[fallbackIndex].id;
  }

  const nextPreviewId =
    project.previewSceneId === sceneId ? null : project.previewSceneId;

  return {
    deleted: true,
    project: {
      ...project,
      activeSceneId: nextActiveId,
      previewSceneId: nextPreviewId,
      scenes: nextScenes,
      updatedAt: Date.now(),
    },
  };
}

export function setActiveScene(project: StudioProject, sceneId: string): StudioProject {
  if (!project.scenes.some((s) => s.id === sceneId)) return project;
  if (project.activeSceneId === sceneId) return project;
  return {
    ...project,
    activeSceneId: sceneId,
    updatedAt: Date.now(),
  };
}

export function addLayerToScene(
  project: StudioProject,
  sceneId: string,
  sourceId: string,
  options?: {
    name?: string;
    transform?: Partial<LayerTransform>;
    style?: Partial<LayerStyle>;
    visible?: boolean;
    locked?: boolean;
    overrideSourceProcessing?: boolean;
    processing?: Partial<LayerProcessing>;
  }
): { project: StudioProject; layer: SceneLayer | null } {
  const source = project.sources.find((s) => s.id === sourceId);
  if (!source) return { project, layer: null };

  const targetScene = project.scenes.find((s) => s.id === sceneId);
  if (!targetScene) return { project, layer: null };

  const now = Date.now();
  const nextZ = targetScene.layers.length;
  const newLayer: SceneLayer = {
    id: createStudioId('layer'),
    sourceId: source.id,
    name: options?.name?.trim() || source.name,
    zIndex: nextZ,
    visible: options?.visible ?? true,
    locked: options?.locked ?? false,
    transform: clampLayerTransform(options?.transform),
    style: clampLayerStyle(options?.style),
    overrideSourceProcessing: options?.overrideSourceProcessing ?? Boolean(options?.processing),
    processing: options?.processing,
  };

  const nextScenes = project.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene;
    return {
      ...scene,
      layers: normalizeLayerZIndexes([...scene.layers, newLayer]),
      updatedAt: now,
    };
  });

  return {
    layer: newLayer,
    project: {
      ...project,
      scenes: nextScenes,
      updatedAt: now,
    },
  };
}

export function removeLayerFromScene(
  project: StudioProject,
  sceneId: string,
  layerId: string
): StudioProject {
  let changed = false;
  const now = Date.now();
  const nextScenes = project.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene;
    const filtered = scene.layers.filter((l) => l.id !== layerId);
    if (filtered.length === scene.layers.length) return scene;
    changed = true;
    return {
      ...scene,
      layers: normalizeLayerZIndexes(filtered),
      updatedAt: now,
    };
  });

  // Nunca elimina la fuente de `project.sources`: otras escenas pueden compartirla.
  return changed ? { ...project, scenes: nextScenes, updatedAt: now } : project;
}

export function renameLayerInScene(
  project: StudioProject,
  sceneId: string,
  layerId: string,
  newName: string
): StudioProject {
  const trimmed = newName.trim();
  if (!trimmed) return project;
  let changed = false;
  const now = Date.now();
  const nextScenes = project.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene;
    return {
      ...scene,
      layers: scene.layers.map((layer) => {
        if (layer.id !== layerId || layer.name === trimmed) return layer;
        changed = true;
        return { ...layer, name: trimmed };
      }),
      updatedAt: now,
    };
  });
  return changed ? { ...project, scenes: nextScenes, updatedAt: now } : project;
}

export function duplicateLayerInScene(
  project: StudioProject,
  sceneId: string,
  layerId: string,
  options?: { name?: string }
): { project: StudioProject; layer: SceneLayer | null } {
  const targetScene = project.scenes.find((s) => s.id === sceneId);
  if (!targetScene) return { project, layer: null };

  const ordered = normalizeLayerZIndexes(targetScene.layers);
  const idx = ordered.findIndex((l) => l.id === layerId);
  if (idx === -1) return { project, layer: null };

  const orig = ordered[idx];
  const now = Date.now();
  const duplicated: SceneLayer = {
    ...orig,
    id: createStudioId('layer'),
    // Comparte exactamente el mismo sourceId sin duplicar la fuente multimedia subyacente
    sourceId: orig.sourceId,
    name: options?.name?.trim() || `${orig.name} (Copia)`,
    locked: false,
    transform: clampLayerTransform(orig.transform),
    style: clampLayerStyle(orig.style),
    processing: orig.processing
      ? {
          ...orig.processing,
          adjustments: orig.processing.adjustments
            ? { ...orig.processing.adjustments }
            : undefined,
          stabilization: orig.processing.stabilization
            ? { ...orig.processing.stabilization }
            : undefined,
          focus: orig.processing.focus ? { ...orig.processing.focus } : undefined,
          background: orig.processing.background
            ? { ...orig.processing.background }
            : undefined,
        }
      : undefined,
  };

  const inserted = [...ordered];
  inserted.splice(idx + 1, 0, duplicated);
  const normalizedLayers = inserted.map((l, zIdx) => ({ ...l, zIndex: zIdx }));
  const finalLayer = normalizedLayers.find((l) => l.id === duplicated.id) ?? duplicated;

  return {
    layer: finalLayer,
    project: {
      ...project,
      scenes: project.scenes.map((scene) =>
        scene.id === sceneId
          ? {
              ...scene,
              layers: normalizedLayers,
              updatedAt: now,
            }
          : scene
      ),
      updatedAt: now,
    },
  };
}

export function resetLayerTransformInScene(
  project: StudioProject,
  sceneId: string,
  layerId: string
): StudioProject {
  return updateLayerTransform(project, sceneId, layerId, DEFAULT_LAYER_TRANSFORM);
}

export function resetLayerStyleInScene(
  project: StudioProject,
  sceneId: string,
  layerId: string
): StudioProject {
  const scene = project.scenes.find((s) => s.id === sceneId);
  const layer = scene?.layers.find((l) => l.id === layerId);
  if (!scene || !layer || layer.locked) return project;
  return updateLayerStyle(project, sceneId, layerId, DEFAULT_LAYER_STYLE);
}

export function reorderSceneLayers(
  project: StudioProject,
  sceneId: string,
  orderedLayerIds: string[]
): StudioProject {
  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) return project;

  const byId = new Map(scene.layers.map((l) => [l.id, l]));
  const reordered: SceneLayer[] = [];
  const seen = new Set<string>();

  for (const id of orderedLayerIds) {
    const found = byId.get(id);
    if (found && !seen.has(id)) {
      reordered.push({ ...found, zIndex: reordered.length });
      seen.add(id);
    }
  }
  for (const layer of scene.layers) {
    if (!seen.has(layer.id)) {
      reordered.push({ ...layer, zIndex: reordered.length });
    }
  }

  const now = Date.now();
  return {
    ...project,
    scenes: project.scenes.map((s) =>
      s.id === sceneId ? { ...s, layers: reordered, updatedAt: now } : s
    ),
    updatedAt: now,
  };
}

export function moveLayerOrder(
  project: StudioProject,
  sceneId: string,
  layerId: string,
  direction: 'up' | 'down' | 'top' | 'bottom'
): StudioProject {
  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) return project;

  const sorted = normalizeLayerZIndexes(scene.layers);
  const idx = sorted.findIndex((l) => l.id === layerId);
  if (idx === -1) return project;

  let targetIdx = idx;
  if (direction === 'up') targetIdx = Math.min(sorted.length - 1, idx + 1);
  else if (direction === 'down') targetIdx = Math.max(0, idx - 1);
  else if (direction === 'top') targetIdx = sorted.length - 1;
  else if (direction === 'bottom') targetIdx = 0;

  if (targetIdx === idx) return project;
  const [moved] = sorted.splice(idx, 1);
  sorted.splice(targetIdx, 0, moved);

  return reorderSceneLayers(
    project,
    sceneId,
    sorted.map((l) => l.id)
  );
}

export function setLayerVisibility(
  project: StudioProject,
  sceneId: string,
  layerId: string,
  visible: boolean
): StudioProject {
  let changed = false;
  const now = Date.now();
  const nextScenes = project.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene;
    return {
      ...scene,
      layers: scene.layers.map((layer) => {
        if (layer.id !== layerId || layer.visible === visible) return layer;
        changed = true;
        return { ...layer, visible };
      }),
      updatedAt: now,
    };
  });
  return changed ? { ...project, scenes: nextScenes, updatedAt: now } : project;
}

export function setLayerLocked(
  project: StudioProject,
  sceneId: string,
  layerId: string,
  locked: boolean
): StudioProject {
  let changed = false;
  const now = Date.now();
  const nextScenes = project.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene;
    return {
      ...scene,
      layers: scene.layers.map((layer) => {
        if (layer.id !== layerId || layer.locked === locked) return layer;
        changed = true;
        return { ...layer, locked };
      }),
      updatedAt: now,
    };
  });
  return changed ? { ...project, scenes: nextScenes, updatedAt: now } : project;
}

export function updateLayerTransform(
  project: StudioProject,
  sceneId: string,
  layerId: string,
  transformPatch: Partial<LayerTransform>,
  options?: { ignoreLock?: boolean }
): StudioProject {
  let changed = false;
  const now = Date.now();
  const nextScenes = project.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene;
    return {
      ...scene,
      layers: scene.layers.map((layer) => {
        if (layer.id !== layerId) return layer;
        if (layer.locked && !options?.ignoreLock) return layer;
        changed = true;
        return {
          ...layer,
          transform: clampLayerTransform(transformPatch, layer.transform),
        };
      }),
      updatedAt: now,
    };
  });
  return changed ? { ...project, scenes: nextScenes, updatedAt: now } : project;
}

export function updateMultipleLayerTransforms(
  project: StudioProject,
  sceneId: string,
  patchesByLayerId: Map<string, Partial<LayerTransform>>
): StudioProject {
  if (patchesByLayerId.size === 0) return project;
  let changed = false;
  const now = Date.now();
  const nextScenes = project.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene;
    return {
      ...scene,
      layers: scene.layers.map((layer) => {
        const patch = patchesByLayerId.get(layer.id);
        if (!patch || layer.locked) return layer;
        changed = true;
        return {
          ...layer,
          transform: clampLayerTransform(patch, layer.transform),
        };
      }),
      updatedAt: now,
    };
  });
  return changed ? { ...project, scenes: nextScenes, updatedAt: now } : project;
}

export function updateLayerStyle(
  project: StudioProject,
  sceneId: string,
  layerId: string,
  stylePatch: Partial<LayerStyle>
): StudioProject {
  let changed = false;
  const now = Date.now();
  const nextScenes = project.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene;
    return {
      ...scene,
      layers: scene.layers.map((layer) => {
        if (layer.id !== layerId) return layer;
        changed = true;
        return {
          ...layer,
          style: clampLayerStyle(stylePatch, layer.style),
        };
      }),
      updatedAt: now,
    };
  });
  return changed ? { ...project, scenes: nextScenes, updatedAt: now } : project;
}

export function updateLayerProcessing(
  project: StudioProject,
  sceneId: string,
  layerId: string,
  processingPatch: Partial<LayerProcessing>,
  overrideSourceProcessing = true
): StudioProject {
  let changed = false;
  const now = Date.now();
  const nextScenes = project.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene;
    return {
      ...scene,
      layers: scene.layers.map((layer) => {
        if (layer.id !== layerId) return layer;
        changed = true;
        return {
          ...layer,
          overrideSourceProcessing,
          processing: {
            ...layer.processing,
            ...processingPatch,
          },
        };
      }),
      updatedAt: now,
    };
  });
  return changed ? { ...project, scenes: nextScenes, updatedAt: now } : project;
}

/**
 * Resuelve la configuración efectiva de procesamiento visual combinando:
 * base por defecto -> ajustes compartidos de la fuente -> sobrescritura de la instancia en escena.
 */
export function resolveEffectiveLayerProcessing(
  layer: SceneLayer,
  source?: StudioSource
): LayerProcessing {
  const base = createDefaultLayerProcessing();
  const shared = source?.sharedProcessing;
  const instance = layer.overrideSourceProcessing ? layer.processing : undefined;

  return {
    filterId: instance?.filterId ?? shared?.filterId ?? base.filterId,
    effectId: instance?.effectId ?? shared?.effectId ?? base.effectId,
    adjustments: {
      ...base.adjustments,
      ...shared?.adjustments,
      ...instance?.adjustments,
    },
    stabilization: {
      ...base.stabilization,
      ...shared?.stabilization,
      ...instance?.stabilization,
    },
    focus: {
      ...base.focus,
      ...shared?.focus,
      ...instance?.focus,
    },
    background: {
      ...base.background,
      ...shared?.background,
      ...instance?.background,
    },
  };
}

const RUNTIME_CONSTRUCTOR_NAMES = new Set([
  'MediaStream',
  'MediaStreamTrack',
  'HTMLVideoElement',
  'HTMLImageElement',
  'HTMLAudioElement',
  'HTMLCanvasElement',
  'AudioContext',
  'AudioNode',
  'GainNode',
  'AnalyserNode',
  'DynamicsCompressorNode',
  'WebGLTexture',
  'WebGLFramebuffer',
  'WebGLProgram',
  'WebGLRenderingContext',
  'WebGL2RenderingContext',
  'Blob',
  'File',
]);

export function isRuntimeResourceObject(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const ctorName = (value as { constructor?: { name?: string } }).constructor?.name;
  if (ctorName && RUNTIME_CONSTRUCTOR_NAMES.has(ctorName)) return true;

  if (typeof MediaStream !== 'undefined' && value instanceof MediaStream) return true;
  if (typeof HTMLVideoElement !== 'undefined' && value instanceof HTMLVideoElement) return true;
  if (typeof HTMLImageElement !== 'undefined' && value instanceof HTMLImageElement) return true;
  if (typeof HTMLCanvasElement !== 'undefined' && value instanceof HTMLCanvasElement) return true;
  if (typeof AudioNode !== 'undefined' && value instanceof AudioNode) return true;
  if (typeof WebGLTexture !== 'undefined' && value instanceof WebGLTexture) return true;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true;

  return false;
}

export function containsRuntimeResources(value: unknown, visited = new Set<unknown>()): boolean {
  if (!value || typeof value !== 'object') return false;
  if (visited.has(value)) return false;
  if (isRuntimeResourceObject(value)) return true;

  visited.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => containsRuntimeResources(item, visited));
  }
  return Object.values(value as Record<string, unknown>).some((prop) =>
    containsRuntimeResources(prop, visited)
  );
}

export function validateProjectReferences(project: StudioProject): ProjectValidationResult {
  const issues: ProjectValidationIssue[] = [];

  if (containsRuntimeResources(project)) {
    issues.push({
      code: 'runtime-resource-detected',
      message: 'El proyecto serializable contiene referencias activas de ejecución (MediaStream/DOM/WebGL).',
    });
  }

  if (!Array.isArray(project.scenes) || project.scenes.length === 0) {
    issues.push({
      code: 'empty-scenes',
      message: 'El proyecto debe contener al menos una escena.',
    });
  }

  const sourceIds = new Set<string>();
  for (const src of project.sources) {
    if (sourceIds.has(src.id)) {
      issues.push({
        code: 'duplicate-source-id',
        sourceId: src.id,
        message: `Identificador de fuente duplicado: ${src.id}`,
      });
    }
    sourceIds.add(src.id);
  }

  const sceneIds = new Set<string>();
  for (const scene of project.scenes) {
    if (sceneIds.has(scene.id)) {
      issues.push({
        code: 'duplicate-scene-id',
        sceneId: scene.id,
        message: `Identificador de escena duplicado: ${scene.id}`,
      });
    }
    sceneIds.add(scene.id);

    for (const audioId of scene.audioSourceIds) {
      if (!sourceIds.has(audioId)) {
        issues.push({
          code: 'orphan-audio-source',
          sceneId: scene.id,
          sourceId: audioId,
          message: `La escena ${scene.id} referencia una fuente de audio inexistente (${audioId}).`,
        });
      }
    }

    const layerIds = new Set<string>();
    for (const layer of scene.layers) {
      if (layerIds.has(layer.id)) {
        issues.push({
          code: 'duplicate-layer-id',
          sceneId: scene.id,
          layerId: layer.id,
          message: `Identificador de capa duplicado en escena ${scene.id}: ${layer.id}`,
        });
      }
      layerIds.add(layer.id);

      if (!sourceIds.has(layer.sourceId)) {
        issues.push({
          code: 'orphan-layer-source',
          sceneId: scene.id,
          layerId: layer.id,
          sourceId: layer.sourceId,
          message: `La capa ${layer.id} referencia una fuente inexistente (${layer.sourceId}).`,
        });
      }

      const t = layer.transform;
      const crop = t.crop;
      const invalidBounds =
        !Number.isFinite(t.x) ||
        !Number.isFinite(t.y) ||
        !Number.isFinite(t.width) ||
        !Number.isFinite(t.height) ||
        t.width < STUDIO_COORDINATE_SYSTEM.minLayerDimension ||
        t.height < STUDIO_COORDINATE_SYSTEM.minLayerDimension ||
        crop.left + crop.right >= 1 ||
        crop.top + crop.bottom >= 1 ||
        layer.style.opacity < 0 ||
        layer.style.opacity > 1;

      if (invalidBounds) {
        issues.push({
          code: 'invalid-transform',
          sceneId: scene.id,
          layerId: layer.id,
          message: `Transformación o recorte fuera de límites en capa ${layer.id}.`,
        });
      }
    }
  }

  if (project.scenes.length > 0 && !sceneIds.has(project.activeSceneId)) {
    issues.push({
      code: 'invalid-active-scene',
      sceneId: project.activeSceneId,
      message: `La escena activa (${project.activeSceneId}) no existe en el proyecto.`,
    });
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
