import type { ChartData } from '../types';
import type { CustomSongLoader } from '../audio/CustomSongLoader';
import type { AudioEngine } from '../audio/AudioEngine';
import { sortFolderCatalog } from '../audio/songCatalogSort';
import type { SongSortSettings } from '../settings/songSort';
import { t } from '../i18n';
import {
  pickRandomCatalogIndex,
  buildRandomPickRouletteSteps,
  randomRouletteStepDelay,
  RANDOM_PICK_AUTO_START_MS,
  RANDOM_PICK_DECIDE_FLASH_MS,
  RANDOM_PICK_EXPAND_MS,
  RANDOM_PICK_FLASH_MS,
  RANDOM_PICK_FLY_MS,
  RANDOM_PICK_ROULETTE_STOP_MS,
} from './randomPickSequence';

export interface RandomPickHost {
  getScreenId(): string;
  getOverlay(): HTMLElement;
  getCustomLoader(): CustomSongLoader;
  getAudio(): AudioEngine;
  getFolderSongSort(): SongSortSettings;
  folderTrackSortMeta(track: { file: File }): ReturnType<CustomSongLoader['getTrackSortMeta']>;
  canRandomFolderPlay(): boolean;
  isSelectHubRingLoading(): boolean;
  getSelectedChart(): ChartData | null;
  scrollSongBandCardIntoView(el: HTMLElement, behavior: ScrollBehavior): void;
  setRingCenterTitle(title: string): void;
  flashBandCardDecide(card: HTMLElement | null): void;
  escapeHtml(text: string): string;
  loadSelectHubTrack(index: number, opts: { silent: boolean }): Promise<void>;
  startSelectedChart(): void;
  unbindCustomRingNavigation(): void;
  bindSelectHubRing(): void;
  syncRandomPlayButton(): void;
  syncSongBandNavButtons(): void;
  burstSelectHubWarp(): void;
  requestSkipGameCountdown(): void;
}

export class RandomPickController {
  private active = false;
  private locked = false;
  private gen = 0;

  constructor(private readonly host: RandomPickHost) {}

  isLocked(): boolean {
    return this.active || this.locked;
  }

  isActive(): boolean {
    return this.active;
  }

  reset(): void {
    this.gen++;
    this.active = false;
    this.locked = false;
    this.stopRoulette();
    this.syncLockUi();
  }

  syncLockUi(): void {
    const overlay = this.host.getOverlay();
    const screen = overlay.querySelector('#select-hub-screen');
    screen?.classList.toggle('is-random-pick-active', this.active);
    screen?.classList.toggle('is-random-pick-locked', this.locked);
    screen?.classList.toggle('is-random-pick-spectacle', this.active || this.locked);
    screen?.classList.remove('is-random-pick-reveal', 'is-random-pick-decide');

    const fx = overlay.querySelector('#random-pick-fx') as HTMLElement | null;
    if (fx && !this.active && !this.locked) {
      fx.hidden = true;
      fx.classList.remove('random-pick-fx--decide', 'random-pick-fx--spin');
      const kicker = overlay.querySelector('#random-pick-fx-kicker') as HTMLElement | null;
      if (kicker) kicker.hidden = true;
    }

    overlay
      .querySelector('#song-ring-center')
      ?.classList.remove(
        'is-random-pick-reveal',
        'is-random-pick-locked-panel',
        'is-random-pick-landed',
        'is-random-pick-flash',
      );
    this.clearListHighlight();
    this.removeFlyClone();
    this.host.syncRandomPlayButton();
    this.host.syncSongBandNavButtons();
  }

  async start(): Promise<void> {
    if (this.host.getScreenId() !== 'select') return;
    if (!this.host.canRandomFolderPlay() || this.host.isSelectHubRingLoading() || this.active)
      return;

    const loader = this.host.getCustomLoader();
    const catalog = loader.getCatalog();
    const current = loader.getSelectedIndex();
    const finalIndex = pickRandomCatalogIndex(catalog.length, current);
    const gen = ++this.gen;

    this.active = true;
    this.locked = false;
    this.syncLockUi();
    this.host.unbindCustomRingNavigation();
    this.host.getAudio().stopPreviewPlayback();

    let completed = false;
    try {
      await this.ensureAudio();

      const loadPromise = this.host.loadSelectHubTrack(finalIndex, { silent: true });

      const rouletted = await this.animateRoulette(current, finalIndex, gen);
      if (!rouletted) return;

      this.setFx('', 'hidden');
      const flew = await this.animateFlyToCenter(finalIndex, gen);
      if (!flew) return;

      await loadPromise;
      if (
        gen !== this.gen ||
        this.host.getScreenId() !== 'select' ||
        this.host.isSelectHubRingLoading()
      )
        return;

      const chart = this.host.getSelectedChart();
      if (!chart || chart.notes.length === 0) return;

      this.active = false;
      this.locked = true;
      const screen = this.host.getOverlay().querySelector('#select-hub-screen');
      screen?.classList.remove('is-random-pick-active');
      screen?.classList.add('is-random-pick-locked');
      this.host.syncRandomPlayButton();

      const revealed = await this.revealDecision(gen, finalIndex);
      if (!revealed) return;

      const ready = await this.waitAutoStart(gen);
      if (!ready) return;

      this.setFx('', 'hidden');
      this.host
        .getOverlay()
        .querySelector('#song-ring-center')
        ?.classList.remove('is-random-pick-locked-panel');
      this.host.requestSkipGameCountdown();
      this.host.startSelectedChart();
      completed = true;
    } finally {
      if (!completed && gen === this.gen) {
        this.reset();
        if (this.host.getScreenId() === 'select' && this.host.getCustomLoader().isFolderMode()) {
          this.host.bindSelectHubRing();
        }
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  private async ensureAudio(): Promise<void> {
    const audio = this.host.getAudio();
    await audio.resume();
    await audio.ensureRandomPickSoundsLoaded();
  }

  private async playRoulette(): Promise<void> {
    await this.ensureAudio();
    this.host.getAudio().playRandomPickRoulette();
  }

  private stopRoulette(): void {
    this.host.getAudio().stopRandomPickRoulette();
  }

  private async playSongDecided(): Promise<void> {
    await this.ensureAudio();
    this.host.getAudio().playRandomPickSongDecided();
  }

  private async playPanelLand(): Promise<void> {
    await this.ensureAudio();
    this.host.getAudio().playRandomPickPanelLand();
  }

  private setFx(label: string, phase: 'spin' | 'reveal' | 'decide' | 'hidden'): void {
    const overlay = this.host.getOverlay();
    const fx = overlay.querySelector('#random-pick-fx') as HTMLElement | null;
    const labelEl = overlay.querySelector('#random-pick-fx-label');
    const kickerEl = overlay.querySelector('#random-pick-fx-kicker') as HTMLElement | null;
    const screen = overlay.querySelector('#select-hub-screen');
    if (!fx || !labelEl) return;

    if (phase === 'hidden') {
      fx.hidden = true;
      fx.classList.remove('random-pick-fx--decide', 'random-pick-fx--spin');
      if (kickerEl) kickerEl.hidden = true;
      screen?.classList.remove('is-random-pick-reveal', 'is-random-pick-decide');
      return;
    }

    fx.hidden = false;
    fx.classList.toggle('random-pick-fx--decide', phase === 'decide');
    fx.classList.toggle('random-pick-fx--spin', phase === 'spin');
    screen?.classList.toggle('is-random-pick-reveal', phase === 'reveal');
    screen?.classList.toggle('is-random-pick-decide', phase === 'decide');

    if (phase === 'decide') {
      if (kickerEl) {
        kickerEl.hidden = false;
        kickerEl.textContent = t('ui.randomPickDecidedHead');
      }
      labelEl.textContent = t('ui.randomPickDecidedSoon');
      return;
    }

    if (kickerEl) kickerEl.hidden = true;
    labelEl.textContent = label;
  }

  private removeFlyClone(): void {
    this.host.getOverlay().querySelector('#random-pick-fly-layer')?.replaceChildren();
  }

  private clearListHighlight(): void {
    this.host
      .getOverlay()
      .querySelectorAll('.folder-song-item')
      .forEach((item) => {
        item.classList.remove('is-random-pick-source', 'is-random-scroll-candidate');
      });
  }

  private setScrollCandidate(catalogIndex: number): void {
    const loader = this.host.getCustomLoader();
    const catalog = loader.getCatalog();
    const entry = catalog[catalogIndex];
    if (!entry) return;

    const overlay = this.host.getOverlay();
    overlay.querySelectorAll('.folder-song-item').forEach((item) => {
      const idx = Number((item as HTMLElement).dataset.listIndex);
      const active = idx === catalogIndex;
      item.classList.toggle('is-random-scroll-candidate', active);
      item.classList.toggle('is-selected', false);
    });

    const el = overlay.querySelector(
      `.folder-song-item[data-list-index="${catalogIndex}"]`,
    ) as HTMLElement | null;
    if (el) this.host.scrollSongBandCardIntoView(el, 'auto');
  }

  private focusSong(catalogIndex: number): void {
    const loader = this.host.getCustomLoader();
    const catalog = loader.getCatalog();
    const entry = catalog[catalogIndex];
    if (!entry) return;

    const overlay = this.host.getOverlay();
    overlay.querySelectorAll('.folder-song-item').forEach((item) => {
      const idx = Number((item as HTMLElement).dataset.listIndex);
      const active = idx === catalogIndex;
      item.classList.toggle('is-selected', active);
    });

    const el = overlay.querySelector(
      `.folder-song-item[data-list-index="${catalogIndex}"]`,
    ) as HTMLElement | null;
    if (el) this.host.scrollSongBandCardIntoView(el, 'auto');
    this.host.setRingCenterTitle(entry.title);
    this.host.flashBandCardDecide(el);
  }

  private async animateRoulette(fromIndex: number, toIndex: number, gen: number): Promise<boolean> {
    const loader = this.host.getCustomLoader();
    const catalog = loader.getCatalog();
    const rows = sortFolderCatalog(catalog, this.host.getFolderSongSort(), (track) =>
      this.host.folderTrackSortMeta(track),
    );
    const catalogIndices = rows.map((row) => row.catalogIndex);
    const steps = buildRandomPickRouletteSteps(catalogIndices, fromIndex, toIndex);
    const total = Math.max(steps.length - 1, 1);

    this.setFx(t('ui.randomPickSpinning'), 'spin');
    await this.playRoulette();

    let aborted = false;
    try {
      const finalIndex = steps[steps.length - 1];
      for (let i = 0; i < steps.length; i++) {
        if (gen !== this.gen || this.host.getScreenId() !== 'select') {
          aborted = true;
          return false;
        }
        this.setScrollCandidate(steps[i]);
        const delay =
          i < steps.length - 1 ? randomRouletteStepDelay(i, total) : RANDOM_PICK_ROULETTE_STOP_MS;
        await this.sleep(delay);
      }

      this.host
        .getOverlay()
        .querySelectorAll('.folder-song-item')
        .forEach((item) => {
          item.classList.remove('is-random-scroll-candidate');
        });
      this.focusSong(finalIndex);

      return gen === this.gen && this.host.getScreenId() === 'select';
    } finally {
      if (aborted) this.stopRoulette();
    }
  }

  private async flashCenter(): Promise<void> {
    const center = this.host.getOverlay().querySelector('#song-ring-center');
    center?.classList.remove('is-random-pick-flash');
    void (center as HTMLElement | undefined)?.offsetWidth;
    center?.classList.add('is-random-pick-flash');
    await this.sleep(RANDOM_PICK_FLASH_MS);
    center?.classList.remove('is-random-pick-flash');
  }

  private async animateFlyToCenter(catalogIndex: number, gen: number): Promise<boolean> {
    const loader = this.host.getCustomLoader();
    const catalog = loader.getCatalog();
    const entry = catalog[catalogIndex];
    if (!entry) return false;

    const overlay = this.host.getOverlay();
    const listItem = overlay.querySelector(
      `.folder-song-item[data-list-index="${catalogIndex}"]`,
    ) as HTMLElement | null;
    const center = overlay.querySelector('#song-ring-center') as HTMLElement | null;

    if (!listItem || !center) {
      this.focusSong(catalogIndex);
      await this.flashCenter();
      return gen === this.gen && this.host.getScreenId() === 'select';
    }

    this.host.scrollSongBandCardIntoView(listItem, 'auto');
    await this.sleep(16);
    if (gen !== this.gen || this.host.getScreenId() !== 'select') return false;

    const from = listItem.getBoundingClientRect();
    const to = center.getBoundingClientRect();
    const fromCx = from.left + from.width / 2;
    const fromCy = from.top + from.height / 2;
    const panelCx = to.left + to.width / 2;
    const panelCy = to.top + to.height / 2;

    this.removeFlyClone();
    listItem.classList.add('is-random-pick-source');

    const screen = overlay.querySelector('#select-hub-screen');
    screen?.classList.add('is-random-pick-fly');

    const clone = document.createElement('div');
    clone.className = 'random-pick-fly-clone';
    clone.innerHTML = `
      <div class="random-pick-fly-clone-inner">
        <p class="random-pick-fly-clone-title">${this.host.escapeHtml(entry.title)}</p>
      </div>
    `;
    clone.style.width = `${from.width}px`;
    clone.style.height = `${from.height}px`;
    clone.style.minWidth = `${from.width}px`;
    clone.style.maxWidth = `${from.width}px`;
    clone.style.minHeight = `${from.height}px`;
    const flyLayer = overlay.querySelector('#random-pick-fly-layer') as HTMLElement | null;
    if (!flyLayer) {
      listItem.classList.remove('is-random-pick-source');
      screen?.classList.remove('is-random-pick-fly');
      return false;
    }
    flyLayer.appendChild(clone);

    const waitAnim = (anim: Animation) =>
      new Promise<void>((resolve) => {
        anim.onfinish = () => resolve();
        anim.oncancel = () => resolve();
      });

    await waitAnim(
      clone.animate(
        [
          {
            transform: `translate(${fromCx}px, ${fromCy}px) translate(-50%, -50%) scale(1, 1)`,
            opacity: 1,
          },
          {
            transform: `translate(${panelCx}px, ${panelCy}px) translate(-50%, -50%) scale(1, 1)`,
            opacity: 1,
          },
        ],
        {
          duration: RANDOM_PICK_FLY_MS,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'forwards',
        },
      ),
    );

    if (gen !== this.gen || this.host.getScreenId() !== 'select') {
      this.removeFlyClone();
      listItem.classList.remove('is-random-pick-source');
      screen?.classList.remove('is-random-pick-fly');
      return false;
    }

    const panel = center.getBoundingClientRect();
    const endCx = panel.left + panel.width / 2;
    const endCy = panel.top + panel.height / 2;
    const endScaleX = panel.width / Math.max(from.width, 1);
    const endScaleY = panel.height / Math.max(from.height, 1);

    clone.classList.add('random-pick-fly-clone--landing');

    await waitAnim(
      clone.animate(
        [
          {
            transform: `translate(${endCx}px, ${endCy}px) translate(-50%, -50%) scale(1, 1)`,
            opacity: 1,
            filter: 'brightness(1)',
          },
          {
            transform: `translate(${endCx}px, ${endCy}px) translate(-50%, -50%) scale(${endScaleX}, ${endScaleY})`,
            opacity: 1,
            filter: 'brightness(1.65)',
          },
        ],
        {
          duration: RANDOM_PICK_EXPAND_MS,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          fill: 'forwards',
        },
      ),
    );

    center.classList.add('is-random-pick-flash');
    void center.offsetWidth;

    this.removeFlyClone();
    listItem.classList.remove('is-random-pick-source');
    screen?.classList.remove('is-random-pick-fly');

    if (gen !== this.gen || this.host.getScreenId() !== 'select') return false;

    return gen === this.gen && this.host.getScreenId() === 'select';
  }

  private async revealDecision(gen: number, catalogIndex: number): Promise<boolean> {
    if (gen !== this.gen || this.host.getScreenId() !== 'select') return false;

    this.focusSong(catalogIndex);
    this.host.burstSelectHubWarp();
    const overlay = this.host.getOverlay();
    const center = overlay.querySelector('#song-ring-center');
    center?.classList.remove('is-random-pick-flash', 'is-random-pick-landed');
    void (center as HTMLElement | undefined)?.offsetWidth;
    center?.classList.add('is-random-pick-landed');
    await this.playPanelLand();

    this.setFx(t('ui.randomPickDecidedSoon'), 'decide');
    await this.playSongDecided();

    await this.sleep(RANDOM_PICK_DECIDE_FLASH_MS);
    if (gen !== this.gen || this.host.getScreenId() !== 'select') return false;

    center?.classList.remove('is-random-pick-landed');
    center?.classList.add('is-random-pick-locked-panel');
    return true;
  }

  private async waitAutoStart(gen: number): Promise<boolean> {
    await this.sleep(RANDOM_PICK_AUTO_START_MS);
    return gen === this.gen && this.host.getScreenId() === 'select';
  }
}
