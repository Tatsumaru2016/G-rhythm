import { isValidStageFxPattern, STAGE_FX_PATTERN_COUNT } from '../game/stageFxPatterns';

const STORAGE_KEY = 'g-rhythm-stage-fx-pattern-v1';

/** 自動（ジャンル重み抽選） */
export const STAGE_FX_AUTO = -1;

export const DEFAULT_STAGE_FX_PATTERN = STAGE_FX_AUTO;

export function loadStageFxPattern(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return DEFAULT_STAGE_FX_PATTERN;
    const n = Number(stored);
    if (n === STAGE_FX_AUTO) return STAGE_FX_AUTO;
    if (isValidStageFxPattern(n)) return n;
  } catch {
    /* ignore */
  }
  return DEFAULT_STAGE_FX_PATTERN;
}

export function saveStageFxPattern(pattern: number): void {
  try {
    if (pattern === STAGE_FX_AUTO || isValidStageFxPattern(pattern)) {
      localStorage.setItem(STORAGE_KEY, String(pattern));
    }
  } catch {
    /* ignore */
  }
}

export function normalizeStageFxPattern(value: number): number {
  if (value === STAGE_FX_AUTO) return STAGE_FX_AUTO;
  if (isValidStageFxPattern(value)) return value;
  return DEFAULT_STAGE_FX_PATTERN;
}

export { STAGE_FX_PATTERN_COUNT };
