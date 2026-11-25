import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_LEFT_PANEL_PREFERENCES,
  readAppearanceSettings,
  readLeftPanelPreferences,
  resolveAppearanceState,
  writeAppearanceSettings,
  writeLeftPanelPreferences,
  type AppearanceSettings,
  type LeftPanelPreferences,
  type ResolvedAppearanceState,
} from '../utils/appearanceSettings';

function getMediaMatch(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(query).matches;
}

export interface UseAppearanceResult {
  settings: AppearanceSettings;
  resolved: ResolvedAppearanceState;
  leftPanel: LeftPanelPreferences;
  updateSettings: (
    updater:
      | Partial<AppearanceSettings>
      | ((prev: AppearanceSettings) => AppearanceSettings)
  ) => void;
  updateLeftPanel: (
    updater:
      | Partial<LeftPanelPreferences>
      | ((prev: LeftPanelPreferences) => LeftPanelPreferences)
  ) => void;
  resetAppearance: () => void;
}

export function useAppearance(isRecording: boolean): UseAppearanceResult {
  const [settings, setSettings] = useState<AppearanceSettings>(() => readAppearanceSettings());
  const [leftPanel, setLeftPanel] = useState<LeftPanelPreferences>(() =>
    readLeftPanelPreferences()
  );

  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  );
  const [systemPrefersReducedMotion, setSystemPrefersReducedMotion] = useState<boolean>(() =>
    getMediaMatch('(prefers-reduced-motion: reduce)')
  );
  const [systemPrefersReducedTransparency, setSystemPrefersReducedTransparency] =
    useState<boolean>(() => getMediaMatch('(prefers-reduced-transparency: reduce)'));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const darkMql = window.matchMedia('(prefers-color-scheme: dark)');
    const motionMql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const transMql = window.matchMedia('(prefers-reduced-transparency: reduce)');

    const onDark = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    const onMotion = (e: MediaQueryListEvent) => setSystemPrefersReducedMotion(e.matches);
    const onTrans = (e: MediaQueryListEvent) => setSystemPrefersReducedTransparency(e.matches);

    darkMql.addEventListener?.('change', onDark);
    motionMql.addEventListener?.('change', onMotion);
    transMql.addEventListener?.('change', onTrans);
    return () => {
      darkMql.removeEventListener?.('change', onDark);
      motionMql.removeEventListener?.('change', onMotion);
      transMql.removeEventListener?.('change', onTrans);
    };
  }, []);

  const resolved = useMemo(
    () =>
      resolveAppearanceState(settings, {
        systemPrefersDark,
        systemPrefersReducedMotion,
        systemPrefersReducedTransparency,
        isRecording,
      }),
    [
      settings,
      systemPrefersDark,
      systemPrefersReducedMotion,
      systemPrefersReducedTransparency,
      isRecording,
    ]
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (resolved.resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.setAttribute('data-glass-profile', settings.glassProfile);
    root.setAttribute('data-low-cost', resolved.lowCostActive ? 'true' : 'false');
    root.setAttribute(
      'data-reduced-transparency',
      resolved.effectiveReducedTransparency ? 'true' : 'false'
    );
    root.setAttribute(
      'data-reduced-motion',
      resolved.effectiveReducedMotion ? 'true' : 'false'
    );
  }, [resolved, settings.glassProfile]);

  const updateSettings = useCallback(
    (
      updater:
        | Partial<AppearanceSettings>
        | ((prev: AppearanceSettings) => AppearanceSettings)
    ) => {
      setSettings((prev) => {
        const next =
          typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
        return writeAppearanceSettings(next);
      });
    },
    []
  );

  const updateLeftPanel = useCallback(
    (
      updater:
        | Partial<LeftPanelPreferences>
        | ((prev: LeftPanelPreferences) => LeftPanelPreferences)
    ) => {
      setLeftPanel((prev) => {
        const next =
          typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
        return writeLeftPanelPreferences(next);
      });
    },
    []
  );

  const resetAppearance = useCallback(() => {
    setSettings(writeAppearanceSettings(DEFAULT_APPEARANCE_SETTINGS));
    setLeftPanel(writeLeftPanelPreferences(DEFAULT_LEFT_PANEL_PREFERENCES));
  }, []);

  return {
    settings,
    resolved,
    leftPanel,
    updateSettings,
    updateLeftPanel,
    resetAppearance,
  };
}
