import './styles.css';
import { initLocale } from './i18n';
import { AudioEngine } from './audio/AudioEngine';
import { allGameplayCheerUrls } from './audio/gameplayCheers';
import { songFinishCheerUrl } from './audio/songFinishCheer';
import { dangerVoiceUrl } from './audio/dangerVoice';
import { randomPickSoundUrls } from './audio/randomPickSounds';
import { resultAnnounceUrl, resultVoiceUrl } from './audio/resultVoice';
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
      game.start(playChart, {
        countdownSeconds: ui.consumeSkipGameCountdown() ? 0 : undefined,
      });
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
    customLoader,
    audio,
  );

  game = new Game(canvas, audio, {
    onCountdown: (num) => ui.updateCountdown(num),
    onPlayStart: () => ui.hideOverlay(),
    onFinish: (stats: GameStats, chart: ChartData) => {
      ui.clearTouchZones();
      ui.hidePlayHud();
      const delay = stats.failed ? 400 : 800;
      setTimeout(() => ui.showResult(stats, chart), delay);
    },
  });

  ui.showTitle();
  void ui.tryRestoreLastCustomFolder();
  void (async () => {
    const pickUrls = randomPickSoundUrls(import.meta.env.BASE_URL);
    const pickSoundsLoad = audio.loadRandomPickSounds(pickUrls);
    const songFinishCheerLoad = audio.loadSongFinishCheer(songFinishCheerUrl(import.meta.env.BASE_URL));
    try {
      await Promise.all([pickSoundsLoad, songFinishCheerLoad]);
      await Promise.all([
        builtinAudio.preloadAll(audio),
        audio.loadTitleBgm(`${import.meta.env.BASE_URL}audio/title_bgm.ogg`),
        audio.loadStartSound(`${import.meta.env.BASE_URL}audio/start.wav`),
        audio.loadCountdownSound(`${import.meta.env.BASE_URL}audio/countdown_tick.wav?v=countdown06-3`),
        audio.loadResultAnnounce(resultAnnounceUrl(import.meta.env.BASE_URL)),
        audio.loadResultVoices((id) => resultVoiceUrl(id, import.meta.env.BASE_URL)),
        audio.loadGameplayCheers(allGameplayCheerUrls(import.meta.env.BASE_URL)),
        audio.loadDangerVoice(dangerVoiceUrl(import.meta.env.BASE_URL)),
      ]);
      await ui.syncTitleBgm();
    } catch (err) {
      console.error(err);
    }
  })();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.getPhase() === 'playing') {
      endGameplay();
      ui.showSelect();
    }
  });
}

main().catch(console.error);
