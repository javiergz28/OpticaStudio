import {
  clampLayerStyle,
  clampLayerTransform,
  containsRuntimeResources,
  createEmptyProject,
  createStudioId,
  DEFAULT_RECORDING_PROFILE,
  DEFAULT_SCENE_TRANSITION,
  isRuntimeResourceObject,
  normalizeLayerZIndexes,
  validateProjectReferences,
} from '../engine/sceneEngine';
import { instantiatePresetProject } from '../engine/scenePresets';
import {
  CURRENT_STUDIO_SCHEMA_VERSION,
  type SceneLayer,
  type StudioProject,
  type StudioScene,
  type StudioSource,
} from '../types/studio';

/**
 * Base de datos IndexedDB independiente de `optica_studio_db` (galería multimedia)
 * para evitar conflictos de versión (`VersionError`) y garantizar separación total.
 */
export const STUDIO_PROJECTS_DB_NAME = 'optica_studio_projects_db';
export const STUDIO_PROJECTS_DB_VERSION = 1;
export const STUDIO_PROJECTS_STORE_NAME = 'projects';
export const ACTIVE_PROJECT_POINTER_KEY = 'optica_studio_active_project_v1';

const MAX_INLINE_ASSET_REF_CHARS = 128 * 1024; // Evita embeber archivos multimedia grandes en JSON

export interface StudioStorageAdapter {
  getItem: (projectId: string) => Promise<string | null>;
  putItem: (projectId: string, json: string) => Promise<void>;
  deleteItem: (projectId: string) => Promise<void>;
  listIds: () => Promise<string[]>;
  getActiveProjectId: () => string | null;
  setActiveProjectId: (projectId: string) => void;
}

export interface ProjectLoadResult {
  project: StudioProject;
  source: 'stored' | 'migrated' | 'recovered' | 'default';
  migratedFromVersion: number | null;
  warnings: string[];
}

export interface ProjectSaveResult {
  saved: boolean;
  bytes: number;
  error?: string;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === 'object' && !Array.isArray(v));
}

function sanitizeSerializableValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    // Nunca persistir data URLs masivos dentro del JSON de escena
    if (value.startsWith('data:') && value.length > MAX_INLINE_ASSET_REF_CHARS) {
      return '';
    }
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'object') return undefined;
  if (isRuntimeResourceObject(value)) return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      const cleaned = sanitizeSerializableValue(item, seen);
      if (cleaned !== undefined) out.push(cleaned);
    }
    return out;
  }

  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(record)) {
    const cleaned = sanitizeSerializableValue(prop, seen);
    if (cleaned !== undefined) {
      out[key] = cleaned;
    }
  }
  return out;
}

const VALID_SOURCE_KINDS = new Set([
  'camera',
  'window',
  'screen',
  'image',
  'video-file',
  'color',
  'gradient',
  'text',
  'microphone',
  'system-audio',
  'audio-file',
]);

function normalizeSourceRecord(raw: unknown): StudioSource | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.kind !== 'string' || !VALID_SOURCE_KINDS.has(raw.kind)) return null;

  const id =
    typeof raw.id === 'string' && raw.id.trim().length > 0
      ? raw.id
      : createStudioId(`src_${raw.kind}`);
  const name =
    typeof raw.name === 'string' && raw.name.trim().length > 0
      ? raw.name
      : `Fuente ${raw.kind}`;
  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
      ? raw.createdAt
      : Date.now();

  const cleaned = sanitizeSerializableValue(raw);
  if (!isPlainObject(cleaned)) return null;

  return {
    ...(cleaned as unknown as StudioSource),
    id,
    name,
    createdAt,
  };
}

function normalizeLayerRecord(
  raw: unknown,
  validSourceIds: Set<string>,
  fallbackIndex: number
): SceneLayer | null {
  if (!isPlainObject(raw)) return null;
  const sourceId = typeof raw.sourceId === 'string' ? raw.sourceId : '';
  if (!sourceId || !validSourceIds.has(sourceId)) return null;

  const id =
    typeof raw.id === 'string' && raw.id.trim().length > 0
      ? raw.id
      : createStudioId('layer');
  const name =
    typeof raw.name === 'string' && raw.name.trim().length > 0
      ? raw.name
      : `Capa ${fallbackIndex + 1}`;
  const zIndex =
    typeof raw.zIndex === 'number' && Number.isFinite(raw.zIndex)
      ? raw.zIndex
      : fallbackIndex;

  const transformRaw = isPlainObject(raw.transform) ? raw.transform : {};
  const styleRaw = isPlainObject(raw.style) ? raw.style : {};

  return {
    id,
    sourceId,
    name,
    zIndex,
    visible: typeof raw.visible === 'boolean' ? raw.visible : true,
    locked: typeof raw.locked === 'boolean' ? raw.locked : false,
    transform: clampLayerTransform(transformRaw as Partial<SceneLayer['transform']>),
    style: clampLayerStyle(styleRaw as Partial<SceneLayer['style']>),
    overrideSourceProcessing:
      typeof raw.overrideSourceProcessing === 'boolean'
        ? raw.overrideSourceProcessing
        : isPlainObject(raw.processing),
    processing: isPlainObject(raw.processing)
      ? (sanitizeSerializableValue(raw.processing) as SceneLayer['processing'])
      : undefined,
  };
}

function normalizeSceneRecord(
  raw: unknown,
  validSourceIds: Set<string>,
  fallbackIndex: number
): StudioScene | null {
  if (!isPlainObject(raw)) return null;
  const id =
    typeof raw.id === 'string' && raw.id.trim().length > 0
      ? raw.id
      : createStudioId('scene');
  const name =
    typeof raw.name === 'string' && raw.name.trim().length > 0
      ? raw.name
      : `Escena ${fallbackIndex + 1}`;

  const rawLayers = Array.isArray(raw.layers) ? raw.layers : [];
  const layers: SceneLayer[] = [];
  const seenLayerIds = new Set<string>();
  rawLayers.forEach((rawLayer, idx) => {
    const normalized = normalizeLayerRecord(rawLayer, validSourceIds, idx);
    if (!normalized) return;
    const uniqueLayer = seenLayerIds.has(normalized.id)
      ? { ...normalized, id: createStudioId('layer') }
      : normalized;
    seenLayerIds.add(uniqueLayer.id);
    layers.push(uniqueLayer);
  });

  const audioIds = Array.isArray(raw.audioSourceIds)
    ? Array.from(
        new Set(
          raw.audioSourceIds.filter(
            (aid): aid is string => typeof aid === 'string' && validSourceIds.has(aid)
          )
        )
      )
    : [];

  const transitionRaw = isPlainObject(raw.transition) ? raw.transition : {};
  const now = Date.now();

  return {
    id,
    name,
    presetId: typeof raw.presetId === 'string' ? (raw.presetId as StudioScene['presetId']) : 'custom',
    backgroundColor:
      typeof raw.backgroundColor === 'string' && raw.backgroundColor.trim()
        ? raw.backgroundColor
        : '#06070a',
    transition: {
      ...DEFAULT_SCENE_TRANSITION,
      ...(transitionRaw as Partial<StudioScene['transition']>),
    },
    layers: normalizeLayerZIndexes(layers),
    audioSourceIds: audioIds,
    createdAt:
      typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt:
      typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
  };
}

/**
 * Valida y migra de forma no destructiva datos persistidos de versiones anteriores (ej. v0 sin esquema)
 * hacia la versión actual del esquema (`CURRENT_STUDIO_SCHEMA_VERSION`), recuperando errores limpiamente.
 */
export function migrateAndValidateProject(rawInput: unknown): {
  project: StudioProject;
  migratedFromVersion: number | null;
  recovered: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (!isPlainObject(rawInput)) {
    warnings.push('Estructura de proyecto inválida; se creó un proyecto inicial recuperado.');
    return {
      project: instantiatePresetProject('camera-primary'),
      migratedFromVersion: null,
      recovered: true,
      warnings,
    };
  }

  const rawVersion =
    typeof rawInput.schemaVersion === 'number' && Number.isFinite(rawInput.schemaVersion)
      ? rawInput.schemaVersion
      : 0;

  const migratedFromVersion = rawVersion < CURRENT_STUDIO_SCHEMA_VERSION ? rawVersion : null;

  if (rawVersion > CURRENT_STUDIO_SCHEMA_VERSION) {
    warnings.push(
      `Versión de esquema (${rawVersion}) superior a la soportada (${CURRENT_STUDIO_SCHEMA_VERSION}); normalizando de forma segura.`
    );
  }

  const rawSources = Array.isArray(rawInput.sources) ? rawInput.sources : [];
  const sources: StudioSource[] = [];
  const validSourceIds = new Set<string>();
  for (const rawSrc of rawSources) {
    const normalized = normalizeSourceRecord(rawSrc);
    if (!normalized) {
      warnings.push('Se omitió una fuente corrupta durante la carga.');
      continue;
    }
    const deduped = validSourceIds.has(normalized.id)
      ? { ...normalized, id: createStudioId(`src_${normalized.kind}`) }
      : normalized;
    validSourceIds.add(deduped.id);
    sources.push(deduped);
  }

  const rawScenes = Array.isArray(rawInput.scenes) ? rawInput.scenes : [];
  const scenes: StudioScene[] = [];
  const seenSceneIds = new Set<string>();
  rawScenes.forEach((rawScene, idx) => {
    const normalized = normalizeSceneRecord(rawScene, validSourceIds, idx);
    if (!normalized) {
      warnings.push('Se omitió una escena corrupta durante la carga.');
      return;
    }
    const deduped = seenSceneIds.has(normalized.id)
      ? { ...normalized, id: createStudioId('scene') }
      : normalized;
    seenSceneIds.add(deduped.id);
    scenes.push(deduped);
  });

  if (scenes.length === 0) {
    warnings.push('El proyecto no contenía escenas válidas; se restauró una escena base.');
    const fallback = createEmptyProject({
      name: typeof rawInput.name === 'string' ? rawInput.name : undefined,
    });
    const merged: StudioProject = {
      ...fallback,
      id:
        typeof rawInput.id === 'string' && rawInput.id.trim().length > 0
          ? rawInput.id
          : fallback.id,
      sources,
    };
    return {
      project: merged,
      migratedFromVersion,
      recovered: true,
      warnings,
    };
  }

  const requestedActiveId =
    typeof rawInput.activeSceneId === 'string' ? rawInput.activeSceneId : '';
  const activeSceneId = seenSceneIds.has(requestedActiveId) ? requestedActiveId : scenes[0].id;
  if (requestedActiveId && !seenSceneIds.has(requestedActiveId)) {
    warnings.push('La escena activa guardada ya no existía; se seleccionó la primera escena válida.');
  }

  const requestedPreviewId =
    typeof rawInput.previewSceneId === 'string' ? rawInput.previewSceneId : null;
  const previewSceneId =
    requestedPreviewId && seenSceneIds.has(requestedPreviewId) ? requestedPreviewId : null;

  const recRaw = isPlainObject(rawInput.recordingProfile) ? rawInput.recordingProfile : {};
  const now = Date.now();

  const migrated: StudioProject = {
    schemaVersion: CURRENT_STUDIO_SCHEMA_VERSION,
    id:
      typeof rawInput.id === 'string' && rawInput.id.trim().length > 0
        ? rawInput.id
        : createStudioId('proj'),
    name:
      typeof rawInput.name === 'string' && rawInput.name.trim().length > 0
        ? rawInput.name
        : 'Proyecto Óptica Studio',
    activeSceneId,
    previewSceneId,
    recordingProfile: {
      ...DEFAULT_RECORDING_PROFILE,
      ...(recRaw as Partial<StudioProject['recordingProfile']>),
    },
    sources,
    scenes,
    createdAt:
      typeof rawInput.createdAt === 'number' && Number.isFinite(rawInput.createdAt)
        ? rawInput.createdAt
        : now,
    updatedAt:
      typeof rawInput.updatedAt === 'number' && Number.isFinite(rawInput.updatedAt)
        ? rawInput.updatedAt
        : now,
  };

  return {
    project: migrated,
    migratedFromVersion,
    recovered: warnings.length > 0,
    warnings,
  };
}

export function serializeStudioProject(project: StudioProject): string {
  if (containsRuntimeResources(project)) {
    throw new Error('No se permite serializar un proyecto que contiene recursos multimedia activos.');
  }
  const validation = validateProjectReferences(project);
  if (!validation.valid) {
    throw new Error(`Proyecto inválido al serializar: ${validation.issues[0]?.message || 'error'}`);
  }
  const cleaned = sanitizeSerializableValue(project);
  return JSON.stringify(cleaned);
}

export function deserializeStudioProject(json: string): {
  project: StudioProject;
  migratedFromVersion: number | null;
  recovered: boolean;
  warnings: string[];
} {
  try {
    const parsed = JSON.parse(json) as unknown;
    return migrateAndValidateProject(parsed);
  } catch {
    return {
      project: instantiatePresetProject('camera-primary'),
      migratedFromVersion: null,
      recovered: true,
      warnings: ['JSON persistido corrupto; se recuperó un proyecto válido inicial.'],
    };
  }
}

// ============================================================================
// ADAPTADORES DE ALMACENAMIENTO (IndexedDB Web/Electron + In-Memory para tests)
// ============================================================================

function openStudioProjectsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(STUDIO_PROJECTS_DB_NAME, STUDIO_PROJECTS_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STUDIO_PROJECTS_STORE_NAME)) {
        db.createObjectStore(STUDIO_PROJECTS_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function createBrowserStudioStorageAdapter(): StudioStorageAdapter {
  const memoryFallback = new Map<string, string>();
  let activeFallback: string | null = null;

  return {
    async getItem(projectId: string): Promise<string | null> {
      try {
        const db = await openStudioProjectsDB();
        return await new Promise<string | null>((resolve, reject) => {
          const tx = db.transaction(STUDIO_PROJECTS_STORE_NAME, 'readonly');
          const req = tx.objectStore(STUDIO_PROJECTS_STORE_NAME).get(projectId);
          req.onsuccess = () => {
            const rec = req.result as { id: string; json: string } | undefined;
            resolve(rec?.json ?? null);
          };
          req.onerror = () => reject(req.error);
        });
      } catch {
        return memoryFallback.get(projectId) ?? null;
      }
    },

    async putItem(projectId: string, json: string): Promise<void> {
      memoryFallback.set(projectId, json);
      try {
        const db = await openStudioProjectsDB();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STUDIO_PROJECTS_STORE_NAME, 'readwrite');
          tx.objectStore(STUDIO_PROJECTS_STORE_NAME).put({
            id: projectId,
            json,
            updatedAt: Date.now(),
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch {
        // Fallback en memoria activo si IndexedDB está restringido
      }
    },

    async deleteItem(projectId: string): Promise<void> {
      memoryFallback.delete(projectId);
      try {
        const db = await openStudioProjectsDB();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STUDIO_PROJECTS_STORE_NAME, 'readwrite');
          tx.objectStore(STUDIO_PROJECTS_STORE_NAME).delete(projectId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch {
        // Ignorar
      }
    },

    async listIds(): Promise<string[]> {
      try {
        const db = await openStudioProjectsDB();
        return await new Promise<string[]>((resolve, reject) => {
          const tx = db.transaction(STUDIO_PROJECTS_STORE_NAME, 'readonly');
          const req = tx.objectStore(STUDIO_PROJECTS_STORE_NAME).getAllKeys();
          req.onsuccess = () => resolve((req.result as string[]) || []);
          req.onerror = () => reject(req.error);
        });
      } catch {
        return Array.from(memoryFallback.keys());
      }
    },

    getActiveProjectId(): string | null {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(ACTIVE_PROJECT_POINTER_KEY);
        }
      } catch {
        // Ignorar
      }
      return activeFallback;
    },

    setActiveProjectId(projectId: string): void {
      activeFallback = projectId;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(ACTIVE_PROJECT_POINTER_KEY, projectId);
        }
      } catch {
        // Ignorar
      }
    },
  };
}

export function createInMemoryStudioStorageAdapter(): StudioStorageAdapter {
  const store = new Map<string, string>();
  let activeId: string | null = null;

  return {
    async getItem(projectId: string): Promise<string | null> {
      return store.get(projectId) ?? null;
    },
    async putItem(projectId: string, json: string): Promise<void> {
      store.set(projectId, json);
    },
    async deleteItem(projectId: string): Promise<void> {
      store.delete(projectId);
    },
    async listIds(): Promise<string[]> {
      return Array.from(store.keys());
    },
    getActiveProjectId(): string | null {
      return activeId;
    },
    setActiveProjectId(projectId: string): void {
      activeId = projectId;
    },
  };
}

export const defaultStudioStorageAdapter = createBrowserStudioStorageAdapter();

export async function saveStudioProject(
  project: StudioProject,
  adapter: StudioStorageAdapter = defaultStudioStorageAdapter
): Promise<ProjectSaveResult> {
  try {
    const json = serializeStudioProject(project);
    await adapter.putItem(project.id, json);
    adapter.setActiveProjectId(project.id);
    return { saved: true, bytes: json.length };
  } catch (err) {
    return {
      saved: false,
      bytes: 0,
      error: err instanceof Error ? err.message : 'Error guardando proyecto',
    };
  }
}

export async function loadStudioProject(
  projectId?: string,
  adapter: StudioStorageAdapter = defaultStudioStorageAdapter
): Promise<ProjectLoadResult> {
  const targetId = projectId || adapter.getActiveProjectId() || (await adapter.listIds())[0];
  if (!targetId) {
    return {
      project: instantiatePresetProject('camera-primary'),
      source: 'default',
      migratedFromVersion: null,
      warnings: [],
    };
  }

  const rawJson = await adapter.getItem(targetId);
  if (!rawJson) {
    return {
      project: instantiatePresetProject('camera-primary'),
      source: 'default',
      migratedFromVersion: null,
      warnings: [],
    };
  }

  const parsed = deserializeStudioProject(rawJson);
  if (parsed.recovered || parsed.migratedFromVersion !== null) {
    // Guardar versión migrada/normalizada de forma no destructiva
    await saveStudioProject(parsed.project, adapter);
    return {
      project: parsed.project,
      source: parsed.recovered ? 'recovered' : 'migrated',
      migratedFromVersion: parsed.migratedFromVersion,
      warnings: parsed.warnings,
    };
  }

  return {
    project: parsed.project,
    source: 'stored',
    migratedFromVersion: null,
    warnings: [],
  };
}

export function createControlledProjectSaver(
  adapter: StudioStorageAdapter = defaultStudioStorageAdapter,
  debounceMs = 300
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latestProject: StudioProject | null = null;

  return {
    schedule(project: StudioProject): void {
      latestProject = project;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (latestProject) {
          void saveStudioProject(latestProject, adapter);
        }
        timer = null;
      }, debounceMs);
    },
    async flush(): Promise<ProjectSaveResult | null> {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!latestProject) return null;
      return saveStudioProject(latestProject, adapter);
    },
    cancel(): void {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      latestProject = null;
    },
  };
}
