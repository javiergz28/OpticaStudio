import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'dist-electron');

fs.mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: {
    main: path.join(rootDir, 'electron', 'main.ts'),
    preload: path.join(rootDir, 'electron', 'preload.ts'),
    'picker-preload': path.join(rootDir, 'electron', 'picker-preload.ts'),
  },
  outdir: outDir,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: false,
  minify: true,
  outExtension: { '.js': '.cjs' },
  logLevel: 'info',
});

for (const assetName of ['picker.html', 'picker-renderer.js']) {
  const src = path.join(rootDir, 'electron', assetName);
  const dest = path.join(outDir, assetName);
  fs.copyFileSync(src, dest);
}

console.log('Electron bundle compilado en dist-electron/');
