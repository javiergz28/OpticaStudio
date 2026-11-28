# PROJECT MASTER — ÓPTICA STUDIO PRO

> **Estado actual:** R2: usuario confirma mejora visual del recorte, pero rechaza fluidez. CP-P02 completo y aprobado físicamente por el usuario en R3; sincronización con AI Studio pendiente antes de CP-P03-A. CP-P03-A no iniciado.
> **Repositorio maestro:** `https://github.com/javiergz28/OpticaStudio`
> **Commit base consolidado:** `28f38e640ebc8fa1c04ca968268dbbc2487d8702`
> **Plataforma prioritaria:** macOS Apple Silicon (ARM64) vía Electron + compatibilidad web operativa en Google AI Studio desde el mismo código fuente.

---

## 1. Visión del Producto

Evolucionar **Óptica Studio** desde una aplicación de cámara avanzada hacia **Óptica Studio Pro**: un estudio audiovisual multipista y multiescena comparable funcionalmente a **OBS Studio**, especializado en la **grabación de tutoriales técnicos y demostraciones de inteligencia artificial**, manteniendo intacta su identidad visual **Apple Liquid Glass**.

### Principios de Ingeniería y Restricciones Base

1. **Conservación total de funcionalidades existentes:** Todas las capacidades actuales (filtros IG/cinematográficos WebGL2, efectos visuales, cabina 4×, time-lapse, detección de movimiento, teleprompter, escáner QR/documentos, cuentagotas, histograma, galería IndexedDB y flujo de captura de ventanas) deben permanecer operativas durante toda la evolución.
2. **Mismo código fuente Web + macOS Desktop:** La app web en Google AI Studio y la app nativa Electron macOS ARM64 comparten el motor gráfico, de escenas y de audio, activando capacidades exclusivas de escritorio únicamente detrás de `window.opticaDesktop`.
3. **Sin funcionalidades simuladas:** Ninguna capacidad (ej. captura de audio por app aislada, códec hardware o cámara virtual) se declarará como compatible si no está soportada y verificada realmente en el runtime correspondiente.
4. **Preservación de la capa Electron/DMG externa:** No rehacer ni sobrescribir la infraestructura Electron, `electron-builder`, icono `.icns`, firma/notarización ni workflows ya estabilizados por el equipo externo. Cualquier extensión futura de IPC (ej. escritura incremental en disco) se diseñará de forma aditiva y en su checkpoint específico.

---

## 2. Auditoría Técnica del Estado Actual (CP-P00)

Análisis basado en la lectura directa del código base actual (`src/App.tsx`, `src/types/camera.ts`, `src/utils/canvasProcessor.ts`, `src/utils/webglEffects.ts`, `src/utils/aiVision.ts`, `src/utils/storage.ts`, `src/utils/audio.ts`, `src/components/CameraViewport.tsx`, `src/components/SidebarControls.tsx`, `src/components/GalleryView.tsx` y `electron/main.ts`).

### 2.1 Cámara y Dispositivos (`src/App.tsx`)

- **Acoplamiento monolítico:** `App.tsx` (2,115 líneas) gestiona simultáneamente UI, streams WebRTC, MediaRecorder, Web Audio, loop de renderizado 60fps, atajos y persistencia.
- **Límite fijo de fuentes de cámara:** Solo existen dos slots acoplados:
  - Cámara principal (`mediaStreamRef` + `videoElRef`).
  - Cámara secundaria fija (`secondaryStreamRef` + `secondaryVideoElRef` controlada por `dualCam`).
- **Ciclo de vida ligado al formato:** `startCameraStream()` mezcla la petición de `video` y `audio` en un mismo `getUserMedia()`, por lo que cambiar resolución (`resolutionPreset`) o relación de aspecto (`aspectRatio`) detiene y reinicia también el flujo de micrófono.

### 2.2 Sistema de Audio (`src/App.tsx`, `src/utils/audio.ts`)

- **Bus único en `setupAudioAnalyser()`:** Crea un `AudioContext` con una sola ruta de procesamiento (`micSource -> gainNode -> compressorNode -> analyser -> MediaStreamAudioDestinationNode`).
- **Audio de ventana/sistema sin mezcla granular:** Cuando `isScreenPipActive` está activo, `screenAudioSource` se conecta directamente a `analyser` y `dest` sin nodo `GainNode` propio, sin silencio independiente ni medición por canal.
- **Sin soporte multipista ni monitoreo:** No existen múltiples entradas de micrófono simultáneas, archivos multimedia con audio, compensación de latencia (lip-sync) ni bus de monitoreo con control de retorno.
- **Audio de efectos UI separado:** `src/utils/audio.ts` mantiene un segundo `AudioContext` (`sharedAudioCtx`) exclusivo para sonidos de obturador y cuenta regresiva.

### 2.3 Captura de Ventanas y Pantalla (`src/App.tsx`, `electron/main.ts`)

- Existen dos mecanismos separados:
  1. `captureOtherWindowScreenshot()`: llama `navigator.mediaDevices.getDisplayMedia()`, captura un único fotograma PNG y cierra el stream inmediatamente (solo sirve como foto en galería o imagen de fondo estática).
  2. `toggleScreenPip()`: abre un único `screenStreamRef` en vivo y lo delega a `renderCameraFrame()`, limitado a dos layouts hardcodeados (`'pip'` esquina circular/rectangular o `'screen-only'`).
- En Electron (`electron/main.ts`), `setDisplayMediaRequestHandler` invoca `desktopCapturer.getSources` y muestra `picker.html`. Solo gestiona un flujo activo por llamada y carece de metadatos persistentes de fuente (ID de ventana/pantalla en escena, estado de desconexión/reconexión, recorte por región).

### 2.4 Procesamiento Gráfico, WebGL2 y MediaPipe (`canvasProcessor.ts`, `webglEffects.ts`, `aiVision.ts`)

- **Buffers singleton globales:**
  - `canvasProcessor.ts` utiliza variables globales a nivel de módulo (`workCanvas`, `rawCanvas`, `pixelCanvas`, `blurCanvas`, `rotCanvas`, `segSampleCanvas`, `segMaskCanvas`, `segFgCanvas`, `prevStabLum`, `prevSegMask`).
  - `webglEffects.ts` utiliza un único `WebglPipelineState` global y realiza copias entre GPU (WebGL2) y Canvas 2D (`texImage2D` entrada → `drawImage(canvas)` salida) por cada pasada de color y efecto.
  - `aiVision.ts` usa singletons para `segmenterInstance`, `faceDetectorInstance` y **buffers temporales globales** (`prevAiAlpha`, `lastSegTs`, `lastDetTs`). Al usar `runningMode: 'VIDEO'`, alternar dos cámaras en la misma instancia corrompería el suavizado temporal EMA y los timestamps monotónicos.
- **Asignación en caliente en ruta 60fps:** En `canvasProcessor.ts` (línea ~1109), cuando `isScreenPipActive` está activo con un `effectId !== 'none'`, se crea `document.createElement('canvas')` **en cada fotograma**.
- **Segmentación sin canal alfa transparente:** `applyBackgroundSegmentation()` siempre reemplaza el fondo por un color sólido, desenfoque o imagen antes de devolver `filteredWorkCtx`, impidiendo superponer directamente al presentador recortado con transparencia sobre otra ventana (uso principal en tutoriales y demos de IA).
- **Readbacks síncronos en el hilo principal:** `computeHistogram()`, `computeMotionScore()`, `updateStabilizationDisplacement()`, `renderFocusPeakingOverlay()` y el fallback YCbCr realizan `getImageData()` sobre el hilo UI principal.

### 2.5 Separación Editor vs Salida Real (`CameraViewport.tsx`, `App.tsx`)

- **Canvas único acoplado:** `canvasRef` es simultáneamente:
  1. El lienzo donde dibuja el loop principal (`renderLoop`),
  2. El elemento visual mostrado dentro de `CameraViewport.tsx`,
  3. La fuente directa de `canvas.captureStream(60)` para grabación de video, captura de fotos y Picture-in-Picture flotante.
- Como consecuencia, cualquier transformación de inspección o comparación visual aplicada al flujo (por ejemplo A/B split wipe o zoom de comprobación) queda grabada en la salida final, y no existe un lienzo interactivo de escena para seleccionar, mover, redimensionar, recortar o alinear capas de forma independiente a la salida limpia ("Program Output").

### 2.6 Limitaciones del Sistema de Grabación (`App.tsx`, `storage.ts`)

1. **Acumulación íntegra en RAM:** `recordedChunksRef.current` almacena todos los fragmentos en memoria hasta `recorder.onstop`, creando un único `Blob` en RAM y duplicándolo al persistirlo en IndexedDB (`optica_studio_db`). Grabaciones largas de tutoriales en 1080p/4K (decenas de minutos) pueden provocar presión de memoria o fallo al guardar en IndexedDB.
2. **Sin streaming directo a disco en Desktop:** En Electron macOS no se escribe de forma incremental a un archivo temporal/final en disco (`~/Movies/...`) durante la grabación.
3. **Sin tolerancia a cierres inesperados:** Una interrupción antes de `onstop` descarta toda la grabación acumulada en RAM.
4. **Sin pistas de audio multipista independientes:** `MediaRecorder` en Chromium recibe un único `MediaStream` con una sola pista de audio mezclada; no permite grabar micrófono y audio de sistema/aplicación en pistas separadas para edición posterior.
5. **Disponibilidad de códecs dependiente del binario Chromium/Electron:** La selección `auto-mp4` (`avc1` + `mp4a`) depende del soporte real del runtime; si no está disponible, cae a WebM (`vp9/vp8`), sin notificación explícita previa ni remux/transcodificación asistida.
6. **Dependencia del hilo UI:** `captureStream(60)` está atado a `requestAnimationFrame` en el main thread, compitiendo con actualizaciones de React y readbacks `getImageData`.

---

## 3. Arquitectura Objetivo — Óptica Studio Pro

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           ÓPTICA STUDIO PRO                             │
├──────────────────────┬──────────────────────────┬───────────────────────┤
│   SourceManager      │   SceneEngine / Store    │   AudioMixerEngine    │
│  - CameraSource[]    │  - Scene[]               │  - Multi-bus WebAudio │
│  - DisplaySource[]   │  - SceneLayer[] (zIndex) │  - Gain/Comp/Mute/Solo│
│  - ImageSource[]     │  - Transform + Crop      │  - Peak/RMS Meters    │
│  - MediaVideoSource[]│  - Layer Style & FX      │  - Monitor & Master   │
│  - Color/TextSource[]│  - Transitions           │  - Lip-sync Delay     │
└──────────┬───────────┴────────────┬─────────────┴───────────┬───────────┘
           │                        │                         │
           ▼                        ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    GpuRenderPipeline (WebGL2 + MediaPipe)               │
│  - Caché de texturas y FBOs por fuente/capa (sin asignación por frame)  │
│  - Segmentación IA con soporte alfa transparente ('transparent')        │
│  - Instancias/contextos de estado temporal aislados por sourceId        │
└──────────────────────┬──────────────────────────┬───────────────────────┘
                       │                          │
                       ▼                          ▼
        ┌──────────────────────────┐ ┌──────────────────────────┐
        │   ProgramOutputCanvas    │ │   StudioEditorViewport   │
        │  (Composición limpia)    │ │  (Preview + Overlays UI) │
        │  -> Grabación / Foto     │ │  - Handles, Snap, Guías  │
        │  -> Floating Output PiP  │ │  - Teleprompter privado  │
        └──────────────┬───────────┘ └──────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────────┐
        │        Recording & Export Engine         │
        │  - Web: MediaRecorder + IndexedDB        │
        │  - Desktop: Streaming incremental a disco│
        │    + Metadata de proyecto/escena         │
        └──────────────────────────────────────────┘
```

### 3.1 Modelo de Fuentes Audiovisuales Independientes (`SourceManager`)

Cada fuente se registra una vez con un `sourceId` único y contador de uso por capas:

```ts
export type SourceKind =
  | 'camera'
  | 'window'
  | 'screen'
  | 'image'
  | 'video-file'
  | 'color'
  | 'text';

export type SourceStatus = 'idle' | 'initializing' | 'live' | 'paused' | 'disconnected' | 'error';

export interface StudioSource {
  id: string;
  kind: SourceKind;
  name: string;
  status: SourceStatus;
  intrinsicWidth: number;
  intrinsicHeight: number;
  hasAudio: boolean;
  muted?: boolean;
  // Referencia runtime no serializable en Registry separado (MediaStream, HTMLVideoElement, HTMLImageElement)
  config:
    | { kind: 'camera'; deviceId: string; preferredWidth: number; preferredHeight: number }
    | { kind: 'window' | 'screen'; displaySurfaceHint?: string; includeAudio: boolean }
    | { kind: 'image'; src: string; assetId?: string }
    | { kind: 'video-file'; src: string; loop: boolean; playbackRate: number }
    | { kind: 'color'; color: string; gradientEnd?: string }
    | { kind: 'text'; text: string; fontFamily: string; fontSize: number; color: string; bgGlass: boolean };
}
```

- **Compartición eficiente:** Dos escenas pueden usar la misma `camera` (`FaceTime HD`) sin abrir dos veces el hardware. Cuando ninguna capa visible referencia una fuente de archivo/cámara secundaria opcional, puede pausarse su decodificación o mantenerse caliente según preferencia de latencia de cambio de escena.
- **Reconexión limpia:** Si una ventana capturada se cierra (`track.onended`), la fuente pasa a `disconnected` preservando la geometría de la capa y permitiendo re-vincular otra ventana en un clic sin rehacer el layout.

### 3.2 Modelo de Escenas, Capas y Transformaciones

```ts
export interface LayerTransform {
  // Coordenadas normalizadas respecto al lienzo maestro (0..1) -> independiente de 720p/1080p/4K
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number; // rotación libre (0..360) o pasos de 90°
  flipH: boolean;
  flipV: boolean;
  fitMode: 'contain' | 'cover' | 'stretch';
  // Recorte normalizado de la fuente original (0..0.49)
  crop: { top: number; right: number; bottom: number; left: number };
}

export interface LayerStyle {
  opacity: number; // 0..1
  blendMode: 'normal' | 'screen' | 'multiply' | 'overlay';
  shape: 'rect' | 'rounded' | 'circle' | 'squircle';
  cornerRadiusPx: number;
  borderWidth: number;
  borderColor: string;
  shadowBlur: number;
  shadowOpacity: number;
}

export interface LayerProcessing {
  filterId: FilterPresetId;
  effectId: VisualEffectId;
  adjustments: ColorAdjustments;
  stabilization: StabilizationSettings;
  focus: FocusSettings;
  background: BackgroundSegmentationSettings & {
    mode: BackgroundReplaceMode | 'transparent';
  };
}

export interface SceneLayer {
  id: string;
  sourceId: string;
  name: string;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  transform: LayerTransform;
  style: LayerStyle;
  processing?: Partial<LayerProcessing>;
}

export interface SceneTransition {
  type: 'cut' | 'fade' | 'slide-left' | 'slide-up';
  durationMs: number;
}

export interface StudioScene {
  id: string;
  name: string;
  presetKind?: 'custom' | 'full-cam' | 'tutorial-pip' | 'split-50-50' | 'ai-demo-triptych';
  backgroundColor: string;
  transition: SceneTransition;
  layers: SceneLayer[];
}
```

### 3.3 Reutilización de WebGL2 y MediaPipe

1. **WebGL2 (`webglEffects.ts` → `WebglProcessor`):**
   - Mantener los 21 shaders de color grading (`COLOR_FRAG_SRC`) y 15 efectos (`EFFECT_FRAG_SRC`) ya calibrados.
   - Sustituir el singleton por caché indexado por `layerId` con texturas reutilizables y dos FBOs intermedios para encadenar `ColorGrade -> VisualEffect -> AlphaMask/RoundedRect` íntegramente en GPU.
   - Eliminar el canvas temporal creado por frame en `canvasProcessor.ts`.
2. **MediaPipe (`aiVision.ts`):**
   - Reutilizar la carga local offline (`/mediapipe/wasm` + `/mediapipe/models/*.tflite`).
   - Desacoplar el buffer temporal `prevAiAlpha` y el control de timestamps en un `Map<string, AiLayerRuntimeState>` indexado por `sourceId`, y utilizar instancias/contextos independientes si más de una fuente de cámara activa segmentación simultáneamente.
   - Incorporar `background.mode = 'transparent'` para extraer exclusivamente al presentador con canal alfa suavizado sobre cualquier ventana de código, terminal o demo de IA.

### 3.4 Separación Editor Visual vs Composición de Programa

| Aspecto | `ProgramCompositor` (Salida Real) | `StudioStageViewport` (Editor Visual) |
|---|---|---|
| **Propósito** | Renderizar exactamente lo que se graba, fotografía y envía a PiP | Permitir editar capas, encuadre y herramientas de apoyo |
| **Resolución** | Resolución nativa de proyecto (`1280×720`, `1920×1080`, `3840×2160` en 16:9 / 9:16 / etc.) | Escalada CSS/Canvas al panel del estudio |
| **Capas renderizadas** | Solo capas de la escena activa (y transición activa), branding de programa | Imagen del `ProgramCompositor` + overlays no destructivos |
| **Elementos excluidos de grabación** | Sin guías de tercios, sin cajas de detección facial, sin manijas de selección, sin teleprompter privado, sin zoom de inspección | Dibuja marcos de selección, handles de redimensionado/crop, guías snap, focus peaking y teleprompter |
| **Consumidores** | `captureStream(60)` (grabación), captura PNG, Picture-in-Picture flotante | Interacción puntero/teclado del operador |

### 3.5 Captura de Ventanas y Composición con Cámara del Presentador

- **Flujo de trabajo especializado para tutoriales y demos IA:**
  1. **Escena 1 (Intro):** Cámara principal a pantalla completa con LUT cinematográfico (`Cine 2383` / `Teal & Orange`) y Lower-Third del presentador.
  2. **Escena 2 (Tutorial / Demo IA):** Capa base `window` (IDE, navegador con modelo IA, terminal) con recorte opcional de barras del sistema + Capa `camera` encima en esquina (`squircle` / `circle` / `'transparent'` sin fondo mediante MediaPipe) con color grading independiente que no altera la legibilidad del texto en la app capturada.
  3. **Escena 3 (Vista Comparativa Split):** Capa ventana 65% izquierda + Capa presentador 35% derecha sobre fondo Liquid Glass oscuro.
- **Limitaciones reales de macOS documentadas:**
  - La captura de ventanas en Electron/Chromium depende del permiso del usuario en *Privacidad y seguridad → Grabación de pantalla*.
  - En macOS sin plugin ScreenCaptureKit nativo, `getDisplayMedia` captura audio mediante loopback del sistema (cuando está habilitado) y no aísla audio por PID/aplicación individual.

---

## 4. Plan Maestro de Checkpoints y Criterios de Aceptación

| Checkpoint | Nombre | Objetivo Principal | Criterios de Aceptación |
|---|---|---|---|
| **CP-P00** | Auditoría y arquitectura del estudio profesional *(Aprobado)* | Diagnosticar código real, diseñar arquitectura modular, modelo de escenas/fuentes y documentar hoja de ruta | `PROJECT-MASTER.md` aprobado; diagnóstico fiel al código real; cero regresión en código actual. |
| **CP-P01-A** | Modelo de datos y persistencia *(Completado)* | Definir esquema estricto de proyectos/escenas/fuentes/capas, operaciones puras, 7 plantillas iniciales y almacenamiento IndexedDB versionado independiente de la galería | Tipos estrictos en `src/types/studio.ts`; motor puro `src/engine/sceneEngine.ts`; 7 plantillas en `src/engine/scenePresets.ts`; `src/utils/studioStorage.ts` con migración/recuperación; pruebas automatizadas 9/9, `npm run lint` y `npm run build` en verde. |
| **CP-P01-B** | `SourceManager` y ciclo de vida de fuentes *(Completado)* | Gestionar en memoria de ejecución fuentes activas (`camera`, `window`, `screen`, `image`, `video-file`, `color`, `gradient`, `text`, audio) con propiedad explícita por consumidor, control de concurrencia, reconexión y liberación limpia | Múltiples cámaras y ventanas concurrentes compartidas sin duplicar hardware; cámara desacoplada de micrófono (`audio: false`); protección de pistas compartidas; 29/29 pruebas (`CP-P01-A` + `CP-P01-B`), `npm run lint` y `npm run build` en verde. |
| **CP-P01-C** | `ProgramCompositor` y composición audiovisual *(Completado)* | Implementar el compositor maestro multi-capa sobre `programCanvas` limpio separado del viewport visual | Orden `zIndex`, `crop`, `transform` normalizado, máscaras (`rect`, `rounded`, `circle`, `squircle`), opacidad, bordes/sombras, alpha transparente sin halos, transiciones `cut`/`fade`, caché de texturas WebGL2 y 53/53 pruebas (`CP-P01-A`+`B`+`C`), `npm run lint` y `npm run build` en verde. |
| **CP-P01-D** | Integración retrocompatible con la aplicación existente *(Completado)* | Conectar `SourceManager` + `ProgramCompositor` con `App.tsx` mediante hook dedicado preservando 100% de UI y funciones actuales | `Estudio`, `Filtros`, `Cabina`, `Grabación`, `Galería` y atajos operativos sin cambios visuales regresivos; `Legacy <-> Studio` con cesión segura de pistas; grabación, foto, cabina 4× y PiP alimentados desde `ProgramCanvas` en modo Studio; 68/68 pruebas, lint y build en verde. |
| **CP-P01-D0** | Apple 27 Experience & Liquid Glass *(Aprobado para refinamiento)* | Rediseñar la arquitectura de interfaz, sistema de diseño semántico Dark/Light, 4 materiales Liquid Glass, barra Apple 27, panel izquierdo organizador y salvaguarda de rendimiento en grabación sin alterar motores | Tokens semánticos `tokens.css`, 15 primitivas `src/components/glass/`, `TopBar` 3 zonas, `LeftStudioPanel` colapsable/fijable/redimensionable, `Modo Cine`, captura continua al visitar `Galería`, salvaguarda low-cost en grabación y 73/73 pruebas en verde. |
| **CP-P01-D0.1** | Refinamiento estético, proporciones y diseño adaptable *(Completado)* | Simplificar jerarquía de contenedores, eliminar cajas anidadas redundantes, corregir proporciones achatadas en desktop compacto (`960×640` a `1280×800`) y adaptar fluidamente sin `transform: scale()` | Superficie continua (`studio-chrome-bar` / `studio-chrome-panel`), Liquid Glass reservado a HUDs/popovers/modales/menús, dock inferior en 1 sola fila con CSS Container Queries (`@container stage`), inspector lado a lado desde `880px` con ancho `clamp(268px,24vw,368px)`, relación de aspecto intacta y 73/73 pruebas en verde. |
| **CP-P01-E** | Validación funcional, rendimiento y pruebas | Verificar ciclo completo multipista, estabilidad 60fps, consumo de memoria, legibilidad Liquid Glass y compatibilidad Web + Desktop macOS | Suite de pruebas ampliada, pruebas de regresión en navegador y lista de verificación física en macOS ARM64. |
| **CP-P02** | Editor visual interactivo de capas y plantillas Liquid Glass | Manipulación directa en el viewport (arrastrar, redimensionar, recortar, reordenar capas, snap guides) y panel de Escenas/Fuentes con estética Apple Liquid Glass | Selección/transformación por ratón en viewport; panel de Escenas y Fuentes integrado sin romper pestañas actuales; plantillas 1-clic. |
| **CP-P03** | Pipeline GPU WebGL2 + MediaPipe por capa y transparencia real | Refactorizar `webglEffects.ts` y `aiVision.ts` con caché GPU por capa/fuente y segmentación `'transparent'` | Presentador recortado con IA sobre ventana de app sin fondo sólido; LUTs/efectos independientes por capa; 0 asignaciones `createElement('canvas')` por frame. |
| **CP-P04** | Consola de Audio Multipista Profesional | Bus Web Audio por fuente (múltiples micrófonos, audio de ventana/sistema, clips) con ganancia, compresor, mute/solo, vúmetros y sync delay | Controles de volumen/mute por fuente; vúmetros independientes; mezcla exacta reflejada en la grabación. |
| **CP-P05** | Motor de Grabación de Alta Fiabilidad y Streaming a Disco (macOS) | Eliminar dependencia única de RAM en grabaciones largas mediante escritura incremental segura en Electron + detección real de códecs + recuperación | En Desktop macOS: escritura incremental a disco; en Web: `MediaRecorder` + IndexedDB; reporte real de códec y tamaño. |
| **CP-P06** | Herramientas de Productividad para Tutoriales y Demos IA | Clips B-roll, tarjetas de texto en capa, marcadores de capítulos durante grabación y perfiles de proyecto importables/exportables | Inserción de slides/videos B-roll; lower-thirds editables como capas; marcadores exportables; verificación integral web y macOS ARM64. |

---

## 5. Registro de Implementación `CP-P01-A` (Modelo de datos y persistencia)

### 5.1 Archivos Creados / Modificados

- `src/types/studio.ts`: Modelo estricto con versión de esquema (`CURRENT_STUDIO_SCHEMA_VERSION = 1`), uniones discriminadas para los 11 tipos de fuente (`camera`, `window`, `screen`, `image`, `video-file`, `color`, `gradient`, `text`, `microphone`, `system-audio`, `audio-file`), capas (`SceneLayer`), transformaciones normalizadas (`LayerTransform`, `LayerCrop`, `STUDIO_COORDINATE_SYSTEM`), estilos (`LayerStyle`), procesamiento por fuente compartida vs instancia (`LayerProcessing` con `background.mode = 'transparent'`), `AudioSourceSettings`, `RecordingProfile`, `SceneTransition`, `StudioPreset` y separación explícita de `SourceRuntimeState` y `SourceRuntimeResources`.
- `src/engine/sceneEngine.ts`: Operaciones puras e inmutables para crear/renombrar/duplicar/eliminar escenas de forma segura (impide eliminar la última escena y reasigna `activeSceneId`), gestionar fuentes, añadir/quitar capas sin destruir fuentes compartidas, reordenar `zIndex`, cambiar visibilidad/bloqueo, validar y acotar transformaciones/recortes, resolver procesamiento efectivo (`resolveEffectiveLayerProcessing`), detectar recursos activos (`containsRuntimeResources`) y validar integridad referencial (`validateProjectReferences`).
- `src/engine/scenePresets.ts`: 7 plantillas iniciales editables e independientes (*Cámara principal*, *Tutorial IA con pantalla y presentador flotante*, *Pantalla dividida*, *Comparativa entre dos aplicaciones*, *Demostración a pantalla completa*, *Reel vertical 9:16*, *Apertura y cierre*).
- `src/utils/studioStorage.ts`: Almacenamiento versionado en base de datos IndexedDB dedicada (`optica_studio_projects_db`, completamente separada de `optica_studio_db` de la galería para evitar `VersionError` y proteger capturas existentes) + puntero de proyecto activo en `localStorage`, sanitización anti-blobs grandes/objetos runtime, migración no destructiva `v0 -> v1`, recuperación limpia ante JSON corrupto, guardado controlado con debounce y adaptador inyectable para pruebas deterministas.
- `tests/studioModel.test.ts` y script `"test": "tsx --test tests/*.test.ts"` en `package.json`.

### 5.2 Resultados de Verificación (`CP-P01-A`)

- `npm test` (`tsx --test tests/*.test.ts`): **9/9 pruebas superadas** (creación/unicidad, duplicación con fuentes compartidas, eliminación segura, reordenamiento/bloqueo/clamping, overrides por instancia, serialización/persistencia, migración v0->v1 y recuperación ante JSON corrupto, bloqueo de recursos runtime en serialización, integridad de las 7 plantillas).
- `npm run lint` (`tsc --noEmit && tsc -p electron/tsconfig.json --noEmit`): **0 errores**.
- `npm run build` (`vite build`): **compilado correctamente**.

### 5.3 Riesgos y Limitaciones Conocidas en `CP-P01-A`

- La persistencia real sobre `IndexedDB` del navegador/Electron se implementó siguiendo el patrón exacto de `src/utils/storage.ts`, pero la suite automatizada en Node.js validó la lógica de serialización, migración y recuperación mediante `createInMemoryStudioStorageAdapter()` (la verificación sobre IndexedDB real de Chromium/Electron se completará en `CP-P01-D/E`).
- Las 7 plantillas iniciales y el modo de fondo `'transparent'` son definiciones estructuradas listas para el motor, pero aún no se renderizan visualmente hasta implementar `CP-P01-B`, `CP-P01-C` y `CP-P03`.

---

## 6. Registro de Implementación `CP-P01-B` (`SourceManager` y ciclo de vida de fuentes)

### 6.1 Archivos Creados / Modificados

- `src/engine/sourceManager.ts`: Gestor central de recursos audiovisuales completamente desacoplado de React, UI, `App.tsx`, WebGL2, MediaPipe y Electron main. Implementa:
  - Registro en memoria por `sourceId` separando definición persistente (`StudioSource`), estado (`SourceRuntimeState`), metadatos reales (`SourceRuntimeDetails`), recursos vivos (`SourceRuntimeResources`), propietarios explícitos (`Map<string, SourceConsumer>`), control de tokens de operación (`operationToken` + `globalEpoch`) y limpieza determinista de listeners/tracks.
  - Adquisición independiente de cámaras (`audio: false`), lectura fiel de `getSettings()`/`getCapabilities()` y política de compartición de dispositivo físico (`reuse-existing`, `prefer-highest`, `reject-incompatible`).
  - Adquisición independiente de micrófonos (`video: false`), capturas concurrentes `window`/`screen` vía `getDisplayMedia`, compartición segura de pistas de audio entre capturas de ventana y `system-audio` mediante tabla `trackOwners`, y carga de `image`/`video-file`/`audio-file` con revocación exclusiva de Object URLs creadas por el gestor.
  - Fuentes gráficas (`color`, `gradient`, `text`) en estado `'live'` sin abrir hardware ni crear `MediaStream`.
  - Adaptadores inyectables (`MediaDevicesAdapter`, `MediaElementFactoryAdapter`, `AssetUrlAdapter`) y detección honesta de capacidades reales (`detectPlatformMediaCapabilities()`).
- `tests/sourceManager.test.ts`: Suite automatizada de 20 pruebas unitarias deterministas con adaptadores instrumentados.

### 6.2 Política de Estados y Propiedad

- **Estados válidos:** `idle` ↔ `initializing` → `live` ↔ `paused` → `disconnected` / `error` → `idle`.
- **Política de `paused`:** Mantiene viva la conexión física del stream (`track.enabled = false` solo en pistas no compartidas; `element.pause()` en archivos locales) para evitar reactivar cuadros de diálogo de permiso en macOS o perder la ventana compartida al reanudar.
- **Propiedad por consumidor:** Cada consumidor (`active-scene`, `staged-scene`, `preview`, `program-compositor`, `audio-mixer`, `custom`) se registra por identificador único de forma idempotente; las pistas físicas permanecen vivas mientras exista al menos un consumidor y ninguna otra fuente comparta la misma pista en `trackOwners`.

### 6.3 Resultados de Verificación (`CP-P01-B`)

- `npm test` (`tsx --test tests/*.test.ts`): **29/29 pruebas superadas** (20 de `tests/sourceManager.test.ts` + 9 existentes de `tests/studioModel.test.ts`) usando adaptadores simulados instrumentados en Node.js.
- `npm run lint` (`tsc --noEmit && tsc -p electron/tsconfig.json --noEmit`): **0 errores**.
- `npm run build` (`vite build`): **compilado correctamente**.

### 6.4 Limitaciones, Riesgos y Pruebas Pendientes en macOS

- **Entorno Google AI Studio / Web:** `getDisplayMedia()` requiere gesto explícito del usuario en cada adquisición o reconexión; dentro de iframe web la captura de ventanas del sistema operativo puede estar restringida por políticas del navegador anfitrión.
- **Audio de sistema en macOS:** Sin extensión nativa ScreenCaptureKit, `desktopCapturer` + `setDisplayMediaRequestHandler` únicamente ofrece loopback de sistema cuando el usuario lo solicita y no permite aislar audio por aplicación/PID individual.
- **Pruebas físicas pendientes en macOS ARM64 (Apple Silicon):** Validar con hardware real la captura simultánea de cámara FaceTime HD + iPhone Continuity Camera + múltiples ventanas (`ChatGPT`, `VS Code`, `Google AI Studio`), la desconexión física USB/Continuity, el comportamiento real al minimizar ventanas en macOS (`onmute`/`onunmute`) y el selector IPC nativo `picker.html`.

---

## 7. Registro de Implementación `CP-P01-C` (`ProgramCompositor` y composición audiovisual)

### 7.1 Archivos Creados / Modificados

- `src/engine/programCompositor.ts`: Compositor audiovisual maestro de programa completamente desacoplado de React, `App.tsx`, `CameraViewport.tsx`, `SourceManager` (no adquiere ni detiene pistas), `aiVision.ts` y `webglEffects.ts`. Implementa:
  - **Resolución y matemática pura independiente del DOM:** `resolveOutputDimensions()`, perfil inicial `1920×1080 @ 30fps`, formatos estándar (`1080p`, `1440p`, `4K` horizontal, `1080×1920` vertical, `1080×1080` cuadrado), cálculo geométrico determinista `computeLayerRenderGeometry()` en orden explícito (`crop` normalizado sobre tamaño intrínseco → coordenadas/anclaje normalizados → `contain`/`cover`/`stretch` → `rotationDeg` + `flipH`/`flipV` → escala proporcional al lado menor respecto a 1080p) y composición matemática `compositeStraightAlphaPixel()`.
  - **Backend dual tras interfaz unificada `CompositorRenderBackend`:**
    1. `Webgl2CompositorBackend` (backend GPU principal): VAO/VBO único `[0..1]`, shader GLSL ES 3.00 con transformaciones afines en espacio clip (`rotationDeg`, `flipH`, `flipV`, pivote `anchor`), sub-rectángulo UV de `crop` + `contain` (`u_srcUvRect`, `u_contentMinUv`, `u_contentMaxUv`), máscaras SDF con suavizado AA (`rect`, `rounded`, `circle`, superelipse continua `squircle`), bordes nítidos, des-premultiplicación de alfa (`u_alphaMode`) para eliminar halos oscuros, caché de `WebGLTexture` por `sourceId` + `frameSignature` (evita `texImage2D` redundantes cuando el fotograma no ha cambiado), doble FBO reutilizable (`fboA`/`fboB`) para transición `fade`, caché estática `StaticGraphicRasterCache` para `gradient`/`text` y recuperación ante `webglcontextlost`/`webglcontextrestored`.
    2. `Canvas2dCompositorBackend` (respaldo y pruebas sin WebGL2): Cero asignaciones de `<canvas>` por fotograma en el bucle de renderizado (usa scratch buffers reutilizables solo para `fade`), sombra exterior dibujada **antes** de `ctx.clip()`, trazado exacto `traceMaskPathOn2dContext()` (`rect`, `rounded`, `circle`, `squircle`), bordes, modos de fusión (`blendMode`) y fuentes gráficas.
  - **Clase `ProgramCompositor`:** Mantiene invariable la referencia física `programCanvas`, excluye cualquier overlay de editor (guías, marcos, handles, teleprompter privado, cajas de detección), soporta inyección de superficies segmentadas con alfa mediante `setProcessedLayerSurface()`, planifica un único bucle temporal con control real de FPS (`24`/`25`/`30`/`60`) y `requestVideoFrameCallback`, protege fuentes salientes durante transiciones `fade` basadas en tiempo real (`getRequiredSourceIds()`) y aplica políticas ante fuentes no disponibles (`last-frame` con TTL, `hide`, `neutral-placeholder`) sin filtrar errores técnicos ni rutas privadas al lienzo de salida.
- `tests/programCompositor.test.ts`: Suite automatizada de 24 pruebas deterministas sobre matemática pura de píxeles, geometría, backends mock instrumentados (Canvas 2D y WebGL2) e integración con `SourceManager`.

### 7.2 Resultados de Verificación (`CP-P01-C`)

- `npm test` (`tsx --test tests/*.test.ts`): **53/53 pruebas superadas** (24 nuevas de `tests/programCompositor.test.ts` + 20 de `tests/sourceManager.test.ts` + 9 de `tests/studioModel.test.ts`).
- `npm run lint` (`tsc --noEmit && tsc -p electron/tsconfig.json --noEmit`): **0 errores**.
- `npm run build` (`vite build`): **compilado correctamente**.

### 7.3 Alcance Real de Validación, Limitaciones y Pruebas Pendientes en macOS

- **Validación ejecutada en contenedor Linux sin binario Chromium/GPU físico:** Los shaders, caché de texturas, FBOs y eventos `webglcontextlost`/`webglcontextrestored` se verificaron mediante contexto WebGL2 simulado instrumentado, contexto 2D instrumentado y pruebas matemáticas de composición alfa por píxel (`compositeStraightAlphaPixel`), no sobre una GPU real Apple Silicon ni Chromium real.
- **Pendiente para `CP-P03` (GPU avanzado por capa):** En `Webgl2CompositorBackend`, la sombra exterior difuminada (`shadowBlurPx`) y los modos de fusión shader avanzados (`screen`, `multiply`, `overlay`) distintos de `normal` se ejecutan actualmente en `Canvas2dCompositorBackend` y quedarán unificados en GPU multipasada dentro de `CP-P03` junto a la refactorización de `webglEffects.ts` y `aiVision.ts`.
- **Pruebas físicas pendientes en macOS ARM64 (Apple Silicon):** Medir tiempo de composición por fotograma, uso de GPU Metal vía ANGLE/Chromium, `canvas.captureStream()` a 30/60fps con múltiples capas (ventana + cámara + imagen + texto), ausencia real de fugas VRAM tras 100+ cambios de escena y comportamiento real ante pérdida/restauración de contexto GPU.

---

## 8. Registro de Implementación `CP-P01-D` (Integración retrocompatible con la aplicación existente)

### 8.1 Arquitectura de Integración y Regla de Motor Único

Para integrar `SourceManager`, `ProgramCompositor` y `studioStorage` sin romper la ruta estable de grabación ni ejecutar dos motores en paralelo, se definió una arquitectura de **motor único seleccionable** gobernada por `StudioCoordinator` (`src/engine/studioCoordinator.ts`) y expuesta a React mediante `useStudioEngine` (`src/hooks/useStudioEngine.ts`):

```text
+-------------------------------------------------------------------+
|                         App.tsx / UI                              |
|  Estudio | Filtros | Cabina 4x | Grabación (+Lab) | Galería       |
+---------------------------------+---------------------------------+
                                  |
             +--------------------+--------------------+
             | (engineMode === 'legacy', por defecto)  | (engineMode === 'studio')
             v                                         v
+---------------------------+       +----------------------------------------+
| Legacy Engine (Estable)   |       | StudioCoordinator + useStudioEngine    |
| - cameraStreamRef         |<----->| - adoptExternalMediaStream()           |
| - screenStreamRef         | Handoff| - detachExternalMediaStreamOwnership()|
| - WebGL / Canvas2D        | pistas | - SourceManager (fuentes compartidas)  |
| - canvasRef -> MediaRec   | sin    | - ProgramCompositor (ProgramCanvas)    |
+---------------------------+ cierre | - IndexedDB (optica_studio_projects_db)|
                                     +-------------------+--------------------+
                                                         |
                                                         v
                                     +----------------------------------------+
                                     | Salida limpia compartida en Studio:    |
                                     | -> Blit 1:1 en canvasRef (Preview)     |
                                     | -> Captura PNG / Cabina 4x / PiP       |
                                     | -> ProgramCanvas.captureStream() (Rec) |
                                     +----------------------------------------+
```

### 8.2 Archivos Creados y Modificados (`CP-P01-D`)

- **`src/engine/engineCompatibility.ts`** *(nuevo)*: Define `EngineMode` (`'legacy' | 'studio'`), persistencia segura en `localStorage` (`optica_studio_engine_mode_v1`) y la matriz honesta `STUDIO_ENGINE_COMPATIBILITY_MATRIX` con niveles reales (`full`, `bridged-camera`, `legacy-overlay`, `experimental`, `partial`, `none`).
- **`src/engine/sourceManager.ts`** *(ampliado)*: Añade `adoptExternalMediaStream()` y `detachExternalMediaStreamOwnership()` para transferir la propiedad de `MediaStream` vivos entre el modo Legacy y `SourceManager` sin cerrar pistas físicas ni provocar re-autorizaciones innecesarias.
- **`src/engine/studioCoordinator.ts`** *(nuevo)*: Orquestador puro (sin React ni DOM obligatorio) entre `SourceManager`, `ProgramCompositor` y `StudioStorageAdapter`. Gestiona proyecto inicial (`createStarterStudioProject()`), bloqueo durante grabación (`setRecordingLocked`), transiciones `cut` / `fade`, cesión bidireccional `Legacy <-> Studio`, captura autorizada de ventana/pantalla, cambio de perfil de resolución/aspecto, preferencia y recuperación de backend (`auto` / `webgl2` / `canvas2d`), puentes `setProcessedCameraSurface()` y diagnóstico bajo demanda (`getDiagnosticsSnapshot()`).
- **`src/hooks/useStudioEngine.ts`** *(nuevo)*: Hook puente mínimo para React que encapsula `StudioCoordinator`, evita creación de streams duplicados, propaga errores/recuperaciones y sincroniza el estado reactivo sin acoplar el motor al ciclo de render de React.
- **`src/components/SidebarControls.tsx`** *(ampliado sin alterar pestañas)*: Añade la prop opcional `studioEnginePanel` y renderiza al final de la pestaña `Grabación` la tarjeta colapsable **"Laboratorio Experimental · Studio Engine"** conservando íntegramente el estilo Apple Liquid Glass.
- **`src/App.tsx`** *(integración retrocompatible)*:
  - Mantiene **Legacy Engine** como motor por defecto (o respeta `'studio'` si el usuario lo activó explícitamente, evitando carrera de arranque en `startCameraStream()`).
  - En modo `'studio'`, aplica puente de efectos/segmentación únicamente a la capa de cámara (`setProcessedCameraSurface`) cuando hay filtros/ajustes/segmentación activos y `null` para paso directo GPU sin copia cuando no los hay.
  - En modo `'studio'`, bloquea cambios estructurales mientras `isRecording === true`, alimenta foto PNG, cabina fotográfica 4×, `MediaRecorder` y monitor PiP flotante desde `getOutputCaptureCanvas()` (`ProgramCanvas`), y libera pistas limpiamente en `beforeunload`.
- **`tests/studioIntegration.test.ts`** *(nuevo)*: 15 bloques de prueba deterministas que cubren los 18 escenarios de integración `Legacy <-> Studio`, persistencia de proyecto y modo, protección de pistas en `fade`, bloqueo de grabación, recuperación `webglcontextlost -> Canvas2D`, puente de cámara procesada y validación de que Legacy permanece intacto.

### 8.3 Política de Propiedad de Medios, Restricciones y Recuperación

1. **Propiedad exclusiva de pistas físicas (`Legacy <-> Studio`):**
   - Al pasar de `Legacy -> Studio`, `App.tsx` entrega `cameraStreamRef` (vídeo), `microphone` (audio si existe) y `screenStreamRef` mediante `adoptExternalMediaStream()`, limpiando las referencias activas del pipeline Legacy sin detener las pistas.
   - Al pasar de `Studio -> Legacy`, `StudioCoordinator` transfiere de vuelta la propiedad con `detachExternalMediaStreamOwnership()` o permite a Legacy reanudar limpiamente sin dejar dos bucles activos consumiendo cámara ni micrófono.
   - Durante una grabación (`isRecording === true`), el cambio de motor, el cambio de backend y el cambio de resolución/aspecto permanecen bloqueados para evitar rupturas del `MediaStream` entregado a `MediaRecorder`.
2. **Limitaciones honestas vigentes en `CP-P01-D`:**
   - La edición visual interactiva por ratón de capas/recortes permanece diferida para `CP-P02`.
   - Los filtros WebGL2, ajustes de color y segmentación MediaPipe operan en `CP-P01-D` mediante puente sobre la capa de cámara únicamente; el recorte transparente `'transparent'` del presentador sobre ventanas y las LUTs GPU independientes por capa llegarán en `CP-P03`.
   - La consola multipista Web Audio y el streaming incremental a disco en macOS permanecen planificados para `CP-P04` y `CP-P05` respectivamente.
   - La compatibilidad de hardware Apple Silicon / Electron (`ANGLE/Metal`, `captureStream()`, `IndexedDB` real y permisos de pantalla macOS) sigue pendiente de validación física en `CP-P01-E`.
3. **Activación y recuperación rápida:**
   - **Activación experimental:** Abrir pestaña `Grabación` → expandir **"Laboratorio Experimental · Studio Engine"** → pulsar **"Activar Studio Engine"**.
   - **Recuperación:** El usuario puede volver a **Legacy Engine (Estable)** con un clic desde el mismo panel (o automáticamente ante un fallo crítico recuperable) o forzar el backend **Canvas 2D** si WebGL2 pierde el contexto durante pruebas.

### 8.4 Resultados de Verificación (`CP-P01-D`)

- `npm test` (`tsx --test tests/*.test.ts`): **68/68 pruebas superadas** (`15` nuevos bloques en `tests/studioIntegration.test.ts` + `24` en `tests/programCompositor.test.ts` + `20` en `tests/sourceManager.test.ts` + `9` en `tests/studioModel.test.ts`).
  - *Nota honesta de alcance:* Las 15 pruebas de integración en Node.js emplean adaptadores simulados/instrumentados (media, canvas 2D, WebGL2 stub e IndexedDB en memoria) y **no constituyen validación física** sobre Chromium/Electron/Metal/macOS ARM64.
- `npm run lint` (`tsc --noEmit && tsc -p electron/tsconfig.json --noEmit`): **0 errores**.
- `npm run build` (`vite build`): **compilado correctamente**.
- `npm run desktop:build` (`icons:build && build && node scripts/build-electron.mjs`): **compilado correctamente** (`dist/`, `dist-electron/main.cjs`, `preload.cjs`, `picker-preload.cjs` sin modificar `electron/main.ts`, `electron/preload.ts` ni `electron-builder.yml` y sin generar `.dmg`).

---

## 9. Registro de Implementación `CP-P01-D0` (Apple 27 Experience & Liquid Glass)

### 9.1 Referencias Oficiales Apple HIG y Frontera Técnica Web/Electron

- **Alineación con Apple Human Interface Guidelines (Liquid Glass & Materials):**
  - Separación estricta entre **capa funcional Liquid Glass** (navegación flotante, controles sobre el visor, popovers, menús contextuales) y **capa de contenido** (lienzo audiovisual protagonista `CameraViewport`, cuadrícula de `Galería`), evitando apilar vidrio sobre vidrio o contaminar el video en vivo.
  - Jerarquía tipográfica Apple (`-apple-system`, `SF Pro Display / Text`, `SF Mono` con `tabular-nums` obligatorio en cronómetros, sensores, zoom, dimensiones y métricas técnicas).
  - Respeto explícito de accesibilidad (`prefers-reduced-transparency`, `prefers-reduced-motion`, foco visible con contraste alto y navegación por teclado).
- **Frontera técnica honesta (CSS Web/Chromium vs AppKit nativo):**
  - La experiencia visual está implementada mediante CSS moderno (`backdrop-filter`, gradientes especulares, hairlines adaptables y animaciones de resorte vía `motion/react`) compartida entre Web y Electron sin modificar `electron/main.ts`, `electron/preload.ts` ni añadir APIs privadas no documentadas. No equivale a `NSGlassEffectView` nativo de macOS SwiftUI/AppKit; mantiene compatibilidad completa con Chromium/Electron manteniendo margen seguro superior para los semáforos de macOS cuando `window.opticaDesktop.platform === 'darwin'`.

### 9.2 Arquitectura Visual, Materiales y Primitivas Creadas

- **Tokens y 4 Niveles de Material (`src/styles/tokens.css`, `src/index.css`):**
  - Variables semánticas duales para **Modo Oscuro profesional** (`.dark`, postura inicial predeterminada) y **Modo Claro** (`:root`), más variaciones `[data-glass-profile="clear | regular | tinted"]`.
  - **4 materiales diferenciados:**
    1. `.glass-clear`: máxima translucidez para HUD y controles flotantes directamente sobre el escenario audiovisual (perfil por defecto sobre el visor).
    2. `.glass-regular`: barra superior Apple 27, dock inferior y barra lateral izquierda.
    3. `.glass-dense`: inspector derecho, popovers, menús contextuales y modales para legibilidad numérica y técnica alta.
    4. `.glass-solid`: superficie opaca de alto contraste para `Transparencia reducida`, `prefers-reduced-transparency` y modo ligero automático durante grabación.
- **Preferencias, Accesibilidad y Salvaguarda de Grabación (`src/utils/appearanceSettings.ts`, `src/hooks/useAppearance.ts`):**
  - Persistencia aislada en `localStorage` (`optica_studio_appearance_v1` y `optica_studio_left_panel_v1`) sin interferir con `optica_studio_db` ni `optica_studio_projects_db`.
  - Salvaguarda automática (`autoLowCostOnRecord: true` por defecto): al iniciar `isRecording`, activa `[data-low-cost="true"]` degradando desenfoques pesados CSS a `glass-solid` para proteger FPS de `WebGL2`, `MediaPipe`, `ProgramCompositor` y `MediaRecorder`, restaurando el perfil visual al detener la grabación.
- **Sistema de 15 Primitivas Glass UI (`src/components/glass/`):**
  - `GlassButton`, `GlassIconButton`, `GlassToolbar`, `GlassSegmentedControl` (indicador deslizante continuo `layoutId` con resorte y navegación por flechas), `GlassSlider` (doble clic para restablecer), `GlassToggle`, `GlassSelect`, `GlassStatusIndicator` (únicamente estado real en ejecución), `GlassDisclosure`, `GlassPopover`, `GlassContextMenu`, `GlassTooltip`, `GlassSidebar` (animación de ancho con resorte), `GlassInspector` y `GlassDialog`.
- **Workspace de 5 Zonas (`TopBar.tsx`, `LeftStudioPanel.tsx`, `CameraViewport.tsx`, `SidebarControls.tsx`, `GalleryView.tsx`, `App.tsx`):**
  - **Barra superior Apple 27 (`TopBar.tsx`):** 3 zonas (identidad + toggle panel izquierdo, navegación segmentada continua `Estudio / Filtros / Cabina / Grabación / Galería`, indicador de estado real + popover de Apariencia + Modo Cine `C` + Inspector `H` + CTA principal).
  - **Panel izquierdo organizador (`LeftStudioPanel.tsx`):** arranca colapsado como rail estrecho de 56 px con iconos (`Escenas`, `Fuentes`, `Plantillas`, `Capas`), se expande mediante resorte entre `240px–380px` con manejador de redimensionado, fijación (`pinned`), cambio de motor `await` seguro antes de activar plantillas `STUDIO_PRESETS` e inspección honesta de capas (diferiendo edición directa en lienzo a `CP-P02`).
  - **Escenario protagonista y Modo Cine (`CameraViewport.tsx`, `App.tsx`):** maximiza el viewport central, incorpora menú contextual derecho (`GlassContextMenu`), salida limpia continua al visitar `Galería` (`hiddenForGallery` mantiene montado el canvas para no interrumpir una grabación en curso) y **Modo Cine** (`C` / `Esc` / menú nativo `toggle-cinema-mode`) que oculta barra superior, panel izquierdo, inspector derecho y dock inferior dejando únicamente el botón flotante de salida.
  - **Inspector derecho contextual (`SidebarControls.tsx`) y Galería (`GalleryView.tsx`):** migrados íntegramente a las primitivas `Glass*` y grupos plegables `GlassDisclosure` conservando el 100 % de controles existentes y añadiendo la sección `Apariencia y Material` en `Grabación`.

### 9.3 Resultados de Verificación (`CP-P01-D0`)

- `npm test` (`tsx --test tests/*.test.ts`): **73/73 pruebas superadas** (`5` nuevas suites en `tests/appearanceDesign.test.ts` + `68` pruebas previas de `CP-P01-A/B/C/D`).
- `npm run lint` (`tsc --noEmit && tsc -p electron/tsconfig.json --noEmit`): **0 errores**.
- `npm run build` (`vite build`) y `npm run desktop:build`: **compilados correctamente** sin alterar `electron/main.ts`, `electron/preload.ts` ni `package.json`, y sin generar `.dmg`.
- *Alcance honesto:* La verificación de renderizado visual real en Chromium/Electron macOS ARM64 permanece diferida para `CP-P01-E` y motivó el refinamiento visual inmediato documentado en `CP-P01-D0.1` tras la primera inspección física en Mac.

### 9.4 Refinamiento Estético, Proporciones y Diseño Adaptable (`CP-P01-D0.1`)

Tras compilar e instalar la app en macOS ARM64 se identificaron dos defectos visuales prioritarios: exceso de tarjetas/cajas anidadas (múltiples islas translúcidas simultáneas) y sensación de interfaz achatada/comprimida en tamaños de ventana compactos (`960×640` a `1280×800`).

#### Diagnóstico de Causa Raíz
1. **Aplastamiento vertical en `960×640`:** `electron/main.ts` define `minWidth: 960, minHeight: 640`, pero `<main>` cambiaba a fila recién en `lg` (`1024px`). Entre `960px` y `1023px`, `GlassInspector` se apilaba debajo del visor (`max-h-[46vh]`), reduciendo la altura útil del escenario audiovisual a `~175px`.
2. **Desperdicio de altura y exceso de islas flotantes:** La cabecera flotante con márgenes exteriores y el dock inferior de 2 filas (`rounded-[20px]`) consumían `~188px` verticales adicionales y fragmentaban el estudio en cajas independientes con bordes, sombras y divisores redundantes.

#### Mejoras Implementadas (sin alterar motores ni dimensiones de `ProgramCanvas`)
- **Superficie continua de estudio (`tokens.css`, `index.css`, `TopBar.tsx`, `GlassContainers.tsx`):**
  - Se introdujeron las superficies integradas `.studio-chrome-bar` y `.studio-chrome-panel` ancladas limpiamente al borde de la ventana con divisores `hairline` (`1px`) y sombras atenuadas en controles anclados, reservando el material Liquid Glass elevado (`glass-clear`, `glass-regular`, `glass-dense`) estrictamente para HUDs sobre el visor, popovers, menús contextuales y modales.
  - `TopBar` unificado a `48px` (`h-12`) integrando el margen seguro de semáforos macOS (`pl-[78px]`) y acceso constante al panel lateral en todos los anchos.
- **Escenario protagonista y barra de transporte única (`CameraViewport.tsx`):**
  - El dock flotante de 2 filas pasó a una **única barra integrada de `48px` (`min-h-[48px]`)** gobernada por **CSS Container Queries (`@container stage` con `.stage-meta-group`, `.stage-pip-label`, `.stage-recent-strip`)**, liberando `>3×` altura útil para la cámara en `640px` de alto y evitando compresión vertical sin recurrir jamás a `transform: scale()`.
  - El escenario (`stageRef`) conserva íntegra su relación de aspecto (`ResizeObserver` + `fittedW × fittedH`) sobre un pozo neutro (`--studio-stage-well`) sin alterar jamás los píxeles reales de `ProgramCanvas`.
- **Simplificación de jerarquía en paneles y galería (`LeftStudioPanel.tsx`, `SidebarControls.tsx`, `GalleryView.tsx`, `App.tsx`):**
  - `GlassInspector` pasa a disposición lado a lado desde `min-[880px]` con ancho fluido `clamp(268px, 24vw, 368px)` (eliminando el colapso vertical en `960×640` y evitando estiramiento en ultrawide).
  - `GlassSidebar` expandido por debajo de `1160px` actúa como cajón superpuesto `.studio-sidebar-drawer` sin comprimir el visor central ni el inspector.
  - Eliminados divisores `.liquid-divider` duplicados entre `GlassDisclosure`, eliminadas cajas anidadas alrededor de escenas, fuentes, plantillas, muestras de color, QR, estado IA, diagnósticos y cabecera de `Galería`, sustituyendo las tarjetas pesadas por filas limpias con `divide-y` y mosaicos planos.
- **Verificación (`CP-P01-D0.1`):**
  - `npm test`: **73/73 pruebas superadas**.
  - `npm run lint`, `npm run build` y `npm run desktop:build`: **0 errores**, sin modificar `SourceManager`, `ProgramCompositor`, `StudioCoordinator`, `useStudioEngine`, `MediaRecorder`, `MediaPipe`, `electron/main.ts`, `electron/preload.ts` ni `package.json`.
  - *Alcance honesto pendiente:* La inspección visual física final sobre ventana macOS ARM64 (`960×640`, `1280×800`, `1440×900`, `1512×982`, `1728×1117`, `1920×1080`, ultrawide y pantalla completa) queda lista para validación directa en el Mac del equipo antes de pasar a `CP-P01-E`.

---

## 10. Plan Detallado de Validación Física macOS ARM64 (`CP-P01-E`)

*(Pendiente de aprobación explícita del usuario antes de ejecutar.)*

1. **Matriz de pruebas físicas en Mac Apple Silicon (Electron Desktop + Chrome/Safari):**
   - **Permisos y fuentes reales:** Cámara Continuity/USB + micrófono integrado/externo + captura de ventana vía `getDisplayMedia` / selector nativo Electron tras otorgar permiso en *Privacidad y seguridad → Grabación de pantalla*.
   - **Conmutación `Legacy <-> Studio` en caliente:** Verificar 0 reaperturas de cámara (`getUserMedia`), 0 cortes de micrófono, ausencia de fugas de pistas (`track.readyState`) y 0 bucles paralelos en Activity Monitor / DevTools Performance.
   - **Compositor GPU (`ProgramCompositor` + ANGLE/Metal):** Medir frame time (`p50`/`p95`) a 1080p30 y 1080p60 en escenas `ai-tutorial-pip` (ventana + cámara `squircle` + fondo), `fullscreen-demo` y transiciones `fade` de 350 ms durante 100 cambios consecutivos, vigilando memoria VRAM/JS Heap.
   - **Experiencia visual Apple 27, Liquid Glass y rendimiento en grabación:** Validar contraste y legibilidad de `Glass Clear` / `Glass Regular` / `Glass Dense` en modo Oscuro y Claro, superficie continua refinada en `CP-P01-D0.1`, transición continua a `Galería` durante grabación activa, degradación automática a `data-low-cost="true"` al pulsar Grabar, animación/fijación/redimensionado de `LeftStudioPanel`, Modo Cine (`C`/`Esc`) y ausencia de aplastamientos o desbordamientos en `960×640`, `1280×800`, `1440×900`, `1512×982`, `1728×1117`, `1920×1080`, ultrawide y pantalla completa macOS (incluyendo semáforos Electron).
   - **Salida y grabación real:** Verificar PNG limpio, Cabina 4×, PiP flotante y grabación continua WebM/MP4 desde `ProgramCanvas.captureStream()`, confirmando que los overlays de seguimiento facial y el teleprompter nunca aparecen en el archivo exportado.
   - **Persistencia real y recuperación:** Comprobar lectura/escritura real en IndexedDB (`optica_studio_projects_db`) independiente de la galería (`optica_studio_db`) y preferencias visuales (`optica_studio_appearance_v1`, `optica_studio_left_panel_v1`), además de recuperación ante pérdida simulada de contexto WebGL2 (`WEBGL_lose_context`) hacia `Canvas2dCompositorBackend`.


### CP-P01-D0.1 — Ajuste local de barra superior macOS

Se reserva espacio de 100 px para los controles nativos de ventana, altura de 52 px y navegación centrada por grid con laterales independientes. Se reduce el borde del segmento y se adapta la distribución a anchos compactos. Sin cambios en los motores audiovisuales ni en Electron. Validación visual pendiente de aprobación del usuario.


### CP-P01-E4 — Validación física inicial (2026-11-25)

- CP-P01-D0.1: usuario aprobó la corrección de barra superior; pruebas visuales sistemáticas de tamaños y apariencia siguen pendientes.
- App instalada en /Applications/Optica Studio.app; sin dispositivos simulados. macOS 27.2.1, ARM64. Compilación previa: 73/73 pruebas, lint y desktop:build correctos.
- Inventario físico confirmado mediante system_profiler: FaceTime HD Camera, cámara Continuity de iPhone, micrófono integrado MacBook Pro e iPhone (48 kHz).
- Interfaz real consultada mediante accesibilidad: indicador «En vivo», «Studio Engine activo», FaceTime HD seleccionada y micrófono predeterminado integrado seleccionado. El servicio de captura de vídeo y el de audio de Electron están activos; WebGL2 y MediaPipe iniciados según log. Esto no verifica por sí solo fotogramas, continuidad de pistas, audio audible ni latencia.
- La apertura automatizada del diagnóstico no fue reproducible; no se comprobó todavía captura de ventana, autorización del selector, cambio Legacy/Studio, reconexión ni continuidad de pistas. No se iniciaron grabaciones, no se accedió al contenido de ventanas ni se alteraron permisos.
- Estado: E4 en progreso. Próxima comprobación: Grabación → Laboratorio Experimental · Studio Engine → Ver diagnóstico; autorizar ventana de prueba no privada, verificar fuentes/pistas; alternar Legacy/Studio sin grabar y verificar continuidad/reconexión. Medición GPU y grabaciones corresponden a E5–E7.
- Advertencia observada: CSP bloquea solicitud de telemetría de MediaPipe; mantener CSP, no es evidencia de fallo de captura.
- Repositorio GitHub sin modificar; sincronizar correcciones locales y fuente consolidada cuando corresponda.

### Documentación de usuario — manual de Óptica Studio Pro

Incorporado por solicitud del usuario al plan. Redactar de forma incremental durante E4–E7 y consolidar en E8 con capturas reales de la versión aprobada, guía rápida y versión PDF A4 navegable, sin duplicar documentación ni publicar funcionalidades no verificadas. Mantener marca propia de Óptica Studio; usar sistema visual JG Next Gen V3 final (carpeta confirmada Brand_Javier_V3_1_JGNextGen) como identidad editorial, sujeto a revisar reglas y activos del manual de marca antes de maquetar.

Referencias Drive verificadas por listado:
- Branding: https://drive.google.com/drive/folders/1iO27jJQ9r9dYo_F1HnbrNQcf3ro27MA0
- Manual de marca A4: https://drive.google.com/file/d/1ScQjdVEE1rz4lmJOQp6y-KKC1th40DLl/view

Contenido previsto: instalación y permisos, interfaz y navegación, cámara y micrófono, captura de ventana y pantalla, escenas/fuentes y plantillas, diferencias Legacy/Studio experimental, filtros y encuadre, grabación y exportación, galería, atajos y modo cine, problemas frecuentes y límites conocidos. No presentar funciones experimentales como definitivas. Actualizar el manual cuando se incorporen nuevas capacidades.


### CP-P01-E4 — Corrección local de captura de pantalla

Tras el aviso del usuario se identificó una inconsistencia: StudioCoordinator podía autorizar una fuente de pantalla fuera de la escena activa (p. ej. Solo Cámara) sin incorporarla al programa. Se corrigió para seleccionar una escena existente con la fuente visible únicamente después de una autorización exitosa. Se añadió una prueba simulada de regresión (74/74 pruebas superadas), mensajes ante errores de captura y diagnóstico nativo de estado de permiso sin modificar las autorizaciones ni CSP. Lint y desktop:build correctos. Paquete ARM64 firmado ad hoc e instalado en /Applications/Optica Studio.app con datos existentes conservados. Falta verificar físicamente la autorización, selección, composición y continuidad del vídeo de pantalla. El fallo observado por el usuario podría tener también otra causa, incluyendo permisos de macOS.

**Manual de usuario:** diseño intuitivo y poco cargado, instrucciones breves, capturas anotadas, una tarea principal por página o sección, espacio en blanco y jerarquía visual del branding NextGen V3.1. Evitar documentación técnica interna en la guía de usuario.


### CP-P01-E4 — Retiro de simulación en la interfaz

Por decisión del usuario, la aplicación de producción no debe utilizar cámara sintética ni etiquetas DEMO. Se sustituyó renderSyntheticCameraFeed por un cuadro neutro sin contenido simulado, se retiró el estado demo y se eliminó la superficie procesada ficticia en Studio Engine cuando no hay cámara real. Se actualizaron nombres visibles de fuentes y plantillas, incluidos nombres exactos heredados al restaurar el proyecto, sin alterar IDs internos. El botón inferior del visor ahora acciona Compartir pantalla en vivo; la captura PNG permanece disponible en los controles existentes de Grabación. Pruebas 74/74, lint y desktop:build correctos, paquete instalado y arrancado. La validación física del selector y captura sigue pendiente; no confundir con pruebas simuladas.


## 11. Base consolidada para Google AI Studio — CP-P02-A

2026-11-25: el usuario confirma que ya puede compartir pantalla desde la versión local corregida. CP-P01-E4: captura operativa según comprobación del usuario; continuidad de pistas, audio de sistema, reconexión y pruebas físicas E5–E7 aún pendientes. La aprobación de sincronización no equivale a aprobar una distribución final.

### Reglas de producción obligatorias

- No introducir modo DEMO, cámara sintética, contenido multimedia simulado, pistas falsas, placeholders que imiten contenido real ni estados de éxito ficticios. Los mocks se limitan a tests. Mantener IDs técnicos heredados cuando sean necesarios por compatibilidad de proyectos, sin exponerlos al usuario.
- Toda fuente física debe conectarse realmente. Distinguir desconectada, conectando, activa, pausada, permiso denegado, dispositivo no disponible y error; mostrar errores concretos y acción de recuperación. Cancelar el selector voluntariamente no es un fallo. Nunca afirmar que hay vídeo/audio real si no existen pistas utilizables; no abrir permisos automáticamente ni degradar seguridad. Los fondos gráficos explícitamente elegidos por el usuario sí son fuentes legítimas.
- Conservar las correcciones locales: barra superior, identidad nativa, permisos Electron, selector de captura, cambio a escena con pantalla visible después de autorización, botón Compartir pantalla en el visor, retirada de cámara sintética y migración de nombres existentes. No reemplazar estos archivos por versiones antiguas de AI Studio.
- Mantener 74 pruebas actuales como mínimo, lint y desktop:build; validar hardware por separado.

### CP-P02-A — Editor visual (implementado)

- **Motor geométrico y restricciones (`src/engine/layerEditor.ts`):**
  - Selección por hit-test (`hitTestSceneLayerAtPoint`), arrastre normalizado (`computeLayerDragTransform`), redimensionado desde las 4 esquinas conservando relación de aspecto (`computeLayerCornerResizeTransform`), ajuste fino con teclado (`Arrow*` 0.01, `Shift+Arrow*` 0.04, `Alt+Arrow*` 0.002, `Escape` para deseleccionar), guías y ajuste magnético a bordes, márgenes seguros (`0.03`) y ejes centrales (`0.5`, anulable con `Alt`), bloqueo por capa (`locked`) y colocación rápida / proporción exacta del sensor.
  - Cuando existe una fuente compartida visible (`window` o `screen`) en la escena, la superposición de cámara se limita a un máximo del **50 % de ancho** y **50 % de área**, sin deformar la cámara ni el contenido compartido; las escenas solo cámara permiten hasta el **100 %**.
- **Coordinador y persistencia por escena (`src/engine/studioCoordinator.ts`, `src/hooks/useStudioEngine.ts`):**
  - Añadidos `getOutputDimensions`, `updateSceneLayerTransform` y `setSceneLayerLocked` con persistencia independiente por escena en `optica_studio_projects_db` (`studioStorage`) y actualización inmediata del `ProgramCompositor`, sin reiniciar fuentes de `SourceManager` ni alterar las dimensiones de `ProgramCanvas`.
- **Interfaz visual y accesibilidad (`src/components/CameraViewport.tsx`, `src/components/LeftStudioPanel.tsx`, `src/components/SidebarControls.tsx`, `src/App.tsx`):**
  - Superposición interactiva exclusiva de DOM sobre el visor (borde de selección, indicador de tamaño/bloqueo, 4 manejadores de esquina y líneas guía de alineación) completamente excluida de la salida de `ProgramCanvas` (foto, MP4 y PiP).
  - Menú contextual de clic derecho (`Editar/Deseleccionar capa de cámara`, `Bloquear/Desbloquear`), selección/bloqueo directo desde la pestaña `Capas` de `LeftStudioPanel`, e inspector discreto `Capa de Cámara en Escena` en `SidebarControls` (`Óptica`).
- **Verificación automatizada (`CP-P02-A`):**
  - `npm test`: **83/83 pruebas superadas** (74 previas + 7 pruebas unitarias en `tests/layerEditor.test.ts` + 2 pruebas de integración en `tests/studioIntegration.test.ts`, utilizando adaptadores simulados en Node.js).
  - `npm run lint` (`tsc --noEmit && tsc -p electron/tsconfig.json --noEmit`): **0 errores**.
  - `npm run desktop:build`: compilación Web + Electron completada sin errores (`package-lock.json`, `electron/main.ts`, `electron/preload.ts` y `.github/workflows/*` sin modificar).
  - *Pendiente de validación física en macOS ARM64:* fluidez de arrastre/redimensionado a 60 fps con cámara FaceTime HD/Continuity y ventana compartida real, y comprobación de exportación limpia (PNG, MP4 y PiP flotante) sin artefactos de interfaz.

### CP-P02-B — Editor avanzado, estilos de cámara y composición profesional (implementado)

- **Corrección de errores de ejecución en vista previa (`src/components/glass/GlassContainers.tsx`):**
  - Corregido el anidamiento inválido `<button>` dentro de `<button>` en `GlassDisclosure` (el slot `badge` ahora es un contenedor hermano fuera del botón principal de acordeón, manteniendo el comportamiento visual y evitando errores de hidratación/DOM en React 19).
- **Eliminación de la restricción del 50 % (`src/engine/layerEditor.ts`, `src/engine/studioCoordinator.ts`, `src/components/SidebarControls.tsx`):**
  - La superposición de cámara puede escalarse libremente desde un pequeño recuadro (`8 %`) hasta el **100 %** de ancho y superficie incluso cuando hay una ventana o pantalla compartida visible (`OVERLAY_MAX_WIDTH_RATIO = 1`, `OVERLAY_MAX_AREA_RATIO = 1`, sin topes ni advertencias del 50 %).
- **Proporción independiente de cámara y encuadre sin distorsión (`src/types/studio.ts`, `src/engine/layerEditor.ts`, `src/engine/programCompositor.ts`):**
  - Añadido selector de proporción propia para la capa de cámara (`Sensor`, `16:9`, `4:3`, `9:16`, `3:4`, `1:1`, `Personalizada`) totalmente independiente del formato de salida de `ProgramCanvas` y diferenciada de la rotación en grados (`rotationDeg`).
  - Encuadre interno sin estiramientos (`cover` / `contain`), con `contentZoom` (`1×–4×`) y desplazamiento `contentOffsetX/Y` (`-100 %` a `+100 %`) aplicados directamente en `computeLayerRenderGeometry` y reflejados de forma equivalente en WebGL2 y Canvas2D.
- **Formas, estilos en vivo, sombra real y difuminado alfa perimetral sin halos (`src/engine/programCompositor.ts`, `src/engine/sceneEngine.ts`, `src/utils/studioStorage.ts`, `src/components/CameraViewport.tsx`):**
  - Soportadas las **6 formas** (`rect`, `square`, `rounded`, `squircle`, `circle`, `ellipse`), radio de esquina ajustable, interruptor real `Borde visible` (`borderEnabled` desacoplado de `borderWidthPx`), opacidad global independiente y sombra difuminada real tanto en **WebGL2** (pasada analítica `u_renderPass = 1` sin halos interiores) como en **Canvas2D** (superficies auxiliares reutilizables `layerScratch`/`maskScratch` cacheadas).
  - Añadido `featherPx` (`0` por defecto): atenuación suave hermítica hacia el interior del perímetro en **alfa recto** (`alphaMode: 'straight'`), compatible con las 6 formas, funcional con el borde desactivado, independiente de la opacidad global y preparado para componerse limpiamente junto a transparencia de sujeto (`hasTransparentSubject`) en `CP-P02-C`.
  - Todos los cambios se aplican en caliente desde `StudioCoordinator.updateSceneLayerStyle` / `updateSceneLayerTransform` / `applyAdaptableLayout` con bloqueo (`locked`) respetado, persistencia por escena en `studioStorage` y **0 reinicios de pistas** ni recreación de `ProgramCanvas`.
- **Inspector de cámara Liquid Glass y composición adaptable (`src/components/SidebarControls.tsx`, `src/App.tsx`):**
  - Reorganizado el inspector contextual en 6 secciones limpias con jerarquía ligera: **Transformación** (con botones rápidos de **Composición adaptable**: esquinas, centro, `PiP`, `Div. Horiz.`, `Div. Vert.` y `100 %`), **Proporción**, **Encuadre**, **Forma**, **Apariencia** e **Integración alfa**.
- **Notas para manual de usuario (branding NextGen V3.1):**
  - Documentar con instrucciones breves: diferencia entre *Proporción de cámara* y *Rotación*; ajuste libre hasta *100 %* incluso con pantalla compartida; recorte interno sin deformación (*Encuadre*); elección de las 6 formas con borde opcional; sombra difuminada y *Difuminado perimetral* para suavizar la integración sin halos; y diseños rápidos de *Composición adaptable*.
- **Verificación automatizada (`CP-P02-B`):**
  - `npm test`: **89/89 pruebas superadas** (83 previas actualizadas al escalado libre del 100 % + 6 nuevas pruebas en `layerEditor.test.ts`, `programCompositor.test.ts` y `studioIntegration.test.ts` usando adaptadores simulados en Node.js).
  - `npm run lint` (`tsc --noEmit && tsc -p electron/tsconfig.json --noEmit`): **0 errores**.
  - `npm run build`, `npm run desktop:build` y `compile_applet` / `lint_applet`: compilación correcta sin tocar `package-lock.json`, `electron/main.ts`, `electron/preload.ts`, `electron-builder.yml` ni `.github/workflows/*`.
  - *Pendiente de validación física en macOS ARM64:* comprobación visual y de rendimiento GPU real sobre WebGL2/ANGLE/Metal y Canvas2D en Electron Desktop (sombras, `squircle`/`ellipse`/`circle`, `featherPx` sobre pantalla compartida real, proporción 16:9 / 9:16 / 1:1 y exportación limpia en PNG, grabación MP4/WebM y PiP flotante) antes de aprobar e iniciar `CP-P02-C`.

### CP-P02-C1 — Editor universal de capas y control completo de pantalla compartida (implementado)

- **Scope estricto de fase 1 (`CP-P02-C1`):** Generaliza el editor visual y el inspector para **cualquier capa visual compatible** (`camera`, `window`, `screen`, `image`, `video-file`, `color`, `gradient`, `text`) conservando intacto el aislamiento frente a fuentes de solo audio (`microphone`, `system-audio`, `audio-file`), sin implementar todavía el gestor de orden `zIndex`/visibilidad/plantillas de composición (`CP-P02-C2`) ni la segmentación/recorte inteligente de sujeto (`CP-P02-C3`).
- **Generalización geométrica y selección por `zIndex` (`src/engine/layerEditor.ts`, `src/engine/studioCoordinator.ts`, `src/hooks/useStudioEngine.ts`):**
  - Añadidas utilidades universales (`AUDIO_ONLY_SOURCE_KINDS`, `isVisualSourceEditable`, `isVisualKindEditable`, `findPrimaryVisualLayer`, `resolveTargetEditableLayer`, `clampVisualLayerTransformForScene`, `resolveLayerSourceAspectRatio`, `computeLayerAspectTransform`, `computeProportionalLayerTransform`, `computeScaledLayerWidthTransform`) manteniendo alias compatibles para código previo.
  - `hitTestSceneLayerAtPoint` ignora capas solo audio y evalúa visibilidad en **orden descendente real de `zIndex`**.
  - `updateSceneLayerTransform` valida en el coordinador que no se apliquen transformaciones geométricas a fuentes solo audio, respeta el bloqueo (`locked`) y aplica `clampVisualLayerTransformForScene` a cualquier capa visual.
  - `applyAdaptableLayout` admite `selectedLayerId`, `intrinsicWidth` e `intrinsicHeight` resueltos en caliente desde `sourceManager` para ubicar y escalar la capa seleccionada (`corner-*`, `center`, `camera-full`) conservando el comportamiento de `pip-overlay` y `split-*`.
- **Visor directo, atajos, panel de capas y selector contextual (`src/components/CameraViewport.tsx`, `src/components/LeftStudioPanel.tsx`, `src/components/SidebarControls.tsx`, `src/App.tsx`):**
  - El clic directo y los menús contextuales del visor (`CameraViewport`) operan sobre cualquier capa visual editable visible en orden descendente de `zIndex`; las capas al `100 %` conservan manejadores accesibles en las 4 esquinas interiores y etiqueta con nombre y tamaño real.
  - Los atajos de teclado (`Arrow*`, `Shift+Arrow*`, `Alt+Arrow*`, `Escape`) mueven cualquier capa visual seleccionada desbloqueada.
  - `LeftStudioPanel` → pestaña `Capas` permite seleccionar y bloquear/desbloquear **cualquier capa visual**, incluidas capas inferiores ocultas u ocluidas por otras superiores (p. ej. una ventana/pantalla bajo una cámara), mientras las fuentes de solo audio figuran honestamente como `Audio · sin geometría`.
  - `SidebarControls` añade una franja contextual (`Capa en edición`) con selector entre capas visuales de la escena, estado/resolución nativa viva (o CTA directo `Compartir ventana o pantalla` cuando no hay captura activa), aclaración explícita de que filtros/enfoque/IA de cámara no se aplican a `window`/`screen`, separación clara de `Cámara física` y `Zoom Digital del visor` (`Ampliación digital del visor`), y las 6 secciones contextuales (**Transformación**, **Proporción** con `Original` / `Sensor`, **Encuadre** con zoom interno de contenido + desplazamiento + **recorte independiente por los 4 bordes `crop` (`0–49 %`)**, **Forma**, **Apariencia** e **Integración alfa**) válidas para cualquier capa visual.
- **Control completo de pantalla/ventana compartida y adaptación dinámica (`src/engine/programCompositor.ts`):**
  - `buildSceneRenderPlan` lee en tiempo real `video.videoWidth` / `video.videoHeight` en cada fotograma, de modo que si el usuario redimensiona o cambia de orientación la ventana compartida en vivo el compositor adapta encuadre, `crop`, proporción y `diagnostics[].intrinsicWidth/Height` sin reiniciar pistas ni recrear `ProgramCanvas`, manteniendo aislamiento estricto de `setProcessedCameraSurface` (nunca filtra ni altera capas `window`/`screen`).
- **Notas para manual de usuario (branding NextGen V3.1):**
  - Explicar con pasos breves y capturas anotadas la diferencia entre: **Ampliación digital del visor** (zoom óptico/digital dentro del sensor de cámara), **Tamaño libre de capa** (escala de la caja en la escena hasta `100 %`), **Zoom interno y encuadre de contenido** (acercamiento dentro de la propia ventana o imagen sin deformarla) y **Recorte por bordes** (ocultar barras de título, pestañas o márgenes con superior/inferior/izquierdo/derecho); e indicar cómo seleccionar una ventana o fondo cubierto desde `Capas`.
- **Verificación automatizada (`CP-P02-C1`):**
  - `npm test` (`tsx --test tests/*.test.ts`): **95/95 pruebas superadas** (`89` previas + `6` nuevas pruebas específicas de `CP-P02-C1` en `tests/layerEditor.test.ts`, `tests/programCompositor.test.ts` y `tests/studioIntegration.test.ts`, ejecutadas en Node.js con adaptadores simulados).
  - `npm run lint` (`tsc --noEmit && tsc -p electron/tsconfig.json --noEmit`): **0 errores**.
  - `npm run desktop:build` (`icons:build` + `vite build` + `build-electron.mjs`) y `compile_applet` / `lint_applet`: compilación correcta sin modificar `package-lock.json`, `electron/main.ts`, `electron/preload.ts`, `electron-builder.yml` ni `.github/workflows/*`.
  - *Pendiente de validación física en macOS ARM64:* comprobación real en Electron Desktop Apple Silicon con `desktopCapturer` compartiendo una ventana viva mientras se redimensiona, probando `crop` en los 4 bordes, `cover`/`contain`, `squircle`/`circle`, sombra, `featherPx` y captura/grabación limpia desde `ProgramCanvas` bajo WebGL2/ANGLE/Metal y Canvas2D sin pérdida de fluidez ni regresiones en 4K/PiP.

### CP-P02-C2 — Administración profesional de capas y composición multicapa (implementado)

- **Scope estricto de fase 2 (`CP-P02-C2`):** Implementa el administrador visual profesional de capas, adición/gestión segura de fuentes reales, composición multicapa avanzada y un historial acotado `Deshacer / Rehacer`, dejando **`CP-P02-C3`** (segmentación de fondo e integración alfa del presentador) pendiente para la siguiente etapa.
- **Panel `Capas` profesional y operaciones completas (`src/components/LeftStudioPanel.tsx`, `src/engine/sceneEngine.ts`, `src/engine/studioCoordinator.ts`, `src/hooks/useStudioEngine.ts`):**
  - Lista ordenada jerárquicamente de arriba (primer plano) hacia abajo (fondo) según `zIndex` descendente, eliminando etiquetas técnicas innecesarias (`z:{n}`).
  - Cada fila muestra icono por tipo de fuente, nombre editable inline (`doble clic` o menú `Renombrar`, `Enter`/desenfoque guarda, `Escape` cancela), indicador de selección visual, botón de visibilidad (`Eye`/`EyeOff`), bloqueo/desbloqueo (`Lock`/`Unlock`), estado real de conexión (`En vivo`, `Pausada`, `Desconectada`, `Error`, `Autorizar`, `Gráfica`) y agarre para arrastre vertical con línea indicadora de destino (`arriba`/`abajo`) + atajos de teclado (`⌥↑` / `⌥↓`).
  - Menú contextual completo (`GlassContextMenu` por clic derecho o botón `...`, y acciones rápidas en `CameraViewport`): **Renombrar**, **Ocultar / Mostrar**, **Bloquear / Desbloquear**, **Subir un nivel**, **Bajar un nivel**, **Traer al frente**, **Enviar al fondo**, **Duplicar capa** (comparte `sourceId` sin duplicar el `StudioSource` subyacente ni sus pistas), **Restablecer transformación**, **Restablecer apariencia** y **Eliminar de la escena** con confirmación (`GlassDialog`) y aviso reversible (`Deshacer`).
  - Separación estricta entre quitar una capa de una escena (`removeSceneLayer`) y eliminar una fuente huérfana del proyecto (`removeProjectSourceSafely`, bloqueado si la fuente sigue en uso en alguna escena o activa durante grabación).
- **Adición de fuentes reales y almacén binario local (`src/utils/studioAssetStore.ts`, `src/engine/sourceManager.ts`, `src/components/LeftStudioPanel.tsx`):**
  - Selector `+ Añadir` con soporte honesto y real para: **Cámara** (`enumerateDevices` real), **Ventana** (`getDisplayMedia`), **Pantalla** (`getDisplayMedia`), **Imagen**, **Vídeo** y **Audio local** (archivos reales persistidos como `Blob` en IndexedDB `optica_studio_assets_db` mediante referencia `optica-asset:*` con fallback en memoria y limpieza automática al borrar fuentes sin uso), **Texto**, **Color sólido**, **Degradado**, **Micrófono** (`enumerateDevices` real) y **Audio del sistema** (aviso transparente del comportamiento loopback en macOS sin inventar pistas falsas ni mezcladores ficticios).
  - Cancelar el selector de ventana/pantalla nunca deja fuentes ni capas rotas en la escena ni en el proyecto.
- **Composición multicapa avanzada (`src/engine/layerEditor.ts`, `src/components/SidebarControls.tsx`, `src/components/LeftStudioPanel.tsx`):**
  - Añadidas composiciones profesionales **Pantalla + cámara flotante** (`screen-main-cam-pip`), **Cámara + ventana flotante** (`cam-main-window-pip`), **Lado a lado** (`split-horizontal`), **Vertical apilada** (`split-vertical`), **Dos ventanas** (`dual-windows-side-by-side`), **Cuadrícula múltiple** (`grid-multi`) y **Libre** (`freeform`, que conserva posiciones manuales sin sobrescribir), con selección opcional de capas participantes (`participatingLayerIds`) y respeto absoluto de capas bloqueadas.
- **Continuidad audiovisual e historial acotado (`src/engine/compositionHistory.ts`, `src/engine/studioCoordinator.ts`, `src/App.tsx`):**
  - Reordenar, renombrar, ocultar/mostrar, duplicar, restablecer o estilizar capas **nunca reinicia pistas activas ni recrea `ProgramCanvas`**. Ocultar una capa preserva su transformación, estilo y procesamiento, omite su renderizado en `ProgramCompositor` y mantiene vivas las pistas; volver a mostrarla la reanuda sin abrir `getDisplayMedia` automáticamente.
  - Historial acotado `CompositionHistory` (máximo 40 estados serializables, sin almacenar recursos multimedia vivos) con soporte de **`Cmd+Z` / `Ctrl+Z`** (`Deshacer`), **`Cmd+Shift+Z` / `Ctrl+Shift+Z`** (`Rehacer`) y botones en `Capas`, agrupación automática de gestos continuos (arrastre/redimensionado en visor y deslizadores del inspector), persistencia inmediata de cambios restaurados y **cero llamadas a hardware** (`getUserMedia`/`getDisplayMedia`) al deshacer o rehacer.
- **Notas para manual de usuario (branding NextGen V3.1):**
  - Explicar con capturas anotadas: cómo funciona el orden de capas (las superiores tapan a las inferiores), reordenamiento por arrastre / `⌥↑` / `⌥↓`, diferencia entre **Ocultar capa** (mantiene ajustes y cámara viva), **Quitar de la escena** vs **Eliminar del proyecto**, añadir fuentes reales (`Ventana`, `Pantalla`, `Imagen`, `Vídeo`, `Texto`, `Fondos`) y uso de **Composiciones multicapa** + **`⌘Z` / `⇧⌘Z`** para experimentar sin miedo.
- **Verificación automatizada (`CP-P02-C2`):**
  - `npm test` (`tsx --test tests/*.test.ts`): **102/102 pruebas superadas** (`95` previas + `7` nuevas pruebas unitarias y de integración de `CP-P02-C2` en `tests/studioModel.test.ts`, `tests/layerEditor.test.ts` y `tests/studioIntegration.test.ts`, usando adaptadores simulados en Node.js).
  - `npm run lint` (`tsc --noEmit && tsc -p electron/tsconfig.json --noEmit`): **0 errores**.
  - `npm run desktop:build` (`icons:build` + `vite build` + `build-electron.mjs`) y `compile_applet` / `lint_applet`: compilación correcta sin modificar `package-lock.json`, `electron/main.ts`, `electron/preload.ts`, `electron-builder.yml` ni `.github/workflows/*`.
  - *Pendiente de validación física en macOS ARM64:* comprobación real en Electron Desktop Apple Silicon de arrastrar/reordenar múltiples fuentes reales en vivo (cámara FaceTime HD/Continuity + ventana + imagen/vídeo local) sin cortes de grabación, persistencia real de `optica_studio_assets_db` tras reiniciar la app y fluidez de `⌘Z` / `⇧⌘Z`.

### CP-P02-C3 — Transparencia del presentador y visor limpio (2026-11-28)

- Desarrollo local independiente a partir de `DEV-P02C2`, integrado sobre la base `CP-P02-C2` sin sobrescribir archivos Electron (`electron/main.ts`, `electron/preload.ts`), `package-lock.json` ARM64, iconos ni `.github/workflows/*`.
- **Visor libre de superposiciones de detección:** Eliminados el marco verde y el rótulo `Sujeto N · XX%` del visor (`CameraViewport.tsx` y cualquier vista de programa/pantalla completa/Cinema/PiP); se conservan el reconocimiento interno (`FaceDetector`), el autofoco (`aiAutoFocus`) y la lectura técnica diagnóstica exclusivamente fuera del visor principal (`SidebarControls.tsx`). Los manejadores de transformación y redimensionado de la capa seleccionada (`selectedVisualLayer`) se mantienen intactos.
- **Transparencia real de sujeto:** Modo `Quitar fondo · Transparente` en **Filtros** cuando `studioPanel?.engineMode === 'studio'`. MediaPipe local (`ImageSegmenter`) genera máscara de confianza real (`384 px` lado mayor). `SubjectMatte` (`src/utils/subjectMatte.ts`) conserva alfa fraccional, inicializa sin fundido artificial en `0`/`1`, responde al movimiento y descarta historial tras cambio de fuente, geometría, ajustes o pausa (`> 250 ms`).
- **Aislamiento y fallbacks seguros:** La máscara se aplica al final del procesamiento aislado de cámara mediante `destination-in` dentro de `renderCameraFrame`; `ProgramCompositor` usa alfa recto (`hasTransparentSubject` / `alphaMode: 'straight'`) únicamente si se produjo y aplicó realmente una máscara. Capas `window`/`screen` no pasan por segmentación ni LUTs de cámara. Si el modelo está cargando o falla, se mantiene la cámara con fondo original (sin simular recorte), se registra el error con enfriamiento (`1500 ms`) y recuperación hacia CPU (`preferCpuSegmenter`). Los efectos geométricos incompatibles (`kaleidoscope-2`, `kaleidoscope-4`, `pop-art`, `pixelate`, `cyberpunk-glitch`, `vhs-retro`) se suspenden durante el recorte transparente; el modo `Legacy` conserva el fondo.
- **Pruebas y verificación:**
  - En este entorno de integración: `npm test` **107/107** (`102` anteriores + `5` nuevas pruebas unitarias en `tests/subjectMatte.test.ts`), `npm run lint` (`tsc --noEmit && tsc -p electron/tsconfig.json --noEmit`) **0 errores**, y `npm run desktop:build` (`icons:build` + `vite build` + `build-electron.mjs`) correcto.
  - Según registro externo de compilación macOS ARM64 (`DEV-P02C3`): empaquetado ARM64 y codesign ad hoc en `/Applications/Optica Studio.app` (`app.asar` SHA-256 `2ee24493776a8b120ce9fd37a05f2be43d0d3357b041f82e7f9187b9def81474`), y arnés aislado `tests/electron/c3-runner.cjs` + `tests/electron/c3-pixels.ts` (píxeles reales iguales en Canvas2D y WebGL2: ventana `[36,104,172,255]`, sujeto `[255,255,255,255]`, borde `[146,180,214,255]`; MediaPipe local sin red produjo máscara `384x216` con fallback al cargar, fallo controlado y recuperación CPU). Los patrones gráficos del arnés existen solo en pruebas, nunca como fuentes de producción. *No ejecutado todavía en hardware físico con persona real, cabello/manos ni FPS sostenidos.*
- **Manual NextGen V3.1:** Documentar `Filtros > Recorte de Sujeto con IA > Quitar fondo · Transparente`, botón `Restaurar fondo original`, sensibilidad/suavizado, capa de ventana debajo de cámara y estado de recuperación.
- **Estado de cierre:** Rechazado durante validación física inicial en macOS ARM64; sucedido por `CP-P02-C3-R1` y `CP-P02-C3-R2`.

### CP-P02-C3-R1 y CP-P02-C3-R2 — Calidad visual del recorte, colocación detrás de cámara y administrador múltiple de fuentes (2026-11-28)

- **Integración R1 + implementación R2 (`CP-P02-C3-R2`):** Consolidada la base local `OpticaStudio-CP-P02-C3-R1-sync.txt` y completado **`CP-P02-C3-R2`** manteniendo intactos `package-lock.json`, `electron/main.ts`, `electron/preload.ts`, `electron-builder.yml`, `.github/workflows/*`, iconos y `/public/mediapipe/*`.
- **Calidad visual del recorte del presentador (`src/utils/subjectMatte.ts`, `src/utils/aiVision.ts`, `src/utils/canvasProcessor.ts`, `src/engine/programCompositor.ts`, `src/App.tsx`):**
  - La inferencia neuronal sigue ejecutándose sobre el modelo local `selfie_segmenter_landscape.tflite` (`ImageSegmenter` vía GPU con respaldo automático CPU tras enfriamiento, sin descarga externa en runtime).
  - Refinado el postprocesado de máscara mediante **Filtro Guiado 3D en espacio YCbCr O(N) separable (`refineGuidedAlpha`)** con buffers reutilizables de cero asignaciones por fotograma, separación cromática para bordes isoluminantes, bloqueo de interior/fondo definidos y suavizado perimetral más ceñido (`applySubjectAlpha`).
  - `SubjectMatte` incorpora respuesta temporal adaptativa ante movimiento rápido de sujeto sin fundidos artificiales y manteniendo historial por geometría/fuente/pausa.
  - Descontaminación de color de borde en CPU (`decontaminateEdgeColors`) y en GPU (`Webgl2CompositorBackend`, muestreo 4-vecino protegido estrictamente bajo `u_hasTransparentAlpha == 1 && u_alphaMode == 1 && a > 0.005 && a < 0.92`) combinada con carga de textura `gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL = 1` cuando el canal alfa premultiplicado proviene del lienzo procesado de cámara (`alphaMode: 'premultiplied'`).
- **Profundidad intuitiva y colocación detrás de cámara (`src/engine/studioCoordinator.ts`, `src/engine/layerEditor.ts`, `src/components/LeftStudioPanel.tsx`, `src/components/SidebarControls.tsx`):**
  - Las fuentes de captura nuevas o reutilizadas (`screen` / `window`) se insertan por defecto **detrás de la capa de cámara** (`placement: 'behind-camera'`) en la escena activa sin cubrir automáticamente al presentador.
  - Controles rápidos en 1 clic (`Detrás de cámara`, `Traer al frente`, `Subir`, `Bajar`, `Al fondo`) en `Capas` y en el inspector, más aviso contextual no intrusivo cuando una ventana/pantalla queda detrás de una cámara opaca a pantalla completa (`100 %`).
  - Nuevas composiciones rápidas **`Pantalla + presentador transparente`** (`screen-main-transparent-presenter`) y **`Pantalla + ventana PiP`** (`screen-main-window-pip`), con selectores explícitos **Principal** y **Secundaria** en el inspector y `Deshacer / Rehacer` en un único paso sin reabrir hardware.
- **Administrador profesional de múltiples pantallas y ventanas (`src/engine/sourceManager.ts`, `src/components/CameraViewport.tsx`, `src/components/LeftStudioPanel.tsx`, `src/App.tsx`):**
  - Soporte simultáneo real de varias pantallas y ventanas en vivo dentro de la misma escena/proyecto con `sourceId`/`layerId` únicos, numeración automática legible, resolución nativa viva (`W×H`), renombrado no destructivo (`renameProjectSource`), reutilización en otras escenas sin nueva captura (`+ Detrás`), selector Liquid Glass **Fuentes compartidas** anclado sobre **Compartir pantalla** en `CameraViewport` y enrutamiento de audio por fuente (`Map<string, MediaStreamAudioSourceNode>`) para evitar desconectar capturas previas.
  - **`Cambiar captura` no destructivo (`reconnectSource(..., { force: true })`):** Conserva intacto el `MediaStream` activo y su estado `'live'` si el usuario cancela el selector nativo (`AbortError` o `NotAllowedError` en Chromium/Electron) y detiene la pista previa únicamente tras confirmar la nueva captura.
  - **Visor limpio conservado:** Cero recuadros o porcentajes de detección (`Sujeto 1`, `%`) sobre `CameraViewport` ni sobre la salida `ProgramCanvas`.
- **Verificación automatizada en Node.js (`CP-P02-C3-R2`):**
  - `npm test` (`tsx --test tests/*.test.ts`): **117/117 pruebas superadas** (110 heredadas de R1 + 7 nuevas pruebas de `CP-P02-C3-R2` en `subjectMatte.test.ts`, `programCompositor.test.ts`, `sourceManager.test.ts`, `layerEditor.test.ts` y `studioIntegration.test.ts` mediante adaptadores simulados).
  - `npm run lint` (`tsc --noEmit && tsc -p electron/tsconfig.json --noEmit`): **0 errores**.
  - `npm run desktop:build` (`icons:build` + `vite build` + `build-electron.mjs`): compilación limpia sin archivos `*sync*` en la distribución final.
  - *Pendiente de validación física en macOS ARM64:* comprobación real en Electron Desktop Apple Silicon con WebGL2/ANGLE/Metal, cámara real en movimiento, cabello/manos sobre pantalla compartida y captura simultánea de varias ventanas/pantallas antes de aprobar `CP-P02` o iniciar `CP-P03-A`.

---

## 12. Auditoría Técnica Profunda del Pipeline Audiovisual (`CP-P03`)

Auditoría realizada directamente sobre los 9 módulos del motor audiovisual antes de iniciar implementaciones de `CP-P03`:

1. **`src/utils/webglEffects.ts`:**
   - Mantiene un singleton global (`state: WebglPipelineState | null`, `webglUnavailable`) sobre un único `<canvas>` WebGL2 con `preserveDrawingBuffer: true` y una única textura compartida.
   - Redimensiona `canvas.width/height` globalmente cuando cambia el tamaño de entrada; el shader escribe `outColor = vec4(..., 1.0)` (destruyendo alfa si se usara sobre superficies transparentes) y `dstCtx.drawImage(canvas, ...)` fuerza lectura/copia GPU→CPU 2D por cada pasada (`applyWebglColorFilter` y `applyWebglVisualEffect`), provocando múltiples subidas de textura por fotograma al entrar luego en `ProgramCompositor`.
   - Carece de limpieza explícita (`disposeWebglEffects`) y manejador de pérdida de contexto WebGL (`webglcontextlost`/`restored`).
2. **`src/utils/aiVision.ts` y `src/utils/subjectMatte.ts`:**
   - `SubjectMatte` está limpio y desacoplado del DOM, pero `aiVision.ts` mantiene una única instancia global `subjectMatte`, `matteSource`, `matteGeometry`, `lastSegTs`, `lastDetTs` y lienzos scratch compartidos (`segInputCanvas`, `segOutCanvas`, `segOutImgData`, `detInputCanvas`).
   - Con dos cámaras o fuentes con segmentación simultánea en el mismo fotograma, `setAiSegmentationSource` reiniciaría el buffer temporal en cada alternancia, anulando la estabilidad de `SubjectMatte`.
   - `FaceDetector` fija `inW = 320` en lugar de escalado proporcional por lado mayor (`384`) o seguimiento por fuente; falta `disposeAiVision()` para liberar explícitamente `ImageSegmenter`/`FaceDetector` y lienzos auxiliares.
3. **`src/utils/canvasProcessor.ts`:**
   - Buffers globales compartidos a nivel de módulo (`workCanvas`, `rawCanvas`, `pixelCanvas`, `blurCanvas`, `rotCanvas`, `stabCanvas`, `prevStabLum`, `stabCompX`, `stabCompY`, `segSampleCanvas`, `segMaskCanvas`, `segFgCanvas`, `prevSegMask`, `calibratedBgYCbCr`, `prevMotionBuffer`, `motionSampleCanvas`). Dos cámaras o vídeos simultáneos corrompen la estabilización, el fondo calibrado YCbCr y la máscara temporal entre sí.
   - Asignaciones por fotograma en ruta caliente: `document.createElement('canvas')` cuando `screenSource` y `effectId !== 'none'`; `new Float32Array(STAB_W * STAB_H)` + `getImageData` síncrono en `updateStabilizationDisplacement`; `createImageData` / `getImageData` en `applyBackgroundSegmentation` y `renderFocusPeakingOverlay`; `bgImageCache` (`Map`) sin poda ni liberación de `blob:` URLs obsoletas.
4. **`src/App.tsx`, `src/engine/studioCoordinator.ts` y `src/hooks/useStudioEngine.ts`:**
   - **Cuello de botella mono-cámara:** El bucle principal en `App.tsx` procesa únicamente la primera cámara (`getActiveCameraVideoElement()`) sobre un único `processedCameraCanvasRef` y llama a `coordEngine.setProcessedCameraSurface(...)`, el cual resuelve únicamente `this.project.sources.find((s) => s.kind === 'camera')`. Cámaras secundarias, capas `video-file` y capas duplicadas con `overrideSourceProcessing: true` (`SceneLayer.processing` ya tipado en `src/types/studio.ts`) quedan sin procesamiento independiente.
   - **Doble copia de presentación:** En modo Studio, `App.tsx` copia cada fotograma del `ProgramCanvas` WebGL2 de salida (`1080p`/`4K`) a otro `<canvas>` 2D en `CameraViewport` mediante `ctx.drawImage(progCanvas, ...)` a 60 fps, duplicando ancho de banda de composición y lectura.
5. **`src/engine/programCompositor.ts`:**
   - `Webgl2CompositorBackend` ejecuta `gl.getUniformLocation(...)` en **cada uniforme, cada capa y cada fotograma** dentro de `drawTexturedLayerQuad`, `drawSolidQuad`, `drawShadowQuad`, `bindCommonStyleUniforms` y `renderFadeTransition` en lugar de cachear ubicaciones al compilar el programa; además instancia `new Float32Array(...)` en cada matriz/transición.
   - `Webgl2CompositorBackend` ignora `cmd.blendMode` (`screen`, `multiply`, `overlay` solo están activos en `Canvas2dCompositorBackend`).
   - `StaticGraphicRasterCache` y `computeFrameSignature` usan `JSON.stringify` por fotograma sobre capas gráficas.
   - `pruneUnusedResources()` no purga entradas obsoletas de `this.processedSurfaces` (`Map<string, ProcessedLayerSurface>`), quedando retenidas hasta recibir `null` explícito.
   - `Canvas2dCompositorBackend` ejecuta trigonometría/potencias por píxel en CPU al cambiar dimensiones/forma/difuminado (`applyPerimeterFeatherToRgbaBuffer`) y usa `ctx.shadowBlur` por software cuando cae a Canvas2D.
6. **`src/engine/sourceManager.ts`:**
   - La gestión de pistas, `trackOwners`, `operationToken`, `cleanupCallbacks` e IndexedDB (`optica_studio_assets_db`) es sólida. Requiere enlazar el ciclo de desconexión/eliminación de fuentes con el registro de contextos de procesamiento por fuente/capa para liberar automáticamente `SubjectMatte`, texturas GPU y `processedSurfaces` sin fugas.

---

## 13. Alcance Técnico Concreto de `CP-P03-A` (Pendiente de aceptación física de `C3`)

> **Regla de parada:** No iniciar la implementación de `CP-P03-A` hasta confirmar la aceptación física de `CP-P02-C3-R2` en macOS ARM64.

1. **Aislamiento de estado por fuente/capa (`ProcessingContext`):**
   - Encapsular los buffers de `canvasProcessor.ts`, `webglEffects.ts` y `SubjectMatte` (`aiVision.ts`) por clave determinista (`sourceId` por defecto, o `layerId` cuando `layer.overrideSourceProcessing === true`), eliminando las variables globales compartidas entre cámaras.
2. **Pipeline multi-fuente conectado a `ProgramCompositor`:**
   - Sustituir el puente único `setProcessedCameraSurface` por procesamiento multi-fuente sobre `ProgramCompositor.setProcessedLayerSurface(targetKey, ...)`, dando soporte a múltiples cámaras, `video-file` y overrides por capa sin contaminar jamás `window` ni `screen`, manteniendo compatibilidad con el modo `Legacy`.
3. **Eliminación de asignaciones en caliente y caché GPU:**
   - Pre-asignar buffers reutilizables por contexto (eliminando `createElement('canvas')`, `new Float32Array` y `createImageData` por fotograma en ruta crítica); cachear `WebGLUniformLocation` y matrices en `Webgl2CompositorBackend`; soportar `blendMode` consistente en WebGL2 y podar `processedSurfaces` + `bgImageCache` + contextos huérfanos en `SourceManager` y `ProgramCompositor.pruneUnusedResources()`.
4. **Conservación estricta:**
   - Cero regresiones sobre `CP-P02-C1`, `CP-P02-C2` y `CP-P02-C3` (sin rótulos ni cajas de sujeto en visores; `SubjectMatte` y fallbacks íntegros).

---

## 14. Hoja de Ruta Oficial Actualizada

- `CP-P02-C3-R1 / CP-P02-C3-R2`: Calidad visual del recorte y administrador múltiple de fuentes — **Implementado y verificado en pruebas automatizadas Node/TS; pendiente de validación y aceptación física en macOS ARM64**.
- **`CP-P03` (`CP-P03-A` .. `CP-P03-E`)**: Motor audiovisual profesional de alto rendimiento — contextos por fuente/capa, unificación GPU WebGL2/Metal vía ANGLE, eliminación de copias intermedias y optimización sostenida en 1080p/4K Apple Silicon.
- **`CP-P04`**: Audio multipista, mezcla en tiempo real, monitorización y sincronización A/V.
- **`CP-P05`**: Grabación incremental en disco (IPC Electron seguro) y recuperación ante cortes o fallos.
- **`CP-P06`**: Productividad de estudio, perfiles, atajos avanzados y flujo de edición profesional.
- **`CP-FINAL`**: Auditoría integral de código, manual de usuario NextGen V3.1 completo, verificación de rendimiento sostenido, empaquetado final y publicación en GitHub solo bajo autorización explícita.

## Registro local — CP-P02-C3-R2 (2026-11-28)

- Export directo Google AI Studio, ZIP SHA-256 04faac37fb2ef1db20a70c1e5d391535f99d59393bdfa7fd47c69337ed40ccca, 84 archivos. Comparado con DEV-P02C3-R1. Lockfile ARM64 e iconos restaurados desde R1 por diferencias de exportación; Electron, workflows, package.json y modelos MediaPipe idénticos. Sin archivos de sincronización en dist.
- npm test 117/117, lint y desktop:build correctos. Arnés Electron local sin red correcto en Canvas2D/WebGL2; añadida comprobación local específica del alfa premultiplicado usado por R2, borde [146,180,214,255] en ambos backends y ventana intacta. MediaPipe local, recuperación CPU y refinamiento 960x540 correctos. No se probó cámara/pantallas físicas.
- Regresión de rendimiento: mismo arnés controlado, tras recuperación CPU, R1 11,6–15,9 ms por muestra de pipeline de máscara; R2 66,3–75,2 ms, repetición 66,7–79,1 ms. Medir y perfilar antes de aprobar. No equivale a FPS de captura/grabación. No se afirma calidad visual mejorada sin persona real.
- Paquete ARM64 firmado ad hoc, codesign correcto, no notarizado. app.asar SHA-256 42ef9ec686518ac1907ccb2315ff8e56ddfb73690a74300978cc10cef705635c. Paquete preparado en release/mac-arm64/Optica Studio.app. La app anterior permanece abierta; no se pudo comprobar si graba. No se reemplazó. Repositorio principal intacto, sin push/releases. CP-P03-A permanece bloqueado.


### Instalación local R2 — 20261128-095755

- Usuario confirmó que no había grabación activa y autorizó continuar. Cierre normal de C3-SYNC, respaldo del perfil y sustitución reversible en /Applications/Optica Studio.app. Firma local y SHA-256 verificados: 42ef9ec686518ac1907ccb2315ff8e56ddfb73690a74300978cc10cef705635c.
- Respaldo: ~/Documents/OpticaStudio-respaldo-perfil-R2-20261128-095755. Rollback: ~/.Trash/OpticaStudio-rollback-C3-SYNC-20261128-095755.
- Pendiente prueba física de recorte, varias capturas simultáneas, orden de capas y fluidez. No iniciar CP-P03-A ni publicar.

## CP-P02-C3-R3 — Optimización exacta del refinamiento de bordes (2026-11-28)

- El usuario confirma que el recorte R2 se ve muy bien, pero la fluidez bajó significativamente. No se declara aprobado C3. Se conserva modelo, resolución 960x540, cámara hasta 1920 px, respuesta temporal, alfa premultiplicado, descontaminación GPU y administrador múltiple R2.
- Cambio localizado en subjectMatte.ts: regiones de 48x48 activadas únicamente si contienen alfa incierto y variación suficiente para entrar en la rama guiada. Halo de 2 radios para preservar soporte de las dos etapas del filtro. Si la máscara es densa, ruta completa. Se reutilizan índices de interpolación y sumas verticales; no se altera el algoritmo YCbCr ni se reduce resolución. No se reutilizan máscaras antiguas.
- Comparación local contra implementación original R2 en 5 patrones deterministas 960x540: diferencia máxima alfa 0/255 en todos. Refinamiento solo, silueta central R2 56,1–58,4 ms vs R3 20,6–20,9 ms; silueta cerca del borde R2 56,3–58,2 vs R3 14,7–15,1 ms; máscara densa aún 64,1–71,5 ms. No es cámara real.
- Arnés Electron controlado, pipeline máscara tras recuperación CPU: R2 66,3–79,1 ms vs R3 12,2–18,3 ms; patrón uniforme, no FPS reales ni calidad de persona. WebGL2 y Canvas2D, alfa recto/premultiplicado, MediaPipe local y recuperación CPU correctos.
- 119/119 tests (2 nuevas regresiones de bordes de bloques y ausencia de alfa residual); lint, desktop:build, empaquetado ARM64 y firma ad hoc correctos. SHA-256 app.asar ca9d2808f8d3fd48096f025d77c88cb9b7187ac202501429d279739eeb3ece0e. Lockfile, Electron y CI idénticos. Sin push/release.
- Pendiente prueba física de fluidez y calidad, grabación con fuentes compartidas, diagnóstico de casos densos si persisten. No iniciar CP-P03-A hasta aceptación. Parche de sincronización local R3 preparado.


### Instalación local R3 — 20261128-101024

- Cierre normal de R2, perfil respaldado, sustitución reversible de la app y firma verificada. Instalado R3 SHA-256 ca9d2808f8d3fd48096f025d77c88cb9b7187ac202501429d279739eeb3ece0e.
- Respaldo: ~/Documents/OpticaStudio-respaldo-perfil-R3-20261128-101024. Rollback: ~/.Trash/OpticaStudio-rollback-R2-20261128-101024. Pendiente validación física.

### CP-P02-C3-R3 — Aprobación física del recorte (2026-11-28)

- El usuario confirma: «AHora si, queda aprobado el recorte.» Se acepta la calidad visual y la fluidez del recorte R3. No extender esta aprobación al resto de las funcionalidades de C3 sin confirmación expresa. Mantener algoritmo y pruebas. Pendiente validar captura múltiple, selección, profundidad y grabación; sincronizar R3 con Google AI Studio antes de CP-P03-A.

### CP-P02 — Cierre de aceptación física (2026-11-28)

- El usuario confirma que también aprueba las tres validaciones restantes: múltiples pantallas simultáneas, selección y profundidad independiente de fuentes R2, y grabación multicapa. Se suma a la aprobación física del recorte R3 y a las aprobaciones previas de C1/C2. CP-P02 queda aprobado funcional y físicamente por el usuario.
- Base aprobada: DEV-P02C3-R3, 119/119 pruebas automatizadas, app ARM64 instalada. Conservar el refinamiento de alfa R3 y todas las funciones aprobadas.
- Pendiente exclusivamente sincronización del parche R3 y de este cierre con Google AI Studio antes de comenzar CP-P03-A. No se ha iniciado CP-P03-A; sin push ni release.

## Flujo de desarrollo compartido por GitHub

- Base aprobada: CP-P02-C3-R3, 119 pruebas, validación física completa.
- Rama DEV propuesta: dev. main permanece estable; no push directo, merge ni release sin autorización.
- Un solo editor activo por checkpoint. Antes de editar, verificar HEAD remoto y traer cambios. Al terminar, ejecutar pruebas, actualizar PROJECT-MASTER.md, commit y sincronizar únicamente dev. Nunca force-push; ante divergencia comparar y reconciliar antes de continuar.
- Proteger lockfile ARM64, Electron, workflows, recursos locales, iconos y decisiones aprobadas. No versionar perfiles, medios privados, credenciales, archivos de sincronización ni compilaciones.
- CP-P03-A comienza solamente tras comprobar sincronización bidireccional con la base aprobada.

### Estado de sincronización GitHub (2026-11-28)

- Usuario autorizó publicar la rama dev en el repositorio público OpticaStudio. Base CP-P02-C3-R3 publicada en 6c12f97, main intacta en 28f38e6.
- AI Studio conserva el vínculo original a main y 31 archivos pendientes de push. No se ejecutó push desde AI Studio.
- La interfaz de GitHub sync no ofrece selector de rama. El diálogo Disconnect advierte que después solo permite sincronizar con un repositorio nuevo; se canceló. El importador Build muestra únicamente main y advierte que el código importado no se mantiene sincronizado. No se desconectó, importó ni creó otra app/repo.
- Hasta resolver esta limitación, dev es la base compartida de GitHub, pero no existe sincronización bidireccional verificada con AI Studio. No declarar sincronización completa ni iniciar CP-P03-A desde AI Studio sobre una base desactualizada. No modificar main ni usar force-push.

### Verificación de retorno AI Studio a GitHub (2026-11-28)

- **Estado de aprobación:** `CP-P02-R3` (`CP-P02-C3-R3`) está aprobado físicamente por el usuario.
- **Estado de sincronización:** Se está comprobando el retorno de cambios desde Google AI Studio hacia la rama `dev` en GitHub.
- **Próxima fase:** `CP-P03-A` todavía no se inició.

