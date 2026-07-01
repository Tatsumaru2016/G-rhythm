import { getBestGradeForChart } from '../data/songBestGrade';
import { ddrGradeCssClass, type DdrGrade } from '../scoring/ddrScoring';
import type { ChartData } from '../types';
import { t } from '../i18n';

export function renderBestGradeBadgeHtml(
  grade: DdrGrade | null | undefined,
  variant: 'card' | 'hero' | 'panel' = 'card',
): string {
  const variantClass =
    variant === 'hero'
      ? ' song-best-grade--hero'
      : variant === 'panel'
        ? ' song-best-grade--panel'
        : ' song-best-grade--card';
  const unset = !grade;
  const rankClass = unset ? 'song-best-grade--unset' : ddrGradeCssClass(grade);
  const value = unset ? '--' : grade;
  const ariaLabel = unset ? t('ui.bestGradeUnset') : `${t('ui.bestGrade')}: ${grade}`;
  return `
    <span class="song-best-grade ${rankClass}${variantClass}${unset ? ' is-unset' : ''}" title="${ariaLabel}" aria-label="${ariaLabel}">${value}</span>
  `;
}

export function renderChartBestGradeBadge(
  chart: ChartData | null,
  variant: 'card' | 'hero' | 'panel' = 'card',
): string {
  if (!chart) return '';
  return renderBestGradeBadgeHtml(getBestGradeForChart(chart), variant);
}
