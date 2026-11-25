import type {
  AudioFileSourceDefinition,
  CameraSourceDefinition,
  ColorSourceDefinition,
  GradientSourceDefinition,
  ImageSourceDefinition,
  MicrophoneSourceDefinition,
  ScreenSourceDefinition,
  SourceExecutionStatus,
  SourceRuntimeResources,
  SourceRuntimeState,
  StudioProject,
  StudioScene,
  StudioSource,
  StudioSourceKind,
  SystemAudioSourceDefinition,
  TextSourceDefinition,
  VideoFileSourceDefinition,
  WindowSourceDefinition,
} from '../types/studio';

// ============================================================================
// TIPOS PÚBLICOS DE PLATAFORMA, CONSUMIDORES Y METADATOS DE EJECUCIÓN
// ============================================================================

export type SourceConsumerKind =
  | 'active-scene'
  | 'staged-scene'
  | 'preview'
  | 'program-compositor'
  | 'audio-mixer'
  | 'custom';

export interface SourceConsumer {
  id: string;
  kind: SourceConsumerKind;
  label?: string;
}

export type SourceErrorCode =
  | 'permission-denied'
  | 'device-not-found'
  | 'device-busy-or-unreadable'
  | 'overconstrained'
  | 'user-canceled'
  | 'system-audio-unavailable'
  | 'media-load-failed'
  | 'device-conflict'
  | 'initialization-failed';

export type SourceDisconnectionReason =
  | 'none'
  | 'window-or-share-closed'
  | 'device-disconnected'
  | 'user-released'
  | 'disposed';

export type CameraDeviceConflictPolicy =
  | 'reuse-existing'
  | 'prefer-highest'
  | 'reject-incompatible';

export interface MediaTrackSettingsSnapshot {
  width?: number;
  height?: number;
  frameRate?: number;
  deviceId?: string;
  aspectRatio?: number;
  displaySurface?: string;
  facingMode?: string;
  sampleRate?: number;
  channelCount?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
}

export interface MediaTrackCapabilitiesSnapshot {
  width?: { min?: number; max?: number };
  height?: { min?: number; max?: number };
  frameRate?: { min?: number; max?: number };
  deviceId?: string;
}

export interface MediaTrackLike {
  id: string;
  kind: 'video' | 'audio' | string;
  label?: string;
  enabled: boolean;
  muted?: boolean;
  readyState: 'live' | 'ended' | string;
  stop: () => void;
  getSettings?: () => MediaTrackSettingsSnapshot;
  getCapabilities?: () => MediaTrackCapabilitiesSnapshot;
  addEventListener?: (type: string, listener: (event?: unknown) => void) => void;
  removeEventListener?: (type: string, listener: (event?: unknown) => void) => void;
  onended?: ((event?: unknown) => void) | null;
  onmute?: ((event?: unknown) => void) | null;
  onunmute?: ((event?: unknown) => void) | null;
}

export type MediaStreamTrackLike = MediaTrackLike;

export interface MediaStreamLike {
  id: string;
  active?: boolean;
  getTracks: () => MediaStreamTrackLike[];
  getVideoTracks: () => MediaStreamTrackLike[];
  getAudioTracks: () => MediaStreamTrackLike[];
  addTrack?: (track: MediaStreamTrackLike) => void;
  removeTrack?: (track: MediaStreamTrackLike) => void;
}

export interface MediaDeviceDescriptor {
  deviceId: string;
  kind: 'videoinput' | 'audioinput' | 'audiooutput' | string;
  label: string;
  groupId?: string;
}

export interface MediaImageElementLike {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  complete?: boolean;
  addEventListener?: (type: string, listener: (event?: unknown) => void) => void;
  removeEventListener?: (type: string, listener: (event?: unknown) => void) => void;
  onload?: (() => void) | null;
  onerror?: ((err?: unknown) => void) | null;
}

export interface MediaVideoElementLike {
  src: string;
  srcObject: unknown;
  loop: boolean;
  muted: boolean;
  playbackRate: number;
  videoWidth: number;
  videoHeight: number;
  duration?: number;
  readyState?: number;
  paused?: boolean;
  play?: () => Promise<void> | void;
  pause?: () => void;
  load?: () => void;
  addEventListener?: (type: string, listener: (event?: unknown) => void) => void;
  removeEventListener?: (type: string, listener: (event?: unknown) => void) => void;
}

export interface MediaAudioElementLike {
  src: string;
  srcObject: unknown;
  loop: boolean;
  muted: boolean;
  duration?: number;
  readyState?: number;
  paused?: boolean;
  play?: () => Promise<void> | void;
  pause?: () => void;
  load?: () => void;
  addEventListener?: (type: string, listener: (event?: unknown) => void) => void;
  removeEventListener?: (type: string, listener: (event?: unknown) => void) => void;
}

export interface MediaDevicesAdapter {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStreamLike>;
  getDisplayMedia: (constraints: DisplayMediaStreamOptions) => Promise<MediaStreamLike>;
  enumerateDevices?: () => Promise<MediaDeviceDescriptor[]>;
  onDeviceChange?: (listener: () => void) => () => void;
}

export interface MediaElementFactoryAdapter {
  createImageElement: () => MediaImageElementLike;
  createVideoElement: () => MediaVideoElementLike;
  createAudioElement: () => MediaAudioElementLike;
  attachStreamToVideo?: (video: MediaVideoElementLike, stream: MediaStreamLike) => Promise<void> | void;
}

export interface AssetUrlAdapter {
  resolveAssetBlob?: (assetRef: string) => Promise<Blob | null> | Blob | null;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
}

export interface PlatformMediaCapabilities {
  runtime: 'electron-desktop' | 'web-browser' | 'headless';
  platform: string;
  arch: string;
  hasGetUserMedia: boolean;
  hasGetDisplayMedia: boolean;
  hasEnumerateDevices: boolean;
  hasElectronDesktopPicker: boolean;
  supportsPerAppIsolatedAudioOnMacOS: false;
  supportsSystemLoopbackAudioPrompt: boolean;
  notes: string[];
}

export interface SourceRuntimeDetails {
  errorCode: SourceErrorCode | null;
  disconnectionReason: SourceDisconnectionReason;
  disconnectedAt: number | null;
  trackMuted: boolean;
  hasVideoTrack: boolean;
  hasAudioTrack: boolean;
  effectiveSettings: MediaTrackSettingsSnapshot | null;
  capabilities: MediaTrackCapabilitiesSnapshot | null;
  sharedAudioFromSourceId: string | null;
  sharedVideoFromSourceId: string | null;
  createdObjectUrl: string | null;
  consumerIds: string[];
  referenceCount: number;
  hasPendingOperation: boolean;
}

export interface SourceRuntimeEntry {
  source: StudioSource;
  state: SourceRuntimeState;
  details: SourceRuntimeDetails;
  resources: SourceRuntimeResources;
}

export interface SourceAcquireOptions {
  /** Si el sourceType es `system-audio`, permite vincular la pista de audio de una fuente window/screen ya activa. */
  linkedDisplaySourceId?: string;
  /** Reintentar aunque ya esté en error o desconectado. */
  retryOnError?: boolean;
}

export interface SourceReconnectOptions {
  /** Fuerza nueva adquisición incluso si ya está activa (por ejemplo, cambiar ventana capturada). */
  force?: boolean;
  linkedDisplaySourceId?: string;
}

export interface SourceManagerEvent {
  type:
    | 'entry-registered'
    | 'state-changed'
    | 'consumer-added'
    | 'consumer-removed'
    | 'reconnected'
    | 'disconnected'
    | 'released'
    | 'disposed';
  sourceId: string;
  status: SourceExecutionStatus;
  entry?: SourceRuntimeEntry;
}

export type SourceManagerListener = (event: SourceManagerEvent) => void;

export interface SourceManagerOptions {
  mediaDevices?: MediaDevicesAdapter;
  mediaElements?: MediaElementFactoryAdapter;
  assetUrls?: AssetUrlAdapter;
  cameraDeviceConflictPolicy?: CameraDeviceConflictPolicy;
  now?: () => number;
}

// ============================================================================
// ADAPTADORES POR DEFECTO (WEB + ELECTRON RENDERER, DEGRADACIÓN SEGURA EN NODE)
// ============================================================================

export function detectPlatformMediaCapabilities(): PlatformMediaCapabilities {
  const win = typeof window !== 'undefined' ? window : undefined;
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const desktop = win?.opticaDesktop;
  const isElectron = Boolean(desktop?.isElectron);
  const platform = desktop?.platform ?? (typeof process !== 'undefined' ? process.platform : 'web');
  const arch = desktop?.arch ?? (typeof process !== 'undefined' ? process.arch : 'unknown');

  const hasGetUserMedia = Boolean(nav?.mediaDevices?.getUserMedia);
  const hasGetDisplayMedia = Boolean(nav?.mediaDevices?.getDisplayMedia);
  const hasEnumerateDevices = Boolean(nav?.mediaDevices?.enumerateDevices);

  const notes: string[] = [];
  if (isElectron && platform === 'darwin') {
    notes.push('Captura de ventanas y pantallas mediada por desktopCapturer + selector IPC seguro.');
    notes.push(
      'macOS no aísla audio por aplicación individual sin ScreenCaptureKit nativo; el audio compartido usa loopback del sistema cuando se habilita.'
    );
  } else if (hasGetDisplayMedia) {
    notes.push('Captura de ventanas/pantallas sujeta a consentimiento explícito del usuario vía getDisplayMedia.');
  } else {
    notes.push('Entorno sin APIs multimedia del navegador activas; usar adaptadores inyectables.');
  }

  return {
    runtime: isElectron ? 'electron-desktop' : nav ? 'web-browser' : 'headless',
    platform,
    arch,
    hasGetUserMedia,
    hasGetDisplayMedia,
    hasEnumerateDevices,
    hasElectronDesktopPicker: isElectron,
    supportsPerAppIsolatedAudioOnMacOS: false,
    supportsSystemLoopbackAudioPrompt: hasGetDisplayMedia,
    notes,
  };
}

export function createBrowserMediaDevicesAdapter(): MediaDevicesAdapter {
  return {
    async getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStreamLike> {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        const err = new Error('navigator.mediaDevices.getUserMedia no está disponible en este entorno.');
        err.name = 'NotSupportedError';
        throw err;
      }
      return (await navigator.mediaDevices.getUserMedia(constraints)) as unknown as MediaStreamLike;
    },
    async getDisplayMedia(constraints: DisplayMediaStreamOptions): Promise<MediaStreamLike> {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
        const err = new Error('navigator.mediaDevices.getDisplayMedia no está disponible en este entorno.');
        err.name = 'NotSupportedError';
        throw err;
      }
      return (await navigator.mediaDevices.getDisplayMedia(constraints)) as unknown as MediaStreamLike;
    },
    async enumerateDevices(): Promise<MediaDeviceDescriptor[]> {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
        return [];
      }
      const list = await navigator.mediaDevices.enumerateDevices();
      return list.map((d) => ({
        deviceId: d.deviceId,
        kind: d.kind,
        label: d.label,
        groupId: d.groupId,
      }));
    },
    onDeviceChange(listener: () => void): () => void {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) {
        return () => {};
      }
      navigator.mediaDevices.addEventListener('devicechange', listener);
      return () => {
        navigator.mediaDevices?.removeEventListener('devicechange', listener);
      };
    },
  };
}

export function createBrowserMediaElementFactoryAdapter(): MediaElementFactoryAdapter {
  return {
    createImageElement(): MediaImageElementLike {
      if (typeof Image === 'undefined') {
        throw new Error('HTMLImageElement no disponible fuera del navegador.');
      }
      return new Image() as unknown as MediaImageElementLike;
    },
    createVideoElement(): MediaVideoElementLike {
      if (typeof document === 'undefined') {
        throw new Error('HTMLVideoElement no disponible fuera del navegador.');
      }
      const video = document.createElement('video');
      video.playsInline = true;
      return video as unknown as MediaVideoElementLike;
    },
    createAudioElement(): MediaAudioElementLike {
      if (typeof document === 'undefined') {
        throw new Error('HTMLAudioElement no disponible fuera del navegador.');
      }
      return document.createElement('audio') as unknown as MediaAudioElementLike;
    },
    async attachStreamToVideo(video: MediaVideoElementLike, stream: MediaStreamLike): Promise<void> {
      video.srcObject = stream;
      video.muted = true;
      if (typeof video.play === 'function') {
        try {
          await video.play();
        } catch {
          // Algunos entornos headless o autoplay bloquean play() hasta interacción del usuario
        }
      }
    },
  };
}

export function createBrowserAssetUrlAdapter(): AssetUrlAdapter {
  return {
    createObjectURL(blob: Blob): string {
      if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
        throw new Error('URL.createObjectURL no está disponible.');
      }
      return URL.createObjectURL(blob);
    },
    revokeObjectURL(url: string): void {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url);
      }
    },
  };
}

// ============================================================================
// HELPERS INTERNOS DE CLASIFICACIÓN Y CICLO DE VIDA
// ============================================================================

function classifyMediaError(err: unknown): { code: SourceErrorCode; message: string } {
  const name = (err as { name?: string } | null)?.name || '';
  const rawMessage = err instanceof Error ? err.message : String(err || 'Error desconocido');

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return {
      code: 'permission-denied',
      message: rawMessage || 'Permiso multimedia denegado por el usuario o el sistema.',
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      code: 'device-not-found',
      message: rawMessage || 'Dispositivo multimedia no encontrado o desconectado.',
    };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      code: 'device-busy-or-unreadable',
      message: rawMessage || 'El dispositivo está ocupado o no puede leerse.',
    };
  }
  if (name === 'OverconstrainedError') {
    return {
      code: 'overconstrained',
      message: rawMessage || 'La cámara no admite la resolución o FPS solicitados.',
    };
  }
  if (name === 'AbortError') {
    return {
      code: 'user-canceled',
      message: rawMessage || 'Captura cancelada por el usuario.',
    };
  }
  return {
    code: 'initialization-failed',
    message: rawMessage || 'Error inicializando la fuente audiovisual.',
  };
}

function normalizeConsumer(consumer: string | SourceConsumer): SourceConsumer {
  if (typeof consumer === 'string') {
    return { id: consumer, kind: 'custom', label: consumer };
  }
  return consumer;
}

function attachEventListenerSafe<T extends object>(
  target: T,
  eventName: string,
  handler: (ev?: unknown) => void,
  cleanupBucket: Array<() => void>
): void {
  const withEvents = target as {
    addEventListener?: (name: string, fn: (ev?: unknown) => void) => void;
    removeEventListener?: (name: string, fn: (ev?: unknown) => void) => void;
  };
  if (typeof withEvents.addEventListener === 'function') {
    withEvents.addEventListener(eventName, handler);
    cleanupBucket.push(() => {
      withEvents.removeEventListener?.(eventName, handler);
    });
    return;
  }

  const propName = `on${eventName}` as keyof T;
  (target as Record<string, unknown>)[String(propName)] = handler;
  cleanupBucket.push(() => {
    if ((target as Record<string, unknown>)[String(propName)] === handler) {
      (target as Record<string, unknown>)[String(propName)] = null;
    }
  });
}

function isGraphicSourceKind(kind: StudioSourceKind): boolean {
  return kind === 'color' || kind === 'gradient' || kind === 'text';
}

function cloneSourceDefinition(source: StudioSource): StudioSource {
  return structuredClone(source);
}

interface InternalEntry {
  source: StudioSource;
  state: SourceRuntimeState;
  details: {
    errorCode: SourceErrorCode | null;
    disconnectionReason: SourceDisconnectionReason;
    disconnectedAt: number | null;
    trackMuted: boolean;
    hasVideoTrack: boolean;
    hasAudioTrack: boolean;
    effectiveSettings: MediaTrackSettingsSnapshot | null;
    capabilities: MediaTrackCapabilitiesSnapshot | null;
    sharedAudioFromSourceId: string | null;
    sharedVideoFromSourceId: string | null;
    createdObjectUrl: string | null;
  };
  resources: {
    mediaStream: MediaStreamLike | null;
    videoElement: MediaVideoElementLike | null;
    imageElement: MediaImageElementLike | null;
    audioElement: MediaAudioElementLike | null;
  };
  consumers: Map<string, SourceConsumer>;
  ownedTracks: MediaStreamTrackLike[];
  cleanupCallbacks: Array<() => void>;
  operationToken: number;
  inFlightPromise: Promise<SourceRuntimeEntry> | null;
}

// ============================================================================
// SOURCE MANAGER — GESTOR CENTRAL DE RECURSOS AUDIOVISUALES
// ============================================================================

/**
 * Política documentada de estados del SourceManager:
 * - `idle`: Fuente registrada sin consumidores activos; cero pistas de hardware ni listeners abiertos.
 * - `initializing`: Solicitud asíncrona en curso (`getUserMedia`, `getDisplayMedia` o carga de archivo).
 * - `live`: Recurso listo y emitiendo.
 * - `paused`: Pausa explícita solicitada por el usuario/estudio. MANTIENE la conexión física del stream
 *   viva (`track.enabled = false` en pistas propias no compartidas, y `element.pause()` en archivos)
 *   para no perder permisos de `getDisplayMedia` ni re-disparar prompts de macOS al reanudar.
 * - `disconnected`: Desconexión externa real (`track.onended`, cierre de ventana capturada o
 *   extracción física del dispositivo). Conserva `StudioSource` y consumidores para permitir `reconnectSource()`.
 * - `error`: Permiso denegado, dispositivo ausente/ocupado, archivo corrupto o audio de sistema no disponible.
 */
export class SourceManager {
  private readonly mediaDevices: MediaDevicesAdapter;
  private readonly mediaElements: MediaElementFactoryAdapter;
  private readonly assetUrls: AssetUrlAdapter;
  private readonly cameraDeviceConflictPolicy: CameraDeviceConflictPolicy;
  private readonly now: () => number;

  private readonly entries = new Map<string, InternalEntry>();
  private readonly trackOwners = new Map<MediaStreamTrackLike, Set<string>>();
  private readonly listeners = new Set<SourceManagerListener>();

  private globalEpoch = 0;
  private disposed = false;
  private deviceChangeUnsubscribe: (() => void) | null = null;

  constructor(options: SourceManagerOptions = {}) {
    this.mediaDevices = options.mediaDevices ?? createBrowserMediaDevicesAdapter();
    this.mediaElements = options.mediaElements ?? createBrowserMediaElementFactoryAdapter();
    this.assetUrls = options.assetUrls ?? createBrowserAssetUrlAdapter();
    this.cameraDeviceConflictPolicy = options.cameraDeviceConflictPolicy ?? 'reuse-existing';
    this.now = options.now ?? (() => Date.now());

    if (this.mediaDevices.onDeviceChange) {
      this.deviceChangeUnsubscribe = this.mediaDevices.onDeviceChange(() => {
        void this.handleDeviceChange();
      });
    }
  }

  // --------------------------------------------------------------------------
  // SUSCRIPCIÓN Y CONSULTAS
  // --------------------------------------------------------------------------

  subscribe(listener: SourceManagerListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: SourceManagerEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  getPlatformCapabilities(): PlatformMediaCapabilities {
    return detectPlatformMediaCapabilities();
  }

  getEntry(sourceId: string): SourceRuntimeEntry | null {
    const internal = this.entries.get(sourceId);
    return internal ? this.toPublicEntry(internal) : null;
  }

  listEntries(): SourceRuntimeEntry[] {
    return Array.from(this.entries.values(), (entry) => this.toPublicEntry(entry));
  }

  getConsumerCount(sourceId: string): number {
    return this.entries.get(sourceId)?.consumers.size ?? 0;
  }

  getConsumers(sourceId: string): SourceConsumer[] {
    const entry = this.entries.get(sourceId);
    return entry ? Array.from(entry.consumers.values()) : [];
  }

  isConsumerHolding(sourceId: string, consumerId: string): boolean {
    return this.entries.get(sourceId)?.consumers.has(consumerId) ?? false;
  }

  getActiveTrackCount(): number {
    return this.trackOwners.size;
  }

  async queryAvailableDevices(): Promise<MediaDeviceDescriptor[]> {
    if (!this.mediaDevices.enumerateDevices) return [];
    return this.mediaDevices.enumerateDevices();
  }

  async queryCameraCapabilities(sourceId: string): Promise<MediaTrackCapabilitiesSnapshot | null> {
    const entry = this.entries.get(sourceId);
    if (!entry) return null;
    if (entry.details.capabilities) return entry.details.capabilities;
    const videoTrack = entry.resources.mediaStream?.getVideoTracks()[0];
    if (videoTrack?.getCapabilities) {
      const caps = videoTrack.getCapabilities();
      entry.details.capabilities = caps;
      return caps;
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // REGISTRO DE DEFINICIONES (SIN ABRIR HARDWARE AUTOMÁTICAMENTE)
  // --------------------------------------------------------------------------

  registerSource(source: StudioSource): SourceRuntimeEntry {
    if (this.disposed) {
      this.disposed = false;
    }
    const existing = this.entries.get(source.id);
    if (existing) {
      existing.source = cloneSourceDefinition(source);
      return this.toPublicEntry(existing);
    }

    const entry: InternalEntry = {
      source: cloneSourceDefinition(source),
      state: {
        sourceId: source.id,
        status: 'idle',
        intrinsicWidth: this.getInitialWidth(source),
        intrinsicHeight: this.getInitialHeight(source),
        lastUpdatedAt: this.now(),
      },
      details: {
        errorCode: null,
        disconnectionReason: 'none',
        disconnectedAt: null,
        trackMuted: false,
        hasVideoTrack: false,
        hasAudioTrack: false,
        effectiveSettings: null,
        capabilities: null,
        sharedAudioFromSourceId: null,
        sharedVideoFromSourceId: null,
        createdObjectUrl: null,
      },
      resources: {
        mediaStream: null,
        videoElement: null,
        imageElement: null,
        audioElement: null,
      },
      consumers: new Map(),
      ownedTracks: [],
      cleanupCallbacks: [],
      operationToken: 0,
      inFlightPromise: null,
    };

    this.entries.set(source.id, entry);
    const snapshot = this.toPublicEntry(entry);
    this.emit({
      type: 'entry-registered',
      sourceId: source.id,
      status: snapshot.state.status,
      entry: snapshot,
    });
    return snapshot;
  }

  /**
   * Sincroniza únicamente definiciones de fuentes de un proyecto SIN activar cámaras ni ventanas.
   */
  syncProjectDefinitions(project: StudioProject): void {
    const activeIds = new Set(project.sources.map((s) => s.id));
    for (const src of project.sources) {
      this.registerSource(src);
    }
    // Elimina únicamente fuentes no usadas que ya no existan en el proyecto
    for (const [id, entry] of this.entries.entries()) {
      if (!activeIds.has(id) && entry.consumers.size === 0) {
        this.teardownEntryResources(entry, 'user-released', 'idle');
        this.entries.delete(id);
      }
    }
  }

  // --------------------------------------------------------------------------
  // ADQUISICIÓN Y PROPIEDAD POR CONSUMIDOR
  // --------------------------------------------------------------------------

  async acquireSource(
    source: StudioSource,
    consumerInput: string | SourceConsumer,
    options: SourceAcquireOptions = {}
  ): Promise<SourceRuntimeEntry> {
    if (this.disposed) {
      this.disposed = false;
    }

    const consumer = normalizeConsumer(consumerInput);
    let entry = this.entries.get(source.id);
    if (!entry) {
      this.registerSource(source);
      entry = this.entries.get(source.id)!;
    } else {
      entry.source = cloneSourceDefinition(source);
    }

    // Registro idempotente del consumidor
    const wasNewConsumer = !entry.consumers.has(consumer.id);
    entry.consumers.set(consumer.id, consumer);
    if (wasNewConsumer) {
      this.emit({
        type: 'consumer-added',
        sourceId: source.id,
        status: entry.state.status,
        entry: this.toPublicEntry(entry),
      });
    }

    // Si ya está vivo o pausado, reutilizar sin re-adquirir hardware
    if (entry.state.status === 'live' || entry.state.status === 'paused') {
      return this.toPublicEntry(entry);
    }

    // Deduplicar solicitudes asíncronas concurrentes
    if (entry.inFlightPromise) {
      return entry.inFlightPromise;
    }

    // Si está en error o desconectado, solo reintentar si el consumidor nuevo lo solicita o retryOnError
    if (
      (entry.state.status === 'error' || entry.state.status === 'disconnected') &&
      !options.retryOnError &&
      !wasNewConsumer
    ) {
      return this.toPublicEntry(entry);
    }

    return this.startInitialization(entry, options);
  }

  /**
   * Adopta un `MediaStream` vivo ya autorizado (p. ej. al transferir propiedad desde Legacy Engine)
   * evitando duplicar `getUserMedia()`/`getDisplayMedia()` o volver a pedir permisos.
   * Quien entrega el stream DEBE limpiar sus propios listeners y referencias inmediatamente.
   */
  async adoptExternalMediaStream(
    source: StudioSource,
    consumerInput: string | SourceConsumer,
    stream: MediaStreamLike
  ): Promise<SourceRuntimeEntry> {
    if (this.disposed) {
      this.disposed = false;
    }

    const consumer = normalizeConsumer(consumerInput);
    let entry = this.entries.get(source.id);
    if (!entry) {
      this.registerSource(source);
      entry = this.entries.get(source.id)!;
    } else {
      entry.source = cloneSourceDefinition(source);
    }

    const wasNewConsumer = !entry.consumers.has(consumer.id);
    entry.consumers.set(consumer.id, consumer);
    if (wasNewConsumer) {
      this.emit({
        type: 'consumer-added',
        sourceId: source.id,
        status: entry.state.status,
        entry: this.toPublicEntry(entry),
      });
    }

    if (entry.state.status === 'live' || entry.state.status === 'paused') {
      return this.toPublicEntry(entry);
    }

    const videoTracks = stream.getVideoTracks().filter((t) => t.readyState !== 'ended');
    const audioTracks = stream.getAudioTracks().filter((t) => t.readyState !== 'ended');

    const wantsVideo =
      source.kind === 'camera' || source.kind === 'window' || source.kind === 'screen';
    const wantsAudio =
      source.kind === 'microphone' ||
      source.kind === 'system-audio' ||
      ((source.kind === 'window' || source.kind === 'screen') && source.includeSystemAudio);

    const primaryVideo = wantsVideo ? (videoTracks[0] ?? null) : null;
    const primaryAudio = wantsAudio ? (audioTracks[0] ?? null) : null;

    if ((wantsVideo && !primaryVideo) || (!wantsVideo && wantsAudio && !primaryAudio)) {
      this.teardownEntryResources(entry, 'device-disconnected', 'disconnected');
      return this.toPublicEntry(entry);
    }

    entry.operationToken += 1;
    const opToken = entry.operationToken;
    const epoch = this.globalEpoch;

    if (primaryVideo) {
      const videoEl = this.createStreamVideoElementSafe(stream);
      if (videoEl && this.mediaElements.attachStreamToVideo) {
        await this.mediaElements.attachStreamToVideo(videoEl, stream);
        if (!this.isOperationStillValid(entry, opToken, epoch)) {
          this.cleanupVideoElement(videoEl);
          return this.toPublicEntry(entry);
        }
      }
      const settings = primaryVideo.getSettings?.() ?? null;
      const capabilities = primaryVideo.getCapabilities?.() ?? null;
      entry.resources.videoElement = videoEl;
      entry.details.effectiveSettings = settings;
      entry.details.capabilities = capabilities;
      if (settings?.width && settings.width > 0) entry.state.intrinsicWidth = settings.width;
      if (settings?.height && settings.height > 0) entry.state.intrinsicHeight = settings.height;
      if (settings?.frameRate && settings.frameRate > 0) entry.state.activeFps = settings.frameRate;
      const reason: SourceDisconnectionReason =
        source.kind === 'camera' ? 'device-disconnected' : 'window-or-share-closed';
      this.registerTrackOwnership(entry, primaryVideo, reason, true);
    }

    if (primaryAudio) {
      if (!primaryVideo) {
        entry.details.effectiveSettings = primaryAudio.getSettings?.() ?? null;
        entry.state.intrinsicWidth = 0;
        entry.state.intrinsicHeight = 0;
      }
      const reason: SourceDisconnectionReason =
        source.kind === 'microphone' ? 'device-disconnected' : 'window-or-share-closed';
      this.registerTrackOwnership(entry, primaryAudio, reason, !primaryVideo);
    }

    entry.resources.mediaStream = stream;
    entry.details.hasVideoTrack = Boolean(primaryVideo);
    entry.details.hasAudioTrack = Boolean(primaryAudio);
    this.transitionState(entry, 'live', {
      errorCode: null,
      errorMessage: undefined,
      disconnectionReason: 'none',
    });
    return this.toPublicEntry(entry);
  }

  /**
   * Transfiere hacia el exterior (p. ej. retorno Studio -> Legacy) el `MediaStream` y pistas
   * de una fuente eliminando listeners y consumidores de SourceManager SIN llamar `track.stop()`,
   * siempre que ninguna otra fuente activa comparta exactamente las mismas pistas.
   */
  detachExternalMediaStreamOwnership(sourceId: string): {
    mediaStream: MediaStream | null;
    videoTracks: MediaStreamTrackLike[];
    audioTracks: MediaStreamTrackLike[];
  } | null {
    const entry = this.entries.get(sourceId);
    if (!entry || !entry.resources.mediaStream) return null;

    // Verificar si alguna otra fuente activa sigue compartiendo alguna pista
    for (const track of entry.ownedTracks) {
      const owners = this.trackOwners.get(track);
      if (owners && owners.size > 1) {
        return null;
      }
    }

    const mediaStream = entry.resources.mediaStream as unknown as MediaStream;
    const videoTracks = entry.ownedTracks.filter((t) => t.kind === 'video');
    const audioTracks = entry.ownedTracks.filter((t) => t.kind === 'audio');

    // Desconectar listeners antes de ceder propiedad
    while (entry.cleanupCallbacks.length > 0) {
      const cleanup = entry.cleanupCallbacks.pop();
      try {
        cleanup?.();
      } catch {
        // Ignorar
      }
    }

    for (const track of entry.ownedTracks) {
      this.trackOwners.delete(track);
    }
    entry.ownedTracks = [];
    entry.consumers.clear();
    entry.operationToken += 1;
    entry.inFlightPromise = null;

    if (entry.resources.videoElement) {
      this.cleanupVideoElement(entry.resources.videoElement);
    }
    entry.resources.mediaStream = null;
    entry.resources.videoElement = null;
    entry.details.hasVideoTrack = false;
    entry.details.hasAudioTrack = false;
    this.transitionState(entry, 'idle', {
      disconnectionReason: 'user-released',
      errorCode: null,
      errorMessage: undefined,
    });

    return { mediaStream, videoTracks, audioTracks };
  }

  async acquireSourcesForScene(
    scene: StudioScene,
    projectSources: StudioSource[],
    consumerInput: string | SourceConsumer
  ): Promise<SourceRuntimeEntry[]> {
    const byId = new Map(projectSources.map((s) => [s.id, s]));
    const requiredIds = new Set<string>();
    for (const layer of scene.layers) {
      requiredIds.add(layer.sourceId);
    }
    for (const audioId of scene.audioSourceIds) {
      requiredIds.add(audioId);
    }

    // Buscar si la escena tiene alguna fuente window/screen con audio para vincular system-audio
    const displayWithAudio = Array.from(requiredIds)
      .map((id) => byId.get(id))
      .find(
        (s): s is WindowSourceDefinition | ScreenSourceDefinition =>
          Boolean(s && (s.kind === 'window' || s.kind === 'screen') && s.includeSystemAudio)
      );

    // Adquirir primero fuentes visuales (especialmente window/screen) para compartir audio si aplica
    const visualFirst = Array.from(requiredIds).sort((a, b) => {
      const sa = byId.get(a);
      const sb = byId.get(b);
      if (sa?.kind === 'system-audio' && sb?.kind !== 'system-audio') return 1;
      if (sb?.kind === 'system-audio' && sa?.kind !== 'system-audio') return -1;
      return 0;
    });

    const results: SourceRuntimeEntry[] = [];
    for (const sourceId of visualFirst) {
      const def = byId.get(sourceId);
      if (!def) continue;
      const entry = await this.acquireSource(def, consumerInput, {
        linkedDisplaySourceId:
          def.kind === 'system-audio' && displayWithAudio ? displayWithAudio.id : undefined,
      });
      results.push(entry);
    }
    return results;
  }

  // --------------------------------------------------------------------------
  // LIBERACIÓN DETERMINISTA Y RECONEXIÓN
  // --------------------------------------------------------------------------

  releaseSource(sourceId: string, consumerId: string): SourceRuntimeEntry | null {
    const entry = this.entries.get(sourceId);
    if (!entry) return null;

    // Idempotente: si el consumidor no posee la fuente, no hay error ni contador negativo
    const removed = entry.consumers.delete(consumerId);
    if (!removed) {
      return this.toPublicEntry(entry);
    }

    this.emit({
      type: 'consumer-removed',
      sourceId,
      status: entry.state.status,
      entry: this.toPublicEntry(entry),
    });

    // Mientras queden otros consumidores (p. ej. otra escena o preview), mantener recurso vivo
    if (entry.consumers.size > 0) {
      return this.toPublicEntry(entry);
    }

    // Último consumidor liberado: invalidar cualquier operación pendiente y liberar todo
    entry.operationToken += 1;
    entry.inFlightPromise = null;
    this.teardownEntryResources(entry, 'user-released', 'idle');

    const snapshot = this.toPublicEntry(entry);
    this.emit({
      type: 'released',
      sourceId,
      status: snapshot.state.status,
      entry: snapshot,
    });
    return snapshot;
  }

  releaseConsumer(consumerId: string): void {
    for (const sourceId of Array.from(this.entries.keys())) {
      this.releaseSource(sourceId, consumerId);
    }
  }

  async reconnectSource(
    sourceId: string,
    options: SourceReconnectOptions = {}
  ): Promise<SourceRuntimeEntry | null> {
    const entry = this.entries.get(sourceId);
    if (!entry) return null;

    // Si ya está conectada y no se pide forzar, evitar conexión duplicada
    if ((entry.state.status === 'live' || entry.state.status === 'paused') && !options.force) {
      return this.toPublicEntry(entry);
    }

    if (entry.inFlightPromise && !options.force) {
      return entry.inFlightPromise;
    }

    if (options.force) {
      entry.operationToken += 1;
      entry.inFlightPromise = null;
      this.teardownEntryResources(entry, 'user-released', 'idle');
    }

    if (entry.consumers.size === 0) {
      // No activar hardware sin un consumidor registrado; simplemente resetear a idle
      return this.toPublicEntry(entry);
    }

    const result = await this.startInitialization(entry, {
      linkedDisplaySourceId: options.linkedDisplaySourceId,
      retryOnError: true,
    });
    if (result.state.status === 'live') {
      this.emit({
        type: 'reconnected',
        sourceId,
        status: 'live',
        entry: result,
      });
    }
    return result;
  }

  pauseSource(sourceId: string): SourceRuntimeEntry | null {
    const entry = this.entries.get(sourceId);
    if (!entry || entry.state.status !== 'live') return entry ? this.toPublicEntry(entry) : null;

    for (const track of entry.ownedTracks) {
      const owners = this.trackOwners.get(track);
      // Solo silenciar si ninguna otra fuente activa comparte exactamente la misma pista física
      if (!owners || owners.size <= 1) {
        track.enabled = false;
      }
    }
    if (entry.resources.videoElement?.pause) {
      entry.resources.videoElement.pause();
    }
    if (entry.resources.audioElement?.pause) {
      entry.resources.audioElement.pause();
    }

    this.transitionState(entry, 'paused');
    return this.toPublicEntry(entry);
  }

  resumeSource(sourceId: string): SourceRuntimeEntry | null {
    const entry = this.entries.get(sourceId);
    if (!entry || entry.state.status !== 'paused') return entry ? this.toPublicEntry(entry) : null;

    for (const track of entry.ownedTracks) {
      track.enabled = true;
    }
    if (entry.resources.videoElement?.play) {
      try {
        void entry.resources.videoElement.play();
      } catch {
        // Ignorar en entornos sin autoplay
      }
    }
    if (entry.resources.audioElement?.play) {
      try {
        void entry.resources.audioElement.play();
      } catch {
        // Ignorar
      }
    }

    this.transitionState(entry, 'live');
    return this.toPublicEntry(entry);
  }

  disposeAll(): void {
    this.disposed = true;
    this.globalEpoch += 1;

    if (this.deviceChangeUnsubscribe) {
      this.deviceChangeUnsubscribe();
      this.deviceChangeUnsubscribe = null;
    }

    for (const [sourceId, entry] of this.entries.entries()) {
      entry.operationToken += 1;
      entry.inFlightPromise = null;
      entry.consumers.clear();
      this.teardownEntryResources(entry, 'disposed', 'idle');
      this.emit({
        type: 'disposed',
        sourceId,
        status: 'idle',
        entry: this.toPublicEntry(entry),
      });
    }

    this.trackOwners.clear();
  }

  // --------------------------------------------------------------------------
  // INICIALIZACIÓN POR TIPO DE FUENTE + CONTROL DE CONCURRENCIA
  // --------------------------------------------------------------------------

  private startInitialization(
    entry: InternalEntry,
    options: SourceAcquireOptions
  ): Promise<SourceRuntimeEntry> {
    const opToken = ++entry.operationToken;
    const epoch = this.globalEpoch;

    this.transitionState(entry, 'initializing', {
      errorCode: null,
      errorMessage: undefined,
      disconnectionReason: 'none',
    });

    const promise = this.executeAcquisition(entry, options, opToken, epoch).finally(() => {
      if (entry.operationToken === opToken) {
        entry.inFlightPromise = null;
      }
    });

    entry.inFlightPromise = promise;
    return promise;
  }

  private isOperationStillValid(entry: InternalEntry, opToken: number, epoch: number): boolean {
    return (
      !this.disposed &&
      this.globalEpoch === epoch &&
      entry.operationToken === opToken &&
      entry.consumers.size > 0 &&
      this.entries.get(entry.source.id) === entry
    );
  }

  private async executeAcquisition(
    entry: InternalEntry,
    options: SourceAcquireOptions,
    opToken: number,
    epoch: number
  ): Promise<SourceRuntimeEntry> {
    const src = entry.source;

    try {
      if (isGraphicSourceKind(src.kind)) {
        this.acquireGraphicSource(entry, src as ColorSourceDefinition | GradientSourceDefinition | TextSourceDefinition);
        this.transitionState(entry, 'live');
        return this.toPublicEntry(entry);
      }

      if (src.kind === 'camera') {
        await this.acquireCameraSource(entry, src, opToken, epoch);
      } else if (src.kind === 'window' || src.kind === 'screen') {
        await this.acquireDisplaySource(entry, src, opToken, epoch);
      } else if (src.kind === 'microphone') {
        await this.acquireMicrophoneSource(entry, src, opToken, epoch);
      } else if (src.kind === 'system-audio') {
        await this.acquireSystemAudioSource(entry, src, options, opToken, epoch);
      } else if (src.kind === 'image') {
        await this.acquireImageSource(entry, src, opToken, epoch);
      } else if (src.kind === 'video-file') {
        await this.acquireVideoFileSource(entry, src, opToken, epoch);
      } else if (src.kind === 'audio-file') {
        await this.acquireAudioFileSource(entry, src, opToken, epoch);
      }

      if (!this.isOperationStillValid(entry, opToken, epoch)) {
        // La operación quedó obsoleta por release/dispose/reemplazo; sus recursos locales ya fueron descartados.
        return this.toPublicEntry(entry);
      }

      this.transitionState(entry, 'live');
      return this.toPublicEntry(entry);
    } catch (err) {
      if (!this.isOperationStillValid(entry, opToken, epoch)) {
        return this.toPublicEntry(entry);
      }

      const classified =
        err instanceof SourceManagerError
          ? { code: err.code, message: err.message }
          : classifyMediaError(err);

      this.teardownEntryResources(entry, 'none', 'error', {
        errorCode: classified.code,
        errorMessage: classified.message,
      });
      return this.toPublicEntry(entry);
    }
  }

  private acquireGraphicSource(
    entry: InternalEntry,
    _src: ColorSourceDefinition | GradientSourceDefinition | TextSourceDefinition
  ): void {
    entry.state.intrinsicWidth = entry.state.intrinsicWidth || 1920;
    entry.state.intrinsicHeight = entry.state.intrinsicHeight || 1080;
    entry.details.hasVideoTrack = false;
    entry.details.hasAudioTrack = false;
  }

  private async acquireCameraSource(
    entry: InternalEntry,
    src: CameraSourceDefinition,
    opToken: number,
    epoch: number
  ): Promise<void> {
    // Verificar si otra fuente cámara ya tiene abierto el mismo deviceId físico
    const existingSameDevice = this.findLiveEntryByCameraDeviceId(src.deviceId, src.id);
    if (existingSameDevice) {
      const existingTrack = existingSameDevice.resources.mediaStream?.getVideoTracks()[0];
      const existingSettings = existingSameDevice.details.effectiveSettings;
      const incompatible =
        existingSettings?.width !== undefined &&
        (existingSettings.width !== src.preferredWidth ||
          existingSettings.height !== src.preferredHeight ||
          existingSettings.frameRate !== src.preferredFps);

      if (incompatible && this.cameraDeviceConflictPolicy === 'reject-incompatible') {
        throw new SourceManagerError(
          'device-conflict',
          `La cámara ${src.deviceId} ya está en uso con otra resolución/FPS (${existingSettings?.width}x${existingSettings?.height}@${existingSettings?.frameRate}).`
        );
      }

      if (existingTrack && existingSameDevice.resources.mediaStream) {
        if (incompatible && this.cameraDeviceConflictPolicy === 'prefer-highest') {
          const currentPixels =
            (existingSettings?.width || 0) * (existingSettings?.height || 0);
          const requestedPixels = src.preferredWidth * src.preferredHeight;
          if (requestedPixels <= currentPixels) {
            this.attachSharedVideoStreamFromEntry(entry, existingSameDevice, existingTrack);
            return;
          }
          // Si solicita mayor resolución y la cámara soporta constraints o re-adquisición,
          // compartimos la conexión física si ya está live para no abrir duplicados
        }

        this.attachSharedVideoStreamFromEntry(entry, existingSameDevice, existingTrack);
        return;
      }
    }

    // Requisito obligatorio: cámara solicita ÚNICAMENTE vídeo (audio: false)
    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: src.preferredWidth },
      height: { ideal: src.preferredHeight },
      frameRate: { ideal: src.preferredFps },
      ...(src.deviceId && src.deviceId !== 'default'
        ? { deviceId: { ideal: src.deviceId } }
        : {}),
    };

    const stream = await this.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false,
    });

    if (!this.isOperationStillValid(entry, opToken, epoch)) {
      this.stopStreamTracksUnconditionally(stream);
      return;
    }

    // Defensa extra: si algún entorno devolviera pista de audio no solicitada, no usarla en cámara
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      this.stopStreamTracksUnconditionally(stream);
      throw new SourceManagerError(
        'device-not-found',
        'El dispositivo de cámara no proporcionó ninguna pista de vídeo.'
      );
    }

    const settings = videoTrack.getSettings?.() ?? null;
    const capabilities = videoTrack.getCapabilities?.() ?? null;

    const videoEl = this.createStreamVideoElementSafe(stream);
    if (videoEl && this.mediaElements.attachStreamToVideo) {
      await this.mediaElements.attachStreamToVideo(videoEl, stream);
      if (!this.isOperationStillValid(entry, opToken, epoch)) {
        this.cleanupVideoElement(videoEl);
        this.stopStreamTracksUnconditionally(stream);
        return;
      }
    }

    entry.resources.mediaStream = stream;
    entry.resources.videoElement = videoEl;
    entry.details.hasVideoTrack = true;
    entry.details.hasAudioTrack = false;
    entry.details.effectiveSettings = settings;
    entry.details.capabilities = capabilities;

    // Nunca declarar resolución/FPS solicitados si getSettings() devuelve otros reales
    if (settings?.width && settings.width > 0) entry.state.intrinsicWidth = settings.width;
    if (settings?.height && settings.height > 0) entry.state.intrinsicHeight = settings.height;
    if (settings?.frameRate && settings.frameRate > 0) entry.state.activeFps = settings.frameRate;

    this.registerTrackOwnership(entry, videoTrack, 'device-disconnected');
  }

  private async acquireDisplaySource(
    entry: InternalEntry,
    src: WindowSourceDefinition | ScreenSourceDefinition,
    opToken: number,
    epoch: number
  ): Promise<void> {
    const stream = await this.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 60 },
      },
      audio: src.includeSystemAudio,
    });

    if (!this.isOperationStillValid(entry, opToken, epoch)) {
      this.stopStreamTracksUnconditionally(stream);
      return;
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      this.stopStreamTracksUnconditionally(stream);
      throw new SourceManagerError(
        'initialization-failed',
        'La captura de pantalla/ventana no devolvió una pista de vídeo válida.'
      );
    }

    const audioTrack = stream.getAudioTracks()[0] ?? null;
    const settings = videoTrack.getSettings?.() ?? null;
    const capabilities = videoTrack.getCapabilities?.() ?? null;

    const videoEl = this.createStreamVideoElementSafe(stream);
    if (videoEl && this.mediaElements.attachStreamToVideo) {
      await this.mediaElements.attachStreamToVideo(videoEl, stream);
      if (!this.isOperationStillValid(entry, opToken, epoch)) {
        this.cleanupVideoElement(videoEl);
        this.stopStreamTracksUnconditionally(stream);
        return;
      }
    }

    entry.resources.mediaStream = stream;
    entry.resources.videoElement = videoEl;
    entry.details.hasVideoTrack = true;
    entry.details.hasAudioTrack = Boolean(audioTrack);
    entry.details.effectiveSettings = settings;
    entry.details.capabilities = capabilities;

    if (settings?.width && settings.width > 0) entry.state.intrinsicWidth = settings.width;
    if (settings?.height && settings.height > 0) entry.state.intrinsicHeight = settings.height;
    if (settings?.frameRate && settings.frameRate > 0) entry.state.activeFps = settings.frameRate;

    this.registerTrackOwnership(entry, videoTrack, 'window-or-share-closed');
    if (audioTrack) {
      this.registerTrackOwnership(entry, audioTrack, 'window-or-share-closed', false);
    }
  }

  private async acquireMicrophoneSource(
    entry: InternalEntry,
    src: MicrophoneSourceDefinition,
    opToken: number,
    epoch: number
  ): Promise<void> {
    const stream = await this.mediaDevices.getUserMedia({
      video: false,
      audio: {
        echoCancellation: src.echoCancellation,
        noiseSuppression: src.noiseSuppression,
        ...(src.deviceId && src.deviceId !== 'default'
          ? { deviceId: { ideal: src.deviceId } }
          : {}),
      },
    });

    if (!this.isOperationStillValid(entry, opToken, epoch)) {
      this.stopStreamTracksUnconditionally(stream);
      return;
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) {
      this.stopStreamTracksUnconditionally(stream);
      throw new SourceManagerError(
        'device-not-found',
        'El micrófono seleccionado no proporcionó ninguna pista de audio.'
      );
    }

    const settings = audioTrack.getSettings?.() ?? null;
    entry.resources.mediaStream = stream;
    entry.details.hasVideoTrack = false;
    entry.details.hasAudioTrack = true;
    entry.details.effectiveSettings = settings;
    entry.state.intrinsicWidth = 0;
    entry.state.intrinsicHeight = 0;

    this.registerTrackOwnership(entry, audioTrack, 'device-disconnected');
  }

  private async acquireSystemAudioSource(
    entry: InternalEntry,
    src: SystemAudioSourceDefinition,
    options: SourceAcquireOptions,
    opToken: number,
    epoch: number
  ): Promise<void> {
    // 1. Si existe una fuente window/screen activa con pista de audio, reutilizarla explícitamente
    const donorEntry = this.findLiveDisplayAudioDonor(options.linkedDisplaySourceId, src.targetHint);
    if (donorEntry) {
      const sharedAudioTrack = donorEntry.resources.mediaStream?.getAudioTracks()[0];
      if (sharedAudioTrack && sharedAudioTrack.readyState !== 'ended') {
        entry.resources.mediaStream = donorEntry.resources.mediaStream;
        entry.details.sharedAudioFromSourceId = donorEntry.source.id;
        entry.details.hasVideoTrack = false;
        entry.details.hasAudioTrack = true;
        entry.details.effectiveSettings = sharedAudioTrack.getSettings?.() ?? null;
        entry.state.intrinsicWidth = 0;
        entry.state.intrinsicHeight = 0;

        this.registerTrackOwnership(entry, sharedAudioTrack, 'window-or-share-closed');
        return;
      }
    }

    // 2. Si no hay captura existente, solicitar captura con audio al usuario (nunca simular audio)
    const stream = await this.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });

    if (!this.isOperationStillValid(entry, opToken, epoch)) {
      this.stopStreamTracksUnconditionally(stream);
      return;
    }

    const audioTrack = stream.getAudioTracks()[0];
    // Detener pistas de vídeo sobrantes de esta captura exclusiva de audio de sistema
    for (const vTrack of stream.getVideoTracks()) {
      vTrack.stop();
    }

    if (!audioTrack) {
      this.stopStreamTracksUnconditionally(stream);
      throw new SourceManagerError(
        'system-audio-unavailable',
        'El sistema o navegador no entregó una pista de audio del sistema válida.'
      );
    }

    entry.resources.mediaStream = stream;
    entry.details.hasVideoTrack = false;
    entry.details.hasAudioTrack = true;
    entry.details.effectiveSettings = audioTrack.getSettings?.() ?? null;
    entry.state.intrinsicWidth = 0;
    entry.state.intrinsicHeight = 0;

    this.registerTrackOwnership(entry, audioTrack, 'window-or-share-closed');
  }

  private async acquireImageSource(
    entry: InternalEntry,
    src: ImageSourceDefinition,
    opToken: number,
    epoch: number
  ): Promise<void> {
    const resolved = await this.resolveMediaSourceUrl(src.assetRef);
    if (!this.isOperationStillValid(entry, opToken, epoch)) {
      if (resolved.createdObjectUrl) {
        this.assetUrls.revokeObjectURL(resolved.createdObjectUrl);
      }
      return;
    }

    const img = this.mediaElements.createImageElement();
    if (resolved.createdObjectUrl) {
      entry.details.createdObjectUrl = resolved.createdObjectUrl;
    }

    await new Promise<void>((resolve, reject) => {
      const localCleanup: Array<() => void> = [];
      const done = (fn: () => void) => {
        while (localCleanup.length > 0) {
          localCleanup.pop()?.();
        }
        fn();
      };

      attachEventListenerSafe(
        img,
        'load',
        () => done(() => resolve()),
        localCleanup
      );
      attachEventListenerSafe(
        img,
        'error',
        () =>
          done(() =>
            reject(new SourceManagerError('media-load-failed', `No se pudo cargar la imagen: ${src.assetRef}`))
          ),
        localCleanup
      );

      entry.cleanupCallbacks.push(() => {
        while (localCleanup.length > 0) {
          localCleanup.pop()?.();
        }
      });

      img.src = resolved.url;
      // Si el adaptador/caché resuelve de forma síncrona con `complete === true`
      if (img.complete && img.naturalWidth > 0) {
        done(() => resolve());
      }
    });

    if (!this.isOperationStillValid(entry, opToken, epoch)) {
      img.src = '';
      if (entry.details.createdObjectUrl) {
        this.assetUrls.revokeObjectURL(entry.details.createdObjectUrl);
        entry.details.createdObjectUrl = null;
      }
      return;
    }

    entry.resources.imageElement = img;
    entry.state.intrinsicWidth = img.naturalWidth || src.intrinsicWidth || 0;
    entry.state.intrinsicHeight = img.naturalHeight || src.intrinsicHeight || 0;
    entry.details.hasVideoTrack = false;
    entry.details.hasAudioTrack = false;
  }

  private async acquireVideoFileSource(
    entry: InternalEntry,
    src: VideoFileSourceDefinition,
    opToken: number,
    epoch: number
  ): Promise<void> {
    const resolved = await this.resolveMediaSourceUrl(src.assetRef);
    if (!this.isOperationStillValid(entry, opToken, epoch)) {
      if (resolved.createdObjectUrl) {
        this.assetUrls.revokeObjectURL(resolved.createdObjectUrl);
      }
      return;
    }

    const video = this.mediaElements.createVideoElement();
    if (resolved.createdObjectUrl) {
      entry.details.createdObjectUrl = resolved.createdObjectUrl;
    }

    video.loop = src.loop;
    video.playbackRate = src.playbackRate;
    video.muted = src.mutedByDefault;

    await new Promise<void>((resolve, reject) => {
      const localCleanup: Array<() => void> = [];
      const done = (fn: () => void) => {
        while (localCleanup.length > 0) {
          localCleanup.pop()?.();
        }
        fn();
      };

      attachEventListenerSafe(video, 'loadedmetadata', () => done(() => resolve()), localCleanup);
      attachEventListenerSafe(
        video,
        'error',
        () =>
          done(() =>
            reject(new SourceManagerError('media-load-failed', `No se pudo cargar el vídeo: ${src.assetRef}`))
          ),
        localCleanup
      );

      entry.cleanupCallbacks.push(() => {
        while (localCleanup.length > 0) {
          localCleanup.pop()?.();
        }
      });

      video.src = resolved.url;
      video.load?.();
      if ((video.readyState ?? 0) >= 1 && video.videoWidth > 0) {
        done(() => resolve());
      }
    });

    if (!this.isOperationStillValid(entry, opToken, epoch)) {
      this.cleanupVideoElement(video);
      if (entry.details.createdObjectUrl) {
        this.assetUrls.revokeObjectURL(entry.details.createdObjectUrl);
        entry.details.createdObjectUrl = null;
      }
      return;
    }

    entry.resources.videoElement = video;
    entry.state.intrinsicWidth = video.videoWidth || 0;
    entry.state.intrinsicHeight = video.videoHeight || 0;
    entry.details.hasVideoTrack = true;
    entry.details.hasAudioTrack = !src.mutedByDefault;
  }

  private async acquireAudioFileSource(
    entry: InternalEntry,
    src: AudioFileSourceDefinition,
    opToken: number,
    epoch: number
  ): Promise<void> {
    const resolved = await this.resolveMediaSourceUrl(src.assetRef);
    if (!this.isOperationStillValid(entry, opToken, epoch)) {
      if (resolved.createdObjectUrl) {
        this.assetUrls.revokeObjectURL(resolved.createdObjectUrl);
      }
      return;
    }

    const audio = this.mediaElements.createAudioElement();
    if (resolved.createdObjectUrl) {
      entry.details.createdObjectUrl = resolved.createdObjectUrl;
    }
    audio.loop = src.loop;

    await new Promise<void>((resolve, reject) => {
      const localCleanup: Array<() => void> = [];
      const done = (fn: () => void) => {
        while (localCleanup.length > 0) {
          localCleanup.pop()?.();
        }
        fn();
      };

      attachEventListenerSafe(audio, 'loadedmetadata', () => done(() => resolve()), localCleanup);
      attachEventListenerSafe(
        audio,
        'error',
        () =>
          done(() =>
            reject(new SourceManagerError('media-load-failed', `No se pudo cargar el audio: ${src.assetRef}`))
          ),
        localCleanup
      );

      entry.cleanupCallbacks.push(() => {
        while (localCleanup.length > 0) {
          localCleanup.pop()?.();
        }
      });

      audio.src = resolved.url;
      audio.load?.();
      if ((audio.readyState ?? 0) >= 1) {
        done(() => resolve());
      }
    });

    if (!this.isOperationStillValid(entry, opToken, epoch)) {
      audio.pause?.();
      audio.src = '';
      if (entry.details.createdObjectUrl) {
        this.assetUrls.revokeObjectURL(entry.details.createdObjectUrl);
        entry.details.createdObjectUrl = null;
      }
      return;
    }

    entry.resources.audioElement = audio;
    entry.state.intrinsicWidth = 0;
    entry.state.intrinsicHeight = 0;
    entry.details.hasVideoTrack = false;
    entry.details.hasAudioTrack = true;
  }

  // --------------------------------------------------------------------------
  // UTILIDADES DE PISTAS COMPARTIDAS, EVENTOS Y LIMPIEZA
  // --------------------------------------------------------------------------

  private attachSharedVideoStreamFromEntry(
    targetEntry: InternalEntry,
    donorEntry: InternalEntry,
    sharedTrack: MediaStreamTrackLike
  ): void {
    const stream = donorEntry.resources.mediaStream!;
    targetEntry.resources.mediaStream = stream;
    targetEntry.resources.videoElement = this.createStreamVideoElementSafe(stream);
    targetEntry.details.sharedVideoFromSourceId = donorEntry.source.id;
    targetEntry.details.hasVideoTrack = true;
    targetEntry.details.hasAudioTrack = false;
    targetEntry.details.effectiveSettings = donorEntry.details.effectiveSettings;
    targetEntry.details.capabilities = donorEntry.details.capabilities;
    targetEntry.state.intrinsicWidth = donorEntry.state.intrinsicWidth;
    targetEntry.state.intrinsicHeight = donorEntry.state.intrinsicHeight;
    targetEntry.state.activeFps = donorEntry.state.activeFps;

    this.registerTrackOwnership(targetEntry, sharedTrack, 'device-disconnected');
  }

  private findLiveEntryByCameraDeviceId(
    deviceId: string,
    excludeSourceId: string
  ): InternalEntry | null {
    if (!deviceId) return null;
    for (const [id, entry] of this.entries.entries()) {
      if (id === excludeSourceId) continue;
      if (entry.source.kind !== 'camera') continue;
      if (entry.state.status !== 'live' && entry.state.status !== 'paused') continue;
      const effectiveId = entry.details.effectiveSettings?.deviceId || entry.source.deviceId;
      if (effectiveId === deviceId) {
        return entry;
      }
    }
    return null;
  }

  private findLiveDisplayAudioDonor(
    preferredSourceId?: string,
    targetHint?: string
  ): InternalEntry | null {
    if (preferredSourceId) {
      const explicit = this.entries.get(preferredSourceId);
      if (
        explicit &&
        (explicit.state.status === 'live' || explicit.state.status === 'paused') &&
        explicit.resources.mediaStream &&
        explicit.resources.mediaStream.getAudioTracks().length > 0
      ) {
        return explicit;
      }
    }

    for (const entry of this.entries.values()) {
      if (entry.source.kind !== 'window' && entry.source.kind !== 'screen') continue;
      if (entry.state.status !== 'live' && entry.state.status !== 'paused') continue;
      if (!entry.resources.mediaStream || entry.resources.mediaStream.getAudioTracks().length === 0) {
        continue;
      }
      if (targetHint && !entry.source.name.toLowerCase().includes(targetHint.toLowerCase())) {
        continue;
      }
      return entry;
    }

    return null;
  }

  private registerTrackOwnership(
    entry: InternalEntry,
    track: MediaStreamTrackLike,
    disconnectReason: SourceDisconnectionReason,
    listenToLifecycle = true
  ): void {
    let owners = this.trackOwners.get(track);
    if (!owners) {
      owners = new Set<string>();
      this.trackOwners.set(track, owners);
    }
    owners.add(entry.source.id);
    if (!entry.ownedTracks.includes(track)) {
      entry.ownedTracks.push(track);
    }

    if (!listenToLifecycle) return;

    attachEventListenerSafe(
      track,
      'ended',
      () => {
        this.handleExternalTrackEnded(entry, disconnectReason);
      },
      entry.cleanupCallbacks
    );

    attachEventListenerSafe(
      track,
      'mute',
      () => {
        if (entry.state.status === 'live' || entry.state.status === 'paused') {
          entry.details.trackMuted = true;
          entry.state.lastUpdatedAt = this.now();
          this.emit({
            type: 'state-changed',
            sourceId: entry.source.id,
            status: entry.state.status,
            entry: this.toPublicEntry(entry),
          });
        }
      },
      entry.cleanupCallbacks
    );

    attachEventListenerSafe(
      track,
      'unmute',
      () => {
        if (entry.state.status === 'live' || entry.state.status === 'paused') {
          entry.details.trackMuted = false;
          entry.state.lastUpdatedAt = this.now();
          this.emit({
            type: 'state-changed',
            sourceId: entry.source.id,
            status: entry.state.status,
            entry: this.toPublicEntry(entry),
          });
        }
      },
      entry.cleanupCallbacks
    );
  }

  private handleExternalTrackEnded(
    entry: InternalEntry,
    reason: SourceDisconnectionReason
  ): void {
    // Ignorar si ya fue liberada voluntariamente o dispuesta
    if (entry.state.status === 'idle' || entry.consumers.size === 0) return;
    if (entry.state.status === 'disconnected') return;

    this.teardownEntryResources(entry, reason, 'disconnected');
    const snapshot = this.toPublicEntry(entry);
    this.emit({
      type: 'disconnected',
      sourceId: entry.source.id,
      status: 'disconnected',
      entry: snapshot,
    });
  }

  private async handleDeviceChange(): Promise<void> {
    if (this.disposed || !this.mediaDevices.enumerateDevices) return;
    let devices: MediaDeviceDescriptor[] = [];
    try {
      devices = await this.mediaDevices.enumerateDevices();
    } catch {
      return;
    }

    const availableIds = new Set(devices.map((d) => d.deviceId).filter(Boolean));
    for (const entry of this.entries.values()) {
      if (entry.state.status !== 'live' && entry.state.status !== 'paused') continue;
      if (entry.source.kind !== 'camera' && entry.source.kind !== 'microphone') continue;

      const devId = entry.details.effectiveSettings?.deviceId || entry.source.deviceId;
      const trackEnded = entry.ownedTracks.some((t) => t.readyState === 'ended');
      if (trackEnded || (devId && devId !== 'default' && availableIds.size > 0 && !availableIds.has(devId))) {
        this.handleExternalTrackEnded(entry, 'device-disconnected');
      }
    }
  }

  private teardownEntryResources(
    entry: InternalEntry,
    reason: SourceDisconnectionReason,
    targetStatus: SourceExecutionStatus,
    errorInfo?: { errorCode: SourceErrorCode; errorMessage: string }
  ): void {
    // Primero desconectar listeners para no disparar onended fantasma durante stop()
    while (entry.cleanupCallbacks.length > 0) {
      const cleanup = entry.cleanupCallbacks.pop();
      try {
        cleanup?.();
      } catch {
        // Ignorar errores de limpieza
      }
    }

    // Liberar solo pistas cuyo último propietario sea esta fuente
    for (const track of entry.ownedTracks) {
      const owners = this.trackOwners.get(track);
      if (owners) {
        owners.delete(entry.source.id);
        if (owners.size === 0) {
          this.trackOwners.delete(track);
          try {
            track.stop();
          } catch {
            // Ignorar si ya estaba detenida
          }
        }
      }
    }
    entry.ownedTracks = [];

    // Limpiar elementos DOM/media propios
    if (entry.resources.videoElement) {
      this.cleanupVideoElement(entry.resources.videoElement);
    }
    if (entry.resources.imageElement) {
      entry.resources.imageElement.src = '';
    }
    if (entry.resources.audioElement) {
      try {
        entry.resources.audioElement.pause?.();
        entry.resources.audioElement.srcObject = null;
        entry.resources.audioElement.src = '';
      } catch {
        // Ignorar
      }
    }

    // Revocar ÚNICAMENTE Object URLs creadas por este gestor
    if (entry.details.createdObjectUrl) {
      try {
        this.assetUrls.revokeObjectURL(entry.details.createdObjectUrl);
      } catch {
        // Ignorar
      }
      entry.details.createdObjectUrl = null;
    }

    entry.resources.mediaStream = null;
    entry.resources.videoElement = null;
    entry.resources.imageElement = null;
    entry.resources.audioElement = null;

    entry.details.hasVideoTrack = false;
    entry.details.hasAudioTrack = false;
    entry.details.trackMuted = false;
    entry.details.sharedAudioFromSourceId = null;
    entry.details.sharedVideoFromSourceId = null;
    entry.details.disconnectionReason = reason;
    entry.details.disconnectedAt = targetStatus === 'disconnected' ? this.now() : null;
    entry.details.errorCode = errorInfo?.errorCode ?? null;

    if (targetStatus === 'idle') {
      entry.details.effectiveSettings = null;
      entry.details.capabilities = null;
      entry.state.activeFps = undefined;
    }

    this.transitionState(entry, targetStatus, {
      errorCode: errorInfo?.errorCode ?? null,
      errorMessage: errorInfo?.errorMessage,
      disconnectionReason: reason,
    });
  }

  private transitionState(
    entry: InternalEntry,
    nextStatus: SourceExecutionStatus,
    extra?: {
      errorCode?: SourceErrorCode | null;
      errorMessage?: string;
      disconnectionReason?: SourceDisconnectionReason;
    }
  ): void {
    const prevStatus = entry.state.status;
    entry.state.status = nextStatus;
    entry.state.lastUpdatedAt = this.now();
    if (extra && 'errorCode' in extra) {
      entry.details.errorCode = extra.errorCode ?? null;
    }
    if (extra && 'errorMessage' in extra) {
      entry.state.errorMessage = extra.errorMessage;
    } else if (nextStatus === 'live' || nextStatus === 'idle') {
      entry.state.errorMessage = undefined;
    }
    if (extra?.disconnectionReason) {
      entry.details.disconnectionReason = extra.disconnectionReason;
    }

    if (prevStatus !== nextStatus) {
      this.emit({
        type: 'state-changed',
        sourceId: entry.source.id,
        status: nextStatus,
        entry: this.toPublicEntry(entry),
      });
    }
  }

  private async resolveMediaSourceUrl(
    assetRef: string
  ): Promise<{ url: string; createdObjectUrl: string | null }> {
    if (this.assetUrls.resolveAssetBlob) {
      const blob = await this.assetUrls.resolveAssetBlob(assetRef);
      if (blob) {
        const objectUrl = this.assetUrls.createObjectURL(blob);
        return { url: objectUrl, createdObjectUrl: objectUrl };
      }
    }
    return { url: assetRef, createdObjectUrl: null };
  }

  private createStreamVideoElementSafe(stream: MediaStreamLike): MediaVideoElementLike | null {
    try {
      const video = this.mediaElements.createVideoElement();
      video.srcObject = stream;
      video.muted = true;
      return video;
    } catch {
      return null;
    }
  }

  private cleanupVideoElement(video: MediaVideoElementLike): void {
    try {
      video.pause?.();
      video.srcObject = null;
      video.src = '';
    } catch {
      // Ignorar
    }
  }

  private stopStreamTracksUnconditionally(stream: MediaStreamLike): void {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Ignorar
      }
    }
  }

  private getInitialWidth(source: StudioSource): number {
    if (source.kind === 'camera') return source.preferredWidth;
    if (source.kind === 'image') return source.intrinsicWidth ?? 0;
    if (isGraphicSourceKind(source.kind)) return 1920;
    return 0;
  }

  private getInitialHeight(source: StudioSource): number {
    if (source.kind === 'camera') return source.preferredHeight;
    if (source.kind === 'image') return source.intrinsicHeight ?? 0;
    if (isGraphicSourceKind(source.kind)) return 1080;
    return 0;
  }

  private toPublicEntry(entry: InternalEntry): SourceRuntimeEntry {
    return {
      source: cloneSourceDefinition(entry.source),
      state: { ...entry.state },
      details: {
        ...entry.details,
        effectiveSettings: entry.details.effectiveSettings
          ? { ...entry.details.effectiveSettings }
          : null,
        capabilities: entry.details.capabilities ? { ...entry.details.capabilities } : null,
        consumerIds: Array.from(entry.consumers.keys()),
        referenceCount: entry.consumers.size,
        hasPendingOperation: Boolean(entry.inFlightPromise),
      },
      resources: {
        sourceId: entry.source.id,
        mediaStream: entry.resources.mediaStream as unknown as MediaStream | null,
        videoElement: entry.resources.videoElement as unknown as HTMLVideoElement | null,
        imageElement: entry.resources.imageElement as unknown as HTMLImageElement | null,
        audioElement: entry.resources.audioElement as unknown as HTMLAudioElement | null,
      },
    };
  }
}

class SourceManagerError extends Error {
  readonly code: SourceErrorCode;

  constructor(code: SourceErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'SourceManagerError';
  }
}
