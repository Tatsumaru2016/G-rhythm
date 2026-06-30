import type { ChartData, GameStats, JudgmentType } from '../types';

export type DdrGrade =
  | 'AAA' | 'AA+' | 'AA' | 'AA-' | 'A+' | 'A' | 'A-'
  | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'E';

export const DDR_MILLION_MAX = 1_000_000;

const GRADE_THRESHOLDS: { min: number; grade: DdrGrade }[] = [
  { min: 990_000, grade: 'AAA' },
  { min: 950_000, grade: 'AA+' },
  { min: 900_000, grade: 'AA' },
  { min: 890_000, grade: 'AA-' },
  { min: 850_000, grade: 'A+' },
  { min: 800_000, grade: 'A' },
  { min: 790_000, grade: 'A-' },
  { min: 750_000, grade: 'B+' },
  { min: 700_000, grade: 'B' },
  { min: 690_000, grade: 'B-' },
  { min: 650_000, grade: 'C+' },
  { min: 600_000, grade: 'C' },
  { min: 590_000, grade: 'C-' },
  { min: 550_000, grade: 'D+' },
  { min: 500_000, grade: 'D' },
];

/** DDR A 系: Perfect/Marvelous=5, Great=3, Good=1, それ以下=0 */
export function ddrJudgmentPoints(type: JudgmentType): number {
  switch (type) {
    case 'perfect': return 5;
    case 'great': return 3;
    case 'good': return 1;
    default: return 0;
  }
}

/** 1タップ=1、ホールド=押下+離しの2ステップ */
export function countMaxScoreSteps(chart: ChartData): number {
  let steps = 0;
  for (const note of chart.notes) {
    steps += note.type === 'hold' ? 2 : 1;
  }
  return steps;
}

export function computeDdrRawPoints(stats: GameStats): number {
  return stats.perfect * 5 + stats.great * 3 + stats.good;
}

export function ddrRawToMillion(raw: number, maxSteps: number): number {
  if (maxSteps <= 0) return 0;
  const maxRaw = maxSteps * 5;
  const million = Math.floor((raw / maxRaw) * DDR_MILLION_MAX);
  return Math.floor(million / 10) * 10;
}

export function computeDdrMillionScore(stats: GameStats, chart: ChartData): number {
  return ddrRawToMillion(computeDdrRawPoints(stats), countMaxScoreSteps(chart));
}

export function getDdrGrade(score: number, failed = false): DdrGrade {
  if (failed) return 'E';
  for (const { min, grade } of GRADE_THRESHOLDS) {
    if (score >= min) return grade;
  }
  return 'D';
}

export function ddrGradeCssClass(grade: DdrGrade): string {
  return `rank-${grade.replace(/\+/g, '-plus').replace(/-/g, '-minus')}`;
}

/** スコア ÷ 10,000 = 達成率%（98.50 など） */
export function formatDdrAccuracy(score: number): string {
  return (score / 10_000).toFixed(2);
}

export function getDdrAccuracyRatio(score: number): number {
  return score / DDR_MILLION_MAX;
}
