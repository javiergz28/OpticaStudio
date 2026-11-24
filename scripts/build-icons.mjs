import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const buildResDir = path.join(rootDir, 'build-resources');
const srcIconCandidates = [
  path.join(rootDir, 'public', 'favicon.ico'),
  path.join(rootDir, 'favicon.ico'),
];

const sourceIcon = srcIconCandidates.find((p) => fs.existsSync(p));
if (!sourceIcon) {
  console.error('No se encontró public/favicon.ico ni favicon.ico para generar el icono.');
  process.exit(1);
}

fs.mkdirSync(buildResDir, { recursive: true });
const outIcns = path.join(buildResDir, 'icon.icns');
const outPng = path.join(buildResDir, 'icon.png');

function hasCommand(cmd) {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function buildIcnsBufferFromPngs(entries) {
  // entries: Array<{ type: string; data: Buffer }>
  const chunks = [];
  let totalLen = 8; // 'icns' (4) + total length uint32BE (4)
  for (const { type, data } of entries) {
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, 'ascii');
    header.writeUInt32BE(data.length + 8, 4);
    chunks.push(header, data);
    totalLen += data.length + 8;
  }
  const rootHeader = Buffer.alloc(8);
  rootHeader.write('icns', 0, 4, 'ascii');
  rootHeader.writeUInt32BE(totalLen, 4);
  return Buffer.concat([rootHeader, ...chunks]);
}

function generateWithMacTools() {
  const iconsetDir = path.join(buildResDir, 'OpticaStudio.iconset');
  fs.rmSync(iconsetDir, { recursive: true, force: true });
  fs.mkdirSync(iconsetDir, { recursive: true });

  // Convert original JPEG-backed favicon.ico to a 1024x1024 PNG master
  execFileSync('sips', ['-s', 'format', 'png', '-z', '1024', '1024', sourceIcon, '--out', outPng], {
    stdio: 'inherit',
  });

  const sizes = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ];

  for (const [name, px] of sizes) {
    execFileSync(
      'sips',
      ['-s', 'format', 'png', '-z', String(px), String(px), outPng, '--out', path.join(iconsetDir, name)],
      { stdio: 'ignore' }
    );
  }

  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', outIcns], { stdio: 'inherit' });
  fs.rmSync(iconsetDir, { recursive: true, force: true });
}

function generateWithImageMagick() {
  const tmpDir = path.join(buildResDir, '.tmp-icons');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  // Create a 1024x1024 squircle-masked PNG preserving the original Óptica Studio artwork
  const maskPng = path.join(tmpDir, 'mask.png');
  execFileSync(
    'convert',
    [
      '-size',
      '1024x1024',
      'xc:none',
      '-fill',
      'white',
      '-draw',
      'roundrectangle 44,44 980,980 212,212',
      maskPng,
    ],
    { stdio: 'inherit' }
  );

  execFileSync(
    'convert',
    [
      sourceIcon,
      '-resize',
      '1024x1024^',
      '-gravity',
      'center',
      '-extent',
      '1024x1024',
      maskPng,
      '-alpha',
      'off',
      '-compose',
      'CopyOpacity',
      '-composite',
      outPng,
    ],
    { stdio: 'inherit' }
  );

  const chunkSpecs = [
    ['ic11', 32],
    ['ic12', 64],
    ['ic07', 128],
    ['ic13', 256],
    ['ic08', 256],
    ['ic14', 512],
    ['ic09', 512],
    ['ic10', 1024],
  ];

  const entries = [];
  for (const [type, px] of chunkSpecs) {
    const p = path.join(tmpDir, `${type}_${px}.png`);
    execFileSync('convert', [outPng, '-resize', `${px}x${px}`, p], { stdio: 'ignore' });
    entries.push({ type, data: fs.readFileSync(p) });
  }

  const icnsBuf = buildIcnsBufferFromPngs(entries);
  fs.writeFileSync(outIcns, icnsBuf);
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

if (process.platform === 'darwin' && hasCommand('sips') && hasCommand('iconutil')) {
  // Prefer ImageMagick if available for macOS squircle padding, fallback to native sips+iconutil
  if (hasCommand('convert')) {
    generateWithImageMagick();
  } else {
    generateWithMacTools();
  }
} else if (hasCommand('convert')) {
  generateWithImageMagick();
} else if (fs.existsSync(outIcns) && fs.existsSync(outPng)) {
  console.log('Iconos precompilados encontrados en build-resources/.');
  process.exit(0);
} else {
  console.error('No se encontró ImageMagick (convert) ni iconutil para generar icon.icns.');
  process.exit(1);
}

console.log(`Iconos generados: ${path.relative(rootDir, outIcns)} (${fs.statSync(outIcns).size} bytes)`);
