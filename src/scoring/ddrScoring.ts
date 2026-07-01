import type { ChartData, GameStats, JudgmentType } from '../types';

export type DdrGrade =
  | 'AAA'
  | 'AA+'
  | 'AA'
  | 'AA-'
  | 'A+'
  | 'A'
  | 'A-'
  | 'B+'
  | 'B'
  | 'B-'
  | 'C+'
  | 'C'
  | 'C-'
  | 'D+'
  | 'D'
  | 'E';

/** 低い → 高い */
export const DDR_GRADE_ORDER: DdrGrade[] = [
  'E',
  'D',
  'D+',
  'C-',
  'C',
  'C+',
  'B-',
  'B',
  'B+',
  'A-',
  'A',
  'A+',
  'AA-',
  'AA',
  'AA+',
  'AAA',
];

export function compareDdrGrades(a: DdrGrade, b: DdrGrade): number {
  return DDR_GRADE_ORDER.indexOf(a) - DDR_GRADE_ORDER.indexOf(b);
}

export function isDdrGradeHigher(a: DdrGrade, b: DdrGrade): boolean {
  return compareDdrGrades(a, b) > 0;
}

export const DDR_MILLION_MAX = 1_000_000;

/** Perfect 判定ごとの固定減点（DDR 百万点制） */

export const DDR_SCORE_DEDUCTION = 10;

export const DDR_GREAT_RATIO = 0.6;

export const DDR_GOOD_RATIO = 0.2;

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

/** 1,000,000 ÷ 総スコアステップ数 */

export function ddrBasePointPerStep(maxSteps: number): number {
  if (maxSteps <= 0) return 0;

  return DDR_MILLION_MAX / maxSteps;
}

/** 1タップ=1、ホールド=押下+離し(OK)の2ステップ */

export function countMaxScoreSteps(chart: ChartData): number {
  let steps = 0;

  for (const note of chart.notes) {
    steps += note.type === 'hold' ? 2 : 1;
  }

  return steps;
}

/** 通常ノーツの判定加点。
 *  BAD / Miss は DDR 同様「減点せず加点なし」（取りこぼした基本点を獲得できないだけ）。 */
export function ddrStepMillionPoints(judgment: JudgmentType, maxSteps: number): number {
  const base = ddrBasePointPerStep(maxSteps);

  switch (judgment) {
    case 'marvelous':
      return Math.floor(base);

    case 'perfect':
      return Math.max(0, Math.floor(base - DDR_SCORE_DEDUCTION));

    case 'great':
      return Math.max(0, Math.floor(base * DDR_GREAT_RATIO - DDR_SCORE_DEDUCTION));

    case 'good':
      return Math.max(0, Math.floor(base * DDR_GOOD_RATIO - DDR_SCORE_DEDUCTION));

    default:
      return 0;
  }
}

/** フリーズアロー成功（O.K.）— Perfect 相当 */

export function ddrFreezeOkPoints(maxSteps: number): number {
  return ddrStepMillionPoints('perfect', maxSteps);
}

export function roundDdrMillionScore(total: number): number {
  return Math.floor(Math.max(0, total) / 10) * 10;
}

/** @deprecated 累積スコアを Game 側で保持するため、finish 時は roundDdrMillionScore を使用 */

export function computeDdrMillionScore(stats: GameStats, chart: ChartData): number {
  const steps = countMaxScoreSteps(chart);

  let total = 0;

  total += (stats.marvelous ?? 0) * ddrStepMillionPoints('marvelous', steps);

  total += stats.perfect * ddrStepMillionPoints('perfect', steps);

  total += stats.great * ddrStepMillionPoints('great', steps);

  total += stats.good * ddrStepMillionPoints('good', steps);

  total += (stats.ok ?? 0) * ddrFreezeOkPoints(steps);

  return roundDdrMillionScore(total);
}

export function applyClearFlags(stats: GameStats): void {
  const ng = stats.ng ?? 0;

  stats.fullCombo = stats.miss === 0 && ng === 0;

  stats.perfectFullCombo =
    stats.miss === 0 &&
    ng === 0 &&
    stats.bad === 0 &&
    stats.good === 0 &&
    stats.great === 0 &&
    (stats.marvelous ?? 0) + stats.perfect > 0;
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
