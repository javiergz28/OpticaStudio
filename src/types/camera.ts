export type WorkspaceTab =
  | 'studio'
  | 'filters'
  | 'booth'
  | 'record'
  | 'utilities'
  | 'gallery';

export type FilterCategory = 'instagram' | 'cinema' | 'classic';

export type FilterPresetId =
  | 'none'
  | 'ig-clarendon'
  | 'ig-juno'
  | 'ig-lark'
  | 'ig-valencia'
  | 'ig-nashville'
  | 'ig-aden'
  | 'ig-hudson'
  | 'ig-slumber'
  | 'teal-orange'
  | 'kodak-portra'
  | 'cine-2383'
  | 'cine-dune'
  | 'cine-matrix'
  | 'cine-neon'
  | 'leica-bw'
  | 'matte-film'
  | 'vivid-pro'
  | 'sepia-vintage'
  | 'cyanotype'
  | 'document-scan';

export type VisualEffectCategory = 'cartoon' | 'cinema' | 'retro' | 'geometry';

export type VisualEffectId =
  | 'none'
  | 'simpson-toon'
  | 'anime-cel'
  | 'comic-halftone'
  | 'dream-bloom'
  | 'cinema-halation'
  | 'cyberpunk-glitch'
  | 'vaporwave'
  | 'vhs-retro'
  | 'thermal'
  | 'night-vision'
  | 'sketch-ink'
  | 'kaleidoscope-2'
  | 'kaleidoscope-4'
  | 'pop-art'
  | 'pixelate';

export type AspectRatioId = 'native' | '16:9' | '4:3' | '1:1' | '9:16';

export type ResolutionPresetId = 'max' | '4k' | '1080p' | '720p';

export type GridOverlayId = 'none' | 'thirds' | 'golden' | 'crosshair' | 'cinema';

export interface ColorAdjustments {
  brightness: number; // -50 to 50 (0 default)
  contrast: number; // -50 to 50 (0 default)
  saturation: number; // -100 to 100 (0 default)
  temperature: number; // -50 (cool) to 50 (warm)
  vignette: number; // 0 to 100
  softSkin: number; // 0 to 100 (subtle blur/glow)
  effectIntensity: number; // 10 to 100 (for pixel size, intensity, etc.)
}

export type FocusAreaSize = 'spot' | 'zone' | 'wide';

export interface FocusSettings {
  mode: 'auto' | 'manual';
  manualDistance: number; // 0 (Macro) to 100 (Infinito)
  apertureBlur: number; // 0 (todo nítido f/16) to 100 (bokeh f/1.4)
  areaX: number; // 0 to 1 normalized viewport X
  areaY: number; // 0 to 1 normalized viewport Y
  areaSize: FocusAreaSize;
  peakingEnabled: boolean;
  selectingArea: boolean;
  aiTrackingEnabled: boolean;
  aiAutoFocus: boolean;
}

export type AiVisionStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AiSubjectBox {
  x: number; // 0 to 1 normalized left
  y: number; // 0 to 1 normalized top
  width: number; // 0 to 1 normalized width
  height: number; // 0 to 1 normalized height
  confidence: number; // 0 to 1
  focusX: number; // 0 to 1 primary eye/face center X
  focusY: number; // 0 to 1 primary eye/face center Y
}

export type FrameFitMode = 'contain' | 'cover';

export type RotationDeg = 0 | 90 | 180 | 270;

export interface StabilizationSettings {
  enabled: boolean;
  strength: number; // 20 to 100
}

export type BackgroundReplaceMode = 'none' | 'blur' | 'color' | 'image';

export interface BackgroundSegmentationSettings {
  mode: BackgroundReplaceMode;
  useAi: boolean;
  solidColor: string;
  imageId: string;
  customImageUrl: string | null;
  sensitivity: number; // 15 to 85
  edgeSoftness: number; // 0 to 100
  blurAmount: number; // 4 to 24
  hasCalibratedBg: boolean;
}

export interface RingLightSettings {
  enabled: boolean;
  intensity: number; // 10 to 100
  temperature: 'warm' | 'neutral' | 'cool' | 'rose';
  thickness: number; // 24 to 96 px
}

export interface TeleprompterSettings {
  enabled: boolean;
  playing: boolean;
  text: string;
  speed: number; // 1 to 10
  fontSize: number; // 18 to 44
  opacity: number; // 30 to 95
}

export interface OverlayBranding {
  showTimestamp: boolean;
  showLowerThird: boolean;
  lowerThirdName: string;
  lowerThirdTitle: string;
  cinemaFrame: boolean;
}

export type ScreenLayoutMode = 'pip' | 'screen-only';

export type RecordingFormatPref = 'auto-mp4' | 'webm';

export interface AudioConsoleSettings {
  micGain: number; // 0 to 200 (%)
  compressorEnabled: boolean;
  includeSystemAudio: boolean;
}

export interface DualCameraSettings {
  enabled: boolean;
  deviceId: string;
  mirror: boolean;
}

export interface CapturedMediaItem {
  id: string;
  type: 'photo' | 'video' | 'booth' | 'screen';
  url: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
  width: number;
  height: number;
  durationSec?: number;
  filterId: FilterPresetId;
  effectId: VisualEffectId;
  label: string;
}

export interface FilterPresetMeta {
  id: FilterPresetId;
  name: string;
  category: FilterCategory;
  description: string;
  swatchGradient: string;
}

export interface VisualEffectMeta {
  id: VisualEffectId;
  name: string;
  category: VisualEffectCategory;
  description: string;
}

export interface SampledColor {
  hex: string;
  r: number;
  g: number;
  b: number;
  x: number;
  y: number;
}

export interface MotionEvent {
  id: string;
  timestamp: number;
  score: number;
  capturedUrl?: string;
}

export const DEFAULT_ADJUSTMENTS: ColorAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  vignette: 0,
  softSkin: 0,
  effectIntensity: 65,
};

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  mode: 'auto',
  manualDistance: 50,
  apertureBlur: 0,
  areaX: 0.5,
  areaY: 0.5,
  areaSize: 'zone',
  peakingEnabled: false,
  selectingArea: false,
  aiTrackingEnabled: true,
  aiAutoFocus: true,
};

export const DEFAULT_STABILIZATION_SETTINGS: StabilizationSettings = {
  enabled: false,
  strength: 70,
};

export const DEFAULT_BACKGROUND_SETTINGS: BackgroundSegmentationSettings = {
  mode: 'none',
  useAi: true,
  solidColor: '#09090B',
  imageId: 'loft',
  customImageUrl: null,
  sensitivity: 50,
  edgeSoftness: 55,
  blurAmount: 14,
  hasCalibratedBg: false,
};

export const DEFAULT_AUDIO_CONSOLE_SETTINGS: AudioConsoleSettings = {
  micGain: 100,
  compressorEnabled: true,
  includeSystemAudio: true,
};

export const DEFAULT_DUAL_CAMERA_SETTINGS: DualCameraSettings = {
  enabled: false,
  deviceId: '',
  mirror: true,
};

export const VIRTUAL_BACKGROUNDS: { id: string; name: string; src: string }[] = [
  {
    id: 'loft',
    name: 'Loft Luminoso',
    src: '/src/assets/images/bg_modern_loft_1795481486403.jpg',
  },
  {
    id: 'cinema',
    name: 'Estudio Oscuro',
    src: '/src/assets/images/bg_cinema_dark_1795481487054.jpg',
  },
  {
    id: 'minimal',
    name: 'Estudio Madera',
    src: '/src/assets/images/bg_minimal_studio_1795481486321.jpg',
  },
];

export const SOLID_BACKGROUND_COLORS: { name: string; hex: string }[] = [
  { name: 'Negro Estudio', hex: '#09090B' },
  { name: 'Croma Verde', hex: '#00B140' },
  { name: 'Cobalto', hex: '#1D4ED8' },
  { name: 'Ámbar', hex: '#B45309' },
  { name: 'Blanco Puro', hex: '#F4F4F5' },
];

export const FILTER_PRESETS: FilterPresetMeta[] = [
  {
    id: 'none',
    name: 'Original',
    category: 'classic',
    description: 'Sensor sin alteración cromática',
    swatchGradient: 'from-zinc-700 to-zinc-800',
  },
  // Instagram signature looks
  {
    id: 'ig-clarendon',
    name: 'Clarendon IG',
    category: 'instagram',
    description: 'Luces frías vibrantes y sombras profundas contrastadas',
    swatchGradient: 'from-sky-400 via-cyan-600 to-slate-900',
  },
  {
    id: 'ig-juno',
    name: 'Juno IG',
    category: 'instagram',
    description: 'Cálidos intensos en piel y verdes esmeralda pop',
    swatchGradient: 'from-amber-400 via-rose-500 to-emerald-800',
  },
  {
    id: 'ig-lark',
    name: 'Lark IG',
    category: 'instagram',
    description: 'Luminoso y aireado con azules frescos',
    swatchGradient: 'from-sky-200 via-teal-400 to-stone-500',
  },
  {
    id: 'ig-valencia',
    name: 'Valencia IG',
    category: 'instagram',
    description: 'Baño dorado cálido con negros suaves',
    swatchGradient: 'from-amber-300 via-orange-400 to-stone-700',
  },
  {
    id: 'ig-nashville',
    name: 'Nashville IG',
    category: 'instagram',
    description: 'Luces rosa-durazno retro y sombras índigo',
    swatchGradient: 'from-pink-300 via-rose-400 to-indigo-900',
  },
  {
    id: 'ig-aden',
    name: 'Aden IG',
    category: 'instagram',
    description: 'Estética pastel editorial de bajo contraste',
    swatchGradient: 'from-rose-200 via-purple-300 to-stone-600',
  },
  {
    id: 'ig-hudson',
    name: 'Hudson IG',
    category: 'instagram',
    description: 'Iluminación helada y sombras azul ártico',
    swatchGradient: 'from-cyan-200 via-blue-500 to-slate-900',
  },
  {
    id: 'ig-slumber',
    name: 'Slumber IG',
    category: 'instagram',
    description: 'Tonos soñadores desaturados y negros levantados',
    swatchGradient: 'from-amber-200/80 via-stone-500 to-zinc-800',
  },
  // Cinematic film grading
  {
    id: 'teal-orange',
    name: 'Cine Teal & Orange',
    category: 'cinema',
    description: 'Sombras cian profundas y piel cálida cinematográfica',
    swatchGradient: 'from-cyan-600 via-slate-700 to-orange-500',
  },
  {
    id: 'cine-2383',
    name: 'Kodak 2383 Cine',
    category: 'cinema',
    description: 'Curva de proyección 35mm con negros intensos',
    swatchGradient: 'from-amber-500 via-red-800 to-zinc-950',
  },
  {
    id: 'kodak-portra',
    name: 'Portra 400',
    category: 'cinema',
    description: 'Tonos de piel cremosos y película analógica',
    swatchGradient: 'from-amber-600/90 via-stone-500 to-orange-900',
  },
  {
    id: 'cine-dune',
    name: 'Duna Épico',
    category: 'cinema',
    description: 'Atmósfera desértica ocre dorado y sombras bronce',
    swatchGradient: 'from-yellow-300 via-amber-600 to-stone-900',
  },
  {
    id: 'cine-neon',
    name: 'Noir Neón',
    category: 'cinema',
    description: 'Sombras cian eléctrico y altas luces magenta',
    swatchGradient: 'from-fuchsia-500 via-violet-700 to-cyan-600',
  },
  {
    id: 'cine-matrix',
    name: 'Matrix 1999',
    category: 'cinema',
    description: 'Verde fósforo en medios tonos y thriller frío',
    swatchGradient: 'from-emerald-400 via-green-800 to-zinc-950',
  },
  {
    id: 'leica-bw',
    name: 'Leica Monocromo',
    category: 'cinema',
    description: 'Blanco y negro fílmico de alto contraste',
    swatchGradient: 'from-zinc-200 via-zinc-500 to-zinc-950',
  },
  {
    id: 'matte-film',
    name: 'Cine Mate A24',
    category: 'cinema',
    description: 'Negros levantados estilo editorial independiente',
    swatchGradient: 'from-stone-400 via-neutral-600 to-zinc-800',
  },
  // Classic & utility looks
  {
    id: 'vivid-pro',
    name: 'Estudio Vívido',
    category: 'classic',
    description: 'Contraste y color realzados para presentación',
    swatchGradient: 'from-blue-500 via-emerald-500 to-amber-400',
  },
  {
    id: 'sepia-vintage',
    name: 'Archivo 1968',
    category: 'classic',
    description: 'Emulsión sepia cálida de archivo histórico',
    swatchGradient: 'from-amber-700 via-yellow-900 to-stone-950',
  },
  {
    id: 'cyanotype',
    name: 'Cianotipo',
    category: 'classic',
    description: 'Revelado monocromo en azul Prusia',
    swatchGradient: 'from-sky-400 via-blue-700 to-slate-950',
  },
  {
    id: 'document-scan',
    name: 'Escáner Documento',
    category: 'classic',
    description: 'Alto contraste limpio para texto y pizarra',
    swatchGradient: 'from-white via-zinc-300 to-zinc-900',
  },
];

export const VISUAL_EFFECTS: VisualEffectMeta[] = [
  {
    id: 'none',
    name: 'Sin efecto',
    category: 'geometry',
    description: 'Geometría óptica directa',
  },
  {
    id: 'simpson-toon',
    name: 'Los Simpson',
    category: 'cartoon',
    description: 'Amarillo Springfield cel-shading y trazo negro',
  },
  {
    id: 'anime-cel',
    name: 'Anime Cel-Shading',
    category: 'cartoon',
    description: 'Bandas de color nítidas y tinta fina',
  },
  {
    id: 'comic-halftone',
    name: 'Cómic Halftone',
    category: 'cartoon',
    description: 'Trama de puntos impresa y contornos',
  },
  {
    id: 'dream-bloom',
    name: 'Black Pro-Mist',
    category: 'cinema',
    description: 'Halos suaves en altas luces estilo IG/cine',
  },
  {
    id: 'cinema-halation',
    name: '35mm Halation',
    category: 'cinema',
    description: 'Halo rojo-ámbar en luces y grano 35mm',
  },
  {
    id: 'cyberpunk-glitch',
    name: 'Cyberpunk Glitch',
    category: 'retro',
    description: 'Desfase neón RGB y líneas digitales',
  },
  {
    id: 'vaporwave',
    name: 'Vaporwave 80s',
    category: 'retro',
    description: 'Duotono neón rosa, violeta y cian synthwave',
  },
  {
    id: 'vhs-retro',
    name: 'Cinta VHS 1994',
    category: 'retro',
    description: 'Líneas de barrido y aberración RGB',
  },
  {
    id: 'thermal',
    name: 'Cámara Térmica',
    category: 'retro',
    description: 'Mapa infrarrojo por luminancia',
  },
  {
    id: 'night-vision',
    name: 'Visión Nocturna',
    category: 'retro',
    description: 'Amplificación verde fósforo',
  },
  {
    id: 'sketch-ink',
    name: 'Boceto y Tinta',
    category: 'cartoon',
    description: 'Detección de contornos en tiempo real',
  },
  {
    id: 'kaleidoscope-2',
    name: 'Espejo Simétrico',
    category: 'geometry',
    description: 'Reflejo bilateral en eje vertical',
  },
  {
    id: 'kaleidoscope-4',
    name: 'Caleidoscopio 4X',
    category: 'geometry',
    description: 'Simetría en cuatro cuadrantes',
  },
  {
    id: 'pop-art',
    name: 'Pop Art 2×2',
    category: 'cartoon',
    description: 'Cuadrícula cromática cuádruple',
  },
  {
    id: 'pixelate',
    name: 'Mosaico 8-Bit',
    category: 'geometry',
    description: 'Cuantización espacial de píxeles',
  },
];
