import React from 'react';
import { Camera, PanelRightClose, PanelRightOpen, RefreshCw } from 'lucide-react';
import type { WorkspaceTab } from '../types/camera';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  galleryCount: number;
  cameraStatus: 'idle' | 'live' | 'demo' | 'error';
  onConnectCamera: () => void;
  onQuickCapture: () => void;
  inspectorCollapsed: boolean;
  onToggleInspectorCollapsed: () => void;
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
}) => {
  const navItems: { id: WorkspaceTab; label: string }[] = [
    { id: 'studio', label: 'Estudio' },
    { id: 'filters', label: 'Filtros' },
    { id: 'booth', label: 'Cabina' },
    { id: 'record', label: 'Grabación' },
    { id: 'gallery', label: galleryCount > 0 ? `Galería (${galleryCount})` : 'Galería' },
  ];

  const isMacDesktop =
    typeof window !== 'undefined' &&
    Boolean(window.opticaDesktop?.isElectron && window.opticaDesktop.platform === 'darwin');

  return (
    <header
      className={`px-4 pt-3 pb-1 shrink-0 z-30 ${
        isMacDesktop ? '[-webkit-app-region:drag]' : ''
      }`}
    >
      <div
        className={`liquid-glass-dock rounded-full py-1.5 flex items-center justify-between gap-6 ${
          isMacDesktop ? 'pl-[76px] pr-4' : 'px-4'
        }`}
      >
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('studio')}
          className="pl-1.5 text-[15px] font-semibold tracking-tight text-white/95 whitespace-nowrap shrink-0 hover:text-white transition-colors cursor-pointer [-webkit-app-region:no-drag]"
        >
          Óptica Studio
        </button>

        {/* Zone 2: Apple Liquid Glass floating segmented navigation */}
        <nav
          aria-label="Espacios de trabajo"
          className="liquid-segmented min-w-0 flex items-center gap-0.5 overflow-x-auto no-scrollbar [-webkit-app-region:no-drag]"
        >
          {navItems.map((item) => {
            const isActive =
              activeTab === item.id || (activeTab === 'utilities' && item.id === 'studio');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-full whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                  isActive
                    ? 'liquid-segment-thumb text-white'
                    : 'text-zinc-300/80 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Cinema Focus Toggle + Primary Action */}
        <div className="flex items-center gap-2 shrink-0 [-webkit-app-region:no-drag]">
          {activeTab !== 'gallery' && (
            <button
              type="button"
              onClick={onToggleInspectorCollapsed}
              title={
                inspectorCollapsed
                  ? 'Mostrar panel lateral (H)'
                  : 'Modo Cine: ocultar panel lateral (H)'
              }
              className={`liquid-glass-btn w-8 h-8 rounded-full flex items-center justify-center cursor-pointer ${
                inspectorCollapsed ? 'text-sky-300' : 'text-zinc-200'
              }`}
            >
              {inspectorCollapsed ? (
                <PanelRightOpen className="w-3.5 h-3.5" />
              ) : (
                <PanelRightClose className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {cameraStatus === 'live' ? (
            <button
              type="button"
              onClick={onQuickCapture}
              className="liquid-glass-btn-active inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Capturar Foto</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnectCamera}
              className="liquid-glass-blue inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Activar Cámara</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
