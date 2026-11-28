import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COORDINATOR_CONSUMER_ID,
  createStarterStudioProject,
  StudioCoordinator,
  type LegacyStreamHandoff,
} from '../src/engine/studioCoordinator';
import {
  cloneCompositionSnapshot,
  CompositionHistory,
} from '../src/engine/compositionHistory';
import { STUDIO_ENGINE_COMPATIBILITY_MATRIX } from '../src/engine/engineCompatibility';
import { addLayerToScene, addSource, createScene } from '../src/engine/sceneEngine';
import { loadStudioAssetBlob } from '../src/utils/studioAssetStore';
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

test('CP-P02-A [1]: Persistencia por escena de capa de cámara sin reiniciar fuentes ni alterar ProgramCanvas', async () => {
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

  const gumCallsBefore = h.getUserMediaCalls();
  const gdmCallsBefore = h.getDisplayMediaCalls();
  const surfaceBefore = coord.getProgramSurface();
  const widthBefore = surfaceBefore.width;
  const heightBefore = surfaceBefore.height;

  const pipScene = coord.getProject().scenes.find((s) => s.presetId === 'ai-tutorial-pip')!;
  const camScene = coord.getProject().scenes.find((s) => s.presetId === 'camera-primary')!;
  const camSrcId = coord.getProject().sources.find((s) => s.kind === 'camera')!.id;
  const pipCamLayer = pipScene.layers.find((l) => l.sourceId === camSrcId)!;
  const camPrimaryLayer = camScene.layers.find((l) => l.sourceId === camSrcId)!;

  // Editar capa de cámara en escena PiP
  const updPip = coord.updateSceneLayerTransform(pipScene.id, pipCamLayer.id, {
    x: 0.04,
    y: 0.05,
    width: 0.3,
    height: 0.3,
  });
  assert.equal(updPip.ok, true);
  assert.equal(updPip.layer?.transform.x, 0.04);
  assert.equal(updPip.layer?.transform.width, 0.3);

  // Cambiar a Cámara Principal y comprobar que conserva su propio encuadre independiente
  await coord.switchScene(camScene.id, { type: 'cut', durationMs: 0 });
  const camLayerNow = coord
    .getProject()
    .scenes.find((s) => s.id === camScene.id)!
    .layers.find((l) => l.id === camPrimaryLayer.id)!;
  assert.equal(camLayerNow.transform.width, 1);
  assert.equal(camLayerNow.transform.height, 1);

  // Volver a PiP y vaciar persistencia
  await coord.switchScene(pipScene.id, { type: 'cut', durationMs: 0 });
  await coord.flushPersistence();

  // Nunca reinició cámara ni pantalla ni alteró ProgramCanvas
  assert.equal(h.getUserMediaCalls(), gumCallsBefore);
  assert.equal(h.getDisplayMediaCalls(), gdmCallsBefore);
  assert.equal(h.createdTracks.every((t) => t.stopCount === 0), true);
  assert.equal(coord.getProgramSurface(), surfaceBefore);
  assert.equal(coord.getProgramSurface().width, widthBefore);
  assert.equal(coord.getProgramSurface().height, heightBefore);

  coord.dispose();

  // Remontar nuevo coordinador sobre el mismo storageAdapter y verificar persistencia independiente por escena
  const h2 = createHarness();
  const coord2 = new StudioCoordinator({
    initialMode: 'studio',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h2.mediaDevices, mediaElements: h2.mediaElements },
    surfaceFactory: h2.surfaces.factory,
    scheduler: h2.scheduler,
    now: h2.now,
  });
  await coord2.mount();
  assert.equal(coord2.getLastLoadSource(), 'stored');
  const restoredPip = coord2.getProject().scenes.find((s) => s.presetId === 'ai-tutorial-pip')!;
  const restoredCam = coord2.getProject().scenes.find((s) => s.presetId === 'camera-primary')!;
  assert.equal(
    restoredPip.layers.find((l) => l.sourceId === camSrcId)?.transform.width,
    0.3
  );
  assert.equal(
    restoredCam.layers.find((l) => l.sourceId === camSrcId)?.transform.width,
    1
  );
  coord2.dispose();
});

test('CP-P02-A [2] / CP-P02-B: Sin límite del 50% sobre pantalla compartida y respeto de bloqueo de capa', async () => {
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

  const pipScene = coord.getProject().scenes.find((s) => s.presetId === 'ai-tutorial-pip')!;
  const camSrcId = coord.getProject().sources.find((s) => s.kind === 'camera')!.id;
  const pipCamLayer = pipScene.layers.find((l) => l.sourceId === camSrcId)!;

  // Agrandar cámara hasta el 90% en escena con ventana visible (ya sin límite del 50%)
  const oversized = coord.updateSceneLayerTransform(
    pipScene.id,
    pipCamLayer.id,
    { width: 0.9, height: 0.9 },
    { preserveAspectK: 1 }
  );
  assert.equal(oversized.ok, true);
  assert.equal(oversized.constraintApplied, false);
  assert.ok(Math.abs((oversized.layer?.transform.width ?? 0) - 0.9) < 1e-4);
  assert.ok(Math.abs((oversized.layer?.transform.height ?? 0) - 0.9) < 1e-4);

  // Bloquear capa e intentar moverla o cambiar estilo
  assert.equal(coord.setSceneLayerLocked(pipScene.id, pipCamLayer.id, true), true);
  const blockedEdit = coord.updateSceneLayerTransform(pipScene.id, pipCamLayer.id, {
    x: 0.1,
    y: 0.1,
  });
  assert.equal(blockedEdit.ok, false);
  assert.match(blockedEdit.reason ?? '', /bloqueada/i);

  const blockedStyle = coord.updateSceneLayerStyle(pipScene.id, pipCamLayer.id, {
    maskShape: 'circle',
  });
  assert.equal(blockedStyle.ok, false);

  // Desbloquear y confirmar persistencia de estado unlocked
  assert.equal(coord.setSceneLayerLocked(pipScene.id, pipCamLayer.id, false), true);
  const unlockedEdit = coord.updateSceneLayerTransform(pipScene.id, pipCamLayer.id, {
    x: 0.1,
    y: 0.1,
  });
  assert.equal(unlockedEdit.ok, true);
  assert.ok(Math.abs((unlockedEdit.layer?.transform.x ?? 0) - 0.1) < 1e-4);

  coord.dispose();
});

test('CP-P02-B: Edición en vivo de estilos, formas, difuminado y composición adaptable sin reiniciar pistas ni ProgramCanvas', async () => {
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

  const gumBefore = h.getUserMediaCalls();
  const gdmBefore = h.getDisplayMediaCalls();
  const surfaceBefore = coord.getProgramSurface();

  const pipScene = coord.getProject().scenes.find((s) => s.presetId === 'ai-tutorial-pip')!;
  const camScene = coord.getProject().scenes.find((s) => s.presetId === 'camera-primary')!;
  const camSrcId = coord.getProject().sources.find((s) => s.kind === 'camera')!.id;
  const pipCamLayer = pipScene.layers.find((l) => l.sourceId === camSrcId)!;
  const camPrimaryLayer = camScene.layers.find((l) => l.sourceId === camSrcId)!;

  // 1. Cambiar forma, difuminado, sombra, opacidad y borde desactivado en vivo sobre la escena PiP
  const styleRes = coord.updateSceneLayerStyle(pipScene.id, pipCamLayer.id, {
    maskShape: 'squircle',
    borderRadiusPx: 36,
    borderEnabled: false,
    borderWidthPx: 8,
    borderColor: '#0A84FF',
    shadowBlurPx: 32,
    shadowOpacity: 0.55,
    shadowColor: '#0F172A',
    featherPx: 26,
    opacity: 0.88,
  });
  assert.equal(styleRes.ok, true);
  assert.equal(styleRes.layer?.style.maskShape, 'squircle');
  assert.equal(styleRes.layer?.style.borderEnabled, false);
  assert.equal(styleRes.layer?.style.featherPx, 26);

  // 2. Actualizar encuadre interno y proporción independiente + composición adaptable split-horizontal
  const aspectRes = coord.updateSceneLayerTransform(pipScene.id, pipCamLayer.id, {
    aspectPreset: '1:1',
    contentZoom: 1.75,
    contentOffsetX: 0.35,
    contentOffsetY: -0.2,
    rotationDeg: 15,
  });
  assert.equal(aspectRes.ok, true);

  const layoutRes = coord.applyAdaptableLayout(pipScene.id, 'split-horizontal');
  assert.equal(layoutRes.ok, true);
  const splitCam = coord
    .getProject()
    .scenes.find((s) => s.id === pipScene.id)!
    .layers.find((l) => l.id === pipCamLayer.id)!;
  assert.equal(splitCam.transform.width, 0.5);
  assert.equal(splitCam.transform.height, 1);

  // La otra escena conserva intactos su estilo y proporción por escena
  const camPrimaryNow = coord
    .getProject()
    .scenes.find((s) => s.id === camScene.id)!
    .layers.find((l) => l.id === camPrimaryLayer.id)!;
  assert.equal(camPrimaryNow.style.maskShape, 'rect');
  assert.equal(camPrimaryNow.style.featherPx, 0);

  // Cero reinicios de pistas, cero stops y mismo ProgramCanvas
  assert.equal(h.getUserMediaCalls(), gumBefore);
  assert.equal(h.getDisplayMediaCalls(), gdmBefore);
  assert.equal(h.createdTracks.every((t) => t.stopCount === 0), true);
  assert.equal(coord.getProgramSurface(), surfaceBefore);

  await coord.flushPersistence();
  coord.dispose();

  // Remontar y verificar persistencia completa de estilos, difuminado y encuadre CP-P02-B
  const h2 = createHarness();
  const coord2 = new StudioCoordinator({
    initialMode: 'studio',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h2.mediaDevices, mediaElements: h2.mediaElements },
    surfaceFactory: h2.surfaces.factory,
    scheduler: h2.scheduler,
    now: h2.now,
  });
  await coord2.mount();
  const restoredPipCam = coord2
    .getProject()
    .scenes.find((s) => s.presetId === 'ai-tutorial-pip')!
    .layers.find((l) => l.sourceId === camSrcId)!;
  assert.equal(restoredPipCam.style.maskShape, 'squircle');
  assert.equal(restoredPipCam.style.borderEnabled, false);
  assert.equal(restoredPipCam.style.featherPx, 26);
  assert.equal(restoredPipCam.transform.aspectPreset, '1:1');
  assert.equal(restoredPipCam.transform.contentZoom, 1.75);
  assert.equal(restoredPipCam.transform.rotationDeg, 15);
  coord2.dispose();
});

test('CP-P02-C1: Editor universal de ventana/pantalla/imagen (crop, zoom, proporción, estilo, bloqueo, persistencia por escena y cero reinicios)', async () => {
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

  const gumBefore = h.getUserMediaCalls();
  const gdmBefore = h.getDisplayMediaCalls();
  const surfaceBefore = coord.getProgramSurface();

  const pipScene = coord.getProject().scenes.find((s) => s.presetId === 'ai-tutorial-pip')!;
  const screenScene = coord.getProject().scenes.find((s) => s.presetId === 'fullscreen-demo')!;
  const displaySrcId = coord.getProject().sources.find((s) => s.kind === 'window' || s.kind === 'screen')!.id;
  const micSrcId = coord.getProject().sources.find((s) => s.kind === 'microphone')!.id;
  const pipWindowLayer = pipScene.layers.find((l) => l.sourceId === displaySrcId)!;
  const fullWindowLayer = screenScene.layers.find((l) => l.sourceId === displaySrcId)!;

  // 1. Editar capa de ventana compartida (posición, tamaño libre, rotación, inversión, zoom interno, proporción y recorte 4 bordes)
  const winTransformRes = coord.updateSceneLayerTransform(pipScene.id, pipWindowLayer.id, {
    x: 0.05,
    y: 0.06,
    width: 0.85,
    height: 0.78,
    rotationDeg: 90,
    flipH: true,
    fitMode: 'contain',
    aspectPreset: '16:9',
    contentZoom: 1.6,
    contentOffsetX: -0.25,
    contentOffsetY: 0.3,
    crop: { top: 0.08, right: 0.04, bottom: 0.06, left: 0.02 },
  });
  assert.equal(winTransformRes.ok, true);
  assert.equal(winTransformRes.layer?.transform.crop.top, 0.08);
  assert.equal(winTransformRes.layer?.transform.crop.right, 0.04);
  assert.equal(winTransformRes.layer?.transform.contentZoom, 1.6);
  assert.equal(winTransformRes.layer?.transform.rotationDeg, 90);
  assert.equal(winTransformRes.layer?.transform.flipH, true);

  // 2. Estilos completos sobre ventana compartida (squircle, borde opcional desactivado, sombra, difuminado y opacidad)
  const winStyleRes = coord.updateSceneLayerStyle(pipScene.id, pipWindowLayer.id, {
    maskShape: 'squircle',
    borderRadiusPx: 32,
    borderEnabled: false,
    borderWidthPx: 6,
    shadowBlurPx: 28,
    shadowOpacity: 0.45,
    featherPx: 16,
    opacity: 0.9,
  });
  assert.equal(winStyleRes.ok, true);
  assert.equal(winStyleRes.layer?.style.maskShape, 'squircle');
  assert.equal(winStyleRes.layer?.style.borderEnabled, false);
  assert.equal(winStyleRes.layer?.style.featherPx, 16);

  // 3. Composición adaptable dirigida explícitamente a la ventana seleccionada y después vuelta al 100%
  const cornerLayout = coord.applyAdaptableLayout(pipScene.id, 'corner-top-left', {
    selectedLayerId: pipWindowLayer.id,
  });
  assert.equal(cornerLayout.ok, true);
  const movedWin = coord
    .getProject()
    .scenes.find((s) => s.id === pipScene.id)!
    .layers.find((l) => l.id === pipWindowLayer.id)!;
  assert.ok(movedWin.transform.width < 0.6);

  const fullLayout = coord.applyAdaptableLayout(pipScene.id, 'camera-full', {
    selectedLayerId: pipWindowLayer.id,
  });
  assert.equal(fullLayout.ok, true);
  const fullWin = coord
    .getProject()
    .scenes.find((s) => s.id === pipScene.id)!
    .layers.find((l) => l.id === pipWindowLayer.id)!;
  assert.equal(fullWin.transform.width, 1);
  assert.equal(fullWin.transform.height, 1);

  // 4. Escena fullscreen-demo mantiene sus propias coordenadas independientes de la misma fuente window
  const fullSceneWinNow = coord
    .getProject()
    .scenes.find((s) => s.id === screenScene.id)!
    .layers.find((l) => l.id === fullWindowLayer.id)!;
  assert.equal(fullSceneWinNow.transform.crop.top, 0);
  assert.equal(fullSceneWinNow.style.maskShape, 'rect');

  // 5. Puente setProcessedCameraSurface nunca aplica filtros/IA a la ventana compartida
  const processedCamStub = { width: 640, height: 360 };
  coord.setProcessedCameraSurface({
    surface: processedCamStub,
    width: 640,
    height: 360,
    alphaMode: 'straight',
    frameVersion: 99,
  });
  h.tickNextFrame(34);
  const plan = coord.getCompositor()!.buildSceneRenderPlan(coord.getActiveScene()!);
  const winCmd = plan.layers.find((l) => l.sourceKind === 'window' || l.sourceKind === 'screen')!;
  assert.notEqual(winCmd.surface, processedCamStub);

  // 6. Cero reinicios de pistas, cero stops y mismo ProgramCanvas
  assert.equal(h.getUserMediaCalls(), gumBefore);
  assert.equal(h.getDisplayMediaCalls(), gdmBefore);
  assert.equal(h.createdTracks.every((t) => t.stopCount === 0), true);
  assert.equal(coord.getProgramSurface(), surfaceBefore);

  // 7. Bloqueo de ventana compartida e intento de transformación sobre fuente de audio
  assert.equal(coord.setSceneLayerLocked(pipScene.id, pipWindowLayer.id, true), true);
  assert.equal(
    coord.updateSceneLayerTransform(pipScene.id, pipWindowLayer.id, { x: 0.2 }).ok,
    false
  );
  assert.equal(coord.setSceneLayerLocked(pipScene.id, pipWindowLayer.id, false), true);

  let projWithAudioOops = addLayerToScene(coord.getProject(), pipScene.id, micSrcId).project;
  const audioOopsLayer = projWithAudioOops.scenes
    .find((s) => s.id === pipScene.id)!
    .layers.find((l) => l.sourceId === micSrcId)!;
  await saveStudioProject(projWithAudioOops, h.storageAdapter);
  const coordAudioCheck = new StudioCoordinator({
    initialMode: 'studio',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
  });
  await coordAudioCheck.mount();
  const audioReject = coordAudioCheck.updateSceneLayerTransform(pipScene.id, audioOopsLayer.id, {
    width: 0.5,
  });
  assert.equal(audioReject.ok, false);
  coordAudioCheck.dispose();

  // 8. Verificar persistencia completa de ventana editada tras remontar desde studioStorage
  await coord.flushPersistence();
  coord.dispose();

  const h2 = createHarness();
  const coord2 = new StudioCoordinator({
    initialMode: 'studio',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h2.mediaDevices, mediaElements: h2.mediaElements },
    surfaceFactory: h2.surfaces.factory,
    scheduler: h2.scheduler,
    now: h2.now,
  });
  await coord2.mount();
  const restoredWin = coord2
    .getProject()
    .scenes.find((s) => s.id === pipScene.id)!
    .layers.find((l) => l.id === pipWindowLayer.id)!;
  assert.equal(restoredWin.transform.crop.top, 0.08);
  assert.equal(restoredWin.transform.crop.right, 0.04);
  assert.equal(restoredWin.transform.contentZoom, 1.6);
  assert.equal(restoredWin.transform.rotationDeg, 90);
  assert.equal(restoredWin.style.maskShape, 'squircle');
  assert.equal(restoredWin.style.featherPx, 16);
  coord2.dispose();
});

test('CP-P02-C2 [1]: Reordenamiento de capas (drag/top/bottom/up/down) se refleja en ProgramCompositor sin reiniciar pistas ni ProgramCanvas', async () => {
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

  const gumBefore = h.getUserMediaCalls();
  const gdmBefore = h.getDisplayMediaCalls();
  const surfaceBefore = coord.getProgramSurface();

  const pipScene = coord.getProject().scenes.find((s) => s.presetId === 'ai-tutorial-pip')!;
  const camSrcId = coord.getProject().sources.find((s) => s.kind === 'camera')!.id;
  const winSrcId = coord.getProject().sources.find((s) => s.kind === 'window' || s.kind === 'screen')!.id;
  const camLayer = pipScene.layers.find((l) => l.sourceId === camSrcId)!;
  const winLayer = pipScene.layers.find((l) => l.sourceId === winSrcId)!;

  // Inicialmente la cámara está encima de la ventana
  let plan = coord.getCompositor()!.buildSceneRenderPlan(coord.getActiveScene()!);
  let camIdx = plan.layers.findIndex((l) => l.layerId === camLayer.id);
  let winIdx = plan.layers.findIndex((l) => l.layerId === winLayer.id);
  assert.ok(camIdx > winIdx);

  // Enviar cámara al fondo
  const moveBottom = coord.moveSceneLayerOrder(pipScene.id, camLayer.id, 'bottom');
  assert.equal(moveBottom.ok, true);
  plan = coord.getCompositor()!.buildSceneRenderPlan(coord.getActiveScene()!);
  camIdx = plan.layers.findIndex((l) => l.layerId === camLayer.id);
  winIdx = plan.layers.findIndex((l) => l.layerId === winLayer.id);
  assert.ok(camIdx < winIdx);

  // Subir un nivel con reorderSceneLayers y verificar orden exacto
  const ascIds = coord
    .getActiveScene()!
    .layers.slice()
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((l) => l.id);
  const swapped = [...ascIds];
  const camPos = swapped.indexOf(camLayer.id);
  swapped.splice(camPos, 1);
  swapped.push(camLayer.id);

  const reordered = coord.reorderSceneLayers(pipScene.id, swapped);
  assert.equal(reordered.ok, true);
  plan = coord.getCompositor()!.buildSceneRenderPlan(coord.getActiveScene()!);
  assert.equal(plan.layers[plan.layers.length - 1]?.layerId, camLayer.id);

  // Continuidad estricta
  assert.equal(h.getUserMediaCalls(), gumBefore);
  assert.equal(h.getDisplayMediaCalls(), gdmBefore);
  assert.equal(h.createdTracks.every((t) => t.stopCount === 0), true);
  assert.equal(coord.getProgramSurface(), surfaceBefore);

  coord.dispose();
});

test('CP-P02-C2 [2]: Ocultar/mostrar preserva transformaciones y pistas vivas y nunca dispara getDisplayMedia automático', async () => {
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

  const pipScene = coord.getProject().scenes.find((s) => s.presetId === 'ai-tutorial-pip')!;
  const camSrcId = coord.getProject().sources.find((s) => s.kind === 'camera')!.id;
  const winSrcId = coord.getProject().sources.find((s) => s.kind === 'window' || s.kind === 'screen')!.id;
  const camLayer = pipScene.layers.find((l) => l.sourceId === camSrcId)!;
  const winLayer = pipScene.layers.find((l) => l.sourceId === winSrcId)!;

  coord.updateSceneLayerTransform(pipScene.id, camLayer.id, { x: 0.2, y: 0.25, width: 0.32 });
  coord.updateSceneLayerStyle(pipScene.id, camLayer.id, { maskShape: 'circle', featherPx: 14 });

  const gumBefore = h.getUserMediaCalls();

  // Ocultar cámara: omite render en plan, preserva transformación/estilo y NO detiene pista de cámara
  const hideCam = await coord.setSceneLayerVisible(pipScene.id, camLayer.id, false);
  assert.equal(hideCam.ok, true);
  let plan = coord.getCompositor()!.buildSceneRenderPlan(coord.getActiveScene()!);
  assert.equal(plan.layers.some((l) => l.layerId === camLayer.id), false);
  assert.equal(h.createdTracks.every((t) => t.stopCount === 0), true);
  assert.equal(coord.sourceManager.getEntry(camSrcId)?.state.status, 'live');

  // Volver a mostrar cámara: conserva transform y estilo sin reiniciar getUserMedia
  const showCam = await coord.setSceneLayerVisible(pipScene.id, camLayer.id, true);
  assert.equal(showCam.ok, true);
  assert.equal(showCam.layer?.transform.width, 0.32);
  assert.equal(showCam.layer?.style.maskShape, 'circle');
  assert.equal(h.getUserMediaCalls(), gumBefore);

  // Ocultar y mostrar capa window que aún no fue autorizada NUNCA debe disparar getDisplayMedia
  assert.equal(h.getDisplayMediaCalls(), 0);
  await coord.setSceneLayerVisible(pipScene.id, winLayer.id, false);
  await coord.setSceneLayerVisible(pipScene.id, winLayer.id, true);
  assert.equal(h.getDisplayMediaCalls(), 0);

  coord.dispose();
});

test('CP-P02-C2 [3]: Duplicar capa comparte sourceId, eliminar de escena conserva fuente y eliminación segura bloquea en uso', async () => {
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

  const pipScene = coord.getProject().scenes.find((s) => s.presetId === 'ai-tutorial-pip')!;
  const camSrcId = coord.getProject().sources.find((s) => s.kind === 'camera')!.id;
  const camLayer = pipScene.layers.find((l) => l.sourceId === camSrcId)!;
  const sourcesBefore = coord.getProject().sources.length;

  const dup = coord.duplicateSceneLayer(pipScene.id, camLayer.id);
  assert.equal(dup.ok, true);
  assert.ok(dup.layer);
  assert.equal(dup.layer.sourceId, camSrcId);
  assert.notEqual(dup.layer.id, camLayer.id);
  assert.equal(coord.getProject().sources.length, sourcesBefore);

  // Edición independiente de la copia
  coord.updateSceneLayerTransform(pipScene.id, dup.layer.id, { x: 0.05, y: 0.05, width: 0.25 });
  const origNow = coord
    .getActiveScene()!
    .layers.find((l) => l.id === camLayer.id)!;
  assert.notEqual(origNow.transform.x, 0.05);

  // Eliminar capa duplicada de la escena NO elimina la fuente ni detiene tracks
  const rmDup = coord.removeSceneLayer(pipScene.id, dup.layer.id);
  assert.equal(rmDup.ok, true);
  assert.equal(coord.getProject().sources.some((s) => s.id === camSrcId), true);
  assert.equal(h.createdTracks.every((t) => t.stopCount === 0), true);

  // Intentar eliminar del proyecto una fuente aún usada debe ser rechazado
  const blockedDelete = await coord.removeProjectSourceSafely(camSrcId);
  assert.equal(blockedDelete.ok, false);
  assert.match(blockedDelete.reason ?? '', /en uso/i);

  // Añadir imagen real al proyecto y quitar su capa para probar eliminación segura de fuente huérfana + asset blob
  const imgBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
  const addedImg = await coord.addRealSourceToScene(pipScene.id, {
    kind: 'image',
    name: 'Logo Prueba.png',
    file: imgBlob,
  });
  assert.equal(addedImg.ok, true);
  assert.ok(addedImg.source && addedImg.layer);
  const assetRef =
    addedImg.source.kind === 'image' ? addedImg.source.assetRef : '';
  assert.ok(await loadStudioAssetBlob(assetRef));

  assert.equal(coord.removeSceneLayer(pipScene.id, addedImg.layer.id).ok, true);
  const cleanDelete = await coord.removeProjectSourceSafely(addedImg.source.id);
  assert.equal(cleanDelete.ok, true);
  assert.equal(
    coord.getProject().sources.some((s) => s.id === addedImg.source!.id),
    false
  );
  assert.equal(await loadStudioAssetBlob(assetRef), null);

  coord.dispose();
});

test('CP-P02-C2 [4]: Añadir fuentes reales (imagen, vídeo, audio, texto, color, degradado), cancelación honesta y persistencia', async () => {
  const h = createHarness();
  const baseMedia = h.mediaDevices;
  const abortingMedia: MediaDevicesAdapter = {
    ...baseMedia,
    async getDisplayMedia() {
      const err = new Error('User canceled screen picker');
      err.name = 'AbortError';
      throw err;
    },
  };

  const coord = new StudioCoordinator({
    initialMode: 'studio',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: abortingMedia, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
  });
  await coord.mount();

  const sceneId = coord.getActiveScene()!.id;
  const sourcesCountBefore = coord.getProject().sources.length;
  const layersCountBefore = coord.getActiveScene()!.layers.length;

  // Cancelar selector de pantalla NO crea fuentes rotas ni capa vacía
  const canceledWin = await coord.addRealSourceToScene(sceneId, { kind: 'window' });
  assert.equal(canceledWin.ok, false);
  assert.equal(canceledWin.canceled, true);
  assert.equal(coord.getProject().sources.length, sourcesCountBefore);
  assert.equal(coord.getActiveScene()!.layers.length, layersCountBefore);

  // Audio del sistema sin stream display con audio activo reporta estado honesto sin simular
  const sysAudioAttempt = await coord.addRealSourceToScene(sceneId, {
    kind: 'system-audio',
  });
  assert.equal(sysAudioAttempt.ok, false);
  assert.match(sysAudioAttempt.reason ?? '', /macOS|audio|captura|loopback/i);

  // Añadir texto, color, degradado, imagen y vídeo real
  const txtRes = await coord.addRealSourceToScene(sceneId, {
    kind: 'text',
    text: 'Óptica Live',
    subtitle: 'Demo ARM64',
  });
  assert.equal(txtRes.ok, true);

  const colRes = await coord.addRealSourceToScene(sceneId, {
    kind: 'color',
    color: '#0F172A',
  });
  assert.equal(colRes.ok, true);

  const gradRes = await coord.addRealSourceToScene(sceneId, {
    kind: 'gradient',
    startColor: '#0B1220',
    endColor: '#1D4ED8',
    angleDeg: 120,
  });
  assert.equal(gradRes.ok, true);

  const vidRes = await coord.addRealSourceToScene(sceneId, {
    kind: 'video-file',
    name: 'clip.mp4',
    file: new Blob([new Uint8Array([5, 6, 7])], { type: 'video/mp4' }),
  });
  assert.equal(vidRes.ok, true);

  const audRes = await coord.addRealSourceToScene(sceneId, {
    kind: 'audio-file',
    name: 'voz.m4a',
    file: new Blob([new Uint8Array([8, 9])], { type: 'audio/mp4' }),
  });
  assert.equal(audRes.ok, true);
  assert.ok(audRes.source);
  // Fuentes solo audio van a audioSourceIds sin crear capa visual geométrica
  assert.equal(audRes.layer, null);
  assert.equal(
    coord.getActiveScene()!.audioSourceIds.includes(audRes.source.id),
    true
  );

  // Render y persistencia completa tras recarga
  h.tickNextFrame(34);
  await coord.flushPersistence();
  coord.dispose();

  const coord2 = new StudioCoordinator({
    initialMode: 'studio',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: baseMedia, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
  });
  await coord2.mount();
  const restoredScene = coord2.getActiveScene()!;
  assert.equal(
    restoredScene.layers.some((l) => l.id === txtRes.layer!.id),
    true
  );
  assert.equal(
    restoredScene.layers.some((l) => l.id === vidRes.layer!.id),
    true
  );
  assert.equal(
    restoredScene.layers.some((l) => l.id === gradRes.layer!.id),
    true
  );
  coord2.dispose();
});

test('CP-P02-C2 [5]: Historial acotado Undo/Redo (gestos agrupados, límite, persistencia y cero llamadas a hardware)', async () => {
  // Probar acotamiento estricto en CompositionHistory (mínimo permitido: 5)
  const bounded = new CompositionHistory({ maxEntries: 5 });
  let currentProj = createStarterStudioProject('1080p', '16:9');
  for (let i = 1; i <= 7; i++) {
    const prev = cloneCompositionSnapshot(currentProj);
    currentProj = {
      ...currentProj,
      scenes: currentProj.scenes.map((s, idx) =>
        idx === 0 ? { ...s, name: `Estado ${i}` } : s
      ),
    };
    const next = cloneCompositionSnapshot(currentProj);
    bounded.recordChange(prev, next, {
      label: `Cambio ${i}`,
      now: i * 5000,
    });
  }
  assert.equal(bounded.getStatus().undoCount, 5);

  // Probar integración completa en StudioCoordinator
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

  const gumBefore = h.getUserMediaCalls();
  const gdmBefore = h.getDisplayMediaCalls();

  const pipScene = coord.getProject().scenes.find((s) => s.presetId === 'ai-tutorial-pip')!;
  const camSrcId = coord.getProject().sources.find((s) => s.kind === 'camera')!.id;
  const camLayer = pipScene.layers.find((l) => l.sourceId === camSrcId)!;
  const origX = camLayer.transform.x;
  const origName = camLayer.name;
  const origMaskShape = camLayer.style.maskShape;

  // 1. Gesto continuo agrupado de arrastre (10 updates -> 1 entrada en historial)
  coord.beginCompositionGesture('Mover capa');
  for (let i = 1; i <= 8; i++) {
    coord.updateSceneLayerTransform(pipScene.id, camLayer.id, {
      x: Number((0.1 + i * 0.02).toFixed(3)),
    });
  }
  coord.commitCompositionGesture();
  assert.equal(coord.getHistoryStatus().undoCount, 1);

  // 2. Cambio de estilo + renombrado
  coord.updateSceneLayerStyle(pipScene.id, camLayer.id, { maskShape: 'circle' });
  coord.renameSceneLayer(pipScene.id, camLayer.id, 'Cam Redonda');
  assert.equal(coord.getHistoryStatus().undoCount, 3);

  // Deshacer renombrado -> estilo -> arrastre entero de una vez
  const u1 = await coord.undoComposition();
  assert.equal(u1.ok, true);
  assert.equal(
    coord.getActiveScene()!.layers.find((l) => l.id === camLayer.id)?.name,
    origName
  );

  const u2 = await coord.undoComposition();
  assert.equal(u2.ok, true);
  assert.equal(
    coord.getActiveScene()!.layers.find((l) => l.id === camLayer.id)?.style.maskShape,
    origMaskShape
  );

  const u3 = await coord.undoComposition();
  assert.equal(u3.ok, true);
  assert.equal(
    coord.getActiveScene()!.layers.find((l) => l.id === camLayer.id)?.transform.x,
    origX
  );

  // Rehacer el arrastre completo y el estilo
  const r1 = await coord.redoComposition();
  assert.equal(r1.ok, true);
  assert.ok(
    Math.abs(
      (coord.getActiveScene()!.layers.find((l) => l.id === camLayer.id)?.transform.x ?? 0) -
        0.26
    ) < 1e-4
  );

  const r2 = await coord.redoComposition();
  assert.equal(r2.ok, true);
  assert.equal(
    coord.getActiveScene()!.layers.find((l) => l.id === camLayer.id)?.style.maskShape,
    'circle'
  );

  // Undo/Redo jamás reabre hardware ni detiene tracks
  assert.equal(h.getUserMediaCalls(), gumBefore);
  assert.equal(h.getDisplayMediaCalls(), gdmBefore);
  assert.equal(h.createdTracks.every((t) => t.stopCount === 0), true);

  // Verificar que Undo/Redo persiste en studioStorage
  await coord.flushPersistence();
  coord.dispose();

  const coord2 = new StudioCoordinator({
    initialMode: 'studio',
    storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory,
    scheduler: h.scheduler,
    now: h.now,
  });
  await coord2.mount();
  const persisted = coord2
    .getProject()
    .scenes.find((s) => s.id === pipScene.id)!
    .layers.find((l) => l.id === camLayer.id)!;
  assert.equal(persisted.style.maskShape, 'circle');
  assert.ok(Math.abs(persisted.transform.x - 0.26) < 1e-4);
  coord2.dispose();
});

test('C3-R1: pantalla nueva detrás de cámara, misma escena, composición PiP corrige profundidad y permite deshacer', async () => {
  const h = createHarness();
  const coord = new StudioCoordinator({
    initialMode: 'studio', storageAdapter: h.storageAdapter,
    sourceManagerOptions: { mediaDevices: h.mediaDevices, mediaElements: h.mediaElements },
    surfaceFactory: h.surfaces.factory, scheduler: h.scheduler, now: h.now,
  });
  await coord.mount();
  const before = coord.getActiveScene()!;
  const camera = before.layers.find(l=>coord.getProject().sources.some(s=>s.id===l.sourceId && s.kind==='camera'))!;
  assert.ok(camera);
  const surface=coord.getProgramSurface();
  const gum=h.getUserMediaCalls(),gdm=h.getDisplayMediaCalls();
  const result=await coord.addRealSourceToScene(before.id,{kind:'screen',placement:'behind-camera',includeSystemAudio:false});
  assert.equal(result.ok,true);
  assert.equal(coord.getActiveScene()!.id,before.id);
  const screen=result.layer!;
  const order=()=>coord.getActiveScene()!.layers.slice().sort((a,b)=>a.zIndex-b.zIndex).map(l=>l.id);
  assert.ok(order().indexOf(screen.id)<order().indexOf(camera.id));
  assert.equal(h.getDisplayMediaCalls(),gdm+1);
  coord.moveSceneLayerOrder(before.id,screen.id,'top');
  assert.ok(order().indexOf(screen.id)>order().indexOf(camera.id));
  const lay=coord.applyAdaptableLayout(before.id,'screen-main-cam-pip',{participatingLayerIds:[camera.id,screen.id]});
  assert.equal(lay.ok,true);
  assert.ok(order().indexOf(screen.id)<order().indexOf(camera.id));
  assert.equal((await coord.undoComposition()).ok,true);
  assert.ok(order().indexOf(screen.id)>order().indexOf(camera.id));
  assert.equal(h.getDisplayMediaCalls(),gdm+1);
  assert.equal(h.getUserMediaCalls(),gum);
  assert.equal(coord.getProgramSurface(),surface);
  coord.dispose();
});

test('CP-P02-C3-R2: múltiples pantallas y ventanas simultáneas, renombrado, reutilización detrás de cámara, cambio sin perder stream al cancelar y cero recuadros en visor', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
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

  const scene1 = coord.getActiveScene()!;
  const cameraLayer = scene1.layers.find((l) =>
    coord.getProject().sources.some((s) => s.id === l.sourceId && s.kind === 'camera')
  )!;
  assert.ok(cameraLayer);

  const surfaceBefore = coord.getProgramSurface();
  const gumBefore = h.getUserMediaCalls();

  // 1. Añadir simultáneamente una Pantalla y una Ventana reales detrás de la cámara en la misma escena
  const addScreenRes = await coord.addRealSourceToScene(scene1.id, {
    kind: 'screen',
    placement: 'behind-camera',
    includeSystemAudio: false,
  });
  assert.equal(addScreenRes.ok, true);
  assert.ok(addScreenRes.source && addScreenRes.layer);

  const addWindowRes = await coord.addRealSourceToScene(scene1.id, {
    kind: 'window',
    placement: 'behind-camera',
    includeSystemAudio: false,
  });
  assert.equal(addWindowRes.ok, true);
  assert.ok(addWindowRes.source && addWindowRes.layer);

  const scrSrc = addScreenRes.source!;
  const scrLayer = addScreenRes.layer!;
  const winSrc = addWindowRes.source!;
  const winLayer = addWindowRes.layer!;

  assert.notEqual(scrSrc.id, winSrc.id);
  assert.notEqual(scrLayer.id, winLayer.id);

  // Ambas quedan detrás de la cámara por defecto
  const getOrder = (scId: string) =>
    coord
      .getProject()
      .scenes.find((s) => s.id === scId)!
      .layers.slice()
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((l) => l.id);

  const order1 = getOrder(scene1.id);
  assert.ok(order1.indexOf(scrLayer.id) < order1.indexOf(cameraLayer.id));
  assert.ok(order1.indexOf(winLayer.id) < order1.indexOf(cameraLayer.id));

  // 2. Renombrar fuente no destructivamente sin reiniciar streams ni ProgramCanvas
  const renameRes = coord.renameProjectSource(winSrc.id, 'Editor VS Code');
  assert.equal(renameRes.ok, true);
  assert.equal(renameRes.source?.name, 'Editor VS Code');
  assert.equal(coord.getProgramSurface(), surfaceBefore);
  assert.equal(h.createdTracks.every((t) => t.stopCount === 0), true);

  // 3. Subir ventana al frente y devolverla 1-clic detrás de la cámara con placeSceneLayerBehindCamera
  coord.moveSceneLayerOrder(scene1.id, winLayer.id, 'top');
  let curOrder = getOrder(scene1.id);
  assert.ok(curOrder.indexOf(winLayer.id) > curOrder.indexOf(cameraLayer.id));

  coord.placeSceneLayerBehindCamera(scene1.id, winLayer.id);
  curOrder = getOrder(scene1.id);
  assert.ok(curOrder.indexOf(winLayer.id) < curOrder.indexOf(cameraLayer.id));

  // 4. Composición explícita Principal/Secundaria (screen-main-window-pip) + Undo sin reabrir hardware
  const gdmAfterAdds = h.getDisplayMediaCalls();
  const compRes = coord.applyAdaptableLayout(scene1.id, 'screen-main-window-pip', {
    primaryDisplayLayerId: winLayer.id,
    secondaryDisplayLayerId: scrLayer.id,
    primaryCameraLayerId: cameraLayer.id,
  });
  assert.equal(compRes.ok, true);
  const activeLayersAfterComp = coord.getActiveScene()!.layers;
  const winAfterComp = activeLayersAfterComp.find((l) => l.id === winLayer.id)!;
  const scrAfterComp = activeLayersAfterComp.find((l) => l.id === scrLayer.id)!;
  const camAfterComp = activeLayersAfterComp.find((l) => l.id === cameraLayer.id)!;
  assert.ok(winAfterComp.zIndex < scrAfterComp.zIndex && scrAfterComp.zIndex < camAfterComp.zIndex);
  assert.ok(winAfterComp.transform.width >= 0.99);
  assert.ok(scrAfterComp.transform.width < 0.4);

  assert.equal((await coord.undoComposition()).ok, true);
  assert.equal(h.getDisplayMediaCalls(), gdmAfterAdds);
  assert.equal(h.getUserMediaCalls(), gumBefore);

  // 5. Reutilizar fuente existente en otra escena detrás de cámara sin pedir getDisplayMedia otra vez
  const secondScene = coord.getProject().scenes.find((s) => s.id !== scene1.id)!;
  const reuseRes = await coord.addExistingSourceToScene(secondScene.id, scrSrc.id, {
    placement: 'behind-camera',
  });
  assert.equal(reuseRes.ok, true);
  assert.equal(reuseRes.source?.id, scrSrc.id);
  assert.notEqual(reuseRes.layer?.id, scrLayer.id);
  assert.equal(h.getDisplayMediaCalls(), gdmAfterAdds);

  // 6. Cambiar captura en vivo y cancelar el selector conserva la captura activa original
  const originalStreamId = addScreenRes.entry?.resources.mediaStream?.id;
  assert.ok(originalStreamId);

  const origGetDisplayMedia = h.mediaDevices.getDisplayMedia;
  h.mediaDevices.getDisplayMedia = async () => {
    const err = new Error('User canceled picker');
    err.name = 'NotAllowedError';
    throw err;
  };
  const canceledEntry = await coord.reconnectSource(scrSrc.id, true);
  assert.equal(canceledEntry?.state.status, 'live');
  assert.equal(canceledEntry?.details.errorCode, 'user-canceled');
  assert.equal(canceledEntry?.resources.mediaStream?.id, originalStreamId);
  assert.equal(coord.getProgramSurface(), surfaceBefore);
  h.mediaDevices.getDisplayMedia = origGetDisplayMedia;

  // 7. Regla permanente: CameraViewport jamás renderiza recuadros de detección de sujetos sobre la escena
  const viewportSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/CameraViewport.tsx'),
    'utf8'
  );
  assert.equal(viewportSource.includes('Sujeto 1'), false);
  assert.equal(viewportSource.includes('detectedSubjects'), false);

  coord.dispose();
});
