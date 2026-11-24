import { contextBridge, ipcRenderer } from 'electron';

export type DesktopMenuAction =
  | 'capture-photo'
  | 'capture-window'
  | 'toggle-record'
  | 'open-gallery'
  | 'toggle-cinema-mode';

const ALLOWED_MENU_ACTIONS = new Set<DesktopMenuAction>([
  'capture-photo',
  'capture-window',
  'toggle-record',
  'open-gallery',
  'toggle-cinema-mode',
]);

export interface SaveMediaFilePayload {
  defaultName: string;
  extension: 'png' | 'jpg' | 'webp' | 'mp4' | 'webm';
  bytes: Uint8Array;
}

export interface SaveMediaFileResult {
  canceled: boolean;
  filePath?: string;
}

const appVersion = (() => {
  const arg = process.argv.find((item) => item.startsWith('--optica-version='));
  return arg ? arg.slice('--optica-version='.length) : '1.0.0';
})();

contextBridge.exposeInMainWorld('opticaDesktop', {
  isElectron: true,
  platform: process.platform,
  arch: process.arch,
  appVersion,
  saveMediaFile: (payload: SaveMediaFilePayload): Promise<SaveMediaFileResult> => {
    return ipcRenderer.invoke('optica:save-file', payload);
  },
  onMenuAction: (listener: (action: DesktopMenuAction) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, action: unknown) => {
      if (typeof action === 'string' && ALLOWED_MENU_ACTIONS.has(action as DesktopMenuAction)) {
        listener(action as DesktopMenuAction);
      }
    };
    ipcRenderer.on('optica:menu-action', handler);
    return () => {
      ipcRenderer.removeListener('optica:menu-action', handler);
    };
  },
});
