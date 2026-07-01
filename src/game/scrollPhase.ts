import { tPhase } from '../i18n';

export type SongPhase = 'early' | 'mid' | 'late';

/** ユーザー設定スクロール速度に乗算する、曲進行フェーズ別倍率 */
export const PHASE_SCROLL_MULTIPLIERS: Record<SongPhase, number> = {
  early: 1.0,
  mid: 1.22,
  late: 1.48,
};

/** 演出の色相組み合わせ（動きは共通、色のみフェーズで変化） */
export interface PhaseColorScheme {
  hueBase: number;
  hueSecondary: number;
  hueAccent: number;
  saturation: number;
}

export const PHASE_COLOR_SCHEMES: Record<SongPhase, PhaseColorScheme> = {
  early: { hueBase: 195, hueSecondary: 255, hueAccent: 165, saturation: 88 },
  mid: { hueBase: 305, hueSecondary: 25, hueAccent: 275, saturation: 92 },
  late: { hueBase: 35, hueSecondary: 355, hueAccent: 55, saturation: 95 },
};

/** プレイ背景のフェーズ別テーマ */
export interface PhaseBackgroundTheme {
  top: string;
  mid: string;
  bottom: string;
  nebulaCenter: string;
  nebulaMid: string;
  starRgb: [number, number, number];
  flashRgb: [number, number, number];
}

export const PHASE_BACKGROUND_THEMES: Record<SongPhase, PhaseBackgroundTheme> = {
  early: {
    top: '#030818',
    mid: '#06102c',
    bottom: '#0c1a42',
    nebulaCenter: 'rgba(48, 140, 255, 0.2)',
    nebulaMid: 'rgba(80, 60, 220, 0.1)',
    starRgb: [190, 225, 255],
    flashRgb: [80, 200, 255],
  },
  mid: {
    top: '#080418',
    mid: '#16082c',
    bottom: '#240a38',
    nebulaCenter: 'rgba(255, 50, 200, 0.22)',
    nebulaMid: 'rgba(180, 40, 255, 0.12)',
    starRgb: [255, 200, 245],
    flashRgb: [255, 80, 220],
  },
  late: {
    top: '#120408',
    mid: '#1e0808',
    bottom: '#2e0c04',
    nebulaCenter: 'rgba(255, 130, 40, 0.24)',
    nebulaMid: 'rgba(255, 60, 80, 0.14)',
    starRgb: [255, 220, 175],
    flashRgb: [255, 160, 40],
  },
};

/** サイドFXのフェーズ別強度 */
export const PHASE_SIDE_FX_DRIVE: Record<SongPhase, number> = {
  early: 0.92,
  mid: 1.08,
  late: 1.32,
};

/** フェーズ別サイドFXパターン（0–8）。フェーズ間で重複なし */
export const PHASE_STAGE_FX_PATTERNS: Record<SongPhase, readonly number[]> = {
  early: [0, 1, 2],
  mid: [3, 4, 5],
  late: [6, 7, 8],
};

export function getPhaseStageFxPatterns(phase: SongPhase): readonly number[] {
  return PHASE_STAGE_FX_PATTERNS[phase];
}

export function isStageFxPatternInPhase(pattern: number, phase: SongPhase): boolean {
  return PHASE_STAGE_FX_PATTERNS[phase].includes(pattern);
}

/** 現フェーズの3パターンだけ重みを残す */
export function maskPatternWeightsForPhase(weights: readonly number[], phase: SongPhase): number[] {
  const pool = new Set(PHASE_STAGE_FX_PATTERNS[phase]);
  const masked = weights.map((w, i) => (pool.has(i) ? w : 0));
  const total = masked.reduce((s, w) => s + w, 0);
  if (total > 0) return masked;
  return PHASE_STAGE_FX_PATTERNS[phase].map(() => 1);
}

export function getPhaseColorScheme(phase: SongPhase): PhaseColorScheme {
  return PHASE_COLOR_SCHEMES[phase];
}

export function getSongPhase(time: number, duration: number): SongPhase {
  if (duration <= 0) return 'early';
  const progress = Math.max(0, Math.min(1, time / duration));
  if (progress < 1 / 3) return 'early';
  if (progress < 2 / 3) return 'mid';
  return 'late';
}

export function getPhaseScrollMultiplier(time: number, duration: number): number {
  return PHASE_SCROLL_MULTIPLIERS[getSongPhase(time, duration)];
}

export function getPhaseLabel(time: number, duration: number): string {
  return tPhase(getSongPhase(time, duration));
}
