# Óptica Studio — Ejecución local en macOS

Estudio avanzado para cámara de MacBook con aceleración GPU WebGL2, segmentación y seguimiento de sujeto IA local (MediaPipe), filtros estilo Instagram y cinematográficos, consola de audio, grabación MP4/WebM, doble cámara y editor rápido en galería.

## Requisitos en tu Mac
- **macOS** con **Node.js 18 o superior** ([nodejs.org](https://nodejs.org/es) o `brew install node`).
- Navegador **Google Chrome** (recomendado para 100% de compatibilidad con PiP flotante, audio de ventana y escáner QR) o **Safari**.

## Cómo ejecutarlo en tu Mac

### Método rápido (Lanzador incluido)
1. Descarga y descomprime la carpeta del proyecto en tu Mac.
2. Si es la primera vez tras descomprimir un ZIP, abre **Terminal** en la carpeta y dale permiso al lanzador:
   ```bash
   chmod +x Iniciar-Optica-Studio.command
   ```
3. Haz doble clic en **`Iniciar-Optica-Studio.command`** (si macOS pregunta por desarrollador, haz clic derecho → **Abrir**).  
   Esto instalará las dependencias la primera vez y abrirá automáticamente **`http://localhost:3000`**.

### Método manual por Terminal
1. Abre **Terminal** dentro de la carpeta del proyecto.
2. Instala dependencias (solo la primera vez):
   ```bash
   npm install
   ```
3. Inicia el estudio en local:
   ```bash
   npm run dev
   ```
4. Abre **`http://localhost:3000`** en Chrome o Safari y acepta los permisos de **Cámara** y **Micrófono**.

### Compilar versión de producción local
```bash
npm run build
npm run preview
```

## Notas para macOS
- **No necesitas claves ni archivo `.env`**: todo el procesamiento (filtros WebGL2, IA MediaPipe en `public/mediapipe`, mezclador Web Audio y galería en `IndexedDB`) corre localmente en tu Mac.
- **Permisos de ventana/pantalla**: si usas *Capturar ventana* o *Compartir pantalla*, autoriza a tu navegador en **Ajustes del Sistema → Privacidad y seguridad → Grabación de pantalla**.
- **Atajos de teclado**: `Espacio` (foto), `R` (grabar), `M` (espejo), `F` (congelar), `L` (luz de relleno), `G` (guías), `H` (Modo Cine).
