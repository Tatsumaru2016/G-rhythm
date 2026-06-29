import { rmSync } from 'node:fs';
import { join } from 'node:path';

const modelsDir = join(process.cwd(), 'dist', 'models');
try {
  rmSync(modelsDir, { recursive: true, force: true });
  console.log('[build] removed dist/models (served from GitHub raw in production)');
} catch (err) {
  console.warn('[build] could not remove dist/models:', err);
}
