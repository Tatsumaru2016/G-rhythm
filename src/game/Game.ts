import type { ChartData, ActiveNote, GameStats, JudgmentType, LaneIndex } from '../types';
import {
  ddrStepMillionPoints,
  ddrFreezeOkPoints,
  roundDdrMillionScore,
  countMaxScoreSteps,
  applyClearFlags,
} from '../scoring/ddrScoring';
import {
  applyDanceGaugeJudgment,
  applyDanceGaugeDrop,
  applyDanceGaugeNg,
  clampDanceGauge,
  DANCE_GAUGE_START,
  getDanceGaugeStressLevel,
  isDanceGaugeFailed,
} from './danceGauge';
import { parseChart, getSongDuration, normalizeChartForPlay, withLeadInPad } from './ChartParser';
import { getAccuracyRatio } from '../data/charts';
import { getNewAccuracyMilestones, type AccuracyTier } from './accuracyMilestone';
import {
  judgeTiming,
  findHittableNote,
  getMissedNotes,
  checkHoldBreaks,
  getJudgmentConfig,
} from './Judgment';
import { InputManager } from './InputManager';
import { Renderer } from './Renderer';
import type { LaneBackgroundId } from './laneBackground';
import { ParticleSystem } from './ParticleSystem';
import { AudioEngine } from '../audio/AudioEngine';

export type GamePhase = 'idle' | 'countdown' | 'playing' | 'gameover' | 'finished';

/** プレイ開始前のカウントダウン秒数 */
export const GAME_COUNTDOWN_SECONDS = 5;

/** ゲージ切れ後、スコア画面へ行く前のゲームオーバー表示秒数 */
export const GAME_OVER_DISPLAY_SECONDS = 3.2;

export interface GameCallbacks {
  onFinish: (stats: GameStats, chart: ChartData) => void;
  onCountdown: (num: number) => void;
  onPlayStart: () => void;
}

export class Game {
  private canvas: HTMLCanvasElement;
  private renderer: Renderer;
  private input: InputManager;
  private audio: AudioEngine;
  private particles: ParticleSystem;
  private callbacks: GameCallbacks;

  private chart: ChartData | null = null;
  private notes: ActiveNote[] = [];
  private stats: GameStats = this.emptyStats();
  private phase: GamePhase = 'idle';
  private countdownValue = GAME_COUNTDOWN_SECONDS;
  private countdownTimer = 0;
  private songDuration = 0;
  private comboMultiplier = 1;
  private ddrMaxSteps = 0;
  private ddrScoreTotal = 0;
  private danceGauge = DANCE_GAUGE_START;
  private gameOverTimer = 0;
  private gameOverFreezeTime = 0;
  private accuracyMilestonesReached = new Set<AccuracyTier>();
  private rafId = 0;
  private lastFrameTime = 0;
  private running = false;

  constructor(canvas: HTMLCanvasElement, audio: AudioEngine, callbacks: GameCallbacks) {
    this.canvas = canvas;
    this.audio = audio;
    this.callbacks = callbacks;
    this.renderer = new Renderer(canvas);
    this.input = new InputManager();
    this.particles = new ParticleSystem();

    this.input.onInput((lane, pressed) => {
      if (this.phase !== 'playing') return;
      if (pressed) this.onLanePress(lane);
      else this.onLaneRelease(lane);
    });

    this.audio.setOnMusicEnd(() => {
      if (this.phase !== 'playing') return;
      if (isDanceGaugeFailed(this.danceGauge)) {
        this.triggerGameOver();
      } else {
        this.finishGame();
      }
    });
  }

  bindTouchZones(zones: HTMLElement[]) {
    this.input.bindTouchZones(zones);
  }

  getTouchZoneLayout() {
    return this.renderer.getTouchZoneLayout();
  }

  start(chart: ChartData, options?: { countdownSeconds?: number }) {
    cancelAnimationFrame(this.rafId);
    const playChart = withLeadInPad(normalizeChartForPlay(chart), this.renderer.getApproachTime());
    this.chart = playChart;
    this.notes = parseChart(playChart);
    this.stats = this.emptyStats();
    this.ddrMaxSteps = countMaxScoreSteps(playChart);
    this.ddrScoreTotal = 0;
    this.danceGauge = DANCE_GAUGE_START;
    this.gameOverTimer = 0;
    this.gameOverFreezeTime = 0;
    this.songDuration = getSongDuration(playChart);
    this.comboMultiplier = 1;
    this.accuracyMilestonesReached.clear();

    const countdownSeconds = options?.countdownSeconds ?? GAME_COUNTDOWN_SECONDS;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.renderer.resetSideEffects(playChart);
    this.renderer.setSongDuration(this.songDuration);

    if (countdownSeconds <= 0) {
      this.phase = 'playing';
      this.countdownValue = 0;
      this.countdownTimer = 0;
      void this.audio.resume().then(() => {
        this.audio.playGameStartSound();
        if (this.chart) this.audio.play(this.chart);
      });
      this.callbacks.onPlayStart();
      this.loop();
      return;
    }

    this.phase = 'countdown';
    this.countdownValue = countdownSeconds;
    this.countdownTimer = 0;
    void this.audio.resume().then(() => this.audio.playCountdownTick(countdownSeconds));
    this.loop();
  }

  setScrollSpeed(multiplier: number) {
    this.renderer.setScrollSpeed(multiplier);
  }

  setDisplayTiming(value: number) {
    this.renderer.setDisplayTiming(value);
  }

  setLaneBackground(id: LaneBackgroundId) {
    this.renderer.setLaneBackground(id);
  }

  setReducedFlash(enabled: boolean) {
    this.renderer.setReducedFlash(enabled);
    this.particles.setReducedFlash(enabled);
  }

  setDebugStageFxPattern(pattern: number | null) {
    this.renderer.setDebugStageFxPattern(pattern);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.audio.stop();
    this.particles.clear();
    this.renderer.onGameEnd();
    this.phase = 'idle';
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  getStats(): GameStats {
    return { ...this.stats };
  }

  private emptyStats(): GameStats {
    return {
      score: 0,
      combo: 0,
      maxCombo: 0,
      marvelous: 0,
      perfect: 0,
      great: 0,
      good: 0,
      bad: 0,
      miss: 0,
    };
  }

  private loop = () => {
    if (!this.running) return;

    try {
      const now = performance.now();
      const dt = Math.min((now - this.lastFrameTime) / 1000, 0.05);
      this.lastFrameTime = now;

      if (this.phase === 'countdown') {
        this.countdownTimer += dt;
        if (this.countdownTimer >= 1) {
          this.countdownTimer = 0;
          this.countdownValue--;
          this.callbacks.onCountdown(this.countdownValue);
          if (this.countdownValue > 0) {
            this.audio.playCountdownTick(this.countdownValue);
          } else {
            this.audio.playGameStartSound();
            this.phase = 'playing';
            if (this.chart) this.audio.play(this.chart);
            this.callbacks.onPlayStart();
          }
        }
      } else if (this.phase === 'playing') {
        const currentTime = this.audio.getCurrentTime();
        this.processAutoMiss(currentTime);

        if (this.phase === 'playing' && isDanceGaugeFailed(this.danceGauge)) {
          this.triggerGameOver();
        } else if (this.phase === 'playing' && this.danceGauge > 0 && this.danceGauge < 0.00001) {
          this.setDanceGauge(0);
        }

        if (this.phase === 'playing' && currentTime >= this.songDuration) {
          if (isDanceGaugeFailed(this.danceGauge)) {
            this.triggerGameOver();
          } else {
            this.finishGame();
          }
        }
      } else if (this.phase === 'gameover') {
        this.gameOverTimer += dt;
        if (this.gameOverTimer >= GAME_OVER_DISPLAY_SECONDS) {
          this.finishGame(true);
        }
      }

      if ((this.phase === 'playing' || this.phase === 'gameover') && this.chart) {
        const currentTime =
          this.phase === 'gameover' ? this.gameOverFreezeTime : this.audio.getCurrentTime();
        this.audio.updateAudioReactive(dt);
        this.renderer.update(dt);
        this.particles.update(dt);
        this.renderer.render(
          this.notes,
          currentTime,
          this.chart,
          this.stats,
          this.particles,
          this.audio.getAudioReactive(),
          this.danceGauge,
        );
      } else if (this.phase === 'countdown' && this.chart) {
        this.renderer.update(dt);
        this.renderer.render(
          [],
          0,
          this.chart,
          this.stats,
          this.particles,
          this.audio.getAudioReactive(),
          this.danceGauge,
        );
      }
    } catch (err) {
      console.error('[Game] loop error', err);
    }

    if (this.running) {
      this.rafId = requestAnimationFrame(this.loop);
    }
  };

  private finishGame(failed = false) {
    if (this.phase === 'finished') return;
    this.phase = 'finished';
    this.running = false;
    cancelAnimationFrame(this.rafId);
    if (!failed) {
      void this.audio.ensureSongFinishCheerLoaded().then(() => {
        this.audio.playSongFinishCheer();
      });
    }
    this.audio.stop();
    this.particles.clear();
    this.renderer.onGameEnd();
    if (this.chart) {
      this.stats.failed = failed;
      this.stats.score = roundDdrMillionScore(this.ddrScoreTotal);
      applyClearFlags(this.stats);
      this.callbacks.onFinish(this.stats, this.chart);
    }
  }

  private onLanePress(lane: LaneIndex) {
    const currentTime = this.audio.getCurrentTime();
    const note = findHittableNote(this.notes, lane, currentTime);

    if (!note) return;

    const diff = (currentTime - note.time) * 1000;
    const judgment = judgeTiming(diff);
    if (judgment === 'miss') {
      note.missed = true;
      this.registerMiss(lane, 'timing');
      return;
    }

    this.applyJudgment(judgment, lane, note);

    if (note.type === 'hold') {
      note.hit = true;
      note.holding = true;
    } else {
      note.hit = true;
    }
  }

  private onLaneRelease(lane: LaneIndex) {
    const currentTime = this.audio.getCurrentTime();
    const note = findHittableNote(this.notes, lane, currentTime, true);

    if (!note || !note.endTime) return;

    const diff = (currentTime - note.endTime) * 1000;
    const judgment = judgeTiming(diff);
    note.released = true;
    note.holding = false;

    if (judgment !== 'miss') {
      this.applyFreezeOk(lane, note);
    } else {
      this.registerFreezeNg(lane, note);
    }
  }

  private applyJudgment(judgment: JudgmentType, lane: LaneIndex, _note: ActiveNote) {
    const config = getJudgmentConfig(judgment);
    if (!config) return;

    this.stats[judgment]++;
    if (config.countsCombo) {
      this.stats.combo++;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo);
      this.comboMultiplier = Math.min(4, 1 + Math.floor(this.stats.combo / 20));
    } else {
      this.stats.combo = 0;
      this.comboMultiplier = 1;
    }

    const points = ddrStepMillionPoints(judgment, this.ddrMaxSteps);
    this.ddrScoreTotal += points;
    this.stats.score = roundDdrMillionScore(this.ddrScoreTotal);
    this.setDanceGauge(applyDanceGaugeJudgment(this.danceGauge, judgment));

    this.audio.playHitSound(lane, judgment, getAccuracyRatio(this.stats));
    if (judgment === 'marvelous' || judgment === 'perfect' || judgment === 'great') {
      this.audio.playRandomGameplayCheer();
    } else {
      this.audio.playJudgmentVoice(judgment);
    }
    this.renderer.triggerLaneGlow(lane, judgment);
    this.renderer.triggerScreenEffect(judgment);
    this.renderer.showJudgment(judgment);
    this.renderer.notifySideJudgment(judgment, this.stats.combo);
    this.checkAccuracyMilestones();

    const cx = this.renderer.getLaneCenterX(lane);
    const cy = this.renderer.getHitLineY();
    const particleCounts: Record<JudgmentType, [number, number]> = {
      marvelous: [40, 14],
      perfect: [36, 12],
      great: [30, 10],
      good: [28, 10],
      bad: [26, 9],
      miss: [14, 5],
    };
    const [full, reduced] = particleCounts[judgment];
    this.particles.burst(cx, cy, lane, this.renderer.getReducedFlash() ? reduced : full, judgment);
  }

  private applyFreezeOk(lane: LaneIndex, _note: ActiveNote): void {
    this.stats.ok = (this.stats.ok ?? 0) + 1;
    this.stats.combo++;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo);

    this.ddrScoreTotal += ddrFreezeOkPoints(this.ddrMaxSteps);
    this.stats.score = roundDdrMillionScore(this.ddrScoreTotal);

    this.setDanceGauge(applyDanceGaugeJudgment(this.danceGauge, 'perfect'));

    this.audio.playHitSound(lane, 'perfect', getAccuracyRatio(this.stats));
    this.audio.playJudgmentVoice('great');
    this.renderer.triggerLaneGlow(lane, 'perfect');
    this.renderer.triggerScreenEffect('great');
    this.renderer.showFreezeJudgment('ok');
    this.renderer.notifySideJudgment('perfect', this.stats.combo);
    this.checkAccuracyMilestones();

    const cx = this.renderer.getLaneCenterX(lane);
    const cy = this.renderer.getHitLineY();
    const [full, reduced] = [28, 10] as const;
    this.particles.burst(cx, cy, lane, this.renderer.getReducedFlash() ? reduced : full, 'perfect');
  }

  private registerFreezeNg(lane: LaneIndex, note: ActiveNote): void {
    const prevCombo = this.stats.combo;
    note.missed = true;
    note.holding = false;
    this.stats.ng = (this.stats.ng ?? 0) + 1;
    this.stats.combo = 0;
    this.comboMultiplier = 1;

    this.setDanceGauge(applyDanceGaugeNg(this.danceGauge));

    this.audio.playMissSound();
    this.renderer.triggerScreenEffect('miss');
    this.renderer.triggerMissFlash();
    this.renderer.showFreezeJudgment('ng');
    this.renderer.triggerLaneGlow(lane, 'miss');
    this.renderer.notifySideJudgment('miss', 0);
    if (prevCombo > 0) {
      this.renderer.triggerComboBreak(prevCombo);
    }

    const cx = this.renderer.getLaneCenterX(lane);
    const cy = this.renderer.getHitLineY();
    const [full, reduced] = [14, 5] as const;
    this.particles.burst(cx, cy, lane, this.renderer.getReducedFlash() ? reduced : full, 'miss');
    this.checkAccuracyMilestones();
  }

  private registerMiss(lane: LaneIndex, kind: 'drop' | 'timing' = 'drop') {
    const prevCombo = this.stats.combo;
    this.stats.miss++;
    this.stats.combo = 0;
    this.comboMultiplier = 1;
    this.setDanceGauge(
      kind === 'drop'
        ? applyDanceGaugeDrop(this.danceGauge)
        : applyDanceGaugeJudgment(this.danceGauge, 'miss'),
    );

    this.audio.playMissSound();
    this.renderer.triggerScreenEffect('miss');
    this.renderer.triggerMissFlash();
    this.renderer.showJudgment('miss');
    this.renderer.triggerLaneGlow(lane, 'miss');
    this.renderer.notifySideJudgment('miss', 0);
    if (prevCombo > 0) {
      this.renderer.triggerComboBreak(prevCombo);
    }

    const cx = this.renderer.getLaneCenterX(lane);
    const cy = this.renderer.getHitLineY();
    const [full, reduced] = [14, 5] as const;
    this.particles.burst(cx, cy, lane, this.renderer.getReducedFlash() ? reduced : full, 'miss');
    this.checkAccuracyMilestones();
  }

  private triggerGameOver(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'gameover';
    this.gameOverTimer = 0;
    this.gameOverFreezeTime = this.audio.getCurrentTime();
    this.audio.stop();
    this.audio.playGameOverSound();
    this.renderer.triggerGameOver();
  }

  private setDanceGauge(next: number): void {
    const prev = this.danceGauge;
    const nextGauge = clampDanceGauge(next) <= 0 ? 0 : clampDanceGauge(next);

    // 極小値のまま 0 にスナップされず失敗判定を逃すのを防ぐ
    if (nextGauge > 0 && Math.abs(nextGauge - prev) < 0.00001) return;

    this.danceGauge = nextGauge;
    this.notifyGaugeDangerEntered(prev, nextGauge);
    this.renderer.notifyDanceGaugeChange(prev, nextGauge);
    this.maybeTriggerGaugeFailure();
  }

  private maybeTriggerGaugeFailure(): void {
    if (isDanceGaugeFailed(this.danceGauge)) {
      this.triggerGameOver();
    }
  }

  private notifyGaugeDangerEntered(prevGauge: number, nextGauge: number): void {
    if (getDanceGaugeStressLevel(prevGauge) < 2 && getDanceGaugeStressLevel(nextGauge) >= 2) {
      this.audio.playDangerVoice();
    }
  }

  private checkAccuracyMilestones() {
    const fresh = getNewAccuracyMilestones(this.stats, this.accuracyMilestonesReached);
    for (const tier of fresh) {
      this.accuracyMilestonesReached.add(tier);
      this.renderer.triggerAccuracyMilestone(tier);
      this.audio.playAccuracyMilestone(tier);
    }
  }

  private processAutoMiss(currentTime: number) {
    const missed = getMissedNotes(this.notes, currentTime);
    for (const note of missed) {
      this.registerMiss(note.lane, 'drop');
    }

    const broken = checkHoldBreaks(this.notes, currentTime, this.input.getPressedState());
    for (const note of broken) {
      this.registerFreezeNg(note.lane, note);
    }
  }
}
