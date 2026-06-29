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
