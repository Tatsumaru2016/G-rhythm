import type { ChartData, GameStats } from '../types';
import { getAccuracy } from '../data/charts';
import { difficultyCssClass, formatChartDifficultyLabel } from '../audio/AutoChartGenerator';
import { escapeHtml } from './htmlUtils';
import { t, tJudgment } from '../i18n';
import { renderResultStarsHtml } from '../scoring/resultStars';

export function renderResultStarsRevealHtml(filled: number): string {
  return renderResultStarsHtml(filled);
}

export function renderResultClearBadgesHtml(stats: GameStats): string {
  return [
    stats.failed ? `<p class="result-clear result-clear--failed">${t('ui.failed')}</p>` : '',
    stats.perfectFullCombo
      ? `<p class="result-clear result-clear--pfc">${t('ui.perfectFullCombo')}</p>`
      : '',
    !stats.perfectFullCombo && stats.fullCombo
      ? `<p class="result-clear result-clear--fc">${t('ui.fullCombo')}</p>`
      : '',
  ]
    .filter(Boolean)
    .join('');
}

export function renderResultScreenHtml(stats: GameStats, chart: ChartData): string {
  const acc = getAccuracy(stats);
  const diffClass = difficultyCssClass(chart.difficulty);
  const diffLabel = formatChartDifficultyLabel(chart.difficulty);
  const clearBadges = renderResultClearBadgesHtml(stats);

  return `
      <div class="screen result-screen">
        <div class="result-bg-fx" id="result-bg-fx" aria-hidden="true"></div>
        <div class="result-overlay-fx" aria-hidden="true">
          <div class="result-prism-veil"></div>
          <div class="result-chroma-edge"></div>
        </div>
        <div class="result-panel">
          <div class="result-summary">
            <div class="result-rank result-rank-pending${stats.failed ? ' result-rank--failed-pending' : ''}" id="result-rank-slot" aria-live="polite">···</div>
            <div class="result-stars-slot result-stars-pending" id="result-stars-slot" aria-hidden="true"></div>
            ${clearBadges}
            <h2 class="result-title">${escapeHtml(chart.title)}</h2>
            <p class="result-difficulty ${diffClass}">${escapeHtml(diffLabel)}</p>
            <div class="result-score-block">
              <span class="result-score-label">${t('ui.score')}</span>
              <div class="result-score">${stats.score.toLocaleString()}</div>
            </div>
          </div>
          <div class="result-detail-card">
            <div class="result-detail-head">${t('ui.resultDetail')}</div>
            <div class="result-max-combo-bar">
              <span class="result-max-combo-label">${t('ui.maxCombo')}</span>
              <span class="result-max-combo-value">${stats.maxCombo}</span>
            </div>
            <ul class="result-judgment-list" aria-label="${t('ui.resultDetail')}">
              <li class="result-judgment-row marvelous">
                <span class="result-judgment-label">${tJudgment('marvelous')}</span>
                <span class="result-judgment-count">${stats.marvelous ?? 0}</span>
              </li>
              <li class="result-judgment-row perfect">
                <span class="result-judgment-label">${tJudgment('perfect')}</span>
                <span class="result-judgment-count">${stats.perfect}</span>
              </li>
              <li class="result-judgment-row great">
                <span class="result-judgment-label">${tJudgment('great')}</span>
                <span class="result-judgment-count">${stats.great}</span>
              </li>
              <li class="result-judgment-row good">
                <span class="result-judgment-label">${tJudgment('good')}</span>
                <span class="result-judgment-count">${stats.good}</span>
              </li>
              <li class="result-judgment-row bad">
                <span class="result-judgment-label">${tJudgment('bad')}</span>
                <span class="result-judgment-count">${stats.bad}</span>
              </li>
              <li class="result-judgment-row miss">
                <span class="result-judgment-label">${tJudgment('miss')}</span>
                <span class="result-judgment-count">${stats.miss}</span>
              </li>
            </ul>
            <div class="result-accuracy-row">
              <span class="result-accuracy-label">${t('ui.accuracy')}</span>
              <span class="result-accuracy-value">${acc}%</span>
            </div>
          </div>
          <div class="result-actions">
            <button class="btn-primary" id="btn-retry">${t('ui.retry')}</button>
            <button class="btn-secondary" id="btn-menu">${t('ui.songSelectTitle')}</button>
          </div>
        </div>
      </div>
    `;
}
