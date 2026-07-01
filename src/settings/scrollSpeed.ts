export const DEFAULT_SCROLL_SPEED = 0.8;
export const MIN_SCROLL_SPEED = 0.5;
export const MAX_SCROLL_SPEED = 2.0;
const STORAGE_KEY = 'g-rhythm-scroll-speed';

export function loadScrollSpeed(): number {
  try {
    const v = parseFloat(localStorage.getItem(STORAGE_KEY) ?? '');
    if (Number.isFinite(v) && v >= MIN_SCROLL_SPEED && v <= MAX_SCROLL_SPEED) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_SCROLL_SPEED;
}

export function saveScrollSpeed(speed: number): void {
  const clamped = Math.max(MIN_SCROLL_SPEED, Math.min(MAX_SCROLL_SPEED, speed));
  try {
    localStorage.setItem(STORAGE_KEY, String(clamped));
  } catch {
    /* ignore */
  }
}

export function formatScrollSpeed(speed: number): string {
  return `${speed.toFixed(2).replace(/\.?0+$/, '')}x`;
}
