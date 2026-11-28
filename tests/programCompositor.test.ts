import test from 'node:test';
import assert from 'node:assert/strict';
import { addLayerToScene, addSource, createEmptyProject, createScene } from '../src/engine/sceneEngine';
import { instantiatePresetProject, STUDIO_PRESETS } from '../src/engine/scenePresets';
import {
  applyPerimeterFeatherToRgbaBuffer,
  Canvas2dCompositorBackend,
  compositeStraightAlphaPixel,
  computeLayerRenderGeometry,
  computeNormalizedFeatherAlpha,
  computeSignedMaskDistancePx,
  INITIAL_PROGRAM_PROFILE,
  ProgramCompositor,
  resolveOutputDimensions,
  STANDARD_COMPOSITION_FORMATS,
  traceMaskPathOn2dContext,
  type CompositorRenderBackend,
  type FrameSchedulerAdapter,
  type ProgramSurfaceLike,
  type SceneRenderPlan,
} from '../src/engine/programCompositor';
import { SourceManager, type MediaDevicesAdapter, type MediaElementFactoryAdapter, type MediaStreamLike, type MediaTrackLike, type MediaVideoElementLike } from '../src/engine/sourceManager';
import type { SceneLayer, StudioScene, StudioSource } from '../src/types/studio';

// ============================================================================
// UTILIDADES DE PRUEBA E INSTRUMENTACIÓN (EXCLUSIVAS DE TESTS)
// ============================================================================

interface Recorded2dCall {
  op: string;
  args: unknown[];
}

function createMock2dSurface(width = 1920, height = 1080) {
  const calls: Recorded2dCall[] = [];
  const stateStack: Array<{ globalAlpha: number; globalCompositeOperation: string }> = [];

  const ctx = {
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
    save() {
      stateStack.push({
        globalAlpha: this.globalAlpha,
        globalCompositeOperation: this.globalCompositeOperation,
      });
      calls.push({ op: 'save', args: [] });
    },
    restore() {
      const prev = stateStack.pop();
      if (prev) {
        this.globalAlpha = prev.globalAlpha;
        this.globalCompositeOperation = prev.globalCompositeOperation;
      }
      calls.push({ op: 'restore', args: [] });
    },
    translate(x: number, y: number) {
      calls.push({ op: 'translate', args: [x, y] });
    },
    rotate(rad: number) {
      calls.push({ op: 'rotate', args: [rad] });
    },
    scale(sx: number, sy: number) {
      calls.push({ op: 'scale', args: [sx, sy] });
    },
    beginPath() {
      calls.push({ op: 'beginPath', args: [] });
    },
    closePath() {
      calls.push({ op: 'closePath', args: [] });
    },
    rect(x: number, y: number, w: number, h: number) {
      calls.push({ op: 'rect', args: [x, y, w, h] });
    },
    roundRect(x: number, y: number, w: number, h: number, r: number) {
      calls.push({ op: 'roundRect', args: [x, y, w, h, r] });
    },
    arc(x: number, y: number, r: number, s: number, e: number) {
      calls.push({ op: 'arc', args: [x, y, r, s, e] });
    },
    ellipse(x: number, y: number, rx: number, ry: number, rot: number, s: number, e: number) {
      calls.push({ op: 'ellipse', args: [x, y, rx, ry, rot, s, e] });
    },
    moveTo(x: number, y: number) {
      calls.push({ op: 'moveTo', args: [x, y] });
    },
    lineTo(x: number, y: number) {
      calls.push({ op: 'lineTo', args: [x, y] });
    },
    bezierCurveTo(...args: number[]) {
      calls.push({ op: 'bezierCurveTo', args });
    },
    quadraticCurveTo(...args: number[]) {
      calls.push({ op: 'quadraticCurveTo', args });
    },
    clip() {
      calls.push({ op: 'clip', args: [] });
    },
    fill() {
      calls.push({ op: 'fill', args: [this.shadowBlur, this.shadowColor] });
    },
    stroke() {
      calls.push({ op: 'stroke', args: [this.lineWidth, this.strokeStyle] });
    },
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ op: 'fillRect', args: [x, y, w, h, this.fillStyle, this.globalAlpha] });
    },
    fillText(text: string, x: number, y: number) {
      calls.push({ op: 'fillText', args: [text, x, y, this.fillStyle] });
    },
    drawImage(...args: unknown[]) {
      calls.push({ op: 'drawImage', args: [...args, this.globalAlpha, this.globalCompositeOperation] });
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
  };

  const listeners = new Map<string, Set<(ev?: unknown) => void>>();
  const surface: ProgramSurfaceLike = {
    width,
    height,
    getContext(id: string) {
      return id === '2d' ? ctx : null;
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

  return { surface, ctx, calls, listeners };
}

function createMockWebgl2Surface(width = 1920, height = 1080) {
  let texSeq = 0;
  let progSeq = 0;
  let shaderSeq = 0;
  let fboSeq = 0;
  const deletedTextures: unknown[] = [];
  const texImageUploads: Array<{ tex: unknown; source: unknown }> = [];
  const drawCalls: number[] = [];
  const uniformCalls: Array<{ name: string; values: unknown[] }> = [];
  const pixelStoreiCalls: Array<{ pname: number; param: number }> = [];
  const shaderSources: string[] = [];
  const listeners = new Map<string, Set<(ev?: unknown) => void>>();

  const gl = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    BLEND: 0x0be2,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    ONE: 1,
    TEXTURE_2D: 0x0de1,
    TEXTURE0: 0x84c0,
    TEXTURE1: 0x84c1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    FRAMEBUFFER: 0x8d40,
    COLOR_ATTACHMENT0: 0x8ce0,
    COLOR_BUFFER_BIT: 0x4000,
    TRIANGLE_STRIP: 0x0005,

    createShader: () => ({ id: ++shaderSeq }),
    shaderSource: (_shader: unknown, src: string) => {
      shaderSources.push(src);
    },
    compileShader: () => {},
    getShaderParameter: () => true,
    deleteShader: () => {},
    createProgram: () => ({ id: ++progSeq }),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    deleteProgram: () => {},
    createVertexArray: () => ({}),
    bindVertexArray: () => {},
    deleteVertexArray: () => {},
    createBuffer: () => ({}),
    bindBuffer: () => {},
    bufferData: () => {},
    deleteBuffer: () => {},
    getAttribLocation: () => 0,
    enableVertexAttribArray: () => {},
    vertexAttribPointer: () => {},
    enable: () => {},
    blendFuncSeparate: () => {},
    viewport: () => {},
    clearColor: () => {},
    clear: () => {},
    useProgram: () => {},
    getUniformLocation: (_p: unknown, name: string) => ({ name }),
    uniform1i: (loc: { name: string } | null, v: number) => {
      if (loc) uniformCalls.push({ name: loc.name, values: [v] });
    },
    uniform1f: (loc: { name: string } | null, v: number) => {
      if (loc) uniformCalls.push({ name: loc.name, values: [v] });
    },
    uniform2f: (loc: { name: string } | null, x: number, y: number) => {
      if (loc) uniformCalls.push({ name: loc.name, values: [x, y] });
    },
    uniform4f: (loc: { name: string } | null, a: number, b: number, c: number, d: number) => {
      if (loc) uniformCalls.push({ name: loc.name, values: [a, b, c, d] });
    },
    uniformMatrix3fv: () => {},
    activeTexture: () => {},
    createTexture: () => ({ id: ++texSeq }),
    bindTexture: () => {},
    texParameteri: () => {},
    pixelStorei: (pname: number, param: number) => {
      pixelStoreiCalls.push({ pname, param });
    },
    texImage2D: (_t: unknown, _l: unknown, _ifmt: unknown, _wOrFmt: unknown, _hOrType: unknown, _b?: unknown, _f?: unknown, _ty?: unknown, src?: unknown) => {
      texImageUploads.push({ tex: texSeq, source: src ?? _b });
    },
    deleteTexture: (t: unknown) => {
      deletedTextures.push(t);
    },
    createFramebuffer: () => ({ id: ++fboSeq }),
    bindFramebuffer: () => {},
    framebufferTexture2D: () => {},
    deleteFramebuffer: () => {},
    drawArrays: (_mode: number, _first: number, count: number) => {
      drawCalls.push(count);
    },
  };

  const surface: ProgramSurfaceLike = {
    width,
    height,
    getContext(id: string) {
      return id === 'webgl2' ? gl : null;
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

  function emitSurfaceEvent(type: string) {
    let prevented = false;
    const ev = {
      preventDefault() {
        prevented = true;
      },
    };
    listeners.get(type)?.forEach((fn) => fn(ev));
    return prevented;
  }

  return {
    surface,
    gl,
    deletedTextures,
    texImageUploads,
    drawCalls,
    uniformCalls,
    pixelStoreiCalls,
    shaderSources,
    emitSurfaceEvent,
    listeners,
  };
}

function createFakeLayer(overrides: Partial<SceneLayer> = {}): SceneLayer {
  return {
    id: 'layer_test',
    sourceId: 'src_test',
    name: 'Capa Test',
    zIndex: 0,
    visible: true,
    locked: false,
    overrideSourceProcessing: false,
    transform: {
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
      crop: { top: 0, right: 0, bottom: 0, left: 0 },
      ...overrides.transform,
    },
    style: {
      opacity: 1,
      blendMode: 'normal',
      maskShape: 'rect',
      borderRadiusPx: 0,
      borderWidthPx: 0,
      borderColor: 'rgba(255,255,255,0.28)',
      shadowBlurPx: 0,
      shadowOpacity: 0,
      shadowColor: 'rgba(0,0,0,0.5)',
      ...overrides.style,
    },
    ...overrides,
    // Re-aplicar transform/style combinados
  };
}

function makeManualLayer(
  id: string,
  sourceId: string,
  transform?: Partial<SceneLayer['transform']>,
  style?: Partial<SceneLayer['style']>,
  extra?: Partial<Pick<SceneLayer, 'zIndex' | 'visible' | 'locked' | 'name'>>
): SceneLayer {
  const base = createFakeLayer({ id, sourceId });
  return {
    ...base,
    ...extra,
    transform: {
      ...base.transform,
      ...transform,
      crop: { ...base.transform.crop, ...transform?.crop },
    },
    style: {
      ...base.style,
      ...style,
    },
  };
}

function createSpyBackend(): CompositorRenderBackend & {
  renderedPlans: SceneRenderPlan[];
  fadeCalls: Array<{ outgoing: SceneRenderPlan; incoming: SceneRenderPlan; alpha: number }>;
  prunedSets: Array<Set<string>>;
  disposedCount: number;
} {
  const renderedPlans: SceneRenderPlan[] = [];
  const fadeCalls: Array<{ outgoing: SceneRenderPlan; incoming: SceneRenderPlan; alpha: number }> = [];
  const prunedSets: Array<Set<string>> = [];
  let disposedCount = 0;

  return {
    kind: 'custom',
    isContextLost: false,
    renderedPlans,
    fadeCalls,
    prunedSets,
    get disposedCount() {
      return disposedCount;
    },
    initialize: () => true,
    resize: () => {},
    renderScene: (plan) => {
      renderedPlans.push(plan);
    },
    renderFadeTransition: (outgoing, incoming, alpha) => {
      fadeCalls.push({ outgoing, incoming, alpha });
    },
    pruneUnusedSources: (set) => {
      prunedSets.push(new Set(set));
    },
    invalidateAllTextures: () => {},
    getStats: () => ({ textureUploadsCount: 0, cachedTexturesCount: 0 }),
    dispose: () => {
      disposedCount += 1;
    },
  };
}

// ============================================================================
// 24 PRUEBAS AUTOMATIZADAS OBLIGATORIAS (CP-P01-C)
// ============================================================================

test('1. Conversión exacta de coordenadas normalizadas a píxeles de salida', () => {
  const layer = makeManualLayer('l1', 's1', {
    x: 0.25,
    y: 0.5,
    width: 0.5,
    height: 0.25,
    fitMode: 'stretch',
  });

  const g1080 = computeLayerRenderGeometry(layer, 1920, 1080, 1920, 1080);
  assert.deepEqual(g1080.layerBox, { x: 480, y: 540, width: 960, height: 270 });

  // Misma escena en 4K conserva exactamente la disposición proporcional
  const g4k = computeLayerRenderGeometry(layer, 1920, 1080, 3840, 2160);
  assert.deepEqual(g4k.layerBox, { x: 960, y: 1080, width: 1920, height: 540 });
});

test('2. Geometría contain preserva relación de aspecto centrada sin distorsión', () => {
  // Fuente 16:9 (1920x1080) dentro de un cuadro cuadrado 500x500 en lienzo 1000x1000
  const layer = makeManualLayer('l_contain', 's1', {
    x: 0,
    y: 0,
    width: 0.5,
    height: 0.5,
    fitMode: 'contain',
  });

  const g = computeLayerRenderGeometry(layer, 1920, 1080, 1000, 1000);
  assert.equal(g.contentLocalRect.width, 500);
  assert.ok(Math.abs(g.contentLocalRect.height - 281.25) < 0.01);
  assert.equal(g.contentLocalRect.x, 0);
  assert.ok(Math.abs(g.contentLocalRect.y - (500 - 281.25) / 2) < 0.01);
  // sourceRect completo sin recorte extra
  assert.deepEqual(g.sourceRect, { sx: 0, sy: 0, sw: 1920, sh: 1080 });
});

test('3. Geometría cover recorta proporcionalmente la fuente para llenar el cuadro sin estirar', () => {
  // Fuente 16:9 (1920x1080) en cuadro vertical 500x1000 (aspect 0.5)
  const layer = makeManualLayer('l_cover', 's1', {
    x: 0,
    y: 0,
    width: 0.5,
    height: 1,
    fitMode: 'cover',
  });

  const g = computeLayerRenderGeometry(layer, 1920, 1080, 1000, 1000);
  assert.deepEqual(g.contentLocalRect, { x: 0, y: 0, width: 500, height: 1000 });
  // Debe tomar franja central de ancho 540px (1080 * 0.5)
  assert.equal(g.sourceRect.sh, 1080);
  assert.equal(g.sourceRect.sw, 540);
  assert.equal(g.sourceRect.sx, (1920 - 540) / 2);
});

test('4. Geometría stretch utiliza toda la fuente recortada y llena el cuadro completo', () => {
  const layer = makeManualLayer('l_stretch', 's1', {
    x: 0.1,
    y: 0.1,
    width: 0.4,
    height: 0.8,
    fitMode: 'stretch',
  });

  const g = computeLayerRenderGeometry(layer, 1920, 1080, 1000, 1000);
  assert.deepEqual(g.sourceRect, { sx: 0, sy: 0, sw: 1920, sh: 1080 });
  assert.deepEqual(g.contentLocalRect, { x: 0, y: 0, width: 400, height: 800 });
});

test('5. Recorte independiente (crop) se aplica antes de fitMode y conserva proporciones', () => {
  // Fuente 1000x1000 recortada 25% izquierda y 25% derecha -> queda 500x1000 (aspect 0.5)
  const layer = makeManualLayer('l_crop', 's1', {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    fitMode: 'contain',
    crop: { left: 0.25, right: 0.25, top: 0.1, bottom: 0.1 },
  });

  const g = computeLayerRenderGeometry(layer, 1000, 1000, 1000, 1000);
  assert.equal(g.sourceRect.sx, 250);
  assert.equal(g.sourceRect.sw, 500);
  assert.equal(g.sourceRect.sy, 100);
  assert.equal(g.sourceRect.sh, 800);
  // Aspecto recortado = 500/800 = 0.625 -> encaja a altura 1000, ancho 625
  assert.equal(g.contentLocalRect.width, 625);
  assert.equal(g.contentLocalRect.height, 1000);
});

test('6. Rotación y punto de anclaje se aplican alrededor del pivote exacto', () => {
  const layer = makeManualLayer('l_rot', 's1', {
    x: 0.5,
    y: 0.5,
    width: 0.2,
    height: 0.2,
    anchorX: 0.5,
    anchorY: 0.5,
    rotationDeg: 45,
  });

  const g = computeLayerRenderGeometry(layer, 1920, 1080, 1920, 1080);
  assert.deepEqual(g.anchorPoint, { x: 960, y: 540 });
  assert.equal(g.layerBox.x, 960 - (1920 * 0.2) / 2);
  assert.equal(g.layerBox.y, 540 - (1080 * 0.2) / 2);
  assert.equal(g.rotationDeg, 45);

  const mock = createMock2dSurface(1920, 1080);
  const comp = new ProgramCompositor({
    surface: mock.surface,
    preferredBackend: 'canvas2d',
  });
  const src: StudioSource = { id: 's1', kind: 'color', name: 'Color', createdAt: 1, color: '#ff0000' };
  const scene: StudioScene = {
    id: 'sc1',
    name: 'Rot',
    backgroundColor: '#000',
    transition: { type: 'cut', durationMs: 0 },
    layers: [layer],
    audioSourceIds: [],
    createdAt: 1,
    updatedAt: 1,
  };
  comp.setSceneData(scene, [src]);
  comp.renderFrameNow();

  const translateAnchor = mock.calls.find((c) => c.op === 'translate' && c.args[0] === 960 && c.args[1] === 540);
  const rotateCall = mock.calls.find((c) => c.op === 'rotate');
  assert.ok(translateAnchor, 'Debe pivotar en el anchorPoint');
  assert.ok(rotateCall && Math.abs((rotateCall.args[0] as number) - Math.PI / 4) < 0.0001);
  comp.dispose();
});

test('7. Inversión horizontal (flipH) y vertical (flipV) emiten transformaciones exactas', () => {
  const mock = createMock2dSurface(1920, 1080);
  const comp = new ProgramCompositor({ surface: mock.surface, preferredBackend: 'canvas2d' });
  const src: StudioSource = { id: 's1', kind: 'color', name: 'C', createdAt: 1, color: '#00ff00' };
  const layer = makeManualLayer('l_flip', 's1', { flipH: true, flipV: true, width: 0.5, height: 0.5 });

  comp.setSceneData(
    {
      id: 'sc1',
      name: 'Flip',
      backgroundColor: '#000',
      transition: { type: 'cut', durationMs: 0 },
      layers: [layer],
      audioSourceIds: [],
      createdAt: 1,
      updatedAt: 1,
    },
    [src]
  );
  comp.renderFrameNow();

  const scaleCall = mock.calls.find((c) => c.op === 'scale');
  assert.deepEqual(scaleCall?.args, [-1, -1]);
  comp.dispose();
});

test('8. Orden correcto por zIndex ascendente e ignora fuentes de audio en capas', () => {
  const spy = createSpyBackend();
  const comp = new ProgramCompositor({ surface: { width: 1920, height: 1080 }, customBackend: spy });

  const s1: StudioSource = { id: 's1', kind: 'color', name: 'Fondo', createdAt: 1, color: '#111' };
  const s2: StudioSource = { id: 's2', kind: 'color', name: 'Medio', createdAt: 1, color: '#222' };
  const s3: StudioSource = { id: 's3', kind: 'color', name: 'Frente', createdAt: 1, color: '#333' };
  const mic: StudioSource = {
    id: 'mic1',
    kind: 'microphone',
    name: 'Mic',
    createdAt: 1,
    deviceId: 'd1',
    echoCancellation: true,
    noiseSuppression: true,
  };

  const scene: StudioScene = {
    id: 'sc1',
    name: 'Z',
    backgroundColor: '#000',
    transition: { type: 'cut', durationMs: 0 },
    layers: [
      makeManualLayer('top', 's3', {}, {}, { zIndex: 10 }),
      makeManualLayer('audio_oops', 'mic1', {}, {}, { zIndex: 5 }),
      makeManualLayer('bottom', 's1', {}, {}, { zIndex: 0 }),
      makeManualLayer('mid', 's2', {}, {}, { zIndex: 4 }),
    ],
    audioSourceIds: ['mic1'],
    createdAt: 1,
    updatedAt: 1,
  };

  comp.setSceneData(scene, [s1, s2, s3, mic]);
  comp.renderFrameNow();

  assert.equal(spy.renderedPlans.length, 1);
  assert.deepEqual(
    spy.renderedPlans[0].layers.map((l) => l.layerId),
    ['bottom', 'mid', 'top']
  );
  comp.dispose();
});

test('9. Visibilidad: las capas con visible=false no se renderizan pero aparecen en diagnóstico', () => {
  const spy = createSpyBackend();
  const comp = new ProgramCompositor({ surface: { width: 1920, height: 1080 }, customBackend: spy });

  const s1: StudioSource = { id: 's1', kind: 'color', name: 'Visible', createdAt: 1, color: '#111' };
  const s2: StudioSource = { id: 's2', kind: 'color', name: 'Oculta', createdAt: 1, color: '#222' };

  comp.setSceneData(
    {
      id: 'sc1',
      name: 'Vis',
      backgroundColor: '#000',
      transition: { type: 'cut', durationMs: 0 },
      layers: [
        makeManualLayer('l1', 's1', {}, {}, { zIndex: 0, visible: true }),
        makeManualLayer('l2', 's2', {}, {}, { zIndex: 1, visible: false }),
      ],
      audioSourceIds: [],
      createdAt: 1,
      updatedAt: 1,
    },
    [s1, s2]
  );
  comp.renderFrameNow();

  assert.deepEqual(
    spy.renderedPlans[0].layers.map((l) => l.layerId),
    ['l1']
  );
  const diagHidden = comp.getDiagnostics().find((d) => d.layerId === 'l2');
  assert.equal(diagHidden?.rendered, false);
  assert.equal(diagHidden?.appliedFallback, 'hidden');
  comp.dispose();
});

test('10. Opacidad se aplica al plan y al contexto de dibujo respetando rango 0..1', () => {
  const mock = createMock2dSurface(1920, 1080);
  const comp = new ProgramCompositor({ surface: mock.surface, preferredBackend: 'canvas2d' });
  const s1: StudioSource = { id: 's1', kind: 'color', name: 'Semi', createdAt: 1, color: '#ffffff' };

  comp.setSceneData(
    {
      id: 'sc1',
      name: 'Opacity',
      backgroundColor: '#000',
      transition: { type: 'cut', durationMs: 0 },
      layers: [makeManualLayer('l1', 's1', {}, { opacity: 0.42 })],
      audioSourceIds: [],
      createdAt: 1,
      updatedAt: 1,
    },
    [s1]
  );
  comp.renderFrameNow();

  const fillRectLayer = mock.calls.find(
    (c) => c.op === 'fillRect' && c.args[4] === '#ffffff'
  );
  assert.ok(fillRectLayer);
  assert.ok(Math.abs((fillRectLayer.args[5] as number) - 0.42) < 0.001);
  comp.dispose();
});

test('11. Máscaras rect, rounded, circle y squircle generan rutas geométricas diferenciadas', () => {
  const mock = createMock2dSurface(1920, 1080);
  const comp = new ProgramCompositor({ surface: mock.surface, preferredBackend: 'canvas2d' });
  const src: StudioSource = { id: 's1', kind: 'color', name: 'Box', createdAt: 1, color: '#38bdf8' };

  const shapes: Array<'rect' | 'rounded' | 'circle' | 'squircle'> = ['rect', 'rounded', 'circle', 'squircle'];
  for (const shape of shapes) {
    mock.calls.length = 0;
    comp.setSceneData(
      {
        id: 'sc1',
        name: shape,
        backgroundColor: '#000',
        transition: { type: 'cut', durationMs: 0 },
        layers: [
          makeManualLayer('l1', 's1', { width: 0.3, height: 0.3 }, { maskShape: shape, borderRadiusPx: 24 }),
        ],
        audioSourceIds: [],
        createdAt: 1,
        updatedAt: 1,
      },
      [src]
    );
    comp.renderFrameNow();

    assert.ok(mock.calls.some((c) => c.op === 'clip'), `Debe aplicar clip para ${shape}`);
    if (shape === 'circle') assert.ok(mock.calls.some((c) => c.op === 'arc'));
    if (shape === 'rounded') assert.ok(mock.calls.some((c) => c.op === 'roundRect'));
    if (shape === 'squircle') assert.ok(mock.calls.some((c) => c.op === 'bezierCurveTo'));
    if (shape === 'rect') {
      assert.ok(mock.calls.some((c) => c.op === 'rect'));
      assert.equal(mock.calls.some((c) => c.op === 'bezierCurveTo'), false);
    }
  }
  comp.dispose();
});

test('12. Composición alfa transparente: presentador recortado sobre ventana blanca sin halo oscuro', () => {
  // Prueba matemática de píxeles: fondo ventana UI blanco (255,255,255,255)
  // + borde semitransparente de sujeto blanco puro (255,255,255,128) => debe mantenerse blanco puro sin oscurecimiento
  const bgWhite: [number, number, number, number] = [255, 255, 255, 255];
  const fgFeatherEdge: [number, number, number, number] = [255, 255, 255, 128];
  const composedWhite = compositeStraightAlphaPixel(bgWhite, fgFeatherEdge, 1);
  assert.deepEqual(composedWhite, [255, 255, 255, 255]);

  // Sujeto azul sobre fondo blanco al 50% alfa -> mezcla lineal limpia sin tintes negros
  const fgBlueEdge: [number, number, number, number] = [56, 189, 248, 128];
  const composedBlue = compositeStraightAlphaPixel(bgWhite, fgBlueEdge, 1);
  assert.ok(composedBlue[0] >= 150 && composedBlue[1] >= 220 && composedBlue[2] >= 250);

  // Contrato runtime de ProgramCompositor con ProcessedLayerSurface transparente
  const spy = createSpyBackend();
  const comp = new ProgramCompositor({ surface: { width: 1920, height: 1080 }, customBackend: spy });
  const cam: StudioSource = {
    id: 'src_cam',
    kind: 'camera',
    name: 'Presentador',
    createdAt: 1,
    deviceId: 'c1',
    preferredWidth: 1920,
    preferredHeight: 1080,
    preferredFps: 30,
  };
  const win: StudioSource = { id: 'src_win', kind: 'window', name: 'Google AI Studio', createdAt: 1, includeSystemAudio: false };

  comp.setSceneData(
    {
      id: 'sc1',
      name: 'Alpha',
      backgroundColor: '#000',
      transition: { type: 'cut', durationMs: 0 },
      layers: [
        makeManualLayer('l_win', 'src_win', { width: 1, height: 1 }, {}, { zIndex: 0 }),
        makeManualLayer('l_cam', 'src_cam', { x: 0.7, y: 0.5, width: 0.3, height: 0.5 }, {}, { zIndex: 1 }),
      ],
      audioSourceIds: [],
      createdAt: 1,
      updatedAt: 1,
    },
    [win, cam]
  );

  // Inyectar superficie procesada con canal alfa transparente para l_cam aunque SourceManager esté idle/live
  comp.setProcessedLayerSurface('l_cam', {
    surface: { width: 640, height: 480 },
    width: 640,
    height: 480,
    alphaMode: 'straight',
    frameVersion: 42,
    hasTransparentSubject: true,
  });
  // Ventana de fondo con color sólido neutral fallback activo solo para el test o surface real
  comp.setProcessedLayerSurface('l_win', {
    surface: { width: 1920, height: 1080 },
    width: 1920,
    height: 1080,
    alphaMode: 'straight',
    frameVersion: 1,
  });

  comp.renderFrameNow();
  const camCmd = spy.renderedPlans[0].layers.find((l) => l.layerId === 'l_cam');
  assert.ok(camCmd);
  assert.equal(camCmd.hasTransparentAlpha, true);
  assert.equal(camCmd.alphaMode, 'straight');
  assert.equal(camCmd.frameSignature, 'proc_42');
  comp.dispose();
});

test('13. Bordes y sombras se dibujan con escala proporcional sin recortarse por la máscara', () => {
  const mock = createMock2dSurface(3840, 2160);
  const comp = new ProgramCompositor({
    surface: mock.surface,
    width: 3840,
    height: 2160,
    preferredBackend: 'canvas2d',
  });
  const src: StudioSource = { id: 's1', kind: 'color', name: 'Card', createdAt: 1, color: '#111827' };
  const layer = makeManualLayer(
    'l1',
    's1',
    { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
    {
      maskShape: 'rounded',
      borderRadiusPx: 20,
      borderWidthPx: 4,
      borderColor: 'rgba(255,255,255,0.5)',
      shadowBlurPx: 24,
      shadowOpacity: 0.6,
      shadowColor: 'rgba(0,0,0,0.7)',
    }
  );

  comp.setSceneData(
    {
      id: 'sc1',
      name: 'Style',
      backgroundColor: '#000',
      transition: { type: 'cut', durationMs: 0 },
      layers: [layer],
      audioSourceIds: [],
      createdAt: 1,
      updatedAt: 1,
    },
    [src]
  );
  comp.renderFrameNow();

  // En 4K (2160p = 2x de 1080p): shadowBlur=48, borderWidth=8
  const fillShadow = mock.calls.find((c) => c.op === 'fill');
  const strokeBorder = mock.calls.find((c) => c.op === 'stroke');
  const clipIdx = mock.calls.findIndex((c) => c.op === 'clip');
  const fillIdx = mock.calls.findIndex((c) => c.op === 'fill');

  assert.ok(fillShadow && fillShadow.args[0] === 48);
  assert.ok(strokeBorder && strokeBorder.args[0] === 8);
  assert.ok(fillIdx >= 0 && fillIdx < clipIdx, 'La sombra debe dibujarse antes de aplicar clip()');
  comp.dispose();
});

test('14. Fuentes gráficas estáticas (color, gradient, text) renderizan sin hardware', () => {
  const mock = createMock2dSurface(1920, 1080);
  const comp = new ProgramCompositor({ surface: mock.surface, preferredBackend: 'canvas2d' });

  let project = createEmptyProject();
  const cAdd = addSource(project, { kind: 'color', name: 'BG', color: '#050814' });
  project = cAdd.project;
  const gAdd = addSource(project, {
    kind: 'gradient',
    name: 'Grad',
    startColor: '#0f172a',
    endColor: '#1e1b4b',
    angleDeg: 135,
  });
  project = gAdd.project;
  const tAdd = addSource(project, {
    kind: 'text',
    name: 'LowerThird',
    text: 'Demostración IA',
    fontFamily: 'sans',
    fontSizePx: 32,
    textColor: '#ffffff',
    accentColor: '#38bdf8',
    glassBackdrop: true,
    align: 'left',
  });
  project = tAdd.project;

  const sId = project.activeSceneId;
  project = addLayerToScene(project, sId, cAdd.source.id).project;
  project = addLayerToScene(project, sId, gAdd.source.id, { transform: { width: 0.5, height: 0.5 } }).project;
  project = addLayerToScene(project, sId, tAdd.source.id, { transform: { y: 0.8, width: 0.4, height: 0.1 } }).project;

  const scene = project.scenes[0];
  comp.setSceneData(scene, project.sources);
  comp.renderFrameNow();

  assert.ok(mock.calls.some((c) => c.op === 'fillRect' && c.args[4] === '#050814'));
  assert.ok(mock.calls.some((c) => c.op === 'fillText' && c.args[0] === 'Demostración IA'));
  assert.equal(comp.getDiagnostics().every((d) => d.rendered), true);
  comp.dispose();
});

test('15. Fuentes multimedia independientes desde SourceManager se componen juntas y ProgramCompositor no detiene pistas', async () => {
  const stopCounts: number[] = [];
  let seq = 0;

  const makeMockTrack = (kind: 'video' | 'audio'): MediaTrackLike => {
    const idx = stopCounts.length;
    stopCounts.push(0);
    return {
      id: `t_${++seq}`,
      kind,
      enabled: true,
      readyState: 'live',
      stop() {
        stopCounts[idx] += 1;
        this.readyState = 'ended';
      },
      getSettings: () => ({ width: 1920, height: 1080, frameRate: 30, deviceId: 'cam-1' }),
    };
  };

  const mediaDevices: MediaDevicesAdapter = {
    async getUserMedia() {
      const vt = makeMockTrack('video');
      return {
        id: `cam_stream_${seq}`,
        getTracks: () => [vt],
        getVideoTracks: () => [vt],
        getAudioTracks: () => [],
      } as MediaStreamLike;
    },
    async getDisplayMedia() {
      const vt = makeMockTrack('video');
      return {
        id: `win_stream_${seq}`,
        getTracks: () => [vt],
        getVideoTracks: () => [vt],
        getAudioTracks: () => [],
      } as MediaStreamLike;
    },
  };

  const mediaElements: MediaElementFactoryAdapter = {
    createImageElement: () => ({ src: '', naturalWidth: 100, naturalHeight: 100, complete: true }),
    createVideoElement: () =>
      ({
        src: '',
        srcObject: null,
        loop: false,
        muted: true,
        playbackRate: 1,
        videoWidth: 1920,
        videoHeight: 1080,
        readyState: 4,
        currentTime: 1.5,
      }) as MediaVideoElementLike,
    createAudioElement: () => ({ src: '', srcObject: null, loop: false, muted: true }),
  };

  const sm = new SourceManager({ mediaDevices, mediaElements });
  let project = createEmptyProject();
  const winSrc = addSource(project, { kind: 'window', name: 'Google AI Studio', includeSystemAudio: false });
  project = winSrc.project;
  const camSrc = addSource(project, {
    kind: 'camera',
    name: 'Presentador',
    deviceId: 'cam-1',
    preferredWidth: 1920,
    preferredHeight: 1080,
    preferredFps: 30,
  });
  project = camSrc.project;

  project = addLayerToScene(project, project.activeSceneId, winSrc.source.id, {
    transform: { x: 0, y: 0, width: 1, height: 1, fitMode: 'contain' },
  }).project;
  project = addLayerToScene(project, project.activeSceneId, camSrc.source.id, {
    transform: { x: 0.72, y: 0.68, width: 0.25, height: 0.28, fitMode: 'cover' },
    style: { maskShape: 'squircle', borderRadiusPx: 20 },
  }).project;

  const entries = await sm.acquireSourcesForScene(project.scenes[0], project.sources, 'program-compositor');
  const mock = createMock2dSurface(1920, 1080);
  const comp = new ProgramCompositor({ surface: mock.surface, preferredBackend: 'canvas2d' });
  comp.setSceneData(project.scenes[0], project.sources, entries);
  comp.renderFrameNow();

  const drawImgCalls = mock.calls.filter((c) => c.op === 'drawImage');
  assert.equal(drawImgCalls.length, 2, 'Debe componer ventana base + cámara encima');

  // Al destruir compositor NO debe detener pistas de SourceManager
  comp.dispose();
  assert.deepEqual(stopCounts, [0, 0]);

  sm.disposeAll();
  assert.deepEqual(stopCounts, [1, 1]);
});

test('16. Fuentes desconectadas/no disponibles aplican política explícita sin romper escena ni mostrar errores privados', () => {
  const spy = createSpyBackend();
  let clock = 1000;
  const comp = new ProgramCompositor({
    surface: { width: 1920, height: 1080 },
    customBackend: spy,
    unavailableSourcePolicy: 'last-frame',
    lastFrameHoldMaxMs: 2000,
    now: () => clock,
  });

  const cam: StudioSource = {
    id: 'src_cam',
    kind: 'camera',
    name: 'Cam Privada',
    createdAt: 1,
    deviceId: 'c1',
    preferredWidth: 1280,
    preferredHeight: 720,
    preferredFps: 30,
  };
  const scene: StudioScene = {
    id: 'sc1',
    name: 'Resilience',
    backgroundColor: '#000',
    transition: { type: 'cut', durationMs: 0 },
    layers: [makeManualLayer('l1', 'src_cam')],
    audioSourceIds: [],
    createdAt: 1,
    updatedAt: 1,
  };

  // Frame 1: fuente live con videoElement válido
  comp.setSceneData(scene, [cam], [
    {
      source: cam,
      state: { sourceId: cam.id, status: 'live', intrinsicWidth: 1280, intrinsicHeight: 720, lastUpdatedAt: clock },
      details: {
        errorCode: null,
        disconnectionReason: 'none',
        disconnectedAt: null,
        trackMuted: false,
        hasVideoTrack: true,
        hasAudioTrack: false,
        effectiveSettings: null,
        capabilities: null,
        sharedAudioFromSourceId: null,
        sharedVideoFromSourceId: null,
        createdObjectUrl: null,
        consumerIds: ['program'],
        referenceCount: 1,
        hasPendingOperation: false,
      },
      resources: {
        sourceId: cam.id,
        videoElement: { videoWidth: 1280, videoHeight: 720, readyState: 4, currentTime: 1 } as unknown as HTMLVideoElement,
      },
    },
  ]);
  comp.renderFrameNow();
  assert.equal(spy.renderedPlans.at(-1)?.layers.length, 1);

  // Frame 2: desconexión repentina dentro de ventana hold (1500ms < 2000ms) -> conserva último fotograma
  clock += 1500;
  comp.syncSourcesAndRuntime([cam], [
    {
      source: cam,
      state: {
        sourceId: cam.id,
        status: 'disconnected',
        intrinsicWidth: 1280,
        intrinsicHeight: 720,
        errorMessage: 'Secreta ruta privada /dev/video',
        lastUpdatedAt: clock,
      },
      details: {
        errorCode: 'device-not-found',
        disconnectionReason: 'device-disconnected',
        disconnectedAt: clock,
        trackMuted: false,
        hasVideoTrack: false,
        hasAudioTrack: false,
        effectiveSettings: null,
        capabilities: null,
        sharedAudioFromSourceId: null,
        sharedVideoFromSourceId: null,
        createdObjectUrl: null,
        consumerIds: ['program'],
        referenceCount: 1,
        hasPendingOperation: false,
      },
      resources: { sourceId: cam.id, videoElement: null },
    },
  ]);
  comp.renderFrameNow();
  assert.equal(spy.renderedPlans.at(-1)?.layers[0].usingCachedFrame, true);
  assert.equal(comp.getDiagnostics()[0].appliedFallback, 'last-frame');

  // Frame 3: expira hold y política cambia a 'neutral-placeholder' -> sin mensaje técnico ni nombre privado
  clock += 3000;
  comp.setUnavailableSourcePolicy('neutral-placeholder');
  comp.renderFrameNow();
  const placeholderCmd = spy.renderedPlans.at(-1)?.layers[0];
  assert.equal(placeholderCmd?.unavailableFallbackMode, 'neutral-placeholder');
  assert.equal(placeholderCmd?.graphic, undefined);

  // Política 'hide' oculta limpiamente la capa
  comp.setUnavailableSourcePolicy('hide');
  comp.renderFrameNow();
  assert.equal(spy.renderedPlans.at(-1)?.layers.length, 0);
  comp.dispose();
});

test('17. Transición Cut cambia inmediatamente de escena y notifica finalización', () => {
  const spy = createSpyBackend();
  const completed: Array<[string, string]> = [];
  const comp = new ProgramCompositor({
    surface: { width: 1920, height: 1080 },
    customBackend: spy,
    onTransitionComplete: (a, b) => completed.push([a, b]),
  });

  const s1: StudioSource = { id: 's1', kind: 'color', name: 'A', createdAt: 1, color: '#111' };
  const s2: StudioSource = { id: 's2', kind: 'color', name: 'B', createdAt: 1, color: '#222' };
  const scA: StudioScene = {
    id: 'scA',
    name: 'A',
    backgroundColor: '#000',
    transition: { type: 'cut', durationMs: 0 },
    layers: [makeManualLayer('la', 's1')],
    audioSourceIds: [],
    createdAt: 1,
    updatedAt: 1,
  };
  const scB: StudioScene = {
    id: 'scB',
    name: 'B',
    backgroundColor: '#000',
    transition: { type: 'cut', durationMs: 0 },
    layers: [makeManualLayer('lb', 's2')],
    audioSourceIds: [],
    createdAt: 1,
    updatedAt: 1,
  };

  comp.setSceneData(scA, [s1, s2]);
  comp.renderFrameNow();
  comp.transitionToScene(scB);
  assert.equal(comp.getActiveTransition(), null);
  assert.deepEqual(completed, [['scA', 'scB']]);

  comp.renderFrameNow();
  assert.equal(spy.renderedPlans.at(-1)?.sceneId, 'scB');
  comp.dispose();
});

test('18. Transición Fade depende del tiempo real transcurrido y protege fuentes salientes hasta terminar', () => {
  const spy = createSpyBackend();
  let clock = 5000;
  const completed: Array<[string, string]> = [];
  const comp = new ProgramCompositor({
    surface: { width: 1920, height: 1080 },
    customBackend: spy,
    now: () => clock,
    onTransitionComplete: (a, b) => completed.push([a, b]),
  });

  const s1: StudioSource = { id: 's_out', kind: 'color', name: 'Out', createdAt: 1, color: '#111' };
  const s2: StudioSource = { id: 's_in', kind: 'color', name: 'In', createdAt: 1, color: '#222' };
  const scA: StudioScene = {
    id: 'scA',
    name: 'A',
    backgroundColor: '#000',
    transition: { type: 'fade', durationMs: 400 },
    layers: [makeManualLayer('la', 's_out')],
    audioSourceIds: [],
    createdAt: 1,
    updatedAt: 1,
  };
  const scB: StudioScene = {
    id: 'scB',
    name: 'B',
    backgroundColor: '#000',
    transition: { type: 'fade', durationMs: 400 },
    layers: [makeManualLayer('lb', 's_in')],
    audioSourceIds: [],
    createdAt: 1,
    updatedAt: 1,
  };

  comp.setSceneData(scA, [s1, s2]);
  comp.renderFrameNow();

  comp.transitionToScene(scB, { type: 'fade', durationMs: 400 });
  // Durante fade: ambas fuentes son requeridas (no liberar fuente saliente prematuramente)
  assert.deepEqual(comp.getRequiredSourceIds().sort(), ['s_in', 's_out']);

  // En t=0ms -> progreso 0.0
  comp.renderFrameNow();
  assert.equal(spy.fadeCalls.at(-1)?.alpha, 0);
  assert.equal(completed.length, 0);

  // Avance de 200ms (mitad de 400ms), independiente de cuántos fotogramas hubo antes -> 0.5
  clock += 200;
  comp.renderFrameNow();
  assert.ok(Math.abs((spy.fadeCalls.at(-1)?.alpha ?? -1) - 0.5) < 0.001);
  assert.equal(completed.length, 0);

  // Avance final a >=400ms -> progreso 1.0, transición completa y fuente saliente liberada
  clock += 250;
  comp.renderFrameNow();
  assert.equal(spy.fadeCalls.at(-1)?.alpha, 1);
  assert.equal(comp.getActiveTransition(), null);
  assert.deepEqual(comp.getRequiredSourceIds(), ['s_in']);
  assert.deepEqual(completed, [['scA', 'scB']]);

  comp.dispose();
});

test('19. Conservación de la identidad de superficie ProgramCanvas durante cambios de escena y formato', () => {
  const mock = createMock2dSurface(1920, 1080);
  const comp = new ProgramCompositor({ surface: mock.surface, preferredBackend: 'canvas2d' });
  const initialSurface = comp.getProgramSurface();

  const p1 = instantiatePresetProject('ai-tutorial-pip');
  const p2 = instantiatePresetProject('vertical-reel');

  comp.setSceneData(p1.scenes[0], p1.sources);
  comp.transitionToScene(p2.scenes[0], { type: 'cut' });
  comp.setOutputResolution(1080, 1920);

  assert.equal(comp.getProgramSurface(), initialSurface);
  assert.equal(mock.surface.width, 1080);
  assert.equal(mock.surface.height, 1920);
  comp.dispose();
});

test('20. Compatibilidad geométrica horizontal (1080p/1440p/4K), vertical (9:16) y cuadrada (1:1) con las 7 plantillas', () => {
  assert.equal(INITIAL_PROGRAM_PROFILE.width, 1920);
  assert.equal(INITIAL_PROGRAM_PROFILE.height, 1080);
  assert.equal(INITIAL_PROGRAM_PROFILE.fps, 30);

  assert.deepEqual(resolveOutputDimensions('1080p', '16:9'), STANDARD_COMPOSITION_FORMATS['1080p-horizontal']);
  assert.deepEqual(resolveOutputDimensions('4k', '16:9'), STANDARD_COMPOSITION_FORMATS['4k-horizontal']);
  assert.deepEqual(resolveOutputDimensions('1080p', '9:16'), STANDARD_COMPOSITION_FORMATS['1080p-vertical']);
  assert.deepEqual(resolveOutputDimensions('1080p', '1:1'), STANDARD_COMPOSITION_FORMATS['1080p-square']);

  const formats = Object.values(STANDARD_COMPOSITION_FORMATS);
  for (const preset of STUDIO_PRESETS) {
    const project = instantiatePresetProject(preset.id);
    for (const fmt of formats) {
      for (const scene of project.scenes) {
        for (const layer of scene.layers) {
          const geom = computeLayerRenderGeometry(layer, 1920, 1080, fmt.width, fmt.height);
          assert.ok(Number.isFinite(geom.layerBox.width) && geom.layerBox.width > 0);
          assert.ok(Number.isFinite(geom.layerBox.height) && geom.layerBox.height > 0);
          assert.ok(geom.contentLocalRect.width > 0 && geom.contentLocalRect.height > 0);
        }
      }
    }
  }
});

test('21. Ausencia total de elementos exclusivos del editor en la composición de ProgramCanvas', () => {
  const mock = createMock2dSurface(1920, 1080);
  const comp = new ProgramCompositor({ surface: mock.surface, preferredBackend: 'canvas2d' });
  const bg: StudioSource = { id: 'bg', kind: 'gradient', name: 'BG', createdAt: 1, startColor: '#111', endColor: '#222', angleDeg: 90 };

  comp.setSceneData(
    {
      id: 'sc1',
      name: 'Clean',
      backgroundColor: '#000',
      transition: { type: 'cut', durationMs: 0 },
      layers: [makeManualLayer('l1', 'bg')],
      audioSourceIds: [],
      createdAt: 1,
      updatedAt: 1,
    },
    [bg]
  );
  comp.renderFrameNow();

  // Ningún texto de teleprompter, ni guías de tercios, ni marcos de selección
  const forbiddenText = mock.calls.filter((c) => c.op === 'fillText');
  assert.equal(forbiddenText.length, 0);
  // Solo 1 rect de fondo + 1 fillRect del gradiente dentro del clip, ninguna línea extra de guía/handle
  const strokeCalls = mock.calls.filter((c) => c.op === 'stroke');
  assert.equal(strokeCalls.length, 0);
  comp.dispose();
});

test('22. Reutilización de caché de texturas WebGL2 (sin subidas redundantes) y liberación al cambiar de escena', () => {
  const glMock = createMockWebgl2Surface(1920, 1080);
  let clock = 0;
  const comp = new ProgramCompositor({
    surface: glMock.surface,
    preferredBackend: 'webgl2',
    fps: 60,
    now: () => clock,
  });
  assert.equal(comp.getBackendKind(), 'webgl2');

  const imgSrc: StudioSource = { id: 'src_logo', kind: 'image', name: 'Logo', createdAt: 1, assetRef: '/logo.png' };
  const vidSrc: StudioSource = {
    id: 'src_vid',
    kind: 'camera',
    name: 'Cam 30fps',
    createdAt: 1,
    deviceId: 'c1',
    preferredWidth: 1280,
    preferredHeight: 720,
    preferredFps: 30,
  };

  let videoTime = 0.033;
  const videoEl = {
    videoWidth: 1280,
    videoHeight: 720,
    readyState: 4,
    get currentTime() {
      return videoTime;
    },
  } as unknown as HTMLVideoElement;

  const sc1: StudioScene = {
    id: 'sc1',
    name: 'Escena 1',
    backgroundColor: '#000',
    transition: { type: 'cut', durationMs: 0 },
    layers: [
      makeManualLayer('l_cam', 'src_vid'),
      makeManualLayer('l_logo_1', 'src_logo', { width: 0.2, height: 0.2 }, {}, { zIndex: 1 }),
      // Segunda capa usando el mismo logo -> comparte textura en lugar de duplicar texImage2D
      makeManualLayer('l_logo_2', 'src_logo', { x: 0.5, width: 0.2, height: 0.2 }, {}, { zIndex: 2 }),
    ],
    audioSourceIds: [],
    createdAt: 1,
    updatedAt: 1,
  };

  comp.setSceneData(sc1, [vidSrc, imgSrc], [
    {
      source: imgSrc,
      state: { sourceId: 'src_logo', status: 'live', intrinsicWidth: 256, intrinsicHeight: 256, lastUpdatedAt: 0 },
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
        consumerIds: ['c'],
        referenceCount: 1,
        hasPendingOperation: false,
      },
      resources: {
        sourceId: 'src_logo',
        imageElement: { naturalWidth: 256, naturalHeight: 256, complete: true } as unknown as HTMLImageElement,
      },
    },
    {
      source: vidSrc,
      state: { sourceId: 'src_vid', status: 'live', intrinsicWidth: 1280, intrinsicHeight: 720, lastUpdatedAt: 0 },
      details: {
        errorCode: null,
        disconnectionReason: 'none',
        disconnectedAt: null,
        trackMuted: false,
        hasVideoTrack: true,
        hasAudioTrack: false,
        effectiveSettings: null,
        capabilities: null,
        sharedAudioFromSourceId: null,
        sharedVideoFromSourceId: null,
        createdObjectUrl: null,
        consumerIds: ['c'],
        referenceCount: 1,
        hasPendingOperation: false,
      },
      resources: { sourceId: 'src_vid', videoElement: videoEl },
    },
  ]);

  // Tick 1: sube 1 vez textura de cam y 1 vez textura de logo (2 subidas para 3 capas)
  comp.renderFrameNow();
  assert.equal(comp.getStats().textureUploadsCount, 2);
  assert.equal(comp.getStats().cachedTexturesCount, 2);

  // Tick 2 (sin nuevo fotograma de vídeo): 0 nuevas subidas GPU!
  clock += 20;
  comp.renderFrameNow();
  assert.equal(comp.getStats().textureUploadsCount, 2);

  // Tick 3 (nuevo fotograma de vídeo): solo sube la textura de vídeo (+1)
  videoTime += 0.033;
  clock += 20;
  comp.renderFrameNow();
  assert.equal(comp.getStats().textureUploadsCount, 3);

  // Cambiar por Cut a escena sin esas fuentes libera sus texturas WebGL
  const emptyScene: StudioScene = {
    id: 'sc_empty',
    name: 'Vacía',
    backgroundColor: '#000',
    transition: { type: 'cut', durationMs: 0 },
    layers: [],
    audioSourceIds: [],
    createdAt: 1,
    updatedAt: 1,
  };
  comp.transitionToScene(emptyScene, { type: 'cut' });
  assert.equal(glMock.deletedTextures.length, 2);
  assert.equal(comp.getStats().cachedTexturesCount, 0);

  comp.dispose();
});

test('23. Ausencia de bucles de renderizado duplicados y respeto de FPS objetivo (24/25/30/60)', () => {
  let reqCount = 0;
  let cancelCount = 0;
  const scheduled: { cb: ((ts: number) => void) | null } = { cb: null };
  const scheduler: FrameSchedulerAdapter = {
    requestFrame(cb) {
      reqCount += 1;
      scheduled.cb = cb;
      return reqCount;
    },
    cancelFrame() {
      cancelCount += 1;
      scheduled.cb = null;
    },
  };

  let clock = 1000;
  const spy = createSpyBackend();
  const comp = new ProgramCompositor({
    surface: { width: 1920, height: 1080 },
    customBackend: spy,
    scheduler,
    fps: 30,
    now: () => clock,
  });

  comp.setSceneData(
    {
      id: 'sc1',
      name: 'FPS',
      backgroundColor: '#000',
      transition: { type: 'cut', durationMs: 0 },
      layers: [],
      audioSourceIds: [],
      createdAt: 1,
      updatedAt: 1,
    },
    []
  );

  assert.equal(comp.start(), true);
  assert.equal(comp.start(), false, 'No debe iniciar un segundo bucle simultáneo');
  assert.equal(reqCount, 1);

  // Ejecutar primer tick
  scheduled.cb?.(clock);
  assert.equal(comp.getStats().renderedFrames, 1);

  // Tick demasiado pronto (+10ms < 33.3ms para 30fps) -> omitido
  clock += 10;
  scheduled.cb?.(clock);
  assert.equal(comp.getStats().renderedFrames, 1);
  assert.equal(comp.getStats().droppedOrSkippedTicks, 1);

  // Tick cumplido (+25ms, total +35ms) -> renderiza frame 2
  clock += 25;
  scheduled.cb?.(clock);
  assert.equal(comp.getStats().renderedFrames, 2);

  comp.stop();
  assert.equal(cancelCount, 1);
  assert.equal(comp.isLoopRunning(), false);
  comp.dispose();
});

test('24. Gestión y recuperación ante pérdida del contexto gráfico WebGL2 (webglcontextlost / restored)', () => {
  const glMock = createMockWebgl2Surface(1920, 1080);
  const lostEvents: boolean[] = [];

  const comp = new ProgramCompositor({
    surface: glMock.surface,
    preferredBackend: 'webgl2',
    onContextLostChange: (lost) => lostEvents.push(lost),
  });

  const imgSrc: StudioSource = { id: 'src_img', kind: 'image', name: 'Slide', createdAt: 1, assetRef: '/slide.png' };
  comp.setSceneData(
    {
      id: 'sc1',
      name: 'GL',
      backgroundColor: '#000',
      transition: { type: 'cut', durationMs: 0 },
      layers: [makeManualLayer('l1', 'src_img')],
      audioSourceIds: [],
      createdAt: 1,
      updatedAt: 1,
    },
    [imgSrc],
    [
      {
        source: imgSrc,
        state: { sourceId: 'src_img', status: 'live', intrinsicWidth: 1920, intrinsicHeight: 1080, lastUpdatedAt: 0 },
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
          consumerIds: ['c'],
          referenceCount: 1,
          hasPendingOperation: false,
        },
        resources: {
          sourceId: 'src_img',
          imageElement: { naturalWidth: 1920, naturalHeight: 1080, complete: true } as unknown as HTMLImageElement,
        },
      },
    ]
  );

  comp.renderFrameNow();
  const drawsBeforeLoss = glMock.drawCalls.length;
  assert.equal(comp.getStats().cachedTexturesCount, 1);

  // Simular pérdida de contexto GPU -> debe llamar preventDefault() y pausar draws sin lanzar excepción
  const prevented = glMock.emitSurfaceEvent('webglcontextlost');
  assert.equal(prevented, true);
  assert.equal(comp.getStats().contextLost, true);
  comp.renderFrameNow();
  assert.equal(glMock.drawCalls.length, drawsBeforeLoss, 'No debe invocar drawArrays con contexto perdido');

  // Restaurar contexto -> invalida caché vieja y vuelve a subir textura + renderizar normalmente
  glMock.emitSurfaceEvent('webglcontextrestored');
  assert.equal(comp.getStats().contextLost, false);
  assert.equal(comp.getStats().cachedTexturesCount, 0);
  comp.renderFrameNow();
  assert.equal(comp.getStats().cachedTexturesCount, 1);
  assert.ok(glMock.drawCalls.length > drawsBeforeLoss);
  assert.deepEqual(lostEvents, [true, false]);

  comp.dispose();
  assert.equal(glMock.listeners.get('webglcontextlost')?.size ?? 0, 0);
});

test('CP-P02-B [1]: Encuadre sin distorsión (cover/contain + contentZoom + pan X/Y) y borderEnabled=false', () => {
  const layer = createFakeLayer({
    transform: {
      x: 0.1,
      y: 0.1,
      width: 0.25,
      height: 0.5,
      anchorX: 0,
      anchorY: 0,
      rotationDeg: 0,
      flipH: false,
      flipV: false,
      fitMode: 'cover',
      contentZoom: 2,
      contentOffsetX: 0.5,
      contentOffsetY: -0.5,
      crop: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    style: {
      opacity: 0.85,
      blendMode: 'normal',
      borderRadiusPx: 24,
      borderEnabled: false,
      borderWidthPx: 8,
      borderColor: '#FF0000',
      shadowColor: '#000000',
      shadowOpacity: 0.4,
      shadowBlurPx: 20,
      featherPx: 18,
      maskShape: 'squircle',
    },
  });

  // Cámara 16:9 (1920x1080) dentro de contenedor vertical (480x540 en lienzo 1920x1080)
  const geoCover = computeLayerRenderGeometry(layer, 1920, 1080, 1920, 1080);
  assert.equal(geoCover.borderWidthPx, 0, 'borderEnabled=false debe anular el grosor efectivo');
  assert.equal(geoCover.featherPx, 18);
  // Con contentZoom = 2 en cover, el rectángulo fuente visible se reduce a la mitad sin deformar relación de aspecto
  assert.ok(geoCover.sourceRect.sw < 1920 * 0.5 && geoCover.sourceRect.sh <= 540 + 1e-4);
  const dstAspect = geoCover.layerBox.width / geoCover.layerBox.height;
  const srcAspect = geoCover.sourceRect.sw / geoCover.sourceRect.sh;
  assert.ok(Math.abs(dstAspect - srcAspect) < 1e-3, 'cover no debe distorsionar la relación de aspecto');
  assert.ok(
    geoCover.sourceRect.sx >= 0 && geoCover.sourceRect.sx + geoCover.sourceRect.sw <= 1920 + 1e-4
  );
  assert.ok(
    geoCover.sourceRect.sy >= 0 && geoCover.sourceRect.sy + geoCover.sourceRect.sh <= 1080 + 1e-4
  );

  // Modo contain mantiene relación 16:9 en contentLocalRect dentro de caja cuadrada/vertical
  const containLayer = createFakeLayer({
    transform: { ...layer.transform, fitMode: 'contain', contentZoom: 1, contentOffsetX: 0, contentOffsetY: 0 },
  });
  const geoContain = computeLayerRenderGeometry(containLayer, 1920, 1080, 1920, 1080);
  assert.ok(
    Math.abs(geoContain.contentLocalRect.width / geoContain.contentLocalRect.height - 16 / 9) < 1e-3
  );
});

test('CP-P02-B [2]: Difuminado perimetral real sin halos negros ni blancos en todas las formas e independiente de opacidad', () => {
  // 1. Todas las 6 formas generan distancia negativa en interior y >=0 fuera
  const shapes: Array<'rect' | 'square' | 'rounded' | 'squircle' | 'circle' | 'ellipse'> = [
    'rect',
    'square',
    'rounded',
    'squircle',
    'circle',
    'ellipse',
  ];

  for (const shape of shapes) {
    const centerSd = computeSignedMaskDistancePx(100, 70, 200, 140, shape, 24);
    const edgeX = shape === 'circle' || shape === 'square' ? 170 : 200;
    const edgeSd = computeSignedMaskDistancePx(edgeX, 70, 200, 140, shape, 24);
    assert.ok(centerSd < -20, `Centro de ${shape} debe ser interior (${centerSd})`);
    assert.ok(edgeSd >= -1, `Borde de ${shape} debe estar en el límite (${edgeSd})`);

    // Validar que traceMaskPathOn2dContext funciona sin lanzar errores para las 6 formas
    const mock2d = createMock2dSurface(200, 140);
    traceMaskPathOn2dContext(mock2d.ctx as unknown as CanvasRenderingContext2D, 200, 140, shape, 24);
    if (shape === 'ellipse') {
      assert.ok(mock2d.calls.some((c) => c.op === 'ellipse'));
    }
  }

  // 2. Curva Hermite del difuminado: 0 fuera, entre 0 y 1 dentro del perímetro, 1 en el núcleo interior
  assert.equal(computeNormalizedFeatherAlpha(1, 20), 0);
  const midAlpha = computeNormalizedFeatherAlpha(-10, 20);
  assert.ok(midAlpha > 0.45 && midAlpha < 0.55);
  assert.equal(computeNormalizedFeatherAlpha(-25, 20), 1);

  // 3. Prueba en búfer RGBA recto sobre fondo azul (0, 120, 255): sin halos negros ni blancos y sin multiplicar RGB
  const width = 40;
  const height = 40;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 240;
    rgba[i * 4 + 1] = 200;
    rgba[i * 4 + 2] = 160;
    rgba[i * 4 + 3] = 200; // sujeto semitransparente (compatible con futuro CP-P02-C)
  }

  applyPerimeterFeatherToRgbaBuffer(rgba, width, height, 'circle', 0, 10);

  // Centro conserva alpha=200 y RGB intacto
  const centerIdx = (20 * width + 20) * 4;
  assert.equal(rgba[centerIdx + 3], 200);
  assert.equal(rgba[centerIdx], 240);

  // Esquina exterior queda transparente (alpha=0) y conserva canales RGB rectos (sin ennegrecer/blanquear)
  const cornerIdx = 0;
  assert.equal(rgba[cornerIdx + 3], 0);
  assert.equal(rgba[cornerIdx], 240);

  // Zona intermedia del difuminado: al componer en alfa recto sobre fondo azul (0,120,255),
  // todos los canales resultantes quedan estrictamente acotados entre fondo y sujeto (zero black/white halo)
  const borderSampleIdx = (20 * width + 3) * 4;
  const aNorm = rgba[borderSampleIdx + 3]! / 255;
  assert.ok(aNorm > 0 && aNorm < 200 / 255);
  const out = compositeStraightAlphaPixel(
    [0, 120, 255, 255],
    [
      rgba[borderSampleIdx]!,
      rgba[borderSampleIdx + 1]!,
      rgba[borderSampleIdx + 2]!,
      rgba[borderSampleIdx + 3]!,
    ]
  );
  assert.ok(out[0] >= 0 && out[0] <= 240);
  assert.ok(out[1] >= 120 && out[1] <= 200);
  assert.ok(out[2] >= 160 && out[2] <= 255);
});

test('CP-P02-B [3]: Backend WebGL2 ejecuta sombra real + 6 formas + difuminado perimetral sin borde obligatorio y listo para alfa transparente', () => {
  const glMock = createMockWebgl2Surface(1920, 1080);
  const comp = new ProgramCompositor({ surface: glMock.surface, preferredBackend: 'webgl2' });
  const camSrc: StudioSource = {
    id: 'src_cam',
    kind: 'camera',
    name: 'Cámara',
    createdAt: 1,
    deviceId: 'c1',
    preferredWidth: 1920,
    preferredHeight: 1080,
    preferredFps: 30,
  };

  const layer = createFakeLayer({
    id: 'cam_layer',
    sourceId: 'src_cam',
    transform: {
      x: 0.2,
      y: 0.15,
      width: 0.4,
      height: 0.4,
      anchorX: 0,
      anchorY: 0,
      rotationDeg: 0,
      flipH: false,
      flipV: false,
      fitMode: 'cover',
      contentZoom: 1.5,
      contentOffsetX: 0.25,
      contentOffsetY: -0.25,
      crop: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    style: {
      opacity: 0.7,
      blendMode: 'normal',
      borderRadiusPx: 32,
      borderEnabled: false,
      borderWidthPx: 6,
      borderColor: '#FFFFFF',
      shadowColor: '#0F172A',
      shadowOpacity: 0.6,
      shadowBlurPx: 28,
      featherPx: 24,
      maskShape: 'ellipse',
    },
  });

  comp.setSceneData(
    {
      id: 'sc1',
      name: 'Styled Cam',
      backgroundColor: '#000',
      transition: { type: 'cut', durationMs: 0 },
      layers: [layer],
      audioSourceIds: [],
      createdAt: 1,
      updatedAt: 1,
    },
    [camSrc],
    [
      {
        source: camSrc,
        state: { sourceId: 'src_cam', status: 'live', intrinsicWidth: 1920, intrinsicHeight: 1080, lastUpdatedAt: 0 },
        details: {
          errorCode: null,
          disconnectionReason: 'none',
          disconnectedAt: null,
          trackMuted: false,
          hasVideoTrack: true,
          hasAudioTrack: false,
          effectiveSettings: null,
          capabilities: null,
          sharedAudioFromSourceId: null,
          sharedVideoFromSourceId: null,
          createdObjectUrl: null,
          consumerIds: ['c'],
          referenceCount: 1,
          hasPendingOperation: false,
        },
        resources: {
          sourceId: 'src_cam',
          videoElement: { videoWidth: 1920, videoHeight: 1080, readyState: 4, currentTime: 1 } as unknown as HTMLVideoElement,
        },
      },
    ]
  );

  comp.renderFrameNow();

  // Debe emitir pasada de sombra (u_renderPass=1) y pasada principal (u_renderPass=0) con shape=5 (ellipse), borderWidth=0, featherPx=24
  assert.ok(glMock.uniformCalls.some((u) => u.name === 'u_renderPass' && u.values[0] === 1));
  assert.ok(glMock.uniformCalls.some((u) => u.name === 'u_renderPass' && u.values[0] === 0));
  assert.ok(glMock.uniformCalls.some((u) => u.name === 'u_maskShape' && u.values[0] === 5));
  assert.ok(glMock.uniformCalls.some((u) => u.name === 'u_borderWidthPx' && u.values[0] === 0));
  assert.ok(glMock.uniformCalls.some((u) => u.name === 'u_featherPx' && u.values[0] === 24));
  assert.ok(glMock.uniformCalls.some((u) => u.name === 'u_opacity' && Math.abs(Number(u.values[0]) - 0.7) < 1e-4));

  comp.dispose();
});

test('CP-P02-C1 [1]: Encuadre completo de ventana/pantalla con recorte independiente por bordes (crop) y adaptación dinámica de tamaño', () => {
  // Ventana de 2000x1000 con recorte superior (barra navegador 10%), inferior 5%, izquierdo 10%, derecho 20%
  // Área útil restante: sx=200, sy=100, sw=1400, sh=850
  const croppedWindowLayer = createFakeLayer({
    id: 'win_layer',
    sourceId: 'src_win',
    transform: {
      x: 0.1,
      y: 0.1,
      width: 0.7,
      height: 0.7,
      anchorX: 0,
      anchorY: 0,
      rotationDeg: 0,
      flipH: false,
      flipV: false,
      fitMode: 'contain',
      contentZoom: 1,
      contentOffsetX: 0,
      contentOffsetY: 0,
      crop: { top: 0.1, right: 0.2, bottom: 0.05, left: 0.1 },
    },
  });

  const geoContain = computeLayerRenderGeometry(croppedWindowLayer, 2000, 1000, 1920, 1080);
  assert.ok(Math.abs(geoContain.sourceRect.sx - 200) < 1e-4);
  assert.ok(Math.abs(geoContain.sourceRect.sy - 100) < 1e-4);
  assert.ok(Math.abs(geoContain.sourceRect.sw - 1400) < 1e-4);
  assert.ok(Math.abs(geoContain.sourceRect.sh - 850) < 1e-4);
  // Sin distorsión en contain: contentLocalRect respeta exactamente 1400/850
  assert.ok(
    Math.abs(
      geoContain.contentLocalRect.width / geoContain.contentLocalRect.height - 1400 / 850
    ) < 1e-3
  );

  // Combinar recorte de bordes + zoom interno 2x y desplazamiento en cover
  const zoomedCroppedLayer = createFakeLayer({
    transform: {
      ...croppedWindowLayer.transform,
      fitMode: 'cover',
      contentZoom: 2,
      contentOffsetX: 0.5,
      contentOffsetY: -0.5,
    },
  });
  const geoZoom = computeLayerRenderGeometry(zoomedCroppedLayer, 2000, 1000, 1920, 1080);
  // El rectángulo fuente debe permanecer estrictamente dentro de la zona recortada [200..1600, 100..950]
  assert.ok(geoZoom.sourceRect.sx >= 200 - 1e-4);
  assert.ok(geoZoom.sourceRect.sy >= 100 - 1e-4);
  assert.ok(geoZoom.sourceRect.sx + geoZoom.sourceRect.sw <= 1600 + 1e-4);
  assert.ok(geoZoom.sourceRect.sy + geoZoom.sourceRect.sh <= 950 + 1e-4);
  assert.ok(
    Math.abs(
      geoZoom.sourceRect.sw / geoZoom.sourceRect.sh -
        geoZoom.layerBox.width / geoZoom.layerBox.height
    ) < 1e-3
  );

  // Adaptación dinámica de resolución de ventana en vivo desde ProgramCompositor sin reiniciar pista
  const glMock = createMockWebgl2Surface(1920, 1080);
  const comp = new ProgramCompositor({ surface: glMock.surface, preferredBackend: 'webgl2' });
  const winSrc: StudioSource = {
    id: 'src_win',
    kind: 'window',
    name: 'Navegador',
    createdAt: 1,
    includeSystemAudio: false,
  };
  const fakeWindowVideo = {
    videoWidth: 1600,
    videoHeight: 900,
    readyState: 4,
    currentTime: 1,
  } as unknown as HTMLVideoElement;

  const winScene: StudioScene = {
    id: 'sc_win',
    name: 'Ventana',
    backgroundColor: '#000',
    transition: { type: 'cut', durationMs: 0 },
    layers: [croppedWindowLayer],
    audioSourceIds: [],
    createdAt: 1,
    updatedAt: 1,
  };

  comp.setSceneData(winScene, [winSrc], [
    {
      source: winSrc,
      state: { sourceId: 'src_win', status: 'live', intrinsicWidth: 1600, intrinsicHeight: 900, lastUpdatedAt: 0 },
      details: {
        errorCode: null,
        disconnectionReason: 'none',
        disconnectedAt: null,
        trackMuted: false,
        hasVideoTrack: true,
        hasAudioTrack: false,
        effectiveSettings: null,
        capabilities: null,
        sharedAudioFromSourceId: null,
        sharedVideoFromSourceId: null,
        createdObjectUrl: null,
        consumerIds: ['c'],
        referenceCount: 1,
        hasPendingOperation: false,
      },
      resources: { sourceId: 'src_win', videoElement: fakeWindowVideo },
    },
  ]);

  const plan1 = comp.buildSceneRenderPlan(winScene);
  assert.equal(plan1.diagnostics[0]?.intrinsicWidth, 1600);
  assert.equal(plan1.diagnostics[0]?.intrinsicHeight, 900);

  // Redimensión dinámica de la ventana compartida (ej. usuario cambia ventana a vertical 900x1200)
  (fakeWindowVideo as unknown as { videoWidth: number; videoHeight: number }).videoWidth = 900;
  (fakeWindowVideo as unknown as { videoWidth: number; videoHeight: number }).videoHeight = 1200;
  const plan2 = comp.buildSceneRenderPlan(winScene);
  assert.equal(plan2.diagnostics[0]?.intrinsicWidth, 900);
  assert.equal(plan2.diagnostics[0]?.intrinsicHeight, 1200);
  const ratioAfter =
    plan2.layers[0]!.geometry.contentLocalRect.width /
    plan2.layers[0]!.geometry.contentLocalRect.height;
  // Con crop horizontal 30% (sw=630) y vertical 15% (sh=1020) => 630/1020 ≈ 0.6176
  assert.ok(Math.abs(ratioAfter - 630 / 1020) < 1e-3);

  comp.dispose();
});

test('CP-P02-C1 [2]: Formas, borde opcional, sombra, opacidad y difuminado en capa screen/window por WebGL2 sin filtros de cámara', () => {
  const glMock = createMockWebgl2Surface(1920, 1080);
  const comp = new ProgramCompositor({ surface: glMock.surface, preferredBackend: 'webgl2' });
  const screenSrc: StudioSource = {
    id: 'src_screen',
    kind: 'screen',
    name: 'Pantalla Retina',
    createdAt: 1,
    includeSystemAudio: false,
  };
  const screenLayer = createFakeLayer({
    id: 'screen_layer',
    sourceId: 'src_screen',
    transform: {
      x: 0.05,
      y: 0.08,
      width: 0.9,
      height: 0.84,
      anchorX: 0,
      anchorY: 0,
      rotationDeg: 0,
      flipH: false,
      flipV: false,
      fitMode: 'contain',
      contentZoom: 1,
      contentOffsetX: 0,
      contentOffsetY: 0,
      crop: { top: 0.05, right: 0, bottom: 0.05, left: 0 },
    },
    style: {
      opacity: 0.92,
      blendMode: 'normal',
      maskShape: 'squircle',
      borderRadiusPx: 28,
      borderEnabled: true,
      borderWidthPx: 4,
      borderColor: '#0A84FF',
      shadowBlurPx: 30,
      shadowOpacity: 0.5,
      shadowColor: '#000000',
      featherPx: 14,
    },
  });

  comp.setSceneData(
    {
      id: 'sc_screen',
      name: 'Screen Styled',
      backgroundColor: '#000',
      transition: { type: 'cut', durationMs: 0 },
      layers: [screenLayer],
      audioSourceIds: [],
      createdAt: 1,
      updatedAt: 1,
    },
    [screenSrc],
    [
      {
        source: screenSrc,
        state: { sourceId: 'src_screen', status: 'live', intrinsicWidth: 2560, intrinsicHeight: 1600, lastUpdatedAt: 0 },
        details: {
          errorCode: null,
          disconnectionReason: 'none',
          disconnectedAt: null,
          trackMuted: false,
          hasVideoTrack: true,
          hasAudioTrack: false,
          effectiveSettings: null,
          capabilities: null,
          sharedAudioFromSourceId: null,
          sharedVideoFromSourceId: null,
          createdObjectUrl: null,
          consumerIds: ['c'],
          referenceCount: 1,
          hasPendingOperation: false,
        },
        resources: {
          sourceId: 'src_screen',
          videoElement: { videoWidth: 2560, videoHeight: 1600, readyState: 4, currentTime: 1 } as unknown as HTMLVideoElement,
        },
      },
    ]
  );

  comp.renderFrameNow();
  assert.ok(glMock.uniformCalls.some((u) => u.name === 'u_maskShape' && u.values[0] === 3)); // squircle
  assert.ok(glMock.uniformCalls.some((u) => u.name === 'u_borderWidthPx' && u.values[0] === 4));
  assert.ok(glMock.uniformCalls.some((u) => u.name === 'u_featherPx' && u.values[0] === 14));
  assert.ok(glMock.uniformCalls.some((u) => u.name === 'u_opacity' && Math.abs(Number(u.values[0]) - 0.92) < 1e-4));

  comp.dispose();
});

test('CP-P02-C3-R2: WebGL2 configura UNPACK_PREMULTIPLY_ALPHA_WEBGL y descontaminación por GPU solo para recorte transparente premultiplicado', () => {
  const glMock = createMockWebgl2Surface(1920, 1080);
  const comp = new ProgramCompositor({ surface: glMock.surface, preferredBackend: 'webgl2' });
  const camSrc: StudioSource = {
    id: 'src_cam_cutout',
    kind: 'camera',
    name: 'Cámara Presentador',
    createdAt: 1,
    deviceId: 'cam-1',
    preferredWidth: 1920,
    preferredHeight: 1080,
    preferredFps: 30,
  };
  const camLayer = createFakeLayer({
    id: 'layer_cam_cutout',
    sourceId: 'src_cam_cutout',
  });
  const scene: StudioScene = {
    id: 'sc_cutout',
    name: 'Cutout',
    backgroundColor: '#123456',
    transition: { type: 'cut', durationMs: 0 },
    layers: [camLayer],
    audioSourceIds: [],
    createdAt: 1,
    updatedAt: 1,
  };

  comp.setSceneData(scene, [camSrc], [
    {
      source: camSrc,
      state: { sourceId: 'src_cam_cutout', status: 'live', intrinsicWidth: 1280, intrinsicHeight: 720, lastUpdatedAt: 0 },
      details: {
        errorCode: null,
        disconnectionReason: 'none',
        disconnectedAt: null,
        trackMuted: false,
        hasVideoTrack: true,
        hasAudioTrack: false,
        effectiveSettings: null,
        capabilities: null,
        sharedAudioFromSourceId: null,
        sharedVideoFromSourceId: null,
        createdObjectUrl: null,
        consumerIds: ['c'],
        referenceCount: 1,
        hasPendingOperation: false,
      },
      resources: {
        sourceId: 'src_cam_cutout',
        videoElement: { videoWidth: 1280, videoHeight: 720, readyState: 4, currentTime: 1 } as unknown as HTMLVideoElement,
      },
    },
  ]);

  const fakeCanvas = { width: 1280, height: 720 } as unknown as HTMLCanvasElement;

  // 1. Subida straight-alpha sin recorte transparente: UNPACK_PREMULTIPLY_ALPHA_WEBGL=0, u_alphaMode=0, u_hasTransparentAlpha=0
  comp.setProcessedLayerSurface('src_cam_cutout', {
    surface: fakeCanvas,
    width: 1280,
    height: 720,
    alphaMode: 'straight',
    frameVersion: 1,
    hasTransparentSubject: false,
  });
  comp.renderFrameNow();

  assert.ok(
    glMock.pixelStoreiCalls.some(
      (c) => c.pname === glMock.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL && c.param === 0
    )
  );
  assert.ok(glMock.uniformCalls.some((u) => u.name === 'u_alphaMode' && u.values[0] === 0));
  assert.ok(glMock.uniformCalls.some((u) => u.name === 'u_hasTransparentAlpha' && u.values[0] === 0));

  // 2. Subida premultiplied con hasTransparentSubject=true: UNPACK_PREMULTIPLY_ALPHA_WEBGL=1, u_alphaMode=1, u_hasTransparentAlpha=1
  glMock.pixelStoreiCalls.length = 0;
  glMock.uniformCalls.length = 0;
  comp.setProcessedLayerSurface('src_cam_cutout', {
    surface: fakeCanvas,
    width: 1280,
    height: 720,
    alphaMode: 'premultiplied',
    frameVersion: 2,
    hasTransparentSubject: true,
  });
  comp.renderFrameNow();

  assert.ok(
    glMock.pixelStoreiCalls.some(
      (c) => c.pname === glMock.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL && c.param === 1
    )
  );
  assert.ok(glMock.uniformCalls.some((u) => u.name === 'u_alphaMode' && u.values[0] === 1));
  assert.ok(glMock.uniformCalls.some((u) => u.name === 'u_hasTransparentAlpha' && u.values[0] === 1));

  // Verificar que el fragment shader protege straight-alpha y solo aplica descontaminación en modo premultiplied transparente
  const frag = glMock.shaderSources.find((s) => s.includes('u_hasTransparentAlpha')) ?? '';
  assert.ok(frag.includes('u_hasTransparentAlpha == 1 && u_alphaMode == 1'));

  comp.dispose();
});
