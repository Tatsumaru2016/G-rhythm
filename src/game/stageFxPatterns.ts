import { pickWeightedPattern } from '../audio/musicGenre';

/** 0=Rings … 9=CyberGrid（SideStageFX と同期） */export const STAGE_FX_PATTERN_COUNT = 10;

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
  'cyberGrid',
] as const;

export type StageFxPatternId = (typeof STAGE_FX_PATTERN_IDS)[number];

/** 左右の演出が同じか別パターンか */
export type SideFxPairing = 'unified' | 'split';

export function isValidStageFxPattern(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < STAGE_FX_PATTERN_COUNT;
}

export function stageFxPatternI18nKey(index: number): string {
  return `debug.fx.${STAGE_FX_PATTERN_IDS[index]}`;
}

/** サイドパネル向き — 左右で組み合わせるカーブ */
const CURATED_SPLIT_PAIRS: readonly [number, number][] = [
  [6, 5], [6, 7], [5, 4], [4, 3], [7, 5], [7, 6],
  [0, 8], [8, 4], [9, 6], [1, 7], [2, 6], [3, 5],
  [6, 0], [5, 9], [4, 1],
];

export interface SidePatternPick {
  left: number;
  right: number;
  pairing: SideFxPairing;
}

export function pickSidePatterns(
  weights: readonly number[],
  debugPattern: number | null,
): SidePatternPick {
  if (debugPattern !== null && isValidStageFxPattern(debugPattern)) {
    return { left: debugPattern, right: debugPattern, pairing: 'unified' };
  }

  if (Math.random() < 0.44) {
    const pair = CURATED_SPLIT_PAIRS[Math.floor(Math.random() * CURATED_SPLIT_PAIRS.length)];
    if (Math.random() < 0.5) {
      return { left: pair[0], right: pair[1], pairing: 'split' };
    }
    return { left: pair[1], right: pair[0], pairing: 'split' };
  }

  const unified = pickWeightedPattern([...weights]);
  return { left: unified, right: unified, pairing: 'unified' };
}

/** フェーズ切り替え時に split なら右（または左）だけ差し替え */
export function pickSplitRefresh(
  weights: readonly number[],
  keep: number,
): number {
  let next = pickWeightedPattern([...weights]);
  let guard = 0;
  while (next === keep && guard++ < 14) {
    next = pickWeightedPattern([...weights]);
  }
  return next;
}
