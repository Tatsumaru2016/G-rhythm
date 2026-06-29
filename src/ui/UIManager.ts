import type { ChartData, GameStats } from '../types';
import { LANE_COLORS, LANE_LABELS } from '../types';
import { CHARTS, getRank, getAccuracy } from '../data/charts';
import type { CustomSongLoader } from '../audio/CustomSongLoader';
import {
  CUSTOM_DIFFICULTIES,
  type CustomDifficulty,
} from '../audio/AutoChartGenerator';
import {
  CustomFolderEmptyError,
  filterAudioFiles,
  folderNameFromFiles,
  pickCustomAudioFile,
  pickCustomAudioFolder,
  supportsCustomMusicFilePicker,
  supportsCustomMusicFolderPicker,
} from '../audio/pickCustomAudio';
import { resolveGenre } from '../audio/musicGenre';
import {
  loadScrollSpeed, saveScrollSpeed, formatScrollSpeed,
  MIN_SCROLL_SPEED, MAX_SCROLL_SPEED,
} from '../settings/scrollSpeed';
import { DEFAULT_REDUCED_FLASH, loadReducedFlash, saveReducedFlash } from '../settings/reducedFlash';
import {
  DEFAULT_STAGE_FX_PATTERN,
  loadStageFxPattern,
  normalizeStageFxPattern,
  saveStageFxPattern,
  STAGE_FX_AUTO,
  STAGE_FX_PATTERN_COUNT,
} from '../settings/stageFxPattern';
import { stageFxPatternI18nKey } from '../game/stageFxPatterns';
import {
  DANCER_GROUPS,
  DEFAULT_DANCER_PREVIEW_PAIR,
  dancerModelLabel,
  type DancerModelId,
} from '../game/dancerCatalog';
import type { AudioEngine } from '../audio/AudioEngine';
import { renderFolderSongList } from './customSongList';
import { renderChartRatingHtml, renderSongChartAnalysisHtml } from './chartRadarView';
import { SelectHubBackground } from './selectHubBackground';
import { bindTooltips, updateTooltip, withTooltip } from './tooltip';
import {
  formatChartBpm,
  formatLevel,
  formatNotesCount,
  getLocale,
  onLocaleChange,
  setLocale,
  t,
  tDifficultyHint,
  tGenre,
  tJudgment,
  type Locale,
  type MessageKey,
} from '../i18n';

const ENABLE_DANCER_DEBUG = false;
const ENABLE_STAGE_FX_DEBUG = false;

type ScreenId =
  | 'title'
  | 'select'
  | 'countdown'
  | 'loading'
  | 'error'
  | 'result'
  | 'dancerPreview'
  | 'none';

type TouchZoneLayout = {
  laneStartX: number;
  laneWidth: number;
  topY: number;
  hitLineY: number;
};

export class UIManager {
  private overlay: HTMLElement;
  private touchLayer: HTMLElement;
  private playHud: HTMLElement;
  private onStart: (chart: ChartData) => void;
  private onBack: () => void;
  private onExitToSelect: () => void;
  private onExitToTitle: () => void;
  private onDancerPreviewStart: (left: DancerModelId, right: DancerModelId) => void;
  private onDancerPreviewChange: (left: DancerModelId, right: DancerModelId) => void;
  private onDancerPreviewStop: () => void;
  private customLoader: CustomSongLoader;
  private audio: AudioEngine;
  private selectedChart: ChartData | null = null;
  private lastChart: ChartData | null = null;
  private customBpm = 128;
  private customOffset = 0;
  private customDifficulty: CustomDifficulty = 'NORMAL';
  private customMusicPickerOpen = false;
  private nativeFolderPickActive = false;
  private scrollSpeed = loadScrollSpeed();
  private reducedFlash = DEFAULT_REDUCED_FLASH;
  private stageFxPattern = DEFAULT_STAGE_FX_PATTERN;
  private titleKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private titlePointerHandler: ((e: PointerEvent) => void) | null = null;
  private customRingKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private selectHubStartKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private selectHubPlayClickHandler: ((e: Event) => void) | null = null;
  private selectHubBuiltinIndex: number | null = 0;
  private selectHubTrackIndex = 0;
  private selectHubTrackLoadGen = 0;
  private screenId: ScreenId = 'none';
  private loadingMessageKey: MessageKey = 'ui.loadingModels';
  private loadingProgress: { loaded: number; total: number } | null = null;
  private backgroundLoadProgress: { loaded: number; total: number } | null = null;
  private bgLoadProgressEl: HTMLElement;
  private bgLoadProgressFill: HTMLElement;
  private bgLoadProgressLabel: HTMLElement;
  private touchLayoutGetter: (() => TouchZoneLayout) | null = null;
  private touchLayoutResizeHandler: (() => void) | null = null;
  private errorMessage = '';
  private countdownChart: ChartData | null = null;
  private resultStats: GameStats | null = null;
  private resultChart: ChartData | null = null;
  private dancerPreviewLeft: DancerModelId = DEFAULT_DANCER_PREVIEW_PAIR[0];
  private dancerPreviewRight: DancerModelId = DEFAULT_DANCER_PREVIEW_PAIR[1];
  private selectHubBg = new SelectHubBackground();

  constructor(
    overlay: HTMLElement,
    touchLayer: HTMLElement,
    playHud: HTMLElement,
    onStart: (chart: ChartData) => void,
    onBack: () => void,
    onExitToSelect: () => void,
    onExitToTitle: () => void,
    onDancerPreviewStart: (left: DancerModelId, right: DancerModelId) => void,
    onDancerPreviewChange: (left: DancerModelId, right: DancerModelId) => void,
    onDancerPreviewStop: () => void,
    customLoader: CustomSongLoader,
    audio: AudioEngine,
  ) {
    this.overlay = overlay;
    this.touchLayer = touchLayer;
    this.playHud = playHud;
    this.onStart = onStart;
    this.onBack = onBack;
    this.onExitToSelect = onExitToSelect;
    this.onExitToTitle = onExitToTitle;
    this.onDancerPreviewStart = onDancerPreviewStart;
    this.onDancerPreviewChange = onDancerPreviewChange;
    this.onDancerPreviewStop = onDancerPreviewStop;
    this.customLoader = customLoader;
    this.audio = audio;
    this.reducedFlash = loadReducedFlash();
    this.stageFxPattern = loadStageFxPattern();
    this.applyReducedFlashClass();

    this.bgLoadProgressEl = document.createElement('div');
    this.bgLoadProgressEl.id = 'bg-load-progress';
    this.bgLoadProgressEl.className = 'bg-load-progress hidden';
    this.bgLoadProgressEl.setAttribute('aria-live', 'polite');
    this.bgLoadProgressEl.innerHTML = `
      <div class="bg-load-progress-track">
        <div class="bg-load-progress-fill"></div>
      </div>
      <p class="bg-load-progress-label"></p>
    `;
    this.bgLoadProgressFill = this.bgLoadProgressEl.querySelector('.bg-load-progress-fill') as HTMLElement;
    this.bgLoadProgressLabel = this.bgLoadProgressEl.querySelector('.bg-load-progress-label') as HTMLElement;
    overlay.parentElement?.appendChild(this.bgLoadProgressEl);

    onLocaleChange(() => this.refreshScreen());
  }

  private refreshScreen(): void {
    switch (this.screenId) {
      case 'title': this.showTitle(); break;
      case 'select': this.showSelect(); break;
      case 'countdown':
        if (this.countdownChart) this.showCountdownOverlay(this.countdownChart);
        break;
      case 'loading': this.renderLoadingScreen(); break;
      case 'error': this.showError(this.errorMessage); break;
      case 'result':
        if (this.resultStats && this.resultChart) {
          this.showResult(this.resultStats, this.resultChart);
        }
        break;
      case 'dancerPreview': this.showDancerPreview(); break;
      default: break;
    }
    if (this.screenId === 'none' && !this.playHud.classList.contains('hidden')) {
      this.showNavHud('play');
    }
    this.refreshBackgroundProgressUi();
  }

  getScrollSpeed(): number {
    return this.scrollSpeed;
  }

  getReducedFlash(): boolean {
    return this.reducedFlash;
  }

  getDebugStageFxPatternOverride(): number | null {
    return this.stageFxPattern === STAGE_FX_AUTO ? null : this.stageFxPattern;
  }

  private languageControlHtml(): string {
    const locale = getLocale();
    return `
      <label class="setting-row language-row">
        <span>${t('settings.language')}</span>
        <select id="language-select" class="language-select" aria-label="${t('settings.language')}">
          <option value="ja" ${locale === 'ja' ? 'selected' : ''}>\u65e5\u672c\u8a9e</option>
          <option value="en" ${locale === 'en' ? 'selected' : ''}>English</option>
        </select>
      </label>
    `;
  }

  private bindLanguageControl(): void {
    const select = this.overlay.querySelector('#language-select') as HTMLSelectElement | null;
    select?.addEventListener('change', () => {
      const value = select.value;
      if (value === 'ja' || value === 'en') setLocale(value as Locale);
    });
  }

  private stageFxPatternControlHtml(): string {
    const options = [
      `<option value="${STAGE_FX_AUTO}"${this.stageFxPattern === STAGE_FX_AUTO ? ' selected' : ''}>${t('debug.fxAuto')}</option>`,
      ...Array.from({ length: STAGE_FX_PATTERN_COUNT }, (_, i) =>
        `<option value="${i}"${this.stageFxPattern === i ? ' selected' : ''}>${t(stageFxPatternI18nKey(i))}</option>`,
      ),
    ].join('');
    return `
      <label class="setting-row setting-row-select">
        <span>${withTooltip(t('debug.fxPattern'), t('debug.fxPatternHint'), 'has-tooltip--above')}</span>
        <select id="stage-fx-pattern-select">${options}</select>
      </label>
    `;
  }

  private playUiNavigate(): void {
    void this.audio.resume().then(() => this.audio.playUiNavigate());
  }

  private playUiSelect(): void {
    void this.audio.resume().then(() => this.audio.playUiSelect());
  }

  private playUiDecide(): void {
    void this.audio.resume().then(() => this.audio.playUiDecide());
  }

  private accessibilityNoticeHtml(): string {
    return `
      <div class="accessibility-notice" role="note">
        <p>${t('accessibility.notice')}</p>
      </div>
    `;
  }

  private panelClass(extra = ''): string {
    return `corner-panel settings-corner-panel title-settings-panel${extra ? ` ${extra}` : ''}`;
  }

  private languageCornerPanelHtml(positionClass = 'title-language-panel'): string {
    return `
      <div class="${this.panelClass(`language-corner-panel ${positionClass}`)}">
        <div class="settings-panel-body">
          ${this.languageControlHtml()}
        </div>
      </div>
    `;
  }

  private titleFlashPanelHtml(): string {
    return `
      <div class="${this.panelClass('flash-corner-panel title-flash-panel')}">
        <div class="settings-panel-body">
          ${this.flashToggleHtml()}
          ${this.accessibilityNoticeHtml()}
        </div>
      </div>
    `;
  }

  private debugCornerPanelHtml(positionClass = 'title-debug-panel'): string {
    if (!ENABLE_STAGE_FX_DEBUG) return '';
    return `
      <div class="${this.panelClass(`debug-corner-panel ${positionClass}`)}">
        <div class="settings-panel-body">
          ${this.stageFxPatternControlHtml()}
        </div>
      </div>
    `;
  }

  private titleSettingsPanelsHtml(): string {
    return `
      ${this.languageCornerPanelHtml()}
      ${this.titleFlashPanelHtml()}
      ${this.debugCornerPanelHtml()}
    `;
  }

  private flashToggleHtml(): string {
    return `
      <label class="setting-toggle">
        <input type="checkbox" id="reduced-flash-toggle" ${this.reducedFlash ? 'checked' : ''} />
        ${withTooltip(`<span>${t('settings.reducedFlash')}</span>`, t('settings.reducedFlashHint'), 'has-tooltip--above')}
      </label>
    `;
  }

  private applyReducedFlashClass(): void {
    document.body.classList.toggle('reduced-flash', this.reducedFlash);
  }

  private bindSettingsControls(): void {
    this.bindLanguageControl();

    const toggle = this.overlay.querySelector('#reduced-flash-toggle') as HTMLInputElement;
    toggle?.addEventListener('change', () => {
      this.reducedFlash = toggle.checked;
      saveReducedFlash(this.reducedFlash);
      this.applyReducedFlashClass();
      this.selectHubBg.setReducedFlash(this.reducedFlash);
    });

    const fxSelect = this.overlay.querySelector('#stage-fx-pattern-select') as HTMLSelectElement;
    fxSelect?.addEventListener('change', () => {
      this.stageFxPattern = normalizeStageFxPattern(Number(fxSelect.value));
      saveStageFxPattern(this.stageFxPattern);
    });
  }

  private scrollSpeedControlHtml(compact = false): string {
    return `
      <div class="scroll-speed-panel${compact ? ' scroll-speed-panel--compact' : ''}">
        <label class="setting-row${compact ? ' setting-row--compact' : ''}">
          <span>${withTooltip(t('settings.scrollSpeed'), t('settings.scrollSpeedHint'))}</span>
          <input type="range" id="speed-slider"
            min="${MIN_SCROLL_SPEED * 100}" max="${MAX_SCROLL_SPEED * 100}" step="5"
            value="${Math.round(this.scrollSpeed * 100)}" />
          <span class="setting-value" id="speed-value">${formatScrollSpeed(this.scrollSpeed)}</span>
        </label>
      </div>
    `;
  }

  private bindScrollSpeedControl() {
    const slider = this.overlay.querySelector('#speed-slider') as HTMLInputElement;
    slider?.addEventListener('input', () => {
      this.scrollSpeed = Number(slider.value) / 100;
      saveScrollSpeed(this.scrollSpeed);
      const el = this.overlay.querySelector('#speed-value');
      if (el) el.textContent = formatScrollSpeed(this.scrollSpeed);
    });
  }

  private unbindTitleNavigation() {
    if (this.titleKeyHandler) {
      window.removeEventListener('keydown', this.titleKeyHandler, true);
      this.titleKeyHandler = null;
    }
    if (this.titlePointerHandler) {
      this.overlay.removeEventListener('pointerdown', this.titlePointerHandler);
      this.titlePointerHandler = null;
    }
  }

  private bindTitleNavigation(goSelect: () => void) {
    this.unbindTitleNavigation();

    let gone = false;
    const navigate = () => {
      if (gone) return;
      gone = true;
      this.unbindTitleNavigation();
      this.playUiNavigate();
      goSelect();
    };

    this.titlePointerHandler = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#title-screen')) return;
      if (target.closest('.title-settings-panel, .title-dancer-preview-link')) return;
      navigate();
    };
    this.overlay.addEventListener('pointerdown', this.titlePointerHandler);

    this.titleKeyHandler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (!this.overlay.querySelector('#title-screen')) return;
      const target = e.target as HTMLElement;
      if (target.closest('.title-settings-panel input, .title-settings-panel select, .title-settings-panel textarea')) {
        return;
      }
      navigate();
    };
    window.addEventListener('keydown', this.titleKeyHandler, true);
  }

  showTitle() {
    this.screenId = 'title';
    const titleImage = `${import.meta.env.BASE_URL}images/title.png`;
    const dancerLink = ENABLE_DANCER_DEBUG
      ? `<a href="#" class="title-dancer-preview-link" id="btn-dancer-preview">${t('debug.dancerPreviewLink')}</a>`
      : '';
    this.render(`
      <div class="screen title-screen" id="title-screen">
        <img class="title-hero" src="${titleImage}" alt="G.RHYTHM" />
        ${this.titleSettingsPanelsHtml()}
        ${dancerLink}
        <p class="title-press-start" role="status">${t('ui.pressAnyKey')}</p>
      </div>
    `);

    this.bindSettingsControls();
    this.overlay.querySelector('#btn-dancer-preview')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.playUiNavigate();
      this.showDancerPreview();
    });
    this.bindTitleNavigation(() => this.showSelect());
    this.stopSelectHubBackground();
    this.hidePlayHud();
  }

  private dancerModelOptionsHtml(selected: DancerModelId): string {
    return DANCER_GROUPS.map((group) => `
      <optgroup label="${t(group.labelKey)}">
        ${group.models.map((id) => `
          <option value="${id}"${id === selected ? ' selected' : ''}>${dancerModelLabel(id)}</option>
        `).join('')}
      </optgroup>
    `).join('');
  }

  showDancerPreview() {
    this.screenId = 'dancerPreview';
    this.hidePlayHud();
    this.unbindTitleNavigation();
    this.overlay.classList.remove('hidden');
    this.onDancerPreviewStart(this.dancerPreviewLeft, this.dancerPreviewRight);
    this.render(`
      <div class="screen dancer-preview-screen" id="dancer-preview-screen">
        <div class="dancer-preview-panel">
          <h2 class="dancer-preview-title">${t('debug.dancerPreviewTitle')}</h2>
          <p class="dancer-preview-hint">${t('debug.dancerPreviewHint')}<br />${t('debug.dancerPerfectTierHint')}</p>
          <div class="dancer-preview-selectors">
            <label class="setting-row dancer-preview-row">
              <span>${t('debug.dancerLeft')}</span>
              <select id="dancer-preview-left" class="dancer-preview-select">
                ${this.dancerModelOptionsHtml(this.dancerPreviewLeft)}
              </select>
            </label>
            <label class="setting-row dancer-preview-row">
              <span>${t('debug.dancerRight')}</span>
              <select id="dancer-preview-right" class="dancer-preview-select">
                ${this.dancerModelOptionsHtml(this.dancerPreviewRight)}
              </select>
            </label>
          </div>
          <button type="button" class="btn btn-secondary" id="btn-dancer-preview-back">${t('ui.title')}</button>
        </div>
      </div>
    `);
    this.bindDancerPreviewControls();
  }

  private bindDancerPreviewControls(): void {
    const leftSelect = this.overlay.querySelector('#dancer-preview-left') as HTMLSelectElement | null;
    const rightSelect = this.overlay.querySelector('#dancer-preview-right') as HTMLSelectElement | null;

    const applySelection = () => {
      const left = (leftSelect?.value ?? this.dancerPreviewLeft) as DancerModelId;
      const right = (rightSelect?.value ?? this.dancerPreviewRight) as DancerModelId;
      this.dancerPreviewLeft = left;
      this.dancerPreviewRight = right;
      this.onDancerPreviewChange(left, right);
    };

    leftSelect?.addEventListener('change', applySelection);
    rightSelect?.addEventListener('change', applySelection);

    this.overlay.querySelector('#btn-dancer-preview-back')?.addEventListener('click', () => {
      this.playUiNavigate();
      this.onDancerPreviewStop();
      this.showTitle();
    });
  }

  private formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  private folderDpadHudHtml(): string {
    return `
      <aside class="folder-dpad-hud" id="select-hub-dpad" aria-label="${t('ui.folderDpadTitle')}">
        <p class="folder-dpad-title">${t('ui.folderDpadTitle')}</p>
        <div class="folder-dpad" id="folder-dpad">
          <div class="folder-dpad-cell folder-dpad-cell--up">
            <button type="button" class="folder-dpad-btn" id="ring-prev" aria-label="${t('ui.ringPrev')}">\u25b2</button>
            <span class="folder-dpad-label">${t('ui.ringPrev')}</span>
          </div>
          <div class="folder-dpad-row">
            <div class="folder-dpad-cell folder-dpad-cell--left">
              <button type="button" class="folder-dpad-btn" id="ring-first" aria-label="${t('ui.ringFirst')}">\u25c0</button>
              <span class="folder-dpad-label">${t('ui.ringFirst')}</span>
            </div>
            <div class="folder-dpad-core" aria-hidden="true"></div>
            <div class="folder-dpad-cell folder-dpad-cell--right">
              <button type="button" class="folder-dpad-btn" id="ring-last" aria-label="${t('ui.ringLast')}">\u25b6</button>
              <span class="folder-dpad-label">${t('ui.ringLast')}</span>
            </div>
          </div>
          <div class="folder-dpad-cell folder-dpad-cell--down">
            <button type="button" class="folder-dpad-btn" id="ring-next" aria-label="${t('ui.ringNext')}">\u25bc</button>
            <span class="folder-dpad-label">${t('ui.ringNext')}</span>
          </div>
        </div>
        <p class="folder-dpad-hint">${t('ui.ringKeyboardHint')}</p>
      </aside>
    `;
  }

  private selectHubCustomPanelHtml(): string {
    const selected = this.selectHubBuiltinIndex === null;
    return `
      <div
        class="select-hub-custom-panel${selected ? ' is-selected' : ''}"
        id="select-hub-custom-panel"
      >
        <span class="select-hub-builtin-diff custom">${t('ui.custom')}</span>
        <span class="select-hub-custom-title">${t('ui.yourMusic')}</span>
        <div class="select-hub-custom-imports">
          <button type="button" class="select-hub-import-btn" id="btn-hub-import-folder" aria-label="${t('ui.customImportFolder')}">
            <svg class="select-hub-import-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
          </button>
          <button type="button" class="select-hub-import-btn" id="btn-hub-import-file" aria-label="${t('ui.customImportSingle')}">
            <svg class="select-hub-import-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  private selectHubLeftRailHtml(): string {
    return `
      <aside class="select-hub-left-rail" aria-label="${t('ui.selectSongList')}">
        <div class="select-hub-rail-top">
          ${this.selectHubBuiltinCardsHtml()}
        </div>
      </aside>
    `;
  }

  private selectHubRightRailHtml(): string {
    return `
      <aside class="select-hub-right-rail" aria-label="${t('ui.selectSongList')}">
        <div class="select-hub-right-custom">
          ${this.selectHubCustomPanelHtml()}
        </div>
        <div class="select-hub-right-list" id="folder-song-list">
          <div class="folder-song-list-track" id="folder-song-list-track"></div>
        </div>
      </aside>
    `;
  }

  private selectHubBuiltinCardsHtml(): string {
    return CHARTS.map((chart, i) => `
      <button
        type="button"
        class="select-hub-builtin-card${this.selectHubBuiltinIndex === i ? ' is-selected' : ''}"
        data-builtin-index="${i}"
        style="--accent:${LANE_COLORS[i % 4]}"
      >
        <span class="select-hub-builtin-stars">${renderChartRatingHtml(chart, 'card')}</span>
        <span class="select-hub-builtin-title">${this.escapeHtml(chart.title)}</span>
        <span class="select-hub-builtin-meta">${formatChartBpm(chart.bpm)} \u00b7 ${formatNotesCount(chart.notes.length)}</span>
      </button>
    `).join('');
  }

  private customDifficultyOptionsHtml(): string {
    return CUSTOM_DIFFICULTIES.map((d) => `
      <button type="button" class="difficulty-option ${d.toLowerCase()}${d === this.customDifficulty ? ' selected' : ''}"
        data-diff="${d}" aria-pressed="${d === this.customDifficulty}">
        ${d}
      </button>
    `).join('');
  }

  private customDifficultyPanelHtml(): string {
    return `
      <div class="difficulty-picker difficulty-picker--compact">
        <p class="difficulty-picker-label" id="difficulty-label">
          ${withTooltip(t('ui.difficulty'), tDifficultyHint(this.customDifficulty), 'has-tooltip--above')}
        </p>
        <div class="difficulty-options" role="radiogroup" aria-label="${t('ui.difficulty')}">
          ${this.customDifficultyOptionsHtml()}
        </div>
      </div>
    `;
  }

  private customBpmOffsetRowHtml(): string {
    return `
      <div class="custom-tuning-inline">
        <label class="setting-row setting-row--inline">
          <span>${t('ui.bpmLabel')}</span>
          <input type="range" id="bpm-slider" min="80" max="200" value="${this.customBpm}" />
          <span class="setting-value" id="bpm-value">${this.customBpm}</span>
        </label>
        <label class="setting-row setting-row--inline">
          <span>${t('settings.offset')}</span>
          <input type="range" id="offset-slider" min="0" max="3" step="0.1" value="${this.customOffset}" />
          <span class="setting-value" id="offset-value">${this.customOffset.toFixed(1)}</span>
        </label>
      </div>
    `;
  }

  private customFolderSettingsHtml(): string {
    return this.scrollSpeedControlHtml(true);
  }

  private selectHubDifficultyDockHtml(): string {
    return `
      <div class="select-hub-tuning-panel" id="select-hub-tuning-panel">
        <p class="select-hub-tuning-panel-label">${t('ui.playSettings')}</p>
        ${this.customDifficultyPanelHtml()}
        ${this.customBpmOffsetRowHtml()}
        ${this.customFolderSettingsHtml()}
      </div>
    `;
  }

  private songPreviewStateHtml(id?: string): string {
    const idAttr = id ? ` id="${id}"` : '';
    return `
      <span class="song-preview-state"${idAttr} title="${t('ui.previewToggle')}">
        <span class="song-preview-icon song-preview-icon--on">
          <span class="song-preview-note" aria-hidden="true">\u266a</span>
          <span class="song-preview-label">ON</span>
        </span>
        <span class="song-preview-icon song-preview-icon--off">
          <span class="song-preview-note" aria-hidden="true">\u266a</span>
          <span class="song-preview-label">OFF</span>
        </span>
      </span>
    `;
  }

  private songRingCenterHtml(): string {
    const catalog = this.customLoader.getCatalog();
    const isBuiltin = this.selectHubBuiltinIndex !== null;
    const chart = isBuiltin
      ? CHARTS[this.selectHubBuiltinIndex!]
      : this.selectedChart;
    const title = isBuiltin && chart
      ? chart.title
      : catalog[this.selectHubTrackIndex]?.title ?? '';
    const ratingHtml = renderChartRatingHtml(chart);
    return `
      ${this.songPreviewStateHtml('song-ring-preview-state')}
      <div class="song-detail-top">
        <p class="song-ring-counter" id="ring-track-counter"></p>
        <h2 class="ready-title" id="ring-center-title" title="${this.escapeHtml(title)}">${this.escapeHtml(title)}</h2>
        <p class="ready-artist" id="ring-center-meta"></p>
        <p class="ready-stats" id="ring-center-stats">\u2014</p>
      </div>
      <div class="song-detail-bottom">
        ${ratingHtml}
      </div>
    `;
  }

  private shouldShowFolderSongList(): boolean {
    return this.customLoader.isFolderMode() && this.customLoader.getCatalog().length > 1;
  }

  showSelect() {
    this.screenId = 'select';
    this.unbindTitleNavigation();
    this.unbindCustomRingNavigation();
    this.unbindSelectHubStart();
    this.stopSelectHubBackground();
    this.audio.stopPreviewPlayback();

    const selectImage = `${import.meta.env.BASE_URL}images/select.png`;
    const isBuiltin = this.selectHubBuiltinIndex !== null;
    const folderListMode = !isBuiltin && this.shouldShowFolderSongList();

    this.render(`
      <div class="screen select-hub-screen custom-folder-screen${isBuiltin ? ' is-builtin-mode' : ''}${folderListMode ? ' is-folder-list-mode' : ''}" id="select-hub-screen">
        <div class="select-hub-bg-fx" id="select-hub-bg-fx" aria-hidden="true"></div>
        <img class="select-hero custom-folder-hero" src="${selectImage}" alt="" />
        <h2 class="select-hub-title-text">${t('ui.songSelectTitle')}</h2>
        ${this.selectHubLeftRailHtml()}
        ${this.selectHubRightRailHtml()}
        <div class="song-ring-stage">
          <div class="song-ring-layout">
            <div
              class="song-ring-center${folderListMode ? ' folder-song-detail' : ''}"
              id="song-ring-center"
              role="button"
              tabindex="0"
              aria-pressed="false"
              aria-label="${t('ui.previewToggle')}"
            >
              ${this.songRingCenterHtml()}
            </div>
            <div class="song-chart-radar-gap" aria-hidden="true"></div>
            <div class="song-chart-radar-offset">
              <div class="song-chart-radar-panel" id="song-chart-radar" aria-hidden="true"></div>
            </div>
          </div>
        </div>
        <div class="select-hub-difficulty-dock">
          ${this.selectHubDifficultyDockHtml()}
        </div>
        ${this.selectHubNavHtml()}
        <input type="file" id="audio-file-input" accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.webm" hidden />
        <input type="file" id="audio-folder-input" accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.webm" webkitdirectory multiple hidden />
      </div>
    `);

    this.bindSelectHub();
    this.mountSelectHubBackground();
    this.hidePlayHud();
  }

  private selectHubNavHtml(): string {
    return `
      <nav class="select-hub-nav-fx" aria-label="${t('ui.songSelectTitle')}">
        <button type="button" class="btn-select-nav-back" id="btn-goto-title" aria-label="${t('ui.title')}">
          <svg class="btn-select-nav-back-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button type="button" class="btn-select-start" id="btn-select-start" aria-label="${t('ui.play')}">${t('ui.play')}</button>
      </nav>
    `;
  }

  private mountSelectHubBackground(): void {
    const host = this.overlay.querySelector('#select-hub-bg-fx');
    if (!host) {
      this.selectHubBg.unmount();
      return;
    }
    this.selectHubBg.setReducedFlash(this.reducedFlash);
    this.selectHubBg.mount(host as HTMLElement);
  }

  private stopSelectHubBackground(): void {
    this.selectHubBg.unmount();
  }

  private bindSelectHub(): void {
    const fileInput = this.overlay.querySelector('#audio-file-input') as HTMLInputElement;
    const folderInput = this.overlay.querySelector('#audio-folder-input') as HTMLInputElement;

    this.overlay.querySelectorAll('.select-hub-builtin-card').forEach((card) => {
      card.addEventListener('click', () => {
        const index = Number((card as HTMLElement).dataset.builtinIndex);
        if (Number.isNaN(index)) return;
        this.selectSelectHubBuiltin(index);
      });
    });

    const customPanel = this.overlay.querySelector('#select-hub-custom-panel');
    customPanel?.addEventListener('click', (e) => {
      if ((e.target as Element).closest('.select-hub-import-btn')) return;
      this.selectSelectHubCustom();
    });

    this.overlay.querySelector('#btn-hub-import-file')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.playUiSelect();
      void this.openSingleCustomMusic(fileInput);
    });
    this.overlay.querySelector('#btn-hub-import-folder')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.playUiSelect();
      void this.openFolderCustomMusic(folderInput);
    });

    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) void this.handleCustomFile(file);
      fileInput.value = '';
    });
    folderInput?.addEventListener('change', () => {
      if (this.nativeFolderPickActive) {
        folderInput.value = '';
        return;
      }
      const files = folderInput.files ? Array.from(folderInput.files) : [];
      if (files.length > 0) this.applyCustomFolder(files, folderNameFromFiles(files));
      folderInput.value = '';
    });

    const catalog = this.customLoader.getCatalog();
    if (this.customLoader.isFolderMode() && catalog.length > 0) {
      this.selectHubBuiltinIndex = null;
      this.customLoader.setSelectedIndex(this.selectHubTrackIndex);
      this.refreshSelectHubSongList();
      this.bindSelectHubRing();
      void this.loadSelectHubTrack(this.selectHubTrackIndex);
    } else if (this.customLoader.getImportMode() === 'single' && this.customLoader.getBuffer()) {
      this.selectHubBuiltinIndex = null;
      this.refreshSelectHubSidebarSelection();
      this.syncSelectHubBuiltinModeClass();
      const chart = this.customLoader.buildChart(this.customBpm, this.customOffset, this.customDifficulty);
      this.selectedChart = chart;
      this.updateSelectHubCenterFromChart(chart, chart.title, chart.audioDuration ?? 0);
      this.refreshSelectHubRing();
      this.bindPreviewToggle(
        this.overlay.querySelector('#song-ring-center'),
        () => this.isSelectHubRingLoading(),
      );
      if (this.audio.isPreviewEnabled()) {
        void this.audio.startUserPreview();
      }
    } else {
      const index = this.selectHubBuiltinIndex ?? 0;
      this.selectSelectHubBuiltin(index, false);
    }

    this.bindSelectHubStart();
    this.bindSelectHubDifficultyDock();
    this.bindSelectHubNav();
  }

  private bindSelectHubNav(): void {
    this.overlay.querySelector('#btn-goto-title')?.addEventListener('click', () => {
      this.playUiNavigate();
      this.customLoader.clear();
      this.selectHubBuiltinIndex = 0;
      this.showTitle();
    });
  }

  private bindSelectHubDifficultyDock(): void {
    const updateChart = () => {
      if (this.selectHubBuiltinIndex !== null) {
        const chart = CHARTS[this.selectHubBuiltinIndex];
        this.selectedChart = chart;
        this.updateSelectHubCenterFromChart(chart, chart.title, chart.audioDuration ?? 0);
        return;
      }
      const c = this.customLoader.buildChart(this.customBpm, this.customOffset, this.customDifficulty);
      this.selectedChart = c;
      const entry = this.customLoader.getCatalog()[this.customLoader.getSelectedIndex()];
      this.updateSelectHubCenterFromChart(c, entry?.title ?? c.title, c.audioDuration ?? 0);
      updateTooltip(this.overlay, '#difficulty-label .has-tooltip', tDifficultyHint(this.customDifficulty));
    };

    const bpmSlider = this.overlay.querySelector('#bpm-slider') as HTMLInputElement;
    const offsetSlider = this.overlay.querySelector('#offset-slider') as HTMLInputElement;

    bpmSlider?.addEventListener('input', () => {
      this.customBpm = Number(bpmSlider.value);
      const el = this.overlay.querySelector('#bpm-value');
      if (el) el.textContent = String(this.customBpm);
      updateChart();
    });

    offsetSlider?.addEventListener('input', () => {
      this.customOffset = Number(offsetSlider.value);
      const el = this.overlay.querySelector('#offset-value');
      if (el) el.textContent = this.customOffset.toFixed(1);
      updateChart();
    });

    this.overlay.querySelectorAll('.difficulty-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        const diff = (btn as HTMLElement).dataset.diff as CustomDifficulty;
        if (!diff || diff === this.customDifficulty) return;
        this.playUiSelect();
        this.customDifficulty = diff;
        this.overlay.querySelectorAll('.difficulty-option').forEach((el) => {
          const active = (el as HTMLElement).dataset.diff === diff;
          el.classList.toggle('selected', active);
          el.setAttribute('aria-pressed', String(active));
        });
        updateChart();
      });
    });

    this.bindScrollSpeedControl();
    updateChart();
  }

  private startSelectedChart(): void {
    if (this.screenId !== 'select') return;
    if (this.isSelectHubRingLoading()) return;

    let chart = this.selectedChart;
    if (this.selectHubBuiltinIndex !== null) {
      chart = CHARTS[this.selectHubBuiltinIndex];
    } else if (this.customLoader.getBuffer()) {
      chart = this.customLoader.buildChart(this.customBpm, this.customOffset, this.customDifficulty);
    }
    if (!chart || chart.notes.length === 0) return;

    this.selectedChart = chart;
    this.playUiDecide();
    if (this.selectHubBuiltinIndex !== null) {
      this.customLoader.clear();
    }
    this.unbindCustomRingNavigation();
    this.unbindSelectHubStart();
    this.audio.stopUserPreview();
    this.onStart(chart);
  }

  private unbindSelectHubStart(): void {
    if (this.selectHubStartKeyHandler) {
      window.removeEventListener('keydown', this.selectHubStartKeyHandler, true);
      this.selectHubStartKeyHandler = null;
    }
    if (this.selectHubPlayClickHandler) {
      this.overlay.querySelector('#btn-select-start')
        ?.removeEventListener('click', this.selectHubPlayClickHandler);
      this.selectHubPlayClickHandler = null;
    }
  }

  private bindSelectHubStart(): void {
    this.unbindSelectHubStart();
    this.selectHubStartKeyHandler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (this.screenId !== 'select') return;
      if (!this.overlay.querySelector('#select-hub-screen')) return;
      if (e.key !== 'Enter') return;
      const target = e.target as HTMLElement;
      if (target.closest('#btn-select-start')) {
        e.preventDefault();
        void this.startSelectedChart();
        return;
      }
      if (target.closest('input, select, textarea, button, .select-hub-import-btn')) return;
      e.preventDefault();
      void this.startSelectedChart();
    };
    window.addEventListener('keydown', this.selectHubStartKeyHandler, true);

    const playBtn = this.overlay.querySelector('#btn-select-start');
    if (playBtn) {
      this.selectHubPlayClickHandler = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        void this.startSelectedChart();
      };
      playBtn.addEventListener('click', this.selectHubPlayClickHandler);
    }

    const center = this.overlay.querySelector('#song-ring-center');
    center?.addEventListener('dblclick', () => {
      void this.startSelectedChart();
    });
  }

  private bindSelectHubFolderNav(): void {
    const jump = (index: number) => {
      void this.loadSelectHubTrack(index);
    };
    const rotate = (delta: number) => {
      const tracks = this.customLoader.getCatalog();
      if (tracks.length <= 1) return;
      this.playUiNavigate();
      const current = this.customLoader.getSelectedIndex();
      const next = (current + delta + tracks.length) % tracks.length;
      void this.loadSelectHubTrack(next);
    };

    this.bindCustomRingNavigation(
      () => jump(0),
      () => rotate(-1),
      () => rotate(1),
      () => {
        const tracks = this.customLoader.getCatalog();
        if (tracks.length > 0) jump(tracks.length - 1);
      },
    );

    this.bindSelectHubSongList();

    this.bindPreviewToggle(
      this.overlay.querySelector('#song-ring-center'),
      () => this.isSelectHubRingLoading(),
    );
  }

  private bindSelectHubRing(): void {
    this.bindSelectHubFolderNav();
  }

  private selectSelectHubCustom(playSound = true): void {
    if (this.selectHubBuiltinIndex === null && playSound) {
      const hasCustom = this.customLoader.isFolderMode()
        ? this.customLoader.getCatalog().length > 0
        : this.customLoader.getBuffer() !== null;
      if (!hasCustom) return;
    }

    if (playSound) this.playUiSelect();
    const wasBuiltin = this.selectHubBuiltinIndex !== null;
    this.selectHubBuiltinIndex = null;
    if (wasBuiltin) this.audio.stopPreviewPlayback();

    this.refreshSelectHubSidebarSelection();
    this.syncSelectHubBuiltinModeClass();
    this.refreshSelectHubRing();

    const catalog = this.customLoader.getCatalog();
    if (this.customLoader.isFolderMode() && catalog.length > 0) {
      const chart = this.customLoader.buildChart(this.customBpm, this.customOffset, this.customDifficulty);
      this.selectedChart = chart;
      const entry = catalog[this.customLoader.getSelectedIndex()];
      this.updateSelectHubCenterFromChart(chart, entry?.title ?? chart.title, chart.audioDuration ?? 0);
      this.bindPreviewToggle(
        this.overlay.querySelector('#song-ring-center'),
        () => this.isSelectHubRingLoading(),
      );
      if (this.audio.isPreviewEnabled() && this.customLoader.getBuffer()) {
        void this.audio.startUserPreview();
      }
      return;
    }

    if (this.customLoader.getImportMode() === 'single' && this.customLoader.getBuffer()) {
      const chart = this.customLoader.buildChart(this.customBpm, this.customOffset, this.customDifficulty);
      this.selectedChart = chart;
      this.updateSelectHubCenterFromChart(chart, chart.title, chart.audioDuration ?? 0);
      this.bindPreviewToggle(
        this.overlay.querySelector('#song-ring-center'),
        () => this.isSelectHubRingLoading(),
      );
      if (this.audio.isPreviewEnabled()) {
        void this.audio.startUserPreview();
      }
      return;
    }

    this.selectedChart = null;
    this.updateSelectHubEmptyCustomCenter();
    this.bindPreviewToggle(
      this.overlay.querySelector('#song-ring-center'),
      () => false,
    );
  }

  private formatSelectHubStatsLine(chart: ChartData): string {
    return [
      formatChartBpm(chart.bpm),
      formatNotesCount(chart.notes.length),
      tGenre(resolveGenre(chart)),
    ].join(' \u00b7 ');
  }

  private setRingCenterTitle(title: string): void {
    const titleEl = this.overlay.querySelector('#ring-center-title');
    if (!titleEl) return;
    titleEl.textContent = title;
    titleEl.setAttribute('title', title);
  }

  private updateSelectHubEmptyCustomCenter(): void {
    const metaEl = this.overlay.querySelector('#ring-center-meta');
    const statsEl = this.overlay.querySelector('#ring-center-stats');
    const counterEl = this.overlay.querySelector('#ring-track-counter');

    this.setRingCenterTitle(t('ui.yourMusic'));
    if (metaEl) metaEl.textContent = t('ui.customImportHint');
    if (statsEl) statsEl.textContent = '\u2014';
    if (counterEl) counterEl.textContent = '';
    this.updateSelectHubChartAnalysis(null);
    this.syncPreviewToggleState(this.overlay.querySelector('#song-ring-center'), false);
  }

  private updateSelectHubChartAnalysis(chart: ChartData | null): void {
    const { ratingHtml, radarHtml } = renderSongChartAnalysisHtml(chart, { largeRadar: true });
    const ratingEl = this.overlay.querySelector('#song-chart-rating');
    const radarEl = this.overlay.querySelector('#song-chart-radar');
    if (ratingEl) ratingEl.outerHTML = ratingHtml;
    if (radarEl) {
      const radarPanel = radarEl as HTMLElement;
      radarPanel.innerHTML = radarHtml;
      radarPanel.setAttribute('aria-hidden', chart && chart.notes.length > 0 ? 'false' : 'true');
      if (chart?.id) radarPanel.dataset.chartId = chart.id;
      else delete radarPanel.dataset.chartId;
    }
    this.refreshSelectHubBuiltinCardRatings();
  }

  private refreshSelectHubBuiltinCardRatings(): void {
    this.overlay.querySelectorAll('.select-hub-builtin-card').forEach((card) => {
      const index = Number((card as HTMLElement).dataset.builtinIndex);
      if (Number.isNaN(index)) return;
      const chart = CHARTS[index];
      if (!chart) return;
      const starsEl = card.querySelector('.select-hub-builtin-stars');
      if (starsEl) starsEl.innerHTML = renderChartRatingHtml(chart, 'card');
    });
  }

  private selectSelectHubBuiltin(index: number, playSound = true): void {
    if (playSound) this.playUiSelect();
    this.selectHubBuiltinIndex = index;
    this.audio.stopPreviewPlayback();
    this.customLoader.clear();
    const chart = CHARTS[index];
    this.selectedChart = chart;
    this.refreshSelectHubSidebarSelection();
    this.syncSelectHubBuiltinModeClass();
    this.refreshSelectHubRing();
    this.updateSelectHubCenterFromChart(chart, chart.title, chart.audioDuration ?? 0);
    this.bindPreviewToggle(
      this.overlay.querySelector('#song-ring-center'),
      () => false,
    );
  }

  private refreshSelectHubSidebarSelection(): void {
    this.overlay.querySelectorAll('.select-hub-builtin-card').forEach((card) => {
      const index = Number((card as HTMLElement).dataset.builtinIndex);
      card.classList.toggle('is-selected', index === this.selectHubBuiltinIndex);
    });
    const customPanel = this.overlay.querySelector('#select-hub-custom-panel');
    customPanel?.classList.toggle('is-selected', this.selectHubBuiltinIndex === null);
  }

  private syncSelectHubBuiltinModeClass(): void {
    this.overlay.querySelector('#select-hub-screen')?.classList.toggle(
      'is-builtin-mode',
      this.selectHubBuiltinIndex !== null,
    );
  }

  private refreshSelectHubSongList(): void {
    const track = this.overlay.querySelector('#folder-song-list-track');
    if (!track) return;
    if (this.selectHubBuiltinIndex !== null || !this.shouldShowFolderSongList()) {
      track.innerHTML = '';
      return;
    }
    const catalog = this.customLoader.getCatalog();
    const selected = this.customLoader.getSelectedIndex();
    track.innerHTML = renderFolderSongList(catalog, selected);
    const selectedEl = track.querySelector('.folder-song-item.is-selected');
    selectedEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  private bindSelectHubSongList(): void {
    const track = this.overlay.querySelector('#folder-song-list-track');
    if (!track || track.dataset.listBound === '1') return;
    track.dataset.listBound = '1';
    track.addEventListener('click', (e) => {
      const btn = (e.target as Element).closest('.folder-song-item');
      if (!btn) return;
      const index = Number((btn as HTMLElement).dataset.listIndex);
      if (Number.isNaN(index)) return;
      if (index === this.customLoader.getSelectedIndex()) return;
      this.playUiSelect();
      void this.loadSelectHubTrack(index);
    });
  }

  private refreshSelectHubRing(): void {
    this.refreshSelectHubSongList();
  }

  private updateSelectHubDpadEnabled(): void {
    /* control panel removed */
  }

  private isSelectHubRingLoading(): boolean {
    if (this.overlay.querySelector('#folder-song-list-track')) {
      return this.overlay.querySelector('.folder-song-item.is-selected.is-loading') !== null;
    }
    return this.overlay.querySelector('#select-hub-screen')?.classList.contains('is-loading-track') ?? false;
  }

  private setSelectHubTrackItemLoading(loading: boolean): void {
    this.overlay.querySelector('.folder-song-item.is-selected')?.classList.toggle('is-loading', loading);
  }

  private setSelectHubRingLoading(loading: boolean): void {
    if (this.overlay.querySelector('#folder-song-list-track')) {
      this.setSelectHubTrackItemLoading(loading);
      const center = this.overlay.querySelector('#song-ring-center');
      if (loading) {
        center?.classList.add('is-preview-loading');
      } else {
        this.syncPreviewToggleState(center, false);
      }
      this.updateSelectHubDpadEnabled();
      return;
    }
    this.overlay.querySelector('#select-hub-screen')?.classList.toggle('is-loading-track', loading);
    const center = this.overlay.querySelector('#song-ring-center');
    this.syncPreviewToggleState(center, loading);
    this.updateSelectHubDpadEnabled();
  }

  private updateSelectHubCenterFromChart(chart: ChartData, title: string, duration: number): void {
    const catalog = this.customLoader.getCatalog();
    const isBuiltin = this.selectHubBuiltinIndex !== null;
    const metaEl = this.overlay.querySelector('#ring-center-meta');
    const statsEl = this.overlay.querySelector('#ring-center-stats');
    const counterEl = this.overlay.querySelector('#ring-track-counter');

    this.setRingCenterTitle(title);
    if (metaEl) {
      if (isBuiltin) {
        metaEl.textContent = chart.artist ?? '';
      } else if (duration > 0) {
        metaEl.textContent = `${t('ui.customTrack')} \u00b7 ${this.formatDuration(duration)}`;
      } else {
        metaEl.textContent = t('ui.customTrack');
      }
    }
    if (statsEl) statsEl.textContent = this.formatSelectHubStatsLine(chart);
    if (counterEl) {
      if (!isBuiltin && catalog.length > 1) {
        const idx = this.customLoader.getSelectedIndex();
        counterEl.textContent = t('ui.customFolderTrack', {
          current: idx + 1,
          total: catalog.length,
        });
      } else {
        counterEl.textContent = '';
      }
    }
    this.updateSelectHubChartAnalysis(chart);
    this.syncPreviewToggleState(this.overlay.querySelector('#song-ring-center'), this.isSelectHubRingLoading());
  }

  private async loadSelectHubTrack(index: number, options?: { silent?: boolean }): Promise<void> {
    const silent = options?.silent ?? this.customLoader.getCatalog().length <= 1;
    const gen = ++this.selectHubTrackLoadGen;
    this.selectHubTrackIndex = index;
    this.selectHubBuiltinIndex = null;
    this.customLoader.setSelectedIndex(index);
    this.syncSelectHubBuiltinModeClass();
    this.refreshSelectHubSidebarSelection();
    this.refreshSelectHubSongList();

    const catalog = this.customLoader.getCatalog();
    const entry = catalog[index];
    if (entry) {
      this.setRingCenterTitle(entry.title);
      const counterEl = this.overlay.querySelector('#ring-track-counter');
      if (counterEl && catalog.length > 1) {
        counterEl.textContent = t('ui.customFolderTrack', {
          current: index + 1,
          total: catalog.length,
        });
      }
    }

    if (!silent) {
      this.setSelectHubRingLoading(true);
    }

    try {
      const meta = await this.customLoader.selectTrack(index);
      if (gen !== this.selectHubTrackLoadGen) return;

      this.customBpm = meta.suggestedBpm;
      this.customOffset = 0;
      const bpmSlider = this.overlay.querySelector('#bpm-slider') as HTMLInputElement | null;
      const bpmValue = this.overlay.querySelector('#bpm-value');
      if (bpmSlider) bpmSlider.value = String(this.customBpm);
      if (bpmValue) bpmValue.textContent = String(this.customBpm);
      const offsetSlider = this.overlay.querySelector('#offset-slider') as HTMLInputElement | null;
      const offsetValue = this.overlay.querySelector('#offset-value');
      if (offsetSlider) offsetSlider.value = String(this.customOffset);
      if (offsetValue) offsetValue.textContent = this.customOffset.toFixed(1);

      const chart = this.customLoader.buildChart(this.customBpm, this.customOffset, this.customDifficulty);
      this.selectedChart = chart;
      this.updateSelectHubCenterFromChart(chart, meta.title, meta.duration);

      if (this.audio.isPreviewEnabled()) {
        await this.audio.startUserPreview();
        if (gen !== this.selectHubTrackLoadGen) return;
        this.syncPreviewToggleState(this.overlay.querySelector('#song-ring-center'), false);
      }
    } catch (err) {
      if (gen !== this.selectHubTrackLoadGen) return;
      console.error(err);
      if (this.customLoader.isFolderMode() && this.customLoader.getCatalog().length > 0) {
        const metaEl = this.overlay.querySelector('#ring-center-meta');
        if (metaEl) metaEl.textContent = t('ui.errorLoadFile');
        return;
      }
      this.showImportError(t('ui.errorLoadFile'));
    } finally {
      if (gen === this.selectHubTrackLoadGen && !silent) {
        this.setSelectHubRingLoading(false);
      }
    }
  }

  private bindPreviewToggle(
    trigger: Element | null,
    isLoading: () => boolean,
  ): void {
    if (!trigger) return;
    const toggle = async () => {
      if (isLoading()) return;
      await this.audio.toggleUserPreview();
      this.syncPreviewToggleState(trigger, isLoading());
    };
    trigger.addEventListener('click', () => { void toggle(); });
    trigger.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        void toggle();
      }
    });
    this.syncPreviewToggleState(trigger, isLoading());
  }

  private syncPreviewToggleState(el: Element | null, loading: boolean): void {
    if (!el) return;
    el.classList.toggle('is-preview-loading', loading);
    if (loading) return;
    const enabled = this.audio.isPreviewEnabled();
    el.classList.toggle('is-preview-playing', enabled);
    el.classList.toggle('is-preview-paused', !enabled);
    el.setAttribute('aria-pressed', String(enabled));
  }

  private unbindCustomRingNavigation(): void {
    if (this.customRingKeyHandler) {
      window.removeEventListener('keydown', this.customRingKeyHandler, true);
      this.customRingKeyHandler = null;
    }
  }

  private bindCustomRingNavigation(
    onFirst: () => void,
    onPrev: () => void,
    onNext: () => void,
    onLast: () => void,
  ): void {
    this.unbindCustomRingNavigation();
    this.customRingKeyHandler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (this.screenId !== 'select') return;
      if (!this.overlay.querySelector('.select-hub-screen')) return;
      if (this.selectHubBuiltinIndex !== null) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, select, textarea, button')) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        onNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onFirst();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onLast();
      }
    };
    window.addEventListener('keydown', this.customRingKeyHandler, true);
  }

  private async openSingleCustomMusic(fileInput: HTMLInputElement | null) {
    if (this.customMusicPickerOpen) return;
    this.customMusicPickerOpen = true;

    try {
      if (supportsCustomMusicFilePicker()) {
        try {
          const file = await pickCustomAudioFile();
          if (file) await this.handleCustomFile(file);
        } catch (err) {
          console.error(err);
          this.showImportError(t('ui.errorOpenFile'));
        }
        return;
      }

      fileInput?.click();
    } finally {
      this.customMusicPickerOpen = false;
    }
  }

  private async openFolderCustomMusic(folderInput: HTMLInputElement | null) {
    if (this.customMusicPickerOpen) return;
    this.customMusicPickerOpen = true;

    try {
      if (supportsCustomMusicFolderPicker()) {
        this.nativeFolderPickActive = true;
        try {
          const pick = await pickCustomAudioFolder();
          if (pick) {
            this.applyCustomFolder(pick.files, pick.folderName);
          }
          return;
        } catch (err) {
          if (this.customLoader.isFolderMode() && this.customLoader.getCatalog().length > 0) {
            return;
          }
          if (err instanceof CustomFolderEmptyError) {
            this.showImportError(t('ui.customFolderEmpty'));
            return;
          }
          console.warn('Directory picker failed', err);
          this.showImportError(t('ui.errorOpenFolder'));
          return;
        } finally {
          this.nativeFolderPickActive = false;
        }
      }

      folderInput?.click();
    } finally {
      this.customMusicPickerOpen = false;
    }
  }

  private applyCustomFolder(files: File[], folderName = '') {
    const audioFiles = filterAudioFiles(files);
    if (audioFiles.length === 0) {
      this.showImportError(t('ui.customFolderEmpty'));
      return;
    }

    const folderLabel = folderName || folderNameFromFiles(audioFiles);
    this.customLoader.setCatalogFromFiles(audioFiles, folderLabel);
    this.customBpm = 128;
    this.customOffset = 0;
    this.customDifficulty = 'NORMAL';
    this.selectHubBuiltinIndex = null;
    this.selectHubTrackIndex = 0;
    this.playUiSelect();
    this.showSelect();
  }

  private showImportError(message: string): void {
    if (this.customLoader.isFolderMode() && this.customLoader.getCatalog().length > 0) {
      this.showSelect();
      return;
    }
    this.showError(message);
    setTimeout(() => this.showSelect(), 2500);
  }

  private async handleCustomFile(file: File) {
    try {
      const meta = await this.customLoader.loadFile(file);
      this.customBpm = meta.suggestedBpm;
      this.customOffset = 0;
      this.customDifficulty = 'NORMAL';
      this.selectHubBuiltinIndex = null;
      this.selectHubTrackIndex = 0;
      this.playUiSelect();
      this.showSelect();
      const chart = this.customLoader.buildChart(this.customBpm, this.customOffset, this.customDifficulty);
      this.selectedChart = chart;
      this.updateSelectHubCenterFromChart(chart, meta.title, meta.duration);
      if (this.audio.isPreviewEnabled()) {
        void this.audio.startUserPreview();
      }
    } catch (err) {
      console.error(err);
      this.showImportError(t('ui.errorLoadFile'));
    }
  }

  showCountdownOverlay(chart: ChartData) {
    this.screenId = 'countdown';
    this.countdownChart = chart;
    this.unbindCustomRingNavigation();
    this.audio.stopUserPreview();
    this.overlay.classList.remove('hidden');
    this.render(`
      <div class="screen countdown-screen">
        <h2 class="ready-title">${this.escapeHtml(chart.title)}</h2>
        <div class="countdown-display" id="countdown">3</div>
        <p class="countdown-flash-warning" role="note">${t('ui.countdownFlashWarning')}</p>
      </div>
    `);
  }

  showLoading(messageKey: MessageKey, keepProgress = false) {
    this.screenId = 'loading';
    this.loadingMessageKey = messageKey;
    if (!keepProgress) this.loadingProgress = null;
    this.renderLoadingScreen();
  }

  updateLoadingProgress(loaded: number, total: number) {
    this.loadingProgress = { loaded, total };
    if (this.screenId !== 'loading') return;

    const wrap = this.overlay.querySelector('#loading-progress') as HTMLElement | null;
    const fill = this.overlay.querySelector('#loading-progress-fill') as HTMLElement | null;
    const label = this.overlay.querySelector('#loading-progress-label') as HTMLElement | null;
    if (!wrap || !fill || !label) return;

    wrap.hidden = false;
    const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
    fill.style.width = `${pct}%`;
    label.textContent = t('ui.loadingModelsProgress', { pct });
  }

  updateBackgroundLoadProgress(loaded: number, total: number) {
    this.backgroundLoadProgress = { loaded, total };
    this.refreshBackgroundProgressUi();
  }

  private shouldShowBackgroundProgress(): boolean {
    return this.screenId === 'title' || this.screenId === 'select';
  }

  private syncBackgroundProgressPlacement(): void {
    this.bgLoadProgressEl.classList.remove('bg-load-progress--br', 'bg-load-progress--bl');
    if (this.screenId === 'title' || this.screenId === 'select') {
      this.bgLoadProgressEl.classList.add('bg-load-progress--br');
    }
  }

  private refreshBackgroundProgressUi(): void {
    const progress = this.backgroundLoadProgress;
    const complete = !progress || progress.total <= 0 || progress.loaded >= progress.total;
    if (complete || !this.shouldShowBackgroundProgress()) {
      this.bgLoadProgressEl.classList.add('hidden');
      return;
    }

    this.syncBackgroundProgressPlacement();
    const pct = Math.round((progress!.loaded / progress!.total) * 100);
    this.bgLoadProgressFill.style.width = `${pct}%`;
    this.bgLoadProgressLabel.textContent = t('ui.loadingModelsProgress', { pct });
    this.bgLoadProgressEl.setAttribute('aria-label', t('ui.loadingModels'));
    this.bgLoadProgressEl.classList.remove('hidden');
  }

  private renderLoadingScreen() {
    const progress = this.loadingProgress;
    const showProgress = progress !== null && progress.total > 0;
    const pct = showProgress ? Math.round((progress.loaded / progress.total) * 100) : 0;
    this.render(`
      <div class="screen loading-screen">
        <div class="loading-spinner"></div>
        <p class="loading-text" id="loading-message">${this.escapeHtml(t(this.loadingMessageKey))}</p>
        <div class="loading-progress" id="loading-progress" ${showProgress ? '' : 'hidden'}>
          <div class="loading-progress-track">
            <div class="loading-progress-fill" id="loading-progress-fill" style="width:${pct}%"></div>
          </div>
          <p class="loading-progress-label" id="loading-progress-label">${
            showProgress
              ? this.escapeHtml(t('ui.loadingModelsProgress', { pct }))
              : ''
          }</p>
        </div>
      </div>
    `);
  }

  showError(message: string) {
    this.screenId = 'error';
    this.errorMessage = message;
    this.render(`
      <div class="screen error-screen">
        <p class="error-text">${this.escapeHtml(message)}</p>
      </div>
    `);
  }

  updateCountdown(num: number) {
    const el = this.overlay.querySelector('#countdown');
    if (el) {
      el.textContent = num > 0 ? String(num) : t('ui.go');
      el.classList.remove('pop');
      void (el as HTMLElement).offsetWidth;
      el.classList.add('pop');
    }
  }

  prepareForGameplay() {
    this.screenId = 'none';
    this.clearTouchZones();
    this.hidePlayHud();
    this.stopSelectHubBackground();
    this.unbindCustomRingNavigation();
    this.overlay.innerHTML = '';
    this.overlay.classList.add('hidden');
    this.bgLoadProgressEl.classList.add('hidden');
  }

  showNavHud(mode: 'select' | 'play') {
    if (mode === 'select') {
      this.hidePlayHud();
      return;
    }

    this.playHud.className = '';
    const buttons: Array<{ id: string; label: string; action: () => void }> = [];
    buttons.push(
      {
        id: 'btn-exit-select',
        label: t('ui.songSelect'),
        action: () => {
          this.playUiNavigate();
          this.onExitToSelect();
        },
      },
      {
        id: 'btn-exit-title',
        label: t('ui.title'),
        action: () => {
          this.playUiNavigate();
          this.onExitToTitle();
        },
      },
    );

    this.playHud.innerHTML = buttons.map((btn) => (
      `<button type="button" class="btn-play-hud" id="${btn.id}">${btn.label}</button>`
    )).join('');
    this.playHud.classList.remove('hidden');
    this.playHud.setAttribute('aria-label', t('ui.playHudAria'));
    for (const btn of buttons) {
      this.playHud.querySelector(`#${btn.id}`)?.addEventListener('click', btn.action);
    }
  }

  showPlayHud() {
    this.showNavHud('play');
  }

  hidePlayHud() {
    this.playHud.innerHTML = '';
    this.playHud.className = '';
    this.playHud.classList.add('hidden');
  }

  hideOverlay() {
    this.overlay.innerHTML = '';
    this.overlay.classList.add('hidden');
  }

  showResult(stats: GameStats, chart: ChartData) {
    this.screenId = 'result';
    this.resultStats = stats;
    this.resultChart = chart;
    this.hidePlayHud();
    this.lastChart = chart;
    this.overlay.classList.remove('hidden');

    const rank = getRank(stats, chart.notes.length);
    const acc = getAccuracy(stats);
    const rankClass = rank.replace('+', '-plus');
    const resultImage = `${import.meta.env.BASE_URL}images/result.png`;

    this.render(`
      <div class="screen result-screen">
        <img class="result-hero" src="${resultImage}" alt="" />
        <div class="result-panel panel-right">
          <div class="result-rank rank-${rankClass}">${rank}</div>
          <h2 class="result-title">${this.escapeHtml(chart.title)}</h2>
          <div class="result-score">${stats.score.toLocaleString()}</div>
          <div class="result-grid">
            <div class="result-stat"><span class="label perfect">${tJudgment('perfect')}</span><span>${stats.perfect}</span></div>
            <div class="result-stat"><span class="label great">${tJudgment('great')}</span><span>${stats.great}</span></div>
            <div class="result-stat"><span class="label good">${tJudgment('good')}</span><span>${stats.good}</span></div>
            <div class="result-stat"><span class="label bad">${tJudgment('bad')}</span><span>${stats.bad}</span></div>
            <div class="result-stat"><span class="label miss">${tJudgment('miss')}</span><span>${stats.miss}</span></div>
            <div class="result-stat"><span class="label">${t('ui.maxCombo')}</span><span>${stats.maxCombo}</span></div>
            <div class="result-stat wide"><span class="label">${t('ui.accuracy')}</span><span>${acc}%</span></div>
          </div>
          <div class="result-actions">
            <button class="btn-primary" id="btn-retry">${t('ui.retry')}</button>
            <button class="btn-secondary" id="btn-menu">${t('ui.songSelectTitle')}</button>
          </div>
        </div>
      </div>
    `);

    this.overlay.querySelector('#btn-retry')?.addEventListener('click', () => {
      if (this.lastChart) {
        this.playUiDecide();
        this.overlay.innerHTML = '';
        this.onStart(this.lastChart);
      }
    });
    this.overlay.querySelector('#btn-menu')?.addEventListener('click', () => {
      this.playUiNavigate();
      if (!this.lastChart?.customAudio) this.customLoader.clear();
      this.onBack();
      this.showSelect();
    });
  }

  showTouchZones(layoutGetter: () => TouchZoneLayout): HTMLElement[] {
    this.touchLayoutGetter = layoutGetter;
    this.touchLayer.classList.add('active');
    const zones = LANE_LABELS.map((_, i) => {
      const zone = document.createElement('div');
      zone.className = 'touch-zone';
      zone.style.setProperty('--lane-color', LANE_COLORS[i]);
      zone.dataset.lane = String(i);
      this.touchLayer.appendChild(zone);
      return zone;
    });

    this.applyTouchZoneLayout();
    if (this.touchLayoutResizeHandler) {
      window.removeEventListener('resize', this.touchLayoutResizeHandler);
    }
    this.touchLayoutResizeHandler = () => this.applyTouchZoneLayout();
    window.addEventListener('resize', this.touchLayoutResizeHandler);
    return zones;
  }

  private applyTouchZoneLayout(): void {
    if (!this.touchLayoutGetter) return;
    const { laneStartX, laneWidth, topY, hitLineY } = this.touchLayoutGetter();
    const zones = this.touchLayer.querySelectorAll<HTMLElement>('.touch-zone');
    zones.forEach((zone, i) => {
      zone.style.left = `${laneStartX + laneWidth * i}px`;
      zone.style.width = `${laneWidth}px`;
      zone.style.top = `${topY}px`;
      zone.style.height = `${Math.max(0, hitLineY - topY)}px`;
    });
  }

  clearTouchZones() {
    if (this.touchLayoutResizeHandler) {
      window.removeEventListener('resize', this.touchLayoutResizeHandler);
      this.touchLayoutResizeHandler = null;
    }
    this.touchLayoutGetter = null;
    this.touchLayer.innerHTML = '';
    this.touchLayer.classList.remove('active');
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private render(html: string) {
    this.overlay.innerHTML = html;
    this.overlay.classList.remove('hidden');
    bindTooltips(this.overlay);
    this.refreshBackgroundProgressUi();
  }
}
