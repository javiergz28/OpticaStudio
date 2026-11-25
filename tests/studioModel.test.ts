import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addLayerToScene,
  addSource,
  containsRuntimeResources,
  createEmptyProject,
  createScene,
  deleteScene,
  duplicateScene,
  getSourceUsageCount,
  moveLayerOrder,
  removeLayerFromScene,
  removeSourceIfUnused,
  renameScene,
  reorderSceneLayers,
  resolveEffectiveLayerProcessing,
  setActiveScene,
  setLayerLocked,
  setLayerVisibility,
  updateLayerProcessing,
  updateLayerTransform,
  validateProjectReferences,
} from '../src/engine/sceneEngine';
import { instantiatePresetProject, STUDIO_PRESETS } from '../src/engine/scenePresets';
import { CURRENT_STUDIO_SCHEMA_VERSION, type StudioProject } from '../src/types/studio';
import {
  createInMemoryStudioStorageAdapter,
  deserializeStudioProject,
  loadStudioProject,
  migrateAndValidateProject,
  saveStudioProject,
  serializeStudioProject,
  STUDIO_PROJECTS_DB_NAME,
} from '../src/utils/studioStorage';

test('1. Creación de proyectos, escenas y fuentes con identificadores únicos', () => {
  let project = createEmptyProject({ name: 'Tutorial IA' });
  assert.equal(project.schemaVersion, CURRENT_STUDIO_SCHEMA_VERSION);
  assert.equal(project.scenes.length, 1);
  assert.equal(project.activeSceneId, project.scenes[0].id);

  const cam = addSource(project, {
    kind: 'camera',
    name: 'FaceTime HD',
    deviceId: 'cam-1',
    preferredWidth: 1920,
    preferredHeight: 1080,
    preferredFps: 60,
  });
  project = cam.project;

  const win = addSource(project, {
    kind: 'window',
    name: 'Cursor IDE',
    includeSystemAudio: true,
  });
  project = win.project;

  const grad = addSource(project, {
    kind: 'gradient',
    name: 'Liquid Glass Fondo',
    startColor: '#090d1a',
    endColor: '#121826',
    angleDeg: 135,
  });
  project = grad.project;

  const mic = addSource(project, {
    kind: 'microphone',
    name: 'Shure MV7',
    deviceId: 'mic-1',
    echoCancellation: true,
    noiseSuppression: true,
  });
  project = mic.project;

  const scene2 = createScene(project, { name: 'Demo IA', activate: true });
  project = scene2.project;
  assert.equal(project.scenes.length, 2);
  assert.equal(project.activeSceneId, scene2.scene.id);

  // Verificar unicidad global de IDs
  const allIds = [
    project.id,
    ...project.sources.map((s) => s.id),
    ...project.scenes.map((s) => s.id),
  ];
  assert.equal(new Set(allIds).size, allIds.length);
  assert.equal(validateProjectReferences(project).valid, true);
});

test('2. Duplicación de escenas crea nuevos IDs de capa pero comparte referencias de fuentes', () => {
  let project = instantiatePresetProject('ai-tutorial-pip');
  const origScene = project.scenes[0];
  const origLayerIds = origScene.layers.map((l) => l.id);
  const origSourceIds = origScene.layers.map((l) => l.sourceId);
  const origSourcesCount = project.sources.length;

  const dupResult = duplicateScene(project, origScene.id, 'Escena Tutorial B');
  project = dupResult.project;
  assert.ok(dupResult.scene);
  assert.notEqual(dupResult.scene.id, origScene.id);
  assert.equal(dupResult.scene.name, 'Escena Tutorial B');
  assert.equal(project.sources.length, origSourcesCount, 'No debe duplicar fuentes');

  // Nuevos IDs de capa
  dupResult.scene.layers.forEach((layer, idx) => {
    assert.notEqual(layer.id, origLayerIds[idx]);
    assert.equal(layer.sourceId, origSourceIds[idx], 'Debe mantener referencia a la misma fuente');
  });

  // Cada fuente referenciada ahora tiene uso múltiple
  for (const srcId of origSourceIds) {
    assert.equal(getSourceUsageCount(project, srcId), 2);
  }
  assert.equal(validateProjectReferences(project).valid, true);
});

test('3. Eliminación segura de capas y escenas (protege última escena y fuentes compartidas)', () => {
  let project = instantiatePresetProject('ai-tutorial-pip');
  const scene1 = project.scenes[0];
  const duplicated = duplicateScene(project, scene1.id);
  project = duplicated.project;
  const scene2 = duplicated.scene!;
  project = setActiveScene(project, scene2.id);

  const sharedCameraId = scene2.layers[1].sourceId;
  // Eliminar capa en escena 2 NO debe eliminar la fuente compartida
  project = removeLayerFromScene(project, scene2.id, scene2.layers[1].id);
  assert.ok(
    project.sources.some((s) => s.id === sharedCameraId),
    'La fuente debe conservarse en project.sources'
  );
  assert.equal(
    removeSourceIfUnused(project, sharedCameraId).removed,
    false,
    'No debe permitir eliminar fuente aún usada por escena 1'
  );

  // Eliminar escena activa debe reasignar activeSceneId de forma segura
  const del2 = deleteScene(project, scene2.id);
  assert.equal(del2.deleted, true);
  project = del2.project;
  assert.equal(project.activeSceneId, scene1.id);

  // Intentar eliminar la última escena restante debe ser rechazado
  const delLast = deleteScene(project, scene1.id);
  assert.equal(delLast.deleted, false);
  assert.equal(delLast.reason, 'last-scene');
  assert.equal(delLast.project.scenes.length, 1);
});

test('4. Reordenamiento, visibilidad, bloqueo y clamping de transformaciones', () => {
  let project = instantiatePresetProject('split-screen');
  const sceneId = project.activeSceneId;
  const scene = project.scenes[0];
  assert.equal(scene.layers.length, 3);

  const ids = scene.layers.map((l) => l.id);
  // Mover capa superior al fondo
  project = moveLayerOrder(project, sceneId, ids[2], 'bottom');
  let updated = project.scenes[0];
  assert.equal(updated.layers[0].id, ids[2]);
  assert.deepEqual(
    updated.layers.map((l) => l.zIndex),
    [0, 1, 2]
  );

  // Reordenamiento explícito
  project = reorderSceneLayers(project, sceneId, [ids[0], ids[1], ids[2]]);
  updated = project.scenes[0];
  assert.deepEqual(
    updated.layers.map((l) => l.id),
    ids
  );

  // Visibilidad y bloqueo
  const targetLayerId = ids[1];
  project = setLayerVisibility(project, sceneId, targetLayerId, false);
  assert.equal(project.scenes[0].layers[1].visible, false);

  project = setLayerLocked(project, sceneId, targetLayerId, true);
  const beforeLockedX = project.scenes[0].layers[1].transform.x;
  project = updateLayerTransform(project, sceneId, targetLayerId, { x: 0.5 });
  assert.equal(
    project.scenes[0].layers[1].transform.x,
    beforeLockedX,
    'Capa bloqueada no debe moverse sin ignoreLock'
  );

  // Desbloquear y probar clamping de transformaciones y recorte
  project = setLayerLocked(project, sceneId, targetLayerId, false);
  project = updateLayerTransform(project, sceneId, targetLayerId, {
    x: 99,
    width: 0.001,
    rotationDeg: 450,
    crop: { left: 0.8, right: 0.8, top: -0.5, bottom: 0.49 },
  });
  const t = project.scenes[0].layers[1].transform;
  assert.equal(t.x, 2);
  assert.equal(t.width, 0.04);
  assert.equal(t.rotationDeg, 90);
  assert.ok(t.crop.left <= 0.49 && t.crop.right <= 0.49);
  assert.ok(t.crop.left + t.crop.right < 1);
  assert.equal(t.crop.top, 0);
  assert.equal(validateProjectReferences(project).valid, true);
});

test('5. Ajustes compartidos de fuente vs sobrescritura por instancia en escena', () => {
  let project = createEmptyProject();
  const cam = addSource(project, {
    kind: 'camera',
    name: 'Cam Estudio',
    deviceId: 'c1',
    preferredWidth: 1920,
    preferredHeight: 1080,
    preferredFps: 60,
    sharedProcessing: {
      filterId: 'cine-2383',
    },
  });
  project = cam.project;

  const scene1Id = project.activeSceneId;
  const layer1 = addLayerToScene(project, scene1Id, cam.source.id).layer!;
  project = addLayerToScene(project, scene1Id, cam.source.id).project;

  const scene2 = createScene(project, { name: 'Escena B' });
  project = scene2.project;
  const layer2Add = addLayerToScene(project, scene2.scene.id, cam.source.id);
  project = layer2Add.project;
  const layer2Id = layer2Add.layer!.id;

  project = updateLayerProcessing(project, scene2.scene.id, layer2Id, {
    filterId: 'ig-clarendon',
    background: {
      mode: 'transparent',
      useAi: true,
      solidColor: '#09090B',
      imageId: 'loft',
      customAssetRef: null,
      sensitivity: 60,
      edgeSoftness: 50,
      blurAmount: 10,
    },
  });

  const eff1 = resolveEffectiveLayerProcessing(layer1, cam.source);
  const s2Layer = project.scenes[1].layers[0];
  const eff2 = resolveEffectiveLayerProcessing(s2Layer, cam.source);

  assert.equal(eff1.filterId, 'cine-2383');
  assert.equal(eff1.background.mode, 'none');
  assert.equal(eff2.filterId, 'ig-clarendon');
  assert.equal(eff2.background.mode, 'transparent');
});

test('6. Serialización, persistencia, restauración de escena activa e independencia de galería', async () => {
  assert.notEqual(STUDIO_PROJECTS_DB_NAME, 'optica_studio_db');

  const adapter = createInMemoryStudioStorageAdapter();
  let project = instantiatePresetProject('intro-outro');
  const secondSceneId = project.scenes[1].id;
  project = setActiveScene(project, secondSceneId);
  project = renameScene(project, secondSceneId, '2. Demo Código IA');

  const saveRes = await saveStudioProject(project, adapter);
  assert.equal(saveRes.saved, true);
  assert.ok(saveRes.bytes > 0);

  const loaded = await loadStudioProject(undefined, adapter);
  assert.equal(loaded.source, 'stored');
  assert.equal(loaded.project.id, project.id);
  assert.equal(loaded.project.activeSceneId, secondSceneId);
  assert.equal(loaded.project.scenes[1].name, '2. Demo Código IA');
  assert.equal(validateProjectReferences(loaded.project).valid, true);
});

test('7. Migración no destructiva desde esquema v0 y recuperación ante datos corruptos', async () => {
  const adapter = createInMemoryStudioStorageAdapter();

  // Simular proyecto legado v0 sin schemaVersion ni recordingProfile
  const legacyV0 = {
    id: 'proj_legacy_1',
    name: 'Proyecto Antiguo',
    activeSceneId: 'scene_no_existe',
    sources: [
      { id: 'src_cam', kind: 'camera', name: 'Cam Vieja', deviceId: 'default', preferredWidth: 1280, preferredHeight: 720, preferredFps: 30 },
      { id: 'src_corrupt', kind: 'tipo_invalido' },
    ],
    scenes: [
      {
        id: 'scene_1',
        name: 'Mi Escena Legacy',
        layers: [
          {
            id: 'layer_1',
            sourceId: 'src_cam',
            name: 'Cam',
            transform: { x: 0, y: 0, width: 1, height: 1 },
          },
          {
            id: 'layer_orphan',
            sourceId: 'src_inexistente',
            name: 'Huérfana',
          },
        ],
      },
    ],
  };

  const migrated = migrateAndValidateProject(legacyV0);
  assert.equal(migrated.migratedFromVersion, 0);
  assert.equal(migrated.project.schemaVersion, CURRENT_STUDIO_SCHEMA_VERSION);
  assert.equal(migrated.project.name, 'Proyecto Antiguo');
  assert.equal(migrated.project.activeSceneId, 'scene_1');
  assert.equal(migrated.project.scenes[0].layers.length, 1);
  assert.equal(validateProjectReferences(migrated.project).valid, true);

  // Recuperación ante JSON totalmente corrupto en storage
  await adapter.putItem('corrupt_proj', '{esto no es json válido');
  const recoveredLoad = await loadStudioProject('corrupt_proj', adapter);
  assert.equal(recoveredLoad.source, 'recovered');
  assert.ok(recoveredLoad.warnings.length > 0);
  assert.equal(validateProjectReferences(recoveredLoad.project).valid, true);

  const directCorrupt = deserializeStudioProject('null');
  assert.equal(directCorrupt.recovered, true);
  assert.equal(validateProjectReferences(directCorrupt.project).valid, true);
});

test('8. Bloqueo estricto de recursos multimedia activos dentro de datos serializados', () => {
  class MediaStream {
    id = 'mock-stream';
  }
  const fakeStream = new MediaStream();

  const dirtyProject = instantiatePresetProject('camera-primary') as unknown as StudioProject & {
    sources: Array<Record<string, unknown>>;
  };
  dirtyProject.sources[0].runtimeStream = fakeStream;

  assert.equal(containsRuntimeResources(dirtyProject), true);
  assert.equal(validateProjectReferences(dirtyProject).valid, false);
  assert.throws(() => serializeStudioProject(dirtyProject));
});

test('9. Compatibilidad e integridad de las 7 plantillas iniciales', () => {
  assert.equal(STUDIO_PRESETS.length, 7);

  for (const preset of STUDIO_PRESETS) {
    const project = instantiatePresetProject(preset.id);
    const validation = validateProjectReferences(project);
    assert.equal(
      validation.valid,
      true,
      `Plantilla ${preset.id} falló validación: ${JSON.stringify(validation.issues)}`
    );
    assert.equal(containsRuntimeResources(project), false);

    // Verificar round-trip JSON completo
    const json = serializeStudioProject(project);
    const roundTrip = deserializeStudioProject(json);
    assert.equal(roundTrip.recovered, false);
    assert.equal(roundTrip.project.scenes.length, project.scenes.length);
  }
});
