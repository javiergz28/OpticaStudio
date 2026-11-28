import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampCameraTransformForScene,
  computeAdaptableSceneLayout,
  computeCameraAspectTransform,
  computeKeyboardNudgeTransform,
  computeLayerAspectTransform,
  computeLayerCornerResizeTransform,
  computeLayerDragTransform,
  computeProportionalCameraTransform,
  computeQuickPlacementTransform,
  computeScaledCameraWidthTransform,
  computeScaledLayerWidthTransform,
  EDITOR_SAFE_MARGIN,
  findPrimaryDisplayLayer,
  findPrimaryVisualLayer,
  getCameraOverlayConstraints,
  getLayerNormalizedRect,
  hasVisibleDisplayOverlayInScene,
  hitTestSceneLayerAtPoint,
  isVisualSourceEditable,
  resolveTargetEditableLayer,
} from '../src/engine/layerEditor';
import { instantiatePresetProject } from '../src/engine/scenePresets';
import { createStarterStudioProject } from '../src/engine/studioCoordinator';
import type { SceneLayer, StudioScene, StudioSource } from '../src/types/studio';

function buildTestScenes(): {
  project: ReturnType<typeof createStarterStudioProject>;
  pipScene: StudioScene;
  camOnlyScene: StudioScene;
  reelProject: ReturnType<typeof instantiatePresetProject>;
  reelScene: StudioScene;
  sources: StudioSource[];
  pipCamLayer: SceneLayer;
  camOnlyLayer: SceneLayer;
} {
  const project = createStarterStudioProject('1080p', '16:9');
  const pipScene = project.scenes.find((s) => s.presetId === 'ai-tutorial-pip')!;
  const camOnlyScene = project.scenes.find((s) => s.presetId === 'camera-primary')!;
  const reelProject = instantiatePresetProject('vertical-reel');
  const reelScene = reelProject.scenes[0]!;
  const camSourceIds = new Set(
    project.sources.filter((s) => s.kind === 'camera').map((s) => s.id)
  );
  const pipCamLayer = pipScene.layers.find((l) => camSourceIds.has(l.sourceId))!;
  const camOnlyLayer = camOnlyScene.layers.find((l) => camSourceIds.has(l.sourceId))!;
  return {
    project,
    pipScene,
    camOnlyScene,
    reelProject,
    reelScene,
    sources: project.sources,
    pipCamLayer,
    camOnlyLayer,
  };
}

test('CP-P02-A [1]: hitTestSceneLayerAtPoint selecciona capa de cámara respetando zIndex y visibilidad', () => {
  const { pipScene, sources, pipCamLayer } = buildTestScenes();
  const rect = getLayerNormalizedRect(pipCamLayer.transform);
  const centerX = rect.left + rect.width * 0.5;
  const centerY = rect.top + rect.height * 0.5;

  const hit = hitTestSceneLayerAtPoint(pipScene, sources, centerX, centerY, {
    onlyKind: 'camera',
  });
  assert.equal(hit?.id, pipCamLayer.id);

  // Fuera del rectángulo de cámara devuelve null cuando filtramos por cámara
  const miss = hitTestSceneLayerAtPoint(pipScene, sources, 0.05, 0.05, {
    onlyKind: 'camera',
  });
  assert.equal(miss, null);

  // Si la capa está oculta no debe capturarse
  const hiddenScene: StudioScene = {
    ...pipScene,
    layers: pipScene.layers.map((l) =>
      l.id === pipCamLayer.id ? { ...l, visible: false } : l
    ),
  };
  assert.equal(
    hitTestSceneLayerAtPoint(hiddenScene, sources, centerX, centerY, {
      onlyKind: 'camera',
    }),
    null
  );
});

test('CP-P02-A [2]: computeLayerDragTransform restringe al lienzo [0,1] y conserva proporción', () => {
  const { pipScene, sources, pipCamLayer } = buildTestScenes();
  const startRect = getLayerNormalizedRect(pipCamLayer.transform);
  const startRatio = startRect.height / startRect.width;

  // Arrastrar fuera por arriba/izquierda
  const topLeftClamped = computeLayerDragTransform(
    pipCamLayer.transform,
    -2,
    -2,
    { scene: pipScene, layer: pipCamLayer, sources, enableSnap: false }
  );
  const tlRect = getLayerNormalizedRect(topLeftClamped.transform);
  assert.equal(tlRect.left, 0);
  assert.equal(tlRect.top, 0);
  assert.ok(Math.abs(tlRect.height / tlRect.width - startRatio) < 1e-4);

  // Arrastrar fuera por abajo/derecha
  const bottomRightClamped = computeLayerDragTransform(
    pipCamLayer.transform,
    2,
    2,
    { scene: pipScene, layer: pipCamLayer, sources, enableSnap: false }
  );
  const brRect = getLayerNormalizedRect(bottomRightClamped.transform);
  assert.ok(Math.abs(brRect.left + brRect.width - 1) < 1e-4);
  assert.ok(Math.abs(brRect.top + brRect.height - 1) < 1e-4);
  assert.ok(Math.abs(brRect.height / brRect.width - startRatio) < 1e-4);
});

test('CP-P02-A [3]: Guías y ajuste magnético (bordes, márgenes y centro) + desactivación con enableSnap=false', () => {
  const { pipScene, sources, pipCamLayer } = buildTestScenes();
  const startRect = getLayerNormalizedRect(pipCamLayer.transform);

  // Mover al centro exacto (con pequeña desviación dentro del umbral)
  const deltaToCenterX = 0.5 - startRect.width * 0.5 - startRect.left + 0.005;
  const deltaToCenterY = 0.5 - startRect.height * 0.5 - startRect.top - 0.004;
  const snappedCenter = computeLayerDragTransform(
    pipCamLayer.transform,
    deltaToCenterX,
    deltaToCenterY,
    { scene: pipScene, layer: pipCamLayer, sources, enableSnap: true }
  );
  const cRect = getLayerNormalizedRect(snappedCenter.transform);
  assert.ok(Math.abs(cRect.left + cRect.width * 0.5 - 0.5) < 1e-4);
  assert.ok(Math.abs(cRect.top + cRect.height * 0.5 - 0.5) < 1e-4);
  assert.ok(snappedCenter.activeGuides.some((g) => g.axis === 'x' && g.kind === 'center'));
  assert.ok(snappedCenter.activeGuides.some((g) => g.axis === 'y' && g.kind === 'center'));

  // Desactivar snap (Alt pulsado) evita imantar y no emite guías
  const freeDrag = computeLayerDragTransform(
    pipCamLayer.transform,
    deltaToCenterX,
    deltaToCenterY,
    { scene: pipScene, layer: pipCamLayer, sources, enableSnap: false }
  );
  assert.equal(freeDrag.activeGuides.length, 0);
  const fRect = getLayerNormalizedRect(freeDrag.transform);
  assert.ok(Math.abs(fRect.left + fRect.width * 0.5 - 0.505) < 1e-4);

  // Ajuste a margen seguro superior-izquierdo (0.03)
  const snappedMargin = computeLayerDragTransform(
    pipCamLayer.transform,
    EDITOR_SAFE_MARGIN - startRect.left + 0.003,
    EDITOR_SAFE_MARGIN - startRect.top - 0.003,
    { scene: pipScene, layer: pipCamLayer, sources, enableSnap: true }
  );
  const mRect = getLayerNormalizedRect(snappedMargin.transform);
  assert.ok(Math.abs(mRect.left - EDITOR_SAFE_MARGIN) < 1e-4);
  assert.ok(Math.abs(mRect.top - EDITOR_SAFE_MARGIN) < 1e-4);
  assert.ok(snappedMargin.activeGuides.some((g) => g.kind === 'margin'));
});

test('CP-P02-A [4]: Redimensionado por las 4 esquinas fija la esquina opuesta y preserva relación de aspecto', () => {
  const { camOnlyScene, sources, camOnlyLayer } = buildTestScenes();
  const baseTransform = {
    ...camOnlyLayer.transform,
    x: 0.25,
    y: 0.25,
    width: 0.4,
    height: 0.3,
    anchorX: 0,
    anchorY: 0,
  };
  const baseRect = getLayerNormalizedRect(baseTransform);
  const aspectK = baseRect.height / baseRect.width;

  // bottom-right fija top-left (0.25, 0.25)
  const brRes = computeLayerCornerResizeTransform(
    baseTransform,
    'bottom-right',
    0.75,
    0.75,
    { scene: camOnlyScene, layer: camOnlyLayer, sources, enableSnap: false }
  );
  const brRect = getLayerNormalizedRect(brRes.transform);
  assert.ok(Math.abs(brRect.left - 0.25) < 1e-4);
  assert.ok(Math.abs(brRect.top - 0.25) < 1e-4);
  assert.ok(Math.abs(brRect.height / brRect.width - aspectK) < 1e-4);

  // top-left fija bottom-right (0.65, 0.55)
  const tlRes = computeLayerCornerResizeTransform(
    baseTransform,
    'top-left',
    0.15,
    0.15,
    { scene: camOnlyScene, layer: camOnlyLayer, sources, enableSnap: false }
  );
  const tlRect = getLayerNormalizedRect(tlRes.transform);
  assert.ok(Math.abs(tlRect.left + tlRect.width - 0.65) < 1e-4);
  assert.ok(Math.abs(tlRect.top + tlRect.height - 0.55) < 1e-4);
  assert.ok(Math.abs(tlRect.height / tlRect.width - aspectK) < 1e-4);

  // top-right fija bottom-left (0.25, 0.55)
  const trRes = computeLayerCornerResizeTransform(
    baseTransform,
    'top-right',
    0.8,
    0.2,
    { scene: camOnlyScene, layer: camOnlyLayer, sources, enableSnap: false }
  );
  const trRect = getLayerNormalizedRect(trRes.transform);
  assert.ok(Math.abs(trRect.left - 0.25) < 1e-4);
  assert.ok(Math.abs(trRect.top + trRect.height - 0.55) < 1e-4);
  assert.ok(Math.abs(trRect.height / trRect.width - aspectK) < 1e-4);

  // bottom-left fija top-right (0.65, 0.25)
  const blRes = computeLayerCornerResizeTransform(
    baseTransform,
    'bottom-left',
    0.15,
    0.7,
    { scene: camOnlyScene, layer: camOnlyLayer, sources, enableSnap: false }
  );
  const blRect = getLayerNormalizedRect(blRes.transform);
  assert.ok(Math.abs(blRect.left + blRect.width - 0.65) < 1e-4);
  assert.ok(Math.abs(blRect.top - 0.25) < 1e-4);
  assert.ok(Math.abs(blRect.height / blRect.width - aspectK) < 1e-4);
});

test('CP-P02-A [5] / CP-P02-B: Sin límite del 50%: escalado libre hasta 100% incluso con pantalla compartida visible', () => {
  const {
    pipScene,
    camOnlyScene,
    reelProject,
    reelScene,
    sources,
    pipCamLayer,
    camOnlyLayer,
  } = buildTestScenes();

  // Escena PiP con pantalla compartida visible: ya NO restringe al 50%
  const pipConstraint = getCameraOverlayConstraints(pipScene, pipCamLayer, sources);
  assert.equal(pipConstraint.constrained, false);
  assert.equal(pipConstraint.maxWidth, 1);
  assert.equal(pipConstraint.maxArea, 1);

  // Intentar escalar a 0.90 sobre pantalla compartida -> permitido libremente sin tope del 50%
  const resized90 = computeScaledCameraWidthTransform(
    { ...pipCamLayer.transform, width: 0.25, height: 0.25 },
    0.9,
    { scene: pipScene, layer: pipCamLayer, sources }
  );
  const r90 = getLayerNormalizedRect(resized90.transform);
  assert.ok(Math.abs(r90.width - 0.9) < 1e-4);
  assert.ok(Math.abs(r90.height - 0.9) < 1e-4);
  assert.equal(resized90.constraintApplied, false);

  // Escala completa al 100% sobre pantalla compartida mediante quick placement 'full'
  const fullOverDisplay = computeQuickPlacementTransform(
    { ...pipCamLayer.transform, width: 0.3, height: 0.3 },
    'full',
    { scene: pipScene, layer: pipCamLayer, sources }
  );
  assert.equal(fullOverDisplay.transform.width, 1);
  assert.equal(fullOverDisplay.transform.height, 1);
  assert.equal(fullOverDisplay.constraintApplied, false);

  // Y la detección puramente informativa de solapamiento sobre display sigue intacta
  assert.equal(hasVisibleDisplayOverlayInScene(pipScene, sources, pipCamLayer), true);

  // En escena solo cámara (sin ventana/pantalla visible), también llega a 100%
  const camOnlyConstraint = getCameraOverlayConstraints(
    camOnlyScene,
    camOnlyLayer,
    sources
  );
  assert.equal(camOnlyConstraint.constrained, false);
  const fullCam = computeQuickPlacementTransform(
    { ...camOnlyLayer.transform, width: 0.4, height: 0.4 },
    'full',
    { scene: camOnlyScene, layer: camOnlyLayer, sources }
  );
  assert.equal(fullCam.transform.width, 1);
  assert.equal(fullCam.transform.height, 1);

  // En vertical-reel apilado sin solapamiento vs solapándose sigue reportando correctamente
  const reelCamSrcId = reelProject.sources.find((s) => s.kind === 'camera')!.id;
  const reelCamLayer = reelScene.layers.find((l) => l.sourceId === reelCamSrcId)!;
  assert.equal(
    hasVisibleDisplayOverlayInScene(reelScene, reelProject.sources, reelCamLayer),
    false
  );
  assert.equal(
    hasVisibleDisplayOverlayInScene(reelScene, reelProject.sources, reelCamLayer, {
      left: 0.1,
      top: 0.1,
      width: 0.3,
      height: 0.3,
    }),
    true
  );
});

test('CP-P02-A [6]: Bloqueo de capa (locked=true) impide arrastre, redimensionado, teclado y utilidades', () => {
  const { pipScene, sources, pipCamLayer } = buildTestScenes();
  const lockedLayer: SceneLayer = { ...pipCamLayer, locked: true };
  const orig = lockedLayer.transform;

  const dragRes = computeLayerDragTransform(orig, 0.2, 0.2, {
    scene: pipScene,
    layer: lockedLayer,
    sources,
  });
  assert.deepEqual(dragRes.transform, orig);

  const resizeRes = computeLayerCornerResizeTransform(
    orig,
    'top-left',
    0.1,
    0.1,
    { scene: pipScene, layer: lockedLayer, sources }
  );
  assert.deepEqual(resizeRes.transform, orig);

  const nudgeRes = computeKeyboardNudgeTransform(orig, 'ArrowLeft', {
    scene: pipScene,
    layer: lockedLayer,
    sources,
  });
  assert.deepEqual(nudgeRes?.transform, orig);

  const quickRes = computeQuickPlacementTransform(orig, 'top-left', {
    scene: pipScene,
    layer: lockedLayer,
    sources,
  });
  assert.deepEqual(quickRes.transform, orig);

  const propRes = computeProportionalCameraTransform(orig, {
    scene: pipScene,
    layer: lockedLayer,
    sources,
    sensorWidth: 1920,
    sensorHeight: 1080,
    outputWidth: 1080,
    outputHeight: 1920,
  });
  assert.deepEqual(propRes.transform, orig);
});

test('CP-P02-A [7]: Movimiento fino por teclado (Arrow, Shift+Arrow, Alt+Arrow) y proporción sensor', () => {
  const { pipScene, sources, pipCamLayer } = buildTestScenes();
  const start = {
    ...pipCamLayer.transform,
    x: 0.3,
    y: 0.3,
    width: 0.25,
    height: 0.25,
    anchorX: 0,
    anchorY: 0,
  };

  const stepNormal = computeKeyboardNudgeTransform(start, 'ArrowLeft', {
    scene: pipScene,
    layer: pipCamLayer,
    sources,
  });
  assert.ok(Math.abs((stepNormal?.transform.x ?? 0) - 0.29) < 1e-5);

  const stepShift = computeKeyboardNudgeTransform(start, 'ArrowUp', {
    shiftKey: true,
    scene: pipScene,
    layer: pipCamLayer,
    sources,
  });
  assert.ok(Math.abs((stepShift?.transform.y ?? 0) - 0.26) < 1e-5);

  const stepAlt = computeKeyboardNudgeTransform(start, 'ArrowRight', {
    altKey: true,
    scene: pipScene,
    layer: pipCamLayer,
    sources,
  });
  assert.ok(Math.abs((stepAlt?.transform.x ?? 0) - 0.302) < 1e-5);

  // Tecla no direccional devuelve null
  assert.equal(
    computeKeyboardNudgeTransform(start, 'KeyA', {
      scene: pipScene,
      layer: pipCamLayer,
      sources,
    }),
    null
  );

  // Proporción sensor 16:9 dentro de salida vertical 9:16 -> targetK = (9/16) / (16/9) = 81/256 ≈ 0.3164
  const propVertical = computeProportionalCameraTransform(start, {
    scene: pipScene,
    layer: pipCamLayer,
    sources,
    sensorWidth: 1920,
    sensorHeight: 1080,
    outputWidth: 1080,
    outputHeight: 1920,
  });
  const pRect = getLayerNormalizedRect(propVertical.transform);
  assert.ok(Math.abs(pRect.height / pRect.width - 81 / 256) < 1e-3);
});

test('CP-P02-B [1]: Proporción independiente de la capa de cámara (7 presets) respecto a ProgramCanvas y distinta de rotación', () => {
  const { pipScene, sources, pipCamLayer } = buildTestScenes();
  const base = { ...pipCamLayer.transform, rotationDeg: 17 };

  const expectedByPreset: Array<{
    preset: 'sensor' | '16:9' | '4:3' | '9:16' | '3:4' | '1:1' | 'custom';
    custom?: number;
    expectedRatio: number;
  }> = [
    { preset: 'sensor', expectedRatio: 16 / 9 },
    { preset: '16:9', expectedRatio: 16 / 9 },
    { preset: '4:3', expectedRatio: 4 / 3 },
    { preset: '9:16', expectedRatio: 9 / 16 },
    { preset: '3:4', expectedRatio: 3 / 4 },
    { preset: '1:1', expectedRatio: 1 },
    { preset: 'custom', custom: 2.1, expectedRatio: 2.1 },
  ];

  // Lienzo ProgramCanvas 16:9 (1920x1080)
  for (const item of expectedByPreset) {
    const res = computeCameraAspectTransform(base, {
      scene: pipScene,
      layer: pipCamLayer,
      sources,
      aspectPreset: item.preset,
      customAspectRatio: item.custom,
      sensorWidth: 1920,
      sensorHeight: 1080,
      outputWidth: 1920,
      outputHeight: 1080,
    });
    const rect = getLayerNormalizedRect(res.transform);
    const renderedPixelAspect = (rect.width * 1920) / (rect.height * 1080);
    assert.ok(
      Math.abs(renderedPixelAspect - item.expectedRatio) < 0.02,
      `Preset ${item.preset}: esperado ${item.expectedRatio}, obtenido ${renderedPixelAspect}`
    );
    assert.equal(res.transform.aspectPreset, item.preset);
    // La rotación sigue intacta y diferenciada de la proporción
    assert.equal(res.transform.rotationDeg, 17);
  }

  // En lienzo ProgramCanvas vertical 9:16 (1080x1920), la proporción 1:1 produce un cuadrado real en píxeles
  const squareInVertical = computeCameraAspectTransform(base, {
    scene: pipScene,
    layer: pipCamLayer,
    sources,
    aspectPreset: '1:1',
    sensorWidth: 1920,
    sensorHeight: 1080,
    outputWidth: 1080,
    outputHeight: 1920,
  });
  const sqRect = getLayerNormalizedRect(squareInVertical.transform);
  assert.ok(Math.abs((sqRect.width * 1080) / (sqRect.height * 1920) - 1) < 0.02);

  // Capa bloqueada ignora cambios de proporción
  const lockedRes = computeCameraAspectTransform(base, {
    scene: pipScene,
    layer: { ...pipCamLayer, locked: true },
    sources,
    aspectPreset: '9:16',
    sensorWidth: 1920,
    sensorHeight: 1080,
    outputWidth: 1920,
    outputHeight: 1080,
  });
  assert.deepEqual(lockedRes.transform, base);
});

test('CP-P02-B [2]: Composición adaptable (esquinas, centro, PiP, dividida horizontal/vertical y 100% libre)', () => {
  const { pipScene, sources, pipCamLayer } = buildTestScenes();
  const displayLayer = findPrimaryDisplayLayer(pipScene, sources)!;

  const splitH = computeAdaptableSceneLayout(pipScene, sources, 'split-horizontal', {
    outputWidth: 1920,
    outputHeight: 1080,
  });
  assert.equal(splitH.get(displayLayer.id)?.width, 0.5);
  assert.equal(splitH.get(displayLayer.id)?.height, 1);
  assert.equal(splitH.get(pipCamLayer.id)?.x, 0.5);
  assert.equal(splitH.get(pipCamLayer.id)?.width, 0.5);
  assert.equal(splitH.get(pipCamLayer.id)?.height, 1);

  const splitV = computeAdaptableSceneLayout(pipScene, sources, 'split-vertical', {
    outputWidth: 1920,
    outputHeight: 1080,
  });
  assert.equal(splitV.get(displayLayer.id)?.height, 0.5);
  assert.equal(splitV.get(pipCamLayer.id)?.y, 0.5);
  assert.equal(splitV.get(pipCamLayer.id)?.width, 1);

  const pip = computeAdaptableSceneLayout(pipScene, sources, 'pip-overlay', {
    outputWidth: 1920,
    outputHeight: 1080,
  });
  assert.equal(pip.get(displayLayer.id)?.width, 1);
  assert.equal(pip.get(displayLayer.id)?.height, 1);
  const pipCamRect = getLayerNormalizedRect(pip.get(pipCamLayer.id)!);
  assert.ok(pipCamRect.left > 0.5 && pipCamRect.top > 0.5);

  const full = computeAdaptableSceneLayout(pipScene, sources, 'camera-full', {
    outputWidth: 1920,
    outputHeight: 1080,
  });
  assert.equal(full.get(pipCamLayer.id)?.width, 1);
  assert.equal(full.get(pipCamLayer.id)?.height, 1);
});

test('CP-P02-C1 [1]: Selección universal por zIndex, selección de capas ocultas/inferiores por ID y exclusión de audio', () => {
  const { pipScene, sources, pipCamLayer } = buildTestScenes();
  const displayLayer = findPrimaryDisplayLayer(pipScene, sources)!;
  const micSource = sources.find((s) => s.kind === 'microphone')!;

  // 1. Fuentes de solo audio no son editables geométricamente
  assert.equal(isVisualSourceEditable(micSource), false);
  assert.equal(
    isVisualSourceEditable(sources.find((s) => s.id === displayLayer.sourceId)),
    true
  );

  // 2. Clic en zona de solapamiento (centro de cámara) devuelve la capa superior por zIndex (cámara)
  const camRect = getLayerNormalizedRect(pipCamLayer.transform);
  const camCenterX = camRect.left + camRect.width * 0.5;
  const camCenterY = camRect.top + camRect.height * 0.5;
  const hitTop = hitTestSceneLayerAtPoint(pipScene, sources, camCenterX, camCenterY);
  assert.equal(hitTop?.id, pipCamLayer.id);

  // 3. Clic en zona de la ventana no cubierta por la cámara selecciona directamente la ventana (sin onlyKind='camera')
  const hitWindow = hitTestSceneLayerAtPoint(pipScene, sources, 0.08, 0.12);
  assert.equal(hitWindow?.id, displayLayer.id);

  // 4. Aunque una capa de audio apareciera accidentalmente en scene.layers, nunca es seleccionable ni golpeable
  const sceneWithAudioOops: StudioScene = {
    ...pipScene,
    layers: [
      ...pipScene.layers,
      {
        ...pipCamLayer,
        id: 'layer_audio_oops',
        sourceId: micSource.id,
        name: 'Mic Oops',
        zIndex: 999,
      },
    ],
  };
  const hitIgnoringAudio = hitTestSceneLayerAtPoint(
    sceneWithAudioOops,
    sources,
    camCenterX,
    camCenterY
  );
  assert.equal(hitIgnoringAudio?.id, pipCamLayer.id);
  assert.notEqual(
    resolveTargetEditableLayer(sceneWithAudioOops, sources, 'layer_audio_oops')?.id,
    'layer_audio_oops'
  );

  // 5. Selección directa de capa inferior o parcialmente cubierta (ventana/pantalla/imagen) vía resolveTargetEditableLayer
  assert.equal(
    resolveTargetEditableLayer(pipScene, sources, displayLayer.id)?.id,
    displayLayer.id
  );
  assert.ok(findPrimaryVisualLayer(pipScene, sources));
});

test('CP-P02-C1 [2]: Edición completa de capa window/screen (arrastre, 4 esquinas, flechas, bloqueo, 100% libre y colocación)', () => {
  const { pipScene, sources } = buildTestScenes();
  const displayLayer = findPrimaryDisplayLayer(pipScene, sources)!;

  // Reducir ventana a 60% y mover con ajuste magnético
  const scaledWindow = computeScaledLayerWidthTransform(displayLayer.transform, 0.6, {
    scene: pipScene,
    layer: displayLayer,
    sources,
  });
  assert.ok(Math.abs(scaledWindow.transform.width - 0.6) < 1e-4);

  const dragged = computeLayerDragTransform(scaledWindow.transform, -0.05, -0.05, {
    scene: pipScene,
    layer: displayLayer,
    sources,
    enableSnap: true,
  });
  const dragRect = getLayerNormalizedRect(dragged.transform);
  assert.ok(dragRect.left >= 0 && dragRect.top >= 0);

  // Redimensionar por esquina inferior derecha
  const resizedCorner = computeLayerCornerResizeTransform(
    { ...scaledWindow.transform, x: 0.1, y: 0.1, width: 0.5, height: 0.5, anchorX: 0, anchorY: 0 },
    'bottom-right',
    0.85,
    0.85,
    { scene: pipScene, layer: displayLayer, sources, enableSnap: false }
  );
  const rcRect = getLayerNormalizedRect(resizedCorner.transform);
  assert.ok(Math.abs(rcRect.left - 0.1) < 1e-4);
  assert.ok(Math.abs(rcRect.width - 0.75) < 1e-4);

  // Nudge con teclado sobre ventana
  const nudged = computeKeyboardNudgeTransform(resizedCorner.transform, 'ArrowRight', {
    shiftKey: true,
    scene: pipScene,
    layer: displayLayer,
    sources,
  });
  assert.ok(Math.abs((nudged?.transform.x ?? 0) - 0.14) < 1e-4);

  // Bloqueo de ventana impide edición
  const lockedRes = computeLayerDragTransform(
    resizedCorner.transform,
    0.1,
    0.1,
    { scene: pipScene, layer: { ...displayLayer, locked: true }, sources }
  );
  assert.deepEqual(lockedRes.transform, resizedCorner.transform);

  // Escalar de vuelta a 100% libremente mediante adaptable layout dirigido a la ventana
  const patchesToCorner = computeAdaptableSceneLayout(pipScene, sources, 'corner-top-left', {
    outputWidth: 1920,
    outputHeight: 1080,
    selectedLayerId: displayLayer.id,
    intrinsicWidth: 1440,
    intrinsicHeight: 900,
  });
  const cornerWin = patchesToCorner.get(displayLayer.id);
  assert.ok(cornerWin && cornerWin.width < 0.5);
  assert.ok(Math.abs((cornerWin?.x ?? 0) - EDITOR_SAFE_MARGIN) < 1e-4);

  const patchesToFull = computeAdaptableSceneLayout(pipScene, sources, 'camera-full', {
    outputWidth: 1920,
    outputHeight: 1080,
    selectedLayerId: displayLayer.id,
  });
  assert.equal(patchesToFull.get(displayLayer.id)?.width, 1);
  assert.equal(patchesToFull.get(displayLayer.id)?.height, 1);
});

test('CP-P02-C1 [3]: Proporción independiente de pantalla/ventana (Original 1440x900, 16:9, 9:16, 1:1, custom) separada de rotación', () => {
  const { pipScene, sources } = buildTestScenes();
  const displayLayer = findPrimaryDisplayLayer(pipScene, sources)!;
  const base = {
    ...displayLayer.transform,
    x: 0.1,
    y: 0.1,
    width: 0.6,
    height: 0.6,
    rotationDeg: 22,
  };

  // Original de ventana 1440x900 (1.6:1) dentro de ProgramCanvas 1920x1080
  const origWin = computeLayerAspectTransform(base, {
    scene: pipScene,
    layer: displayLayer,
    sources,
    aspectPreset: 'sensor',
    intrinsicWidth: 1440,
    intrinsicHeight: 900,
    outputWidth: 1920,
    outputHeight: 1080,
  });
  const origRect = getLayerNormalizedRect(origWin.transform);
  assert.ok(Math.abs((origRect.width * 1920) / (origRect.height * 1080) - 1.6) < 0.02);
  assert.equal(origWin.transform.rotationDeg, 22);

  // Proporción vertical 9:16 y cuadrada 1:1 sobre esa misma ventana en lienzo 1920x1080
  const vertWin = computeLayerAspectTransform(base, {
    scene: pipScene,
    layer: displayLayer,
    sources,
    aspectPreset: '9:16',
    intrinsicWidth: 1440,
    intrinsicHeight: 900,
    outputWidth: 1920,
    outputHeight: 1080,
  });
  const vRect = getLayerNormalizedRect(vertWin.transform);
  assert.ok(Math.abs((vRect.width * 1920) / (vRect.height * 1080) - 9 / 16) < 0.02);

  const customWin = computeLayerAspectTransform(base, {
    scene: pipScene,
    layer: displayLayer,
    sources,
    aspectPreset: 'custom',
    customAspectRatio: 2.35,
    intrinsicWidth: 1440,
    intrinsicHeight: 900,
    outputWidth: 1920,
    outputHeight: 1080,
  });
  const cRect = getLayerNormalizedRect(customWin.transform);
  assert.ok(Math.abs((cRect.width * 1920) / (cRect.height * 1080) - 2.35) < 0.03);
});

test('CP-P02-C2: Composiciones multicapa (screen-main-cam-pip, cam-main-window-pip, dual-windows, grid-multi, freeform) y participación', () => {
  const { pipScene, sources, pipCamLayer } = buildTestScenes();
  const displayLayer = findPrimaryDisplayLayer(pipScene, sources)!;

  // 1. Cámara principal + ventana flotante
  const camMainWinPip = computeAdaptableSceneLayout(
    pipScene,
    sources,
    'cam-main-window-pip',
    { outputWidth: 1920, outputHeight: 1080 }
  );
  assert.equal(camMainWinPip.get(pipCamLayer.id)?.width, 1);
  assert.equal(camMainWinPip.get(pipCamLayer.id)?.height, 1);
  const winPipRect = getLayerNormalizedRect(camMainWinPip.get(displayLayer.id)!);
  assert.ok(winPipRect.width < 0.5 && winPipRect.left > 0.5);

  // 2. Libre (freeform) no sobrescribe posiciones personalizadas
  const freePatches = computeAdaptableSceneLayout(pipScene, sources, 'freeform', {
    outputWidth: 1920,
    outputHeight: 1080,
  });
  assert.equal(freePatches.size, 0);

  // 3. Dos ventanas lado a lado / Grid múltiple con 3 capas visuales
  const extraWinLayer: SceneLayer = {
    ...displayLayer,
    id: 'layer_win_2',
    name: 'Ventana 2',
    zIndex: 3,
  };
  const threeLayerScene: StudioScene = {
    ...pipScene,
    layers: [...pipScene.layers, extraWinLayer],
  };

  const dualWin = computeAdaptableSceneLayout(
    threeLayerScene,
    sources,
    'dual-windows-side-by-side',
    { outputWidth: 1920, outputHeight: 1080 }
  );
  assert.equal(dualWin.size, 2);
  assert.equal(dualWin.has(pipCamLayer.id), false);

  // 4. Participación explícita + respeto estricto de capas bloqueadas
  const lockedExtraScene: StudioScene = {
    ...threeLayerScene,
    layers: threeLayerScene.layers.map((l) =>
      l.id === extraWinLayer.id ? { ...l, locked: true } : l
    ),
  };
  const gridWithParticipation = computeAdaptableSceneLayout(
    lockedExtraScene,
    sources,
    'grid-multi',
    {
      outputWidth: 1920,
      outputHeight: 1080,
      participatingLayerIds: [pipCamLayer.id, displayLayer.id, extraWinLayer.id],
    }
  );
  assert.equal(gridWithParticipation.has(extraWinLayer.id), false);
  assert.equal(gridWithParticipation.has(pipCamLayer.id), true);
  assert.equal(gridWithParticipation.has(displayLayer.id), true);
});

test('CP-P02-C3-R2: composiciones multicapa respetan Principal/Secundaria explícitas con dos pantallas y cámara', () => {
  const { pipCamLayer } = buildTestScenes();
  const camSrc: StudioSource = {
    id: 'src_cam_r2',
    kind: 'camera',
    name: 'Cámara',
    createdAt: 1,
    deviceId: 'c1',
    preferredWidth: 1920,
    preferredHeight: 1080,
    preferredFps: 30,
  };
  const screenSrc1: StudioSource = {
    id: 'src_scr_1',
    kind: 'screen',
    name: 'Pantalla 1',
    createdAt: 1,
    includeSystemAudio: false,
  };
  const winSrc2: StudioSource = {
    id: 'src_win_2',
    kind: 'window',
    name: 'Ventana Código',
    createdAt: 1,
    includeSystemAudio: false,
  };

  const camLayer: SceneLayer = {
    ...pipCamLayer,
    id: 'l_cam_r2',
    sourceId: camSrc.id,
    name: 'Cámara',
    visible: true,
    locked: false,
    zIndex: 2,
    transform: { ...pipCamLayer.transform, fitMode: 'cover' },
  };
  const screenLayer1: SceneLayer = {
    ...camLayer,
    id: 'l_scr_1',
    sourceId: screenSrc1.id,
    name: 'Pantalla 1',
    zIndex: 0,
    transform: { ...pipCamLayer.transform, fitMode: 'contain' },
  };
  const winLayer2: SceneLayer = {
    ...camLayer,
    id: 'l_win_2',
    sourceId: winSrc2.id,
    name: 'Ventana Código',
    zIndex: 1,
    transform: { ...pipCamLayer.transform, fitMode: 'contain' },
  };

  const scene: StudioScene = {
    id: 'sc_multi_r2',
    name: 'Multi Display',
    backgroundColor: '#000',
    transition: { type: 'cut', durationMs: 0 },
    layers: [screenLayer1, winLayer2, camLayer],
    audioSourceIds: [],
    createdAt: 1,
    updatedAt: 1,
  };
  const sources: StudioSource[] = [camSrc, screenSrc1, winSrc2];

  // 1. Elegir Ventana Código como Principal y Pantalla 1 como Secundaria en screen-main-window-pip
  const mainWinPip = computeAdaptableSceneLayout(
    scene,
    sources,
    'screen-main-window-pip',
    {
      outputWidth: 1920,
      outputHeight: 1080,
      primaryDisplayLayerId: winLayer2.id,
      secondaryDisplayLayerId: screenLayer1.id,
      primaryCameraLayerId: camLayer.id,
    }
  );
  const winMainRect = getLayerNormalizedRect(mainWinPip.get(winLayer2.id)!);
  const scrPipRect = getLayerNormalizedRect(mainWinPip.get(screenLayer1.id)!);
  const camPipRect = getLayerNormalizedRect(mainWinPip.get(camLayer.id)!);
  assert.ok(winMainRect.width >= 0.99 && winMainRect.height >= 0.99);
  assert.ok(scrPipRect.width < 0.4 && scrPipRect.left > 0.5);
  assert.ok(camPipRect.width < 0.35 && camPipRect.top > 0.5);

  // 2. screen-main-transparent-presenter pone la pantalla Principal al 100% y el presentador en primer plano
  const presenterPatches = computeAdaptableSceneLayout(
    scene,
    sources,
    'screen-main-transparent-presenter',
    {
      outputWidth: 1920,
      outputHeight: 1080,
      primaryDisplayLayerId: winLayer2.id,
      primaryCameraLayerId: camLayer.id,
    }
  );
  assert.ok(getLayerNormalizedRect(presenterPatches.get(winLayer2.id)!).width >= 0.99);
  assert.ok(getLayerNormalizedRect(presenterPatches.get(camLayer.id)!).width >= 0.45);

  // 3. dual-windows-side-by-side ubica Principal a la izquierda y Secundaria a la derecha
  const dualSide = computeAdaptableSceneLayout(
    scene,
    sources,
    'dual-windows-side-by-side',
    {
      outputWidth: 1920,
      outputHeight: 1080,
      primaryDisplayLayerId: winLayer2.id,
      secondaryDisplayLayerId: screenLayer1.id,
    }
  );
  assert.ok(getLayerNormalizedRect(dualSide.get(winLayer2.id)!).left < 0.1);
  assert.ok(getLayerNormalizedRect(dualSide.get(screenLayer1.id)!).left > 0.45);
});
