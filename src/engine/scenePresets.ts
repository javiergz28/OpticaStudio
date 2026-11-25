import {
  addLayerToScene,
  addSource,
  createEmptyProject,
  createScene,
  DEFAULT_AUDIO_SOURCE_SETTINGS,
  deleteScene,
  setActiveScene,
} from './sceneEngine';
import type { StudioPreset, StudioPresetId, StudioProject } from '../types/studio';

export const STUDIO_PRESETS: StudioPreset[] = [
  {
    id: 'camera-primary',
    name: 'Cámara principal',
    description: 'Plano principal del presentador a pantalla completa con audio de estudio.',
    category: 'camera',
    recommendedAspectRatio: '16:9',
    recommendedResolution: '1080p',
    tags: ['Cámara', '16:9', 'Presentación'],
  },
  {
    id: 'ai-tutorial-pip',
    name: 'Tutorial IA con pantalla y presentador flotante',
    description:
      'Ventana de aplicación o demostración IA en base completa con presentador en esquina squircle o fondo transparente.',
    category: 'tutorial',
    recommendedAspectRatio: '16:9',
    recommendedResolution: '1080p',
    tags: ['Tutorial', 'Demostración IA', 'PiP'],
  },
  {
    id: 'split-screen',
    name: 'Pantalla dividida',
    description:
      'Composición 65/35 sobre fondo Liquid Glass: aplicación o código a la izquierda y presentador a la derecha.',
    category: 'tutorial',
    recommendedAspectRatio: '16:9',
    recommendedResolution: '1080p',
    tags: ['Split', 'Código', 'Explicación'],
  },
  {
    id: 'dual-app-comparison',
    name: 'Comparativa entre dos aplicaciones',
    description:
      'Dos ventanas independientes lado a lado con rótulo superior y burbuja opcional del presentador.',
    category: 'comparison',
    recommendedAspectRatio: '16:9',
    recommendedResolution: '1080p',
    tags: ['Comparativa', 'Multi-ventana', 'Benchmark'],
  },
  {
    id: 'fullscreen-demo',
    name: 'Demostración a pantalla completa',
    description:
      'Captura limpia de pantalla o ventana sin obstrucciones visuales, con audio de micrófono y sistema.',
    category: 'production',
    recommendedAspectRatio: '16:9',
    recommendedResolution: '1080p',
    tags: ['Pantalla', 'Captura limpia', 'Software'],
  },
  {
    id: 'vertical-reel',
    name: 'Reel vertical 9:16',
    description:
      'Formato vertical con pantalla superior y presentador encuadrado en la mitad inferior para Shorts/Reels.',
    category: 'vertical',
    recommendedAspectRatio: '9:16',
    recommendedResolution: '1080p',
    tags: ['9:16', 'Vertical', 'Reels'],
  },
  {
    id: 'intro-outro',
    name: 'Apertura y cierre',
    description:
      'Proyecto estructurado con escenas independientes de Apertura, Contenido principal y Cierre compartiendo cámara y micrófono.',
    category: 'production',
    recommendedAspectRatio: '16:9',
    recommendedResolution: '1080p',
    tags: ['Intro', 'Outro', 'Multiescena'],
  },
];

export function getPresetMetadata(presetId: StudioPresetId): StudioPreset {
  return STUDIO_PRESETS.find((p) => p.id === presetId) ?? STUDIO_PRESETS[0];
}

/**
 * Instancia un proyecto estructurado y editable a partir de una plantilla inicial.
 * No abre conexiones de cámara, pantalla ni recursos multimedia en ejecución.
 */
export function instantiatePresetProject(presetId: StudioPresetId): StudioProject {
  const meta = getPresetMetadata(presetId);

  let project = createEmptyProject({
    name: meta.name,
    initialSceneName: meta.name,
    recordingProfile: {
      aspectRatio: meta.recommendedAspectRatio,
      resolutionPreset: meta.recommendedResolution,
      fps: 60,
      formatPref: 'auto-mp4',
    },
  });

  const baseSceneId = project.scenes[0].id;
  project = {
    ...project,
    scenes: project.scenes.map((s) =>
      s.id === baseSceneId ? { ...s, presetId } : s
    ),
  };

  // Fuentes compartibles base
  const micAdded = addSource(project, {
    kind: 'microphone',
    name: 'Micrófono Principal',
    deviceId: 'default',
    echoCancellation: true,
    noiseSuppression: true,
    audio: { ...DEFAULT_AUDIO_SOURCE_SETTINGS },
  });
  project = micAdded.project;

  const camAdded = addSource(project, {
    kind: 'camera',
    name: 'Cámara Presentador',
    deviceId: 'default',
    deviceLabelHint: 'FaceTime HD',
    preferredWidth: 1920,
    preferredHeight: 1080,
    preferredFps: 60,
  });
  project = camAdded.project;

  const attachMicToScene = (proj: StudioProject, sceneId: string): StudioProject => ({
    ...proj,
    scenes: proj.scenes.map((s) =>
      s.id === sceneId
        ? { ...s, audioSourceIds: Array.from(new Set([...s.audioSourceIds, micAdded.source.id])) }
        : s
    ),
  });

  switch (presetId) {
    case 'camera-primary': {
      project = addLayerToScene(project, baseSceneId, camAdded.source.id, {
        name: 'Cámara Principal',
        transform: { x: 0, y: 0, width: 1, height: 1, fitMode: 'cover' },
      }).project;
      project = attachMicToScene(project, baseSceneId);
      return project;
    }

    case 'ai-tutorial-pip': {
      const winAdded = addSource(project, {
        kind: 'window',
        name: 'Ventana de aplicación',
        includeSystemAudio: true,
      });
      project = winAdded.project;

      project = addLayerToScene(project, baseSceneId, winAdded.source.id, {
        name: 'Ventana Aplicación',
        transform: { x: 0, y: 0, width: 1, height: 1, fitMode: 'contain' },
      }).project;

      project = addLayerToScene(project, baseSceneId, camAdded.source.id, {
        name: 'Presentador Flotante',
        transform: { x: 0.73, y: 0.67, width: 0.24, height: 0.27, fitMode: 'cover' },
        style: {
          opacity: 1,
          maskShape: 'squircle',
          borderRadiusPx: 22,
          borderWidthPx: 2,
          borderColor: 'rgba(255, 255, 255, 0.34)',
          shadowBlurPx: 24,
          shadowOpacity: 0.55,
        },
        overrideSourceProcessing: true,
        processing: {
          background: {
            mode: 'transparent',
            useAi: true,
            solidColor: '#09090B',
            imageId: 'loft',
            customAssetRef: null,
            sensitivity: 50,
            edgeSoftness: 60,
            blurAmount: 14,
          },
        },
      }).project;

      project = attachMicToScene(project, baseSceneId);
      return project;
    }

    case 'split-screen': {
      const bgAdded = addSource(project, {
        kind: 'gradient',
        name: 'Fondo Liquid Glass Oscuro',
        startColor: '#0b1020',
        endColor: '#07090f',
        angleDeg: 135,
      });
      project = bgAdded.project;

      const winAdded = addSource(project, {
        kind: 'window',
        name: 'Ventana de código',
        includeSystemAudio: true,
      });
      project = winAdded.project;

      project = addLayerToScene(project, baseSceneId, bgAdded.source.id, {
        name: 'Fondo Estudio',
        transform: { x: 0, y: 0, width: 1, height: 1, fitMode: 'stretch' },
        locked: true,
      }).project;

      project = addLayerToScene(project, baseSceneId, winAdded.source.id, {
        name: 'Panel Izquierdo (App)',
        transform: { x: 0.025, y: 0.06, width: 0.62, height: 0.88, fitMode: 'contain' },
        style: {
          maskShape: 'rounded',
          borderRadiusPx: 18,
          borderWidthPx: 1,
          borderColor: 'rgba(255, 255, 255, 0.18)',
          shadowBlurPx: 22,
          shadowOpacity: 0.45,
        },
      }).project;

      project = addLayerToScene(project, baseSceneId, camAdded.source.id, {
        name: 'Panel Derecho (Presentador)',
        transform: { x: 0.665, y: 0.06, width: 0.31, height: 0.88, fitMode: 'cover' },
        style: {
          maskShape: 'rounded',
          borderRadiusPx: 18,
          borderWidthPx: 1,
          borderColor: 'rgba(255, 255, 255, 0.22)',
          shadowBlurPx: 22,
          shadowOpacity: 0.45,
        },
      }).project;

      project = attachMicToScene(project, baseSceneId);
      return project;
    }

    case 'dual-app-comparison': {
      const bgAdded = addSource(project, {
        kind: 'gradient',
        name: 'Lienzo Comparativa',
        startColor: '#0a0e18',
        endColor: '#11131b',
        angleDeg: 160,
      });
      project = bgAdded.project;

      const appAAdded = addSource(project, {
        kind: 'window',
        name: 'Aplicación A',
        sourceTitleHint: 'Modelo / App A',
        includeSystemAudio: false,
      });
      project = appAAdded.project;

      const appBAdded = addSource(project, {
        kind: 'window',
        name: 'Aplicación B',
        sourceTitleHint: 'Modelo / App B',
        includeSystemAudio: false,
      });
      project = appBAdded.project;

      const headerAdded = addSource(project, {
        kind: 'text',
        name: 'Título Comparativa',
        text: 'Comparativa en Tiempo Real',
        subtitle: 'Modelo A vs Modelo B',
        fontFamily: 'sans',
        fontSizePx: 28,
        textColor: '#f5f5f7',
        accentColor: '#38bdf8',
        glassBackdrop: true,
        align: 'center',
      });
      project = headerAdded.project;

      project = addLayerToScene(project, baseSceneId, bgAdded.source.id, {
        name: 'Fondo',
        transform: { x: 0, y: 0, width: 1, height: 1, fitMode: 'stretch' },
        locked: true,
      }).project;

      project = addLayerToScene(project, baseSceneId, appAAdded.source.id, {
        name: 'Ventana A (Izquierda)',
        transform: { x: 0.025, y: 0.14, width: 0.465, height: 0.78, fitMode: 'contain' },
        style: {
          maskShape: 'rounded',
          borderRadiusPx: 14,
          borderWidthPx: 1,
          borderColor: 'rgba(255, 255, 255, 0.16)',
        },
      }).project;

      project = addLayerToScene(project, baseSceneId, appBAdded.source.id, {
        name: 'Ventana B (Derecha)',
        transform: { x: 0.51, y: 0.14, width: 0.465, height: 0.78, fitMode: 'contain' },
        style: {
          maskShape: 'rounded',
          borderRadiusPx: 14,
          borderWidthPx: 1,
          borderColor: 'rgba(255, 255, 255, 0.16)',
        },
      }).project;

      project = addLayerToScene(project, baseSceneId, headerAdded.source.id, {
        name: 'Encabezado',
        transform: { x: 0.25, y: 0.03, width: 0.5, height: 0.08, fitMode: 'contain' },
      }).project;

      project = addLayerToScene(project, baseSceneId, camAdded.source.id, {
        name: 'Presentador Miniatura',
        transform: { x: 0.425, y: 0.73, width: 0.15, height: 0.23, fitMode: 'cover' },
        style: {
          maskShape: 'circle',
          borderWidthPx: 2,
          borderColor: 'rgba(255, 255, 255, 0.36)',
          shadowBlurPx: 20,
          shadowOpacity: 0.5,
        },
      }).project;

      project = attachMicToScene(project, baseSceneId);
      return project;
    }

    case 'fullscreen-demo': {
      const screenAdded = addSource(project, {
        kind: 'screen',
        name: 'Pantalla Completa',
        includeSystemAudio: true,
      });
      project = screenAdded.project;

      project = addLayerToScene(project, baseSceneId, screenAdded.source.id, {
        name: 'Captura de Pantalla',
        transform: { x: 0, y: 0, width: 1, height: 1, fitMode: 'contain' },
      }).project;

      project = attachMicToScene(project, baseSceneId);
      return project;
    }

    case 'vertical-reel': {
      const winAdded = addSource(project, {
        kind: 'window',
        name: 'Pantalla vertical',
        includeSystemAudio: true,
      });
      project = winAdded.project;

      project = addLayerToScene(project, baseSceneId, winAdded.source.id, {
        name: 'Pantalla superior',
        transform: { x: 0.04, y: 0.04, width: 0.92, height: 0.48, fitMode: 'contain' },
        style: {
          maskShape: 'rounded',
          borderRadiusPx: 20,
          borderWidthPx: 1,
          borderColor: 'rgba(255, 255, 255, 0.20)',
        },
      }).project;

      project = addLayerToScene(project, baseSceneId, camAdded.source.id, {
        name: 'Presentador Inferior',
        transform: { x: 0.04, y: 0.54, width: 0.92, height: 0.42, fitMode: 'cover' },
        style: {
          maskShape: 'rounded',
          borderRadiusPx: 20,
          borderWidthPx: 1,
          borderColor: 'rgba(255, 255, 255, 0.22)',
        },
      }).project;

      project = attachMicToScene(project, baseSceneId);
      return project;
    }

    case 'intro-outro': {
      const bgAdded = addSource(project, {
        kind: 'gradient',
        name: 'Fondo Cinematográfico',
        startColor: '#090d1a',
        endColor: '#121826',
        angleDeg: 145,
      });
      project = bgAdded.project;

      const introTitleAdded = addSource(project, {
        kind: 'text',
        name: 'Título de Apertura',
        text: 'Óptica Studio Pro',
        subtitle: 'Tutorial & Demostración IA',
        fontFamily: 'sans',
        fontSizePx: 44,
        textColor: '#ffffff',
        accentColor: '#38bdf8',
        glassBackdrop: true,
        align: 'center',
      });
      project = introTitleAdded.project;

      const outroTitleAdded = addSource(project, {
        kind: 'text',
        name: 'Tarjeta de Cierre',
        text: 'Gracias por ver',
        subtitle: 'Recursos y código en la descripción',
        fontFamily: 'sans',
        fontSizePx: 40,
        textColor: '#ffffff',
        accentColor: '#f59e0b',
        glassBackdrop: true,
        align: 'center',
      });
      project = outroTitleAdded.project;

      const winAdded = addSource(project, {
        kind: 'window',
        name: 'Ventana principal',
        includeSystemAudio: true,
      });
      project = winAdded.project;

      // Escena 1: Apertura
      const introScene = createScene(project, {
        name: '1. Apertura',
        presetId: 'intro-outro',
        transition: { type: 'fade', durationMs: 350 },
        activate: true,
      });
      project = introScene.project;
      const introId = introScene.scene.id;
      project = addLayerToScene(project, introId, bgAdded.source.id, {
        name: 'Fondo Apertura',
        transform: { x: 0, y: 0, width: 1, height: 1, fitMode: 'stretch' },
        locked: true,
      }).project;
      project = addLayerToScene(project, introId, camAdded.source.id, {
        name: 'Presentador Intro',
        transform: { x: 0, y: 0, width: 1, height: 1, fitMode: 'cover' },
        style: { opacity: 0.72 },
      }).project;
      project = addLayerToScene(project, introId, introTitleAdded.source.id, {
        name: 'Título Principal',
        transform: { x: 0.18, y: 0.34, width: 0.64, height: 0.28, fitMode: 'contain' },
      }).project;
      project = attachMicToScene(project, introId);

      // Escena 2: Contenido principal (comparte misma cámara y micrófono)
      const mainScene = createScene(project, {
        name: '2. Contenido Principal',
        presetId: 'intro-outro',
        transition: { type: 'fade', durationMs: 260 },
      });
      project = mainScene.project;
      const mainId = mainScene.scene.id;
      project = addLayerToScene(project, mainId, winAdded.source.id, {
        name: 'Ventana compartida',
        transform: { x: 0, y: 0, width: 1, height: 1, fitMode: 'contain' },
      }).project;
      project = addLayerToScene(project, mainId, camAdded.source.id, {
        name: 'Presentador PiP',
        transform: { x: 0.74, y: 0.68, width: 0.23, height: 0.26, fitMode: 'cover' },
        style: {
          maskShape: 'squircle',
          borderRadiusPx: 20,
          borderWidthPx: 2,
          borderColor: 'rgba(255, 255, 255, 0.32)',
        },
      }).project;
      project = attachMicToScene(project, mainId);

      // Escena 3: Cierre (comparte cámara, fondo y micrófono)
      const outroScene = createScene(project, {
        name: '3. Cierre',
        presetId: 'intro-outro',
        transition: { type: 'fade', durationMs: 350 },
      });
      project = outroScene.project;
      const outroId = outroScene.scene.id;
      project = addLayerToScene(project, outroId, bgAdded.source.id, {
        name: 'Fondo Cierre',
        transform: { x: 0, y: 0, width: 1, height: 1, fitMode: 'stretch' },
        locked: true,
      }).project;
      project = addLayerToScene(project, outroId, camAdded.source.id, {
        name: 'Presentador Cierre',
        transform: { x: 0.62, y: 0.16, width: 0.32, height: 0.68, fitMode: 'cover' },
        style: {
          maskShape: 'rounded',
          borderRadiusPx: 22,
          borderWidthPx: 1,
          borderColor: 'rgba(255, 255, 255, 0.24)',
        },
      }).project;
      project = addLayerToScene(project, outroId, outroTitleAdded.source.id, {
        name: 'Tarjeta Cierre',
        transform: { x: 0.06, y: 0.28, width: 0.5, height: 0.4, fitMode: 'contain' },
      }).project;
      project = attachMicToScene(project, outroId);

      // Eliminar la escena vacía inicial dejando las 3 escenas de la plantilla
      project = deleteScene(project, baseSceneId).project;
      project = setActiveScene(project, introId);
      return project;
    }
  }
}
