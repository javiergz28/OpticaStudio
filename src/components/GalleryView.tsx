import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  Crop,
  Download,
  Film,
  Image as ImageIcon,
  Monitor,
  RotateCw,
  Scissors,
  Sliders,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import {
  DEFAULT_ADJUSTMENTS,
  FILTER_PRESETS,
  VISUAL_EFFECTS,
  type CapturedMediaItem,
  type FilterPresetId,
  type RotationDeg,
} from '../types/camera';
import { applyFullColorGrade } from '../utils/canvasProcessor';

interface GalleryViewProps {
  items: CapturedMediaItem[];
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
  onBackToStudio: () => void;
  onCaptureWindow: () => void;
  onImportImages: (files: FileList | File[]) => void;
  onUseAsBackground: (item: CapturedMediaItem) => void;
  onSaveEditedItem: (item: CapturedMediaItem, replaceId?: string) => Promise<void>;
}

type CropAspectPreset = 'free' | '16:9' | '4:3' | '1:1' | '9:16';

function pickSupportedVideoMime(): { mimeType: string; ext: 'mp4' | 'webm' } {
  const mp4Candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4;codecs=h264',
    'video/mp4',
  ];
  for (const m of mp4Candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
      return { mimeType: m, ext: 'mp4' };
    }
  }
  const webmCandidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (const m of webmCandidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
      return { mimeType: m, ext: 'webm' };
    }
  }
  return { mimeType: '', ext: 'webm' };
}

export const GalleryView: React.FC<GalleryViewProps> = ({
  items,
  onDeleteItem,
  onClearAll,
  onBackToStudio,
  onCaptureWindow,
  onImportImages,
  onUseAsBackground,
  onSaveEditedItem,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'photo' | 'screen' | 'booth' | 'video'>('all');
  const [selectedItem, setSelectedItem] = useState<CapturedMediaItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Lightbox Quick Editor state
  const [editorMode, setEditorMode] = useState<'view' | 'edit'>('view');

  // Image editor states
  const [editFilterId, setEditFilterId] = useState<FilterPresetId>('none');
  const [editBrightness, setEditBrightness] = useState(0);
  const [editContrast, setEditContrast] = useState(0);
  const [editSaturation, setEditSaturation] = useState(0);
  const [editRotation, setEditRotation] = useState<RotationDeg>(0);
  const [cropPreset, setCropPreset] = useState<CropAspectPreset>('free');
  const [cropScale, setCropScale] = useState(100); // 30 to 100%
  const [cropCenterX, setCropCenterX] = useState(50); // 0 to 100%
  const [cropCenterY, setCropCenterY] = useState(50); // 0 to 100%
  const [savingImageEdit, setSavingImageEdit] = useState(false);

  // Video editor states
  const lightboxVideoRef = useRef<HTMLVideoElement | null>(null);
  const editCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedEditImgRef = useRef<HTMLImageElement | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [trimmingProgress, setTrimmingProgress] = useState<number | null>(null);

  const openLightbox = (item: CapturedMediaItem) => {
    setSelectedItem(item);
    setEditorMode('view');
    setEditFilterId('none');
    setEditBrightness(0);
    setEditContrast(0);
    setEditSaturation(0);
    setEditRotation(0);
    setCropPreset('free');
    setCropScale(100);
    setCropCenterX(50);
    setCropCenterY(50);
    setVideoDuration(item.durationSec || 0);
    setVideoCurrentTime(0);
    setTrimStart(0);
    setTrimEnd(item.durationSec || 0);
    setTrimmingProgress(null);
  };

  const filteredItems = useMemo(() => {
    if (filterType === 'all') return items;
    return items.filter((i) => i.type === filterType);
  }, [items, filterType]);

  const getVideoExt = (item: CapturedMediaItem) =>
    item.mimeType.toLowerCase().includes('mp4') ? 'mp4' : 'webm';

  const handleDownload = async (item: CapturedMediaItem) => {
    const ext = item.type === 'video' ? getVideoExt(item) : 'png';
    const stamp = new Date(item.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const defaultName = `optica-${item.type}-${stamp}.${ext}`;

    if (window.opticaDesktop?.saveMediaFile) {
      try {
        const bytes = new Uint8Array(await item.blob.arrayBuffer());
        await window.opticaDesktop.saveMediaFile({
          defaultName,
          extension: ext,
          bytes,
        });
        return;
      } catch {
        // Fallback to standard blob download if native dialog fails
      }
    }

    const a = document.createElement('a');
    a.href = item.url;
    a.download = defaultName;
    a.click();
  };

  const handleCopyImage = async (item: CapturedMediaItem) => {
    if (item.type === 'video' || !navigator.clipboard?.write) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ [item.blob.type]: item.blob })]);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Fallback ignored if browser blocks clipboard image write
    }
  };

  const getFilterName = (id: string) =>
    FILTER_PRESETS.find((f) => f.id === id)?.name || 'Original';
  const getEffectName = (id: string) =>
    VISUAL_EFFECTS.find((e) => e.id === id)?.name || 'Sin efecto';

  // Compute exact crop rectangle inside rotated source dimensions
  const computeCropRect = (srcW: number, srcH: number) => {
    const scale = cropScale / 100;
    let cw = srcW * scale;
    let ch = srcH * scale;

    if (cropPreset !== 'free') {
      const targetRatio =
        cropPreset === '16:9'
          ? 16 / 9
          : cropPreset === '4:3'
            ? 4 / 3
            : cropPreset === '1:1'
              ? 1
              : 9 / 16;
      const maxFitW = Math.min(srcW, srcH * targetRatio) * scale;
      cw = maxFitW;
      ch = maxFitW / targetRatio;
    }

    cw = Math.max(32, Math.round(cw));
    ch = Math.max(32, Math.round(ch));
    const maxX = Math.max(0, srcW - cw);
    const maxY = Math.max(0, srcH - ch);
    const sx = Math.round((cropCenterX / 100) * maxX);
    const sy = Math.round((cropCenterY / 100) * maxY);
    return { sx, sy, sw: cw, sh: ch };
  };

  // Load image and render live interactive crop + filter preview in Image Editor
  useEffect(() => {
    if (!selectedItem || selectedItem.type === 'video' || editorMode !== 'edit') return;

    let cancelled = false;
    const drawPreview = (img: HTMLImageElement) => {
      if (cancelled) return;
      const canvas = editCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const swap = editRotation === 90 || editRotation === 270;
      const rotW = swap ? img.naturalHeight : img.naturalWidth;
      const rotH = swap ? img.naturalWidth : img.naturalHeight;

      // Preview fitted to max 960px while preserving aspect ratio
      const previewScale = Math.min(1, 960 / Math.max(rotW, rotH));
      const pw = Math.max(1, Math.round(rotW * previewScale));
      const ph = Math.max(1, Math.round(rotH * previewScale));
      canvas.width = pw;
      canvas.height = ph;

      const temp = document.createElement('canvas');
      temp.width = pw;
      temp.height = ph;
      const tCtx = temp.getContext('2d');
      if (tCtx) {
        tCtx.translate(pw / 2, ph / 2);
        tCtx.rotate((editRotation * Math.PI) / 180);
        const drawW = img.naturalWidth * previewScale;
        const drawH = img.naturalHeight * previewScale;
        tCtx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

        applyFullColorGrade(
          temp,
          ctx,
          editFilterId,
          {
            ...DEFAULT_ADJUSTMENTS,
            brightness: editBrightness,
            contrast: editContrast,
            saturation: editSaturation,
          },
          pw,
          ph
        );
      }

      // Overlay crop region guide
      const { sx, sy, sw, sh } = computeCropRect(pw, ph);
      if (sw < pw - 2 || sh < ph - 2) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
        ctx.beginPath();
        ctx.rect(0, 0, pw, ph);
        ctx.rect(sx, sy, sw, sh);
        ctx.fill('evenodd');

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
        ctx.restore();
      }
    };

    const existing = loadedEditImgRef.current;
    if (existing && existing.src === selectedItem.url && existing.complete) {
      drawPreview(existing);
    } else {
      const img = new Image();
      img.onload = () => {
        loadedEditImgRef.current = img;
        drawPreview(img);
      };
      img.src = selectedItem.url;
    }

    return () => {
      cancelled = true;
    };
  }, [
    selectedItem,
    editorMode,
    editFilterId,
    editBrightness,
    editContrast,
    editSaturation,
    editRotation,
    cropPreset,
    cropScale,
    cropCenterX,
    cropCenterY,
  ]);

  const handleCommitImageEdit = async (replaceOriginal: boolean) => {
    if (!selectedItem || selectedItem.type === 'video' || savingImageEdit) return;
    setSavingImageEdit(true);
    try {
      const img =
        loadedEditImgRef.current && loadedEditImgRef.current.src === selectedItem.url
          ? loadedEditImgRef.current
          : await new Promise<HTMLImageElement>((resolve, reject) => {
              const i = new Image();
              i.onload = () => resolve(i);
              i.onerror = reject;
              i.src = selectedItem.url;
            });

      const swap = editRotation === 90 || editRotation === 270;
      const rotW = swap ? img.naturalHeight : img.naturalWidth;
      const rotH = swap ? img.naturalWidth : img.naturalHeight;

      const rotCanvas = document.createElement('canvas');
      rotCanvas.width = rotW;
      rotCanvas.height = rotH;
      const rCtx = rotCanvas.getContext('2d');
      if (!rCtx) return;

      const rawRot = document.createElement('canvas');
      rawRot.width = rotW;
      rawRot.height = rotH;
      const rrCtx = rawRot.getContext('2d');
      if (!rrCtx) return;
      rrCtx.translate(rotW / 2, rotH / 2);
      rrCtx.rotate((editRotation * Math.PI) / 180);
      rrCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      applyFullColorGrade(
        rawRot,
        rCtx,
        editFilterId,
        {
          ...DEFAULT_ADJUSTMENTS,
          brightness: editBrightness,
          contrast: editContrast,
          saturation: editSaturation,
        },
        rotW,
        rotH
      );

      const { sx, sy, sw, sh } = computeCropRect(rotW, rotH);
      const outCanvas = document.createElement('canvas');
      outCanvas.width = sw;
      outCanvas.height = sh;
      const oCtx = outCanvas.getContext('2d');
      if (!oCtx) return;
      oCtx.drawImage(rotCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

      const blob = await new Promise<Blob | null>((res) =>
        outCanvas.toBlob((b) => res(b), 'image/png')
      );
      if (!blob) return;

      const editedItem: CapturedMediaItem = {
        id: replaceOriginal ? selectedItem.id : `${Date.now()}-edit`,
        type: selectedItem.type,
        url: URL.createObjectURL(blob),
        blob,
        mimeType: 'image/png',
        createdAt: replaceOriginal ? selectedItem.createdAt : Date.now(),
        width: sw,
        height: sh,
        filterId: editFilterId !== 'none' ? editFilterId : selectedItem.filterId,
        effectId: selectedItem.effectId,
        label: replaceOriginal ? selectedItem.label : `${selectedItem.label} (Editada)`,
      };

      await onSaveEditedItem(editedItem, replaceOriginal ? selectedItem.id : undefined);
      setSelectedItem(editedItem);
      setEditorMode('view');
    } finally {
      setSavingImageEdit(false);
    }
  };

  const handleExtractVideoFrame = async () => {
    const vid = lightboxVideoRef.current;
    if (!selectedItem || !vid || vid.videoWidth === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = vid.videoWidth;
    canvas.height = vid.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), 'image/png')
    );
    if (!blob) return;

    const frameItem: CapturedMediaItem = {
      id: `${Date.now()}-frame`,
      type: 'photo',
      url: URL.createObjectURL(blob),
      blob,
      mimeType: 'image/png',
      createdAt: Date.now(),
      width: canvas.width,
      height: canvas.height,
      filterId: selectedItem.filterId,
      effectId: selectedItem.effectId,
      label: `Fotograma ${vid.currentTime.toFixed(1)}s`,
    };
    await onSaveEditedItem(frameItem);
  };

  const handleTrimVideo = async () => {
    if (!selectedItem || selectedItem.type !== 'video' || trimmingProgress !== null) return;
    const start = Math.max(0, trimStart);
    const end = Math.max(start + 0.3, trimEnd || videoDuration || 1);
    const clipLen = end - start;

    setTrimmingProgress(0);

    try {
      const hiddenVideo = document.createElement('video');
      hiddenVideo.src = selectedItem.url;
      hiddenVideo.muted = false;
      hiddenVideo.playsInline = true;

      await new Promise<void>((resolve, reject) => {
        hiddenVideo.onloadedmetadata = () => resolve();
        hiddenVideo.onerror = () => reject(new Error('Video load failed'));
      });

      hiddenVideo.currentTime = start;
      await new Promise<void>((resolve) => {
        hiddenVideo.onseeked = () => resolve();
      });

      const canvas = document.createElement('canvas');
      canvas.width = hiddenVideo.videoWidth || selectedItem.width || 1280;
      canvas.height = hiddenVideo.videoHeight || selectedItem.height || 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setTrimmingProgress(null);
        return;
      }

      const streamTracks: MediaStreamTrack[] = [...canvas.captureStream(30).getVideoTracks()];
      const capFn = (
        hiddenVideo as unknown as {
          captureStream?: () => MediaStream;
          mozCaptureStream?: () => MediaStream;
        }
      ).captureStream ||
        (
          hiddenVideo as unknown as {
            mozCaptureStream?: () => MediaStream;
          }
        ).mozCaptureStream;
      if (capFn) {
        try {
          const vStream = capFn.call(hiddenVideo);
          streamTracks.push(...vStream.getAudioTracks());
        } catch {
          // Audio capture optional
        }
      }

      const { mimeType } = pickSupportedVideoMime();
      const combined = new MediaStream(streamTracks);
      const recorder = mimeType
        ? new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 12_000_000 })
        : new MediaRecorder(combined, { videoBitsPerSecond: 12_000_000 });

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const donePromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
        };
      });

      recorder.start(200);
      await hiddenVideo.play();

      await new Promise<void>((resolve) => {
        let rafId = 0;
        const step = () => {
          ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
          const elapsed = Math.max(0, hiddenVideo.currentTime - start);
          setTrimmingProgress(Math.min(99, Math.round((elapsed / clipLen) * 100)));
          if (hiddenVideo.currentTime >= end || hiddenVideo.ended) {
            cancelAnimationFrame(rafId);
            hiddenVideo.pause();
            recorder.stop();
            resolve();
            return;
          }
          rafId = requestAnimationFrame(step);
        };
        rafId = requestAnimationFrame(step);
      });

      const blob = await donePromise;
      const trimmedItem: CapturedMediaItem = {
        id: `${Date.now()}-trim`,
        type: 'video',
        url: URL.createObjectURL(blob),
        blob,
        mimeType: blob.type || mimeType || 'video/webm',
        createdAt: Date.now(),
        width: canvas.width,
        height: canvas.height,
        durationSec: Math.max(1, Math.round(clipLen)),
        filterId: selectedItem.filterId,
        effectId: selectedItem.effectId,
        label: `Recorte (${Math.max(1, Math.round(clipLen))}s)`,
      };

      await onSaveEditedItem(trimmedItem);
      setSelectedItem(trimmedItem);
      setEditorMode('view');
    } catch {
      // Ignore error cleanly
    } finally {
      setTrimmingProgress(null);
    }
  };

  return (
    <section className="flex-1 overflow-y-auto studio-scroll p-5 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header & Liquid Glass Filter Bar */}
        <div className="liquid-glass-panel rounded-[24px] p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              Galería de Capturas
            </h1>
            <p className="text-xs text-zinc-300/80 mt-1">
              {items.length} elementos guardados localmente · Pega capturas de Mac con ⌘V
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onCaptureWindow}
              className="liquid-glass-blue inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap cursor-pointer"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Capturar ventana</span>
            </button>

            <label className="liquid-glass-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-zinc-100 text-xs font-medium whitespace-nowrap cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-amber-300" />
              <span>Importar imagen</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onImportImages(e.target.files);
                    e.target.value = '';
                  }
                }}
              />
            </label>

            <div className="liquid-segmented flex items-center gap-0.5">
              {(
                [
                  { id: 'all', label: 'Todo' },
                  { id: 'photo', label: 'Fotos' },
                  { id: 'screen', label: 'Ventanas' },
                  { id: 'booth', label: 'Cabina' },
                  { id: 'video', label: 'Videos' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterType(tab.id)}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap cursor-pointer ${
                    filterType === tab.id
                      ? 'liquid-segment-thumb text-white'
                      : 'text-zinc-300/75 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {items.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="liquid-glass-btn px-3.5 py-2 rounded-full text-xs font-medium text-zinc-300 hover:text-rose-300 whitespace-nowrap cursor-pointer"
              >
                Vaciar todo
              </button>
            )}
          </div>
        </div>

        {/* Empty State */}
        {filteredItems.length === 0 ? (
          <div className="liquid-glass-panel rounded-[26px] py-20 px-6 text-center space-y-4">
            <div className="liquid-glass-btn w-12 h-12 rounded-2xl flex items-center justify-center mx-auto text-zinc-200">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-white">
                Aún no hay capturas en esta vista
              </h2>
              <p className="text-xs text-zinc-300/75 max-w-md mx-auto">
                Vuelve al estudio para tomar fotografías, capturar otras ventanas o grabar clips en MP4/WebM con filtros aplicados en tiempo real.
              </p>
            </div>
            <button
              type="button"
              onClick={onBackToStudio}
              className="liquid-glass-blue px-5 py-2 rounded-full text-xs font-semibold cursor-pointer"
            >
              Volver al Estudio
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredItems.map((item) => (
              <article
                key={item.id}
                className="group liquid-glass-panel rounded-[22px] overflow-hidden flex flex-col"
              >
                <div
                  onClick={() => openLightbox(item)}
                  className="aspect-video bg-black/90 relative overflow-hidden cursor-pointer"
                >
                  {item.type === 'video' ? (
                    <>
                      <video
                        src={item.url}
                        className="w-full h-full object-contain bg-black"
                        muted
                        playsInline
                      />
                      <div className="liquid-glass-dock absolute bottom-2.5 left-2.5 px-2.5 py-0.5 rounded-full font-mono text-[11px] text-white flex items-center gap-1.5">
                        <Film className="w-3 h-3 text-rose-400" />
                        <span>
                          {item.durationSec ? `${item.durationSec}s` : 'VIDEO'} · {getVideoExt(item).toUpperCase()}
                        </span>
                      </div>
                    </>
                  ) : (
                    <img
                      src={item.url}
                      alt={item.label}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain bg-black group-hover:scale-[1.02] transition-transform duration-200"
                    />
                  )}
                </div>

                <div className="p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">
                      {item.label}
                    </div>
                    <div className="text-[11px] font-mono text-zinc-300/75 mt-0.5 truncate">
                      {item.width}×{item.height} · {getFilterName(item.filterId)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {item.type !== 'video' && (
                      <>
                        <button
                          type="button"
                          onClick={() => onUseAsBackground(item)}
                          title="Usar esta captura como fondo virtual IA"
                          className="liquid-glass-btn w-7 h-7 rounded-full flex items-center justify-center text-zinc-200 hover:text-emerald-300 cursor-pointer"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyImage(item)}
                          title="Copiar imagen al portapapeles"
                          className="liquid-glass-btn w-7 h-7 rounded-full flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer"
                        >
                          {copiedId === item.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-300" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDownload(item)}
                      title="Descargar archivo"
                      className="liquid-glass-btn w-7 h-7 rounded-full flex items-center justify-center text-zinc-200 hover:text-amber-300 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteItem(item.id)}
                      title="Eliminar"
                      className="liquid-glass-btn w-7 h-7 rounded-full flex items-center justify-center text-zinc-200 hover:text-rose-300 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* High-Res Liquid Glass Lightbox & Integrated Quick Editor Modal */}
      {selectedItem && (
        <div
          onClick={() => setSelectedItem(null)}
          className="fixed inset-0 bg-black/75 backdrop-blur-xl z-50 flex items-center justify-center p-4 lg:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="liquid-glass-panel max-w-5xl w-full rounded-[28px] overflow-hidden flex flex-col max-h-[92vh]"
          >
            <div className="px-5 py-3.5 border-b border-white/[0.12] flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white truncate">
                  {selectedItem.label}
                </h3>
                <p className="text-xs font-mono text-zinc-300/80 truncate">
                  {selectedItem.width}×{selectedItem.height} · {getFilterName(selectedItem.filterId)} ·{' '}
                  {getEffectName(selectedItem.effectId)}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="liquid-segmented flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setEditorMode('view')}
                    className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer ${
                      editorMode === 'view' ? 'liquid-segment-thumb text-white' : 'text-zinc-300'
                    }`}
                  >
                    Vista
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorMode('edit')}
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium cursor-pointer ${
                      editorMode === 'edit' ? 'liquid-segment-thumb text-white' : 'text-zinc-300'
                    }`}
                  >
                    {selectedItem.type === 'video' ? (
                      <Scissors className="w-3 h-3" />
                    ) : (
                      <Sliders className="w-3 h-3" />
                    )}
                    <span>Editar</span>
                  </button>
                </div>

                {selectedItem.type !== 'video' && (
                  <button
                    type="button"
                    onClick={() => {
                      onUseAsBackground(selectedItem);
                      setSelectedItem(null);
                    }}
                    className="liquid-glass-btn hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-zinc-100 text-xs font-medium cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Fondo IA</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleDownload(selectedItem)}
                  className="liquid-glass-blue inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Descargar</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="liquid-glass-btn w-8 h-8 rounded-full flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
              {/* Media Stage */}
              <div className="flex-1 bg-black/85 flex items-center justify-center p-4 min-h-0 overflow-hidden">
                {selectedItem.type === 'video' ? (
                  <video
                    ref={lightboxVideoRef}
                    src={selectedItem.url}
                    controls
                    autoPlay={editorMode === 'view'}
                    onLoadedMetadata={(e) => {
                      const d = e.currentTarget.duration || selectedItem.durationSec || 0;
                      setVideoDuration(d);
                      if (trimEnd === 0 || trimEnd > d) setTrimEnd(d);
                    }}
                    onTimeUpdate={(e) => setVideoCurrentTime(e.currentTarget.currentTime)}
                    className="max-h-full max-w-full rounded-2xl"
                  />
                ) : editorMode === 'edit' ? (
                  <canvas
                    ref={editCanvasRef}
                    className="max-h-full max-w-full object-contain rounded-2xl shadow-2xl"
                  />
                ) : (
                  <img
                    src={selectedItem.url}
                    alt={selectedItem.label}
                    referrerPolicy="no-referrer"
                    className="max-h-full max-w-full object-contain rounded-2xl"
                  />
                )}
              </div>

              {/* Editor Side Panel */}
              {editorMode === 'edit' && (
                <div className="w-full lg:w-[320px] border-t lg:border-t-0 lg:border-l border-white/[0.12] p-4 overflow-y-auto studio-scroll space-y-4 shrink-0">
                  {selectedItem.type === 'video' ? (
                    <>
                      <div className="space-y-2.5">
                        <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                          <Camera className="w-3.5 h-3.5 text-amber-300" />
                          <span>Extraer Fotograma HD</span>
                        </h4>
                        <p className="text-[11px] text-zinc-300/75">
                          Pausa el video en el instante exacto ({videoCurrentTime.toFixed(1)}s) y guárdalo como foto PNG.
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleExtractVideoFrame()}
                          className="liquid-glass-btn w-full py-2 px-3 rounded-full text-xs font-medium text-white cursor-pointer"
                        >
                          Guardar fotograma actual (PNG)
                        </button>
                      </div>

                      <div className="liquid-divider" />

                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                          <Scissors className="w-3.5 h-3.5 text-sky-300" />
                          <span>Recortar Tiempo del Clip</span>
                        </h4>

                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[11px] text-zinc-300">
                            <span>Inicio</span>
                            <span className="font-mono">{trimStart.toFixed(1)}s</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={Math.max(0.5, videoDuration - 0.3)}
                            step={0.1}
                            value={trimStart}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setTrimStart(val);
                              if (trimEnd <= val + 0.3) {
                                setTrimEnd(Math.min(videoDuration, val + 0.5));
                              }
                            }}
                            className="w-full studio-slider"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[11px] text-zinc-300">
                            <span>Fin</span>
                            <span className="font-mono">{trimEnd.toFixed(1)}s</span>
                          </div>
                          <input
                            type="range"
                            min={Math.min(videoDuration, trimStart + 0.3)}
                            max={Math.max(0.5, videoDuration)}
                            step={0.1}
                            value={trimEnd}
                            onChange={(e) => setTrimEnd(parseFloat(e.target.value))}
                            className="w-full studio-slider"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setTrimStart(Math.min(videoCurrentTime, Math.max(0, trimEnd - 0.3)))}
                            className="liquid-glass-btn py-1.5 px-2 rounded-full text-[11px] text-zinc-200 cursor-pointer"
                          >
                            Inicio aquí
                          </button>
                          <button
                            type="button"
                            onClick={() => setTrimEnd(Math.max(videoCurrentTime, trimStart + 0.3))}
                            className="liquid-glass-btn py-1.5 px-2 rounded-full text-[11px] text-zinc-200 cursor-pointer"
                          >
                            Fin aquí
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={trimmingProgress !== null || videoDuration <= 0}
                          onClick={() => void handleTrimVideo()}
                          className="liquid-glass-blue w-full py-2.5 px-4 rounded-full text-xs font-semibold disabled:opacity-50 cursor-pointer"
                        >
                          {trimmingProgress !== null
                            ? `Exportando recorte (${trimmingProgress}%)...`
                            : `Recortar y Guardar (${Math.max(0.1, trimEnd - trimStart).toFixed(1)}s)`}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Crop & Rotate */}
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                            <Crop className="w-3.5 h-3.5 text-sky-300" />
                            <span>Recorte y Rotación</span>
                          </h4>
                          <button
                            type="button"
                            onClick={() => setEditRotation((r) => ((r + 90) % 360) as RotationDeg)}
                            className="liquid-glass-btn inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] text-zinc-100 cursor-pointer"
                          >
                            <RotateCw className="w-3 h-3" />
                            <span>{editRotation}°</span>
                          </button>
                        </div>

                        <div className="liquid-segmented grid grid-cols-5 gap-0.5">
                          {(
                            [
                              { id: 'free', label: 'Libre' },
                              { id: '16:9', label: '16:9' },
                              { id: '4:3', label: '4:3' },
                              { id: '1:1', label: '1:1' },
                              { id: '9:16', label: '9:16' },
                            ] as { id: CropAspectPreset; label: string }[]
                          ).map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setCropPreset(p.id)}
                              className={`py-1 rounded-full text-[10px] font-mono cursor-pointer ${
                                cropPreset === p.id
                                  ? 'liquid-segment-thumb text-white'
                                  : 'text-zinc-300/75'
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-zinc-300">
                            <span>Tamaño de recorte</span>
                            <span className="font-mono">{cropScale}%</span>
                          </div>
                          <input
                            type="range"
                            min={30}
                            max={100}
                            value={cropScale}
                            onChange={(e) => setCropScale(parseInt(e.target.value, 10))}
                            className="w-full studio-slider"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <span className="text-[11px] text-zinc-300">Posición X</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={cropCenterX}
                              onChange={(e) => setCropCenterX(parseInt(e.target.value, 10))}
                              className="w-full studio-slider"
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-[11px] text-zinc-300">Posición Y</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={cropCenterY}
                              onChange={(e) => setCropCenterY(parseInt(e.target.value, 10))}
                              className="w-full studio-slider"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="liquid-divider" />

                      {/* Post-capture Filter & Tone */}
                      <div className="space-y-2.5">
                        <h4 className="text-xs font-semibold text-white">Filtro y Ajustes</h4>
                        <div className="grid grid-cols-3 gap-1.5">
                          {FILTER_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => setEditFilterId(preset.id)}
                              className={`p-1.5 rounded-xl text-left cursor-pointer ${
                                editFilterId === preset.id
                                  ? 'liquid-glass-btn-active'
                                  : 'liquid-glass-btn'
                              }`}
                            >
                              <div
                                className={`h-4 rounded-md bg-gradient-to-br ${preset.swatchGradient} mb-1`}
                              />
                              <div className="text-[10px] text-white truncate">{preset.name}</div>
                            </button>
                          ))}
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-zinc-300">
                            <span>Brillo</span>
                            <span className="font-mono">{editBrightness}</span>
                          </div>
                          <input
                            type="range"
                            min={-40}
                            max={40}
                            value={editBrightness}
                            onChange={(e) => setEditBrightness(parseInt(e.target.value, 10))}
                            className="w-full studio-slider"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-zinc-300">
                            <span>Contraste</span>
                            <span className="font-mono">{editContrast}</span>
                          </div>
                          <input
                            type="range"
                            min={-40}
                            max={40}
                            value={editContrast}
                            onChange={(e) => setEditContrast(parseInt(e.target.value, 10))}
                            className="w-full studio-slider"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-zinc-300">
                            <span>Saturación</span>
                            <span className="font-mono">{editSaturation}</span>
                          </div>
                          <input
                            type="range"
                            min={-80}
                            max={80}
                            value={editSaturation}
                            onChange={(e) => setEditSaturation(parseInt(e.target.value, 10))}
                            className="w-full studio-slider"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          disabled={savingImageEdit}
                          onClick={() => void handleCommitImageEdit(false)}
                          className="liquid-glass-blue py-2 px-3 rounded-full text-xs font-semibold cursor-pointer"
                        >
                          Guardar copia
                        </button>
                        <button
                          type="button"
                          disabled={savingImageEdit}
                          onClick={() => void handleCommitImageEdit(true)}
                          className="liquid-glass-btn py-2 px-3 rounded-full text-xs font-medium text-white cursor-pointer"
                        >
                          Reemplazar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
