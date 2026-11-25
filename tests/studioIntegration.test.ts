import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COORDINATOR_CONSUMER_ID,
  createStarterStudioProject,
  StudioCoordinator,
  type LegacyStreamHandoff,
} from '../src/engine/studioCoordinator';
import { STUDIO_ENGINE_COMPATIBILITY_MATRIX } from '../src/engine/engineCompatibility';
import { addLayerToScene, addSource, createScene } from '../src/engine/sceneEngine';
import {
  createInMemoryStudioStorageAdapter,
  saveStudioProject,
  STUDIO_PROJECTS_DB_NAME,
  STUDIO_PROJECTS_STORE_NAME,
  type StudioStorageAdapter,
} from '../src/utils/studioStorage';
import type {
  FrameSchedulerAdapter,
  ProgramSurfaceLike,
} from '../src/engine/programCompositor';
import type {
  MediaDeviceDescriptor,
  MediaDevicesAdapter,
  MediaElementFactoryAdapter,
  MediaStreamLike,
  MediaTrackCapabilitiesSnapshot,
  MediaTrackLike,
  MediaTrackSettingsSnapshot,
  MediaVideoElementLike,
} from '../src/engine/sourceManager';

// ============================================================================
// ADAPTADORES SIMULADOS INSTRUMENTADOS (EXCLUSIVOS DE TESTS NODE.JS)
// NOTA HONESTA: En Node.js no existe Chromium, WebGL2 real de Apple Metal ni
// IndexedDB del navegador; todas las superficies, pistas MediaStream y medios
// aquí usados están simulados e instrumentados para validar contratos e integración.
// ============================================================================

class IntegrationMockTrack implements MediaTrackLike {
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

  constructor(opts: {
    id: string;
    kind: 'video' | 'audio';
    label?: string;
    settings?: MediaTrackSettingsSnapshot;
    capabilities?: MediaTrackCapabilitiesSnapshot;
  }) {
    this.id = opts.id;
    this.kind = opts.kind;
    this.label = opts.label ?? `${opts.kind}-${opts.id}`;
    this.settings = opts.settings ?? {};
    this.capabilities = opts.capabilities ?? {};
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

  emit(type: 'ended' | 'mute' | 'unmute'): void {
    if (type === 'ended') this.readyState = 'ended';
    if (type === 'mute') this.muted = true;
    if (type === 'unmute') this.muted = false;
    for (const fn of [...(this.listeners.get(type) ?? [])]) {
      fn({ type });
    }
  }
}

class IntegrationMockStream implements MediaStreamLike {
  readonly id: string;
  private tracks: IntegrationMockTrack[];

  constructor(id: string, tracks: IntegrationMockTrack[]) {
    this.id = id;
    this.tracks = tracks;
  }

  get active(): boolean {
    return this.tracks.some((t) => t.readyState === 'live');
  }

  getTracks(): MediaTrackLike[] {
    return [...this.tracks];
  }

  getVideoTracks(): MediaTrackLike[] {
    return this.tracks.filter((t) => t.kind === 'video');
  }

  getAudioTracks(): MediaTrackLike[] {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
}

interface MockCanvas2dRecord {
  op: string;
  args: unknown[];
}

interface StrictContextSurface extends ProgramSurfaceLike {
  readonly surfaceId: number;
  readonly lockedContextType: 'none' | '2d' | 'webgl2';
  readonly mixedContextViolations: number;
  readonly drawCalls: MockCanvas2dRecord[];
  emitContextEvent(type: 'webglcontextlost' | 'webglcontextrestored'): void;
}

function createStrictSurfaceFactory(options?: {
  allowWebgl2?: boolean;
}) {
  let seq = 0;
  const createdSurfaces: StrictContextSurface[] = [];

  const factory = (width: number, height: number): StrictContextSurface => {
    seq += 1;
    const surfaceId = seq;
    let locked: 'none' | '2d' | 'webgl2' = 'none';
    let violations = 0;
    const drawCalls: MockCanvas2dRecord[] = [];
    const listeners = new Map<string, Set<(ev?: unknown) => void>>();

    const ctx2d = {
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      fillStyle: '#000',
      strokeStyle: '#fff',
      lineWidth: 1,
      shadowColor: 'transparent',
      shadowBlur: 0,
      font: '16px sans-serif',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      scale() {},
      beginPath() {},
      closePath() {},
      rect() {},
      roundRect() {},
      arc() {},
      moveTo() {},
      lineTo() {},
      bezierCurveTo() {},
      quadraticCurveTo() {},
      clip() {},
      fill() {},
      stroke() {},
      fillRect(x: number, y: number, w: number, h: number) {
        drawCalls.push({ op: 'fillRect', args: [x, y, w, h] });
      },
      fillText(t: string, x: number, y: number) {
        drawCalls.push({ op: 'fillText', args: [t, x, y] });
      },
      drawImage(...args: unknown[]) {
        drawCalls.push({ op: 'drawImage', args });
      },
      createLinearGradient() {
        return { addColorStop() {} };
      },
    };

    const createWebgl2Stub = () => {
      let lost = false;
      const noop = () => {};
      return {
        VERTEX_SHADER: 0x8b31,
        FRAGMENT_SHADER: 0x8b30,
        COMPILE_STATUS: 0x8b81,
        LINK_STATUS: 0x8b82,
        ARRAY_BUFFER: 0x8892,
        STATIC_DRAW: 0x88e4,
        FLOAT: 0x1406,
        TEXTURE_2D: 0x0de1,
        TEXTURE0: 0x84c0,
        RGBA: 0x1908,
        UNSIGNED_BYTE: 0x1401,
        TEXTURE_WRAP_S: 0x2802,
        TEXTURE_WRAP_T: 0x2803,
        TEXTURE_MIN_FILTER: 0x2801,
        TEXTURE_MAG_FILTER: 0x2800,
        CLAMP_TO_EDGE: 0x812f,
        LINEAR: 0x2601,
        FRAMEBUFFER: 0x8d40,
        COLOR_ATTACHMENT0: 0x8ce0,
        FRAMEBUFFER_COMPLETE: 0x8cd5,
        COLOR_BUFFER_BIT: 0x4000,
        BLEND: 0x0be2,
        ONE: 1,
        ONE_MINUS_SRC_ALPHA: 0x0303,
        SRC_ALPHA: 0x0302,
        TRIANGLE_STRIP: 0x0005,
        UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
        createShader: () => ({}),
        shaderSource: noop,
        compileShader: noop,
        getShaderParameter: () => true,
        getShaderInfoLog: () => '',
        deleteShader: noop,
        createProgram: () => ({}),
        attachShader: noop,
        linkProgram: noop,
        getProgramParameter: () => true,
        getProgramInfoLog: () => '',
        deleteProgram: noop,
        useProgram: noop,
        getUniformLocation: () => ({}),
        getAttribLocation: () => 0,
        createVertexArray: () => ({}),
        bindVertexArray: noop,
        deleteVertexArray: noop,
        createBuffer: () => ({}),
        bindBuffer: noop,
        bufferData: noop,
        deleteBuffer: noop,
        enableVertexAttribArray: noop,
        vertexAttribPointer: noop,
        createTexture: () => ({}),
        activeTexture: noop,
        bindTexture: noop,
        texParameteri: noop,
        texImage2D: noop,
        deleteTexture: noop,
        createFramebuffer: () => ({}),
        bindFramebuffer: noop,
        framebufferTexture2D: noop,
        checkFramebufferStatus: () => 0x8cd5,
        deleteFramebuffer: noop,
        viewport: noop,
        clearColor: noop,
        clear: noop,
        enable: noop,
        blendFunc: noop,
        blendFuncSeparate: noop,
        pixelStorei: noop,
        uniform1i: noop,
        uniform1f: noop,
        uniform2f: noop,
        uniform4f: noop,
        uniform4fv: noop,
        uniformMatrix3fv: noop,
        drawArrays: noop,
        isContextLost: () => lost,
        getExtension: () => ({ loseContext: () => { lost = true; } }),
      };
    };

    const surf: StrictContextSurface = {
      width,
      height,
      get surfaceId() {
        return surfaceId;
      },
      get lockedContextType() {
        return locked;
      },
      get mixedContextViolations() {
        return violations;
      },
      drawCalls,
      getContext(contextId: string) {
        if (contextId === 'webgl2') {
          if (locked === '2d') {
            violations += 1;
            return null;
          }
          if (options?.allowWebgl2 === false) {
            return null;
          }
          locked = 'webgl2';
          return createWebgl2Stub();
        }
        if (contextId === '2d') {
          if (locked === 'webgl2') {
            violations += 1;
            return null;
          }
          locked = '2d';
          return ctx2d;
        }
        return null;
      },
      addEventListener(type, listener) {
        let s = listeners.get(type);
        if (!s) {
          s = new Set();
          listeners.set(type, s);
        }
        s.add(listener);
      },
      removeEventListener(type, listener) {
        listeners.get(type)?.delete(listener);
      },
      emitContextEvent(type) {
        const ev = { preventDefault() {} };
        for (const fn of [...(listeners.get(type) ?? [])]) {
          fn(ev);
        }
      },
    };
    createdSurfaces.push(surf);
    return surf;
  };

  return { factory, createdSurfaces };
}

function createHarness(opts?: {
  allowWebgl2?: boolean;
  displayAudio?: boolean;
  mountDelayMs?: number;
}) {
  let nowMs = 1000;
  let rafSeq = 0;
  const scheduledCallbacks = new Map<number, (ts: number) => void>();

  const scheduler: FrameSchedulerAdapter = {
    requestFrame(cb) {
      rafSeq += 1;
      scheduledCallbacks.set(rafSeq, cb);
      return rafSeq;
    },
    cancelFrame(id) {
      scheduledCallbacks.delete(id);
    },
  };

  let getUserMediaCalls = 0;
  let getDisplayMediaCalls = 0;
  const createdTracks: IntegrationMockTrack[] = [];

  const devices: MediaDeviceDescriptor[] = [
    { deviceId: 'facetime-hd', kind: 'videoinput', label: 'FaceTime HD Camera' },
    { deviceId: 'macbook-mic', kind: 'audioinput', label: 'MacBook Pro Mic' },
  ];

  const mediaDevices: MediaDevicesAdapter = {
    async enumerateDevices() {
      return devices;
    },
    async getUserMedia(constraints) {
      getUserMediaCalls += 1;
      const tracks: IntegrationMockTrack[] = [];
      if (constraints?.video) {
        const t = new IntegrationMockTrack({
          id: `cam-track-${getUserMediaCalls}`,
          kind: 'video',
          label: 'FaceTime HD Camera',
          settings: { width: 1920, height: 1080, frameRate: 30, deviceId: 'facetime-hd' },
        });
        createdTracks.push(t);
        tracks.push(t);
      }
      if (constraints?.audio) {
        const t = new IntegrationMockTrack({
          id: `mic-track-${getUserMediaCalls}`,
          kind: 'audio',
          label: 'MacBook Pro Mic',
          settings: { deviceId: 'macbook-mic', sampleRate: 48000, channelCount: 1 },
        });
        createdTracks.push(t);
        tracks.push(t);
      }
      return new IntegrationMockStream(`gum-stream-${getUserMediaCalls}`, tracks);
    },
    async getDisplayMedia(constraints) {
      getDisplayMediaCalls += 1;
      const tracks: IntegrationMockTrack[] = [];
      const v = new IntegrationMockTrack({
        id: `win-video-${getDisplayMediaCalls}`,
        kind: 'video',
        label: 'window:Code - OpticaStudio',
        settings: { width: 1440, height: 900, frameRate: 30, displaySurface: 'window' },
      });
      createdTracks.push(v);
      tracks.push(v);
      if (opts?.displayAudio || constraints?.audio) {
        const a = new IntegrationMockTrack({
          id: `win-audio-${getDisplayMediaCalls}`,
          kind: 'audio',
          label: 'System Audio',
          settings: { sampleRate: 48000, channelCount: 2 },
        });
        createdTracks.push(a);
        tracks.push(a);
      }
      return new IntegrationMockStream(`display-stream-${getDisplayMediaCalls}`, tracks);
    },
  };

  const mediaElements: MediaElementFactoryAdapter = {
    createVideoElement() {
      const listeners = new Map<string, Set<(ev?: unknown) => void>>();
      const v: MediaVideoElementLike = {
        srcObject: null,
        src: '',
        muted: false,
        loop: false,
        playbackRate: 1,
        videoWidth: 1920,
        videoHeight: 1080,
        readyState: 4,
        paused: false,
        async play() {
          this.paused = false;
        },
        pause() {
          this.paused = true;
        },
        load() {
          for (const fn of [...(listeners.get('loadedmetadata') ?? [])]) fn();
        },
        addEventListener(type, listener) {
          let s = listeners.get(type);
          if (!s) {
            s = new Set();
            listeners.set(type, s);
          }
          s.add(listener);
        },
        removeEventListener(type, listener) {
          listeners.get(type)?.delete(listener);
        },
      };
      return v;
    },
    createAudioElement() {
      const listeners = new Map<string, Set<(ev?: unknown) => void>>();
      return {
        srcObject: null,
        src: '',
        muted: false,
        loop: false,
        readyState: 4,
        paused: false,
        async play() {
          this.paused = false;
        },
        pause() {
          this.paused = true;
        },
        load() {
          for (const fn of [...(listeners.get('loadedmetadata') ?? [])]) fn();
        },
        addEventListener(type, listener) {
          let s = listeners.get(type);
          if (!s) {
            s = new Set();
            listeners.set(type, s);
          }
          s.add(listener);
        },
        removeEventListener(type, listener) {
          listeners.get(type)?.delete(listener);
        },
      };
    },
    createImageElement() {
      return {
        src: '',
        complete: true,
        naturalWidth: 1920,
        naturalHeight: 1080,
        onload: null,
        onerror: null,
      };
    },
  };

  const memoryAdapter = createInMemoryStudioStorageAdapter();
  const storageAdapter: StudioStorageAdapter = opts?.mountDelayMs
    ? {
        async getItem(projectId: string) {
          await new Promise((r) => setTimeout(r, opts.mountDelayMs));
          return memoryAdapter.getItem(projectId);
        },
        async putItem(projectId: string, json: string) {
          return memoryAdapter.putItem(projectId, json);
        },
        async deleteItem(projectId: string) {
          return memoryAdapter.deleteItem(projectId);
        },
        async listIds() {
          return memoryAdapter.listIds();
        },
        getActiveProjectId() {
          return memoryAdapter.getActiveProjectId();
        },
        setActiveProjectId(projectId: string) {
          memoryAdapter.setActiveProjectId(projectId);
        },
      }
    : memoryAdapter;

  const surfaces = createStrictSurfaceFactory({ allowWebgl2: opts?.allowWebgl2 ?? false });

  return {
    scheduler,
    mediaDevices,
    mediaElements,
    storageAdapter,
    memoryAdapter,
    surfaces,
    now: () => nowMs,
    advanceTime: (ms: number) => {
      nowMs += ms;
    },
    tickNextFrame: (stepMs = 34) => {
      nowMs += stepMs;
      const entries = [...scheduledCallbacks.entries()];
      scheduledCallbacks.clear();
      for (const [, fn] of entries) {
        fn(nowMs);
      }
    },
    getScheduledCount: () => scheduledCallbacks.size,
    getUserMediaCalls: () => getUserMediaCalls,
    getDisplayMediaCalls: () => getDisplayMediaCalls,
    getLiveCreatedTracks: () => createdTracks.filter((t) => t.readyState === 'live'),
    createdTracks,
  };
}

// ============================================================================
// SUITE DE INTEGRACIÓN CP-P01-D (18+ PRUEBAS DETERMINISTAS)
// ============================================================================

test('CP-P01-D [1-2]: Inicialización única y ciclo mount/dispose limpio sin fugas', async () => {
  const h = createHarness();
  const coord = new StudioCoordinator({
    initialMode: 'legacy',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
  });

  await coord.mount();
  assert.equal(coord.isMounted(), true);
  assert.equal(coord.getEngineMode(), 'legacy');
  // En modo Legacy al inicio no abre hardware ni compositor desde StudioCoordinator
  assert.equal(h.getUserMediaCalls(), 0);
  assert.equal(h.getDisplayMediaCalls(), 0);
  assert.equal(h.getScheduledCount(), 0);

  coord.dispose();
  assert.equal(coord.isDisposed(), true);
  assert.equal(h.getScheduledCount(), 0);
});

test('CP-P01-D [3]: Simulación React StrictMode (mount -> cleanup -> remount) ignora montaje obsoleto y conserva una sola instancia viva', async () => {
  const h = createHarness({ mountDelayMs: 15 });

  // Primer montaje (StrictMode mount #1)
  const coord1 = new StudioCoordinator({
    initialMode: 'studio',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
  });
  const mount1Promise = coord1.mount();
  // StrictMode desmonta inmediatamente antes de que resuelva la lectura async
  coord1.dispose();

  // Segundo montaje (StrictMode remount #2)
  const coord2 = new StudioCoordinator({
    initialMode: 'studio',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
  });
  await Promise.all([mount1Promise, coord2.mount()]);

  assert.equal(coord1.isDisposed(), true);
  assert.equal(coord2.isDisposed(), false);
  // Solo coord2 debe haber abierto hardware (1 camera + 1 mic = 2 llamadas getUserMedia)
  assert.equal(h.getUserMediaCalls(), 2);
  assert.equal(h.getDisplayMediaCalls(), 0);
  assert.equal(h.getScheduledCount(), 1);

  coord2.dispose();
  assert.equal(h.getLiveCreatedTracks().length, 0);
  assert.equal(h.getScheduledCount(), 0);
});

test('CP-P01-D [4]: Restauración de proyecto persistido en studioStorage al montar', async () => {
  const h = createHarness();
  const starter = createStarterStudioProject('4k', '9:16');
  const customProject = {
    ...starter,
    name: 'Proyecto Restaurado Tutorial IA',
  };
  await saveStudioProject(customProject, h.storageAdapter);

  const coord = new StudioCoordinator({
    initialMode: 'legacy',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
  });

  await coord.mount();
  assert.equal(coord.getLastLoadSource(), 'stored');
  assert.equal(coord.getProject().name, 'Proyecto Restaurado Tutorial IA');
  assert.equal(coord.getProgramSurface().width, 2160);
  assert.equal(coord.getProgramSurface().height, 3840);
  coord.dispose();
});

test('CP-P01-D [5-6]: Nunca solicita getDisplayMedia al restaurar o cambiar escenas; solo tras clic explícito', async () => {
  const h = createHarness({ displayAudio: true });
  const coord = new StudioCoordinator({
    initialMode: 'studio',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
  });

  await coord.mount();
  assert.equal(h.getDisplayMediaCalls(), 0);

  // Cambiar a escena "Solo Pantalla" sin clic de autorización tampoco abre el picker
  await coord.activatePresetScene('fullscreen-demo', { type: 'cut', durationMs: 0 });
  assert.equal(h.getDisplayMediaCalls(), 0);

  // Autorización explícita por acción del usuario
  const entry = await coord.authorizeDisplaySource();
  assert.ok(entry);
  assert.equal(entry.state.status, 'live');
  assert.equal(h.getDisplayMediaCalls(), 1);

  coord.dispose();
});

test('CP-P01-D [7]: Cambio Legacy -> Studio adopta cámara y micrófono existentes sin duplicar llamadas getUserMedia', async () => {
  const h = createHarness();
  const coord = new StudioCoordinator({
    initialMode: 'legacy',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
  });
  await coord.mount();

  const legacyCamTrack = new IntegrationMockTrack({
    id: 'legacy-cam',
    kind: 'video',
    label: 'FaceTime HD',
    settings: { width: 1920, height: 1080, frameRate: 30, deviceId: 'facetime-hd' },
  });
  const legacyMicTrack = new IntegrationMockTrack({
    id: 'legacy-mic',
    kind: 'audio',
    label: 'MacBook Mic',
    settings: { deviceId: 'macbook-mic', sampleRate: 48000 },
  });
  const legacyScreenTrack = new IntegrationMockTrack({
    id: 'legacy-win',
    kind: 'video',
    label: 'Xcode',
    settings: { width: 1440, height: 900, frameRate: 30 },
  });

  const handoff: LegacyStreamHandoff = {
    cameraStream: new IntegrationMockStream('legacy-combined', [legacyCamTrack, legacyMicTrack]),
    screenStream: new IntegrationMockStream('legacy-screen', [legacyScreenTrack]),
  };

  const switchRes = await coord.activateStudioMode(handoff);
  assert.equal(switchRes.ok, true);
  assert.equal(h.getUserMediaCalls(), 0);
  assert.equal(h.getDisplayMediaCalls(), 0);

  const diag = coord.getDiagnosticsSnapshot();
  assert.equal(diag.connectedSourcesCount, 4); // Fondo gradient + Ventana + Cámara + Micrófono
  assert.equal(legacyCamTrack.stopCount, 0);
  assert.equal(legacyMicTrack.stopCount, 0);

  coord.dispose();
});

test('CP-P01-D [8]: Compartición de cámara y micrófono al cambiar entre escenas sin detener ni reabrir tracks', async () => {
  const h = createHarness();
  const coord = new StudioCoordinator({
    initialMode: 'studio',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
  });
  await coord.mount();

  const initialGumCalls = h.getUserMediaCalls();
  assert.equal(initialGumCalls, 2); // 1 video + 1 audio

  const camTrackBefore = coord.getDiagnosticsSnapshot().sources.find((s) => s.kind === 'camera');
  assert.equal(camTrackBefore?.status, 'live');

  await coord.activatePresetScene('camera-primary', { type: 'cut', durationMs: 0 });
  await coord.activatePresetScene('ai-tutorial-pip', { type: 'cut', durationMs: 0 });
  await coord.activatePresetScene('camera-primary', { type: 'cut', durationMs: 0 });
  await coord.activatePresetScene('ai-tutorial-pip', { type: 'cut', durationMs: 0 });

  // Entre escenas que comparten cámara y micrófono no se reabre hardware ni se detienen tracks
  assert.equal(h.getUserMediaCalls(), initialGumCalls);
  assert.equal(
    h.createdTracks.every((t) => t.stopCount === 0 && t.readyState === 'live'),
    true
  );

  // Al pasar a Solo Pantalla (sin capa de cámara), el micrófono compartido sigue vivo sin detenerse
  const micTrack = h.createdTracks.find((t) => t.kind === 'audio')!;
  await coord.activatePresetScene('fullscreen-demo', { type: 'cut', durationMs: 0 });
  assert.equal(micTrack.stopCount, 0);
  assert.equal(micTrack.readyState, 'live');
  assert.equal(h.getUserMediaCalls(), initialGumCalls);

  coord.dispose();
});

test('CP-P01-D [9]: Fuentes salientes exclusivas permanecen activas durante Fade y se liberan tras finalizar la transición', async () => {
  const h = createHarness();
  const coord = new StudioCoordinator({
    initialMode: 'studio',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
  });
  await coord.mount();

  // Añadimos una escena con un video-file local exclusivo como origen
  let proj = coord.getProject();
  const vidAdded = addSource(proj, {
    kind: 'video-file',
    name: 'Clip Intro B-Roll',
    assetRef: 'blob:intro-clip',
    loop: true,
    playbackRate: 1,
    mutedByDefault: true,
  });
  proj = vidAdded.project;
  const introSceneRes = createScene(proj, {
    name: 'Intro B-Roll',
    transition: { type: 'fade', durationMs: 250 },
  });
  proj = introSceneRes.project;
  proj = addLayerToScene(proj, introSceneRes.scene.id, vidAdded.source.id).project;
  await saveStudioProject(proj, h.storageAdapter);

  // Re-montamos para cargar proyecto con escena B-Roll
  coord.dispose();
  const h2 = createHarness();
  await saveStudioProject(proj, h2.storageAdapter);
  const coord2 = new StudioCoordinator({
    initialMode: 'studio',
    storageAdapter: h2.storageAdapter,
    sourceManagerOptions: { mediaDevices: h2.mediaDevices, mediaElements: h2.mediaElements },
    surfaceFactory: h2.surfaces.factory,
    scheduler: h2.scheduler,
    now: h2.now,
  });
  await coord2.mount();

  await coord2.switchScene(introSceneRes.scene.id, { type: 'cut', durationMs: 0 });
  const bRollEntry = coord2.sourceManager.getEntry(vidAdded.source.id);
  assert.equal(bRollEntry?.state.status, 'live');
  assert.equal(bRollEntry?.details.consumerIds.includes(COORDINATOR_CONSUMER_ID), true);

  // Transición Fade hacia Cámara Principal: durante Fade, B-Roll sigue vivo
  const camScene = coord2.getProject().scenes.find((s) => s.presetId === 'camera-primary')!;
  await coord2.switchScene(camScene.id, { type: 'fade', durationMs: 300 });
  assert.ok(coord2.getCompositor()?.getActiveTransition());
  assert.equal(
    coord2.sourceManager.getEntry(vidAdded.source.id)?.details.consumerIds.includes(COORDINATOR_CONSUMER_ID),
    true
  );

  // Avanzamos tiempo hasta completar el Fade (> 300ms)
  h2.tickNextFrame(350);
  assert.equal(coord2.getCompositor()?.getActiveTransition(), null);
  assert.equal(
    coord2.sourceManager.getEntry(vidAdded.source.id)?.details.consumerIds.includes(COORDINATOR_CONSUMER_ID),
    false
  );

  coord2.dispose();
});

test('CP-P01-D [10]: ProgramCanvas mantiene referencia fija en escenas/resoluciones y reemplaza superficie al cambiar backend sin mezclar contextos', async () => {
  const h = createHarness({ allowWebgl2: true });
  const coord = new StudioCoordinator({
    initialMode: 'studio',
    preferredBackend: 'webgl2',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
  });
  await coord.mount();

  const surface1 = coord.getProgramSurface() as StrictContextSurface;
  assert.equal(coord.getCompositor()?.getBackendKind(), 'webgl2');
  assert.equal(surface1.lockedContextType, 'webgl2');

  // Cambio de resolución y escena: misma referencia de superficie
  coord.setResolutionProfile('720p', '16:9');
  await coord.activatePresetScene('camera-primary', { type: 'cut', durationMs: 0 });
  assert.equal(coord.getProgramSurface(), surface1);
  assert.equal(surface1.width, 1280);
  assert.equal(surface1.height, 720);

  // Cambio a canvas2d: debe crear superficie nueva sin violación de contexto mixto
  const switchBackend = coord.setBackendPreference('canvas2d');
  assert.equal(switchBackend.ok, true);
  const surface2 = coord.getProgramSurface() as StrictContextSurface;
  assert.notEqual(surface2, surface1);
  assert.equal(surface2.lockedContextType, '2d');
  assert.equal(surface1.mixedContextViolations, 0);
  assert.equal(surface2.mixedContextViolations, 0);

  coord.dispose();
});

test('CP-P01-D [11]: Devolución de pistas vivas Studio -> Legacy sin detener cámara ni micrófono', async () => {
  const h = createHarness();
  const coord = new StudioCoordinator({
    initialMode: 'studio',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
  });
  await coord.mount();

  const back = coord.deactivateStudioMode();
  assert.equal(back.ok, true);
  assert.equal(back.mode, 'legacy');
  assert.equal(back.handedBackCameraTracks?.length, 1);
  assert.equal(back.handedBackMicTracks?.length, 1);
  assert.equal(back.handedBackCameraTracks?.[0].readyState, 'live');
  assert.equal(back.handedBackMicTracks?.[0].readyState, 'live');
  assert.equal(h.createdTracks.every((t) => t.stopCount === 0), true);

  coord.dispose();
});

test('CP-P01-D [12]: Pérdida de contexto WebGL2 durante grabación dispara parada de seguridad y recuperación posterior', async () => {
  const h = createHarness({ allowWebgl2: true });
  const safetyReasons: string[] = [];

  const coord = new StudioCoordinator({
    initialMode: 'studio',
    preferredBackend: 'webgl2',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
    onRecordingSafetyStop: (reason) => {
      safetyReasons.push(reason);
      coord.setRecordingLocked(false);
    },
  });
  await coord.mount();

  coord.setRecordingLocked(true);
  const surface = coord.getProgramSurface() as StrictContextSurface;
  surface.emitContextEvent('webglcontextlost');

  assert.equal(safetyReasons.length, 1);
  assert.match(safetyReasons[0], /WebGL2/i);
  assert.equal(coord.isRecordingLocked(), false);

  const recRes = coord.recoverLostContextWithCanvas2dFallback();
  assert.equal(recRes.ok, true);
  assert.equal(coord.getCompositor()?.getBackendKind(), 'canvas2d');

  coord.dispose();
});

test('CP-P01-D [13]: Desconexión de fuente en vivo se refleja en diagnóstico sin lanzar errores ni contaminar salida', async () => {
  const h = createHarness();
  const coord = new StudioCoordinator({
    initialMode: 'studio',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
  });
  await coord.mount();

  await coord.authorizeDisplaySource();
  const winTrack = h.createdTracks.find((t) => t.id.startsWith('win-video-'))!;
  assert.ok(winTrack);

  winTrack.emit('ended');
  h.tickNextFrame(34);

  const diag = coord.getDiagnosticsSnapshot();
  const winDiag = diag.sources.find((s) => s.kind === 'window');
  assert.equal(winDiag?.status, 'disconnected');
  assert.equal(diag.disconnectedOrErrorSourcesCount, 1);
  // El compositor sigue renderizando con normalidad
  assert.ok(diag.renderedFrames >= 1);

  coord.dispose();
});

test('CP-P01-D [14-15]: Bloqueo estricto durante grabación activa (motor, backend y resolución)', async () => {
  const h = createHarness({ allowWebgl2: true });
  const coord = new StudioCoordinator({
    initialMode: 'studio',
    preferredBackend: 'webgl2',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
  });
  await coord.mount();

  coord.setRecordingLocked(true);
  const modeAttempt = coord.deactivateStudioMode();
  const backendAttempt = coord.setBackendPreference('canvas2d');
  const resAttempt = coord.setResolutionProfile('720p', '16:9');

  assert.equal(modeAttempt.ok, false);
  assert.equal(backendAttempt.ok, false);
  assert.equal(resAttempt.ok, false);
  assert.equal(coord.getEngineMode(), 'studio');
  assert.equal(coord.getProgramSurface().width, 1920);

  // Al desbloquear grabación, todo vuelve a permitirse
  coord.setRecordingLocked(false);
  assert.equal(coord.setResolutionProfile('720p', '16:9').ok, true);
  assert.equal(coord.getProgramSurface().width, 1280);
  assert.equal(coord.deactivateStudioMode().ok, true);

  coord.dispose();
});

test('CP-P01-D [16]: Aislamiento total respecto a optica_studio_db de la Galería y matriz honesta sin promesas falsas', () => {
  assert.equal(STUDIO_PROJECTS_DB_NAME, 'optica_studio_projects_db');
  assert.notEqual(STUDIO_PROJECTS_DB_NAME, 'optica_studio_db');
  assert.equal(STUDIO_PROJECTS_STORE_NAME, 'projects');

  const dualCamEntry = STUDIO_ENGINE_COMPATIBILITY_MATRIX.find((x) => x.id === 'secondary-camera');
  const recEntry = STUDIO_ENGINE_COMPATIBILITY_MATRIX.find((x) => x.id === 'video-recording');
  assert.equal(dualCamEntry?.studioSupport, 'partial');
  assert.equal(recEntry?.studioSupport, 'experimental');
});

test('CP-P01-D [17]: Coherencia exacta entre perfil seleccionado (4K, 9:16, 1:1) y dimensiones de ProgramCanvas', async () => {
  const h = createHarness();
  const coord = new StudioCoordinator({
    initialMode: 'studio',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
  });
  await coord.mount();

  coord.setResolutionProfile('4k', '16:9');
  assert.equal(coord.getProgramSurface().width, 3840);
  assert.equal(coord.getProgramSurface().height, 2160);

  coord.setResolutionProfile('1080p', '9:16');
  assert.equal(coord.getProgramSurface().width, 1080);
  assert.equal(coord.getProgramSurface().height, 1920);

  coord.setResolutionProfile('1080p', '1:1');
  assert.equal(coord.getProgramSurface().width, 1080);
  assert.equal(coord.getProgramSurface().height, 1080);

  const snap = coord.getDiagnosticsSnapshot();
  assert.equal(snap.outputWidth, 1080);
  assert.equal(snap.outputHeight, 1080);

  coord.dispose();
});

test('CP-P01-D [18]: Puente setProcessedCameraSurface procesa solo capa de cámara y nunca altera la capa de ventana', async () => {
  const h = createHarness();
  const coord = new StudioCoordinator({
    initialMode: 'studio',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
  });
  await coord.mount();
  await coord.authorizeDisplaySource();

  const processedCamStub = { width: 640, height: 360 };
  coord.setProcessedCameraSurface({
    surface: processedCamStub,
    width: 640,
    height: 360,
    alphaMode: 'straight',
    frameVersion: 42,
  });

  h.tickNextFrame(34);
  const comp = coord.getCompositor()!;
  const plan = comp.buildSceneRenderPlan(coord.getActiveScene()!);
  const camCmd = plan.layers.find((l) => l.sourceKind === 'camera')!;
  const winCmd = plan.layers.find((l) => l.sourceKind === 'window')!;

  assert.equal(camCmd.surface, processedCamStub);
  assert.notEqual(winCmd.surface, processedCamStub);

  // Limpiar puente vuelve a usar directamente la fuente de cámara sin copia intermedia
  coord.setProcessedCameraSurface(null);
  h.tickNextFrame(34);
  const planAfter = comp.buildSceneRenderPlan(coord.getActiveScene()!);
  const camCmdAfter = planAfter.layers.find((l) => l.sourceKind === 'camera')!;
  assert.notEqual(camCmdAfter.surface, processedCamStub);

  coord.dispose();
  assert.equal(h.getLiveCreatedTracks().length, 0);
  assert.equal(h.getScheduledCount(), 0);
});


test('CP-P01-E4: sharing from a camera-only scene selects a scene containing the authorized display', async () => {
  const h = createHarness();
  const coord = new StudioCoordinator({
    initialMode: 'studio', storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory, scheduler: h.scheduler, now: h.now,
  });
  await coord.mount();
  await coord.activatePresetScene('camera-primary', { type: 'cut', durationMs: 0 });
  assert.equal(h.getDisplayMediaCalls(), 0);
  const entry = await coord.authorizeDisplaySource();
  assert.equal(entry?.state.status, 'live');
  assert.equal(h.getDisplayMediaCalls(), 1);
  assert.ok(coord.getActiveScene()?.layers.some(layer => layer.visible && layer.sourceId === entry?.source.id));
  coord.dispose();
});
