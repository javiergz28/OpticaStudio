export type AppearanceThemeMode = 'auto' | 'dark' | 'light';
export type GlassProfileMode = 'clear' | 'regular' | 'tinted';
export type LeftStudioSectionId = 'scenes' | 'sources' | 'templates' | 'layers';

export interface AppearanceSettings {
  themeMode: AppearanceThemeMode;
  glassProfile: GlassProfileMode;
  reducedTransparency: boolean;
  reducedMotion: boolean;
  reducedGraphics: boolean;
  autoLowCostOnRecord: boolean;
}

export interface LeftPanelPreferences {
  expanded: boolean;
  pinned: boolean;
  widthPx: number;
  activeSection: LeftStudioSectionId;
}

export const APPEARANCE_STORAGE_KEY = 'optica_studio_appearance_v1';
export const LEFT_PANEL_STORAGE_KEY = 'optica_studio_left_panel_v1';

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  themeMode: 'dark',
  glassProfile: 'clear',
  reducedTransparency: false,
  reducedMotion: false,
  reducedGraphics: false,
  autoLowCostOnRecord: true,
};

export const DEFAULT_LEFT_PANEL_PREFERENCES: LeftPanelPreferences = {
  expanded: false,
  pinned: false,
  widthPx: 276,
  activeSection: 'scenes',
};

export const LEFT_PANEL_MIN_WIDTH = 240;
export const LEFT_PANEL_MAX_WIDTH = 380;

export function clampLeftPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_LEFT_PANEL_PREFERENCES.widthPx;
  return Math.max(LEFT_PANEL_MIN_WIDTH, Math.min(LEFT_PANEL_MAX_WIDTH, Math.round(width)));
}

export function normalizeAppearanceSettings(
  input: Partial<AppearanceSettings> | null | undefined
): AppearanceSettings {
  const themeMode: AppearanceThemeMode =
    input?.themeMode === 'auto' || input?.themeMode === 'light' || input?.themeMode === 'dark'
      ? input.themeMode
      : DEFAULT_APPEARANCE_SETTINGS.themeMode;

  const glassProfile: GlassProfileMode =
    input?.glassProfile === 'clear' ||
    input?.glassProfile === 'regular' ||
    input?.glassProfile === 'tinted'
      ? input.glassProfile
      : DEFAULT_APPEARANCE_SETTINGS.glassProfile;

  return {
    themeMode,
    glassProfile,
    reducedTransparency: Boolean(input?.reducedTransparency),
    reducedMotion: Boolean(input?.reducedMotion),
    reducedGraphics: Boolean(input?.reducedGraphics),
    autoLowCostOnRecord:
      typeof input?.autoLowCostOnRecord === 'boolean'
        ? input.autoLowCostOnRecord
        : DEFAULT_APPEARANCE_SETTINGS.autoLowCostOnRecord,
  };
}

export function normalizeLeftPanelPreferences(
  input: Partial<LeftPanelPreferences> | null | undefined
): LeftPanelPreferences {
  const activeSection: LeftStudioSectionId =
    input?.activeSection === 'scenes' ||
    input?.activeSection === 'sources' ||
    input?.activeSection === 'templates' ||
    input?.activeSection === 'layers'
      ? input.activeSection
      : DEFAULT_LEFT_PANEL_PREFERENCES.activeSection;

  return {
    expanded: Boolean(input?.expanded),
    pinned: Boolean(input?.pinned),
    widthPx: clampLeftPanelWidth(input?.widthPx ?? DEFAULT_LEFT_PANEL_PREFERENCES.widthPx),
    activeSection,
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readAppearanceSettings(storage?: StorageLike | null): AppearanceSettings {
  const target =
    storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return DEFAULT_APPEARANCE_SETTINGS;
  try {
    const raw = target.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE_SETTINGS;
    return normalizeAppearanceSettings(JSON.parse(raw) as Partial<AppearanceSettings>);
  } catch {
    return DEFAULT_APPEARANCE_SETTINGS;
  }
}

export function writeAppearanceSettings(
  settings: AppearanceSettings,
  storage?: StorageLike | null
): AppearanceSettings {
  const normalized = normalizeAppearanceSettings(settings);
  const target =
    storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (target) {
    try {
      target.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignorar restricciones de almacenamiento
    }
  }
  return normalized;
}

export function readLeftPanelPreferences(storage?: StorageLike | null): LeftPanelPreferences {
  const target =
    storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return DEFAULT_LEFT_PANEL_PREFERENCES;
  try {
    const raw = target.getItem(LEFT_PANEL_STORAGE_KEY);
    if (!raw) return DEFAULT_LEFT_PANEL_PREFERENCES;
    return normalizeLeftPanelPreferences(JSON.parse(raw) as Partial<LeftPanelPreferences>);
  } catch {
    return DEFAULT_LEFT_PANEL_PREFERENCES;
  }
}

export function writeLeftPanelPreferences(
  prefs: LeftPanelPreferences,
  storage?: StorageLike | null
): LeftPanelPreferences {
  const normalized = normalizeLeftPanelPreferences(prefs);
  const target =
    storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (target) {
    try {
      target.setItem(LEFT_PANEL_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignorar restricciones de almacenamiento
    }
  }
  return normalized;
}

export interface ResolvedAppearanceState {
  resolvedTheme: 'dark' | 'light';
  lowCostActive: boolean;
  effectiveReducedMotion: boolean;
  effectiveReducedTransparency: boolean;
  effectiveMaterialTier: 'clear' | 'regular' | 'tinted' | 'solid';
}

export function resolveAppearanceState(
  settings: AppearanceSettings,
  env: {
    systemPrefersDark: boolean;
    systemPrefersReducedMotion: boolean;
    systemPrefersReducedTransparency: boolean;
    isRecording: boolean;
  }
): ResolvedAppearanceState {
  const resolvedTheme: 'dark' | 'light' =
    settings.themeMode === 'auto'
      ? env.systemPrefersDark
        ? 'dark'
        : 'light'
      : settings.themeMode;

  const effectiveReducedMotion = settings.reducedMotion || env.systemPrefersReducedMotion;
  const effectiveReducedTransparency =
    settings.reducedTransparency || env.systemPrefersReducedTransparency;
  const lowCostActive =
    settings.reducedGraphics || (env.isRecording && settings.autoLowCostOnRecord);

  const effectiveMaterialTier = effectiveReducedTransparency
    ? 'solid'
    : lowCostActive
      ? 'solid'
      : settings.glassProfile;

  return {
    resolvedTheme,
    lowCostActive,
    effectiveReducedMotion,
    effectiveReducedTransparency,
    effectiveMaterialTier,
  };
}
