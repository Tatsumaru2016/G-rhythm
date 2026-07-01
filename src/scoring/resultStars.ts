import type { DdrGrade } from './ddrScoring';

export const RESULT_STAR_MAX = 9;

/** DDR X3 風 — リザルトグレードから点灯する星（最大9） */
export function gradeToResultStars(grade: DdrGrade, failed = false): number {
  if (failed || grade === 'E') return 0;
  const table: Partial<Record<DdrGrade, number>> = {
    AAA: 9,
    'AA+': 8,
    AA: 7,
    'AA-': 7,
    'A+': 6,
    A: 5,
    'A-': 5,
    'B+': 4,
    B: 3,
    'B-': 3,
    'C+': 2,
    C: 2,
    'C-': 1,
    'D+': 1,
    D: 1,
  };
  return table[grade] ?? 0;
}

export function renderResultStarsHtml(filled: number, max = RESULT_STAR_MAX): string {
  const stars = Array.from({ length: max }, (_, i) => {
    const on = i < filled;
    return `<span class="result-star${on ? ' is-filled' : ''}" aria-hidden="true">\u2605</span>`;
  }).join('');
  return `<div class="result-stars-row" role="img" aria-label="${filled}/${max}">${stars}</div>`;
}
