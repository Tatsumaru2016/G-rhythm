/**

 * アセット自動準備: Three.js デコーダ配置 + GLB Draco 圧縮

 *

 * - models-src/*.glb → public/models/*.glb（推奨・差分のみ再圧縮）

 * - models-src に無い public/models/*.glb は初回/更新時のみインプレース圧縮

 *

 * KTX2 は KTX-Software の `ktx` コマンドが必要。無い場合は WebP → Draco のみへ自動フォールバック。

 */

import {

  cpSync,

  existsSync,

  mkdirSync,

  readFileSync,

  readdirSync,

  renameSync,

  rmSync,

  statSync,

  writeFileSync,

} from 'node:fs';

import { basename, dirname, join } from 'node:path';

import { spawnSync } from 'node:child_process';

import { fileURLToPath } from 'node:url';



const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const decodersOnly = process.argv.includes('--decoders-only');



const OPTIMIZE_STRATEGIES = [

  { name: 'Draco + KTX2', args: ['--compress', 'draco', '--texture-compress', 'ktx2'] },

  { name: 'Draco + WebP', args: ['--compress', 'draco', '--texture-compress', 'webp'] },

  { name: 'Draco のみ', args: ['--compress', 'draco', '--texture-compress', 'false'] },

];



let activeOptimizeStrategy = null;



function runGltfTransform(args) {

  const cliJs = join(root, 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js');

  if (!existsSync(cliJs)) {

    console.warn('[prepare-assets] @gltf-transform/cli がありません — npm install を実行してください');

    return false;

  }

  const result = spawnSync(process.execPath, [cliJs, ...args], {

    cwd: root,

    stdio: 'inherit',

  });

  return result.status === 0;

}



function copyDecoders() {

  const threeLibs = join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs');

  const dracoSrc = join(threeLibs, 'draco', 'gltf');

  const basisSrc = join(threeLibs, 'basis');



  if (!existsSync(dracoSrc) || !existsSync(basisSrc)) {

    console.warn('[prepare-assets] three のデコーダが見つかりません — npm install 後に再実行');

    return;

  }



  let threeVersion = 'unknown';

  try {

    const pkg = JSON.parse(readFileSync(join(root, 'node_modules/three/package.json'), 'utf8'));

    threeVersion = pkg.version ?? threeVersion;

  } catch { /* ignore */ }



  const dracoDst = join(root, 'public', 'draco');

  const basisDst = join(root, 'public', 'basis');

  const marker = join(dracoDst, '.three-version');



  if (existsSync(marker) && readFileSync(marker, 'utf8') === threeVersion) {

    return;

  }



  mkdirSync(dracoDst, { recursive: true });

  mkdirSync(basisDst, { recursive: true });

  cpSync(dracoSrc, dracoDst, { recursive: true });

  cpSync(basisSrc, basisDst, { recursive: true });

  writeFileSync(marker, threeVersion, 'utf8');

  console.log('[prepare-assets] Draco / KTX2 デコーダを public/ に配置しました');

}



function lockPath() {

  return join(root, 'public', 'models', '.compress-lock');

}



function acquireLock() {

  const path = lockPath();

  if (existsSync(path)) {

    const age = Date.now() - statSync(path).mtimeMs;

    if (age < 6 * 60 * 60 * 1000) {

      console.log('[prepare-assets] モデル圧縮は別プロセスで実行中 — スキップ');

      return false;

    }

    rmSync(path, { force: true });

  }

  mkdirSync(dirname(path), { recursive: true });

  writeFileSync(path, String(process.pid), 'utf8');

  return true;

}



function releaseLock() {

  rmSync(lockPath(), { force: true });

}



function metaPath() {

  return join(root, 'public', 'models', '.optimized-meta.json');

}



function loadMeta() {

  const path = metaPath();

  if (!existsSync(path)) return { files: {}, strategy: null };

  try {

    const raw = JSON.parse(readFileSync(path, 'utf8'));

    if (raw.files) return raw;

    return { files: raw, strategy: null };

  } catch {

    return { files: {}, strategy: null };

  }

}



function saveMeta(meta) {

  const dir = join(root, 'public', 'models');

  mkdirSync(dir, { recursive: true });

  writeFileSync(metaPath(), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

}



function isNewer(src, dst) {

  if (!existsSync(dst)) return true;

  return statSync(src).mtimeMs > statSync(dst).mtimeMs;

}



function needsInPlace(file, meta) {

  const key = basename(file);

  const stat = statSync(file);

  const prev = meta.files[key];

  if (!prev?.optimized) return true;

  if (prev.mtime !== stat.mtimeMs || prev.size !== stat.size) return true;

  return false;

}



function optimizeGlb(srcPath, dstPath) {

  const tmpDir = join(dirname(dstPath), '.compress-tmp');

  mkdirSync(tmpDir, { recursive: true });

  const tmpOut = join(tmpDir, basename(dstPath));



  const strategies = activeOptimizeStrategy

    ? [activeOptimizeStrategy]

    : OPTIMIZE_STRATEGIES;



  for (const strategy of strategies) {

    rmSync(tmpOut, { force: true });

    const ok = runGltfTransform(['optimize', srcPath, tmpOut, ...strategy.args]);

    if (!ok) {

      if (activeOptimizeStrategy) break;

      console.warn(`[prepare-assets] ${strategy.name} は利用不可 — 次の方式を試します`);

      continue;

    }

    if (!activeOptimizeStrategy) {

      activeOptimizeStrategy = strategy;

      console.log(`[prepare-assets] 圧縮方式: ${strategy.name}`);

    }

    renameSync(tmpOut, dstPath);

    rmSync(tmpDir, { recursive: true, force: true });

    return strategy.name;

  }



  rmSync(tmpDir, { recursive: true, force: true });

  throw new Error(`圧縮失敗: ${basename(srcPath)}`);

}



function compressModels() {

  if (!acquireLock()) return;



  try {

    const srcDir = join(root, 'models-src');

    const dstDir = join(root, 'public', 'models');

    mkdirSync(dstDir, { recursive: true });



    const meta = loadMeta();

    if (meta.strategy) {

      const preset = OPTIMIZE_STRATEGIES.find((s) => s.name === meta.strategy);

      if (preset) activeOptimizeStrategy = preset;

    }



    const jobs = [];



    if (existsSync(srcDir)) {

      for (const file of readdirSync(srcDir).filter((f) => f.endsWith('.glb') && !f.startsWith('.'))) {

        const src = join(srcDir, file);

        const dst = join(dstDir, file);

        if (isNewer(src, dst)) jobs.push({ src, dst, file, inPlace: false });

      }

    }



    if (existsSync(dstDir)) {

      for (const file of readdirSync(dstDir).filter((f) => f.endsWith('.glb') && !f.startsWith('.'))) {

        if (existsSync(join(srcDir, file))) continue;

        const dst = join(dstDir, file);

        if (needsInPlace(dst, meta)) jobs.push({ src: dst, dst, file, inPlace: true });

      }

    }



    if (!jobs.length) {

      console.log('[prepare-assets] モデル圧縮: 更新なし');

      return;

    }



    console.log(`[prepare-assets] モデル圧縮: ${jobs.length} 件`);

    for (const job of jobs) {

      console.log(`  → ${job.file}${job.inPlace ? ' (in-place)' : ''}`);

      const mode = job.inPlace

        ? (() => {

          const tmp = join(dstDir, `.tmp-${job.file}`);

          const name = optimizeGlb(job.src, tmp);

          renameSync(tmp, job.dst);

          return name;

        })()

        : optimizeGlb(job.src, job.dst);



      const stat = statSync(job.dst);

      meta.files[job.file] = { mtime: stat.mtimeMs, size: stat.size, optimized: true, mode };

    }



    if (activeOptimizeStrategy) meta.strategy = activeOptimizeStrategy.name;

    saveMeta(meta);

    console.log('[prepare-assets] モデル圧縮完了');

  } finally {

    releaseLock();

  }

}



copyDecoders();

if (!decodersOnly) {

  compressModels();

}


