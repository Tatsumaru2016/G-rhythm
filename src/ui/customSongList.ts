import type { CustomTrackEntry } from '../audio/CustomSongLoader';
import type { CatalogSortRow } from '../audio/songCatalogSort';
import type { ChartData } from '../types';
import type { DdrGrade } from '../scoring/ddrScoring';
import { renderBestGradeBadgeHtml } from './bestGradeView';
import { renderChartLevelHtml } from './chartRadarView';

export function renderFolderSongList(
  rows: readonly CatalogSortRow[],
  selectedCatalogIndex: number,
  isLoading: (catalogIndex: number) => boolean = () => false,
  formatMeta: (track: CustomTrackEntry) => string = () => '\u2014',
  getBestGrade: (track: CustomTrackEntry) => DdrGrade | null = () => null,
  getChart: (track: CustomTrackEntry, catalogIndex: number) => ChartData | null = () => null,
): string {
  const pad = String(rows.length).length;
  return rows.map((row, displayIndex) => {
    const selected = row.catalogIndex === selectedCatalogIndex;
    const loading = isLoading(row.catalogIndex);
    const num = String(displayIndex + 1).padStart(pad, '0');
    const meta = formatMeta(row.track);
    const chart = getChart(row.track, row.catalogIndex);
    const levelHtml = renderChartLevelHtml(chart, 'card');
    const rankHtml = renderBestGradeBadgeHtml(getBestGrade(row.track), 'card');
    return `
      <button
        type="button"
        class="song-band-card folder-song-item${selected ? ' is-selected' : ''}${loading ? ' is-loading' : ''}"
        data-list-index="${row.catalogIndex}"
        aria-pressed="${selected}"
        aria-busy="${loading}"
        ${loading ? 'disabled' : ''}
      >
        <span class="song-band-card__select-mark" aria-hidden="true">▼</span>
        <span class="song-band-card__index">${num}</span>
        <div class="song-band-card__level">${levelHtml}</div>
        <h3 class="song-band-card__title">${escapeHtml(row.track.title)}</h3>
        <p class="song-band-card__meta">${escapeHtml(meta)}</p>
        <div class="song-band-card__rank">${rankHtml}</div>
        <div class="song-band-card__load-overlay" aria-hidden="true">
          <span class="song-band-card__load-spinner"></span>
        </div>
      </button>
    `;
  }).join('');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
