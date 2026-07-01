import type { ChartData } from '../types';
import { LANE_COLORS } from '../types';
import { CHARTS } from '../data/charts';
import {
  CUSTOM_DIFFICULTIES,
  difficultyCssClass,
  formatChartDifficultyLabel,
  type CustomDifficulty,
} from '../audio/AutoChartGenerator';
import {
  BUILTIN_SORT_KEYS,
  FOLDER_SORT_KEYS,
  isSongSortDirectionEnabled,
  songSortKeyLabelKey,
  type SongSortKey,
  type SongSortSettings,
} from '../settings/songSort';
import { formatScrollSpeed, MIN_SCROLL_SPEED, MAX_SCROLL_SPEED } from '../settings/scrollSpeed';
import {
  formatDisplayTiming,
  MIN_DISPLAY_TIMING,
  MAX_DISPLAY_TIMING,
  DISPLAY_TIMING_STEP,
} from '../settings/displayTiming';
import {
  LANE_BACKGROUND_IDS,
  laneBackgroundI18nKey,
  type LaneBackgroundId,
} from '../game/laneBackground';
import { sortBuiltinIndices } from '../data/builtinCatalogSort';
import { renderChartLevelHtml, renderSongChartAnalysisHtml } from './chartRadarView';
import { renderChartBestGradeBadge } from './bestGradeView';
import { titleEqBarsHtml, songInfoSideEqBarsHtml } from './titleScreenView';
import { escapeHtml } from './htmlUtils';
import { escapeTooltipText, withTooltip } from './tooltip';
import { t, tDifficultyHint, formatChartBpm, formatNotesCount } from '../i18n';

function playSettingsLabel(text: string, hint?: string): string {
  const tipHtml = hint
    ? `<span class="has-tooltip select-hub-settings-label-tip" tabindex="0"><span class="tooltip-bubble" role="tooltip">${escapeTooltipText(hint)}</span></span>`
    : `<span class="select-hub-settings-label-tip is-empty" aria-hidden="true"></span>`;
  return `<span class="select-hub-settings-label"><span class="select-hub-settings-label-text">${escapeHtml(text)}</span>${tipHtml}</span>`;
}

export interface SelectHubViewState {
  isBuiltin: boolean;
  folderListMode: boolean;
  musicSelectTitleImageSrc: string;
  selectHubBuiltinIndex: number | null;
  selectHubTrackIndex: number;
  customDifficulty: CustomDifficulty;
  customBpm: number;
  customOffset: number;
  scrollSpeed: number;
  displayTiming: number;
  laneBackground: LaneBackgroundId;
  builtinSongSort: SongSortSettings;
  folderSongSort: SongSortSettings;
  customFolderName: string;
  customFolderFileCount: number;
  customImportPrompt: boolean;
  previewToggleHtml: string;
  selectedChart: ChartData | null;
  catalogTitles: string[];
}

function songSortOptionsHtml(keys: readonly SongSortKey[], selected: SongSortKey): string {
  return keys
    .map(
      (key) => `
      <option value="${key}"${key === selected ? ' selected' : ''}>
        ${t(songSortKeyLabelKey(key))}
      </option>
    `,
    )
    .join('');
}

function songSortDirectionButtonsHtml(
  prefix: 'builtin' | 'folder',
  settings: SongSortSettings,
): string {
  const enabled = isSongSortDirectionEnabled(settings);
  return `
      <div
        class="song-sort-direction${enabled ? '' : ' is-disabled'}"
        role="group"
        aria-label="${t('ui.songSortDirection')}"
      >
        <button
          type="button"
          id="${prefix}-song-sort-asc"
          class="song-sort-dir-btn${settings.direction === 'asc' ? ' is-active' : ''}"
          data-dir="asc"
          aria-label="${t('ui.songSort.asc')}"
          aria-pressed="${settings.direction === 'asc'}"
          ${enabled ? '' : 'disabled'}
        >▲</button>
        <button
          type="button"
          id="${prefix}-song-sort-desc"
          class="song-sort-dir-btn${settings.direction === 'desc' ? ' is-active' : ''}"
          data-dir="desc"
          aria-label="${t('ui.songSort.desc')}"
          aria-pressed="${settings.direction === 'desc'}"
          ${enabled ? '' : 'disabled'}
        >▼</button>
      </div>
    `;
}

function songSortBarHtml(
  prefix: 'builtin' | 'folder',
  settings: SongSortSettings,
  keys: readonly SongSortKey[],
): string {
  return `
      <div class="song-sort-bar" id="${prefix}-song-sort-bar">
        <div class="song-sort-control">
          <span class="song-sort-label">${t('ui.songSort')}</span>
          <select
            id="${prefix}-song-sort-key"
            class="song-sort-select"
            aria-label="${t('ui.songSort')}"
          >
            ${songSortOptionsHtml(keys, settings.key)}
          </select>
          ${songSortDirectionButtonsHtml(prefix, settings)}
        </div>
      </div>
    `;
}

function customDifficultyOptionsHtml(customDifficulty: CustomDifficulty): string {
  return CUSTOM_DIFFICULTIES.map(
    (d) => `
      <button type="button" class="difficulty-option ${d.toLowerCase()}${d === customDifficulty ? ' selected' : ''}"
        data-diff="${d}" aria-pressed="${d === customDifficulty}">
        ${d}
      </button>
    `,
  ).join('');
}

export function selectHubBuiltinCardsHtml(
  selectHubBuiltinIndex: number | null,
  builtinSongSort: SongSortSettings,
): string {
  const order = sortBuiltinIndices(CHARTS, builtinSongSort);
  return order
    .map((i) => {
      const chart = CHARTS[i];
      const diffClass = difficultyCssClass(chart.difficulty);
      const diffLabel = formatChartDifficultyLabel(chart.difficulty);
      return `
      <button
        type="button"
        class="song-band-card select-hub-builtin-card${selectHubBuiltinIndex === i ? ' is-selected' : ''}"
        data-builtin-index="${i}"
        style="--accent:${LANE_COLORS[i % 4]}"
      >
        <span class="song-band-card__select-mark" aria-hidden="true">▼</span>
        <span class="song-band-card__diff ${diffClass}">${escapeHtml(diffLabel)}</span>
        <div class="song-band-card__level">${renderChartLevelHtml(chart, 'card')}</div>
        <h3 class="song-band-card__title">${escapeHtml(chart.title)}</h3>
        <p class="song-band-card__sub">${escapeHtml(chart.artist)}</p>
        <p class="song-band-card__meta">${formatChartBpm(chart.bpm)} \u00b7 ${formatNotesCount(chart.notes.length)}</p>
        <div class="song-band-card__rank">${renderChartBestGradeBadge(chart, 'card')}</div>
      </button>
    `;
    })
    .join('');
}

function selectHubCustomPanelHtml(state: SelectHubViewState): string {
  const selected = state.selectHubBuiltinIndex === null;
  return `
      <div
        class="select-hub-custom-panel${selected ? ' is-selected' : ''}${state.customImportPrompt ? ' is-import-prompt' : ''}"
        id="select-hub-custom-panel"
      >
        <span class="select-hub-builtin-diff custom">${t('ui.custom')}</span>
        <div class="select-hub-custom-imports">
          <button
            type="button"
            class="select-hub-import-btn select-hub-import-btn--folder"
            id="btn-hub-import-folder"
            title="${t('ui.customImportFolder')}"
            aria-label="${t('ui.customImportFolder')}"
          >
            <svg class="select-hub-import-icon" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
            <span class="select-hub-import-label">${t('ui.customImportFolder')}</span>
          </button>
          <button
            type="button"
            class="select-hub-import-btn select-hub-import-btn--file"
            id="btn-hub-import-file"
            title="${t('ui.customImportSingle')}"
            aria-label="${t('ui.customImportSingle')}"
          >
            <svg class="select-hub-import-icon" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
            <span class="select-hub-import-label">${t('ui.customImportSingle')}</span>
          </button>
        </div>
        <div class="select-hub-custom-meta">
          <span
            class="select-hub-custom-folder-name"
            id="select-hub-custom-folder-name"
            title="${escapeHtml(state.customFolderName)}"
          >${escapeHtml(state.customFolderName)}</span>
          <span class="select-hub-custom-folder-count" id="select-hub-custom-folder-count">${t('ui.customFolderFileCount', { count: state.customFolderFileCount })}</span>
        </div>
      </div>
    `;
}

function selectHubPlaySettingsRowsHtml(state: SelectHubViewState): string {
  return `
      <div class="select-hub-settings-row select-hub-settings-row--difficulty">
        <p class="select-hub-settings-label" id="difficulty-label">
          ${withTooltip(
            `${t('ui.difficulty')}: <span class="difficulty-picker-current">${state.customDifficulty}</span>`,
            tDifficultyHint(state.customDifficulty),
            'has-tooltip--above',
          )}
        </p>
        <div class="difficulty-options select-hub-diff-options" role="radiogroup" aria-label="${t('ui.difficulty')}">
          ${customDifficultyOptionsHtml(state.customDifficulty)}
        </div>
      </div>
      <label class="select-hub-settings-row select-hub-settings-row--slider">
        ${playSettingsLabel(t('ui.bpmLabel'))}
        <input type="range" id="bpm-slider" min="80" max="200" value="${state.customBpm}" />
        <span class="select-hub-settings-value" id="bpm-value">${state.customBpm}</span>
      </label>
      <label class="select-hub-settings-row select-hub-settings-row--slider">
        ${playSettingsLabel(t('settings.offset'))}
        <input type="range" id="offset-slider" min="0" max="3" step="0.1" value="${state.customOffset}" />
        <span class="select-hub-settings-value" id="offset-value">${state.customOffset.toFixed(1)}</span>
      </label>
      <label class="select-hub-settings-row select-hub-settings-row--slider">
        ${playSettingsLabel(t('settings.scrollSpeed'), t('settings.scrollSpeedHint'))}
        <input type="range" id="speed-slider"
          min="${MIN_SCROLL_SPEED * 100}" max="${MAX_SCROLL_SPEED * 100}" step="5"
          value="${Math.round(state.scrollSpeed * 100)}" />
        <span class="select-hub-settings-value" id="speed-value">${formatScrollSpeed(state.scrollSpeed)}</span>
      </label>
      <label class="select-hub-settings-row select-hub-settings-row--slider">
        ${playSettingsLabel(t('settings.displayTiming'), t('settings.displayTimingHint'))}
        <input type="range" id="display-timing-slider"
          min="${MIN_DISPLAY_TIMING}" max="${MAX_DISPLAY_TIMING}" step="${DISPLAY_TIMING_STEP}"
          value="${state.displayTiming}" />
        <span class="select-hub-settings-value" id="display-timing-value">${formatDisplayTiming(state.displayTiming)}</span>
      </label>
      <label class="select-hub-settings-row select-hub-settings-row--select">
        ${playSettingsLabel(t('settings.laneBackground'), t('settings.laneBackgroundHint'))}
        <span class="lane-background-controls">
          <select id="lane-background-select" class="select-hub-settings-select">
            ${LANE_BACKGROUND_IDS.map(
              (id) =>
                `<option value="${id}"${state.laneBackground === id ? ' selected' : ''}>${t(laneBackgroundI18nKey(id))}</option>`,
            ).join('')}
          </select>
          <button
            type="button"
            class="select-hub-lane-bg-pick"
            id="btn-lane-background-image"
            aria-label="${t('settings.laneBgPickImage')}"
            title="${t('settings.laneBgPickImage')}"
          >
            <svg class="select-hub-lane-bg-pick-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
          </button>
          <input type="file" id="lane-background-image-input" accept="image/png,image/jpeg,image/webp" hidden />
        </span>
      </label>
    `;
}

function selectHubRightDockHtml(state: SelectHubViewState): string {
  return `
      <div class="select-hub-right-dock">
        <div class="select-hub-settings-stack" id="select-hub-tuning-panel">
          <div class="select-hub-settings-row select-hub-settings-row--preview">
            ${state.previewToggleHtml}
          </div>
          ${selectHubPlaySettingsRowsHtml(state)}
        </div>
      </div>
    `;
}

function selectHubSongBandHtml(state: SelectHubViewState): string {
  return `
      <div class="select-hub-song-band" aria-label="${t('ui.selectSongList')}">
        <div class="select-hub-song-band-main">
        <div class="select-hub-song-band-toolbar">
          ${songSortBarHtml('builtin', state.builtinSongSort, BUILTIN_SORT_KEYS)}
          ${songSortBarHtml('folder', state.folderSongSort, FOLDER_SORT_KEYS)}
        </div>
        <div class="select-hub-song-band-scroll-wrap">
          <div class="song-band-nav-group song-band-nav-group--start">
            <button
              type="button"
              class="song-band-nav song-band-nav--first"
              id="song-band-nav-first"
              aria-label="${t('ui.ringFirst')}"
            >
              <span class="song-band-nav-label" aria-hidden="true">|&lt;</span>
            </button>
            <button
              type="button"
              class="song-band-nav song-band-nav--prev"
              id="song-band-nav-prev"
              aria-label="${t('ui.ringPrev')}"
            >
              <span class="song-band-nav-label" aria-hidden="true">&lt;</span>
            </button>
          </div>
          <div class="select-hub-song-band-scroll" id="select-hub-song-band-scroll">
            <div class="select-hub-builtin-band" id="select-hub-builtin-rail">
              ${selectHubBuiltinCardsHtml(state.selectHubBuiltinIndex, state.builtinSongSort)}
            </div>
            <div class="select-hub-folder-band" id="folder-song-list">
              <div class="folder-song-list-track" id="folder-song-list-track"></div>
            </div>
          </div>
          <div class="song-band-nav-group song-band-nav-group--end">
            <button
              type="button"
              class="song-band-nav song-band-nav--next"
              id="song-band-nav-next"
              aria-label="${t('ui.ringNext')}"
            >
              <span class="song-band-nav-label" aria-hidden="true">&gt;</span>
            </button>
            <button
              type="button"
              class="song-band-nav song-band-nav--last"
              id="song-band-nav-last"
              aria-label="${t('ui.ringLast')}"
            >
              <span class="song-band-nav-label" aria-hidden="true">&gt;|</span>
            </button>
          </div>
        </div>
        </div>
        <div class="select-hub-custom-dock select-hub-custom-dock--band">
          ${selectHubCustomPanelHtml(state)}
        </div>
      </div>
    `;
}

function selectHubRadarDockHtml(state: SelectHubViewState): string {
  const chart = state.isBuiltin ? CHARTS[state.selectHubBuiltinIndex ?? 0] : state.selectedChart;
  const { radarHtml } = renderSongChartAnalysisHtml(chart, { largeRadar: true });
  const hidden = !chart || chart.notes.length === 0;
  return `
      <div class="select-hub-radar-dock">
        <div class="song-chart-radar-panel" id="song-chart-radar" aria-hidden="${hidden}">
          ${radarHtml}
        </div>
      </div>
    `;
}

function songRingCenterInnerHtml(state: SelectHubViewState): string {
  const chart = state.isBuiltin ? CHARTS[state.selectHubBuiltinIndex ?? 0] : state.selectedChart;
  const title =
    state.isBuiltin && chart ? chart.title : (state.catalogTitles[state.selectHubTrackIndex] ?? '');
  return `
      <div class="song-detail-top">
        <div class="song-info-best-grade-slot" id="song-best-grade-slot"></div>
        <div class="song-detail-centered">
          <div class="song-info-panel-level" id="song-chart-level-slot">${renderChartLevelHtml(chart, 'panel')}</div>
          <p class="song-ring-counter" id="ring-track-counter"></p>
        </div>
        <h2 class="ready-title" id="ring-center-title" title="${escapeHtml(title)}">${escapeHtml(title)}</h2>
        <div class="song-detail-centered">
          <p class="ready-artist" id="ring-center-meta"></p>
          <p class="ready-stats" id="ring-center-stats">\u2014</p>
        </div>
      </div>
    `;
}

function songInfoPanelHtml(state: SelectHubViewState): string {
  return `
      <div class="song-info-panel-wrap">
        <div class="song-info-hub-row">
          ${selectHubRadarDockHtml(state)}
          <div class="song-info-panel-column">
            <div class="song-info-panel-chrome" aria-hidden="true">
              <span class="song-info-panel-chrome__glow"></span>
            </div>
            <div class="song-info-panel-row">
              <div
                class="song-ring-center${state.folderListMode ? ' folder-song-detail' : ''}"
                id="song-ring-center"
              >
                <div class="song-info-eq-bars-top title-eq-bars title-eq-bars--top" aria-hidden="true">${titleEqBarsHtml()}</div>
                <div class="song-info-eq-bars song-info-eq-bars--left" aria-hidden="true">${songInfoSideEqBarsHtml()}</div>
                <div class="song-info-panel-body">
                  ${songRingCenterInnerHtml(state)}
                </div>
                <div class="song-info-eq-bars song-info-eq-bars--right" aria-hidden="true">${songInfoSideEqBarsHtml()}</div>
                <div class="random-pick-stage-fx" id="random-pick-fx" hidden aria-live="polite">
                  <div class="random-pick-fx-card">
                    <span class="random-pick-fx-kicker" id="random-pick-fx-kicker" hidden></span>
                    <span class="random-pick-fx-label" id="random-pick-fx-label"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
}

export function selectHubNavHtml(): string {
  return `
      <nav class="select-hub-nav-fx" aria-label="${t('ui.songSelectTitle')}">
        <button type="button" class="btn-select-nav-back" id="btn-goto-title" aria-label="${t('ui.backToTitle')}">
          <span class="btn-select-nav-back-label"><span class="nav-bracket-glyphs">&lt;&lt;</span> ${t('ui.backToTitleLabel')}</span>
        </button>
        <div class="select-hub-play-cluster">
          <div class="select-hub-play-slot">
            <button type="button" class="btn-select-start" id="btn-select-start" aria-label="${t('ui.play')}">
              <span class="select-play-label">${t('ui.play')}</span>
            </button>
            <button type="button" class="btn-select-random" id="btn-select-random" aria-label="${t('ui.randomPlay')}">
              <span class="select-play-label">${t('ui.randomPlay')}</span>
            </button>
          </div>
        </div>
      </nav>
    `;
}

export function renderSelectHubScreenHtml(state: SelectHubViewState): string {
  return `
      <div class="screen select-hub-screen custom-folder-screen${state.isBuiltin ? ' is-builtin-mode' : ''}${state.folderListMode ? ' is-folder-list-mode' : ''}" id="select-hub-screen">
        <div class="select-hub-bg-fx" id="select-hub-bg-fx" aria-hidden="true"></div>
        <div class="select-hub-overlay-fx" aria-hidden="true">
          <div class="select-hub-prism-veil"></div>
          <div class="select-hub-scanlines"></div>
          <div class="select-hub-noise"></div>
          <div class="select-hub-vignette"></div>
          <div class="select-hub-chroma-edge"></div>
        </div>
        ${selectHubRightDockHtml(state)}
        <div class="select-hub-title-bar">
          <img
            class="select-hub-title-logo"
            src="${state.musicSelectTitleImageSrc}"
            alt="${t('ui.songSelectTitle')}"
            draggable="false"
          />
        </div>
        <div class="song-ring-stage">
          ${songInfoPanelHtml(state)}
        </div>
        ${selectHubSongBandHtml(state)}
        ${selectHubNavHtml()}
        <input type="file" id="audio-file-input" accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.webm" hidden />
        <input type="file" id="audio-folder-input" accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.webm" webkitdirectory multiple hidden />
        <div class="random-pick-fly-layer" id="random-pick-fly-layer" aria-hidden="true"></div>
      </div>
    `;
}
