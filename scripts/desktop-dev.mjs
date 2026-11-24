import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const DEV_URL = 'http://localhost:3000';
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function runCommand(cmd, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: rootDir,
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv },
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          reject(new Error('Tiempo de espera agotado esperando a Vite en puerto 3000.'));
        } else {
          setTimeout(check, 250);
        }
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Tiempo de espera agotado esperando a Vite en puerto 3000.'));
        } else {
          setTimeout(check, 250);
        }
      });
    };
    check();
  });
}

await runCommand('node', [path.join('scripts', 'build-electron.mjs')]);

if (!fs.existsSync(path.join(rootDir, 'build-resources', 'icon.icns'))) {
  await runCommand('node', [path.join('scripts', 'build-icons.mjs')]);
}

const viteProc = spawn(npmCmd, ['run', 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
  env: { ...process.env, DISABLE_HMR: 'false' },
});

let electronProc = null;
let cleaningUp = false;

function cleanup(exitCode = 0) {
  if (cleaningUp) return;
  cleaningUp = true;
  if (electronProc && !electronProc.killed) electronProc.kill('SIGTERM');
  if (viteProc && !viteProc.killed) viteProc.kill('SIGTERM');
  process.exit(exitCode);
}

process.on('SIGINT', () => cleanup(0));
process.on('SIGTERM', () => cleanup(0));

viteProc.on('exit', (code) => {
  if (!cleaningUp) cleanup(code ?? 0);
});

try {
  await waitForServer(DEV_URL);
  electronProc = spawn(npxCmd, ['electron', '.'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      OPTICA_DEV_URL: DEV_URL,
    },
  });
  electronProc.on('exit', (code) => cleanup(code ?? 0));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  cleanup(1);
}
