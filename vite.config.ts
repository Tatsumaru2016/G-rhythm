import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));
const prepareScript = join(root, 'scripts/prepare-assets.mjs');
const modelsSrcDir = join(root, 'models-src');

function runPrepareAssets(decodersOnly = false) {
  const args = [prepareScript];
  if (decodersOnly) args.push('--decoders-only');
  execFileSync(process.execPath, args, { stdio: 'inherit', cwd: root });
}

function runPrepareAssetsInBackground() {
  spawn(process.execPath, [prepareScript], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    detached: false,
  }).on('error', (err) => {
    console.error('[prepare-assets] バックグラウンド圧縮エラー:', err);
  });
}

function isModelSrcFile(file: string): boolean {
  return file.endsWith('.glb') && !file.startsWith('.');
}

function shouldIgnoreWatch(path: string): boolean {
  const p = path.replace(/\\/g, '/');
  if (p.includes('/node_modules/')) return true;
  if (p.includes('/.git/')) return true;
  if (p.endsWith('.crdownload') || p.includes('.crdownload')) return true;
  if (p.endsWith('.pdnSave')) return true;
  if (p.includes('/public/models/')) return true;
  if (p.includes('/public/audio/')) return true;
  if (/\.wav$/i.test(p) && !p.includes('/public/')) return true;
  return false;
}

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [
    {
      name: 'g-rhythm-prepare-assets',
      buildStart() {
        if (command === 'build') runPrepareAssets();
      },
      configureServer(server) {
        runPrepareAssets(true);
        runPrepareAssetsInBackground();
        if (existsSync(modelsSrcDir)) {
          server.watcher.add(modelsSrcDir);
          const onModelChange = (file: string) => {
            if (!isModelSrcFile(file)) return;
            console.log('[prepare-assets] models-src 変更を検知:', file);
            runPrepareAssetsInBackground();
          };
          server.watcher.on('add', onModelChange);
          server.watcher.on('change', onModelChange);
        }
      },
    },
  ],
  server: {
    port: 5173,
    open: true,
    watch: {
      ignored: shouldIgnoreWatch,
    },
  },
}));
