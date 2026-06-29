import type { GameStats } from '../types';
import { getAccuracyRatio } from '../data/charts';

export type AccuracyTier = 80 | 90 | 95;

export interface AccuracyMilestoneStyle {
  label: string;
  sublabel: string;
  color: string;
  pulse: number;
}

export const ACCURACY_MILESTONE_STYLE: Record<AccuracyTier, AccuracyMilestoneStyle> = {
  80: {
    label: '80%',
    sublabel: 'ACCURACY',
    color: '#98fb98',
    pulse: 0.65,
  },
  90: {
    label: '90%',
    sublabel: 'ACCURACY',
    color: '#00e5ff',
    pulse: 0.9,
  },
  95: {
    label: '95%',
    sublabel: 'ULTRA ACC',
    color: '#ffd700',
    pulse: 1.15,
  },
};

const TIER_ORDER: AccuracyTier[] = [80, 90, 95];

export function getAccuracyPercent(stats: GameStats): number {
  return getAccuracyRatio(stats) * 100;
}

export function getAccuracyTier(stats: GameStats): AccuracyTier | null {
  const acc = getAccuracyPercent(stats);
  if (acc >= 95) return 95;
  if (acc >= 90) return 90;
  if (acc >= 80) return 80;
  return null;
}

export function canCelebrateAccuracy(stats: GameStats): boolean {
  const total = stats.perfect + stats.great + stats.good + stats.bad + stats.miss;
  return total >= 8;
}

export function getNewAccuracyMilestones(
  stats: GameStats,
  reached: ReadonlySet<AccuracyTier>,
): AccuracyTier[] {
  if (!canCelebrateAccuracy(stats)) return [];
  const tier = getAccuracyTier(stats);
  if (!tier) return [];

  const fresh: AccuracyTier[] = [];
  for (const m of TIER_ORDER) {
    if (m <= tier && !reached.has(m)) fresh.push(m);
  }
  return fresh;
}
