import './styles.css';
import { initLocale, t } from './i18n';
import { AudioEngine } from './audio/AudioEngine';
import { CustomSongLoader } from './audio/CustomSongLoader';
import { Game } from './game/Game';
import { UIManager } from './ui/UIManager';
import type { ChartData, GameStats } from './types';

async function main() {
  initLocale();
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const overlay = document.getElementById('ui-overlay') as HTMLElement;
  const touchLayer = document.getElementById('touch-layer') as HTMLElement;
  const playHud = document.getElementById('play-hud') as HTMLElement;
  const audio = new AudioEngine();
  const customLoader = new CustomSongLoader(audio);

  let game: Game;
  let touchZones: HTMLElement[] = [];

  const endGameplay = () => {
    game.stop();
    game.stopDancerPreview();
    ui.clearTouchZones();
    ui.hidePlayHud();
  };

  const ui = new UIManager(
    overlay,
    touchLayer,
    playHud,
    async (chart: ChartData) => {
      ui.prepareForGameplay();
      await audio.resume();
      if (!chart.customAudio) customLoader.clear();
      game.setScrollSpeed(ui.getScrollSpeed());
      game.setReducedFlash(ui.getReducedFlash());
      game.setDebugStageFxPattern(ui.getDebugStageFxPatternOverride());
      ui.showCountdownOverlay(chart);
      touchZones = ui.showTouchZones();
      ui.showPlayHud();
      game.bindTouchZones(touchZones);
      game.start(chart);
    },
    () => endGameplay(),
    () => {
      endGameplay();
      ui.showSelect();
    },
    () => {
      endGameplay();
      customLoader.clear();
      ui.showTitle();
    },
    (left, right) => game.startDancerPreview(left, right),
    (left, right) => game.setDancerPreviewModels(left, right),
    () => game.stopDancerPreview(),
    customLoader,
    audio,
  );

  game = new Game(canvas, audio, {
    onCountdown: (num) => ui.updateCountdown(num),
    onPlayStart: () => ui.hideOverlay(),
    onFinish: (stats: GameStats, chart: ChartData) => {
      ui.clearTouchZones();
      ui.hidePlayHud();
      setTimeout(() => ui.showResult(stats, chart), 800);
    },
  });

  ui.showLoading(t('ui.loadingModels'));
  await game.preloadDancerModels((loaded, total) => {
    ui.updateLoadingProgress(loaded, total);
  });
  ui.showTitle();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.getPhase() === 'playing') {
      endGameplay();
      ui.showSelect();
    }
  });
}

main().catch(console.error);
