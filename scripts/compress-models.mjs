import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), 'prepare-assets.mjs');
execFileSync(process.execPath, [script], { stdio: 'inherit' });
