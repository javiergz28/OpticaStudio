import React, { useRef, useState } from 'react';
import {
  Camera,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import type { WorkspaceTab } from '../types/camera';
import type {
  AppearanceSettings,
  ResolvedAppearanceState,
} from '../utils/appearanceSettings';
import { AppearanceControls } from './AppearanceControls';
import {
  GlassButton,
  GlassIconButton,
  GlassPopover,
  GlassSegmentedControl,
  GlassStatusIndicator,
  GlassTooltip,
} from './glass';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  galleryCount: number;
  cameraStatus: 'idle' | 'live' | 'error';
  onConnectCamera: () => void;
  onQuickCapture: () => void;
  inspectorCollapsed: boolean;
  onToggleInspectorCollapsed: () => void;
  leftPanelExpanded: boolean;
  onToggleLeftPanel: () => void;
  cinemaMode: boolean;
  onToggleCinemaMode: () => void;
  isRecording: boolean;
  isRecordingPaused: boolean;
  recordingSeconds: number;
  appearanceSettings: AppearanceSettings;
  resolvedAppearance: ResolvedAppearanceState;
  onUpdateAppearance: (
    updater:
      | Partial<AppearanceSettings>
      | ((prev: AppearanceSettings) => AppearanceSettings)
  ) => void;
  onResetAppearance: () => void;
}

function formatRecTime(sec: number): string {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  galleryCount,
  cameraStatus,
  onConnectCamera,
  onQuickCapture,
  inspectorCollapsed,
  onToggleInspectorCollapsed,
  leftPanelExpanded,
  onToggleLeftPanel,
  cinemaMode,
  onToggleCinemaMode,
  isRecording,
  isRecordingPaused,
  recordingSeconds,
  appearanceSettings,
  resolvedAppearance,
  onUpdateAppearance,
  onResetAppearance,
}) => {
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const appearanceBtnRef = useRef<HTMLButtonElement | null>(null);

  const normalizedTab: Exclude<WorkspaceTab, 'utilities'> =
    activeTab === 'utilities' ? 'studio' : activeTab;

  const navOptions: { id: Exclude<WorkspaceTab, 'utilities'>; label: string }[] = [
    { id: 'studio', label: 'Estudio' },
    { id: 'filters', label: 'Filtros' },
    { id: 'booth', label: 'Cabina' },
    { id: 'record', label: 'Grabación' },
    { id: 'gallery', label: galleryCount > 0 ? `Galería · ${galleryCount}` : 'Galería' },
  ];

  const isMacDesktop =
    typeof window !== 'undefined' &&
    Boolean(window.opticaDesktop?.isElectron && window.opticaDesktop.platform === 'darwin');

  return (
    <header
      className={`studio-chrome-bar studio-topbar border-b border-[var(--border-hairline)] shrink-0 z-30 ${
        isMacDesktop ? 'studio-topbar-mac [-webkit-app-region:drag]' : ''
      }`}
    >
      {/* Zona 1: Identidad limpia + Toggle panel izquierdo */}
      <div className="studio-topbar-identity flex items-center gap-2.5 min-w-0 [-webkit-app-region:no-drag]">
        {activeTab !== 'gallery' && (
          <GlassTooltip
            content={leftPanelExpanded ? 'Colapsar panel lateral' : 'Expandir Escenas y Fuentes'}
          >
            <GlassIconButton
              size="sm"
              variant="regular"
              selected={leftPanelExpanded}
              label={leftPanelExpanded ? 'Colapsar panel izquierdo' : 'Expandir panel izquierdo'}
              onClick={onToggleLeftPanel}
            >
              {leftPanelExpanded ? (
                <PanelLeftClose className="w-3.5 h-3.5" />
              ) : (
                <PanelLeftOpen className="w-3.5 h-3.5" />
              )}
            </GlassIconButton>
          </GlassTooltip>
        )}

        <button
          type="button"
          onClick={() => onSelectTab('studio')}
          className="studio-topbar-title glass-focus-ring py-1 rounded-lg text-[13px] font-semibold tracking-tight text-[var(--text-primary)] truncate min-w-0 cursor-pointer"
        >
          Óptica Studio
        </button>
      </div>

      {/* Zona 2: Navegación segmentada continua Apple 27 */}
      <nav
        aria-label="Espacios de trabajo"
        className="studio-topbar-nav min-w-0 flex items-center justify-center [-webkit-app-region:no-drag]"
      >
        <GlassSegmentedControl<Exclude<WorkspaceTab, 'utilities'>>
          layoutGroupId="topbar-workspace-nav"
          className="studio-topbar-segments"
          ariaLabel="Espacios de trabajo"
          value={normalizedTab}
          onChange={onSelectTab}
          options={navOptions}
        />
      </nav>

      {/* Zona 3: Estado real, Apariencia, Cine, Inspector y Acción Principal */}
      <div className="studio-topbar-actions flex items-center gap-1.5 min-w-0 justify-end [-webkit-app-region:no-drag]">
        {isRecording ? (
          <button
            type="button"
            onClick={() => onSelectTab('record')}
            title="Grabación en curso"
            className="glass-clear hidden min-[1100px]:inline-flex items-center px-2.5 py-1 rounded-full cursor-pointer"
          >
            <GlassStatusIndicator
              compact
              tone={isRecordingPaused ? 'paused' : 'recording'}
              label={isRecordingPaused ? 'PAUSA' : 'REC'}
              monoDetail={formatRecTime(recordingSeconds)}
            />
          </button>
        ) : (
          <div className="hidden min-[1180px]:inline-flex items-center px-2">
            <GlassStatusIndicator
              compact
              tone={
                cameraStatus === 'live'
                  ? 'live'
                  : cameraStatus === 'error'
                    ? 'error'
                    : 'neutral'
              }
              label={
                cameraStatus === 'live'
                  ? 'En vivo'
                  : cameraStatus === 'error'
                    ? 'Sin cámara'
                    : 'Sin cámara'
              }
            />
          </div>
        )}

        <div className="relative">
          <GlassTooltip content="Apariencia y Material" side="bottom">
            <GlassIconButton
              ref={appearanceBtnRef as React.Ref<HTMLButtonElement>}
              size="sm"
              selected={appearanceOpen}
              label="Ajustes de apariencia y material"
              onClick={() => setAppearanceOpen((v) => !v)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </GlassIconButton>
          </GlassTooltip>
          <GlassPopover
            open={appearanceOpen}
            onClose={() => setAppearanceOpen(false)}
            anchorRef={appearanceBtnRef}
            align="right"
            widthClass="w-[310px]"
            ariaLabel="Personalización visual"
          >
            <AppearanceControls
              compact
              settings={appearanceSettings}
              resolved={resolvedAppearance}
              onUpdate={onUpdateAppearance}
              onReset={onResetAppearance}
            />
          </GlassPopover>
        </div>

        {activeTab !== 'gallery' && (
          <>
            <GlassTooltip
              content={cinemaMode ? 'Salir de Modo Cine' : 'Modo Cine'}
              shortcut="C"
              side="bottom"
            >
              <GlassIconButton
                size="sm"
                selected={cinemaMode}
                label={cinemaMode ? 'Salir de Modo Cine' : 'Activar Modo Cine'}
                onClick={onToggleCinemaMode}
              >
                {cinemaMode ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </GlassIconButton>
            </GlassTooltip>

            <GlassTooltip
              content={inspectorCollapsed ? 'Mostrar inspector' : 'Ocultar inspector'}
              shortcut="H"
              side="bottom"
            >
              <GlassIconButton
                size="sm"
                selected={inspectorCollapsed}
                label={inspectorCollapsed ? 'Mostrar inspector lateral' : 'Ocultar inspector lateral'}
                onClick={onToggleInspectorCollapsed}
              >
                {inspectorCollapsed ? (
                  <PanelRightOpen className="w-3.5 h-3.5" />
                ) : (
                  <PanelRightClose className="w-3.5 h-3.5" />
                )}
              </GlassIconButton>
            </GlassTooltip>
          </>
        )}

        {cameraStatus === 'live' ? (
          <GlassButton
            variant="regular"
            size="sm"
            selected
            onClick={onQuickCapture}
            leadingIcon={<Camera className="w-3.5 h-3.5" />}
          >
            <span className="hidden min-[1060px]:inline">Capturar Foto</span>
            <span className="min-[1060px]:hidden">Foto</span>
          </GlassButton>
        ) : (
          <GlassButton
            variant="primary"
            size="sm"
            onClick={onConnectCamera}
            leadingIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            <span className="hidden min-[1060px]:inline">Activar Cámara</span>
            <span className="min-[1060px]:hidden">Cámara</span>
          </GlassButton>
        )}
      </div>
    </header>
  );
};
