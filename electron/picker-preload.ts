import { contextBridge, ipcRenderer } from 'electron';

export interface DisplaySourceSummary {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnailDataUrl: string;
  appIconDataUrl: string | null;
}

contextBridge.exposeInMainWorld('opticaPicker', {
  getSources: (): Promise<DisplaySourceSummary[]> => {
    return ipcRenderer.invoke('optica:picker-get-sources');
  },
  selectSource: (sourceId: string, withAudio: boolean): void => {
    ipcRenderer.send('optica:picker-select', { sourceId, withAudio });
  },
  cancel: (): void => {
    ipcRenderer.send('optica:picker-cancel');
  },
});
