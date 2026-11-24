export type DesktopMenuAction =
  | 'capture-photo'
  | 'capture-window'
  | 'toggle-record'
  | 'open-gallery'
  | 'toggle-cinema-mode';

export interface SaveMediaFilePayload {
  defaultName: string;
  extension: 'png' | 'jpg' | 'webp' | 'mp4' | 'webm';
  bytes: Uint8Array;
}

export interface SaveMediaFileResult {
  canceled: boolean;
  filePath?: string;
}

export interface OpticaDesktopBridge {
  readonly isElectron: boolean;
  readonly platform: string;
  readonly arch: string;
  readonly appVersion: string;
  saveMediaFile: (payload: SaveMediaFilePayload) => Promise<SaveMediaFileResult>;
  onMenuAction: (listener: (action: DesktopMenuAction) => void) => () => void;
}

declare global {
  interface Window {
    opticaDesktop?: OpticaDesktopBridge;
  }
}
