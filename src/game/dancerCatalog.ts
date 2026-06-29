import type { SongPhase } from './scrollPhase';

function range(prefix: string, from: number, to: number): `${typeof prefix}${string}`[] {
  const out: string[] = [];
  for (let i = from; i <= to; i++) {
    out.push(`${prefix}${String(i).padStart(2, '0')}`);
  }
  return out as `${typeof prefix}${string}`[];
}

export const FIRST_MODELS = range('d_f', 1, 8) as readonly [
  'd_f01', 'd_f02', 'd_f03', 'd_f04', 'd_f05', 'd_f06', 'd_f07', 'd_f08',
];

export const MID_MODELS = range('d_m', 1, 8) as readonly [
  'd_m01', 'd_m02', 'd_m03', 'd_m04', 'd_m05', 'd_m06', 'd_m07', 'd_m08',
];

export const END_MODELS = range('d_e', 1, 8) as readonly [
  'd_e01', 'd_e02', 'd_e03', 'd_e04', 'd_e05', 'd_e06', 'd_e07', 'd_e08',
];

export const PERFECT_MODELS = range('d_p', 1, 4) as readonly [
  'd_p01', 'd_p02', 'd_p03', 'd_p04',
];

/** 序盤/中盤/終盤ごとに左4・右4へ分割 */
export const PHASE_LEFT_POOLS: Record<SongPhase, readonly DancerModelId[]> = {
  early: ['d_f01', 'd_f02', 'd_f03', 'd_f04'],
  mid: ['d_m01', 'd_m02', 'd_m03', 'd_m04'],
  late: ['d_e01', 'd_e02', 'd_e03', 'd_e04'],
};

export const PHASE_RIGHT_POOLS: Record<SongPhase, readonly DancerModelId[]> = {
  early: ['d_f05', 'd_f06', 'd_f07', 'd_f08'],
  mid: ['d_m05', 'd_m06', 'd_m07', 'd_m08'],
  late: ['d_e05', 'd_e06', 'd_e07', 'd_e08'],
};

export type DancerModelId =
  | (typeof FIRST_MODELS)[number]
  | (typeof MID_MODELS)[number]
  | (typeof END_MODELS)[number]
  | (typeof PERFECT_MODELS)[number];

export const ALL_DANCER_MODEL_IDS: DancerModelId[] = [
  ...FIRST_MODELS,
  ...MID_MODELS,
  ...END_MODELS,
  ...PERFECT_MODELS,
];

export const PERFECT_BOOST_MAX = 2.8;
export const PERFECT_TIER_ENTRY = 0.1;

export type PerfectDancerTier = 0 | 1 | 2 | 3 | 4;

/** perfectBoost の積み上げ割合（0〜1）。ENTRY 未満は 0 */
export function getPerfectStackRatio(perfectBoost: number): number {
  if (perfectBoost < PERFECT_TIER_ENTRY) return 0;
  return Math.min(1, (perfectBoost - PERFECT_TIER_ENTRY) / (PERFECT_BOOST_MAX - PERFECT_TIER_ENTRY));
}

/** 積み上げ割合で p01→p04（MAX）へ段階遷移 */
export function getPerfectDancerTier(perfectBoost: number): PerfectDancerTier {
  const ratio = getPerfectStackRatio(perfectBoost);
  if (ratio <= 0) return 0;
  return Math.min(4, Math.max(1, 1 + Math.floor(ratio * 3.999))) as PerfectDancerTier;
}

export function perfectModelForTier(tier: 1 | 2 | 3 | 4): (typeof PERFECT_MODELS)[number] {
  return PERFECT_MODELS[tier - 1];
}

export interface DancerGroup {
  id: string;
  labelKey: string;
  models: readonly DancerModelId[];
}

export const DANCER_GROUPS: DancerGroup[] = [
  { id: 'first', labelKey: 'debug.dancer.group.first', models: FIRST_MODELS },
  { id: 'mid', labelKey: 'debug.dancer.group.mid', models: MID_MODELS },
  { id: 'end', labelKey: 'debug.dancer.group.end', models: END_MODELS },
  { id: 'perfect', labelKey: 'debug.dancer.group.perfect', models: PERFECT_MODELS },
];

export const DEFAULT_DANCER_PREVIEW_PAIR: [DancerModelId, DancerModelId] = [
  'd_f01',
  'd_f05',
];

export function dancerModelLabel(id: DancerModelId): string {
  return id.replace(/^d_/, '');
}
