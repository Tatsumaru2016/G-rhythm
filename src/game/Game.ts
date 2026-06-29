import type { ChartData, ActiveNote, GameStats, JudgmentType, LaneIndex } from '../types';
import { BASE_SCORE } from '../types';
import { parseChart, getSongDuration, normalizeChartForPlay, withLeadInPad } from './ChartParser';
import { getAccuracyRatio } from '../data/charts';
import {
  getNewAccuracyMilestones,
  type AccuracyTier,
} from './accuracyMilestone';
import {
  judgeTiming, findHittableNote, getMissedNotes, checkHoldBreaks,
  getJudgmentConfig,
} from './Judgment';
import { InputManager } from './InputManager';
import { Renderer } from './Renderer';
import { ParticleSystem } from './ParticleSystem';
import { AudioEngine } from '../audio/AudioEngine';
import type { DancerModelId } from './dancerCatalog';

export type GamePhase = 'idle' | 'countdown' | 'playing' | 'finished';

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
  private countdownValue = 3;
  private countdownTimer = 0;
  private songDuration = 0;
  private comboMultiplier = 1;
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
      if (this.phase === 'playing') this.finishGame();
    });
  }

  preloadDancerModels(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    return this.renderer.preloadDancerModels(onProgress);
  }

  bindTouchZones(zones: HTMLElement[]) {
    this.input.bindTouchZones(zones);
  }

  start(chart: ChartData) {
    cancelAnimationFrame(this.rafId);
    const playChart = withLeadInPad(normalizeChartForPlay(chart), this.renderer.getApproachTime());
    this.chart = playChart;
    this.notes = parseChart(playChart);
    this.stats = this.emptyStats();
    this.songDuration = getSongDuration(playChart);
    this.comboMultiplier = 1;
    this.accuracyMilestonesReached.clear();
    this.phase = 'countdown';
    this.countdownValue = 3;
    this.countdownTimer = 0;
    this.running = true;
    this.lastFrameTime = performance.now();
    this.renderer.resetSideEffects(playChart);
    this.renderer.setSongDuration(this.songDuration);
    void this.audio.resume().then(() => this.audio.playCountdownTick(3));
    this.loop();
  }

  setScrollSpeed(multiplier: number) {
    this.renderer.setScrollSpeed(multiplier);
  }

  setReducedFlash(enabled: boolean) {
    this.renderer.setReducedFlash(enabled);
    this.particles.setReducedFlash(enabled);
  }

  setDebugStageFxPattern(pattern: number | null) {
    this.renderer.setDebugStageFxPattern(pattern);
  }

  startDancerPreview(leftId: DancerModelId, rightId: DancerModelId) {
    this.renderer.startDancerPreview(leftId, rightId);
  }

  setDancerPreviewModels(leftId: DancerModelId, rightId: DancerModelId) {
    this.renderer.setDancerPreviewModels(leftId, rightId);
  }

  stopDancerPreview() {
    this.renderer.stopDancerPreview();
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
      score: 0, combo: 0, maxCombo: 0,
      perfect: 0, great: 0, good: 0, bad: 0, miss: 0,
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
            this.audio.playCountdownStart();
            this.phase = 'playing';
            if (this.chart) this.audio.play(this.chart);
            this.callbacks.onPlayStart();
          }
        }
      } else if (this.phase === 'playing') {
        const currentTime = this.audio.getCurrentTime();
        this.processAutoMiss(currentTime);

        if (currentTime >= this.songDuration) {
          this.finishGame();
        }
      }

      if (this.phase === 'playing' && this.chart) {
        const currentTime = this.audio.getCurrentTime();
        this.audio.updateAudioReactive(dt);
        this.renderer.update(dt);
        this.particles.update(dt);
        this.renderer.render(
          this.notes, currentTime, this.chart, this.stats, this.particles,
          this.audio.getAudioReactive(),
        );
      } else if (this.phase === 'countdown' && this.chart) {
        this.renderer.update(dt);
        this.renderer.render(
          [], 0, this.chart, this.stats, this.particles,
          this.audio.getAudioReactive(),
        );
      }
    } catch (err) {
      console.error('[Game] loop error', err);
    }

    if (this.running) {
      this.rafId = requestAnimationFrame(this.loop);
    }
  };

  private finishGame() {
    if (this.phase === 'finished') return;
    this.phase = 'finished';
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.audio.stop();
    this.particles.clear();
    this.renderer.onGameEnd();
    if (this.chart) this.callbacks.onFinish(this.stats, this.chart);
  }

  private onLanePress(lane: LaneIndex) {
    const currentTime = this.audio.getCurrentTime();
    const note = findHittableNote(this.notes, lane, currentTime);

    if (!note) return;

    const diff = (currentTime - note.time) * 1000;
    const judgment = judgeTiming(diff);
    if (judgment === 'miss') return;

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
      this.applyJudgment(judgment, lane, note, true);
    } else {
      this.registerMiss(lane);
    }
  }

  private applyJudgment(judgment: JudgmentType, lane: LaneIndex, note: ActiveNote, isRelease = false) {
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

    const points = Math.floor(BASE_SCORE * config.scoreRatio * this.comboMultiplier);
    this.stats.score += points;

    if (!isRelease) {
      this.audio.playHitSound(lane, judgment, getAccuracyRatio(this.stats));
      this.audio.playJudgmentVoice(judgment);
      this.renderer.triggerLaneGlow(lane, judgment);
      this.renderer.triggerScreenEffect(judgment);
      this.renderer.showJudgment(judgment);
      this.renderer.notifySideJudgment(judgment, this.stats.combo);
      this.checkAccuracyMilestones();

      const cx = this.renderer.getLaneCenterX(lane);
      const cy = this.renderer.getHitLineY();
      const particleCounts: Record<JudgmentType, [number, number]> = {
        perfect: [36, 12],
        great: [30, 10],
        good: [28, 10],
        bad: [26, 9],
        miss: [14, 5],
      };
      const [full, reduced] = particleCounts[judgment];
      this.particles.burst(
        cx, cy, lane,
        this.renderer.getReducedFlash() ? reduced : full,
        judgment,
      );
    }
  }

  private registerMiss(lane: LaneIndex) {
    this.stats.miss++;
    this.stats.combo = 0;
    this.comboMultiplier = 1;
    this.audio.playMissSound();
    this.renderer.triggerScreenEffect('miss');
    this.renderer.showJudgment('miss');
    this.renderer.triggerLaneGlow(lane, 'miss');
    this.renderer.notifySideJudgment('miss', 0);
    this.checkAccuracyMilestones();
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
      this.stats.miss++;
      this.stats.combo = 0;
      this.comboMultiplier = 1;
      this.audio.playMissSound();
      this.renderer.triggerScreenEffect('miss');
    }

    const broken = checkHoldBreaks(this.notes, currentTime, this.input.getPressedState());
    for (const note of broken) {
      this.stats.miss++;
      this.stats.combo = 0;
      this.comboMultiplier = 1;
    }

    if (missed.length > 0 || broken.length > 0) {
      this.checkAccuracyMilestones();
    }
  }
}
