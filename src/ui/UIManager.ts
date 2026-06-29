import type { ChartData, GameStats } from '../types';
import { LANE_COLORS, LANE_LABELS } from '../types';
import { CHARTS, getRank, getAccuracy } from '../data/charts';
import type { CustomSongLoader } from '../audio/CustomSongLoader';
import {
  CUSTOM_DIFFICULTIES,
  type CustomDifficulty,
} from '../audio/AutoChartGenerator';
import {
  pickCustomAudioFile,
  supportsCustomMusicFilePicker,
} from '../audio/pickCustomAudio';
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
import { updateTooltip, withTooltip } from './tooltip';
import {
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
} from '../i18n';

type ScreenId =
  | 'title'
  | 'select'
  | 'customReady'
  | 'playReady'
  | 'countdown'
  | 'loading'
  | 'error'
  | 'result'
  | 'dancerPreview'
  | 'none';

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
  private scrollSpeed = loadScrollSpeed();
  private reducedFlash = DEFAULT_REDUCED_FLASH;
  private stageFxPattern = DEFAULT_STAGE_FX_PATTERN;
  private titleKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private titlePointerHandler: ((e: PointerEvent) => void) | null = null;
  private screenId: ScreenId = 'none';
  private customReadyTitle = '';
  private customReadyDuration = 0;
  private loadingMessage = '';
  private loadingProgress: { loaded: number; total: number } | null = null;
  private errorMessage = '';
  private countdownChart: ChartData | null = null;
  private resultStats: GameStats | null = null;
  private resultChart: ChartData | null = null;
  private dancerPreviewLeft: DancerModelId = DEFAULT_DANCER_PREVIEW_PAIR[0];
  private dancerPreviewRight: DancerModelId = DEFAULT_DANCER_PREVIEW_PAIR[1];

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
    onLocaleChange(() => this.refreshScreen());
  }

  private refreshScreen(): void {
    switch (this.screenId) {
      case 'title': this.showTitle(); break;
      case 'select': this.showSelect(); break;
      case 'customReady': this.showCustomReady(this.customReadyTitle, this.customReadyDuration); break;
      case 'playReady': this.showPlayReady(); break;
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
      this.showPlayHud();
    }
  }

  private languageControlHtml(): string {
    const locale = getLocale();
    return `
      <label class="setting-row language-row">
        <span>${t('settings.language')}</span>
        <select id="language-select" class="language-select" aria-label="${t('settings.language')}">
          <option value="ja" ${locale === 'ja' ? 'selected' : ''}>日本語</option>
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

  getScrollSpeed(): number {
    return this.scrollSpeed;
  }

  getReducedFlash(): boolean {
    return this.reducedFlash;
  }

  getDebugStageFxPatternOverride(): number | null {
    return this.stageFxPattern === STAGE_FX_AUTO ? null : this.stageFxPattern;
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
    return `
      <div class="${this.panelClass(`debug-corner-panel ${positionClass}`)}">
        <div class="settings-panel-body">
          ${this.stageFxPatternControlHtml()}
        </div>
      </div>
    `;
  }

  /** タイトル画面専用: 右上=言語 / 左下=フラッシュ / 右下=デバッグ */
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
    });

    const fxSelect = this.overlay.querySelector('#stage-fx-pattern-select') as HTMLSelectElement;
    fxSelect?.addEventListener('change', () => {
      this.stageFxPattern = normalizeStageFxPattern(Number(fxSelect.value));
      saveStageFxPattern(this.stageFxPattern);
    });
  }

  private scrollSpeedControlHtml(): string {
    return `
      <div class="scroll-speed-panel">
        <label class="setting-row">
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
    this.render(`
      <div class="screen title-screen" id="title-screen">
        <img class="title-hero" src="${titleImage}" alt="G.RHYTHM" />
        ${this.titleSettingsPanelsHtml()}
        <a href="#" class="title-dancer-preview-link" id="btn-dancer-preview">${t('debug.dancerPreviewLink')}</a>
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

  showSelect() {
    this.screenId = 'select';
    this.unbindTitleNavigation();
    const selectImage = `${import.meta.env.BASE_URL}images/select.png`;
    const cards = CHARTS.map((chart, i) => `
      <div class="song-card" data-index="${i}" style="--accent:${LANE_COLORS[i % 4]}">
        <div class="song-level">Lv.${chart.level}</div>
        <div class="song-diff ${chart.difficulty.toLowerCase()}">${chart.difficulty}</div>
        <h3 class="song-title">${chart.title}</h3>
        <p class="song-artist">${chart.artist}</p>
        <div class="song-meta">
          <span>${t('ui.bpm', { bpm: chart.bpm })}</span>
          <span>${formatNotesCount(chart.notes.length)}</span>
        </div>
      </div>
    `).join('');

    this.render(`
      <div class="screen select-screen">
        <img class="select-hero" src="${selectImage}" alt="" />
        <div class="select-panel">
          <h2 class="screen-title">${t('ui.songSelectTitle')}</h2>
          <div class="song-grid">
            <div class="song-card custom-card" id="custom-music-card" style="--accent:#00e5ff">
              <div class="song-diff custom">${t('ui.custom')}</div>
              <h3 class="song-title">${t('ui.yourMusic')}</h3>
              <p class="song-artist">MP3 / WAV / OGG / FLAC</p>
              <div class="song-meta">
                <span>${t('ui.pickFile')}</span>
              </div>
            </div>
            ${cards}
          </div>
          <div class="select-settings">
            ${this.scrollSpeedControlHtml()}
          </div>
          <input type="file" id="audio-file-input" accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.webm" hidden />
          <button class="btn-secondary select-back" id="btn-back">${t('ui.back')}</button>
        </div>
      </div>
    `);

    this.overlay.querySelectorAll('.song-card:not(.custom-card)').forEach(card => {
      card.addEventListener('click', () => {
        this.playUiSelect();
        this.customLoader.clear();
        const idx = Number((card as HTMLElement).dataset.index);
        this.selectedChart = CHARTS[idx];
        this.showPlayReady();
      });
    });

    const fileInput = this.overlay.querySelector('#audio-file-input') as HTMLInputElement;
    this.overlay.querySelector('#custom-music-card')?.addEventListener('click', () => {
      this.playUiSelect();
      void this.openCustomMusic(fileInput);
    });
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) this.handleCustomFile(file);
      fileInput.value = '';
    });

    this.overlay.querySelector('#btn-back')?.addEventListener('click', () => {
      this.playUiNavigate();
      this.customLoader.clear();
      this.showTitle();
    });
    this.bindScrollSpeedControl();
  }

  private async openCustomMusic(fileInput: HTMLInputElement | null) {
    if (this.customMusicPickerOpen) return;
    this.customMusicPickerOpen = true;

    try {
      if (supportsCustomMusicFilePicker()) {
        try {
          const file = await pickCustomAudioFile();
          if (file) await this.handleCustomFile(file);
        } catch (err) {
          console.error(err);
          this.showError(t('ui.errorOpenFile'));
          setTimeout(() => this.showSelect(), 2500);
        }
        return;
      }

      fileInput?.click();
    } finally {
      this.customMusicPickerOpen = false;
    }
  }

  private async handleCustomFile(file: File) {
    this.showLoading(t('ui.loadingAudio'));

    try {
      const meta = await this.customLoader.loadFile(file);
      this.customBpm = meta.suggestedBpm;
      this.customOffset = 0;
      this.customDifficulty = 'NORMAL';
      this.playUiSelect();
      this.showCustomReady(meta.title, meta.duration);
    } catch (err) {
      console.error(err);
      this.showError(t('ui.errorLoadFile'));
      setTimeout(() => this.showSelect(), 2500);
    }
  }

  private showCustomReady(title: string, duration: number) {
    this.screenId = 'customReady';
    this.customReadyTitle = title;
    this.customReadyDuration = duration;
    const chart = this.customLoader.buildChart(this.customBpm, this.customOffset, this.customDifficulty);
    this.selectedChart = chart;
    const customReadyImage = `${import.meta.env.BASE_URL}images/custom-ready.png`;
    const diffKey = this.customDifficulty.toLowerCase();

    const formatDuration = (s: number) => {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    const difficultyOptions = CUSTOM_DIFFICULTIES.map(d => `
      <button type="button" class="difficulty-option ${d.toLowerCase()}${d === this.customDifficulty ? ' selected' : ''}"
        data-diff="${d}" aria-pressed="${d === this.customDifficulty}">
        ${d}
      </button>
    `).join('');

    this.render(`
      <div class="screen custom-ready-screen">
        <img class="custom-ready-hero" src="${customReadyImage}" alt="" />
        <div class="custom-ready-panel panel-right">
          <div class="ready-info">
            <div class="ready-diff ${diffKey}" id="ready-diff-badge">${this.customDifficulty}</div>
            <h2 class="ready-title">${this.escapeHtml(title)}</h2>
            <p class="ready-artist">${t('ui.customTrack')} · ${formatDuration(duration)}</p>
            <div class="ready-stats">
              <span id="ready-level">${formatLevel(chart.level)}</span>
              <span id="ready-note-count">${formatNotesCount(chart.notes.length)}</span>
              <span id="ready-genre">${tGenre(chart.genre ?? 'other')}</span>
            </div>
          </div>

          <div class="custom-settings">
            <div class="difficulty-picker">
              <p class="difficulty-picker-label" id="difficulty-label">
                ${withTooltip(t('ui.difficulty'), tDifficultyHint(this.customDifficulty), 'has-tooltip--above')}
              </p>
              <div class="difficulty-options" role="radiogroup" aria-label="${t('ui.difficulty')}">
                ${difficultyOptions}
              </div>
            </div>
            <label class="setting-row">
              <span>${t('ui.bpmLabel')}</span>
              <input type="range" id="bpm-slider" min="80" max="200" value="${this.customBpm}" />
              <span class="setting-value" id="bpm-value">${this.customBpm}</span>
            </label>
            <label class="setting-row">
              <span>${t('settings.offset')}</span>
              <input type="range" id="offset-slider" min="0" max="3" step="0.1" value="${this.customOffset}" />
              <span class="setting-value" id="offset-value">${this.customOffset.toFixed(1)}</span>
            </label>
            ${this.scrollSpeedControlHtml()}
          </div>

          <div class="custom-ready-actions">
            <button class="btn-primary" id="btn-play">${t('ui.play')}</button>
            <button class="btn-secondary" id="btn-cancel">${t('ui.cancel')}</button>
          </div>
        </div>
      </div>
    `);

    const updateChart = () => {
      const c = this.customLoader.buildChart(this.customBpm, this.customOffset, this.customDifficulty);
      this.selectedChart = c;
      const countEl = this.overlay.querySelector('#ready-note-count');
      if (countEl) countEl.textContent = formatNotesCount(c.notes.length);
      const levelEl = this.overlay.querySelector('#ready-level');
      if (levelEl) levelEl.textContent = formatLevel(c.level);
      const genreEl = this.overlay.querySelector('#ready-genre');
      if (genreEl && c.genre) genreEl.textContent = tGenre(c.genre);
      const badge = this.overlay.querySelector('#ready-diff-badge');
      if (badge) {
        badge.textContent = this.customDifficulty;
        badge.className = `ready-diff ${this.customDifficulty.toLowerCase()}`;
      }
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

    this.overlay.querySelectorAll('.difficulty-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const diff = (btn as HTMLElement).dataset.diff as CustomDifficulty;
        if (!diff || diff === this.customDifficulty) return;
        this.playUiSelect();
        this.customDifficulty = diff;
        this.overlay.querySelectorAll('.difficulty-option').forEach(el => {
          const active = (el as HTMLElement).dataset.diff === diff;
          el.classList.toggle('selected', active);
          el.setAttribute('aria-pressed', String(active));
        });
        updateChart();
      });
    });

    this.bindScrollSpeedControl();
    this.overlay.querySelector('#btn-play')?.addEventListener('click', () => {
      if (this.selectedChart) {
        this.playUiDecide();
        this.onStart(this.selectedChart);
      }
    });
    this.overlay.querySelector('#btn-cancel')?.addEventListener('click', () => {
      this.playUiNavigate();
      this.customLoader.clear();
      this.showSelect();
    });
  }

  showPlayReady() {
    if (!this.selectedChart) return;
    this.screenId = 'playReady';
    const chart = this.selectedChart;
    const customReadyImage = `${import.meta.env.BASE_URL}images/custom-ready.png`;

    this.render(`
      <div class="screen custom-ready-screen">
        <img class="custom-ready-hero" src="${customReadyImage}" alt="" />
        <div class="custom-ready-panel panel-right">
          <div class="ready-info">
            <div class="ready-diff ${chart.difficulty.toLowerCase()}">${chart.difficulty}</div>
            <h2 class="ready-title">${chart.title}</h2>
            <p class="ready-artist">${chart.artist}</p>
            <div class="ready-stats">
              <span>${t('ui.bpm', { bpm: chart.bpm })}</span>
              <span>${t('ui.levelEn', { level: chart.level })}</span>
              <span>${formatNotesCount(chart.notes.length)}</span>
              <span>${tGenre(chart.genre ?? 'other')}</span>
            </div>
          </div>

          <div class="custom-settings">
            ${this.scrollSpeedControlHtml()}
          </div>

          <div class="custom-ready-actions">
            <button class="btn-primary" id="btn-play">${t('ui.play')}</button>
            <button class="btn-secondary" id="btn-cancel">${t('ui.cancel')}</button>
          </div>
        </div>
      </div>
    `);

    this.overlay.querySelector('#btn-play')?.addEventListener('click', () => {
      this.playUiDecide();
      this.onStart(chart);
    });
    this.overlay.querySelector('#btn-cancel')?.addEventListener('click', () => {
      this.playUiNavigate();
      this.showSelect();
    });
    this.bindScrollSpeedControl();
  }

  showCountdownOverlay(chart: ChartData) {
    this.screenId = 'countdown';
    this.countdownChart = chart;
    this.overlay.classList.remove('hidden');
    this.render(`
      <div class="screen countdown-screen">
        <h2 class="ready-title">${this.escapeHtml(chart.title)}</h2>
        <div class="countdown-display" id="countdown">3</div>
        <p class="countdown-flash-warning" role="note">${t('ui.countdownFlashWarning')}</p>
      </div>
    `);
  }

  showLoading(message: string, keepProgress = false) {
    this.screenId = 'loading';
    this.loadingMessage = message;
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

  private renderLoadingScreen() {
    const progress = this.loadingProgress;
    const showProgress = progress !== null && progress.total > 0;
    const pct = showProgress ? Math.round((progress.loaded / progress.total) * 100) : 0;
    this.render(`
      <div class="screen loading-screen">
        <div class="loading-spinner"></div>
        <p class="loading-text" id="loading-message">${this.escapeHtml(this.loadingMessage)}</p>
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
    this.overlay.innerHTML = '';
    this.overlay.classList.add('hidden');
  }

  showPlayHud() {
    this.playHud.innerHTML = `
      <button type="button" class="btn-play-hud" id="btn-exit-select">${t('ui.songSelect')}</button>
      <button type="button" class="btn-play-hud" id="btn-exit-title">${t('ui.title')}</button>
    `;
    this.playHud.classList.remove('hidden');
    this.playHud.querySelector('#btn-exit-select')?.addEventListener('click', () => {
      this.playUiNavigate();
      this.onExitToSelect();
    });
    this.playHud.querySelector('#btn-exit-title')?.addEventListener('click', () => {
      this.playUiNavigate();
      this.onExitToTitle();
    });
  }

  hidePlayHud() {
    this.playHud.innerHTML = '';
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

  showTouchZones(): HTMLElement[] {
    this.touchLayer.classList.add('active');
    const zones = LANE_LABELS.map((_, i) => {
      const zone = document.createElement('div');
      zone.className = 'touch-zone';
      zone.style.setProperty('--lane-color', LANE_COLORS[i]);
      zone.dataset.lane = String(i);
      this.touchLayer.appendChild(zone);
      return zone;
    });
    return zones;
  }

  clearTouchZones() {
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
  }
}
