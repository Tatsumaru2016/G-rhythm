import { pickWeightedPattern } from '../audio/musicGenre';
import {
  getPhaseStageFxPatterns,
  maskPatternWeightsForPhase,
  type SongPhase,
} from './scrollPhase';

/** 0=Rings … 8=Starburst（SideStageFX と同期・計9種） */
export const STAGE_FX_PATTERN_COUNT = 9;

export const STAGE_FX_PATTERN_IDS = [
  'rings',
  'prismPulse',
  'plasma',
  'auroraFlow',
  'beams',
  'waves',
  'neonCascade',
  'scanlines',
  'starburst',
] as const;

export type StageFxPatternId = (typeof STAGE_FX_PATTERN_IDS)[number];

/** 左右の演出が同じか別パターンか */
export type SideFxPairing = 'unified' | 'split';

const PHASE_SPLIT_PAIRS: Record<SongPhase, readonly [number, number][]> = {
  early: [[0, 1], [0, 2], [1, 2]],
  mid: [[3, 4], [3, 5], [4, 5]],
  late: [[6, 7], [6, 8], [7, 8]],
};

export function isValidStageFxPattern(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < STAGE_FX_PATTERN_COUNT;
}

export function stageFxPatternI18nKey(index: number): string {
  return `debug.fx.${STAGE_FX_PATTERN_IDS[index]}`;
}

export function getStageFxPatternPhase(pattern: number): SongPhase | null {
  if (!isValidStageFxPattern(pattern)) return null;
  if (pattern <= 2) return 'early';
  if (pattern <= 5) return 'mid';
  return 'late';
}

export interface SidePatternPick {
  left: number;
  right: number;
  pairing: SideFxPairing;
}

export function pickSidePatterns(
  weights: readonly number[],
  debugPattern: number | null,
  phase: SongPhase,
): SidePatternPick {
  if (debugPattern !== null && isValidStageFxPattern(debugPattern)) {
    return { left: debugPattern, right: debugPattern, pairing: 'unified' };
  }

  const phaseWeights = maskPatternWeightsForPhase(weights, phase);
  const pairs = PHASE_SPLIT_PAIRS[phase];

  if (Math.random() < 0.44 && pairs.length > 0) {
    const pair = pairs[Math.floor(Math.random() * pairs.length)];
    if (Math.random() < 0.5) {
      return { left: pair[0], right: pair[1], pairing: 'split' };
    }
    return { left: pair[1], right: pair[0], pairing: 'split' };
  }

  const unified = pickWeightedPattern([...phaseWeights]);
  return { left: unified, right: unified, pairing: 'unified' };
}

/** フェーズ切り替え時に split なら右（または左）だけ差し替え */
export function pickSplitRefresh(
  weights: readonly number[],
  keep: number,
  phase: SongPhase,
): number {
  const phaseWeights = maskPatternWeightsForPhase(weights, phase);
  let next = pickWeightedPattern([...phaseWeights]);
  let guard = 0;
  while (next === keep && guard++ < 14) {
    next = pickWeightedPattern([...phaseWeights]);
  }
  return next;
}

export function listPatternsForPhase(phase: SongPhase): readonly number[] {
  return getPhaseStageFxPatterns(phase);
}
