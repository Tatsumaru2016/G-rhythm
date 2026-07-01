/** DDR 風 表示タイミング（±0.9、0.1刻み）。0=ステップゾーン中央。 */
export const DEFAULT_DISPLAY_TIMING = 0;
export const MIN_DISPLAY_TIMING = -0.9;
export const MAX_DISPLAY_TIMING = 0.9;
export const DISPLAY_TIMING_STEP = 0.1;
const STORAGE_KEY = 'g-rhythm-display-timing';

export function clampDisplayTiming(value: number): number {
  const stepped = Math.round(value / DISPLAY_TIMING_STEP) * DISPLAY_TIMING_STEP;
  return Math.max(MIN_DISPLAY_TIMING, Math.min(MAX_DISPLAY_TIMING, stepped));
}

export function loadDisplayTiming(): number {
  try {
    const v = parseFloat(localStorage.getItem(STORAGE_KEY) ?? '');
    if (Number.isFinite(v)) return clampDisplayTiming(v);
  } catch {
    /* ignore */
  }
  return DEFAULT_DISPLAY_TIMING;
}

export function saveDisplayTiming(value: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(clampDisplayTiming(value)));
  } catch {
    /* ignore */
  }
}

export function formatDisplayTiming(value: number): string {
  const t = clampDisplayTiming(value);
  if (Math.abs(t) < DISPLAY_TIMING_STEP * 0.5) return '±0.0';
  const sign = t > 0 ? '+' : '';
  return `${sign}${t.toFixed(1)}`;
}
