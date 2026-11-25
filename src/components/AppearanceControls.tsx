import React from 'react';
import { Monitor, Moon, RotateCcw, Sun } from 'lucide-react';
import type {
  AppearanceSettings,
  AppearanceThemeMode,
  GlassProfileMode,
  ResolvedAppearanceState,
} from '../utils/appearanceSettings';
import { GlassButton, GlassSegmentedControl, GlassToggle } from './glass';

interface AppearanceControlsProps {
  settings: AppearanceSettings;
  resolved: ResolvedAppearanceState;
  onUpdate: (
    updater:
      | Partial<AppearanceSettings>
      | ((prev: AppearanceSettings) => AppearanceSettings)
  ) => void;
  onReset: () => void;
  compact?: boolean;
}

export const AppearanceControls: React.FC<AppearanceControlsProps> = ({
  settings,
  resolved,
  onUpdate,
  onReset,
  compact = false,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-[var(--text-primary)]">
            Apariencia y Material
          </h3>
          <p className="text-[11px] text-[var(--text-tertiary)]">
            Material activo:{' '}
            <span className="font-mono text-[var(--text-secondary)]">
              {resolved.effectiveMaterialTier}
            </span>
            {resolved.lowCostActive ? ' (Modo ligero activo)' : ''}
          </p>
        </div>
        {!compact && (
          <GlassButton
            size="xs"
            variant="ghost"
            onClick={onReset}
            leadingIcon={<RotateCcw className="w-3 h-3" />}
          >
            Restablecer
          </GlassButton>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="text-[11px] text-[var(--text-tertiary)]">Tema de interfaz</div>
        <GlassSegmentedControl<AppearanceThemeMode>
          fullWidth
          size="xs"
          layoutGroupId={compact ? 'appearance-theme-pop' : 'appearance-theme-insp'}
          ariaLabel="Tema de interfaz"
          value={settings.themeMode}
          onChange={(themeMode) => onUpdate({ themeMode })}
          options={[
            {
              id: 'auto',
              label: (
                <>
                  <Monitor className="w-3 h-3" />
                  <span>Auto</span>
                </>
              ),
            },
            {
              id: 'dark',
              label: (
                <>
                  <Moon className="w-3 h-3" />
                  <span>Oscuro</span>
                </>
              ),
            },
            {
              id: 'light',
              label: (
                <>
                  <Sun className="w-3 h-3" />
                  <span>Claro</span>
                </>
              ),
            },
          ]}
        />
      </div>

      <div className="space-y-1.5">
        <div className="text-[11px] text-[var(--text-tertiary)]">Material Liquid Glass</div>
        <GlassSegmentedControl<GlassProfileMode>
          fullWidth
          size="xs"
          layoutGroupId={compact ? 'appearance-glass-pop' : 'appearance-glass-insp'}
          ariaLabel="Perfil de material Liquid Glass"
          value={settings.glassProfile}
          onChange={(glassProfile) => onUpdate({ glassProfile })}
          options={[
            { id: 'clear', label: 'Glass Clear' },
            { id: 'regular', label: 'Glass Regular' },
            { id: 'tinted', label: 'Tintado' },
          ]}
        />
      </div>

      <div className="liquid-divider" />

      <div className="space-y-1">
        <GlassToggle
          subtle
          label="Modo ligero automático al grabar"
          description="Reduce desenfoques pesados durante MediaRecorder para proteger FPS."
          checked={settings.autoLowCostOnRecord}
          onChange={(autoLowCostOnRecord) => onUpdate({ autoLowCostOnRecord })}
        />
        <GlassToggle
          subtle
          label="Transparencia reducida (Glass Solid)"
          checked={settings.reducedTransparency}
          onChange={(reducedTransparency) => onUpdate({ reducedTransparency })}
        />
        <GlassToggle
          subtle
          label="Movimiento reducido"
          checked={settings.reducedMotion}
          onChange={(reducedMotion) => onUpdate({ reducedMotion })}
        />
        <GlassToggle
          subtle
          label="Efectos gráficos reducidos en UI"
          checked={settings.reducedGraphics}
          onChange={(reducedGraphics) => onUpdate({ reducedGraphics })}
        />
      </div>

      {compact && (
        <div className="pt-1 flex justify-end">
          <GlassButton
            size="xs"
            variant="ghost"
            onClick={onReset}
            leadingIcon={<RotateCcw className="w-3 h-3" />}
          >
            Restablecer apariencia
          </GlassButton>
        </div>
      )}
    </div>
  );
};
