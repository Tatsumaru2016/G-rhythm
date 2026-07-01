import { defineConfig } from 'vite';

function shouldIgnoreWatch(path: string): boolean {
  const p = path.replace(/\\/g, '/');
  if (p.includes('/node_modules/')) return true;
  if (p.includes('/.git/')) return true;
  if (p.endsWith('.crdownload') || p.includes('.crdownload')) return true;
  if (p.endsWith('.pdnSave')) return true;
  if (p.includes('/public/audio/')) return true;
  if (/\.wav$/i.test(p) && !p.includes('/public/')) return true;
  return false;
}

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: true,
    watch: {
      ignored: shouldIgnoreWatch,
    },
  },
});
