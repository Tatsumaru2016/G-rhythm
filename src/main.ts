import './styles.css';
import { initLocale } from './i18n';
import { AudioEngine } from './audio/AudioEngine';
import { BuiltinSongAudio } from './audio/BuiltinSongAudio';
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
  const builtinAudio = new BuiltinSongAudio();

  let game: Game;
  let touchZones: HTMLElement[] = [];

  const prepareChartAudio = (chart: ChartData): ChartData => {
    if (chart.customAudio) {
      audio.clearChartBuffer();
      return chart;
    }
    customLoader.clear();
    audio.setChartBuffer(builtinAudio.getBuffer(chart.id));
    return builtinAudio.withAudioDuration(chart);
  };

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
      const playChart = prepareChartAudio(chart);
      game.setScrollSpeed(ui.getScrollSpeed());
      game.setReducedFlash(ui.getReducedFlash());
      game.setDebugStageFxPattern(ui.getDebugStageFxPatternOverride());
      ui.showCountdownOverlay(playChart);
      touchZones = ui.showTouchZones(() => game.getTouchZoneLayout());
      ui.showPlayHud();
      game.bindTouchZones(touchZones);
      game.start(playChart);
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

  ui.showLoading('ui.loadingModels');
  await builtinAudio.preloadAll(audio);
  ui.showTitle();
  void game.preloadDancerModels((loaded, total) => {
    ui.updateBackgroundLoadProgress(loaded, total);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.getPhase() === 'playing') {
      endGameplay();
      ui.showSelect();
    }
  });
}

main().catch(console.error);
