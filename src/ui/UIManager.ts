import musicSelectTitleImageSrc from '../assets/music_select_title.png?url';
import titleLogoSrc from '../assets/title_logo.png?url';
import type { ChartData, GameStats } from '../types';
import { LANE_COLORS, LANE_LABELS } from '../types';
import { CHARTS, getRank, getAccuracy } from '../data/charts';
import { recordSongBestGrade, getSongBestGrade } from '../data/songBestGrade';
import { trackEntryRecordKey } from '../data/songRecordKey';
import { ddrGradeCssClass, type DdrGrade } from '../scoring/ddrScoring';
import type { CustomSongLoader } from '../audio/CustomSongLoader';
import {
  CUSTOM_DIFFICULTIES,
  difficultyCssClass,
  formatChartDifficultyLabel,
  type CustomDifficulty,
} from '../audio/AutoChartGenerator';
import {
  CustomFolderEmptyError,
  filterAudioFiles,
  folderNameFromFiles,
  pickCustomAudioFile,
  pickCustomAudioFolder,
  restoreLastCustomMusicFolder,
  supportsCustomMusicFilePicker,
  supportsCustomMusicFolderPicker,
} from '../audio/pickCustomAudio';
import { resolveGenre } from '../audio/musicGenre';
import {
  loadScrollSpeed, saveScrollSpeed, formatScrollSpeed,
  MIN_SCROLL_SPEED, MAX_SCROLL_SPEED,
} from '../settings/scrollSpeed';
import { DEFAULT_REDUCED_FLASH, loadReducedFlash, saveReducedFlash } from '../settings/reducedFlash';
import { loadTitleSound, saveTitleSound } from '../settings/titleSound';
import {
  DEFAULT_STAGE_FX_PATTERN,
  loadStageFxPattern,
  normalizeStageFxPattern,
  saveStageFxPattern,
  STAGE_FX_AUTO,
  STAGE_FX_PATTERN_COUNT,
} from '../settings/stageFxPattern';
import { GAME_COUNTDOWN_SECONDS } from '../game/Game';
import { stageFxPatternI18nKey } from '../game/stageFxPatterns';
import type { AudioEngine } from '../audio/AudioEngine';
import { getResultVoiceId, RESULT_RANK_REVEAL_DELAY_MS } from '../audio/resultVoice';
import { renderFolderSongList } from './customSongList';
import { renderChartLevelHtml, renderChartRatingHtml, renderSongChartAnalysisHtml } from './chartRadarView';
import { renderChartBestGradeBadge } from './bestGradeView';
import { RandomPickController } from './RandomPickController';
import { sortFolderCatalog, folderCatalogDisplayIndex, stepFolderCatalogIndex } from '../audio/songCatalogSort';
import { sortBuiltinIndices, stepBuiltinIndex } from '../data/builtinCatalogSort';
import {
  BUILTIN_SORT_KEYS,
  FOLDER_SORT_KEYS,
  isSongSortDirectionEnabled,
  loadBuiltinSongSort,
  loadFolderSongSort,
  saveBuiltinSongSort,
  saveFolderSongSort,
  songSortKeyLabelKey,
  type SongSortDirection,
  type SongSortKey,
  type SongSortSettings,
} from '../settings/songSort';
import { SelectHubBackground } from './selectHubBackground';
import { ResultScreenBackground } from './resultScreenBackground';
import { TitleScreenBackground } from './titleScreenBackground';
import { bindTooltips, updateTooltip, withTooltip } from './tooltip';
import {
  formatChartBpm,
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

const ENABLE_STAGE_FX_DEBUG = false;

const TITLE_EQ_COLORS = ['#ff2d6a', '#00e5ff', '#a855f7', '#ffd700', '#ff007f', '#00f3ff', '#ffaa00'];

function titleEqBarsHtml(barCount = 24): string {
  const rand = (min: number, max: number) => min + Math.random() * (max - min);
  return Array.from({ length: barCount }, (_, i) => {
    const color = TITLE_EQ_COLORS[i % TITLE_EQ_COLORS.length];
    const delay = rand(0, 2.2).toFixed(3);
    const duration = rand(0.28, 1.15).toFixed(3);
    const lo = rand(0.1, 0.3).toFixed(3);
    const mid1 = rand(0.35, 0.85).toFixed(3);
    const hi = rand(0.75, 1.55).toFixed(3);
    const mid2 = rand(0.28, 0.92).toFixed(3);
    return `<span class="title-eq-bar" style="--eq-color:${color};--eq-delay:${delay}s;--eq-dur:${duration}s;--eq-lo:${lo};--eq-m1:${mid1};--eq-hi:${hi};--eq-m2:${mid2}" aria-hidden="true"></span>`;
  }).join('');
}

/** 曲情報パネル左右 — 角丸分の直線側だけにバーを並べる */
function songInfoSideEqBarsHtml(): string {
  return titleEqBarsHtml(20);
}

type ScreenId =
  | 'title'
  | 'select'
  | 'countdown'
  | 'loading'
  | 'error'
  | 'result'
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
  private titleSoundEnabled = loadTitleSound();
  private stageFxPattern = DEFAULT_STAGE_FX_PATTERN;
  private titleKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private titlePointerHandler: ((e: PointerEvent) => void) | null = null;
  private customRingKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private selectHubSongBandKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private selectHubSongBandWheelTarget: HTMLElement | null = null;
  private selectHubSongBandWheelHandler: ((e: WheelEvent) => void) | null = null;
  private selectHubStartKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private selectHubPlayClickHandler: ((e: Event) => void) | null = null;
  private selectHubRandomClickHandler: ((e: Event) => void) | null = null;
  private selectHubBuiltinIndex: number | null = 0;
  private selectHubTrackIndex = 0;
  private selectHubTrackLoadGen = 0;
  private folderMetaPrefetchGen = 0;
  private folderMetaPrefetchingIndex: number | null = null;
  private selectHubLoadingCatalogIndex: number | null = null;
  private folderSongSort: SongSortSettings = loadFolderSongSort();
  private builtinSongSort: SongSortSettings = loadBuiltinSongSort();
  private randomPick: RandomPickController;
  private skipNextGameCountdown = false;
  private screenId: ScreenId = 'none';
  private loadingMessageKey: MessageKey = 'ui.loadingAudio';
  private loadingProgress: { loaded: number; total: number } | null = null;
  private touchLayoutGetter: (() => TouchZoneLayout) | null = null;
  private touchLayoutResizeHandler: (() => void) | null = null;
  private errorMessage = '';
  private countdownChart: ChartData | null = null;
  private resultStats: GameStats | null = null;
  private resultChart: ChartData | null = null;
  private resultRevealGen = 0;
  private selectHubBg = new SelectHubBackground();
  private resultBg = new ResultScreenBackground();
  private titleBg = new TitleScreenBackground();

  constructor(
    overlay: HTMLElement,
    touchLayer: HTMLElement,
    playHud: HTMLElement,
    onStart: (chart: ChartData) => void,
    onBack: () => void,
    onExitToSelect: () => void,
    onExitToTitle: () => void,
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
    this.customLoader = customLoader;
    this.audio = audio;
    this.reducedFlash = loadReducedFlash();
    this.titleSoundEnabled = loadTitleSound();
    this.stageFxPattern = loadStageFxPattern();
    this.applyReducedFlashClass();
    this.randomPick = new RandomPickController({
      getScreenId: () => this.screenId,
      getOverlay: () => this.overlay,
      getCustomLoader: () => this.customLoader,
      getAudio: () => this.audio,
      getFolderSongSort: () => this.folderSongSort,
      folderTrackSortMeta: (track) => this.folderTrackSortMeta(track),
      canRandomFolderPlay: () => this.canRandomFolderPlay(),
      isSelectHubRingLoading: () => this.isSelectHubRingLoading(),
      getSelectedChart: () => this.selectedChart,
      scrollSongBandCardIntoView: (el, behavior) => this.scrollSongBandCardIntoView(el, behavior),
      setRingCenterTitle: (title) => this.setRingCenterTitle(title),
      flashBandCardDecide: (card) => this.flashBandCardDecide(card),
      escapeHtml: (text) => this.escapeHtml(text),
      loadSelectHubTrack: (index, opts) => this.loadSelectHubTrack(index, opts),
      startSelectedChart: () => this.startSelectedChart(),
      unbindCustomRingNavigation: () => this.unbindCustomRingNavigation(),
      bindSelectHubRing: () => this.bindSelectHubRing(),
      syncRandomPlayButton: () => this.syncRandomPlayButton(),
      syncSongBandNavButtons: () => this.syncSongBandNavButtons(),
      burstSelectHubWarp: () => this.selectHubBg.burstWarp(),
      requestSkipGameCountdown: () => { this.skipNextGameCountdown = true; },
    });

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
      default: break;
    }
    if (this.screenId === 'none' && !this.playHud.classList.contains('hidden')) {
      this.showNavHud('play');
    }
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
      <div class="title-lang-switch" id="title-language-switch" role="group" aria-label="${t('settings.language')}">
        <button type="button"
          class="title-lang-switch-btn${locale === 'ja' ? ' is-active' : ''}"
          data-locale="ja"
          aria-pressed="${locale === 'ja'}">JP</button>
        <button type="button"
          class="title-lang-switch-btn${locale === 'en' ? ' is-active' : ''}"
          data-locale="en"
          aria-pressed="${locale === 'en'}">EN</button>
      </div>
    `;
  }

  private bindLanguageControl(): void {
    const root = this.overlay.querySelector('#title-language-switch');
    root?.querySelectorAll<HTMLButtonElement>('.title-lang-switch-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const value = btn.dataset.locale;
        if (value === 'ja' || value === 'en') setLocale(value as Locale);
      });
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

  private titleSoundToggleHtml(): string {
    const on = this.titleSoundEnabled;
    return `
      <button type="button"
        class="title-sound-toggle${on ? ' is-preview-playing' : ' is-preview-paused'}"
        id="title-sound-toggle"
        aria-pressed="${on}"
        aria-label="${t('ui.titleSoundToggle')}">
        ${this.songPreviewStateHtml(undefined, 'ui.titleSoundToggle')}
      </button>
    `;
  }

  private selectHubPreviewToggleButtonHtml(): string {
    const enabled = this.audio.isPreviewEnabled();
    return `
      <button type="button"
        class="title-sound-toggle${enabled ? ' is-preview-playing' : ' is-preview-paused'}"
        id="select-hub-preview-toggle"
        aria-pressed="${enabled}"
        aria-label="${t('ui.previewToggle')}">
        ${this.songPreviewStateHtml(undefined, 'ui.previewToggle')}
      </button>
    `;
  }

  private selectHubPreviewToggleEl(): HTMLElement | null {
    return this.overlay.querySelector('#select-hub-preview-toggle');
  }

  private bindSelectHubPreviewToggle(): void {
    this.bindPreviewToggle(
      this.selectHubPreviewToggleEl(),
      () => this.isSelectHubRingLoading(),
    );
  }

  private syncSelectHubPreviewToggle(loading?: boolean): void {
    this.syncPreviewToggleState(
      this.selectHubPreviewToggleEl(),
      loading ?? this.isSelectHubRingLoading(),
    );
  }

  private titleFlashControlHtml(): string {
    const on = this.reducedFlash;
    return `
      <button type="button"
        class="title-flash-toggle title-sound-toggle${on ? ' is-preview-playing' : ' is-preview-paused'}"
        id="title-flash-toggle"
        aria-pressed="${on}"
        aria-label="${t('settings.reducedFlash')}">
        ${this.titleFlashToggleStateHtml()}
      </button>
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
      <div class="title-settings-bar">
        ${this.titleSoundToggleHtml()}
        ${this.languageControlHtml()}
        ${this.titleFlashControlHtml()}
      </div>
      ${this.debugCornerPanelHtml()}
    `;
  }

  private syncTitleSoundToggleState(btn: HTMLElement | null): void {
    if (!btn) return;
    btn.classList.toggle('is-preview-playing', this.titleSoundEnabled);
    btn.classList.toggle('is-preview-paused', !this.titleSoundEnabled);
    btn.classList.remove('is-preview-loading');
    btn.setAttribute('aria-pressed', String(this.titleSoundEnabled));
  }

  private bindTitleSoundToggle(): void {
    const btn = this.overlay.querySelector('#title-sound-toggle') as HTMLButtonElement;
    this.syncTitleSoundToggleState(btn);
    btn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.titleSoundEnabled = !this.titleSoundEnabled;
      saveTitleSound(this.titleSoundEnabled);
      this.syncTitleSoundToggleState(btn);
      this.playUiSelect();
      void this.audio.resume().then(() => this.syncTitleBgm());
    });
  }

  async syncTitleBgm(): Promise<void> {
    await this.audio.resume();
    if (this.screenId !== 'title') {
      this.audio.stopTitleBgm();
      return;
    }
    if (this.titleSoundEnabled) {
      await this.audio.playTitleBgm();
    } else {
      this.audio.stopTitleBgm();
    }
  }

  private bindTitleFlashToggle(): void {
    const btn = this.overlay.querySelector('#title-flash-toggle') as HTMLButtonElement;
    this.syncTitleFlashToggleState(btn);
    btn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.reducedFlash = !this.reducedFlash;
      saveReducedFlash(this.reducedFlash);
      this.syncTitleFlashToggleState(btn);
      this.applyReducedFlashClass();
      this.selectHubBg.setReducedFlash(this.reducedFlash);
      this.resultBg.setReducedFlash(this.reducedFlash);
      this.titleBg.setReducedFlash(this.reducedFlash);
      this.playUiSelect();
    });
  }

  private syncTitleFlashToggleState(btn: HTMLElement | null): void {
    if (!btn) return;
    btn.classList.toggle('is-preview-playing', this.reducedFlash);
    btn.classList.toggle('is-preview-paused', !this.reducedFlash);
    btn.setAttribute('aria-pressed', String(this.reducedFlash));
  }

  private applyReducedFlashClass(): void {
    document.body.classList.toggle('reduced-flash', this.reducedFlash);
  }

  private bindSettingsControls(): void {
    this.bindLanguageControl();
    this.bindTitleSoundToggle();
    this.bindTitleFlashToggle();

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
      void this.audio.resume().then(() => {
        this.audio.playUiNavigate();
        goSelect();
      });
    };

    this.titlePointerHandler = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#title-screen')) return;
      if (target.closest('.title-settings-bar, .title-sound-toggle')) return;
      navigate();
    };
    this.overlay.addEventListener('pointerdown', this.titlePointerHandler);

    this.titleKeyHandler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (!this.overlay.querySelector('#title-screen')) return;
      const target = e.target as HTMLElement;
      if (target.closest('.title-settings-bar input, .title-settings-bar select, .title-settings-bar textarea, .title-settings-bar button, .title-sound-toggle, .title-flash-toggle')) {
        return;
      }
      navigate();
    };
    window.addEventListener('keydown', this.titleKeyHandler, true);
  }

  showTitle() {
    this.resultRevealGen++;
    this.resetRandomPickState();
    this.screenId = 'title';
    this.unbindSelectHubStart();
    this.unbindSelectHubSongBandNav();
    this.unbindCustomRingNavigation();
    this.stopTitleBackground();
    this.audio.stop();
    const titleLogo = titleLogoSrc;
    this.render(`
      <div class="screen title-screen" id="title-screen">
        <div class="title-bg-fx" id="title-bg-fx" aria-hidden="true"></div>
        <div class="title-overlay-fx" aria-hidden="true">
          <div class="title-scanlines"></div>
          <div class="title-noise"></div>
        </div>
        ${this.accessibilityNoticeHtml()}
        <div class="title-hero">
          <div class="title-logo-wrap">
            <div class="title-eq-bars title-eq-bars--top" aria-hidden="true">${titleEqBarsHtml()}</div>
            <div class="title-logo-stage">
              <span class="title-logo-aura" aria-hidden="true"></span>
              <span class="title-logo-aura title-logo-aura--ring" aria-hidden="true"></span>
              <img class="title-logo" src="${titleLogo}" alt="RHYTHM RHYTHM FUSION 1ST EDITION" />
            </div>
            <div class="title-eq-bars title-eq-bars--bottom" aria-hidden="true">${titleEqBarsHtml()}</div>
          </div>
          <p class="title-press-start" role="status">${t('ui.pressAnyKey')}</p>
        </div>
        ${this.titleSettingsPanelsHtml()}
      </div>
    `);

    this.bindSettingsControls();
    this.bindTitleNavigation(() => this.showSelect());
    this.stopSelectHubBackground();
    this.stopResultBackground();
    this.mountTitleBackground();
    this.hidePlayHud();
    void this.syncTitleBgm();
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

  private hasCustomMusicLoaded(): boolean {
    if (this.customLoader.isFolderMode()) {
      return this.customLoader.getCatalog().length > 0;
    }
    return this.customLoader.getBuffer() !== null;
  }

  private customFolderPanelInfo(): { name: string; fileCount: number } {
    if (!this.customLoader.isFolderMode()) {
      return { name: t('ui.customFolderUnset'), fileCount: 0 };
    }

    const catalog = this.customLoader.getCatalog();
    const fileCount = catalog.length;
    let name = this.customLoader.getFolderLabel().trim();
    if (!name && catalog.length > 0) {
      name = folderNameFromFiles(catalog.map((entry) => entry.file));
    }
    if (!name) name = t('ui.customFolderUnset');
    return { name, fileCount };
  }

  private selectHubCustomPanelHtml(): string {
    const selected = this.selectHubBuiltinIndex === null;
    const importPrompt = !this.hasCustomMusicLoaded();
    const { name, fileCount } = this.customFolderPanelInfo();
    return `
      <div
        class="select-hub-custom-panel${selected ? ' is-selected' : ''}${importPrompt ? ' is-import-prompt' : ''}"
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
            title="${this.escapeHtml(name)}"
          >${this.escapeHtml(name)}</span>
          <span class="select-hub-custom-folder-count" id="select-hub-custom-folder-count">${t('ui.customFolderFileCount', { count: fileCount })}</span>
        </div>
      </div>
    `;
  }

  private selectHubSongBandHtml(): string {
    return `
      <div class="select-hub-song-band" aria-label="${t('ui.selectSongList')}">
        <div class="select-hub-song-band-main">
        <div class="select-hub-song-band-toolbar">
          ${this.builtinSongSortBarHtml()}
          ${this.folderSongSortBarHtml()}
        </div>
        <div class="select-hub-song-band-scroll-wrap">
          <button
            type="button"
            class="song-band-nav song-band-nav--prev"
            id="song-band-nav-prev"
            aria-label="${t('ui.ringPrev')}"
          >
            <span class="song-band-nav-label" aria-hidden="true">&lt;</span>
          </button>
          <div class="select-hub-song-band-scroll" id="select-hub-song-band-scroll">
            <div class="select-hub-builtin-band" id="select-hub-builtin-rail">
              ${this.selectHubBuiltinCardsHtml()}
            </div>
            <div class="select-hub-folder-band" id="folder-song-list">
              <div class="folder-song-list-track" id="folder-song-list-track"></div>
            </div>
          </div>
          <button
            type="button"
            class="song-band-nav song-band-nav--next"
            id="song-band-nav-next"
            aria-label="${t('ui.ringNext')}"
          >
            <span class="song-band-nav-label" aria-hidden="true">&gt;</span>
          </button>
        </div>
        </div>
        <div class="select-hub-custom-dock select-hub-custom-dock--band">
          ${this.selectHubCustomPanelHtml()}
        </div>
      </div>
    `;
  }

  private selectHubRightDockHtml(): string {
    return `
      <div class="select-hub-right-dock">
        <div class="select-hub-settings-stack" id="select-hub-tuning-panel">
          <div class="select-hub-settings-row select-hub-settings-row--preview">
            ${this.selectHubPreviewToggleButtonHtml()}
          </div>
          ${this.selectHubPlaySettingsRowsHtml()}
        </div>
      </div>
    `;
  }

  private selectHubDifficultyRowHtml(): string {
    return `
      <div class="select-hub-settings-row select-hub-settings-row--difficulty">
        <p class="select-hub-settings-label" id="difficulty-label">
          ${withTooltip(
            `${t('ui.difficulty')}: <span class="difficulty-picker-current">${this.customDifficulty}</span>`,
            tDifficultyHint(this.customDifficulty),
            'has-tooltip--above',
          )}
        </p>
        <div class="difficulty-options select-hub-diff-options" role="radiogroup" aria-label="${t('ui.difficulty')}">
          ${this.customDifficultyOptionsHtml()}
        </div>
      </div>
    `;
  }

  private selectHubBpmRowHtml(): string {
    return `
      <label class="select-hub-settings-row select-hub-settings-row--slider">
        <span class="select-hub-settings-label">${t('ui.bpmLabel')}</span>
        <input type="range" id="bpm-slider" min="80" max="200" value="${this.customBpm}" />
        <span class="select-hub-settings-value" id="bpm-value">${this.customBpm}</span>
      </label>
    `;
  }

  private selectHubOffsetRowHtml(): string {
    return `
      <label class="select-hub-settings-row select-hub-settings-row--slider">
        <span class="select-hub-settings-label">${t('settings.offset')}</span>
        <input type="range" id="offset-slider" min="0" max="3" step="0.1" value="${this.customOffset}" />
        <span class="select-hub-settings-value" id="offset-value">${this.customOffset.toFixed(1)}</span>
      </label>
    `;
  }

  private selectHubScrollSpeedRowHtml(): string {
    return `
      <label class="select-hub-settings-row select-hub-settings-row--slider">
        <span class="select-hub-settings-label">${withTooltip(t('settings.scrollSpeed'), t('settings.scrollSpeedHint'))}</span>
        <input type="range" id="speed-slider"
          min="${MIN_SCROLL_SPEED * 100}" max="${MAX_SCROLL_SPEED * 100}" step="5"
          value="${Math.round(this.scrollSpeed * 100)}" />
        <span class="select-hub-settings-value" id="speed-value">${formatScrollSpeed(this.scrollSpeed)}</span>
      </label>
    `;
  }

  private selectHubPlaySettingsRowsHtml(): string {
    return `
      ${this.selectHubDifficultyRowHtml()}
      ${this.selectHubBpmRowHtml()}
      ${this.selectHubOffsetRowHtml()}
      ${this.selectHubScrollSpeedRowHtml()}
    `;
  }

  private songSortOptionsHtml(
    keys: readonly SongSortKey[],
    selected: SongSortKey,
  ): string {
    return keys.map((key) => `
      <option value="${key}"${key === selected ? ' selected' : ''}>
        ${t(songSortKeyLabelKey(key))}
      </option>
    `).join('');
  }

  private songSortDirectionButtonsHtml(
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

  private songSortBarHtml(
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
            ${this.songSortOptionsHtml(keys, settings.key)}
          </select>
          ${this.songSortDirectionButtonsHtml(prefix, settings)}
        </div>
      </div>
    `;
  }

  private builtinSongSortBarHtml(): string {
    return this.songSortBarHtml('builtin', this.builtinSongSort, BUILTIN_SORT_KEYS);
  }

  private folderSongSortBarHtml(): string {
    return this.songSortBarHtml('folder', this.folderSongSort, FOLDER_SORT_KEYS);
  }

  private selectHubBuiltinCardsHtml(): string {
    const order = sortBuiltinIndices(CHARTS, this.builtinSongSort);
    return order.map((i) => {
      const chart = CHARTS[i];
      const diffClass = difficultyCssClass(chart.difficulty);
      const diffLabel = formatChartDifficultyLabel(chart.difficulty);
      return `
      <button
        type="button"
        class="song-band-card select-hub-builtin-card${this.selectHubBuiltinIndex === i ? ' is-selected' : ''}"
        data-builtin-index="${i}"
        style="--accent:${LANE_COLORS[i % 4]}"
      >
        <span class="song-band-card__select-mark" aria-hidden="true">▼</span>
        <span class="song-band-card__diff ${diffClass}">${this.escapeHtml(diffLabel)}</span>
        <div class="song-band-card__level">${renderChartLevelHtml(chart, 'card')}</div>
        <h3 class="song-band-card__title">${this.escapeHtml(chart.title)}</h3>
        <p class="song-band-card__sub">${this.escapeHtml(chart.artist)}</p>
        <p class="song-band-card__meta">${formatChartBpm(chart.bpm)} \u00b7 ${formatNotesCount(chart.notes.length)}</p>
        <div class="song-band-card__rank">${renderChartBestGradeBadge(chart, 'card')}</div>
      </button>
    `;
    }).join('');
  }

  private customDifficultyOptionsHtml(): string {
    return CUSTOM_DIFFICULTIES.map((d) => `
      <button type="button" class="difficulty-option ${d.toLowerCase()}${d === this.customDifficulty ? ' selected' : ''}"
        data-diff="${d}" aria-pressed="${d === this.customDifficulty}">
        ${d}
      </button>
    `).join('');
  }

  private syncDifficultyPickerUi(): void {
    this.overlay.querySelectorAll('.difficulty-option').forEach((el) => {
      const active = (el as HTMLElement).dataset.diff === this.customDifficulty;
      el.classList.toggle('selected', active);
      el.setAttribute('aria-pressed', String(active));
    });
    const currentEl = this.overlay.querySelector('.difficulty-picker-current');
    if (currentEl) currentEl.textContent = this.customDifficulty;
    updateTooltip(this.overlay, '#difficulty-label .has-tooltip', tDifficultyHint(this.customDifficulty));
  }

  private flashIconSvg(): string {
    return `<svg class="title-flash-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M8 1.1a4.9 4.9 0 0 0-3.02 8.82 1.15 1.15 0 0 0-.45.91v.57h7.04v-.57a1.15 1.15 0 0 0-.45-.91A4.9 4.9 0 0 0 8 1.1Zm-1.15 11.4h2.3v1.15H6.85v-1.15Z"/>
      <path fill="currentColor" opacity="0.55" d="M8 0l.55 1.35L9.9 1.8 8.65 2.7 9.05 4.2 8 3.35 6.95 4.2 7.35 2.7 6.1 1.8 7.45 1.35 8 0Z"/>
    </svg>`;
  }

  private titleFlashToggleStateHtml(): string {
    const icon = this.flashIconSvg();
    return `
      <span class="song-preview-state" title="${t('settings.reducedFlash')}">
        <span class="song-preview-icon song-preview-icon--on">
          <span class="title-flash-icon-wrap" aria-hidden="true">${icon}</span>
          <span class="song-preview-label">${t('ui.titleSoundOn')}</span>
        </span>
        <span class="song-preview-icon song-preview-icon--off">
          <span class="title-flash-icon-wrap" aria-hidden="true">${icon}</span>
          <span class="song-preview-label">${t('ui.titleSoundOff')}</span>
        </span>
      </span>
    `;
  }

  private songPreviewStateHtml(
    id?: string,
    titleKey: MessageKey = 'ui.previewToggle',
    onLabelKey: MessageKey = 'ui.titleSoundOn',
    offLabelKey: MessageKey = 'ui.titleSoundOff',
  ): string {
    const idAttr = id ? ` id="${id}"` : '';
    return `
      <span class="song-preview-state"${idAttr} title="${t(titleKey)}">
        <span class="song-preview-icon song-preview-icon--on">
          <span class="song-preview-note" aria-hidden="true">\u266a</span>
          <span class="song-preview-label">${t(onLabelKey)}</span>
        </span>
        <span class="song-preview-icon song-preview-icon--off">
          <span class="song-preview-note" aria-hidden="true">\u266a</span>
          <span class="song-preview-label">${t(offLabelKey)}</span>
        </span>
      </span>
    `;
  }

  private songRingCenterInnerHtml(): string {
    const catalog = this.customLoader.getCatalog();
    const isBuiltin = this.selectHubBuiltinIndex !== null;
    const chart = isBuiltin
      ? CHARTS[this.selectHubBuiltinIndex!]
      : this.selectedChart;
    const title = isBuiltin && chart
      ? chart.title
      : catalog[this.selectHubTrackIndex]?.title ?? '';
    return `
      <div class="song-detail-top">
        <div class="song-info-best-grade-slot" id="song-best-grade-slot"></div>
        <div class="song-detail-centered">
          <div class="song-info-panel-level" id="song-chart-level-slot">${renderChartLevelHtml(chart, 'panel')}</div>
          <p class="song-ring-counter" id="ring-track-counter"></p>
        </div>
        <h2 class="ready-title" id="ring-center-title" title="${this.escapeHtml(title)}">${this.escapeHtml(title)}</h2>
        <div class="song-detail-centered">
          <p class="ready-artist" id="ring-center-meta"></p>
          <p class="ready-stats" id="ring-center-stats">\u2014</p>
        </div>
      </div>
    `;
  }

  private songInfoPanelHtml(folderListMode: boolean): string {
    return `
      <div class="song-info-panel-wrap">
        <div class="song-info-hub-row">
          ${this.selectHubRadarDockHtml()}
          <div class="song-info-panel-column">
            <div class="song-info-panel-chrome" aria-hidden="true">
              <span class="song-info-panel-chrome__glow"></span>
            </div>
            <div class="song-info-panel-row">
              <div
                class="song-ring-center${folderListMode ? ' folder-song-detail' : ''}"
                id="song-ring-center"
              >
                <div class="song-info-eq-bars song-info-eq-bars--left" aria-hidden="true">${songInfoSideEqBarsHtml()}</div>
                <div class="song-info-panel-body">
                  ${this.songRingCenterInnerHtml()}
                </div>
                <div class="song-info-eq-bars song-info-eq-bars--right" aria-hidden="true">${songInfoSideEqBarsHtml()}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="random-pick-stage-fx" id="random-pick-fx" hidden aria-live="polite">
          <div class="random-pick-fx-scrim" aria-hidden="true"></div>
          <div class="random-pick-fx-ring random-pick-fx-ring--outer" aria-hidden="true"></div>
          <div class="random-pick-fx-ring random-pick-fx-ring--inner" aria-hidden="true"></div>
          <div class="random-pick-fx-card">
            <span class="random-pick-fx-kicker" id="random-pick-fx-kicker" hidden></span>
            <span class="random-pick-fx-label" id="random-pick-fx-label"></span>
          </div>
        </div>
      </div>
    `;
  }

  private shouldShowFolderSongList(): boolean {
    return this.customLoader.isFolderMode() && this.customLoader.getCatalog().length > 1;
  }

  async tryRestoreLastCustomFolder(requestPermission = false): Promise<boolean> {
    if (this.customLoader.isFolderMode() && this.customLoader.getCatalog().length > 0) {
      return true;
    }

    try {
      const pick = await restoreLastCustomMusicFolder({ requestPermission });
      if (!pick) return false;
      this.applyCustomFolder(pick.files, pick.folderName, { navigate: false });
      return true;
    } catch (err) {
      console.warn('Failed to restore custom music folder', err);
      return false;
    }
  }

  async showSelect() {
    this.resultRevealGen++;
    this.resetRandomPickState();
    this.screenId = 'select';
    this.audio.stopTitleBgm();
    this.audio.stopPreviewPlayback();

    await this.tryRestoreLastCustomFolder(true);

    this.stopTitleBackground();
    this.unbindTitleNavigation();
    this.unbindCustomRingNavigation();
    this.unbindSelectHubSongBandNav();
    this.unbindSelectHubStart();
    this.stopSelectHubBackground();
    this.stopResultBackground();

    const isBuiltin = this.selectHubBuiltinIndex !== null;
    const folderListMode = !isBuiltin && this.shouldShowFolderSongList();

    this.render(`
      <div class="screen select-hub-screen custom-folder-screen${isBuiltin ? ' is-builtin-mode' : ''}${folderListMode ? ' is-folder-list-mode' : ''}" id="select-hub-screen">
        <div class="select-hub-bg-fx" id="select-hub-bg-fx" aria-hidden="true"></div>
        <div class="select-hub-overlay-fx" aria-hidden="true">
          <div class="select-hub-prism-veil"></div>
          <div class="select-hub-scanlines"></div>
          <div class="select-hub-noise"></div>
          <div class="select-hub-vignette"></div>
          <div class="select-hub-chroma-edge"></div>
        </div>
        ${this.selectHubRightDockHtml()}
        <div class="select-hub-title-bar">
          <img
            class="select-hub-title-logo"
            src="${musicSelectTitleImageSrc}"
            alt="${t('ui.songSelectTitle')}"
            draggable="false"
          />
        </div>
        <div class="song-ring-stage">
          ${this.songInfoPanelHtml(folderListMode)}
        </div>
        ${this.selectHubSongBandHtml()}
        ${this.selectHubNavHtml()}
        <input type="file" id="audio-file-input" accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.webm" hidden />
        <input type="file" id="audio-folder-input" accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.webm" webkitdirectory multiple hidden />
        <div class="random-pick-fly-layer" id="random-pick-fly-layer" aria-hidden="true"></div>
      </div>
    `);

    this.bindSelectHub();
    this.mountSelectHubBackground();
    this.hidePlayHud();
  }

  private selectHubRadarDockHtml(): string {
    const isBuiltin = this.selectHubBuiltinIndex !== null;
    const chart = isBuiltin
      ? CHARTS[this.selectHubBuiltinIndex!]
      : this.selectedChart;
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

  private selectHubNavHtml(): string {
    return `
      <nav class="select-hub-nav-fx" aria-label="${t('ui.songSelectTitle')}">
        <button type="button" class="btn-select-nav-back" id="btn-goto-title" aria-label="${t('ui.backToTitle')}">
          <span class="btn-select-nav-back-label">${t('ui.backToTitle')}</span>
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

  private mountResultBackground(): void {
    const host = this.overlay.querySelector('#result-bg-fx');
    if (!host) {
      this.resultBg.unmount();
      return;
    }
    this.resultBg.setReducedFlash(this.reducedFlash);
    this.resultBg.mount(host as HTMLElement);
  }

  private stopResultBackground(): void {
    this.resultBg.unmount();
  }

  private mountTitleBackground(): void {
    const host = this.overlay.querySelector('#title-bg-fx');
    if (!host) return;
    this.titleBg.setReducedFlash(this.reducedFlash);
    this.titleBg.mount(host as HTMLElement);
  }

  private stopTitleBackground(): void {
    this.titleBg.unmount();
  }

  private bindSelectHub(): void {
    const fileInput = this.overlay.querySelector('#audio-file-input') as HTMLInputElement;
    const folderInput = this.overlay.querySelector('#audio-folder-input') as HTMLInputElement;

    this.bindSelectHubBuiltinCardClicks();
    this.bindSongSortControls();

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
      this.startFolderMetaPrefetch(this.selectHubTrackIndex);
      void this.loadSelectHubTrack(this.selectHubTrackIndex);
    } else if (this.customLoader.getImportMode() === 'single' && this.customLoader.getBuffer()) {
      this.selectHubBuiltinIndex = null;
      this.refreshSelectHubSidebarSelection();
      this.syncSelectHubBuiltinModeClass();
      const chart = this.customLoader.buildChart(this.customBpm, this.customOffset, this.customDifficulty);
      this.selectedChart = chart;
      this.updateSelectHubCenterFromChart(chart, chart.title, chart.audioDuration ?? 0);
      this.refreshSelectHubRing();
      this.syncSelectHubPreviewToggle();
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
    this.bindSelectHubPreviewToggle();
    this.bindSelectHubSongBandNav();
    this.syncRandomPlayButton();
    this.syncSongBandNavButtons();
    this.syncSelectHubPreviewToggle(false);
    requestAnimationFrame(() => this.scrollSelectedSongBandCardIntoView('auto'));
  }

  private bindSelectHubNav(): void {
    this.overlay.querySelector('#btn-goto-title')?.addEventListener('click', () => {
      if (this.isRandomPickLocked()) return;
      this.playUiNavigate();
      this.cancelFolderMetaPrefetch();
      this.customLoader.clear();
      this.selectHubBuiltinIndex = 0;
      this.showTitle();
    });
  }

  private isSongBandVisible(): boolean {
    const screen = this.overlay.querySelector('#select-hub-screen');
    if (!screen) return false;
    return screen.classList.contains('is-builtin-mode')
      || screen.classList.contains('is-folder-list-mode');
  }

  private songBandCardCount(): number {
    if (this.selectHubBuiltinIndex !== null) return CHARTS.length;
    if (this.shouldShowFolderSongList()) return this.customLoader.getCatalog().length;
    return 0;
  }

  private syncSongBandNavButtons(): void {
    const prevBtn = this.overlay.querySelector('#song-band-nav-prev') as HTMLButtonElement | null;
    const nextBtn = this.overlay.querySelector('#song-band-nav-next') as HTMLButtonElement | null;
    const enabled = this.isSongBandVisible()
      && this.songBandCardCount() > 1
      && !this.isRandomPickLocked();
    prevBtn?.toggleAttribute('disabled', !enabled);
    nextBtn?.toggleAttribute('disabled', !enabled);
  }

  private resetSongBandRailTransform(): void {
    const scroll = this.overlay.querySelector('#select-hub-song-band-scroll') as HTMLElement | null;
    if (!scroll) return;
    scroll.querySelectorAll('#select-hub-builtin-rail, #folder-song-list-track').forEach((rail) => {
      const el = rail as HTMLElement;
      el.style.transform = '';
      el.style.transition = '';
    });
  }

  private scrollSongBandCardIntoView(
    card: HTMLElement,
    behavior: ScrollBehavior = 'smooth',
  ): void {
    this.resetSongBandRailTransform();
    card.scrollIntoView({ behavior, block: 'nearest', inline: 'center' });
  }

  private scrollSelectedSongBandCardIntoView(behavior: ScrollBehavior = 'auto'): void {
    const scroll = this.overlay.querySelector('#select-hub-song-band-scroll') as HTMLElement | null;
    if (!scroll) return;

    const screen = this.overlay.querySelector('#select-hub-screen');
    const railSelector = screen?.classList.contains('is-folder-list-mode')
      ? '#folder-song-list-track'
      : screen?.classList.contains('is-builtin-mode')
        ? '#select-hub-builtin-rail'
        : null;
    if (!railSelector) return;

    const selected = scroll.querySelector(`${railSelector} .song-band-card.is-selected`) as HTMLElement | null;
    if (!selected) return;

    const run = () => this.scrollSongBandCardIntoView(selected, behavior);
    requestAnimationFrame(() => requestAnimationFrame(run));
  }

  private stepSelectHubSongBand(delta: number): void {
    if (!this.isSongBandVisible() || this.isRandomPickLocked()) return;
    if (this.selectHubBuiltinIndex !== null) {
      if (CHARTS.length <= 1) return;
      this.playUiNavigate();
      const next = stepBuiltinIndex(
        CHARTS,
        this.builtinSongSort,
        this.selectHubBuiltinIndex,
        delta,
      );
      this.selectSelectHubBuiltin(next);
      return;
    }
    if (!this.shouldShowFolderSongList()) return;
    const tracks = this.customLoader.getCatalog();
    if (tracks.length <= 1) return;
    this.playUiNavigate();
    const next = stepFolderCatalogIndex(
      tracks,
      this.folderSongSort,
      this.customLoader.getSelectedIndex(),
      delta,
      (track) => this.folderTrackSortMeta(track),
    );
    void this.loadSelectHubTrack(next);
  }

  private unbindSelectHubSongBandNav(): void {
    if (this.selectHubSongBandKeyHandler) {
      window.removeEventListener('keydown', this.selectHubSongBandKeyHandler, true);
      this.selectHubSongBandKeyHandler = null;
    }
    if (this.selectHubSongBandWheelTarget && this.selectHubSongBandWheelHandler) {
      this.selectHubSongBandWheelTarget.removeEventListener('wheel', this.selectHubSongBandWheelHandler);
    }
    this.selectHubSongBandWheelTarget = null;
    this.selectHubSongBandWheelHandler = null;
  }

  private bindSelectHubSongBandNav(): void {
    this.unbindSelectHubSongBandNav();

    this.overlay.querySelector('#song-band-nav-prev')?.addEventListener('click', () => {
      this.stepSelectHubSongBand(-1);
    });
    this.overlay.querySelector('#song-band-nav-next')?.addEventListener('click', () => {
      this.stepSelectHubSongBand(1);
    });

    const scroll = this.overlay.querySelector('#select-hub-song-band-scroll') as HTMLElement | null;
    if (scroll) {
      this.selectHubSongBandWheelTarget = scroll;
      this.selectHubSongBandWheelHandler = (e: WheelEvent) => {
        if (!this.isSongBandVisible()) return;
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        e.preventDefault();
        this.stepSelectHubSongBand(e.deltaY > 0 ? 1 : -1);
      };
      scroll.addEventListener('wheel', this.selectHubSongBandWheelHandler, { passive: false });
    }

    this.selectHubSongBandKeyHandler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (this.screenId !== 'select') return;
      if (!this.isSongBandVisible()) return;
      if (this.isRandomPickLocked()) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, select, textarea')) return;
      if (target.closest('button') && !target.closest('.song-band-nav')) return;

      let delta = 0;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') delta = -1;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') delta = 1;
      if (delta === 0) return;

      e.preventDefault();
      this.stepSelectHubSongBand(delta);
    };
    window.addEventListener('keydown', this.selectHubSongBandKeyHandler, true);
  }

  private canBuildCustomChart(): boolean {
    return this.customLoader.getBuffer() !== null;
  }

  private bindSelectHubDifficultyDock(): void {
    const dock = this.overlay.querySelector('#select-hub-tuning-panel');
    if (!dock || dock.dataset.dockBound === '1') return;
    dock.dataset.dockBound = '1';

    const updateChart = () => {
      if (this.selectHubBuiltinIndex !== null) {
        const chart = CHARTS[this.selectHubBuiltinIndex];
        this.selectedChart = chart;
        this.updateSelectHubCenterFromChart(chart, chart.title, chart.audioDuration ?? 0);
        return;
      }
      if (!this.canBuildCustomChart()) return;
      try {
        const c = this.customLoader.buildChart(this.customBpm, this.customOffset, this.customDifficulty);
        this.selectedChart = c;
        const entry = this.customLoader.getCatalog()[this.customLoader.getSelectedIndex()];
        this.updateSelectHubCenterFromChart(c, entry?.title ?? c.title, c.audioDuration ?? 0);
        updateTooltip(this.overlay, '#difficulty-label .has-tooltip', tDifficultyHint(this.customDifficulty));
      } catch (err) {
        console.error(err);
      }
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
        this.syncDifficultyPickerUi();
        updateChart();
      });
    });

    this.syncDifficultyPickerUi();
    this.bindScrollSpeedControl();
    updateChart();
  }

  private canRandomFolderPlay(): boolean {
    return this.customLoader.isFolderMode() && this.customLoader.getCatalog().length > 0;
  }

  consumeSkipGameCountdown(): boolean {
    const skip = this.skipNextGameCountdown;
    this.skipNextGameCountdown = false;
    return skip;
  }

  private resetRandomPickState(): void {
    this.skipNextGameCountdown = false;
    this.randomPick.reset();
  }

  private isRandomPickLocked(): boolean {
    return this.randomPick.isLocked();
  }

  private syncRandomPickLockUi(): void {
    this.randomPick.syncLockUi();
  }

  private syncRandomPlayButton(): void {
    const randomBtn = this.overlay.querySelector('#btn-select-random') as HTMLButtonElement | null;
    const playBtn = this.overlay.querySelector('#btn-select-start') as HTMLButtonElement | null;
    const locked = this.isRandomPickLocked() || this.isSelectHubRingLoading();
    if (randomBtn) {
      randomBtn.disabled = !this.canRandomFolderPlay() || locked;
    }
    if (playBtn) {
      playBtn.disabled = locked;
    }
  }

  private async startRandomFolderChart(): Promise<void> {
    await this.randomPick.start();
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
    this.selectHubBg.burstWarp();
    this.playUiDecide();
    if (this.selectHubBuiltinIndex !== null) {
      this.cancelFolderMetaPrefetch();
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
    if (this.selectHubRandomClickHandler) {
      this.overlay.querySelector('#btn-select-random')
        ?.removeEventListener('click', this.selectHubRandomClickHandler);
      this.selectHubRandomClickHandler = null;
    }
  }

  private bindSelectHubStart(): void {
    this.unbindSelectHubStart();
    this.selectHubStartKeyHandler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (this.isRandomPickLocked()) return;
      if (this.screenId !== 'select') return;
      if (!this.overlay.querySelector('#select-hub-screen')) return;
      if (e.key !== 'Enter') return;
      const target = e.target as HTMLElement;
      if (target.closest('#btn-select-start')) {
        e.preventDefault();
        void this.startSelectedChart();
        return;
      }
      if (target.closest('#btn-select-random')) return;
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

    const randomBtn = this.overlay.querySelector('#btn-select-random');
    if (randomBtn) {
      this.selectHubRandomClickHandler = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        void this.startRandomFolderChart();
      };
      randomBtn.addEventListener('click', this.selectHubRandomClickHandler);
    }
    this.syncRandomPlayButton();

    const center = this.overlay.querySelector('#song-ring-center');
    center?.addEventListener('dblclick', () => {
      void this.startSelectedChart();
    });
  }

  private bindSelectHubFolderNav(): void {
    this.bindSelectHubSongList();
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
      if (!this.canBuildCustomChart()) {
        void this.loadSelectHubTrack(this.customLoader.getSelectedIndex());
        return;
      }
      const chart = this.customLoader.buildChart(this.customBpm, this.customOffset, this.customDifficulty);
      this.selectedChart = chart;
      const entry = catalog[this.customLoader.getSelectedIndex()];
      this.updateSelectHubCenterFromChart(chart, entry?.title ?? chart.title, chart.audioDuration ?? 0);
      this.syncSelectHubPreviewToggle();
      if (this.audio.isPreviewEnabled() && this.customLoader.getBuffer()) {
        void this.audio.startUserPreview();
      }
      return;
    }

    if (this.customLoader.getImportMode() === 'single' && this.customLoader.getBuffer()) {
      const chart = this.customLoader.buildChart(this.customBpm, this.customOffset, this.customDifficulty);
      this.selectedChart = chart;
      this.updateSelectHubCenterFromChart(chart, chart.title, chart.audioDuration ?? 0);
      this.syncSelectHubPreviewToggle();
      if (this.audio.isPreviewEnabled()) {
        void this.audio.startUserPreview();
      }
      return;
    }

    this.selectedChart = null;
    this.updateSelectHubEmptyCustomCenter();
    this.syncSelectHubPreviewToggle(false);
  }

  private flashBandCardDecide(card: HTMLElement | null): void {
    if (!card) return;
    this.overlay.querySelectorAll('.song-band-card.is-band-decide-flash').forEach((el) => {
      el.classList.remove('is-band-decide-flash');
    });
    card.classList.remove('is-band-decide-flash');
    void card.offsetWidth;
    card.classList.add('is-band-decide-flash');
    const clear = () => card.classList.remove('is-band-decide-flash');
    card.addEventListener('animationend', clear, { once: true });
    window.setTimeout(clear, 950);
  }

  private flashSelectedBandCard(): void {
    const card = this.overlay.querySelector('.song-band-card.is-selected') as HTMLElement | null;
    this.flashBandCardDecide(card);
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
    if (metaEl) metaEl.textContent = '';
    if (statsEl) statsEl.textContent = '\u2014';
    if (counterEl) counterEl.textContent = '';
    this.updateSelectHubChartAnalysis(null);
    this.syncSelectHubPreviewToggle(false);
  }

  private updateSelectHubChartAnalysis(chart: ChartData | null): void {
    const levelSlot = this.overlay.querySelector('#song-chart-level-slot');
    if (levelSlot) levelSlot.innerHTML = renderChartLevelHtml(chart, 'panel');

    const bestSlot = this.overlay.querySelector('#song-best-grade-slot');
    if (bestSlot) bestSlot.innerHTML = renderChartBestGradeBadge(chart, 'panel');

    const { radarHtml } = renderSongChartAnalysisHtml(chart, { largeRadar: true });
    const radarEl = this.overlay.querySelector('#song-chart-radar');
    if (radarEl) {
      radarEl.innerHTML = radarHtml;
      radarEl.setAttribute('aria-hidden', chart && chart.notes.length > 0 ? 'false' : 'true');
      if (chart?.id) (radarEl as HTMLElement).dataset.chartId = chart.id;
      else delete (radarEl as HTMLElement).dataset.chartId;
    }

    this.refreshSelectHubBuiltinCardRatings();
    this.refreshFolderSongCardRatings();
  }

  private refreshFolderSongCardRatings(): void {
    this.overlay.querySelectorAll('.folder-song-item').forEach((card) => {
      const index = Number((card as HTMLElement).dataset.listIndex);
      if (Number.isNaN(index)) return;
      const levelEl = card.querySelector('.song-band-card__level');
      if (levelEl) levelEl.innerHTML = renderChartLevelHtml(this.folderSongCardChart(index), 'card');
    });
  }

  private refreshSelectHubBuiltinCardRatings(): void {
    this.overlay.querySelectorAll('.select-hub-builtin-card').forEach((card) => {
      const index = Number((card as HTMLElement).dataset.builtinIndex);
      if (Number.isNaN(index)) return;
      const chart = CHARTS[index];
      if (!chart) return;
      const levelEl = card.querySelector('.song-band-card__level');
      if (levelEl) levelEl.innerHTML = renderChartLevelHtml(chart, 'card');
    });
  }

  private selectSelectHubBuiltin(index: number, playSound = true): void {
    if (playSound) this.playUiSelect();
    this.selectHubBuiltinIndex = index;
    this.audio.stopPreviewPlayback();
    this.cancelFolderMetaPrefetch();
    this.customLoader.clear();
    const chart = CHARTS[index];
    this.selectedChart = chart;
    this.refreshSelectHubSidebarSelection();
    this.syncSelectHubBuiltinModeClass();
    this.scrollSelectedSongBandCardIntoView('auto');
    this.refreshSelectHubRing();
    this.updateSelectHubCenterFromChart(chart, chart.title, chart.audioDuration ?? 0);
    this.syncSelectHubPreviewToggle(false);
    this.syncRandomPlayButton();
    this.scrollSelectedSongBandCardIntoView('auto');
    this.syncSongBandNavButtons();
    this.flashSelectedBandCard();
  }

  private refreshSelectHubSidebarSelection(): void {
    this.overlay.querySelectorAll('.select-hub-builtin-card').forEach((card) => {
      const index = Number((card as HTMLElement).dataset.builtinIndex);
      card.classList.toggle('is-selected', index === this.selectHubBuiltinIndex);
    });
    const customPanel = this.overlay.querySelector('#select-hub-custom-panel');
    customPanel?.classList.toggle('is-selected', this.selectHubBuiltinIndex === null);
    customPanel?.classList.toggle('is-import-prompt', !this.hasCustomMusicLoaded());
    this.refreshSelectHubCustomPanelInfo();
  }

  private refreshSelectHubCustomPanelInfo(): void {
    const { name, fileCount } = this.customFolderPanelInfo();
    const nameEl = this.overlay.querySelector('#select-hub-custom-folder-name');
    const countEl = this.overlay.querySelector('#select-hub-custom-folder-count');
    if (nameEl) {
      nameEl.textContent = name;
      nameEl.setAttribute('title', name);
    }
    if (countEl) countEl.textContent = t('ui.customFolderFileCount', { count: fileCount });
  }

  private syncSelectHubBuiltinModeClass(): void {
    this.overlay.querySelector('#select-hub-screen')?.classList.toggle(
      'is-builtin-mode',
      this.selectHubBuiltinIndex !== null,
    );
    this.syncSelectHubFolderListModeClass();
    this.syncSongBandNavButtons();
  }

  private syncSelectHubFolderListModeClass(): void {
    this.overlay.querySelector('#select-hub-screen')?.classList.toggle(
      'is-folder-list-mode',
      this.selectHubBuiltinIndex === null && this.shouldShowFolderSongList(),
    );
  }

  private refreshSelectHubBuiltinCards(): void {
    const rail = this.overlay.querySelector('#select-hub-builtin-rail');
    if (!rail) return;
    rail.innerHTML = this.selectHubBuiltinCardsHtml();
    this.bindSelectHubBuiltinCardClicks();
    this.scrollSelectedSongBandCardIntoView();
    this.syncSongBandNavButtons();
  }

  private bindSelectHubBuiltinCardClicks(): void {
    this.overlay.querySelectorAll('.select-hub-builtin-card').forEach((card) => {
      card.addEventListener('click', () => {
        if (this.isRandomPickLocked()) return;
        const index = Number((card as HTMLElement).dataset.builtinIndex);
        if (Number.isNaN(index)) return;
        this.selectSelectHubBuiltin(index);
      });
    });
  }

  private folderTrackSortMeta(track: { file: File }) {
    return this.customLoader.getTrackSortMeta(track.file);
  }

  private formatFolderSongCardMeta(track: { file: File }): string {
    const meta = this.folderTrackSortMeta(track);
    const parts: string[] = [];
    if (meta.bpm != null) parts.push(formatChartBpm(meta.bpm));
    if (meta.duration != null) parts.push(this.formatDuration(meta.duration));
    return parts.length > 0 ? parts.join(' \u00b7 ') : '\u2014';
  }

  private folderSongCardChart(catalogIndex: number): ChartData | null {
    const selected = this.customLoader.getSelectedIndex();
    if (
      catalogIndex === selected
      && this.selectedChart
      && this.selectedChart.notes.length > 0
    ) {
      return this.selectedChart;
    }
    const entry = this.customLoader.getCatalog()[catalogIndex];
    if (!entry) return null;
    return this.customLoader.buildChartPreviewForFile(
      entry.file,
      this.customDifficulty,
    );
  }

  private cancelFolderMetaPrefetch(): void {
    this.folderMetaPrefetchGen++;
    this.folderMetaPrefetchingIndex = null;
    this.applySelectHubListLoadingState();
  }

  private startFolderMetaPrefetch(priorityIndex = this.selectHubTrackIndex): void {
    if (!this.customLoader.isFolderMode()) return;
    const catalog = this.customLoader.getCatalog();
    if (catalog.length === 0) return;

    const gen = ++this.folderMetaPrefetchGen;
    const wrapped = ((priorityIndex % catalog.length) + catalog.length) % catalog.length;
    const order: number[] = [wrapped];
    for (let i = 0; i < catalog.length; i++) {
      if (i !== wrapped) order.push(i);
    }

    void this.runFolderMetaPrefetch(gen, order);
  }

  private async runFolderMetaPrefetch(gen: number, order: readonly number[]): Promise<void> {
    for (const catalogIndex of order) {
      if (gen !== this.folderMetaPrefetchGen || this.screenId !== 'select') return;
      if (!this.customLoader.isFolderMode()) return;

      const catalog = this.customLoader.getCatalog();
      const entry = catalog[catalogIndex];
      if (!entry || this.customLoader.hasTrackMeta(entry.file)) {
        if (entry) this.patchFolderSongCardMeta(catalogIndex);
        continue;
      }

      try {
        this.setFolderMetaPrefetchingIndex(catalogIndex);
        await this.customLoader.analyzeTrackMeta(entry.file);
        if (gen !== this.folderMetaPrefetchGen || this.screenId !== 'select') return;
        this.onFolderTrackMetaReady(catalogIndex);
      } catch (err) {
        console.warn('[UIManager] folder track meta prefetch failed', entry.title, err);
        this.customLoader.markTrackMetaFailed(entry.file);
        if (gen === this.folderMetaPrefetchGen && this.screenId === 'select') {
          this.onFolderTrackMetaReady(catalogIndex);
        }
      } finally {
        if (this.folderMetaPrefetchingIndex === catalogIndex) {
          this.setFolderMetaPrefetchingIndex(null);
        }
      }
    }
    this.setFolderMetaPrefetchingIndex(null);
  }

  private isFolderSongItemLoading(catalogIndex: number): boolean {
    const catalog = this.customLoader.getCatalog();
    const entry = catalog[catalogIndex];
    if (!entry) return false;
    if (this.selectHubLoadingCatalogIndex === catalogIndex) return true;
    if (this.folderMetaPrefetchingIndex === catalogIndex) return true;
    return !this.customLoader.hasTrackMeta(entry.file);
  }

  private setFolderMetaPrefetchingIndex(catalogIndex: number | null): void {
    this.folderMetaPrefetchingIndex = catalogIndex;
    this.applySelectHubListLoadingState();
  }

  private onFolderTrackMetaReady(catalogIndex: number): void {
    this.patchFolderSongCardMeta(catalogIndex);
    this.patchFolderSongCardLevel(catalogIndex);
    this.applySelectHubListLoadingState();
    if (this.folderSongSort.key === 'bpm' || this.folderSongSort.key === 'duration') {
      this.refreshSelectHubSongList();
    }
  }

  private patchFolderSongCardLevel(catalogIndex: number): void {
    const levelEl = this.overlay.querySelector(
      `.folder-song-item[data-list-index="${catalogIndex}"] .song-band-card__level`,
    );
    if (!levelEl) return;
    levelEl.innerHTML = renderChartLevelHtml(this.folderSongCardChart(catalogIndex), 'card');
  }

  private patchFolderSongCardMeta(catalogIndex: number): void {
    const metaEl = this.overlay.querySelector(
      `.folder-song-item[data-list-index="${catalogIndex}"] .song-band-card__meta`,
    );
    if (!metaEl) return;
    const catalog = this.customLoader.getCatalog();
    const entry = catalog[catalogIndex];
    if (!entry) return;
    metaEl.textContent = this.formatFolderSongCardMeta(entry);
  }

  private syncSongSortDirectionUi(prefix: 'builtin' | 'folder', settings: SongSortSettings): void {
    const enabled = isSongSortDirectionEnabled(settings);
    const group = this.overlay.querySelector(`#${prefix}-song-sort-bar .song-sort-direction`);
    group?.classList.toggle('is-disabled', !enabled);
    group?.querySelectorAll<HTMLButtonElement>('.song-sort-dir-btn').forEach((btn) => {
      const dir = btn.dataset.dir as SongSortDirection;
      const active = enabled && settings.direction === dir;
      btn.disabled = !enabled;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  private applyBuiltinSongSort(settings: SongSortSettings): void {
    this.builtinSongSort = settings;
    saveBuiltinSongSort(settings);
    this.syncSongSortDirectionUi('builtin', settings);
    this.refreshSelectHubBuiltinCards();
  }

  private applyFolderSongSort(settings: SongSortSettings): void {
    this.folderSongSort = settings;
    saveFolderSongSort(settings);
    this.syncSongSortDirectionUi('folder', settings);
    this.refreshSelectHubSongList();
    const chart = this.selectedChart;
    const catalog = this.customLoader.getCatalog();
    if (chart && catalog.length > 0) {
      const idx = this.customLoader.getSelectedIndex();
      const entry = catalog[idx];
      this.updateSelectHubCenterFromChart(
        chart,
        entry?.title ?? chart.title,
        chart.audioDuration ?? 0,
      );
    }
  }

  private bindSongSortControls(): void {
    const bind = (
      prefix: 'builtin' | 'folder',
      keys: readonly SongSortKey[],
      getSettings: () => SongSortSettings,
      apply: (settings: SongSortSettings) => void,
    ) => {
      const keySelect = this.overlay.querySelector(`#${prefix}-song-sort-key`) as HTMLSelectElement | null;
      if (keySelect && keySelect.dataset.bound !== '1') {
        keySelect.dataset.bound = '1';
        keySelect.addEventListener('change', () => {
          if (this.isRandomPickLocked()) return;
          const key = keySelect.value as SongSortKey;
          if (!keys.includes(key)) return;
          const current = getSettings();
          if (key === current.key) return;
          this.playUiSelect();
          apply({ key, direction: current.direction });
        });
      }

      this.overlay.querySelectorAll(`#${prefix}-song-sort-bar .song-sort-dir-btn`).forEach((btn) => {
        const el = btn as HTMLButtonElement;
        if (el.dataset.bound === '1') return;
        el.dataset.bound = '1';
        el.addEventListener('click', () => {
          if (this.isRandomPickLocked()) return;
          const direction = el.dataset.dir as SongSortDirection;
          const current = getSettings();
          if (!isSongSortDirectionEnabled(current) || current.direction === direction) return;
          this.playUiSelect();
          apply({ key: current.key, direction });
        });
      });
    };

    bind('builtin', BUILTIN_SORT_KEYS, () => this.builtinSongSort, (s) => this.applyBuiltinSongSort(s));
    bind('folder', FOLDER_SORT_KEYS, () => this.folderSongSort, (s) => this.applyFolderSongSort(s));
  }

  private syncFolderSongListSelection(selectedIndex = this.customLoader.getSelectedIndex()): void {
    this.overlay.querySelectorAll('#folder-song-list-track .folder-song-item').forEach((item) => {
      const idx = Number((item as HTMLElement).dataset.listIndex);
      const selected = idx === selectedIndex;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    this.applySelectHubListLoadingState();
  }

  private scrollSelectedFolderSongCardIntoView(behavior: ScrollBehavior = 'auto'): void {
    const selectedEl = this.overlay.querySelector(
      `#folder-song-list-track .folder-song-item[data-list-index="${this.customLoader.getSelectedIndex()}"]`,
    ) as HTMLElement | null;
    if (selectedEl) this.scrollSongBandCardIntoView(selectedEl, behavior);
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
    const rows = sortFolderCatalog(
      catalog,
      this.folderSongSort,
      (track) => this.folderTrackSortMeta(track),
    );
    track.innerHTML = renderFolderSongList(
      rows,
      selected,
      (catalogIndex) => this.isFolderSongItemLoading(catalogIndex),
      (track) => this.formatFolderSongCardMeta(track),
      (track) => getSongBestGrade(trackEntryRecordKey(track)),
      (_track, catalogIndex) => this.folderSongCardChart(catalogIndex),
    );
    this.applySelectHubListLoadingState();
    this.scrollSelectedFolderSongCardIntoView('auto');
    this.syncSongBandNavButtons();
  }

  private bindSelectHubSongList(): void {
    const track = this.overlay.querySelector('#folder-song-list-track');
    if (!track || track.dataset.listBound === '1') return;
    track.dataset.listBound = '1';
    track.addEventListener('click', (e) => {
      if (this.isRandomPickLocked()) return;
      const btn = (e.target as Element).closest('.folder-song-item');
      if (!btn) return;
      const index = Number((btn as HTMLElement).dataset.listIndex);
      if (Number.isNaN(index)) return;
      if (this.isFolderSongItemLoading(index)) return;
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
      return this.selectHubLoadingCatalogIndex !== null;
    }
    return this.overlay.querySelector('#select-hub-screen')?.classList.contains('is-loading-track') ?? false;
  }

  private applySelectHubListLoadingState(): void {
    this.overlay.querySelectorAll('#folder-song-list-track .folder-song-item').forEach((item) => {
      const idx = Number((item as HTMLElement).dataset.listIndex);
      const loading = this.isFolderSongItemLoading(idx);
      item.classList.toggle('is-loading', loading);
      item.setAttribute('aria-busy', loading ? 'true' : 'false');
      if (item instanceof HTMLButtonElement) {
        item.disabled = loading;
      }
    });
  }

  private setSelectHubTrackItemLoading(loading: boolean, catalogIndex?: number): void {
    if (loading) {
      this.selectHubLoadingCatalogIndex = catalogIndex ?? this.customLoader.getSelectedIndex();
    } else {
      this.selectHubLoadingCatalogIndex = null;
    }
    this.applySelectHubListLoadingState();
  }

  private setSelectHubRingLoading(loading: boolean): void {
    if (this.overlay.querySelector('#folder-song-list-track')) {
      this.setSelectHubTrackItemLoading(loading);
    } else {
      this.overlay.querySelector('#select-hub-screen')?.classList.toggle('is-loading-track', loading);
    }
    this.overlay.querySelector('#song-ring-center')?.classList.toggle('is-preview-loading', loading);
    this.syncSelectHubPreviewToggle(loading);
    this.updateSelectHubDpadEnabled();
    this.syncRandomPlayButton();
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
        const displayIndex = folderCatalogDisplayIndex(
          catalog,
          this.folderSongSort,
          idx,
          (track) => this.folderTrackSortMeta(track),
        );
        counterEl.textContent = t('ui.customFolderTrack', {
          current: displayIndex + 1,
          total: catalog.length,
        });
      } else {
        counterEl.textContent = '';
      }
    }
    this.updateSelectHubChartAnalysis(chart);
    this.syncSelectHubPreviewToggle();
  }

  private async loadSelectHubTrack(index: number, options?: { silent?: boolean }): Promise<void> {
    const silent = options?.silent ?? this.customLoader.getCatalog().length <= 1;
    const gen = ++this.selectHubTrackLoadGen;
    this.selectHubTrackIndex = index;
    this.selectHubBuiltinIndex = null;
    this.customLoader.setSelectedIndex(index);
    this.syncFolderSongListSelection(index);
    this.scrollSelectedFolderSongCardIntoView('auto');
    this.syncSelectHubBuiltinModeClass();
    this.refreshSelectHubSidebarSelection();
    this.audio.stopPreviewPlayback();

    const catalog = this.customLoader.getCatalog();
    const entry = catalog[index];
    if (entry) {
      this.setRingCenterTitle(entry.title);
      const counterEl = this.overlay.querySelector('#ring-track-counter');
      if (counterEl && catalog.length > 1) {
        const displayIndex = folderCatalogDisplayIndex(
          catalog,
          this.folderSongSort,
          index,
          (track) => this.folderTrackSortMeta(track),
        );
        counterEl.textContent = t('ui.customFolderTrack', {
          current: displayIndex + 1,
          total: catalog.length,
        });
      }
    }

    if (!silent) {
      this.selectHubLoadingCatalogIndex = index;
    }
    this.applySelectHubListLoadingState();

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
      if (this.folderSongSort.key === 'bpm' || this.folderSongSort.key === 'duration') {
        this.refreshSelectHubSongList();
      }

      if (this.audio.isPreviewEnabled()) {
        await this.audio.startUserPreview();
        if (gen !== this.selectHubTrackLoadGen) return;
      }

      if (!silent) {
        this.flashSelectedBandCard();
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
        this.selectHubLoadingCatalogIndex = null;
        this.applySelectHubListLoadingState();
        this.setSelectHubRingLoading(false);
      } else if (gen === this.selectHubTrackLoadGen) {
        this.syncSelectHubPreviewToggle(false);
      }
    }
  }

  private bindPreviewToggle(
    trigger: Element | null,
    isLoading: () => boolean,
  ): void {
    if (!trigger) return;
    const el = trigger as HTMLElement;
    if (el.dataset.previewBound === '1') {
      this.syncPreviewToggleState(trigger, isLoading());
      return;
    }
    el.dataset.previewBound = '1';
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

  private applyCustomFolder(
    files: File[],
    folderName = '',
    options?: { navigate?: boolean },
  ) {
    const audioFiles = filterAudioFiles(files);
    if (audioFiles.length === 0) {
      this.showImportError(t('ui.customFolderEmpty'));
      return;
    }

    const folderLabel = folderName || folderNameFromFiles(audioFiles);
    this.cancelFolderMetaPrefetch();
    this.customLoader.setCatalogFromFiles(audioFiles, folderLabel);
    this.customBpm = 128;
    this.customOffset = 0;
    this.customDifficulty = 'NORMAL';
    this.selectHubBuiltinIndex = null;
    this.selectHubTrackIndex = 0;
    if (options?.navigate !== false) {
      this.playUiSelect();
      void this.showSelect();
    }
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
        <div class="countdown-display" id="countdown">${GAME_COUNTDOWN_SECONDS}</div>
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
    label.textContent = t('ui.loadingProgress', { pct });
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
              ? this.escapeHtml(t('ui.loadingProgress', { pct }))
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
    this.resetRandomPickState();
    this.screenId = 'none';
    this.clearTouchZones();
    this.hidePlayHud();
    this.stopSelectHubBackground();
    this.stopResultBackground();
    this.unbindCustomRingNavigation();
    this.overlay.innerHTML = '';
    this.overlay.classList.add('hidden');
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
    this.stopSelectHubBackground();
    this.stopTitleBackground();
    this.stopResultBackground();
    this.hidePlayHud();
    this.lastChart = chart;
    this.overlay.classList.remove('hidden');

    const grade = getRank(stats, chart);
    const acc = getAccuracy(stats);
    const rankClass = ddrGradeCssClass(grade);
    const diffClass = difficultyCssClass(chart.difficulty);
    const diffLabel = formatChartDifficultyLabel(chart.difficulty);
    const clearBadges = [
      stats.failed ? `<p class="result-clear result-clear--failed">${t('ui.failed')}</p>` : '',
      stats.perfectFullCombo ? `<p class="result-clear result-clear--pfc">${t('ui.perfectFullCombo')}</p>` : '',
      !stats.perfectFullCombo && stats.fullCombo ? `<p class="result-clear result-clear--fc">${t('ui.fullCombo')}</p>` : '',
    ].filter(Boolean).join('');

    this.render(`
      <div class="screen result-screen">
        <div class="result-bg-fx" id="result-bg-fx" aria-hidden="true"></div>
        <div class="result-overlay-fx" aria-hidden="true">
          <div class="result-prism-veil"></div>
          <div class="result-chroma-edge"></div>
        </div>
        <div class="result-panel">
          <div class="result-summary">
            <div class="result-rank result-rank-pending" id="result-rank-slot" aria-live="polite">···</div>
            ${clearBadges}
            <h2 class="result-title">${this.escapeHtml(chart.title)}</h2>
            <p class="result-difficulty ${diffClass}">${this.escapeHtml(diffLabel)}</p>
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
    `);

    this.mountResultBackground();

    this.overlay.querySelector('#btn-retry')?.addEventListener('click', () => {
      this.stopResultBackground();
      if (this.lastChart) {
        this.resultRevealGen++;
        this.playUiDecide();
        this.overlay.innerHTML = '';
        this.onStart(this.lastChart);
      }
    });
    this.overlay.querySelector('#btn-menu')?.addEventListener('click', () => {
      this.resultRevealGen++;
      this.playUiNavigate();
      if (!this.lastChart?.customAudio) {
        this.cancelFolderMetaPrefetch();
        this.customLoader.clear();
      }
      this.onBack();
      this.showSelect();
    });

    void this.runResultRevealSequence(grade, rankClass);
  }

  private async runResultRevealSequence(grade: DdrGrade, rankClass: string): Promise<void> {
    const token = ++this.resultRevealGen;
    await this.audio.playResultAnnounce();
    if (token !== this.resultRevealGen || this.screenId !== 'result') return;
    await new Promise((r) => setTimeout(r, RESULT_RANK_REVEAL_DELAY_MS));
    if (token !== this.resultRevealGen || this.screenId !== 'result') return;

    const rankEl = this.overlay.querySelector('#result-rank-slot');
    if (rankEl) {
      rankEl.textContent = grade;
      rankEl.className = `result-rank ${rankClass} result-rank-revealed`;
    }
    if (this.resultChart) {
      recordSongBestGrade(this.resultChart, grade);
    }
    void this.audio.playResultVoice(getResultVoiceId(grade));
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
  }
}
