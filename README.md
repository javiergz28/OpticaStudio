# Óptica Studio

Estudio avanzado de cámara para MacBook y escritorio con aceleración GPU WebGL2, segmentación y seguimiento de sujeto mediante IA local (MediaPipe WASM), filtros cinematográficos y estilo Instagram, consola Web Audio, grabación MP4/WebM, captura de ventanas/pantalla y galería con editor integrado.

El mismo código fuente funciona tanto en **versión web** (Google AI Studio / navegador) como en **aplicación nativa de escritorio para macOS Apple Silicon (ARM64)** mediante Electron.

## Requisitos

- **Node.js `>= 20.0.0`** (recomendado **Node.js 22 LTS**).
- **npm 10+** (incluido con Node.js).
- Para generar el paquete `.app` y `.dmg` localmente: **macOS con Apple Silicon** (`arm64`) o el flujo automático en **GitHub Actions (`macos-14`)**.

## Comandos principales

```bash
# Instalar dependencias
npm install

# Versión web (Google AI Studio / navegador en puerto 3000)
npm run dev

# Verificar tipos TypeScript (frontend + Electron)
npm run lint

# Compilar versión web de producción (dist/)
npm run build

# Ejecutar aplicación de escritorio en modo desarrollo (Vite + Electron)
npm run desktop:dev

# Compilar frontend + procesos Electron (dist/ y dist-electron/)
npm run desktop:build

# Generar carpeta Optica Studio.app sin DMG
npm run desktop:package

# Generar instalador completo macOS ARM64 (.app y .dmg en release/)
npm run desktop:dist
```

## Estructura de escritorio y compilación

- `electron/main.ts` y `electron/preload.ts`: proceso principal seguro (`contextIsolation`, `sandbox`, `nodeIntegration: false`, protocolo local `app://optica`, diálogos nativos y selector de ventanas/pantalla).
- `build-resources/`: icono nativo `icon.icns`, PNG maestro `icon.png` y `entitlements.mac.plist`.
- `electron-builder.yml`: configuración de `Optica Studio.app` y `Optica-Studio-macOS-arm64.dmg` (`com.opticastudio.desktop`).
- `.github/workflows/build-macos.yml`: compilación reproducible en GitHub Actions sobre `macos-14` (`arm64`).

Para guía de instalación, permisos de macOS, almacenamiento local y firma/notarización, consulta **[README-macOS.md](./README-macOS.md)**.

## Atajos de teclado

- `Espacio` / `⌘S`: Capturar fotografía
- `⌘⇧W`: Capturar ventana o pantalla
- `R` / `⌘⇧R`: Iniciar o detener grabación de video
- `⌘G`: Abrir galería
- `H` / `⌘⇧H`: Alternar Modo Cine (ocultar/mostrar panel lateral)
- `M`: Espejo horizontal · `F`: Congelar cuadro · `L`: Luz de relleno · `G`: Guías ópticas
