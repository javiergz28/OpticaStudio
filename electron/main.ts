import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  Menu,
  protocol,
  screen,
  session,
  systemPreferences,
  type DesktopCapturerSource,
  type MenuItemConstructorOptions,
} from 'electron';
import fs from 'fs';
import path from 'path';

const APP_DISPLAY_NAME = 'Óptica Studio';
const APP_SCHEME = 'app';
const APP_HOST = 'optica';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const MAX_SAVE_BYTES = 256 * 1024 * 1024; // 256 MB cap for media exports

const ALLOWED_SAVE_EXTENSIONS = new Set(['png', 'jpg', 'webp', 'mp4', 'webm']);
const ALLOWED_PERMISSIONS = new Set([
  'media',
  'display-capture',
  'fullscreen',
  'clipboard-sanitized-write',
  'mediaKeySystem',
]);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.tflite': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized?: boolean;
  isFullScreen?: boolean;
}

interface PendingDisplayRequest {
  sources: DesktopCapturerSource[];
  wantsAudio: boolean;
  resolveSelection: (sourceId: string | null) => void;
}

const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1380,
  height: 860,
  isMaximized: false,
  isFullScreen: false,
};

const devServerUrlRaw = process.env.OPTICA_DEV_URL;
const devServerOrigin = (() => {
  if (!devServerUrlRaw) return null;
  try {
    const parsed = new URL(devServerUrlRaw);
    if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      return parsed.origin;
    }
    return null;
  } catch {
    return null;
  }
})();

const distDir = path.resolve(__dirname, '..', 'dist');
const iconPngPath = path.resolve(__dirname, '..', 'build-resources', 'icon.png');

let mainWindow: BrowserWindow | null = null;
let pickerWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let isQuitting = false;
let pendingDisplayRequest: PendingDisplayRequest | null = null;

app.setName(APP_DISPLAY_NAME);

// Register custom secure origin for offline production loading (MediaPipe WASM, WebGL2, IndexedDB)
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      allowServiceWorkers: false,
    },
  },
]);

// Enforce single instance
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else if (app.isReady()) {
      createMainWindow();
    }
  });
}

function getWindowStateFilePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function isBoundsVisibleOnAnyDisplay(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): boolean {
  const displays = screen.getAllDisplays();
  return displays.some((display) => {
    const area = display.workArea;
    const overlapX = Math.max(
      0,
      Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)
    );
    const overlapY = Math.max(
      0,
      Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y)
    );
    return overlapX >= 160 && overlapY >= 120;
  });
}

function loadWindowState(): WindowState {
  try {
    const raw = fs.readFileSync(getWindowStateFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<WindowState>;
    const width =
      typeof parsed.width === 'number' && Number.isFinite(parsed.width)
        ? Math.max(960, Math.round(parsed.width))
        : DEFAULT_WINDOW_STATE.width;
    const height =
      typeof parsed.height === 'number' && Number.isFinite(parsed.height)
        ? Math.max(640, Math.round(parsed.height))
        : DEFAULT_WINDOW_STATE.height;

    const hasValidCoords =
      typeof parsed.x === 'number' &&
      Number.isFinite(parsed.x) &&
      typeof parsed.y === 'number' &&
      Number.isFinite(parsed.y) &&
      isBoundsVisibleOnAnyDisplay({ x: parsed.x, y: parsed.y, width, height });

    return {
      width,
      height,
      x: hasValidCoords ? Math.round(parsed.x!) : undefined,
      y: hasValidCoords ? Math.round(parsed.y!) : undefined,
      isMaximized: Boolean(parsed.isMaximized),
      isFullScreen: Boolean(parsed.isFullScreen),
    };
  } catch {
    return { ...DEFAULT_WINDOW_STATE };
  }
}

function saveWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  try {
    const isFullScreen = win.isFullScreen();
    const isMaximized = win.isMaximized();
    const existing = loadWindowState();
    const bounds = !isFullScreen && !isMaximized ? win.getBounds() : null;

    const nextState: WindowState = {
      width: bounds ? bounds.width : existing.width,
      height: bounds ? bounds.height : existing.height,
      x: bounds ? bounds.x : existing.x,
      y: bounds ? bounds.y : existing.y,
      isMaximized,
      isFullScreen,
    };

    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(getWindowStateFilePath(), JSON.stringify(nextState, null, 2), 'utf-8');
  } catch {
    // Ignore non-fatal disk write failure
  }
}

function isAllowedRendererUrl(urlString: string | undefined): boolean {
  if (!urlString) return false;
  try {
    const parsed = new URL(urlString);
    if (devServerOrigin) {
      return parsed.origin === devServerOrigin;
    }
    return parsed.protocol === APP_SCHEME + ":" && parsed.hostname === APP_HOST && !parsed.port && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function buildContentSecurityPolicy(): string {
  if (devServerOrigin) {
    return [
      `default-src 'self' ${devServerOrigin}`,
      `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ${devServerOrigin}`,
      `worker-src 'self' blob: ${devServerOrigin}`,
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com ${devServerOrigin}`,
      `font-src 'self' https://fonts.gstatic.com data:`,
      `img-src 'self' data: blob: ${devServerOrigin}`,
      `media-src 'self' blob: mediastream: ${devServerOrigin}`,
      `connect-src 'self' blob: data: ${devServerOrigin} ws://localhost:3000 ws://127.0.0.1:3000`,
      `object-src 'none'`,
      `base-uri 'self'`,
      `frame-ancestors 'none'`,
    ].join('; ');
  }

  return [
    `default-src 'self' ${APP_ORIGIN}`,
    `script-src 'self' ${APP_ORIGIN} 'wasm-unsafe-eval'`,
    `worker-src 'self' ${APP_ORIGIN} blob:`,
    `style-src 'self' ${APP_ORIGIN} 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' ${APP_ORIGIN} https://fonts.gstatic.com data:`,
    `img-src 'self' ${APP_ORIGIN} data: blob:`,
    `media-src 'self' ${APP_ORIGIN} blob: mediastream:`,
    `connect-src 'self' ${APP_ORIGIN} blob: data:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');
}

function registerLocalAppProtocol(): void {
  protocol.handle(APP_SCHEME, async (request) => {
    try {
      const reqUrl = new URL(request.url);
      if (reqUrl.hostname !== APP_HOST) {
        return new Response('Forbidden', { status: 403 });
      }

      let decodedPath = decodeURIComponent(reqUrl.pathname || '/');
      if (decodedPath === '/' || decodedPath === '') {
        decodedPath = '/index.html';
      }

      const relPath = decodedPath.replace(/^\/+/, '');
      let resolvedPath = path.resolve(distDir, relPath);

      // Strict path traversal protection within distDir
      if (resolvedPath !== distDir && !resolvedPath.startsWith(distDir + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }

      const exists = fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile();
      if (!exists) {
        const ext = path.extname(resolvedPath);
        if (!ext || ext === '.html') {
          resolvedPath = path.join(distDir, 'index.html');
        } else {
          return new Response('Not Found', { status: 404 });
        }
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const body = await fs.promises.readFile(resolvedPath);

      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
        },
      });
    } catch {
      return new Response('Internal Server Error', { status: 500 });
    }
  });
}

function configureSecurityPolicies(): void {
  const cspHeader = buildContentSecurityPolicy();

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (isAllowedRendererUrl(details.url)) {
      const responseHeaders = { ...(details.responseHeaders || {}) };
      responseHeaders['Content-Security-Policy'] = [cspHeader];
      callback({ responseHeaders });
      return;
    }
    callback({ responseHeaders: details.responseHeaders });
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (!isAllowedRendererUrl(requestingOrigin)) return false;
    return ALLOWED_PERMISSIONS.has(permission);
  });

  session.defaultSession.setPermissionRequestHandler(
    async (webContents, permission, callback, details) => {
      const origin = details?.requestingUrl || webContents.getURL();
      if (!isAllowedRendererUrl(origin) || !ALLOWED_PERMISSIONS.has(permission)) {
        callback(false);
        return;
      }

      if (permission === 'media' && process.platform === 'darwin') {
        try {
          const mediaTypes = (details as { mediaTypes?: string[] } | undefined)?.mediaTypes;
          const wantsVideo = !mediaTypes || mediaTypes.includes('video');
          const wantsAudio = !mediaTypes || mediaTypes.includes('audio');

          if (wantsVideo && systemPreferences.getMediaAccessStatus('camera') === 'not-determined') {
            await systemPreferences.askForMediaAccess('camera');
          }
          if (wantsAudio && systemPreferences.getMediaAccessStatus('microphone') === 'not-determined') {
            await systemPreferences.askForMediaAccess('microphone');
          }

          const camStatus = systemPreferences.getMediaAccessStatus('camera');
          const micStatus = systemPreferences.getMediaAccessStatus('microphone');
          const allowed = (wantsVideo ? camStatus === 'granted' : true) && (wantsAudio ? micStatus === 'granted' : true);
          callback(allowed);
          return;
        } catch {
          callback(false);
          return;
        }
      }

      callback(true);
    }
  );
}

function closePickerWithResult(sourceId: string | null): void {
  const pending = pendingDisplayRequest;
  pendingDisplayRequest = null;

  if (pickerWindow && !pickerWindow.isDestroyed()) {
    const winToClose = pickerWindow;
    pickerWindow = null;
    winToClose.close();
  }

  pending?.resolveSelection(sourceId);
}

function openDisplaySourcePicker(
  sources: DesktopCapturerSource[],
  wantsAudio: boolean
): Promise<string | null> {
  if (pendingDisplayRequest) {
    closePickerWithResult(null);
  }

  return new Promise<string | null>((resolve) => {
    pendingDisplayRequest = {
      sources,
      wantsAudio,
      resolveSelection: resolve,
    };

    pickerWindow = new BrowserWindow({
      parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
      modal: Boolean(mainWindow && !mainWindow.isDestroyed()),
      width: 780,
      height: 540,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      title: 'Seleccionar ventana o pantalla',
      backgroundColor: '#0a0c12',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'picker-preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
      },
    });

    pickerWindow.setMenuBarVisibility(false);

    pickerWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    pickerWindow.webContents.on('will-navigate', (e) => {
      e.preventDefault();
    });

    pickerWindow.once('ready-to-show', () => {
      pickerWindow?.show();
    });

    pickerWindow.on('closed', () => {
      pickerWindow = null;
      if (pendingDisplayRequest) {
        const pending = pendingDisplayRequest;
        pendingDisplayRequest = null;
        pending.resolveSelection(null);
      }
    });

    void pickerWindow.loadFile(path.join(__dirname, 'picker.html'));
  });
}

function configureDisplayCaptureHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      if (!isAllowedRendererUrl(request.frame?.url)) {
        callback({});
        return;
      }

      if (process.platform === 'darwin') {
        console.info('[Optica] Display capture permission:', systemPreferences.getMediaAccessStatus('screen'));
      }
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 420, height: 236 },
        fetchWindowIcons: true,
      });

      const filtered = sources.filter((src) => src.name !== 'Seleccionar ventana o pantalla');
      if (filtered.length === 0) {
        console.warn('[Optica] No display sources available');
        callback({});
        return;
      }

      const selectedId = await openDisplaySourcePicker(filtered, Boolean(request.audioRequested));
      if (!selectedId) {
        callback({});
        return;
      }

      const chosen = filtered.find((s) => s.id === selectedId);
      if (!chosen) {
        callback({});
        return;
      }

      callback({
        video: chosen,
        audio: request.audioRequested ? 'loopback' : undefined,
      });
    } catch (error) {
      console.warn('[Optica] Display capture failed:', error instanceof Error ? error.name : 'unknown');
      callback({});
    }
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle('optica:picker-get-sources', (event) => {
    if (!pickerWindow || event.sender !== pickerWindow.webContents || !pendingDisplayRequest) {
      return [];
    }
    return pendingDisplayRequest.sources.map((src) => ({
      id: src.id,
      name: src.name,
      kind: src.id.startsWith('screen:') ? 'screen' : 'window',
      thumbnailDataUrl: src.thumbnail.toDataURL(),
      appIconDataUrl: src.appIcon && !src.appIcon.isEmpty() ? src.appIcon.toDataURL() : null,
    }));
  });

  ipcMain.on('optica:picker-select', (event, payload: unknown) => {
    if (!pickerWindow || event.sender !== pickerWindow.webContents || !pendingDisplayRequest) {
      return;
    }
    const sourceId =
      payload && typeof payload === 'object' && typeof (payload as { sourceId?: unknown }).sourceId === 'string'
        ? (payload as { sourceId: string }).sourceId
        : null;
    closePickerWithResult(sourceId);
  });

  ipcMain.on('optica:picker-cancel', (event) => {
    if (!pickerWindow || event.sender !== pickerWindow.webContents) return;
    closePickerWithResult(null);
  });

  ipcMain.handle('optica:save-file', async (event, rawPayload: unknown) => {
    const senderUrl = event.senderFrame?.url || event.sender.getURL();
    if (!isAllowedRendererUrl(senderUrl)) {
      throw new Error('Unauthorized IPC origin');
    }

    if (!rawPayload || typeof rawPayload !== 'object') {
      throw new Error('Invalid payload');
    }

    const payload = rawPayload as {
      defaultName?: unknown;
      extension?: unknown;
      bytes?: unknown;
    };

    const rawExt = typeof payload.extension === 'string' ? payload.extension.toLowerCase() : '';
    if (!ALLOWED_SAVE_EXTENSIONS.has(rawExt)) {
      throw new Error('Unsupported export format');
    }

    if (!(payload.bytes instanceof Uint8Array)) {
      throw new Error('Invalid binary data');
    }

    if (payload.bytes.byteLength === 0 || payload.bytes.byteLength > MAX_SAVE_BYTES) {
      throw new Error('File size out of allowed limits');
    }

    const baseName =
      typeof payload.defaultName === 'string' && payload.defaultName.trim().length > 0
        ? path.basename(payload.defaultName).replace(/[^a-zA-Z0-9._-]/g, '-')
        : `optica-captura.${rawExt}`;

    const ensuredName = baseName.toLowerCase().endsWith(`.${rawExt}`)
      ? baseName
      : `${baseName}.${rawExt}`;

    const isVideo = rawExt === 'mp4' || rawExt === 'webm';
    const defaultFolder = isVideo ? app.getPath('videos') : app.getPath('pictures');
    const targetWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;

    const dialogOptions: Electron.SaveDialogOptions = {
      title: isVideo ? 'Guardar video de Óptica Studio' : 'Guardar imagen de Óptica Studio',
      defaultPath: path.join(defaultFolder, ensuredName),
      filters: [
        {
          name: isVideo ? 'Video' : 'Imagen',
          extensions: [rawExt],
        },
      ],
    };

    const result = targetWindow
      ? await dialog.showSaveDialog(targetWindow, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions);

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    await fs.promises.writeFile(result.filePath, Buffer.from(payload.bytes));
    return { canceled: false, filePath: result.filePath };
  });
}

function dispatchMenuAction(action: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  mainWindow.webContents.send('optica:menu-action', action);
}

function buildApplicationMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: APP_DISPLAY_NAME,
            submenu: [
              { role: 'about', label: `Acerca de ${APP_DISPLAY_NAME}` },
              { type: 'separator' },
              { role: 'services', label: 'Servicios' },
              { type: 'separator' },
              { role: 'hide', label: `Ocultar ${APP_DISPLAY_NAME}` },
              { role: 'hideOthers', label: 'Ocultar otros' },
              { role: 'unhide', label: 'Mostrar todo' },
              { type: 'separator' },
              { role: 'quit', label: `Salir de ${APP_DISPLAY_NAME}` },
            ] as MenuItemConstructorOptions[],
          },
        ]
      : []),
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Capturar Foto',
          accelerator: 'CmdOrCtrl+S',
          click: () => dispatchMenuAction('capture-photo'),
        },
        {
          label: 'Capturar Ventana / Pantalla',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => dispatchMenuAction('capture-window'),
        },
        {
          label: 'Grabar / Detener Video',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => dispatchMenuAction('toggle-record'),
        },
        { type: 'separator' },
        {
          label: 'Abrir Galería',
          accelerator: 'CmdOrCtrl+G',
          click: () => dispatchMenuAction('open-gallery'),
        },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Cerrar ventana' } : { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Edición',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
      ],
    },
    {
      label: 'Vista',
      submenu: [
        {
          label: 'Modo Cine (Ocultar panel)',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => dispatchMenuAction('toggle-cinema-mode'),
        },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
        ...(devServerOrigin
          ? [
              { type: 'separator' } as MenuItemConstructorOptions,
              { role: 'reload', label: 'Recargar' } as MenuItemConstructorOptions,
              { role: 'toggleDevTools', label: 'Herramientas de desarrollo' } as MenuItemConstructorOptions,
            ]
          : []),
      ],
    },
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        { role: 'zoom', label: 'Zoom' },
        ...(isMac
          ? [
              { type: 'separator' } as MenuItemConstructorOptions,
              { role: 'front', label: 'Traer todo al frente' } as MenuItemConstructorOptions,
            ]
          : [{ role: 'close', label: 'Cerrar' } as MenuItemConstructorOptions]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createSplashWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 340,
    height: 220,
    frame: false,
    transparent: false,
    resizable: false,
    movable: false,
    center: true,
    alwaysOnTop: true,
    backgroundColor: '#06070a',
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  const html = `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';"><style>html,body{margin:0;height:100%;background:#06070a;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;user-select:none}.title{font-size:17px;font-weight:600;letter-spacing:-0.02em}.sub{font-size:12px;color:rgba(245,245,247,0.55)}</style></head><body><div class="title">Óptica Studio</div><div class="sub">Preparando cámara y motor óptico…</div></body></html>`;
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return win;
}

function createMainWindow(): void {
  const savedState = loadWindowState();
  const isMac = process.platform === 'darwin';

  let saveTimer: NodeJS.Timeout | null = null;
  const scheduleSaveState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (mainWindow) saveWindowState(mainWindow);
    }, 250);
  };

  mainWindow = new BrowserWindow({
    width: savedState.width,
    height: savedState.height,
    x: savedState.x,
    y: savedState.y,
    minWidth: 960,
    minHeight: 640,
    title: APP_DISPLAY_NAME,
    backgroundColor: '#06070a',
    show: false,
    icon: fs.existsSync(iconPngPath) ? iconPngPath : undefined,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 18, y: 20 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [`--optica-version=${app.getVersion()}`],
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  // Show subtle dark splash only if initial hydration takes longer than 240ms
  let mainReady = false;
  const splashTimer = setTimeout(() => {
    if (!mainReady && mainWindow && !mainWindow.isDestroyed() && !splashWindow) {
      splashWindow = createSplashWindow();
      splashWindow.once('ready-to-show', () => {
        if (!mainReady) splashWindow?.show();
      });
    }
  }, 240);

  mainWindow.once('ready-to-show', () => {
    mainReady = true;
    clearTimeout(splashTimer);
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (savedState.isMaximized) mainWindow.maximize();
    if (savedState.isFullScreen) mainWindow.setFullScreen(true);
    mainWindow.show();
  });

  mainWindow.on('resize', scheduleSaveState);
  mainWindow.on('move', scheduleSaveState);
  mainWindow.on('enter-full-screen', scheduleSaveState);
  mainWindow.on('leave-full-screen', scheduleSaveState);

  mainWindow.on('close', (event) => {
    if (mainWindow) saveWindowState(mainWindow);
    // Standard macOS convention: closing the window hides/closes window while keeping app in Dock unless Cmd+Q
    if (isMac && !isQuitting && mainWindow?.isFullScreen()) {
      event.preventDefault();
      mainWindow.once('leave-full-screen', () => {
        mainWindow?.close();
      });
      mainWindow.setFullScreen(false);
    }
  });

  mainWindow.on('closed', () => {
    if (saveTimer) clearTimeout(saveTimer);
    mainWindow = null;
  });

  // Security: prevent untrusted navigation & external popups
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isAllowedRendererUrl(targetUrl)) {
      event.preventDefault();
    }
  });

  if (devServerOrigin && devServerUrlRaw) {
    void mainWindow.loadURL(devServerUrlRaw);
  } else {
    void mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
  }
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && !app.isPackaged && fs.existsSync(iconPngPath)) {
    try {
      app.dock?.setIcon(iconPngPath);
    } catch {
      // Ignore in headless/non-GUI dev shells
    }
  }

  registerLocalAppProtocol();
  configureSecurityPolicies();
  configureDisplayCaptureHandler();
  registerIpcHandlers();
  buildApplicationMenu();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  closePickerWithResult(null);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
