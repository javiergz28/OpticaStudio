import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppWindow,
  ArrowDown,
  ArrowUp,
  Camera,
  ChevronsDown,
  ChevronsUp,
  Clapperboard,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  Film,
  GripVertical,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  Lock,
  Mic,
  Monitor,
  MoreHorizontal,
  Palette,
  PanelLeftClose,
  Pin,
  PinOff,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Upload,
  Video,
  Volume2,
} from 'lucide-react';
import { STUDIO_PRESETS } from '../engine/scenePresets';
import {
  ADAPTABLE_COMPOSITIONS,
  isVisualSourceEditable,
  type AdaptableSceneLayoutId,
} from '../engine/layerEditor';
import type { SceneLayer, StudioSource, StudioSourceKind } from '../types/studio';
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
  GlassContextMenu,
  GlassDialog,
  GlassIconButton,
  GlassPopover,
  GlassSegmentedControl,
  GlassSidebar,
  GlassStatusIndicator,
  GlassTooltip,
  type ContextMenuItem,
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
  isTransparentCutoutActive?: boolean;
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

type PickerSourceKind =
  | 'camera'
  | 'window'
  | 'screen'
  | 'image'
  | 'video-file'
  | 'text'
  | 'color'
  | 'gradient'
  | 'microphone'
  | 'audio-file'
  | 'system-audio';

const SOURCE_KIND_OPTIONS: Array<{
  kind: PickerSourceKind;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { kind: 'camera', label: 'Cámara', icon: Camera },
  { kind: 'window', label: 'Ventana', icon: AppWindow },
  { kind: 'screen', label: 'Pantalla', icon: Monitor },
  { kind: 'image', label: 'Imagen', icon: ImageIcon },
  { kind: 'video-file', label: 'Vídeo', icon: Film },
  { kind: 'text', label: 'Texto', icon: Type },
  { kind: 'color', label: 'Color', icon: Palette },
  { kind: 'gradient', label: 'Degradado', icon: Sparkles },
  { kind: 'microphone', label: 'Micrófono', icon: Mic },
  { kind: 'audio-file', label: 'Audio', icon: Volume2 },
  { kind: 'system-audio', label: 'Audio del sistema', icon: Volume2 },
];

function getSourceIcon(kind: StudioSourceKind | undefined): React.ComponentType<{ className?: string }> {
  switch (kind) {
    case 'camera':
      return Camera;
    case 'window':
      return AppWindow;
    case 'screen':
      return Monitor;
    case 'image':
      return ImageIcon;
    case 'video-file':
      return Film;
    case 'text':
      return Type;
    case 'color':
    case 'gradient':
      return Palette;
    case 'microphone':
      return Mic;
    case 'audio-file':
    case 'system-audio':
      return Volume2;
    default:
      return Layers;
  }
}

function getSourceKindLabel(kind: StudioSourceKind | undefined): string {
  switch (kind) {
    case 'camera':
      return 'Cámara';
    case 'window':
      return 'Ventana';
    case 'screen':
      return 'Pantalla';
    case 'image':
      return 'Imagen';
    case 'video-file':
      return 'Vídeo';
    case 'text':
      return 'Texto';
    case 'color':
      return 'Color';
    case 'gradient':
      return 'Degradado';
    case 'microphone':
      return 'Micrófono';
    case 'audio-file':
      return 'Audio local';
    case 'system-audio':
      return 'Audio del sistema';
    default:
      return 'Capa';
  }
}

function getSourceStatusLabel(
  source: StudioSource | undefined,
  runtimeStatus: string | undefined
): { label: string; toneClass: string } {
  if (!source) {
    return { label: 'Sin fuente', toneClass: 'text-[var(--text-tertiary)]' };
  }
  if (source.kind === 'text' || source.kind === 'color' || source.kind === 'gradient') {
    return { label: 'Gráfica', toneClass: 'text-[var(--text-tertiary)]' };
  }
  if (runtimeStatus === 'live') {
    return { label: 'En vivo', toneClass: 'text-emerald-400' };
  }
  if (runtimeStatus === 'paused') {
    return { label: 'Pausada', toneClass: 'text-[var(--text-tertiary)]' };
  }
  if (runtimeStatus === 'error') {
    return { label: 'Error', toneClass: 'text-rose-400' };
  }
  if (runtimeStatus === 'disconnected') {
    return { label: 'Desconectada', toneClass: 'text-amber-400' };
  }
  if (source.kind === 'window' || source.kind === 'screen') {
    return { label: 'Autorizar', toneClass: 'text-[var(--accent-blue)]' };
  }
  return { label: 'En espera', toneClass: 'text-[var(--text-tertiary)]' };
}

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
  isTransparentCutoutActive = false,
}) => {
  const [resizing, setResizing] = useState(false);
  const [transitionMode, setTransitionMode] = useState<'fade' | 'cut'>('fade');

  // Reordenamiento por arrastre en Capas
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    layerId: string;
    position: 'above' | 'below';
  } | null>(null);

  // Renombrado inline de capas y fuentes
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState('');
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editingSourceName, setEditingSourceName] = useState('');

  // Menú contextual de capa
  const [layerContextMenu, setLayerContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    layerId: string | null;
  }>({ open: false, x: 0, y: 0, layerId: null });

  // Confirmación segura de eliminación de capa de escena
  const [confirmRemoveLayer, setConfirmRemoveLayer] = useState<{
    sceneId: string;
    layer: SceneLayer;
  } | null>(null);

  // Feedback honesto y reversible dentro del panel
  const [panelNotice, setPanelNotice] = useState<{
    message: string;
    tone: 'info' | 'error';
    allowUndo?: boolean;
  } | null>(null);

  // Participación en composición multicapa
  const [selectedLayoutId, setSelectedLayoutId] =
    useState<AdaptableSceneLayoutId>('screen-main-cam-pip');
  const [showParticipationPicker, setShowParticipationPicker] = useState(false);
  const [participatingIds, setParticipatingIds] = useState<string[] | null>(null);

  // Popover Añadir fuente real
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const addSourceBtnRef = useRef<HTMLButtonElement | null>(null);
  const [pickerKind, setPickerKind] = useState<PickerSourceKind>('camera');
  const [devices, setDevices] = useState<
    Array<{ deviceId: string; kind: string; label: string }>
  >([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [includeDisplayAudio, setIncludeDisplayAudio] = useState(false);
  const [textValue, setTextValue] = useState('Título en vivo');
  const [textSubtitle, setTextSubtitle] = useState('');
  const [textGlassBackdrop, setTextGlassBackdrop] = useState(true);
  const [solidColor, setSolidColor] = useState('#141A24');
  const [gradStart, setGradStart] = useState('#111827');
  const [gradEnd, setGradEnd] = useState('#1E3A5F');
  const [gradAngle, setGradAngle] = useState(135);
  const [addingBusy, setAddingBusy] = useState(false);

  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);

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

  // Limpiar participación manual al cambiar de escena
  useEffect(() => {
    setParticipatingIds(null);
    setEditingLayerId(null);
  }, [activeScene?.id]);

  // Enumerar dispositivos reales cuando se abre Añadir fuente en cámara/micrófono
  useEffect(() => {
    if (!addSourceOpen || !studioEnginePanel?.onEnumerateDevices) return;
    if (pickerKind !== 'camera' && pickerKind !== 'microphone') return;

    let cancelled = false;
    setDevicesLoading(true);
    void studioEnginePanel
      .onEnumerateDevices()
      .then((list) => {
        if (cancelled) return;
        setDevices(list);
        const desiredKind = pickerKind === 'camera' ? 'videoinput' : 'audioinput';
        const filtered = list.filter((d) => d.kind === desiredKind);
        setSelectedDeviceId((prev) =>
          filtered.some((d) => d.deviceId === prev)
            ? prev
            : filtered[0]?.deviceId ?? ''
        );
      })
      .finally(() => {
        if (!cancelled) setDevicesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [addSourceOpen, pickerKind, studioEnginePanel]);

  const layersDescending = useMemo(() => {
    if (!activeScene) return [];
    return [...activeScene.layers].sort((a, b) => b.zIndex - a.zIndex);
  }, [activeScene]);

  const sourceById = useMemo(() => {
    const map = new Map<string, StudioSource>();
    for (const s of studioEnginePanel?.projectSources ?? []) {
      map.set(s.id, s);
    }
    return map;
  }, [studioEnginePanel?.projectSources]);

  const runtimeById = useMemo(() => {
    const map = new Map<string, StudioEnginePanelProps['sources'][number]>();
    for (const s of studioEnginePanel?.sources ?? []) {
      map.set(s.id, s);
    }
    return map;
  }, [studioEnginePanel?.sources]);

  const visualLayersInScene = useMemo(
    () =>
      layersDescending.filter((l) => isVisualSourceEditable(sourceById.get(l.sourceId))),
    [layersDescending, sourceById]
  );

  const sourceUsageCountById = useMemo(() => {
    const counts = new Map<string, number>();
    for (const scene of studioEnginePanel?.scenes ?? []) {
      for (const layer of scene.layers) {
        counts.set(layer.sourceId, (counts.get(layer.sourceId) ?? 0) + 1);
      }
    }
    return counts;
  }, [studioEnginePanel?.scenes]);

  const sourceResolutionById = useMemo(() => {
    const map = new Map<string, { width: number; height: number }>();
    const diags = studioEnginePanel?.diagnosticsSnapshot?.layerDiagnostics ?? [];
    const diagByLayerId = new Map(diags.map((d) => [d.layerId, d]));
    for (const scene of studioEnginePanel?.scenes ?? []) {
      for (const layer of scene.layers) {
        const d = diagByLayerId.get(layer.id);
        if (d && d.intrinsicWidth > 0 && d.intrinsicHeight > 0 && !map.has(layer.sourceId)) {
          map.set(layer.sourceId, { width: d.intrinsicWidth, height: d.intrinsicHeight });
        }
      }
    }
    return map;
  }, [studioEnginePanel?.diagnosticsSnapshot, studioEnginePanel?.scenes]);

  const beginInlineRename = (layer: SceneLayer) => {
    setEditingLayerId(layer.id);
    setEditingLayerName(layer.name);
  };

  const commitInlineRename = () => {
    if (!editingLayerId || !activeScene || !studioEnginePanel?.onRenameLayer) {
      setEditingLayerId(null);
      return;
    }
    const trimmed = editingLayerName.trim();
    if (trimmed.length > 0) {
      studioEnginePanel.onRenameLayer(activeScene.id, editingLayerId, trimmed);
    }
    setEditingLayerId(null);
  };

  const beginInlineSourceRename = (sourceId: string, currentName: string) => {
    setEditingSourceId(sourceId);
    setEditingSourceName(currentName);
  };

  const commitInlineSourceRename = () => {
    if (!editingSourceId || !studioEnginePanel?.onRenameProjectSource) {
      setEditingSourceId(null);
      return;
    }
    const trimmed = editingSourceName.trim();
    if (trimmed.length > 0) {
      studioEnginePanel.onRenameProjectSource(editingSourceId, trimmed);
    }
    setEditingSourceId(null);
  };

  const handleToggleLayerVisibility = async (layer: SceneLayer) => {
    if (!activeScene || !studioEnginePanel?.onToggleLayerVisible) return;
    const res = await studioEnginePanel.onToggleLayerVisible(
      activeScene.id,
      layer.id,
      !layer.visible
    );
    if (res && !res.ok && res.reason) {
      setPanelNotice({ message: res.reason, tone: 'error' });
    }
  };

  const handleDropOnLayer = (targetLayerId: string) => {
    if (!activeScene || !draggedLayerId || !dropTarget || !studioEnginePanel?.onReorderLayers) {
      setDraggedLayerId(null);
      setDropTarget(null);
      return;
    }
    if (draggedLayerId === targetLayerId) {
      setDraggedLayerId(null);
      setDropTarget(null);
      return;
    }

    const currentDesc = layersDescending.map((l) => l.id);
    const fromIdx = currentDesc.indexOf(draggedLayerId);
    if (fromIdx === -1) {
      setDraggedLayerId(null);
      setDropTarget(null);
      return;
    }

    const nextDesc = [...currentDesc];
    const [moved] = nextDesc.splice(fromIdx, 1);
    const targetIdxAfterRemoval = nextDesc.indexOf(targetLayerId);
    if (targetIdxAfterRemoval === -1) {
      setDraggedLayerId(null);
      setDropTarget(null);
      return;
    }
    const insertIdx =
      dropTarget.position === 'above' ? targetIdxAfterRemoval : targetIdxAfterRemoval + 1;
    nextDesc.splice(insertIdx, 0, moved);

    const orderedAsc = [...nextDesc].reverse();
    studioEnginePanel.onReorderLayers(activeScene.id, orderedAsc);
    setDraggedLayerId(null);
    setDropTarget(null);
  };

  const executeAddRealSource = async (
    request: Parameters<NonNullable<StudioEnginePanelProps['onAddRealSource']>>[1]
  ) => {
    if (!activeScene || !studioEnginePanel?.onAddRealSource) return;
    setAddingBusy(true);
    try {
      const res = await studioEnginePanel.onAddRealSource(activeScene.id, request);
      if (!res.ok) {
        if (res.canceled) {
          setPanelNotice({
            message: 'Selección cancelada por el usuario.',
            tone: 'info',
          });
        } else if (res.reason) {
          setPanelNotice({ message: res.reason, tone: 'error' });
        }
        return;
      }

      setAddSourceOpen(false);
      if (res.layer && isVisualSourceEditable(res.source)) {
        studioEnginePanel.onSelectLayer(res.layer.id);
      }
      setPanelNotice({
        message: `Fuente añadida: ${res.source?.name ?? 'nueva capa'}`,
        tone: 'info',
        allowUndo: true,
      });
    } finally {
      setAddingBusy(false);
    }
  };

  const handleConfirmRemoveLayer = () => {
    if (!confirmRemoveLayer || !studioEnginePanel?.onRemoveLayer) return;
    const res = studioEnginePanel.onRemoveLayer(
      confirmRemoveLayer.sceneId,
      confirmRemoveLayer.layer.id
    );
    if (res && !res.ok) {
      setPanelNotice({
        message: res.reason ?? 'No se pudo quitar la capa de la escena.',
        tone: 'error',
      });
      setConfirmRemoveLayer(null);
      return;
    }

    if (studioEnginePanel.selectedLayerId === confirmRemoveLayer.layer.id) {
      studioEnginePanel.onSelectLayer(null);
    }
    setPanelNotice({
      message: `Capa "${confirmRemoveLayer.layer.name}" quitada de la escena.`,
      tone: 'info',
      allowUndo: true,
    });
    setConfirmRemoveLayer(null);
  };

  const contextLayer =
    activeScene?.layers.find((l) => l.id === layerContextMenu.layerId) ?? null;
  const contextSource = contextLayer ? sourceById.get(contextLayer.sourceId) : undefined;
  const contextVisualEditable = isVisualSourceEditable(contextSource);
  const contextDescIndex = contextLayer
    ? layersDescending.findIndex((l) => l.id === contextLayer.id)
    : -1;

  const layerMenuItems: ContextMenuItem[] =
    contextLayer && activeScene && studioEnginePanel
      ? [
          {
            id: 'ctx-layer-rename',
            label: 'Renombrar',
            icon: <Edit3 className="w-3.5 h-3.5" />,
            onSelect: () => beginInlineRename(contextLayer),
          },
          {
            id: 'ctx-layer-visibility',
            label: contextLayer.visible ? 'Ocultar' : 'Mostrar',
            icon: contextLayer.visible ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            ),
            onSelect: () => {
              void handleToggleLayerVisibility(contextLayer);
            },
          },
          {
            id: 'ctx-layer-lock',
            label: contextLayer.locked ? 'Desbloquear' : 'Bloquear',
            icon: contextLayer.locked ? (
              <Unlock className="w-3.5 h-3.5" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            ),
            onSelect: () =>
              studioEnginePanel.onToggleLayerLock(
                activeScene.id,
                contextLayer.id,
                !contextLayer.locked
              ),
          },
          {
            id: 'ctx-layer-up',
            label: 'Subir un nivel',
            icon: <ArrowUp className="w-3.5 h-3.5" />,
            shortcut: '⌥↑',
            disabled: contextDescIndex <= 0,
            onSelect: () =>
              studioEnginePanel.onMoveLayerOrder?.(
                activeScene.id,
                contextLayer.id,
                'up'
              ),
          },
          {
            id: 'ctx-layer-down',
            label: 'Bajar un nivel',
            icon: <ArrowDown className="w-3.5 h-3.5" />,
            shortcut: '⌥↓',
            disabled:
              contextDescIndex === -1 || contextDescIndex >= layersDescending.length - 1,
            onSelect: () =>
              studioEnginePanel.onMoveLayerOrder?.(
                activeScene.id,
                contextLayer.id,
                'down'
              ),
          },
          {
            id: 'ctx-layer-top',
            label: 'Traer al frente',
            icon: <ChevronsUp className="w-3.5 h-3.5" />,
            disabled: contextDescIndex <= 0,
            onSelect: () =>
              studioEnginePanel.onMoveLayerOrder?.(
                activeScene.id,
                contextLayer.id,
                'top'
              ),
          },
          {
            id: 'ctx-layer-bottom',
            label: 'Enviar al fondo',
            icon: <ChevronsDown className="w-3.5 h-3.5" />,
            disabled:
              contextDescIndex === -1 || contextDescIndex >= layersDescending.length - 1,
            onSelect: () =>
              studioEnginePanel.onMoveLayerOrder?.(
                activeScene.id,
                contextLayer.id,
                'bottom'
              ),
          },
          {
            id: 'ctx-layer-duplicate',
            label: 'Duplicar capa',
            icon: <Copy className="w-3.5 h-3.5" />,
            onSelect: () => {
              const res = studioEnginePanel.onDuplicateLayer?.(
                activeScene.id,
                contextLayer.id
              );
              if (res?.ok && res.layer && contextVisualEditable) {
                studioEnginePanel.onSelectLayer(res.layer.id);
              }
            },
          },
          {
            id: 'ctx-layer-reset-transform',
            label: 'Restablecer transformación',
            icon: <RotateCcw className="w-3.5 h-3.5" />,
            disabled: !contextVisualEditable || contextLayer.locked,
            onSelect: () =>
              studioEnginePanel.onResetLayerTransform?.(
                activeScene.id,
                contextLayer.id
              ),
          },
          {
            id: 'ctx-layer-reset-style',
            label: 'Restablecer apariencia',
            icon: <Sparkles className="w-3.5 h-3.5" />,
            disabled: !contextVisualEditable || contextLayer.locked,
            onSelect: () =>
              studioEnginePanel.onResetLayerStyle?.(activeScene.id, contextLayer.id),
          },
          {
            id: 'ctx-layer-remove',
            label: 'Eliminar de la escena',
            icon: <Trash2 className="w-3.5 h-3.5" />,
            destructive: true,
            onSelect: () =>
              setConfirmRemoveLayer({ sceneId: activeScene.id, layer: contextLayer }),
          },
        ]
      : [];

  const renderAddSourcePopoverBody = () => {
    const filteredDevices = devices.filter(
      (d) => d.kind === (pickerKind === 'camera' ? 'videoinput' : 'audioinput')
    );

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-[var(--text-primary)]">
            Añadir fuente real a la escena
          </h3>
          <button
            type="button"
            onClick={() => setAddSourceOpen(false)}
            className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            Cerrar
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {SOURCE_KIND_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = pickerKind === opt.kind;
            return (
              <button
                key={opt.kind}
                type="button"
                onClick={() => setPickerKind(opt.kind)}
                className={`glass-focus-ring flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] text-left transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--control-active-bg)] text-[var(--control-active-text)] font-medium'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--studio-surface-subtle)]'
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" />
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>

        <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2.5">
          {(pickerKind === 'camera' || pickerKind === 'microphone') && (
            <>
              <div className="text-[11px] text-[var(--text-tertiary)]">
                {devicesLoading
                  ? 'Consultando dispositivos reales del sistema...'
                  : filteredDevices.length > 0
                    ? `Dispositivos reales detectados (${filteredDevices.length})`
                    : pickerKind === 'camera'
                      ? 'No se detectaron cámaras reales conectadas o falta permiso.'
                      : 'No se detectaron micrófonos reales conectados o falta permiso.'}
              </div>
              {filteredDevices.length > 0 && (
                <select
                  aria-label={
                    pickerKind === 'camera'
                      ? 'Seleccionar cámara real'
                      : 'Seleccionar micrófono real'
                  }
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="liquid-input w-full rounded-xl px-2.5 py-1.5 text-xs"
                >
                  {filteredDevices.map((dev, idx) => (
                    <option key={dev.deviceId || idx} value={dev.deviceId}>
                      {dev.label ||
                        `${pickerKind === 'camera' ? 'Cámara' : 'Micrófono'} ${idx + 1}`}
                    </option>
                  ))}
                </select>
              )}
              <GlassButton
                size="xs"
                variant="primary"
                className="w-full"
                disabled={addingBusy}
                onClick={() => {
                  const chosen = filteredDevices.find(
                    (d) => d.deviceId === selectedDeviceId
                  );
                  if (pickerKind === 'camera') {
                    void executeAddRealSource({
                      kind: 'camera',
                      deviceId: selectedDeviceId || undefined,
                      deviceLabelHint: chosen?.label,
                      name: chosen?.label || undefined,
                    });
                  } else {
                    void executeAddRealSource({
                      kind: 'microphone',
                      deviceId: selectedDeviceId || undefined,
                      deviceLabelHint: chosen?.label,
                      name: chosen?.label || undefined,
                    });
                  }
                }}
              >
                {pickerKind === 'camera' ? 'Conectar cámara' : 'Conectar micrófono'}
              </GlassButton>
            </>
          )}

          {(pickerKind === 'window' || pickerKind === 'screen') && (
            <>
              <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                {pickerKind === 'window'
                  ? 'Abre el selector nativo para capturar una ventana de aplicación real.'
                  : 'Abre el selector nativo para capturar una pantalla o escritorio real.'}
              </p>
              <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeDisplayAudio}
                  onChange={(e) => setIncludeDisplayAudio(e.target.checked)}
                />
                <span>Incluir audio del sistema si macOS lo ofrece</span>
              </label>
              <GlassButton
                size="xs"
                variant="primary"
                className="w-full"
                disabled={addingBusy}
                onClick={() =>
                  void executeAddRealSource({
                    kind: pickerKind,
                    includeSystemAudio: includeDisplayAudio,
                    placement: 'behind-camera',
                  })
                }
              >
                {pickerKind === 'window' ? 'Elegir ventana' : 'Elegir pantalla'}
              </GlassButton>
            </>
          )}

          {(pickerKind === 'image' ||
            pickerKind === 'video-file' ||
            pickerKind === 'audio-file') && (
            <>
              <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                Selecciona un archivo real desde tu equipo. Se guardará localmente en el almacenamiento del estudio.
              </p>
              <GlassButton
                size="xs"
                variant="primary"
                className="w-full"
                leadingIcon={<Upload className="w-3.5 h-3.5" />}
                disabled={addingBusy}
                onClick={() => {
                  if (pickerKind === 'image') imageFileInputRef.current?.click();
                  else if (pickerKind === 'video-file')
                    videoFileInputRef.current?.click();
                  else audioFileInputRef.current?.click();
                }}
              >
                {pickerKind === 'image'
                  ? 'Seleccionar imagen...'
                  : pickerKind === 'video-file'
                    ? 'Seleccionar vídeo...'
                    : 'Seleccionar audio...'}
              </GlassButton>
            </>
          )}

          {pickerKind === 'text' && (
            <>
              <input
                type="text"
                aria-label="Texto de la capa"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                placeholder="Texto principal..."
                className="liquid-input w-full rounded-xl px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                aria-label="Subtítulo opcional"
                value={textSubtitle}
                onChange={(e) => setTextSubtitle(e.target.value)}
                placeholder="Subtítulo opcional..."
                className="liquid-input w-full rounded-xl px-2.5 py-1.5 text-xs"
              />
              <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={textGlassBackdrop}
                  onChange={(e) => setTextGlassBackdrop(e.target.checked)}
                />
                <span>Fondo translúcido tipo placa</span>
              </label>
              <GlassButton
                size="xs"
                variant="primary"
                className="w-full"
                disabled={addingBusy || textValue.trim().length === 0}
                onClick={() =>
                  void executeAddRealSource({
                    kind: 'text',
                    text: textValue.trim(),
                    subtitle: textSubtitle.trim() || undefined,
                    glassBackdrop: textGlassBackdrop,
                  })
                }
              >
                Añadir texto a la escena
              </GlassButton>
            </>
          )}

          {pickerKind === 'color' && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[var(--text-secondary)]">
                  Color sólido
                </span>
                <input
                  type="color"
                  aria-label="Selector de color sólido"
                  value={solidColor}
                  onChange={(e) => setSolidColor(e.target.value)}
                  className="w-8 h-6 rounded cursor-pointer bg-transparent"
                />
              </div>
              <GlassButton
                size="xs"
                variant="primary"
                className="w-full"
                disabled={addingBusy}
                onClick={() =>
                  void executeAddRealSource({
                    kind: 'color',
                    color: solidColor,
                  })
                }
              >
                Añadir fondo sólido
              </GlassButton>
            </>
          )}

          {pickerKind === 'gradient' && (
            <>
              <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
                <label className="flex items-center gap-1.5">
                  <span>Inicio</span>
                  <input
                    type="color"
                    aria-label="Color inicial del degradado"
                    value={gradStart}
                    onChange={(e) => setGradStart(e.target.value)}
                    className="w-7 h-5 rounded cursor-pointer bg-transparent"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <span>Fin</span>
                  <input
                    type="color"
                    aria-label="Color final del degradado"
                    value={gradEnd}
                    onChange={(e) => setGradEnd(e.target.value)}
                    className="w-7 h-5 rounded cursor-pointer bg-transparent"
                  />
                </label>
                <label className="flex items-center gap-1">
                  <span>°</span>
                  <input
                    type="number"
                    aria-label="Ángulo del degradado"
                    min={0}
                    max={360}
                    value={gradAngle}
                    onChange={(e) => setGradAngle(Number(e.target.value) || 0)}
                    className="liquid-input w-14 rounded-lg px-1.5 py-0.5 text-[11px] font-mono tabular-nums"
                  />
                </label>
              </div>
              <GlassButton
                size="xs"
                variant="primary"
                className="w-full"
                disabled={addingBusy}
                onClick={() =>
                  void executeAddRealSource({
                    kind: 'gradient',
                    startColor: gradStart,
                    endColor: gradEnd,
                    angleDeg: gradAngle,
                  })
                }
              >
                Añadir fondo degradado
              </GlassButton>
            </>
          )}

          {pickerKind === 'system-audio' && (
            <>
              <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                En macOS, el audio del sistema depende de compartir una pantalla o ventana con audio habilitado. Si no hay audio loopback activo, se informará el motivo real.
              </p>
              <GlassButton
                size="xs"
                variant="primary"
                className="w-full"
                disabled={addingBusy}
                onClick={() => void executeAddRealSource({ kind: 'system-audio' })}
              >
                Vincular audio del sistema
              </GlassButton>
            </>
          )}
        </div>
      </div>
    );
  };

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
      {/* Inputs ocultos reales para archivos locales */}
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) {
            void executeAddRealSource({ kind: 'image', file, name: file.name });
          }
        }}
      />
      <input
        ref={videoFileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) {
            void executeAddRealSource({ kind: 'video-file', file, name: file.name });
          }
        }}
      />
      <input
        ref={audioFileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) {
            void executeAddRealSource({ kind: 'audio-file', file, name: file.name });
          }
        }}
      />

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
              preferences.pinned
                ? 'Desfijar panel lateral'
                : 'Fijar panel durante preparación'
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

      {/* Aviso honesto / reversible de operaciones */}
      {panelNotice && (
        <div
          role="status"
          className={`mx-3 mt-2.5 px-2.5 py-2 rounded-xl border text-[11px] flex items-center justify-between gap-2 shrink-0 ${
            panelNotice.tone === 'error'
              ? 'border-rose-500/35 bg-rose-500/10 text-rose-200'
              : 'border-[var(--border-hairline)] bg-[var(--studio-surface-subtle)] text-[var(--text-secondary)]'
          }`}
        >
          <span className="min-w-0 leading-snug">{panelNotice.message}</span>
          <div className="flex items-center gap-2 shrink-0">
            {panelNotice.allowUndo && studioEnginePanel?.historyStatus?.canUndo && (
              <button
                type="button"
                onClick={() => {
                  void studioEnginePanel.onUndo?.();
                  setPanelNotice(null);
                }}
                className="text-[var(--accent-blue)] hover:underline font-medium cursor-pointer"
              >
                Deshacer
              </button>
            )}
            <button
              type="button"
              onClick={() => setPanelNotice(null)}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

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
                  Las escenas múltiples con transiciones Cut/Fade operan mediante Studio Engine. Legacy mantiene tu ruta estable actual.
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
                <div className="relative flex items-center justify-between gap-2 px-1">
                  <span className="text-[11px] font-medium text-[var(--text-tertiary)]">
                    Fuentes del proyecto ({studioEnginePanel.sources.length})
                  </span>
                  <GlassButton
                    ref={addSourceBtnRef}
                    size="xs"
                    variant="primary"
                    leadingIcon={<Plus className="w-3 h-3" />}
                    onClick={() => setAddSourceOpen((v) => !v)}
                  >
                    Añadir
                  </GlassButton>
                  <GlassPopover
                    open={addSourceOpen}
                    onClose={() => setAddSourceOpen(false)}
                    anchorRef={addSourceBtnRef}
                    align="right"
                    widthClass="w-72"
                    ariaLabel="Añadir fuente al estudio"
                  >
                    {renderAddSourcePopoverBody()}
                  </GlassPopover>
                </div>

                <div className="divide-y divide-[var(--border-hairline)]">
                  {studioEnginePanel.sources.map((src) => {
                    const projSource = sourceById.get(src.id);
                    const usageCount = sourceUsageCountById.get(src.id) ?? 0;
                    const statusInfo = getSourceStatusLabel(projSource, src.status);
                    const Icon = getSourceIcon(src.kind);
                    const resInfo = sourceResolutionById.get(src.id);
                    const isDisplayKind = src.kind === 'window' || src.kind === 'screen';
                    const isReconnectable =
                      src.kind === 'camera' ||
                      src.kind === 'window' ||
                      src.kind === 'screen' ||
                      src.kind === 'microphone';
                    const isEditingSource = editingSourceId === src.id;
                    const isVisualProjSource = isVisualSourceEditable(projSource);

                    return (
                      <div key={src.id} className="px-1 py-2.5 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <Icon className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" />
                            {isEditingSource ? (
                              <input
                                type="text"
                                autoFocus
                                aria-label={`Renombrar fuente ${src.name}`}
                                value={editingSourceName}
                                onChange={(e) => setEditingSourceName(e.target.value)}
                                onBlur={commitInlineSourceRename}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitInlineSourceRename();
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setEditingSourceId(null);
                                  }
                                }}
                                className="liquid-input flex-1 min-w-0 rounded-md px-1.5 py-0.5 text-xs"
                              />
                            ) : (
                              <button
                                type="button"
                                title="Doble clic para renombrar fuente"
                                onDoubleClick={() => beginInlineSourceRename(src.id, src.name)}
                                className="text-xs font-medium text-[var(--text-primary)] truncate text-left hover:text-[var(--accent-blue)] cursor-pointer"
                              >
                                {src.name}
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {studioEnginePanel.onRenameProjectSource && !isEditingSource && (
                              <button
                                type="button"
                                title={`Renombrar fuente ${src.name}`}
                                aria-label={`Renombrar fuente ${src.name}`}
                                onClick={() => beginInlineSourceRename(src.id, src.name)}
                                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer p-0.5"
                              >
                                <Edit3 className="w-2.5 h-2.5" />
                              </button>
                            )}
                            <span className={`text-[10px] font-medium shrink-0 ${statusInfo.toneClass}`}>
                              {statusInfo.label}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--text-tertiary)]">
                          <span className="truncate">
                            {getSourceKindLabel(src.kind)}
                            {src.status === 'live' && resInfo
                              ? ` · ${resInfo.width}×${resInfo.height}`
                              : ''}{' '}
                            ·{' '}
                            {usageCount > 0
                              ? `En ${usageCount} ${usageCount === 1 ? 'capa' : 'capas'}`
                              : 'Sin uso'}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {activeScene &&
                              isVisualProjSource &&
                              studioEnginePanel.onAddExistingSourceToScene && (
                                <button
                                  type="button"
                                  title="Añadir esta fuente como capa detrás de la cámara en la escena actual"
                                  onClick={async () => {
                                    const res = await studioEnginePanel.onAddExistingSourceToScene!(
                                      activeScene.id,
                                      src.id,
                                      { placement: 'behind-camera' }
                                    );
                                    if (res.ok && res.layer) {
                                      studioEnginePanel.onSelectLayer(res.layer.id);
                                      setPanelNotice({
                                        message: `Capa añadida detrás de cámara: ${res.layer.name}`,
                                        tone: 'info',
                                        allowUndo: true,
                                      });
                                    } else if (!res.ok && res.reason) {
                                      setPanelNotice({ message: res.reason, tone: 'error' });
                                    }
                                  }}
                                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline cursor-pointer"
                                >
                                  + Detrás
                                </button>
                              )}
                            {onReconnectSource && isReconnectable && (isDisplayKind || src.status !== 'live') && (
                              <button
                                type="button"
                                onClick={() => onReconnectSource(src.id)}
                                className="text-[var(--accent-blue)] hover:underline cursor-pointer inline-flex items-center gap-1"
                              >
                                <RefreshCw className="w-2.5 h-2.5" />
                                {isDisplayKind && src.status === 'live'
                                  ? 'Cambiar captura'
                                  : 'Reconectar'}
                              </button>
                            )}
                            {usageCount === 0 && studioEnginePanel.onRemoveSourceSafely && (
                              <button
                                type="button"
                                title="Eliminar fuente no utilizada del proyecto"
                                aria-label={`Eliminar fuente ${src.name}`}
                                onClick={async () => {
                                  const res =
                                    await studioEnginePanel.onRemoveSourceSafely!(
                                      src.id
                                    );
                                  if (!res.ok && res.reason) {
                                    setPanelNotice({
                                      message: res.reason,
                                      tone: 'error',
                                    });
                                  } else if (res.ok) {
                                    setPanelNotice({
                                      message: `Fuente "${src.name}" eliminada del proyecto.`,
                                      tone: 'info',
                                    });
                                  }
                                }}
                                className="text-rose-400 hover:text-rose-300 cursor-pointer inline-flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <GlassButton
                  variant={studioEnginePanel.hasLiveDisplaySource ? 'regular' : 'primary'}
                  size="sm"
                  className="w-full"
                  leadingIcon={<Monitor className="w-3.5 h-3.5" />}
                  onClick={() => {
                    if (studioEnginePanel.onAddDisplaySource) {
                      void studioEnginePanel.onAddDisplaySource('screen');
                    } else {
                      studioEnginePanel.onAuthorizeDisplaySource();
                    }
                  }}
                >
                  Compartir nueva pantalla o ventana
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
          <div className="space-y-3">
            {isStudioMode && activeScene && studioEnginePanel ? (
              <>
                {/* Cabecera de Capas: escena, deshacer/rehacer y añadir fuente */}
                <div className="relative flex items-center justify-between gap-1.5 px-0.5">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {activeScene.name}
                    </div>
                    <div className="text-[10px] text-[var(--text-tertiary)] font-mono tabular-nums">
                      {layersDescending.filter((l) => l.visible).length}/
                      {layersDescending.length} visibles
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <GlassTooltip
                      content={
                        studioEnginePanel.historyStatus?.undoLabel
                          ? `Deshacer (${studioEnginePanel.historyStatus.undoLabel})`
                          : 'Deshacer'
                      }
                      shortcut="⌘Z"
                    >
                      <GlassIconButton
                        size="sm"
                        label="Deshacer cambio de composición"
                        disabled={!studioEnginePanel.historyStatus?.canUndo}
                        onClick={() => void studioEnginePanel.onUndo?.()}
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                      </GlassIconButton>
                    </GlassTooltip>

                    <GlassTooltip
                      content={
                        studioEnginePanel.historyStatus?.redoLabel
                          ? `Rehacer (${studioEnginePanel.historyStatus.redoLabel})`
                          : 'Rehacer'
                      }
                      shortcut="⇧⌘Z"
                    >
                      <GlassIconButton
                        size="sm"
                        label="Rehacer cambio de composición"
                        disabled={!studioEnginePanel.historyStatus?.canRedo}
                        onClick={() => void studioEnginePanel.onRedo?.()}
                      >
                        <Redo2 className="w-3.5 h-3.5" />
                      </GlassIconButton>
                    </GlassTooltip>

                    <GlassButton
                      ref={addSourceBtnRef}
                      size="xs"
                      variant="primary"
                      leadingIcon={<Plus className="w-3 h-3" />}
                      onClick={() => setAddSourceOpen((v) => !v)}
                    >
                      Añadir
                    </GlassButton>
                  </div>

                  <GlassPopover
                    open={addSourceOpen}
                    onClose={() => setAddSourceOpen(false)}
                    anchorRef={addSourceBtnRef}
                    align="right"
                    widthClass="w-72"
                    ariaLabel="Añadir fuente a la escena"
                  >
                    {renderAddSourcePopoverBody()}
                  </GlassPopover>
                </div>

                {/* Composición multicapa rápida */}
                {studioEnginePanel.onApplyAdaptableLayout &&
                  visualLayersInScene.length > 0 && (
                    <div className="pt-2 border-t border-[var(--border-hairline)] space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-[var(--text-tertiary)]">
                          Composición
                        </span>
                        {visualLayersInScene.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setShowParticipationPicker((v) => !v)}
                            className="text-[10px] text-[var(--accent-blue)] hover:underline cursor-pointer"
                          >
                            {showParticipationPicker ? 'Ocultar selección' : 'Capas incluidas'}
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <select
                          aria-label="Seleccionar composición multicapa"
                          value={selectedLayoutId}
                          onChange={(e) =>
                            setSelectedLayoutId(e.target.value as AdaptableSceneLayoutId)
                          }
                          className="liquid-input flex-1 min-w-0 rounded-xl px-2 py-1 text-[11px]"
                        >
                          {ADAPTABLE_COMPOSITIONS.map((comp) => (
                            <option key={comp.id} value={comp.id}>
                              {comp.label}
                            </option>
                          ))}
                        </select>
                        <GlassButton
                          size="xs"
                          variant="regular"
                          onClick={() =>
                            studioEnginePanel.onApplyAdaptableLayout?.(
                              activeScene.id,
                              selectedLayoutId,
                              participatingIds && participatingIds.length > 0
                                ? { participatingLayerIds: participatingIds }
                                : undefined
                            )
                          }
                        >
                          Aplicar
                        </GlassButton>
                      </div>

                      {showParticipationPicker && visualLayersInScene.length > 1 && (
                        <div className="pt-1 space-y-1">
                          {visualLayersInScene.map((l) => {
                            const activeIds =
                              participatingIds ??
                              visualLayersInScene
                                .filter((v) => v.visible && !v.locked)
                                .map((v) => v.id);
                            const checked = activeIds.includes(l.id);
                            return (
                              <label
                                key={`part-${l.id}`}
                                className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] cursor-pointer select-none px-1"
                              >
                                <input
                                  type="checkbox"
                                  disabled={l.locked}
                                  checked={checked}
                                  onChange={(e) => {
                                    const base = new Set(activeIds);
                                    if (e.target.checked) base.add(l.id);
                                    else base.delete(l.id);
                                    setParticipatingIds(Array.from(base));
                                  }}
                                />
                                <span className="truncate">{l.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                <div className="space-y-1 px-0.5">
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                    <span>Primer plano ↑</span><span>↓ Fondo</span>
                  </div>
                  {studioEnginePanel.selectedLayerId && layersDescending.some(l => l.id === studioEnginePanel.selectedLayerId) && (
                    <div className="space-y-1">
                      <div className="grid grid-cols-2 gap-1">
                        {([{dir:'top',label:'Al frente',Icon:ChevronsUp},{dir:'up',label:'Subir',Icon:ArrowUp},
                           {dir:'bottom',label:'Al fondo',Icon:ChevronsDown},{dir:'down',label:'Bajar',Icon:ArrowDown}] as const).map(({dir,label,Icon}) => {
                          const index = layersDescending.findIndex(l => l.id === studioEnginePanel.selectedLayerId);
                          return <GlassButton key={dir} size="xs" leadingIcon={<Icon className="w-3 h-3"/>}
                            disabled={dir==='top'||dir==='up' ? index<=0 : index>=layersDescending.length-1}
                            onClick={() => studioEnginePanel.onMoveLayerOrder?.(activeScene.id, studioEnginePanel.selectedLayerId!,dir)}>{label}</GlassButton>;
                        })}
                      </div>
                      {studioEnginePanel.onPlaceLayerBehindCamera && (
                        <GlassButton
                          size="xs"
                          className="w-full"
                          onClick={() =>
                            studioEnginePanel.onPlaceLayerBehindCamera?.(
                              activeScene.id,
                              studioEnginePanel.selectedLayerId!
                            )
                          }
                        >
                          Detrás de cámara
                        </GlassButton>
                      )}
                    </div>
                  )}
                </div>
                {/* Lista jerárquica de capas (arriba = primer plano) */}
                <div
                  role="list"
                  aria-label="Capas de la escena actual"
                  className="divide-y divide-[var(--border-hairline)] border-t border-[var(--border-hairline)]"
                >
                  {layersDescending.map((layer) => {
                    const src = sourceById.get(layer.sourceId);
                    const runtimeSrc = runtimeById.get(layer.sourceId);
                    const isVisualEditable = isVisualSourceEditable(src);
                    const isSelected = studioEnginePanel.selectedLayerId === layer.id;
                    const Icon = getSourceIcon(src?.kind);
                    const statusInfo = getSourceStatusLabel(src, runtimeSrc?.status);
                    const isEditingName = editingLayerId === layer.id;
                    const isDropAbove =
                      dropTarget?.layerId === layer.id && dropTarget.position === 'above';
                    const isDropBelow =
                      dropTarget?.layerId === layer.id && dropTarget.position === 'below';

                    return (
                      <div
                        key={layer.id}
                        role="listitem"
                        tabIndex={0}
                        draggable={!isEditingName}
                        onDragStart={(e) => {
                          setDraggedLayerId(layer.id);
                          e.dataTransfer.effectAllowed = 'move';
                          try {
                            e.dataTransfer.setData('text/plain', layer.id);
                          } catch {
                            // Ignore in headless environments
                          }
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (!draggedLayerId || draggedLayerId === layer.id) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const position =
                            e.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
                          setDropTarget({ layerId: layer.id, position });
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleDropOnLayer(layer.id);
                        }}
                        onDragEnd={() => {
                          setDraggedLayerId(null);
                          setDropTarget(null);
                        }}
                        onKeyDown={(e) => {
                          if (isEditingName) return;
                          if (e.altKey && e.key === 'ArrowUp') {
                            e.preventDefault();
                            studioEnginePanel.onMoveLayerOrder?.(
                              activeScene.id,
                              layer.id,
                              'up'
                            );
                          } else if (e.altKey && e.key === 'ArrowDown') {
                            e.preventDefault();
                            studioEnginePanel.onMoveLayerOrder?.(
                              activeScene.id,
                              layer.id,
                              'down'
                            );
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setLayerContextMenu({
                            open: true,
                            x: e.clientX,
                            y: e.clientY,
                            layerId: layer.id,
                          });
                        }}
                        className={`group relative px-1.5 py-2 space-y-0.5 rounded-xl transition-colors outline-none ${
                          isSelected
                            ? 'bg-[var(--control-active-bg)]'
                            : 'hover:bg-[var(--studio-surface-subtle)]'
                        } ${!layer.visible ? 'opacity-60' : ''} ${
                          draggedLayerId === layer.id ? 'opacity-45' : ''
                        } ${isDropAbove ? 'border-t-2 border-t-[var(--accent-blue)]' : ''} ${
                          isDropBelow ? 'border-b-2 border-b-[var(--accent-blue)]' : ''
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            title="Arrastrar para reordenar (o ⌥↑ / ⌥↓)"
                            className="text-[var(--text-tertiary)] cursor-grab active:cursor-grabbing shrink-0"
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                          </span>

                          <Icon className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />

                          {isEditingName ? (
                            <input
                              type="text"
                              autoFocus
                              aria-label={`Renombrar capa ${layer.name}`}
                              value={editingLayerName}
                              onChange={(e) => setEditingLayerName(e.target.value)}
                              onBlur={commitInlineRename}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  commitInlineRename();
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  setEditingLayerId(null);
                                }
                              }}
                              className="liquid-input flex-1 min-w-0 rounded-md px-1.5 py-0.5 text-xs"
                            />
                          ) : isVisualEditable ? (
                            <button
                              type="button"
                              onClick={() =>
                                studioEnginePanel.onSelectLayer(
                                  isSelected ? null : layer.id
                                )
                              }
                              onDoubleClick={() => beginInlineRename(layer)}
                              className="glass-focus-ring flex-1 min-w-0 text-left text-xs font-medium text-[var(--text-primary)] truncate cursor-pointer hover:text-[var(--accent-blue)]"
                            >
                              {layer.name}
                            </button>
                          ) : (
                            <span
                              onDoubleClick={() => beginInlineRename(layer)}
                              className="flex-1 min-w-0 text-xs font-medium text-[var(--text-primary)] truncate"
                            >
                              {layer.name}
                            </span>
                          )}

                          {/* Controles rápidos de fila (sin botones anidados) */}
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              title={layer.visible ? 'Ocultar capa' : 'Mostrar capa'}
                              aria-label={
                                layer.visible
                                  ? `Ocultar ${layer.name}`
                                  : `Mostrar ${layer.name}`
                              }
                              onClick={() => void handleToggleLayerVisibility(layer)}
                              className={`p-1 rounded-md transition-colors cursor-pointer ${
                                layer.visible
                                  ? 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--studio-surface-subtle)]'
                                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--studio-surface-subtle)]'
                              }`}
                            >
                              {layer.visible ? (
                                <Eye className="w-3 h-3" />
                              ) : (
                                <EyeOff className="w-3 h-3" />
                              )}
                            </button>

                            <button
                              type="button"
                              title={layer.locked ? 'Desbloquear capa' : 'Bloquear capa'}
                              aria-label={
                                layer.locked
                                  ? `Desbloquear ${layer.name}`
                                  : `Bloquear ${layer.name}`
                              }
                              onClick={() =>
                                studioEnginePanel.onToggleLayerLock(
                                  activeScene.id,
                                  layer.id,
                                  !layer.locked
                                )
                              }
                              className={`p-1 rounded-md transition-colors cursor-pointer ${
                                layer.locked
                                  ? 'text-[var(--accent-amber)] hover:bg-[var(--studio-surface-subtle)]'
                                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--studio-surface-subtle)]'
                              }`}
                            >
                              {layer.locked ? (
                                <Lock className="w-3 h-3" />
                              ) : (
                                <Unlock className="w-3 h-3" />
                              )}
                            </button>

                            <button
                              type="button"
                              title="Opciones de capa"
                              aria-label={`Opciones de ${layer.name}`}
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setLayerContextMenu({
                                  open: true,
                                  x: rect.right,
                                  y: rect.bottom + 4,
                                  layerId: layer.id,
                                });
                              }}
                              className="p-1 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--studio-surface-subtle)] transition-colors cursor-pointer"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pl-5 pr-1 text-[10px] text-[var(--text-tertiary)]">
                          <span className="truncate">
                            {getSourceKindLabel(src?.kind)}
                            {isVisualEditable
                              ? ` · ${Math.round(layer.transform.width * 100)}%×${Math.round(layer.transform.height * 100)}%`
                              : ' · Audio'}
                          </span>
                          <span className={`shrink-0 ${statusInfo.toneClass}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                        {layer.visible &&
                          (src?.kind === 'screen' || src?.kind === 'window') &&
                          !isTransparentCutoutActive &&
                          layersDescending.some((camL) => {
                            const camSrc = sourceById.get(camL.sourceId);
                            return (
                              camSrc?.kind === 'camera' &&
                              camL.visible &&
                              camL.zIndex > layer.zIndex &&
                              camL.transform.width >= 0.92 &&
                              camL.transform.height >= 0.92 &&
                              camL.style.opacity >= 0.98
                            );
                          }) && (
                            <div className="pl-5 pr-1 text-[10px] text-[var(--accent-amber)] leading-snug">
                              Detrás de cámara · activa Transparencia IA o PiP
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>

                <p className="px-1 text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                  Arrastra para reordenar o usa ⌥↑ / ⌥↓. Doble clic para renombrar. Clic derecho para más acciones.
                </p>
              </>
            ) : (
              <div className="px-1 py-1 space-y-2.5">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Capas multipista en Studio Engine
                </div>
                <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                  En modo Legacy se compone una salida fija directa. Cambia a Studio Engine desde Grabación o aquí para administrar capas y fuentes reales.
                </p>
                <GlassButton size="xs" variant="regular" onClick={onOpenRecordingLab}>
                  Abrir Laboratorio Studio
                </GlassButton>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Menú contextual de capa */}
      <GlassContextMenu
        open={layerContextMenu.open}
        x={layerContextMenu.x}
        y={layerContextMenu.y}
        items={layerMenuItems}
        onClose={() =>
          setLayerContextMenu((prev) => ({ ...prev, open: false, layerId: null }))
        }
      />

      {/* Diálogo seguro de confirmación de eliminación de capa */}
      <GlassDialog
        open={Boolean(confirmRemoveLayer)}
        onClose={() => setConfirmRemoveLayer(null)}
        title="Quitar capa de la escena"
        subtitle={activeScene?.name}
        maxWidthClass="max-w-sm"
      >
        <div className="p-5 space-y-4">
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            ¿Deseas quitar la capa{' '}
            <strong className="text-[var(--text-primary)]">
              {confirmRemoveLayer?.layer.name}
            </strong>{' '}
            de esta escena? La fuente subyacente se conservará disponible en el proyecto si se usa en otras escenas.
          </p>
          <div className="flex items-center justify-end gap-2">
            <GlassButton
              size="xs"
              variant="regular"
              onClick={() => setConfirmRemoveLayer(null)}
            >
              Cancelar
            </GlassButton>
            <GlassButton
              size="xs"
              variant="danger"
              onClick={handleConfirmRemoveLayer}
            >
              Quitar de la escena
            </GlassButton>
          </div>
        </div>
      </GlassDialog>

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
