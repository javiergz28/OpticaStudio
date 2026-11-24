# Óptica Studio — Guía de Escritorio para macOS (Apple Silicon)

Esta guía documenta la instalación, permisos, almacenamiento y compilación de **Óptica Studio** como aplicación independiente para Mac con procesador Apple Silicon (`arm64`).

## 1. Artefactos generados

Al compilar en macOS (`npm run desktop:dist:local`) o descargar desde GitHub Actions, se generan:

```text
release/
├── mac-arm64/
│   └── Optica Studio.app
└── Optica-Studio-macOS-arm64.dmg
```

- **Identificador de paquete**: `com.opticastudio.desktop`
- **Arquitectura objetivo**: Apple Silicon (`arm64`)

## 2. Instalación desde el archivo DMG

1. Descarga `Optica-Studio-macOS-arm64.dmg` desde la pestaña **Actions** (artefacto `Optica-Studio-macOS-arm64-dmg`) o desde **Releases** en GitHub, o compílalo localmente con `npm run desktop:dist:local`.
2. Haz doble clic en `Optica-Studio-macOS-arm64.dmg`.
3. Arrastra **Optica Studio.app** hacia el acceso directo **Applications** dentro de la ventana del instalador.
4. Expulsa el disco virtual y abre **Óptica Studio** desde Launchpad, Spotlight o `/Applications`.

### Importante: compilación sin firma Apple (Gatekeeper)

Si no se configuraron certificados de Apple Developer en GitHub Secrets ni en el llavero local, la aplicación generada **tiene firma ad hoc local, pero no está firmada con Developer ID ni notarizada por Apple**. Al abrirla por primera vez, macOS Gatekeeper puede mostrar un aviso indicando que no se puede verificar al desarrollador o que está dañada.

Para abrir una compilación local no firmada en tu propio Mac:

- **Opción A (Finder)**: haz **clic derecho** (o `Control + clic`) sobre `/Applications/Optica Studio.app` → **Abrir** → confirma **Abrir**.
- **Opción B (Terminal)**: si Gatekeeper bloquea la apertura directamente, retira el atributo de cuarentena de esa descarga local:
  ```bash
  xattr -cr "/Applications/Optica Studio.app"
  ```

## 3. Permisos de privacidad en macOS

La aplicación declara las descripciones de privacidad en `Info.plist` (`NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSScreenCaptureUsageDescription`) y solicita acceso controlado mediante Electron:

1. **Cámara** (`Ajustes del Sistema → Privacidad y seguridad → Cámara`): necesaria para la cámara integrada FaceTime HD o cámaras externas USB/Continuity.
2. **Micrófono** (`Ajustes del Sistema → Privacidad y seguridad → Micrófono`): necesario para el mezclador Web Audio y grabación de video con audio.
3. **Grabación de pantalla** (`Ajustes del Sistema → Privacidad y seguridad → Grabación de pantalla y audio del sistema`): necesaria exclusivamente para usar **Capturar ventana** o **Pantalla + Cámara (PiP)**. Si acabas de conceder este permiso en macOS, reinicia Óptica Studio para que WindowServer autorice las miniaturas de otras aplicaciones.

## 4. Funcionamiento sin conexión y almacenamiento local

- **Procesamiento 100% local**: los filtros WebGL2, los modelos de MediaPipe (`selfie_segmenter_landscape.tflite` y `blaze_face_short_range.tflite`) y los binarios WebAssembly (`vision_wasm_internal.wasm`) van empaquetados dentro de la aplicación y se sirven desde el protocolo seguro local `app://optica`. No requieren servidor Vite ni conexión a Internet.
- **Privacidad**: no se envían fotos, videos, fotogramas ni audio a servidores externos.
- **Diferencia de almacenamiento entre versión web y escritorio**:
  - **Versión web**: guarda las preferencias (`localStorage`) y la galería (`IndexedDB`) dentro del perfil y origen del navegador (`http://localhost:3000` o URL de Google AI Studio).
  - **Versión escritorio**: guarda la galería (`IndexedDB`), preferencias (`localStorage`) y posición/tamaño de ventana (`window-state.json`) en el directorio estándar de la aplicación en macOS:
    ```text
    ~/Library/Application Support/Óptica Studio/
    ```
  - Al actualizar la aplicación reemplazando `Optica Studio.app` en `/Applications`, los datos de `~/Library/Application Support/Óptica Studio/` **se conservan** intactos porque el origen interno `app://optica` y el `userData` permanecen constantes.
  - Al pulsar **Descargar** en la galería dentro de la app de escritorio, se abre el diálogo nativo **Guardar como…** de macOS apuntando a `~/Pictures` (imágenes) o `~/Movies` (videos).

## 5. Compilación automática en GitHub Actions

El archivo `.github/workflows/build-macos.yml` compila el instalador en un runner `macos-14` (Apple Silicon):

- **Ejecución manual**: entra en tu repositorio en GitHub → pestaña **Actions** → **Build macOS ARM64 Desktop** → **Run workflow**.
- **Publicación automática por versión**: al crear y subir una etiqueta `v*` (por ejemplo `git tag v1.0.0 && git push origin v1.0.0`), el workflow genera el DMG y crea automáticamente un **GitHub Release** con `Optica-Studio-macOS-arm64.dmg` adjunto.

### Firma y notarización futura (opcional con Apple Developer)

Cuando dispongas de cuenta Apple Developer, agrega estos secretos en **GitHub → Settings → Secrets and variables → Actions** sin modificar el código:

- `APPLE_CSC_LINK`: certificado Developer ID Application en formato `.p12` codificado en base64.
- `APPLE_CSC_KEY_PASSWORD`: contraseña del `.p12`.
- `APPLE_ID`: Apple ID de desarrollador.
- `APPLE_APP_SPECIFIC_PASSWORD`: contraseña específica de aplicación para notarización.
- `APPLE_TEAM_ID`: Team ID de 10 caracteres.

Mientras estos secretos estén vacíos, el workflow produce una compilación local funcional **con firma ad hoc local, sin Developer ID ni notarización**.
