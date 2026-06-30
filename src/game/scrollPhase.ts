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
  early: 0.84,
  mid: 1.0,
  late: 1.2,
};

/** サイドFXパターンのフェーズ別重み（0=Rings … 9=CyberGrid） */
export function getPhasePatternWeightBias(phase: SongPhase): readonly number[] {
  const w = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  if (phase === 'early') {
    w[0] = 1.9;
    w[5] = 1.7;
    w[3] = 1.5;
    w[9] = 1.2;
    w[7] = 0.55;
    w[8] = 0.5;
  } else if (phase === 'mid') {
    w[1] = 1.8;
    w[2] = 1.7;
    w[3] = 1.6;
    w[6] = 1.4;
    w[0] = 0.85;
  } else {
    w[4] = 1.9;
    w[6] = 1.75;
    w[7] = 1.65;
    w[8] = 1.85;
    w[9] = 1.45;
    w[5] = 0.7;
  }
  return w;
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

/** ダンサー用サブフェーズ（序盤/中盤/終盤を各4分割 = 12区間） */
export type DancerSubPhase =
  | 'early1' | 'early2' | 'early3' | 'early4'
  | 'mid1' | 'mid2' | 'mid3' | 'mid4'
  | 'late1' | 'late2' | 'late3' | 'late4';

const DANCER_SUB_PHASES: DancerSubPhase[] = [
  'early1', 'early2', 'early3', 'early4',
  'mid1', 'mid2', 'mid3', 'mid4',
  'late1', 'late2', 'late3', 'late4',
];

export function getDancerSubPhase(time: number, duration: number): DancerSubPhase {
  if (duration <= 0) return 'early1';
  const progress = Math.max(0, Math.min(0.999999, time / duration));
  const idx = Math.min(DANCER_SUB_PHASES.length - 1, Math.floor(progress * DANCER_SUB_PHASES.length));
  return DANCER_SUB_PHASES[idx];
}

export function getPhaseScrollMultiplier(time: number, duration: number): number {
  return PHASE_SCROLL_MULTIPLIERS[getSongPhase(time, duration)];
}

export function getPhaseLabel(time: number, duration: number): string {
  return tPhase(getSongPhase(time, duration));
}
