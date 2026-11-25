import test from 'node:test';
import assert from 'node:assert/strict';
import { addLayerToScene, addSource, containsRuntimeResources, createEmptyProject, createScene } from '../src/engine/sceneEngine';
import {
  SourceManager,
  type AssetUrlAdapter,
  type MediaAudioElementLike,
  type MediaDeviceDescriptor,
  type MediaDevicesAdapter,
  type MediaElementFactoryAdapter,
  type MediaImageElementLike,
  type MediaStreamLike,
  type MediaTrackCapabilitiesSnapshot,
  type MediaTrackLike,
  type MediaTrackSettingsSnapshot,
  type MediaVideoElementLike,
} from '../src/engine/sourceManager';
import { serializeStudioProject } from '../src/utils/studioStorage';
import type {
  CameraSourceDefinition,
  MicrophoneSourceDefinition,
  ScreenSourceDefinition,
  SystemAudioSourceDefinition,
  WindowSourceDefinition,
} from '../src/types/studio';

// ============================================================================
// ADAPTADORES SIMULADOS INSTRUMENTADOS (EXCLUSIVOS DE ENTORNO DE PRUEBAS)
// ============================================================================

class MockMediaTrack implements MediaTrackLike {
  readonly id: string;
  readonly kind: 'video' | 'audio';
  readonly label: string;
  enabled = true;
  muted = false;
  readyState: 'live' | 'ended' = 'live';
  stopCount = 0;
  onended: ((ev?: unknown) => void) | null = null;
  onmute: ((ev?: unknown) => void) | null = null;
  onunmute: ((ev?: unknown) => void) | null = null;

  private listeners = new Map<string, Set<(ev?: unknown) => void>>();
  private settings: MediaTrackSettingsSnapshot;
  private capabilities: MediaTrackCapabilitiesSnapshot;

  constructor(options: {
    id: string;
    kind: 'video' | 'audio';
    label?: string;
    settings?: MediaTrackSettingsSnapshot;
    capabilities?: MediaTrackCapabilitiesSnapshot;
  }) {
    this.id = options.id;
    this.kind = options.kind;
    this.label = options.label ?? `${options.kind}-${options.id}`;
    this.settings = options.settings ?? {};
    this.capabilities = options.capabilities ?? {};
  }

  stop(): void {
    this.stopCount += 1;
    this.readyState = 'ended';
  }

  getSettings(): MediaTrackSettingsSnapshot {
    return { ...this.settings };
  }

  getCapabilities(): MediaTrackCapabilitiesSnapshot {
    return { ...this.capabilities };
  }

  addEventListener(type: string, listener: (ev?: unknown) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: (ev?: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  getListenerCount(type?: string): number {
    if (type) return this.listeners.get(type)?.size ?? 0;
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total + (this.onended ? 1 : 0) + (this.onmute ? 1 : 0) + (this.onunmute ? 1 : 0);
  }

  simulateEnded(): void {
    this.readyState = 'ended';
    const set = this.listeners.get('ended');
    if (set) {
      for (const fn of Array.from(set)) fn({ type: 'ended' });
    }
    this.onended?.({ type: 'ended' });
  }

  simulateMute(isMuted: boolean): void {
    this.muted = isMuted;
    const eventName = isMuted ? 'mute' : 'unmute';
    const set = this.listeners.get(eventName);
    if (set) {
      for (const fn of Array.from(set)) fn({ type: eventName });
    }
    if (isMuted) this.onmute?.({ type: 'mute' });
    else this.onunmute?.({ type: 'unmute' });
  }
}

class MockMediaStream implements MediaStreamLike {
  readonly id: string;
  private tracks: MockMediaTrack[];

  constructor(id: string, tracks: MockMediaTrack[]) {
    this.id = id;
    this.tracks = [...tracks];
  }

  get active(): boolean {
    return this.tracks.some((t) => t.readyState === 'live');
  }

  getTracks(): MockMediaTrack[] {
    return [...this.tracks];
  }

  getVideoTracks(): MockMediaTrack[] {
    return this.tracks.filter((t) => t.kind === 'video');
  }

  getAudioTracks(): MockMediaTrack[] {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
}

class MockImageElement implements MediaImageElementLike {
  private _src = '';
  naturalWidth = 0;
  naturalHeight = 0;
  complete = false;
  onload: (() => void) | null = null;
  onerror: ((err?: unknown) => void) | null = null;
  private listeners = new Map<string, Set<(ev?: unknown) => void>>();
  shouldFail = false;

  get src(): string {
    return this._src;
  }

  set src(val: string) {
    this._src = val;
    if (!val) return;
    queueMicrotask(() => {
      if (this.shouldFail || val.includes('broken')) {
        this.listeners.get('error')?.forEach((fn) => fn(new Error('Image error')));
        this.onerror?.(new Error('Image error'));
      } else {
        this.naturalWidth = 1280;
        this.naturalHeight = 720;
        this.complete = true;
        this.listeners.get('load')?.forEach((fn) => fn());
        this.onload?.();
      }
    });
  }

  addEventListener(type: string, listener: (ev?: unknown) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: (ev?: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  getListenerCount(): number {
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }
}

class MockVideoElement implements MediaVideoElementLike {
  private _src = '';
  srcObject: unknown = null;
  loop = false;
  muted = false;
  playbackRate = 1;
  videoWidth = 0;
  videoHeight = 0;
  readyState = 0;
  paused = false;
  pauseCalls = 0;
  playCalls = 0;
  private listeners = new Map<string, Set<(ev?: unknown) => void>>();

  get src(): string {
    return this._src;
  }

  set src(val: string) {
    this._src = val;
  }

  load(): void {
    if (!this._src) return;
    queueMicrotask(() => {
      if (this._src.includes('broken')) {
        this.listeners.get('error')?.forEach((fn) => fn(new Error('Video error')));
      } else {
        this.videoWidth = 1920;
        this.videoHeight = 1080;
        this.readyState = 1;
        this.listeners.get('loadedmetadata')?.forEach((fn) => fn());
      }
    });
  }

  play(): void {
    this.paused = false;
    this.playCalls += 1;
  }

  pause(): void {
    this.paused = true;
    this.pauseCalls += 1;
  }

  addEventListener(type: string, listener: (ev?: unknown) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: (ev?: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  getListenerCount(): number {
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }
}

class MockAudioElement implements MediaAudioElementLike {
  src = '';
  srcObject: unknown = null;
  loop = false;
  muted = false;
  readyState = 0;
  paused = false;
  private listeners = new Map<string, Set<(ev?: unknown) => void>>();

  load(): void {
    if (!this.src) return;
    queueMicrotask(() => {
      if (this.src.includes('broken')) {
        this.listeners.get('error')?.forEach((fn) => fn(new Error('Audio error')));
      } else {
        this.readyState = 1;
        this.listeners.get('loadedmetadata')?.forEach((fn) => fn());
      }
    });
  }

  play(): void {
    this.paused = false;
  }

  pause(): void {
    this.paused = true;
  }

  addEventListener(type: string, listener: (ev?: unknown) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: (ev?: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  getListenerCount(): number {
    let total = 0;
    for (const set of this.listeners.values()) total += set.size;
    return total;
  }
}

function createTestHarness() {
  let seq = 0;
  const userMediaCalls: MediaStreamConstraints[] = [];
  const displayMediaCalls: DisplayMediaStreamOptions[] = [];
  const createdStreams: MockMediaStream[] = [];
  const createdTracks: MockMediaTrack[] = [];
  const createdVideos: MockVideoElement[] = [];
  const createdImages: MockImageElement[] = [];
  const createdAudios: MockAudioElement[] = [];
  const createdObjectUrls: string[] = [];
  const revokedObjectUrls: string[] = [];
  const deviceChangeListeners = new Set<() => void>();
  const assetBlobs = new Map<string, Blob>();

  let userMediaImpl: ((c: MediaStreamConstraints) => Promise<MediaStreamLike>) | null = null;
  let displayMediaImpl: ((c: DisplayMediaStreamOptions) => Promise<MediaStreamLike>) | null = null;
  let devicesList: MediaDeviceDescriptor[] = [
    { deviceId: 'cam-1', kind: 'videoinput', label: 'FaceTime HD Camera' },
    { deviceId: 'mic-1', kind: 'audioinput', label: 'Shure MV7' },
  ];

  const mediaDevices: MediaDevicesAdapter = {
    async getUserMedia(constraints) {
      userMediaCalls.push(constraints);
      if (userMediaImpl) return userMediaImpl(constraints);

      seq += 1;
      const tracks: MockMediaTrack[] = [];
      if (constraints.video) {
        const track = new MockMediaTrack({
          id: `vtrack_${seq}`,
          kind: 'video',
          label: 'FaceTime HD',
          settings: { width: 1280, height: 720, frameRate: 30, deviceId: 'cam-1' },
          capabilities: { width: { min: 640, max: 1920 }, height: { min: 360, max: 1080 }, frameRate: { max: 60 } },
        });
        tracks.push(track);
        createdTracks.push(track);
      }
      if (constraints.audio) {
        const track = new MockMediaTrack({
          id: `atrack_${seq}`,
          kind: 'audio',
          label: 'Shure MV7',
          settings: { deviceId: 'mic-1', sampleRate: 48000, channelCount: 1 },
        });
        tracks.push(track);
        createdTracks.push(track);
      }
      const stream = new MockMediaStream(`stream_${seq}`, tracks);
      createdStreams.push(stream);
      return stream;
    },
    async getDisplayMedia(constraints) {
      displayMediaCalls.push(constraints);
      if (displayMediaImpl) return displayMediaImpl(constraints);

      seq += 1;
      const tracks: MockMediaTrack[] = [];
      const vTrack = new MockMediaTrack({
        id: `disp_v_${seq}`,
        kind: 'video',
        label: `Window ${seq}`,
        settings: { width: 1920, height: 1080, frameRate: 60, displaySurface: 'window' },
      });
      tracks.push(vTrack);
      createdTracks.push(vTrack);

      if (constraints.audio) {
        const aTrack = new MockMediaTrack({
          id: `disp_a_${seq}`,
          kind: 'audio',
          label: `Window Audio ${seq}`,
          settings: { sampleRate: 48000, channelCount: 2 },
        });
        tracks.push(aTrack);
        createdTracks.push(aTrack);
      }

      const stream = new MockMediaStream(`disp_stream_${seq}`, tracks);
      createdStreams.push(stream);
      return stream;
    },
    async enumerateDevices() {
      return [...devicesList];
    },
    onDeviceChange(listener) {
      deviceChangeListeners.add(listener);
      return () => {
        deviceChangeListeners.delete(listener);
      };
    },
  };

  const mediaElements: MediaElementFactoryAdapter = {
    createImageElement() {
      const el = new MockImageElement();
      createdImages.push(el);
      return el;
    },
    createVideoElement() {
      const el = new MockVideoElement();
      createdVideos.push(el);
      return el;
    },
    createAudioElement() {
      const el = new MockAudioElement();
      createdAudios.push(el);
      return el;
    },
    async attachStreamToVideo(video, stream) {
      video.srcObject = stream;
      video.muted = true;
      video.play?.();
    },
  };

  const assetUrls: AssetUrlAdapter = {
    resolveAssetBlob(assetRef) {
      return assetBlobs.get(assetRef) ?? null;
    },
    createObjectURL() {
      seq += 1;
      const url = `blob:optica-managed-${seq}`;
      createdObjectUrls.push(url);
      return url;
    },
    revokeObjectURL(url) {
      revokedObjectUrls.push(url);
    },
  };

  return {
    mediaDevices,
    mediaElements,
    assetUrls,
    userMediaCalls,
    displayMediaCalls,
    createdStreams,
    createdTracks,
    createdVideos,
    createdImages,
    createdAudios,
    createdObjectUrls,
    revokedObjectUrls,
    deviceChangeListeners,
    assetBlobs,
    setUserMediaImpl(fn: ((c: MediaStreamConstraints) => Promise<MediaStreamLike>) | null) {
      userMediaImpl = fn;
    },
    setDisplayMediaImpl(fn: ((c: DisplayMediaStreamOptions) => Promise<MediaStreamLike>) | null) {
      displayMediaImpl = fn;
    },
    setDevicesList(next: MediaDeviceDescriptor[]) {
      devicesList = next;
    },
    triggerDeviceChange() {
      for (const fn of deviceChangeListeners) fn();
    },
    createManager(policy?: 'reuse-existing' | 'prefer-highest' | 'reject-incompatible') {
      return new SourceManager({
        mediaDevices,
        mediaElements,
        assetUrls,
        cameraDeviceConflictPolicy: policy,
      });
    },
  };
}

function makeCameraSource(id = 'src_cam_1', overrides: Partial<CameraSourceDefinition> = {}): CameraSourceDefinition {
  return {
    id,
    kind: 'camera',
    name: 'FaceTime HD',
    createdAt: 1000,
    deviceId: 'cam-1',
    preferredWidth: 1920,
    preferredHeight: 1080,
    preferredFps: 60,
    ...overrides,
  };
}

function makeMicSource(id = 'src_mic_1'): MicrophoneSourceDefinition {
  return {
    id,
    kind: 'microphone',
    name: 'Shure MV7',
    createdAt: 1000,
    deviceId: 'mic-1',
    echoCancellation: true,
    noiseSuppression: true,
  };
}

function makeWindowSource(id = 'src_win_1', includeSystemAudio = false): WindowSourceDefinition {
  return {
    id,
    kind: 'window',
    name: 'ChatGPT Desktop',
    createdAt: 1000,
    includeSystemAudio,
  };
}

// ============================================================================
// SUITE OBLIGATORIA DE 20 PRUEBAS AUTOMATIZADAS (CP-P01-B)
// ============================================================================

test('1. Adquisición básica de una fuente y lectura real de getSettings()', async () => {
  const h = createTestHarness();
  const sm = h.createManager();
  const cam = makeCameraSource();

  // Registrar definición NO debe activar hardware
  const reg = sm.registerSource(cam);
  assert.equal(reg.state.status, 'idle');
  assert.equal(h.userMediaCalls.length, 0);

  const entry = await sm.acquireSource(cam, 'scene_1');
  assert.equal(entry.state.status, 'live');
  assert.equal(h.userMediaCalls.length, 1);
  // Solicitó 1080p@60 pero getSettings() real devolvió 720p@30 -> debe reflejar la realidad
  assert.equal(entry.state.intrinsicWidth, 1280);
  assert.equal(entry.state.intrinsicHeight, 720);
  assert.equal(entry.state.activeFps, 30);
  assert.equal(entry.details.referenceCount, 1);
  assert.deepEqual(entry.details.consumerIds, ['scene_1']);

  sm.disposeAll();
});

test('2. Adquisición independiente de cámara (solo vídeo) y micrófono (solo audio)', async () => {
  const h = createTestHarness();
  const sm = h.createManager();
  const cam = makeCameraSource();
  const mic = makeMicSource();

  const camEntry = await sm.acquireSource(cam, 'scene_1');
  const micEntry = await sm.acquireSource(mic, 'scene_1');

  assert.equal(h.userMediaCalls.length, 2);
  assert.equal(h.userMediaCalls[0].audio, false, 'La cámara NO debe solicitar audio');
  assert.ok(h.userMediaCalls[0].video);
  assert.equal(h.userMediaCalls[1].video, false, 'El micrófono NO debe solicitar vídeo');
  assert.ok(h.userMediaCalls[1].audio);

  assert.equal(camEntry.details.hasVideoTrack, true);
  assert.equal(camEntry.details.hasAudioTrack, false);
  assert.equal(micEntry.details.hasVideoTrack, false);
  assert.equal(micEntry.details.hasAudioTrack, true);

  // Liberar o reconectar cámara NO debe afectar ni detener al micrófono
  sm.releaseSource(cam.id, 'scene_1');
  assert.equal(sm.getEntry(cam.id)?.state.status, 'idle');
  assert.equal(sm.getEntry(mic.id)?.state.status, 'live');
  assert.equal(h.createdTracks[1].stopCount, 0);

  sm.disposeAll();
});

test('3. Compartición de una misma fuente entre múltiples escenas sin duplicar hardware', async () => {
  const h = createTestHarness();
  const sm = h.createManager();
  const cam = makeCameraSource();

  const e1 = await sm.acquireSource(cam, { id: 'scene_intro', kind: 'active-scene' });
  const e2 = await sm.acquireSource(cam, { id: 'scene_tutorial', kind: 'staged-scene' });
  const e3 = await sm.acquireSource(cam, { id: 'preview_1', kind: 'preview' });

  assert.equal(h.userMediaCalls.length, 1);
  assert.equal(e1.resources.mediaStream?.id, e2.resources.mediaStream?.id);
  assert.equal(e2.resources.mediaStream?.id, e3.resources.mediaStream?.id);
  assert.equal(sm.getConsumerCount(cam.id), 3);

  sm.disposeAll();
});

test('4. Adquisiciones concurrentes de la misma fuente se deduplican en una sola solicitud', async () => {
  const h = createTestHarness();
  let resolveStream!: (s: MediaStreamLike) => void;
  h.setUserMediaImpl(
    () =>
      new Promise<MediaStreamLike>((resolve) => {
        resolveStream = resolve;
      })
  );

  const sm = h.createManager();
  const cam = makeCameraSource();

  const p1 = sm.acquireSource(cam, 'scene_1');
  const p2 = sm.acquireSource(cam, 'program-compositor');
  assert.equal(sm.getEntry(cam.id)?.state.status, 'initializing');
  assert.equal(h.userMediaCalls.length, 1);

  const track = new MockMediaTrack({
    id: 'conc_cam_track',
    kind: 'video',
    settings: { width: 1920, height: 1080, frameRate: 60 },
  });
  resolveStream(new MockMediaStream('conc_stream', [track]));

  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.state.status, 'live');
  assert.equal(r2.state.status, 'live');
  assert.equal(h.userMediaCalls.length, 1);
  assert.equal(sm.getConsumerCount(cam.id), 2);

  sm.disposeAll();
});

test('5. Liberación de un único consumidor mantiene la fuente viva para los demás', async () => {
  const h = createTestHarness();
  const sm = h.createManager();
  const cam = makeCameraSource();

  await sm.acquireSource(cam, 'scene_1');
  await sm.acquireSource(cam, 'scene_2');
  const track = h.createdTracks[0];

  const afterReleaseOne = sm.releaseSource(cam.id, 'scene_1');
  assert.equal(afterReleaseOne?.state.status, 'live');
  assert.equal(afterReleaseOne?.details.referenceCount, 1);
  assert.deepEqual(afterReleaseOne?.details.consumerIds, ['scene_2']);
  assert.equal(track.stopCount, 0);
  assert.equal(track.readyState, 'live');

  sm.disposeAll();
});

test('6. Liberación del último consumidor detiene determinísticamente las pistas y limpia', async () => {
  const h = createTestHarness();
  const sm = h.createManager();
  const cam = makeCameraSource();

  await sm.acquireSource(cam, 'scene_1');
  await sm.acquireSource(cam, 'scene_2');
  const track = h.createdTracks[0];

  sm.releaseSource(cam.id, 'scene_1');
  assert.equal(track.stopCount, 0);

  const finalState = sm.releaseSource(cam.id, 'scene_2');
  assert.equal(finalState?.state.status, 'idle');
  assert.equal(finalState?.details.referenceCount, 0);
  assert.equal(finalState?.resources.mediaStream, null);
  assert.equal(track.stopCount, 1);
  assert.equal(track.readyState, 'ended');
  assert.equal(sm.getActiveTrackCount(), 0);

  sm.disposeAll();
});

test('7. Adquisición y liberación idempotentes (prevención de referencias duplicadas o negativas)', async () => {
  const h = createTestHarness();
  const sm = h.createManager();
  const cam = makeCameraSource();

  await sm.acquireSource(cam, 'scene_1');
  await sm.acquireSource(cam, 'scene_1');
  await sm.acquireSource(cam, 'scene_1');

  assert.equal(h.userMediaCalls.length, 1);
  assert.equal(sm.getConsumerCount(cam.id), 1);

  sm.releaseSource(cam.id, 'consumidor_inexistente');
  assert.equal(sm.getConsumerCount(cam.id), 1);

  sm.releaseSource(cam.id, 'scene_1');
  sm.releaseSource(cam.id, 'scene_1'); // segunda liberación repetida
  assert.equal(sm.getConsumerCount(cam.id), 0);
  assert.equal(h.createdTracks[0].stopCount, 1);

  sm.disposeAll();
});

test('8. Gestión explícita de permisos denegados', async () => {
  const h = createTestHarness();
  h.setUserMediaImpl(async () => {
    const err = new Error('Permission denied by macOS TCC');
    err.name = 'NotAllowedError';
    throw err;
  });

  const sm = h.createManager();
  const cam = makeCameraSource();
  const entry = await sm.acquireSource(cam, 'scene_1');

  assert.equal(entry.state.status, 'error');
  assert.equal(entry.details.errorCode, 'permission-denied');
  assert.ok(entry.state.errorMessage?.includes('Permission denied'));
  assert.equal(sm.getActiveTrackCount(), 0);

  sm.disposeAll();
});

test('9. Gestión de errores de inicialización (dispositivo no encontrado / archivo corrupto)', async () => {
  const h = createTestHarness();
  h.setUserMediaImpl(async () => {
    const err = new Error('Requested device not found');
    err.name = 'NotFoundError';
    throw err;
  });

  const sm = h.createManager();
  const camEntry = await sm.acquireSource(makeCameraSource(), 'scene_1');
  assert.equal(camEntry.state.status, 'error');
  assert.equal(camEntry.details.errorCode, 'device-not-found');

  const brokenImgEntry = await sm.acquireSource(
    {
      id: 'src_img_broken',
      kind: 'image',
      name: 'Imagen rota',
      createdAt: 1,
      assetRef: 'https://example.com/broken.png',
    },
    'scene_1'
  );
  assert.equal(brokenImgEntry.state.status, 'error');
  assert.equal(brokenImgEntry.details.errorCode, 'media-load-failed');

  sm.disposeAll();
});

test('10. Desconexión externa mediante track.onended (ventana cerrada / cámara desenchufada)', async () => {
  const h = createTestHarness();
  const sm = h.createManager();
  const win = makeWindowSource('src_vscode', false);

  await sm.acquireSource(win, 'scene_1');
  const winTrack = h.createdTracks[0];

  // Simular silencio temporal (ej. ventana minimizada) -> sigue live pero con trackMuted = true
  winTrack.simulateMute(true);
  assert.equal(sm.getEntry(win.id)?.state.status, 'live');
  assert.equal(sm.getEntry(win.id)?.details.trackMuted, true);

  // Simular cierre de la ventana -> track ended -> disconnected preservando fuente y consumidor
  winTrack.simulateEnded();
  const disconnected = sm.getEntry(win.id);
  assert.equal(disconnected?.state.status, 'disconnected');
  assert.equal(disconnected?.details.disconnectionReason, 'window-or-share-closed');
  assert.equal(disconnected?.resources.mediaStream, null);
  assert.deepEqual(disconnected?.details.consumerIds, ['scene_1']);
  assert.equal(winTrack.getListenerCount(), 0);

  sm.disposeAll();
});

test('11. Reconexión explícita sin duplicar conexiones ya activas', async () => {
  const h = createTestHarness();
  const sm = h.createManager();
  const win = makeWindowSource('src_win_reconn', false);

  await sm.acquireSource(win, 'scene_1');
  assert.equal(h.displayMediaCalls.length, 1);

  // Si ya está live y no se pasa force, reconnectSource no reabre selector
  const noop = await sm.reconnectSource(win.id);
  assert.equal(noop?.state.status, 'live');
  assert.equal(h.displayMediaCalls.length, 1);

  // Simular desconexión externa y reconexión explícita
  h.createdTracks[0].simulateEnded();
  assert.equal(sm.getEntry(win.id)?.state.status, 'disconnected');

  const reconnected = await sm.reconnectSource(win.id);
  assert.equal(reconnected?.state.status, 'live');
  assert.equal(h.displayMediaCalls.length, 2);

  sm.disposeAll();
});

test('12. Liberación durante una solicitud pendiente descarta y detiene el stream tardío', async () => {
  const h = createTestHarness();
  let resolveDelayed!: (s: MediaStreamLike) => void;
  h.setUserMediaImpl(
    () =>
      new Promise<MediaStreamLike>((resolve) => {
        resolveDelayed = resolve;
      })
  );

  const sm = h.createManager();
  const cam = makeCameraSource();
  const acquirePromise = sm.acquireSource(cam, 'scene_1');
  assert.equal(sm.getEntry(cam.id)?.state.status, 'initializing');

  // El usuario cambia de escena y libera antes de que el permiso responda
  sm.releaseSource(cam.id, 'scene_1');
  assert.equal(sm.getEntry(cam.id)?.state.status, 'idle');

  const lateTrack = new MockMediaTrack({ id: 'late_track', kind: 'video' });
  resolveDelayed(new MockMediaStream('late_stream', [lateTrack]));

  const resolvedEntry = await acquirePromise;
  assert.equal(resolvedEntry.state.status, 'idle');
  assert.equal(lateTrack.stopCount, 1, 'La pista tardía debe detenerse inmediatamente');
  assert.equal(sm.getActiveTrackCount(), 0);

  sm.disposeAll();
});

test('13. Descarte de resultados obsoletos cuando una nueva solicitud reemplaza a una anterior', async () => {
  const h = createTestHarness();
  let callIndex = 0;
  let resolveFirst!: (s: MediaStreamLike) => void;
  let resolveSecond!: (s: MediaStreamLike) => void;

  h.setDisplayMediaImpl(() => {
    callIndex += 1;
    return new Promise<MediaStreamLike>((resolve) => {
      if (callIndex === 1) resolveFirst = resolve;
      else resolveSecond = resolve;
    });
  });

  const sm = h.createManager();
  const win = makeWindowSource('src_race_win');

  const p1 = sm.acquireSource(win, 'scene_1');
  // Reconexión forzada (ej. usuario cambia de ventana antes de que la primera responda)
  const p2 = sm.reconnectSource(win.id, { force: true });

  const track2 = new MockMediaTrack({
    id: 'fresh_win_track',
    kind: 'video',
    settings: { width: 1920, height: 1080, frameRate: 60 },
  });
  resolveSecond(new MockMediaStream('fresh_stream', [track2]));
  await p2;

  const track1 = new MockMediaTrack({ id: 'stale_win_track', kind: 'video' });
  resolveFirst(new MockMediaStream('stale_stream', [track1]));
  await p1;

  const final = sm.getEntry(win.id);
  assert.equal(final?.state.status, 'live');
  assert.equal(final?.resources.mediaStream?.id, 'fresh_stream');
  assert.equal(track1.stopCount, 1, 'El stream obsoleto debe detenerse');
  assert.equal(track2.stopCount, 0, 'El stream vigente debe permanecer activo');

  sm.disposeAll();
});

test('14. disposeAll() durante inicialización cancela solicitudes pendientes y limpia todo', async () => {
  const h = createTestHarness();
  let resolvePending!: (s: MediaStreamLike) => void;
  h.setUserMediaImpl(
    () =>
      new Promise<MediaStreamLike>((resolve) => {
        resolvePending = resolve;
      })
  );

  const sm = h.createManager();
  const cam = makeCameraSource();
  const p = sm.acquireSource(cam, 'scene_1');

  sm.disposeAll();
  assert.equal(sm.getEntry(cam.id)?.state.status, 'idle');
  assert.equal(h.deviceChangeListeners.size, 0);

  const orphanTrack = new MockMediaTrack({ id: 'after_dispose_track', kind: 'video' });
  resolvePending(new MockMediaStream('after_dispose_stream', [orphanTrack]));
  await p;

  assert.equal(orphanTrack.stopCount, 1);
  assert.equal(sm.getEntry(cam.id)?.state.status, 'idle');
  assert.equal(sm.getActiveTrackCount(), 0);
});

test('15. Capturas independientes y simultáneas de múltiples ventanas y pantallas', async () => {
  const h = createTestHarness();
  const sm = h.createManager();

  const chatGptWin: WindowSourceDefinition = {
    id: 'src_win_chatgpt',
    kind: 'window',
    name: 'ChatGPT',
    createdAt: 1,
    includeSystemAudio: false,
  };
  const vscodeWin: WindowSourceDefinition = {
    id: 'src_win_vscode',
    kind: 'window',
    name: 'VS Code',
    createdAt: 1,
    includeSystemAudio: false,
  };
  const monitor2: ScreenSourceDefinition = {
    id: 'src_screen_2',
    kind: 'screen',
    name: 'Monitor Externo',
    createdAt: 1,
    includeSystemAudio: true,
  };

  const [e1, e2, e3] = await Promise.all([
    sm.acquireSource(chatGptWin, 'scene_compare'),
    sm.acquireSource(vscodeWin, 'scene_compare'),
    sm.acquireSource(monitor2, 'scene_compare'),
  ]);

  assert.equal(h.displayMediaCalls.length, 3);
  assert.equal(e1.state.status, 'live');
  assert.equal(e2.state.status, 'live');
  assert.equal(e3.state.status, 'live');
  assert.notEqual(e1.resources.mediaStream?.id, e2.resources.mediaStream?.id);
  assert.notEqual(e2.resources.mediaStream?.id, e3.resources.mediaStream?.id);

  // Cerrar solo ChatGPT no afecta a VS Code ni al Monitor Externo
  sm.releaseSource(chatGptWin.id, 'scene_compare');
  assert.equal(sm.getEntry(chatGptWin.id)?.state.status, 'idle');
  assert.equal(sm.getEntry(vscodeWin.id)?.state.status, 'live');
  assert.equal(sm.getEntry(monitor2.id)?.state.status, 'live');

  sm.disposeAll();
});

test('16. Gestión y revocación exclusiva de Object URLs creadas por el gestor', async () => {
  const h = createTestHarness();
  h.assetBlobs.set('gallery-asset-1', new Blob(['fake-image-data']));
  h.assetBlobs.set('local-video-1', new Blob(['fake-video-data']));

  const sm = h.createManager();

  // 1. Asset que genera Object URL propia
  const managedImg = await sm.acquireSource(
    {
      id: 'src_managed_img',
      kind: 'image',
      name: 'Slide IA',
      createdAt: 1,
      assetRef: 'gallery-asset-1',
    },
    'scene_1'
  );
  assert.equal(managedImg.state.status, 'live');
  assert.equal(managedImg.state.intrinsicWidth, 1280);
  assert.equal(h.createdObjectUrls.length, 1);

  // 2. Asset con blob URL externa preexistente (NO creada por SourceManager)
  const externalBlobUrl = 'blob:external-consumer-999';
  const externalVid = await sm.acquireSource(
    {
      id: 'src_external_vid',
      kind: 'video-file',
      name: 'Clip B-roll externo',
      createdAt: 1,
      assetRef: externalBlobUrl,
      loop: true,
      playbackRate: 1,
      mutedByDefault: true,
    },
    'scene_1'
  );
  assert.equal(externalVid.state.status, 'live');
  assert.equal(externalVid.state.intrinsicWidth, 1920);
  assert.equal(h.createdObjectUrls.length, 1);

  sm.releaseConsumer('scene_1');

  assert.deepEqual(h.revokedObjectUrls, [h.createdObjectUrls[0]]);
  assert.equal(h.revokedObjectUrls.includes(externalBlobUrl), false);

  sm.disposeAll();
});

test('17. Protección de pistas de audio compartidas entre captura de ventana y system-audio', async () => {
  const h = createTestHarness();
  const sm = h.createManager();

  const winWithAudio = makeWindowSource('src_win_audio', true);
  const sysAudio: SystemAudioSourceDefinition = {
    id: 'src_sys_audio',
    kind: 'system-audio',
    name: 'Audio de Demo',
    createdAt: 1,
    targetHint: 'ChatGPT',
  };

  await sm.acquireSource(winWithAudio, 'scene_demo');
  const sysEntry = await sm.acquireSource(sysAudio, 'audio-mixer', {
    linkedDisplaySourceId: winWithAudio.id,
  });

  // Solo 1 llamada a getDisplayMedia: system-audio reutilizó la pista del window
  assert.equal(h.displayMediaCalls.length, 1);
  assert.equal(sysEntry.state.status, 'live');
  assert.equal(sysEntry.details.sharedAudioFromSourceId, winWithAudio.id);

  const dispVideoTrack = h.createdTracks.find((t) => t.kind === 'video')!;
  const dispAudioTrack = h.createdTracks.find((t) => t.kind === 'audio')!;

  // Al liberar la ventana, se detiene el vídeo pero el audio compartido sigue vivo para audio-mixer
  sm.releaseSource(winWithAudio.id, 'scene_demo');
  assert.equal(dispVideoTrack.stopCount, 1);
  assert.equal(dispAudioTrack.stopCount, 0, 'NO debe detener pista de audio compartida aún en uso');
  assert.equal(dispAudioTrack.readyState, 'live');

  // Al liberar también system-audio, ahora sí se detiene la pista compartida
  sm.releaseSource(sysAudio.id, 'audio-mixer');
  assert.equal(dispAudioTrack.stopCount, 1);
  assert.equal(dispAudioTrack.readyState, 'ended');
  assert.equal(sm.getActiveTrackCount(), 0);

  // Además: si getDisplayMedia no entrega pista de audio, NO debe simular audio del sistema
  h.setDisplayMediaImpl(async () => {
    const onlyVideo = new MockMediaTrack({ id: 'no_sys_audio_v', kind: 'video' });
    return new MockMediaStream('no_audio_stream', [onlyVideo]);
  });
  const orphanSysAudio: SystemAudioSourceDefinition = {
    id: 'src_sys_no_track',
    kind: 'system-audio',
    name: 'Sin audio real',
    createdAt: 1,
  };
  const noAudioRes = await sm.acquireSource(orphanSysAudio, 'audio-mixer');
  assert.equal(noAudioRes.state.status, 'error');
  assert.equal(noAudioRes.details.errorCode, 'system-audio-unavailable');

  sm.disposeAll();
});

test('18. Ausencia total de recursos runtime en StudioProject y persistencia serializable', async () => {
  const h = createTestHarness();
  const sm = h.createManager();

  let project = createEmptyProject({ name: 'Proyecto Estudio Pro' });
  const camAdd = addSource(project, {
    kind: 'camera',
    name: 'Cam Principal',
    deviceId: 'cam-1',
    preferredWidth: 1920,
    preferredHeight: 1080,
    preferredFps: 60,
  });
  project = camAdd.project;

  const winAdd = addSource(project, {
    kind: 'window',
    name: 'Google AI Studio',
    includeSystemAudio: true,
  });
  project = winAdd.project;

  project = addLayerToScene(project, project.activeSceneId, winAdd.source.id).project;
  project = addLayerToScene(project, project.activeSceneId, camAdd.source.id).project;

  const scene2 = createScene(project, { name: 'Cierre' });
  project = scene2.project;
  project = addLayerToScene(project, scene2.scene.id, camAdd.source.id).project;

  sm.syncProjectDefinitions(project);
  // syncProjectDefinitions NO debe activar hardware
  assert.equal(h.userMediaCalls.length, 0);
  assert.equal(h.displayMediaCalls.length, 0);

  const activeScene = project.scenes.find((s) => s.id === project.activeSceneId)!;
  await sm.acquireSourcesForScene(activeScene, project.sources, 'active-scene');

  assert.equal(sm.getEntry(camAdd.source.id)?.state.status, 'live');
  assert.equal(sm.getEntry(winAdd.source.id)?.state.status, 'live');

  // El proyecto serializable debe permanecer completamente limpio
  assert.equal(containsRuntimeResources(project), false);
  const serialized = serializeStudioProject(project);
  assert.ok(serialized.length > 0);

  sm.disposeAll();
});

test('19. Fuentes gráficas (color, gradient, text) quedan live sin adquirir hardware', async () => {
  const h = createTestHarness();
  const sm = h.createManager();

  const colorRes = await sm.acquireSource(
    { id: 'src_col', kind: 'color', name: 'Fondo Oscuro', createdAt: 1, color: '#06070a' },
    'scene_1'
  );
  const gradRes = await sm.acquireSource(
    {
      id: 'src_grad',
      kind: 'gradient',
      name: 'Liquid Glass',
      createdAt: 1,
      startColor: '#090d1a',
      endColor: '#1e1b4b',
      angleDeg: 135,
    },
    'scene_1'
  );
  const textRes = await sm.acquireSource(
    {
      id: 'src_txt',
      kind: 'text',
      name: 'Lower Third',
      createdAt: 1,
      text: 'Demo Claude / Gemini',
      fontFamily: 'sans',
      fontSizePx: 36,
      textColor: '#ffffff',
      accentColor: '#38bdf8',
      glassBackdrop: true,
      align: 'left',
    },
    'scene_1'
  );

  assert.equal(colorRes.state.status, 'live');
  assert.equal(gradRes.state.status, 'live');
  assert.equal(textRes.state.status, 'live');
  assert.equal(h.userMediaCalls.length, 0);
  assert.equal(h.displayMediaCalls.length, 0);
  assert.equal(sm.getActiveTrackCount(), 0);

  sm.releaseConsumer('scene_1');
  assert.equal(sm.getEntry('src_txt')?.state.status, 'idle');

  sm.disposeAll();
});

test('20. Prevención de listeners huérfanos, política paused/resume y desconexión por devicechange', async () => {
  const h = createTestHarness();
  const sm = h.createManager();
  const cam = makeCameraSource('src_cam_lifecycle');

  await sm.acquireSource(cam, 'scene_1');
  const track = h.createdTracks[0];
  assert.ok(track.getListenerCount() > 0);
  assert.equal(h.deviceChangeListeners.size, 1);

  // Pausa mantiene conexión física abierta (`track.enabled = false`) sin detener la pista
  const paused = sm.pauseSource(cam.id);
  assert.equal(paused?.state.status, 'paused');
  assert.equal(track.enabled, false);
  assert.equal(track.stopCount, 0);

  const resumed = sm.resumeSource(cam.id);
  assert.equal(resumed?.state.status, 'live');
  assert.equal(track.enabled, true);

  // Simular retirada física del dispositivo + devicechange
  h.setDevicesList([{ deviceId: 'mic-1', kind: 'audioinput', label: 'Shure MV7' }]);
  h.triggerDeviceChange();
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(sm.getEntry(cam.id)?.state.status, 'disconnected');
  assert.equal(track.stopCount, 1);
  assert.equal(track.getListenerCount(), 0, 'No deben quedar listeners huérfanos en la pista');

  // Adquirir audio-file y luego disponer todo para validar limpieza total de listeners
  await sm.acquireSource(
    {
      id: 'src_aud_1',
      kind: 'audio-file',
      name: 'Cortina intro',
      createdAt: 1,
      assetRef: 'https://example.com/intro.mp3',
      loop: false,
    },
    'scene_1'
  );

  sm.disposeAll();

  assert.equal(h.deviceChangeListeners.size, 0, 'El listener de devicechange debe quedar limpio');
  for (const t of h.createdTracks) {
    assert.equal(t.getListenerCount(), 0);
  }
  for (const img of h.createdImages) {
    assert.equal(img.getListenerCount(), 0);
  }
  for (const vid of h.createdVideos) {
    assert.equal(vid.getListenerCount(), 0);
  }
  for (const aud of h.createdAudios) {
    assert.equal(aud.getListenerCount(), 0);
  }
});
