import musicSelectTitleImageSrc from '../assets/music_select_title.png?url';
import titleLogoSrc from '../assets/title_logo.png?url';
import type { ChartData, GameStats } from '../types';
import { LANE_COLORS, LANE_LABELS } from '../types';
import { CHARTS, getRank } from '../data/charts';
import { recordSongBestGrade, getSongBestGrade } from '../data/songBestGrade';
import { trackEntryRecordKey } from '../data/songRecordKey';
import { ddrGradeCssClass, type DdrGrade } from '../scoring/ddrScoring';
import type { CustomSongLoader } from '../audio/CustomSongLoader';
import { type CustomDifficulty } from '../audio/AutoChartGenerator';
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
  loadScrollSpeed,
  saveScrollSpeed,
  formatScrollSpeed,
  MIN_SCROLL_SPEED,
  MAX_SCROLL_SPEED,
} from '../settings/scrollSpeed';
import {
  loadDisplayTiming,
  saveDisplayTiming,
  formatDisplayTiming,
} from '../settings/displayTiming';
import { loadLaneBackground, saveLaneBackground } from '../settings/laneBackground';
import { saveCustomLaneBackgroundDataUrl } from '../settings/customLaneBackgroundImage';
import { preloadCustomLaneBackgroundImage } from '../game/laneBackground';
import {
  resolveFolderTrackIndex,
  saveLastFolderTrackRecordKey,
} from '../settings/folderSelectState';
import { getPersistedTrackMeta } from '../data/trackMetaCache';
import { getGenreLabel } from '../audio/musicGenre';
import type { LaneBackgroundId } from '../game/laneBackground';
import {
  DEFAULT_REDUCED_FLASH,
  loadReducedFlash,
  saveReducedFlash,
} from '../settings/reducedFlash';
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
import { renderChartLevelHtml, renderSongChartAnalysisHtml } from './chartRadarView';
import { chartDisplayLevel } from '../chart/chartRadar';
import { renderChartBestGradeBadge, renderBestGradeBadgeHtml } from './bestGradeView';
import { RandomPickController } from './RandomPickController';
import { escapeHtml } from './htmlUtils';
import { accessibilityNoticeHtml, titleEqBarsHtml } from './titleScreenView';
import { renderResultScreenHtml, renderResultStarsRevealHtml } from './resultScreenView';
import {
  renderSelectHubScreenHtml,
  selectHubBuiltinCardsHtml,
  type SelectHubViewState,
} from './selectHubView';
import { showUserError } from './uiErrors';
import { gradeToResultStars } from '../scoring/resultStars';
import {
  renderFlashToggleButtonHtml,
  renderHubToggleButtonHtml,
  syncHubToggleElement,
} from './toggleControls';
import {
  sortFolderCatalog,
  folderCatalogDisplayIndex,
  stepFolderCatalogIndex,
  firstFolderCatalogIndex,
  lastFolderCatalogIndex,
} from '../audio/songCatalogSort';
import { stepBuiltinIndex, firstBuiltinIndex, lastBuiltinIndex } from '../data/builtinCatalogSort';
import {
  BUILTIN_SORT_KEYS,
  FOLDER_SORT_KEYS,
  isSongSortDirectionEnabled,
  loadBuiltinSongSort,
  loadFolderSongSort,
  saveBuiltinSongSort,
  saveFolderSongSort,
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
  type Locale,
  type MessageKey,
} from '../i18n';

const ENABLE_STAGE_FX_DEBUG = false;

type ScreenId = 'title' | 'select' | 'countdown' | 'loading' | 'error' | 'result' | 'none';

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
  private getBuiltinPreviewBuffer: ((chartId: string) => AudioBuffer | null) | null;
  private selectedChart: ChartData | null = null;
  private lastChart: ChartData | null = null;
  private customBpm = 128;
  private customOffset = 0;
  private customDifficulty: CustomDifficulty = 'NORMAL';
  private customMusicPickerOpen = false;
  private nativeFolderPickActive = false;
  private scrollSpeed = loadScrollSpeed();
  private displayTiming = loadDisplayTiming();
  private laneBackground = loadLaneBackground();
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
    getBuiltinPreviewBuffer?: (chartId: string) => AudioBuffer | null,
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
    this.getBuiltinPreviewBuffer = getBuiltinPreviewBuffer ?? null;
    this.reducedFlash = loadReducedFlash();
    this.titleSoundEnabled = loadTitleSound();
    this.stageFxPattern = loadStageFxPattern();
    preloadCustomLaneBackgroundImage();
    this.applyReducedFlashClass();
    this.syncEqMotionState();
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
      escapeHtml,
      loadSelectHubTrack: (index, opts) => this.loadSelectHubTrack(index, opts),
      startSelectedChart: () => this.startSelectedChart(),
      unbindCustomRingNavigation: () => this.unbindCustomRingNavigation(),
      bindSelectHubRing: () => this.bindSelectHubRing(),
      syncRandomPlayButton: () => this.syncRandomPlayButton(),
      syncSongBandNavButtons: () => this.syncSongBandNavButtons(),
      burstSelectHubWarp: () => this.selectHubBg.burstWarp(),
      requestSkipGameCountdown: () => {
        this.skipNextGameCountdown = true;
      },
    });

    onLocaleChange(() => this.refreshScreen());
  }

  private refreshScreen(): void {
    switch (this.screenId) {
      case 'title':
        this.showTitle();
        break;
      case 'select':
        this.showSelect();
        break;
      case 'countdown':
        if (this.countdownChart) this.showCountdownOverlay(this.countdownChart);
        break;
      case 'loading':
        this.renderLoadingScreen();
        break;
      case 'error':
        this.showError(this.errorMessage);
        break;
      case 'result':
        if (this.resultStats && this.resultChart) {
          this.showResult(this.resultStats, this.resultChart);
        }
        break;
      default:
        break;
    }
    if (this.screenId === 'none' && !this.playHud.classList.contains('hidden')) {
      this.showNavHud('play');
    }
  }

  getScrollSpeed(): number {
    return this.scrollSpeed;
  }

  getDisplayTiming(): number {
    return this.displayTiming;
  }

  getLaneBackground(): LaneBackgroundId {
    return this.laneBackground;
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
      ...Array.from(
        { length: STAGE_FX_PATTERN_COUNT },
        (_, i) =>
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

  private panelClass(extra = ''): string {
    return `corner-panel settings-corner-panel title-settings-panel${extra ? ` ${extra}` : ''}`;
  }

  private titleSoundToggleHtml(): string {
    return renderHubToggleButtonHtml({
      id: 'title-sound-toggle',
      on: this.titleSoundEnabled,
      ariaLabelKey: 'ui.titleSoundToggle',
      titleKey: 'ui.titleSoundToggle',
    });
  }

  private selectHubPreviewToggleButtonHtml(): string {
    return renderHubToggleButtonHtml({
      id: 'select-hub-preview-toggle',
      on: this.audio.isPreviewEnabled(),
      ariaLabelKey: 'ui.previewToggle',
      titleKey: 'ui.previewToggle',
      onLabelKey: 'ui.previewOn',
      offLabelKey: 'ui.previewOff',
    });
  }

  private selectHubPreviewToggleEl(): HTMLElement | null {
    return this.overlay.querySelector('#select-hub-preview-toggle');
  }

  private bindSelectHubPreviewToggle(): void {
    this.bindPreviewToggle(this.selectHubPreviewToggleEl(), () => this.isSelectHubRingLoading());
  }

  private syncSelectHubPreviewToggle(loading?: boolean): void {
    this.syncPreviewToggleState(
      this.selectHubPreviewToggleEl(),
      loading ?? this.isSelectHubRingLoading(),
    );
  }

  private titleFlashControlHtml(): string {
    return renderFlashToggleButtonHtml(this.reducedFlash);
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
    syncHubToggleElement(btn, { on: this.titleSoundEnabled });
    this.syncEqMotionState();
  }

  private syncEqMotionState(): void {
    const eqActive =
      this.screenId === 'select'
        ? this.audio.isPreviewEnabled()
        : this.screenId === 'title'
          ? this.titleSoundEnabled
          : false;
    document.body.classList.toggle('title-sound-off', !eqActive);
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
    syncHubToggleElement(btn, { on: this.reducedFlash });
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

  private bindDisplayTimingControl() {
    const slider = this.overlay.querySelector('#display-timing-slider') as HTMLInputElement;
    slider?.addEventListener('input', () => {
      this.displayTiming = Number(slider.value);
      saveDisplayTiming(this.displayTiming);
      const el = this.overlay.querySelector('#display-timing-value');
      if (el) el.textContent = formatDisplayTiming(this.displayTiming);
    });
  }

  private bindLaneBackgroundControl() {
    const select = this.overlay.querySelector('#lane-background-select') as HTMLSelectElement;
    select?.addEventListener('change', () => {
      this.laneBackground = select.value as LaneBackgroundId;
      saveLaneBackground(this.laneBackground);
    });

    const fileInput = this.overlay.querySelector(
      '#lane-background-image-input',
    ) as HTMLInputElement;
    const pickBtn = this.overlay.querySelector('#btn-lane-background-image');

    pickBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.playUiSelect();
      fileInput?.click();
    });

    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      void this.applyCustomLaneBackgroundImage(file);
    });
  }

  private async applyCustomLaneBackgroundImage(file: File): Promise<void> {
    try {
      const dataUrl = await this.readImageFileAsDataUrl(file);
      if (!saveCustomLaneBackgroundDataUrl(dataUrl)) {
        this.showImportError(t('settings.laneBgImageFailed'));
        return;
      }
      preloadCustomLaneBackgroundImage(dataUrl);
      this.laneBackground = 'custom';
      saveLaneBackground('custom');
      const select = this.overlay.querySelector('#lane-background-select') as HTMLSelectElement;
      if (select) select.value = 'custom';
    } catch {
      this.showImportError(t('settings.laneBgImageFailed'));
    }
  }

  private readImageFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('invalid image data'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsDataURL(file);
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
      if (target.closest('.title-settings-bar, .hub-toggle')) return;
      navigate();
    };
    this.overlay.addEventListener('pointerdown', this.titlePointerHandler);

    this.titleKeyHandler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (!this.overlay.querySelector('#title-screen')) return;
      const target = e.target as HTMLElement;
      if (
        target.closest(
          '.title-settings-bar input, .title-settings-bar select, .title-settings-bar textarea, .title-settings-bar button, .hub-toggle, .hub-toggle--flash',
        )
      ) {
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
        ${accessibilityNoticeHtml()}
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

  private buildSelectHubViewState(): SelectHubViewState {
    const isBuiltin = this.selectHubBuiltinIndex !== null;
    const { name, fileCount } = this.customFolderPanelInfo();
    return {
      isBuiltin,
      folderListMode: !isBuiltin && this.shouldShowFolderSongList(),
      musicSelectTitleImageSrc,
      selectHubBuiltinIndex: this.selectHubBuiltinIndex,
      selectHubTrackIndex: this.selectHubTrackIndex,
      customDifficulty: this.customDifficulty,
      customBpm: this.customBpm,
      customOffset: this.customOffset,
      scrollSpeed: this.scrollSpeed,
      displayTiming: this.displayTiming,
      laneBackground: this.laneBackground,
      builtinSongSort: this.builtinSongSort,
      folderSongSort: this.folderSongSort,
      customFolderName: name,
      customFolderFileCount: fileCount,
      customImportPrompt: !this.hasCustomMusicLoaded(),
      previewToggleHtml: this.selectHubPreviewToggleButtonHtml(),
      selectedChart: this.selectedChart,
      catalogTitles: this.customLoader.getCatalog().map((e) => e.title),
    };
  }

  private shouldShowFolderSongList(): boolean {
    return this.customLoader.isFolderMode() && this.customLoader.getCatalog().length > 1;
  }

  private syncDifficultyPickerUi(): void {
    this.overlay.querySelectorAll('.difficulty-option').forEach((el) => {
      const active = (el as HTMLElement).dataset.diff === this.customDifficulty;
      el.classList.toggle('selected', active);
      el.setAttribute('aria-pressed', String(active));
    });
    const currentEl = this.overlay.querySelector('.difficulty-picker-current');
    if (currentEl) currentEl.textContent = this.customDifficulty;
    updateTooltip(
      this.overlay,
      '#difficulty-label .has-tooltip',
      tDifficultyHint(this.customDifficulty),
    );
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

    this.render(renderSelectHubScreenHtml(this.buildSelectHubViewState()));

    this.syncEqMotionState();
    this.bindSelectHub();
    this.mountSelectHubBackground();
    this.hidePlayHud();
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
      this.hydrateSelectHubFolderTrack(this.selectHubTrackIndex);
    } else if (this.customLoader.getImportMode() === 'single' && this.customLoader.getBuffer()) {
      this.selectHubBuiltinIndex = null;
      this.refreshSelectHubSidebarSelection();
      this.syncSelectHubBuiltinModeClass();
      const chart = this.customLoader.buildChart(
        this.customBpm,
        this.customOffset,
        this.customDifficulty,
      );
      this.selectedChart = chart;
      this.updateSelectHubCenterFromChart(chart, chart.title, chart.audioDuration ?? 0);
      this.refreshSelectHubRing();
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
    void this.syncSelectHubDefaultPreview();
    requestAnimationFrame(() => this.scrollSelectedSongBandCardIntoView('auto'));
  }

  private async syncSelectHubDefaultPreview(): Promise<void> {
    if (!this.audio.isPreviewEnabled() || this.screenId !== 'select') return;

    if (this.selectHubBuiltinIndex !== null) {
      const chart = CHARTS[this.selectHubBuiltinIndex];
      const buffer = this.getBuiltinPreviewBuffer?.(chart.id) ?? null;
      if (buffer) await this.audio.startBufferPreview(buffer, true, 0);
      return;
    }

    if (this.customLoader.isFolderMode() && this.customLoader.getCatalog().length > 0) {
      if (!this.customLoader.getBuffer()) {
        const loaded = await this.customLoader.ensureSelectedTrackAudio();
        if (!loaded) return;
      }
      this.syncSelectHubSelectedFolderChartUi();
      await this.audio.startUserPreview();
      return;
    }

    if (this.customLoader.getImportMode() === 'single' && this.customLoader.getBuffer()) {
      await this.audio.startUserPreview();
    }
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
    return (
      screen.classList.contains('is-builtin-mode') ||
      screen.classList.contains('is-folder-list-mode')
    );
  }

  private songBandCardCount(): number {
    if (this.selectHubBuiltinIndex !== null) return CHARTS.length;
    if (this.shouldShowFolderSongList()) return this.customLoader.getCatalog().length;
    return 0;
  }

  private syncSongBandNavButtons(): void {
    const firstBtn = this.overlay.querySelector('#song-band-nav-first') as HTMLButtonElement | null;
    const prevBtn = this.overlay.querySelector('#song-band-nav-prev') as HTMLButtonElement | null;
    const nextBtn = this.overlay.querySelector('#song-band-nav-next') as HTMLButtonElement | null;
    const lastBtn = this.overlay.querySelector('#song-band-nav-last') as HTMLButtonElement | null;
    const enabled =
      this.isSongBandVisible() && this.songBandCardCount() > 1 && !this.isRandomPickLocked();
    firstBtn?.toggleAttribute('disabled', !enabled);
    prevBtn?.toggleAttribute('disabled', !enabled);
    nextBtn?.toggleAttribute('disabled', !enabled);
    lastBtn?.toggleAttribute('disabled', !enabled);
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

  private scrollSongBandCardIntoView(card: HTMLElement, behavior: ScrollBehavior = 'smooth'): void {
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

    const selected = scroll.querySelector(
      `${railSelector} .song-band-card.is-selected`,
    ) as HTMLElement | null;
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

  private jumpSelectHubSongBand(to: 'first' | 'last'): void {
    if (!this.isSongBandVisible() || this.isRandomPickLocked()) return;
    if (this.selectHubBuiltinIndex !== null) {
      if (CHARTS.length <= 1) return;
      const target =
        to === 'first'
          ? firstBuiltinIndex(CHARTS, this.builtinSongSort)
          : lastBuiltinIndex(CHARTS, this.builtinSongSort);
      if (target === this.selectHubBuiltinIndex) return;
      this.playUiNavigate();
      this.selectSelectHubBuiltin(target);
      return;
    }
    if (!this.shouldShowFolderSongList()) return;
    const tracks = this.customLoader.getCatalog();
    if (tracks.length <= 1) return;
    const getMeta = (track: (typeof tracks)[number]) => this.folderTrackSortMeta(track);
    const target =
      to === 'first'
        ? firstFolderCatalogIndex(tracks, this.folderSongSort, getMeta)
        : lastFolderCatalogIndex(tracks, this.folderSongSort, getMeta);
    if (target === this.customLoader.getSelectedIndex()) return;
    this.playUiNavigate();
    void this.loadSelectHubTrack(target);
  }

  private unbindSelectHubSongBandNav(): void {
    if (this.selectHubSongBandKeyHandler) {
      window.removeEventListener('keydown', this.selectHubSongBandKeyHandler, true);
      this.selectHubSongBandKeyHandler = null;
    }
    if (this.selectHubSongBandWheelTarget && this.selectHubSongBandWheelHandler) {
      this.selectHubSongBandWheelTarget.removeEventListener(
        'wheel',
        this.selectHubSongBandWheelHandler,
      );
    }
    this.selectHubSongBandWheelTarget = null;
    this.selectHubSongBandWheelHandler = null;
  }

  private bindSelectHubSongBandNav(): void {
    this.unbindSelectHubSongBandNav();

    this.overlay.querySelector('#song-band-nav-first')?.addEventListener('click', () => {
      this.jumpSelectHubSongBand('first');
    });
    this.overlay.querySelector('#song-band-nav-prev')?.addEventListener('click', () => {
      this.stepSelectHubSongBand(-1);
    });
    this.overlay.querySelector('#song-band-nav-next')?.addEventListener('click', () => {
      this.stepSelectHubSongBand(1);
    });
    this.overlay.querySelector('#song-band-nav-last')?.addEventListener('click', () => {
      this.jumpSelectHubSongBand('last');
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
    const dock = this.overlay.querySelector('#select-hub-tuning-panel') as HTMLElement | null;
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
        const c = this.customLoader.buildChart(
          this.customBpm,
          this.customOffset,
          this.customDifficulty,
        );
        this.selectedChart = c;
        const entry = this.customLoader.getCatalog()[this.customLoader.getSelectedIndex()];
        this.updateSelectHubCenterFromChart(c, entry?.title ?? c.title, c.audioDuration ?? 0);
        this.refreshFolderSongCardRatings();
        updateTooltip(
          this.overlay,
          '#difficulty-label .has-tooltip',
          tDifficultyHint(this.customDifficulty),
        );
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
    this.bindDisplayTimingControl();
    this.bindLaneBackgroundControl();
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
    void this.startSelectedChartAsync();
  }

  private async startSelectedChartAsync(): Promise<void> {
    if (this.screenId !== 'select') return;
    if (this.isSelectHubRingLoading()) return;

    if (this.selectHubBuiltinIndex === null && this.customLoader.isFolderMode()) {
      const loaded = await this.ensureSelectHubTrackDecoded();
      if (!loaded) return;
    }

    let chart = this.selectedChart;
    if (this.selectHubBuiltinIndex !== null) {
      chart = CHARTS[this.selectHubBuiltinIndex];
    } else if (this.customLoader.getBuffer()) {
      chart = this.customLoader.buildChart(
        this.customBpm,
        this.customOffset,
        this.customDifficulty,
      );
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

  private async ensureSelectHubTrackDecoded(): Promise<boolean> {
    if (this.canBuildCustomChart()) return true;
    if (!this.customLoader.isFolderMode() || this.customLoader.getCatalog().length === 0) {
      return false;
    }
    await this.loadSelectHubTrack(this.customLoader.getSelectedIndex());
    return this.canBuildCustomChart();
  }

  private unbindSelectHubStart(): void {
    if (this.selectHubStartKeyHandler) {
      window.removeEventListener('keydown', this.selectHubStartKeyHandler, true);
      this.selectHubStartKeyHandler = null;
    }
    if (this.selectHubPlayClickHandler) {
      this.overlay
        .querySelector('#btn-select-start')
        ?.removeEventListener('click', this.selectHubPlayClickHandler);
      this.selectHubPlayClickHandler = null;
    }
    if (this.selectHubRandomClickHandler) {
      this.overlay
        .querySelector('#btn-select-random')
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
      const chart = this.customLoader.buildChart(
        this.customBpm,
        this.customOffset,
        this.customDifficulty,
      );
      this.selectedChart = chart;
      const entry = catalog[this.customLoader.getSelectedIndex()];
      this.updateSelectHubCenterFromChart(
        chart,
        entry?.title ?? chart.title,
        chart.audioDuration ?? 0,
      );
      this.syncSelectHubPreviewToggle();
      if (this.audio.isPreviewEnabled() && this.customLoader.getBuffer()) {
        void this.audio.startUserPreview();
      }
      return;
    }

    if (this.customLoader.getImportMode() === 'single' && this.customLoader.getBuffer()) {
      const chart = this.customLoader.buildChart(
        this.customBpm,
        this.customOffset,
        this.customDifficulty,
      );
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
    const catalog = this.customLoader.getCatalog();
    this.overlay.querySelectorAll('.folder-song-item').forEach((card) => {
      const index = Number((card as HTMLElement).dataset.listIndex);
      if (Number.isNaN(index)) return;
      const chart = this.folderSongCardChart(index);
      const levelEl = card.querySelector('.song-band-card__level');
      if (levelEl) levelEl.innerHTML = this.renderFolderSongLevelHtml(index);
      const rankEl = card.querySelector('.song-band-card__rank');
      if (rankEl) {
        const track = catalog[index];
        rankEl.innerHTML = track
          ? renderBestGradeBadgeHtml(getSongBestGrade(trackEntryRecordKey(track)), 'card')
          : renderChartBestGradeBadge(chart, 'card');
      }
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
      const rankEl = card.querySelector('.song-band-card__rank');
      if (rankEl) rankEl.innerHTML = renderChartBestGradeBadge(chart, 'card');
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
    void this.syncSelectHubDefaultPreview();
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
    this.overlay
      .querySelector('#select-hub-screen')
      ?.classList.toggle('is-builtin-mode', this.selectHubBuiltinIndex !== null);
    this.syncSelectHubFolderListModeClass();
    this.syncSongBandNavButtons();
  }

  private syncSelectHubFolderListModeClass(): void {
    this.overlay
      .querySelector('#select-hub-screen')
      ?.classList.toggle(
        'is-folder-list-mode',
        this.selectHubBuiltinIndex === null && this.shouldShowFolderSongList(),
      );
  }

  private refreshSelectHubBuiltinCards(): void {
    const rail = this.overlay.querySelector('#select-hub-builtin-rail');
    if (!rail) return;
    rail.innerHTML = selectHubBuiltinCardsHtml(this.selectHubBuiltinIndex, this.builtinSongSort);
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
    if (catalogIndex === selected && this.selectedChart && this.selectedChart.notes.length > 0) {
      return this.selectedChart;
    }
    const entry = this.customLoader.getCatalog()[catalogIndex];
    if (!entry) return null;
    return this.customLoader.buildChartPreviewForFile(entry.file, this.customDifficulty);
  }

  private folderSongDisplayLevel(catalogIndex: number): number | null {
    const chart = this.folderSongCardChart(catalogIndex);
    if (chart && chart.notes.length > 0) return chartDisplayLevel(chart);
    const entry = this.customLoader.getCatalog()[catalogIndex];
    if (!entry) return null;
    return this.customLoader.getPersistedDisplayLevel(entry.file, this.customDifficulty);
  }

  private renderFolderSongLevelHtml(catalogIndex: number): string {
    return renderChartLevelHtml(
      this.folderSongCardChart(catalogIndex),
      'card',
      this.folderSongDisplayLevel(catalogIndex),
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
      if (!entry) continue;

      const hasLevel =
        this.customLoader.getPersistedDisplayLevel(entry.file, this.customDifficulty) !== null ||
        this.customLoader.buildChartPreviewForFile(entry.file, this.customDifficulty) !== null;

      if (this.customLoader.hasTrackMeta(entry.file) && hasLevel) {
        this.onFolderTrackMetaReady(catalogIndex);
        continue;
      }

      if (!this.customLoader.hasTrackMeta(entry.file)) {
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
        continue;
      }

      try {
        this.setFolderMetaPrefetchingIndex(catalogIndex);
        await this.customLoader.ensureChartPreviewForFile(entry.file, this.customDifficulty);
        if (gen !== this.folderMetaPrefetchGen || this.screenId !== 'select') return;
        this.onFolderTrackMetaReady(catalogIndex);
      } catch (err) {
        console.warn('[UIManager] folder chart preview prefetch failed', entry.title, err);
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
    if (
      catalogIndex === this.customLoader.getSelectedIndex() &&
      this.selectHubLoadingCatalogIndex !== catalogIndex
    ) {
      this.syncSelectHubSelectedFolderChartUi(catalogIndex);
    }
  }

  private patchFolderSongCardLevel(catalogIndex: number): void {
    const levelEl = this.overlay.querySelector(
      `.folder-song-item[data-list-index="${catalogIndex}"] .song-band-card__level`,
    );
    if (!levelEl) return;
    levelEl.innerHTML = this.renderFolderSongLevelHtml(catalogIndex);
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
      const keySelect = this.overlay.querySelector(
        `#${prefix}-song-sort-key`,
      ) as HTMLSelectElement | null;
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

      this.overlay
        .querySelectorAll(`#${prefix}-song-sort-bar .song-sort-dir-btn`)
        .forEach((btn) => {
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

    bind(
      'builtin',
      BUILTIN_SORT_KEYS,
      () => this.builtinSongSort,
      (s) => this.applyBuiltinSongSort(s),
    );
    bind(
      'folder',
      FOLDER_SORT_KEYS,
      () => this.folderSongSort,
      (s) => this.applyFolderSongSort(s),
    );
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
    const rows = sortFolderCatalog(catalog, this.folderSongSort, (track) =>
      this.folderTrackSortMeta(track),
    );
    track.innerHTML = renderFolderSongList(
      rows,
      selected,
      (catalogIndex) => this.isFolderSongItemLoading(catalogIndex),
      (track) => this.formatFolderSongCardMeta(track),
      (track) => getSongBestGrade(trackEntryRecordKey(track)),
      (_track, catalogIndex) => this.folderSongCardChart(catalogIndex),
      (_track, catalogIndex) => this.folderSongDisplayLevel(catalogIndex),
    );
    this.applySelectHubListLoadingState();
    this.scrollSelectedFolderSongCardIntoView('auto');
    this.syncSongBandNavButtons();
  }

  private bindSelectHubSongList(): void {
    const track = this.overlay.querySelector('#folder-song-list-track') as HTMLElement | null;
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
    return (
      this.overlay.querySelector('#select-hub-screen')?.classList.contains('is-loading-track') ??
      false
    );
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
      this.overlay
        .querySelector('#select-hub-screen')
        ?.classList.toggle('is-loading-track', loading);
    }
    this.overlay
      .querySelector('#song-ring-center')
      ?.classList.toggle('is-preview-loading', loading);
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
        const displayIndex = folderCatalogDisplayIndex(catalog, this.folderSongSort, idx, (track) =>
          this.folderTrackSortMeta(track),
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

  private syncSelectHubSelectedFolderChartUi(
    catalogIndex = this.customLoader.getSelectedIndex(),
  ): void {
    if (this.selectHubBuiltinIndex !== null || this.screenId !== 'select') return;

    const catalog = this.customLoader.getCatalog();
    const entry = catalog[catalogIndex];
    if (!entry) return;

    const preview = this.customLoader.buildChartPreviewForFile(entry.file, this.customDifficulty);
    if (preview) {
      if (!this.customLoader.getBuffer()) {
        this.customBpm = preview.bpm;
        this.customOffset = 0;
        this.syncCustomBpmOffsetSliders();
      }
      this.selectedChart = preview;
      const sortMeta = this.customLoader.getTrackSortMeta(entry.file);
      this.updateSelectHubCenterFromChart(
        preview,
        entry.title,
        sortMeta.duration ?? preview.audioDuration ?? 0,
      );
      return;
    }

    if (!this.customLoader.getBuffer()) return;

    try {
      const sortMeta = this.customLoader.getTrackSortMeta(entry.file);
      const bpm = sortMeta.bpm ?? this.customBpm;
      this.customBpm = bpm;
      this.syncCustomBpmOffsetSliders();
      const chart = this.customLoader.buildChart(bpm, this.customOffset, this.customDifficulty);
      this.selectedChart = chart;
      this.updateSelectHubCenterFromChart(
        chart,
        entry.title,
        sortMeta.duration ?? chart.audioDuration ?? 0,
      );
    } catch (err) {
      console.warn('[UIManager] failed to sync folder chart preview', entry.title, err);
    }
  }

  private syncCustomBpmOffsetSliders(): void {
    const bpmSlider = this.overlay.querySelector('#bpm-slider') as HTMLInputElement | null;
    const bpmValue = this.overlay.querySelector('#bpm-value');
    if (bpmSlider) bpmSlider.value = String(this.customBpm);
    if (bpmValue) bpmValue.textContent = String(this.customBpm);

    const offsetSlider = this.overlay.querySelector('#offset-slider') as HTMLInputElement | null;
    const offsetValue = this.overlay.querySelector('#offset-value');
    if (offsetSlider) offsetSlider.value = String(this.customOffset);
    if (offsetValue) offsetValue.textContent = this.customOffset.toFixed(1);
  }

  private hydrateSelectHubFolderTrack(index: number): void {
    const catalog = this.customLoader.getCatalog();
    const entry = catalog[index];
    if (!entry) return;

    this.selectHubTrackIndex = index;
    this.selectHubBuiltinIndex = null;
    this.customLoader.setSelectedIndex(index);
    this.syncFolderSongListSelection(index);
    this.scrollSelectedFolderSongCardIntoView('auto');
    this.syncSelectHubBuiltinModeClass();
    this.refreshSelectHubSidebarSelection();
    this.audio.stopPreviewPlayback();

    const preview = this.customLoader.buildChartPreviewForFile(entry.file, this.customDifficulty);
    if (preview) {
      this.selectedChart = preview;
      this.syncSelectHubSelectedFolderChartUi(index);
      this.syncSelectHubPreviewToggle(false);
      return;
    }

    const sortMeta = this.customLoader.getTrackSortMeta(entry.file);
    const persisted = getPersistedTrackMeta(entry.id);
    const bpm = sortMeta.bpm ?? persisted?.bpm ?? this.customBpm;
    const duration = sortMeta.duration ?? persisted?.duration ?? 0;
    this.customBpm = bpm;
    this.customOffset = 0;
    this.syncCustomBpmOffsetSliders();
    this.selectedChart = null;

    this.setRingCenterTitle(entry.title);
    const metaEl = this.overlay.querySelector('#ring-center-meta');
    const statsEl = this.overlay.querySelector('#ring-center-stats');
    const counterEl = this.overlay.querySelector('#ring-track-counter');
    if (metaEl) {
      metaEl.textContent =
        duration > 0
          ? `${t('ui.customTrack')} \u00b7 ${this.formatDuration(duration)}`
          : t('ui.customTrack');
    }
    if (statsEl) {
      const parts: string[] = [formatChartBpm(bpm)];
      if (persisted) parts.push(getGenreLabel(persisted.genre));
      statsEl.textContent = parts.join(' \u00b7 ');
    }
    if (counterEl && catalog.length > 1) {
      const displayIndex = folderCatalogDisplayIndex(catalog, this.folderSongSort, index, (track) =>
        this.folderTrackSortMeta(track),
      );
      counterEl.textContent = t('ui.customFolderTrack', {
        current: displayIndex + 1,
        total: catalog.length,
      });
    }

    const levelSlot = this.overlay.querySelector('#song-chart-level-slot');
    if (levelSlot) {
      levelSlot.innerHTML = renderChartLevelHtml(
        null,
        'panel',
        this.customLoader.getPersistedDisplayLevel(entry.file, this.customDifficulty),
      );
    }
    const bestSlot = this.overlay.querySelector('#song-best-grade-slot');
    if (bestSlot) {
      bestSlot.innerHTML = renderChartBestGradeBadge(null, 'panel');
    }
    const { radarHtml } = renderSongChartAnalysisHtml(null, { largeRadar: true });
    const radarEl = this.overlay.querySelector('#song-chart-radar');
    if (radarEl) {
      radarEl.innerHTML = radarHtml;
      radarEl.setAttribute('aria-hidden', 'true');
      delete (radarEl as HTMLElement).dataset.chartId;
    }
    this.refreshFolderSongCardRatings();
    this.syncSelectHubPreviewToggle(false);
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
      if (entry) saveLastFolderTrackRecordKey(entry.id);

      this.customBpm = meta.suggestedBpm;
      this.customOffset = 0;
      this.syncCustomBpmOffsetSliders();

      const chart = this.customLoader.buildChart(
        this.customBpm,
        this.customOffset,
        this.customDifficulty,
      );
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

  private bindPreviewToggle(trigger: Element | null, isLoading: () => boolean): void {
    if (!trigger) return;
    const el = trigger as HTMLElement;
    if (el.dataset.previewBound === '1') {
      this.syncPreviewToggleState(trigger, isLoading());
      return;
    }
    el.dataset.previewBound = '1';
    const toggle = async () => {
      if (isLoading()) return;
      if (
        !this.audio.isPreviewEnabled() &&
        this.customLoader.isFolderMode() &&
        !this.canBuildCustomChart()
      ) {
        await this.ensureSelectHubTrackDecoded();
      }
      await this.audio.toggleUserPreview();
      this.syncPreviewToggleState(trigger, isLoading());
    };
    trigger.addEventListener('click', () => {
      void toggle();
    });
    trigger.addEventListener('keydown', (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        void toggle();
      }
    });
    this.syncPreviewToggleState(trigger, isLoading());
  }

  private syncPreviewToggleState(el: Element | null, loading: boolean): void {
    if (!el) return;
    const enabled = this.audio.isPreviewEnabled();
    syncHubToggleElement(el, { on: enabled, loading });
    this.syncEqMotionState();
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

  private applyCustomFolder(files: File[], folderName = '', options?: { navigate?: boolean }) {
    const audioFiles = filterAudioFiles(files);
    if (audioFiles.length === 0) {
      this.showImportError(t('ui.customFolderEmpty'));
      return;
    }

    const folderLabel = folderName || folderNameFromFiles(audioFiles);
    this.cancelFolderMetaPrefetch();
    this.customLoader.setCatalogFromFiles(audioFiles, folderLabel);
    const catalog = this.customLoader.getCatalog();
    this.selectHubTrackIndex = resolveFolderTrackIndex(catalog);
    this.customLoader.setSelectedIndex(this.selectHubTrackIndex);
    this.customBpm = 128;
    this.customOffset = 0;
    this.customDifficulty = 'NORMAL';
    this.selectHubBuiltinIndex = null;
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
    showUserError(
      {
        render: (html) => this.render(html),
        showSelect: () => this.showSelect(),
        showTitle: () => this.showTitle(),
      },
      message,
      { returnTo: 'select' },
    );
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
      const chart = this.customLoader.buildChart(
        this.customBpm,
        this.customOffset,
        this.customDifficulty,
      );
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
        <h2 class="ready-title">${escapeHtml(chart.title)}</h2>
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
        <p class="loading-text" id="loading-message">${escapeHtml(t(this.loadingMessageKey))}</p>
        <div class="loading-progress" id="loading-progress" ${showProgress ? '' : 'hidden'}>
          <div class="loading-progress-track">
            <div class="loading-progress-fill" id="loading-progress-fill" style="width:${pct}%"></div>
          </div>
          <p class="loading-progress-label" id="loading-progress-label">${
            showProgress ? escapeHtml(t('ui.loadingProgress', { pct })) : ''
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
        <p class="error-text">${escapeHtml(message)}</p>
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

    this.playHud.innerHTML = buttons
      .map(
        (btn) => `<button type="button" class="btn-play-hud" id="${btn.id}">${btn.label}</button>`,
      )
      .join('');
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
    const rankClass = ddrGradeCssClass(grade);
    recordSongBestGrade(chart, grade);

    this.render(renderResultScreenHtml(stats, chart));

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

    void this.runResultRevealSequence(grade, rankClass, stats.failed === true);
  }

  private async runResultRevealSequence(
    grade: DdrGrade,
    rankClass: string,
    failed: boolean,
  ): Promise<void> {
    const token = ++this.resultRevealGen;
    await this.audio.playResultAnnounce();
    if (token !== this.resultRevealGen || this.screenId !== 'result') return;
    await new Promise((r) => setTimeout(r, RESULT_RANK_REVEAL_DELAY_MS));
    if (token !== this.resultRevealGen || this.screenId !== 'result') return;

    const rankEl = this.overlay.querySelector('#result-rank-slot');
    if (rankEl) {
      rankEl.textContent = grade;
      const failedClass = failed ? ' result-rank--failed' : '';
      rankEl.className = `result-rank ${rankClass}${failedClass} result-rank-revealed`;
    }

    const starCount = gradeToResultStars(grade, failed);
    const starsEl = this.overlay.querySelector('#result-stars-slot');
    if (starsEl) {
      starsEl.innerHTML = renderResultStarsRevealHtml(starCount);
      starsEl.className = 'result-stars-slot result-stars-revealed';
      starsEl.removeAttribute('aria-hidden');
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

  private render(html: string) {
    this.overlay.innerHTML = html;
    this.overlay.classList.remove('hidden');
    bindTooltips(this.overlay);
  }
}
