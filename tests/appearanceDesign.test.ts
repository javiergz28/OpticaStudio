import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPEARANCE_STORAGE_KEY,
  clampLeftPanelWidth,
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_LEFT_PANEL_PREFERENCES,
  LEFT_PANEL_MAX_WIDTH,
  LEFT_PANEL_MIN_WIDTH,
  LEFT_PANEL_STORAGE_KEY,
  normalizeAppearanceSettings,
  normalizeLeftPanelPreferences,
  readAppearanceSettings,
  readLeftPanelPreferences,
  resolveAppearanceState,
  writeAppearanceSettings,
  writeLeftPanelPreferences,
  type StorageLike,
} from '../src/utils/appearanceSettings';

function createMockStorage(initial: Record<string, string> = {}): StorageLike & {
  dump(): Record<string, string>;
} {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    dump: () => Object.fromEntries(store.entries()),
  };
}

test('CP-P01-D0 1. Valores iniciales predeterminados (Dark Pro + Glass Clear + Panel colapsado)', () => {
  assert.equal(DEFAULT_APPEARANCE_SETTINGS.themeMode, 'dark');
  assert.equal(DEFAULT_APPEARANCE_SETTINGS.glassProfile, 'clear');
  assert.equal(DEFAULT_APPEARANCE_SETTINGS.autoLowCostOnRecord, true);
  assert.equal(DEFAULT_APPEARANCE_SETTINGS.reducedTransparency, false);
  assert.equal(DEFAULT_APPEARANCE_SETTINGS.reducedMotion, false);
  assert.equal(DEFAULT_APPEARANCE_SETTINGS.reducedGraphics, false);

  assert.equal(DEFAULT_LEFT_PANEL_PREFERENCES.expanded, false);
  assert.equal(DEFAULT_LEFT_PANEL_PREFERENCES.pinned, false);
  assert.equal(DEFAULT_LEFT_PANEL_PREFERENCES.widthPx, 276);
  assert.equal(DEFAULT_LEFT_PANEL_PREFERENCES.activeSection, 'scenes');
});

test('CP-P01-D0 2. Resolución de tema Auto / Oscuro / Claro y perfiles Liquid Glass', () => {
  const autoDark = resolveAppearanceState(
    { ...DEFAULT_APPEARANCE_SETTINGS, themeMode: 'auto', glassProfile: 'clear' },
    {
      systemPrefersDark: true,
      systemPrefersReducedMotion: false,
      systemPrefersReducedTransparency: false,
      isRecording: false,
    }
  );
  assert.equal(autoDark.resolvedTheme, 'dark');
  assert.equal(autoDark.effectiveMaterialTier, 'clear');

  const autoLight = resolveAppearanceState(
    { ...DEFAULT_APPEARANCE_SETTINGS, themeMode: 'auto', glassProfile: 'regular' },
    {
      systemPrefersDark: false,
      systemPrefersReducedMotion: false,
      systemPrefersReducedTransparency: false,
      isRecording: false,
    }
  );
  assert.equal(autoLight.resolvedTheme, 'light');
  assert.equal(autoLight.effectiveMaterialTier, 'regular');
});

test('CP-P01-D0 3. Salvaguarda automática de rendimiento durante grabación y restauración limpia', () => {
  const whileRecording = resolveAppearanceState(DEFAULT_APPEARANCE_SETTINGS, {
    systemPrefersDark: true,
    systemPrefersReducedMotion: false,
    systemPrefersReducedTransparency: false,
    isRecording: true,
  });
  assert.equal(whileRecording.lowCostActive, true);
  assert.equal(whileRecording.effectiveMaterialTier, 'solid');

  const afterStop = resolveAppearanceState(DEFAULT_APPEARANCE_SETTINGS, {
    systemPrefersDark: true,
    systemPrefersReducedMotion: false,
    systemPrefersReducedTransparency: false,
    isRecording: false,
  });
  assert.equal(afterStop.lowCostActive, false);
  assert.equal(afterStop.effectiveMaterialTier, 'clear');

  const manualOverride = resolveAppearanceState(
    { ...DEFAULT_APPEARANCE_SETTINGS, autoLowCostOnRecord: false, glassProfile: 'tinted' },
    {
      systemPrefersDark: true,
      systemPrefersReducedMotion: false,
      systemPrefersReducedTransparency: false,
      isRecording: true,
    }
  );
  assert.equal(manualOverride.lowCostActive, false);
  assert.equal(manualOverride.effectiveMaterialTier, 'tinted');
});

test('CP-P01-D0 4. Accesibilidad: transparencia reducida y movimiento reducido del usuario/SO', () => {
  const sysReduced = resolveAppearanceState(DEFAULT_APPEARANCE_SETTINGS, {
    systemPrefersDark: false,
    systemPrefersReducedMotion: true,
    systemPrefersReducedTransparency: true,
    isRecording: false,
  });
  assert.equal(sysReduced.effectiveReducedMotion, true);
  assert.equal(sysReduced.effectiveReducedTransparency, true);
  assert.equal(sysReduced.effectiveMaterialTier, 'solid');
});

test('CP-P01-D0 5. Persistencia aislada, clamping del panel izquierdo y recuperación ante JSON corrupto', () => {
  assert.equal(clampLeftPanelWidth(100), LEFT_PANEL_MIN_WIDTH);
  assert.equal(clampLeftPanelWidth(620), LEFT_PANEL_MAX_WIDTH);
  assert.equal(clampLeftPanelWidth(Number.NaN), DEFAULT_LEFT_PANEL_PREFERENCES.widthPx);

  const storage = createMockStorage({
    [APPEARANCE_STORAGE_KEY]: '{broken-json',
    [LEFT_PANEL_STORAGE_KEY]: '{"expanded":true,"pinned":true,"widthPx":999,"activeSection":"invalid"}',
  });

  const recoveredAppearance = readAppearanceSettings(storage);
  assert.deepEqual(recoveredAppearance, DEFAULT_APPEARANCE_SETTINGS);

  const recoveredPanel = readLeftPanelPreferences(storage);
  assert.equal(recoveredPanel.expanded, true);
  assert.equal(recoveredPanel.pinned, true);
  assert.equal(recoveredPanel.widthPx, LEFT_PANEL_MAX_WIDTH);
  assert.equal(recoveredPanel.activeSection, 'scenes');

  writeAppearanceSettings(
    {
      ...DEFAULT_APPEARANCE_SETTINGS,
      themeMode: 'light',
      glassProfile: 'tinted',
      reducedMotion: true,
    },
    storage
  );
  writeLeftPanelPreferences(
    {
      expanded: true,
      pinned: true,
      widthPx: 320,
      activeSection: 'templates',
    },
    storage
  );

  const rereadAppearance = readAppearanceSettings(storage);
  assert.equal(rereadAppearance.themeMode, 'light');
  assert.equal(rereadAppearance.glassProfile, 'tinted');
  assert.equal(rereadAppearance.reducedMotion, true);

  const rereadPanel = readLeftPanelPreferences(storage);
  assert.equal(rereadPanel.widthPx, 320);
  assert.equal(rereadPanel.activeSection, 'templates');

  const normalized = normalizeAppearanceSettings({
    themeMode: 'invalid' as unknown as 'dark',
    glassProfile: 'unknown' as unknown as 'clear',
  });
  assert.equal(normalized.themeMode, 'dark');
  assert.equal(normalized.glassProfile, 'clear');

  const normalizedPanel = normalizeLeftPanelPreferences({ widthPx: 50 });
  assert.equal(normalizedPanel.widthPx, LEFT_PANEL_MIN_WIDTH);
});
