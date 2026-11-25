import React, { useEffect, useState } from 'react';
import {
  Clapperboard,
  Layers,
  LayoutTemplate,
  Monitor,
  PanelLeftClose,
  Pin,
  PinOff,
  RefreshCw,
  Video,
} from 'lucide-react';
import { STUDIO_PRESETS } from '../engine/scenePresets';
import type { StudioEnginePanelProps } from './SidebarControls';
import {
  clampLeftPanelWidth,
  LEFT_PANEL_MAX_WIDTH,
  LEFT_PANEL_MIN_WIDTH,
  type LeftPanelPreferences,
  type LeftStudioSectionId,
} from '../utils/appearanceSettings';
import {
  GlassButton,
  GlassIconButton,
  GlassSegmentedControl,
  GlassSidebar,
  GlassStatusIndicator,
  GlassTooltip,
} from './glass';

interface LeftStudioPanelProps {
  preferences: LeftPanelPreferences;
  onUpdatePreferences: (
    updater:
      | Partial<LeftPanelPreferences>
      | ((prev: LeftPanelPreferences) => LeftPanelPreferences)
  ) => void;
  studioEnginePanel?: StudioEnginePanelProps;
  cameraStatus: 'idle' | 'live' | 'error';
  cameraLabel: string;
  isScreenPipActive: boolean;
  isDualCamActive: boolean;
  onToggleScreenPip: () => void;
  onReconnectSource?: (sourceId: string) => void;
  onOpenRecordingLab: () => void;
}

const SECTION_ITEMS: {
  id: LeftStudioSectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'scenes', label: 'Escenas', icon: Clapperboard },
  { id: 'sources', label: 'Fuentes', icon: Video },
  { id: 'templates', label: 'Plantillas', icon: LayoutTemplate },
  { id: 'layers', label: 'Capas', icon: Layers },
];

export const LeftStudioPanel: React.FC<LeftStudioPanelProps> = ({
  preferences,
  onUpdatePreferences,
  studioEnginePanel,
  cameraStatus,
  cameraLabel,
  isScreenPipActive,
  isDualCamActive,
  onToggleScreenPip,
  onReconnectSource,
  onOpenRecordingLab,
}) => {
  const [resizing, setResizing] = useState(false);
  const [transitionMode, setTransitionMode] = useState<'fade' | 'cut'>('fade');

  useEffect(() => {
    if (!resizing) return;
    const onPointerMove = (e: MouseEvent) => {
      const next = clampLeftPanelWidth(e.clientX);
      onUpdatePreferences({ widthPx: next });
    };
    const onPointerUp = () => setResizing(false);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    return () => {
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
    };
  }, [resizing, onUpdatePreferences]);

  const isStudioMode = studioEnginePanel?.engineMode === 'studio';
  const activeScene = studioEnginePanel?.scenes.find(
    (s) => s.id === studioEnginePanel.activeSceneId
  );

  // Rail compacto colapsado
  if (!preferences.expanded) {
    return (
      <GlassSidebar
        material="regular"
        expanded={false}
        widthPx={preferences.widthPx}
        ariaLabel="Barra compacta de estudio"
      >
        <div className="flex flex-col items-center py-3 gap-2 h-full">
          {SECTION_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = preferences.activeSection === item.id;
            return (
              <GlassTooltip key={item.id} content={item.label} side="bottom">
                <GlassIconButton
                  size="sm"
                  selected={active}
                  label={`Abrir ${item.label}`}
                  onClick={() =>
                    onUpdatePreferences({
                      expanded: true,
                      activeSection: item.id,
                    })
                  }
                >
                  <Icon className="w-3.5 h-3.5" />
                </GlassIconButton>
              </GlassTooltip>
            );
          })}

          <div className="mt-auto pt-2 border-t border-[var(--border-hairline)] flex flex-col items-center gap-1.5">
            <span className="font-mono text-[9px] text-[var(--text-tertiary)]">
              {isStudioMode ? 'STU' : 'LEG'}
            </span>
          </div>
        </div>
      </GlassSidebar>
    );
  }

  return (
    <GlassSidebar
      material="regular"
      expanded={true}
      widthPx={preferences.widthPx}
      ariaLabel="Panel de Escenas, Fuentes, Plantillas y Capas"
    >
      {/* Cabecera del panel izquierdo */}
      <div className="px-3.5 pt-3 pb-2 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold text-[var(--text-primary)] truncate">
            Estudio
          </h2>
          <p className="text-[11px] text-[var(--text-tertiary)] truncate">
            {isStudioMode ? 'Studio Engine activo' : 'Legacy Engine estable'}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <GlassTooltip
            content={
              preferences.pinned ? 'Desfijar panel lateral' : 'Fijar panel durante preparación'
            }
          >
            <GlassIconButton
              size="sm"
              selected={preferences.pinned}
              label={preferences.pinned ? 'Desfijar panel' : 'Fijar panel'}
              onClick={() =>
                onUpdatePreferences((prev) => ({ ...prev, pinned: !prev.pinned }))
              }
            >
              {preferences.pinned ? (
                <Pin className="w-3.5 h-3.5" />
              ) : (
                <PinOff className="w-3.5 h-3.5" />
              )}
            </GlassIconButton>
          </GlassTooltip>

          <GlassTooltip content="Colapsar a barra estrecha">
            <GlassIconButton
              size="sm"
              label="Colapsar panel lateral"
              onClick={() => onUpdatePreferences({ expanded: false })}
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </GlassIconButton>
          </GlassTooltip>
        </div>
      </div>

      {/* Selector de sección */}
      <div className="px-3 pb-2.5 border-b border-[var(--border-hairline)] shrink-0">
        <GlassSegmentedControl<LeftStudioSectionId>
          fullWidth
          size="xs"
          layoutGroupId="left-studio-sections"
          ariaLabel="Secciones del panel izquierdo"
          value={preferences.activeSection}
          onChange={(activeSection) => onUpdatePreferences({ activeSection })}
          options={[
            { id: 'scenes', label: 'Escenas' },
            { id: 'sources', label: 'Fuentes' },
            { id: 'templates', label: 'Plantillas' },
            { id: 'layers', label: 'Capas' },
          ]}
        />
      </div>

      {/* Contenido contextual continuo */}
      <div className="flex-1 overflow-y-auto studio-scroll px-3 py-3 space-y-3">
        {preferences.activeSection === 'scenes' && (
          <>
            {isStudioMode && studioEnginePanel ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-[11px] font-medium text-[var(--text-tertiary)]">
                    Transición
                  </span>
                  <GlassSegmentedControl<'fade' | 'cut'>
                    size="xs"
                    layoutGroupId="left-scene-transition"
                    value={transitionMode}
                    onChange={setTransitionMode}
                    options={[
                      { id: 'fade', label: 'Fade' },
                      { id: 'cut', label: 'Cut' },
                    ]}
                  />
                </div>

                <div className="divide-y divide-[var(--border-hairline)]">
                  {studioEnginePanel.scenes.map((scene) => {
                    const isActive = scene.id === studioEnginePanel.activeSceneId;
                    return (
                      <button
                        key={scene.id}
                        type="button"
                        onClick={() =>
                          studioEnginePanel.onSwitchScene(scene.id, {
                            type: transitionMode,
                            durationMs: transitionMode === 'fade' ? 280 : 0,
                          })
                        }
                        className={`glass-focus-ring w-full px-2.5 py-2.5 text-left transition-colors cursor-pointer rounded-xl ${
                          isActive
                            ? 'bg-[var(--control-active-bg)] text-[var(--control-active-text)]'
                            : 'hover:bg-[var(--studio-surface-subtle)]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                            {scene.name}
                          </span>
                          <span className="font-mono tabular-nums text-[10px] text-[var(--text-tertiary)] shrink-0">
                            {scene.layers.length} capas
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="px-1 py-1 space-y-2.5">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Escena única Legacy activa
                </div>
                <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                  Las escenas múltiples con transiciones Cut/Fade operan mediante Studio Engine experimental. Legacy mantiene tu ruta estable actual.
                </p>
                {studioEnginePanel && (
                  <GlassButton
                    variant="primary"
                    size="xs"
                    disabled={studioEnginePanel.isRecordingLocked}
                    onClick={() => studioEnginePanel.onSwitchEngineMode('studio')}
                  >
                    Activar Studio Engine
                  </GlassButton>
                )}
              </div>
            )}
          </>
        )}

        {preferences.activeSection === 'sources' && (
          <div className="space-y-3">
            {isStudioMode && studioEnginePanel ? (
              <>
                <div className="divide-y divide-[var(--border-hairline)]">
                  {studioEnginePanel.sources.map((src) => (
                    <div key={src.id} className="px-1 py-2.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                          {src.name}
                        </span>
                        <GlassStatusIndicator
                          compact
                          tone={
                            src.status === 'live'
                              ? 'live'
                              : src.status === 'error' || src.status === 'disconnected'
                                ? 'error'
                                : 'neutral'
                          }
                          label={src.status}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[var(--text-tertiary)]">
                        <span>
                          {src.kind} · c:{src.consumers}
                        </span>
                        {onReconnectSource &&
                          (src.kind === 'camera' ||
                            src.kind === 'window' ||
                            src.kind === 'screen') &&
                          src.status !== 'live' && (
                            <button
                              type="button"
                              onClick={() => onReconnectSource(src.id)}
                              className="text-[var(--accent-blue)] hover:underline cursor-pointer inline-flex items-center gap-1"
                            >
                              <RefreshCw className="w-2.5 h-2.5" />
                              Reconectar
                            </button>
                          )}
                      </div>
                    </div>
                  ))}
                </div>

                <GlassButton
                  variant={studioEnginePanel.hasLiveDisplaySource ? 'amber' : 'primary'}
                  size="sm"
                  className="w-full"
                  leadingIcon={<Monitor className="w-3.5 h-3.5" />}
                  onClick={studioEnginePanel.onAuthorizeDisplaySource}
                >
                  {studioEnginePanel.hasLiveDisplaySource
                    ? 'Cambiar pantalla o ventana'
                    : 'Compartir pantalla o ventana'}
                </GlassButton>
              </>
            ) : (
              <div className="divide-y divide-[var(--border-hairline)]">
                <div className="px-1 py-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                      {cameraLabel}
                    </span>
                    <GlassStatusIndicator
                      compact
                      tone={cameraStatus === 'live' ? 'live' : 'neutral'}
                      label={cameraStatus === 'live' ? 'Activa' : 'Sin cámara'}
                    />
                  </div>
                  <div className="text-[11px] text-[var(--text-tertiary)]">
                    Fuente principal Legacy
                  </div>
                </div>

                <div className="px-1 py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium text-[var(--text-primary)]">
                      Ventana compartida
                    </div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">
                      {isScreenPipActive ? 'En vivo' : 'Inactiva'}
                    </div>
                  </div>
                  <GlassButton
                    size="xs"
                    variant={isScreenPipActive ? 'amber' : 'regular'}
                    onClick={onToggleScreenPip}
                  >
                    {isScreenPipActive ? 'Detener' : 'Compartir'}
                  </GlassButton>
                </div>

                {isDualCamActive && (
                  <div className="px-1 py-2.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      Cámara secundaria PiP
                    </span>
                    <GlassStatusIndicator compact tone="live" label="Activa" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {preferences.activeSection === 'templates' && (
          <div className="space-y-2">
            {!isStudioMode && (
              <p className="px-1 text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                Al seleccionar una plantilla se activará Studio Engine para componer escenas multipista.
              </p>
            )}
            <div className="divide-y divide-[var(--border-hairline)]">
              {STUDIO_PRESETS.map((preset) => {
                const active = isStudioMode && activeScene?.presetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={studioEnginePanel?.isRecordingLocked}
                    onClick={async () => {
                      if (!studioEnginePanel) return;
                      if (!isStudioMode) {
                        await studioEnginePanel.onSwitchEngineMode('studio');
                      }
                      studioEnginePanel.onActivatePresetScene(preset.id, {
                        type: transitionMode,
                        durationMs: transitionMode === 'fade' ? 280 : 0,
                      });
                    }}
                    className={`glass-focus-ring w-full rounded-xl px-2.5 py-2.5 text-left transition-colors ${
                      studioEnginePanel?.isRecordingLocked
                        ? 'opacity-45 cursor-not-allowed'
                        : 'cursor-pointer'
                    } ${
                      active
                        ? 'bg-[var(--control-active-bg)]'
                        : 'hover:bg-[var(--studio-surface-subtle)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                        {preset.name}
                      </span>
                      <span className="font-mono tabular-nums text-[10px] text-[var(--text-tertiary)] shrink-0">
                        {preset.recommendedAspectRatio}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-tertiary)] line-clamp-2 mt-0.5 leading-snug">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {preferences.activeSection === 'layers' && (
          <div className="space-y-2.5">
            {isStudioMode && activeScene ? (
              <>
                <div className="flex items-center justify-between px-1 text-[11px] text-[var(--text-tertiary)]">
                  <span>Escena: {activeScene.name}</span>
                  <span className="font-mono tabular-nums">{activeScene.layers.length}</span>
                </div>
                <div className="divide-y divide-[var(--border-hairline)]">
                  {[...activeScene.layers]
                    .sort((a, b) => b.zIndex - a.zIndex)
                    .map((layer) => (
                      <div key={layer.id} className="px-1 py-2.5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                            {layer.name}
                          </span>
                          <span className="font-mono tabular-nums text-[10px] text-[var(--text-tertiary)] shrink-0">
                            z:{layer.zIndex}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[var(--text-tertiary)]">
                          <span>
                            {layer.style.maskShape} · {Math.round(layer.style.opacity * 100)}%
                          </span>
                          <span>{layer.visible ? 'Visible' : 'Oculta'}</span>
                        </div>
                      </div>
                    ))}
                </div>
                <p className="px-1 text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                  La edición interactiva directa sobre el lienzo (arrastrar, recortar y reordenar capas) se habilitará en CP-P02.
                </p>
              </>
            ) : (
              <div className="px-1 py-1 space-y-2.5">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Capas multipista en Studio Engine
                </div>
                <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                  En modo Legacy se compone una salida fija directa. Cambia a Studio Engine desde Grabación o aquí para inspeccionar capas por escena.
                </p>
                <GlassButton size="xs" variant="regular" onClick={onOpenRecordingLab}>
                  Abrir Laboratorio Studio
                </GlassButton>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manejador vertical de ancho ajustable */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ajustar ancho del panel lateral"
        aria-valuemin={LEFT_PANEL_MIN_WIDTH}
        aria-valuemax={LEFT_PANEL_MAX_WIDTH}
        aria-valuenow={preferences.widthPx}
        onMouseDown={(e) => {
          e.preventDefault();
          setResizing(true);
        }}
        className="absolute top-3 bottom-3 right-0 w-1.5 cursor-col-resize hover:bg-[var(--accent-blue-soft)] rounded-full transition-colors"
      />
    </GlassSidebar>
  );
};
