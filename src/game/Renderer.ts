import type { ActiveNote, ChartData, GameStats, JudgmentType, LaneIndex } from '../types';
import {
  LANE_COLORS,
  LANE_LABELS,
  LANE_ARROW_LABELS,
  DEFAULT_NOTE_SPEED,
  BASE_APPROACH_TIME,
} from '../types';
import { JUDGMENT_COLORS } from './Judgment';
import { ParticleSystem } from './ParticleSystem';
import { SideStageFX } from './SideStageFX';
import {
  clampDanceGauge,
  DANCE_GAUGE_DANGER_THRESHOLD,
  DANCE_GAUGE_SEGMENT_COUNT,
  DANCE_GAUGE_START,
  DANCE_GAUGE_WARNING_THRESHOLD,
  getDanceGaugeSegmentColor,
  getDanceGaugeSegmentFill,
  getDanceGaugeStressLevel,
  isDanceGaugeFull,
} from './danceGauge';
import type { AudioReactive } from '../audio/AudioEngine';
import { DEFAULT_SCROLL_SPEED } from '../settings/scrollSpeed';
import { isPlayStageDecorFxEnabled } from '../settings/playStageFx';
import { getSongPhase, PHASE_BACKGROUND_THEMES, type SongPhase } from './scrollPhase';
import { getMilestoneSublabel, t, tFreezeJudgment, type FreezeJudgment } from '../i18n';
import { getJudgmentLabel } from './Judgment';
import { drawPlayHud } from './playHudRenderer';
import { ACCURACY_MILESTONE_STYLE, type AccuracyTier } from './accuracyMilestone';

interface LaneGlow {
  intensity: number;
  color: string;
}

interface ScreenEffect {
  shake: number;
  perfectPulse: number;
  missFlash: number;
}

interface ComboBreakShard {
  angle: number;
  dist: number;
  speed: number;
  size: number;
  spin: number;
}

interface ComboBreakFx {
  alpha: number;
  age: number;
  prevCombo: number;
  shards: ComboBreakShard[];
}

interface GameOverFx {
  age: number;
}

interface PlayfieldStressMetrics {
  stress: 0 | 1 | 2;
  severity: number;
  pulse: number;
}

interface GaugeDamageFx {
  age: number;
  delta: number;
  intensity: number;
  offsetY: number;
}

type PanelMarker = 'tap' | 'hold-press' | 'hold-release' | 'chain' | 'chord';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private static readonly LANE_MARGIN_LEFT = 10;
  private static readonly LANE_AREA_WIDTH_RATIO = 0.34;
  private static readonly LANE_AREA_MAX_PX = 392;

  private laneWidth = 0;
  private laneStartX = 0;
  private laneTopY = 0;
  private hitLineY = 0;
  private laneBottomY = 0;
  private noteHeight = 0;
  private readonly gaugeBandH = 52;
  private laneGlows: LaneGlow[] = [];
  private gameOverFx: GameOverFx | null = null;
  private lastDanceGauge = 1;
  private targetDanceGauge = DANCE_GAUGE_START;
  private displayedDanceGauge = DANCE_GAUGE_START;
  private gaugeDamageFx: GaugeDamageFx | null = null;
  private scrollSpeed = DEFAULT_SCROLL_SPEED;
  private songDuration = 0;
  private reducedFlash = false;
  private screen: ScreenEffect = { shake: 0, perfectPulse: 0, missFlash: 0 };
  private comboBreak: ComboBreakFx | null = null;
  private lastJudgment: {
    text: string;
    color: string;
    alpha: number;
    scale: number;
    glow: number;
  } | null = null;
  private accuracyMilestoneBanner: {
    tier: AccuracyTier;
    alpha: number;
    scale: number;
    age: number;
  } | null = null;
  private bgStars: { x: number; y: number; z: number; brightness: number }[] = [];
  private lastBackgroundPhase: SongPhase = 'early';
  private phaseTransition = 0;
  private time = 0;
  private lastDt = 0;
  private sideFX = new SideStageFX();
  private playfieldActive = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;

    for (let i = 0; i < 4; i++) {
      this.laneGlows.push({ intensity: 0, color: LANE_COLORS[i] });
    }

    for (let i = 0; i < 80; i++) {
      this.bgStars.push({
        x: Math.random(),
        y: Math.random(),
        z: 0.2 + Math.random() * 0.8,
        brightness: 0.3 + Math.random() * 0.7,
      });
    }

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private laneBounds(): {
    startX: number;
    topY: number;
    width: number;
    bottomY: number;
    hitLineY: number;
  } {
    return {
      startX: this.laneStartX,
      topY: this.laneTopY,
      width: this.laneWidth * 4,
      bottomY: this.laneBottomY,
      hitLineY: this.hitLineY,
    };
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    this.width = rect?.width ?? window.innerWidth;
    this.height = rect?.height ?? window.innerHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const maxLaneArea = Math.min(
      this.width * Renderer.LANE_AREA_WIDTH_RATIO,
      Renderer.LANE_AREA_MAX_PX,
    );
    this.laneWidth = maxLaneArea / 4;
    const laneW = this.laneWidth * 4;
    this.laneStartX = Math.max(0, (this.width - laneW) * 0.5);
    this.laneTopY = 0;
    const keyHintReserve = Math.max(80, Math.min(108, Math.round(this.height * 0.11)));
    this.hitLineY = this.height - keyHintReserve;
    this.laneBottomY = this.height;
    this.noteHeight = Math.max(14, this.laneWidth * 0.32);
  }

  private laneLeft(lane: LaneIndex): number {
    return this.laneStartX + lane * this.laneWidth;
  }

  private laneRight(lane: LaneIndex): number {
    return this.laneLeft(lane) + this.laneWidth;
  }

  getLaneCenterX(lane: LaneIndex): number {
    return this.laneLeft(lane) + this.laneWidth / 2;
  }

  getTouchZoneLayout(): {
    laneStartX: number;
    laneWidth: number;
    topY: number;
    hitLineY: number;
  } {
    return {
      laneStartX: this.laneStartX,
      laneWidth: this.laneWidth,
      topY: this.laneTopY,
      hitLineY: this.hitLineY,
    };
  }

  private getPlayfieldCenterX(): number {
    return this.laneStartX + this.laneWidth * 2;
  }

  getHitLineY(): number {
    return this.hitLineY;
  }

  setScrollSpeed(multiplier: number): void {
    this.scrollSpeed = multiplier;
  }

  setSongDuration(duration: number): void {
    this.songDuration = Math.max(0, duration);
  }

  setReducedFlash(enabled: boolean): void {
    this.reducedFlash = enabled;
    this.sideFX.setReducedFlash(enabled);
  }

  setDebugStageFxPattern(pattern: number | null): void {
    this.sideFX.setDebugPattern(pattern);
  }

  getDebugStageFxPattern(): number {
    return this.sideFX.getPattern();
  }

  resetSideEffects(chart: ChartData): void {
    this.playfieldActive = true;
    this.sideFX.reset(chart);
    this.lastBackgroundPhase = 'early';
    this.phaseTransition = 0;
    this.targetDanceGauge = DANCE_GAUGE_START;
    this.displayedDanceGauge = DANCE_GAUGE_START;
    this.gaugeDamageFx = null;
  }

  notifyDanceGaugeChange(prev: number, next: number): void {
    this.targetDanceGauge = next;
    if (next >= prev - 0.0001) return;

    const delta = next - prev;
    if (this.gaugeDamageFx && this.gaugeDamageFx.age < 0.22) {
      this.gaugeDamageFx.delta += delta;
      this.gaugeDamageFx.intensity = 1;
      this.gaugeDamageFx.age = 0;
      this.gaugeDamageFx.offsetY = 0;
      return;
    }
    this.gaugeDamageFx = { age: 0, delta, intensity: 1, offsetY: 0 };
  }

  onGameEnd(): void {
    this.playfieldActive = false;
    this.songDuration = 0;
    this.lastJudgment = null;
    this.accuracyMilestoneBanner = null;
    this.gameOverFx = null;
    this.screen = { shake: 0, perfectPulse: 0, missFlash: 0 };
    for (const g of this.laneGlows) g.intensity = 0;
    this.comboBreak = null;
    this.gaugeDamageFx = null;
    this.sideFX.clear();
    this.renderCleared();
  }

  notifySideJudgment(judgment: JudgmentType, combo: number): void {
    if (!isPlayStageDecorFxEnabled()) return;
    this.sideFX.onJudgment(judgment, combo, this.width, this.height, this.laneBounds());
  }

  triggerAccuracyMilestone(tier: AccuracyTier): void {
    const style = ACCURACY_MILESTONE_STYLE[tier];

    this.accuracyMilestoneBanner = { tier, alpha: 1, scale: 0.55, age: 0 };

    if (!this.reducedFlash && isPlayStageDecorFxEnabled()) {
      this.screen.perfectPulse = Math.max(this.screen.perfectPulse, style.pulse);
      this.screen.shake = Math.max(this.screen.shake, tier === 95 ? 5 : tier === 90 ? 4 : 3);
    }

    if (isPlayStageDecorFxEnabled()) {
      this.sideFX.onAccuracyMilestone(tier, this.width, this.height, this.laneBounds());
    }
  }

  getScrollSpeed(): number {
    return this.scrollSpeed;
  }

  private getEffectiveScrollMultiplier(_currentTime: number): number {
    return this.scrollSpeed;
  }

  getNoteSpeed(currentTime = 0): number {
    return DEFAULT_NOTE_SPEED * this.getEffectiveScrollMultiplier(currentTime);
  }

  getApproachTime(currentTime = 0): number {
    const travel = this.hitLineY - this.laneTopY;
    const speed = this.getNoteSpeed(currentTime);
    if (travel <= 0 || speed <= 0)
      return BASE_APPROACH_TIME / this.getEffectiveScrollMultiplier(currentTime);
    return travel / speed;
  }

  getReducedFlash(): boolean {
    return this.reducedFlash;
  }

  private noteY(currentTime: number, noteTime: number): number {
    const diff = noteTime - currentTime;
    return this.hitLineY - diff * this.getNoteSpeed(currentTime);
  }

  private isInApproachWindow(currentTime: number, noteTime: number): boolean {
    return noteTime - currentTime <= this.getApproachTime(currentTime);
  }

  private shouldDrawNote(note: ActiveNote, currentTime: number): boolean {
    if (note.type === 'hold' && (note.holding || note.hit)) return true;
    return this.isInApproachWindow(currentTime, note.time);
  }

  private blendHex(hex: string, factor: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const f = (c: number) => Math.min(255, Math.round(c * factor));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  triggerLaneGlow(lane: LaneIndex, judgment: JudgmentType) {
    const scale = this.reducedFlash ? 0.45 : 1;
    const intensity: Record<JudgmentType, number> = {
      marvelous: 1.35,
      perfect: 1.2,
      great: 1.0,
      good: 0.92,
      bad: 0.82,
      miss: 1.35,
    };
    this.laneGlows[lane].intensity = intensity[judgment] * scale;
    this.laneGlows[lane].color = judgment === 'miss' ? '#ff1a2e' : JUDGMENT_COLORS[judgment];
  }

  triggerMissFlash(): void {
    this.screen.missFlash = this.reducedFlash ? 0.5 : 1;
  }

  triggerGameOver(): void {
    this.gameOverFx = { age: 0 };
    this.screen.missFlash = this.reducedFlash ? 0.65 : 1;
    this.screen.shake = this.reducedFlash ? 5 : 14;
  }

  triggerComboBreak(prevCombo: number): void {
    if (prevCombo <= 0) return;
    const shardCount = Math.min(28, 10 + Math.floor(prevCombo / 8));
    this.comboBreak = {
      alpha: 1,
      age: 0,
      prevCombo,
      shards: Array.from({ length: shardCount }, () => ({
        angle: Math.random() * Math.PI * 2,
        dist: 0,
        speed: 140 + Math.random() * 220,
        size: 5 + Math.random() * 10,
        spin: (Math.random() - 0.5) * 12,
      })),
    };
  }

  triggerScreenEffect(judgment: JudgmentType) {
    if (this.reducedFlash) {
      if (judgment === 'miss' || judgment === 'bad') {
        this.screen.shake = 2;
        if (judgment === 'miss') this.screen.missFlash = 0.35;
      } else if (judgment === 'good') this.screen.shake = 1;
      return;
    }
    switch (judgment) {
      case 'marvelous':
        this.screen.perfectPulse = 1.15;
        this.screen.shake = 1.5;
        break;
      case 'perfect':
        this.screen.perfectPulse = 1;
        this.screen.shake = 2;
        break;
      case 'great':
        this.screen.perfectPulse = 0.55;
        this.screen.shake = 3;
        break;
      case 'good':
        this.screen.perfectPulse = 0.4;
        this.screen.shake = 4;
        break;
      case 'bad':
        this.screen.shake = 6;
        this.screen.perfectPulse = 0.2;
        break;
      case 'miss':
        this.screen.shake = 8;
        this.screen.missFlash = 1;
        break;
    }
  }

  showJudgment(judgment: JudgmentType) {
    const scales: Record<JudgmentType, number> = {
      marvelous: 1.55,
      perfect: 1.45,
      great: 1.32,
      good: 1.28,
      bad: 1.22,
      miss: 1.1,
    };
    const glows: Record<JudgmentType, number> = {
      marvelous: 34,
      perfect: 28,
      great: 22,
      good: 24,
      bad: 20,
      miss: 14,
    };
    this.lastJudgment = {
      text: getJudgmentLabel(judgment),
      color: JUDGMENT_COLORS[judgment],
      alpha: 1,
      scale: scales[judgment],
      glow: glows[judgment],
    };
  }

  showFreezeJudgment(judgment: FreezeJudgment): void {
    const isOk = judgment === 'ok';
    this.lastJudgment = {
      text: tFreezeJudgment(judgment),
      color: isOk ? '#7fff00' : '#ff2d6a',
      alpha: 1,
      scale: isOk ? 1.35 : 1.12,
      glow: isOk ? 22 : 14,
    };
  }

  update(dt: number) {
    this.lastDt = dt;
    this.animateDanceGaugeDisplay(dt);
    if (!this.playfieldActive) return;
    this.time += dt;
    for (const g of this.laneGlows) {
      g.intensity *= 0.92;
    }
    this.screen.shake *= 0.85;
    this.screen.perfectPulse *= 0.9;
    this.screen.missFlash *= 0.78;
    if (this.comboBreak) {
      this.comboBreak.age += dt;
      for (const shard of this.comboBreak.shards) {
        shard.dist += shard.speed * dt;
        shard.angle += shard.spin * dt;
      }
      this.comboBreak.alpha -= dt * 2.8;
      if (this.comboBreak.alpha <= 0) this.comboBreak = null;
    }
    if (this.lastJudgment) {
      this.lastJudgment.alpha -= dt * 2.5;
      this.lastJudgment.scale += dt * 0.5;
      if (this.lastJudgment.alpha <= 0) this.lastJudgment = null;
    }
    if (this.accuracyMilestoneBanner) {
      this.accuracyMilestoneBanner.age += dt;
      this.accuracyMilestoneBanner.scale = Math.min(
        this.accuracyMilestoneBanner.tier === 95 ? 1.35 : 1.22,
        0.55 + this.accuracyMilestoneBanner.age * 2.4,
      );
      this.accuracyMilestoneBanner.alpha -= dt * 0.65;
      if (this.accuracyMilestoneBanner.alpha <= 0) this.accuracyMilestoneBanner = null;
    }
    if (this.gameOverFx) {
      this.gameOverFx.age += dt;
      this.screen.shake = Math.max(this.screen.shake, this.reducedFlash ? 3 : 8);
    }
    if (this.playfieldActive && !this.reducedFlash) {
      const { stress, severity } = this.getPlayfieldStressMetrics(this.lastDanceGauge);
      if (stress >= 2) {
        this.screen.shake = Math.max(
          this.screen.shake,
          1.2 + severity * 3.5 * (0.55 + 0.45 * Math.abs(Math.sin(this.time * 13))),
        );
      }
    }
  }

  private animateDanceGaugeDisplay(dt: number): void {
    const diff = this.targetDanceGauge - this.displayedDanceGauge;
    if (Math.abs(diff) < 0.0005) {
      this.displayedDanceGauge = this.targetDanceGauge;
    } else if (diff < 0) {
      this.displayedDanceGauge += diff * Math.min(1, dt * 24);
    } else {
      this.displayedDanceGauge += diff * Math.min(1, dt * 7);
    }

    if (!this.gaugeDamageFx) return;
    this.gaugeDamageFx.age += dt;
    this.gaugeDamageFx.offsetY += dt * 32;
    this.gaugeDamageFx.intensity *= 1 - dt * 3.8;
    if (this.gaugeDamageFx.intensity < 0.03) this.gaugeDamageFx = null;
  }

  private getPlayfieldStressMetrics(gauge: number): PlayfieldStressMetrics {
    const ratio = clampDanceGauge(gauge);
    const stress = getDanceGaugeStressLevel(ratio);
    if (stress === 0) {
      return { stress: 0, severity: 0, pulse: 1 };
    }
    const threshold = stress >= 2 ? DANCE_GAUGE_DANGER_THRESHOLD : DANCE_GAUGE_WARNING_THRESHOLD;
    const severity = Math.min(1, 1 - ratio / threshold) * (stress >= 2 ? 1 : 0.55);
    const pulse = 0.55 + 0.45 * Math.sin(this.time * (stress >= 2 ? 11 : 8));
    return { stress, severity, pulse };
  }

  render(
    notes: ActiveNote[],
    currentTime: number,
    chart: ChartData,
    stats: GameStats,
    particles: ParticleSystem,
    audioReactive: AudioReactive,
    danceGauge: number,
  ) {
    const ctx = this.ctx;
    ctx.save();

    if (this.screen.shake > 0.5 && !this.reducedFlash && isPlayStageDecorFxEnabled()) {
      const sx = (Math.random() - 0.5) * this.screen.shake;
      const sy = (Math.random() - 0.5) * this.screen.shake;
      ctx.translate(sx, sy);
    }

    const decorFx = isPlayStageDecorFxEnabled();
    const laneBounds = this.laneBounds();
    this.lastDanceGauge = danceGauge;
    const playfieldStress = this.getPlayfieldStressMetrics(danceGauge);
    const songPhase = getSongPhase(currentTime, this.songDuration);
    if (decorFx) {
      if (songPhase !== this.lastBackgroundPhase) {
        this.phaseTransition = 1;
        this.lastBackgroundPhase = songPhase;
      }
      this.phaseTransition = Math.max(0, this.phaseTransition - this.lastDt * 1.1);
    }

    const pulseScale = this.reducedFlash ? 0.2 : 1;
    const pulse =
      (this.screen.perfectPulse + (stats.combo > 0 ? Math.min(0.4, stats.combo * 0.004) : 0)) *
      pulseScale;

    if (decorFx) {
      const preSync = SideStageFX.buildSync(
        currentTime,
        chart,
        stats,
        pulse,
        audioReactive,
        this.sideFX.getHitBoost(),
        this.sideFX.getPerfectBoost(),
        this.sideFX.getHue(),
      );
      this.sideFX.update(this.lastDt, preSync, this.width, this.height, laneBounds);
    }

    if (decorFx) {
      this.drawBackground(!this.reducedFlash, songPhase);
      if (this.playfieldActive && playfieldStress.stress >= 1) {
        this.drawPlayfieldStressSkyTint(playfieldStress);
      }
    } else {
      this.drawBackground(false, songPhase);
    }

    if (decorFx) {
      const sync = SideStageFX.buildSync(
        currentTime,
        chart,
        stats,
        pulse,
        audioReactive,
        this.sideFX.getHitBoost(),
        this.sideFX.getPerfectBoost(),
        this.sideFX.getHue(),
      );
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = this.reducedFlash ? 0.2 : 0.84;
      this.sideFX.draw(ctx, this.width, this.height, laneBounds, sync, songPhase);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    if (this.playfieldActive && decorFx && playfieldStress.stress >= 1) {
      this.drawDanceGaugeStressVignette(danceGauge, playfieldStress);
    }

    this.drawLanes();
    if (this.playfieldActive && decorFx && playfieldStress.stress >= 1) {
      this.drawPlayfieldStressOverlay(playfieldStress);
    }
    if (this.playfieldActive && decorFx) {
      this.drawDanceGauge(this.displayedDanceGauge);
    }
    if (decorFx) {
      particles.draw(ctx);
    }
    this.drawNotes(notes, currentTime);
    this.drawHitLine();
    if (this.playfieldActive && decorFx && playfieldStress.stress >= 1) {
      this.drawPlayfieldStressHitBand(playfieldStress);
    }
    this.drawLaneKeyHints();
    this.drawHoldLaneFeedback(notes, currentTime);
    this.drawHUD(stats, chart, currentTime);
    this.drawComboDisplay(stats);
    this.drawComboBreakFx();
    this.drawMissFlashOverlay();
    this.drawAccuracyMilestoneBanner();
    if (this.playfieldActive && decorFx && playfieldStress.stress >= 2 && !this.gameOverFx) {
      this.drawDangerBanner(playfieldStress);
    }
    this.drawJudgmentText();
    if (this.gameOverFx) {
      this.drawGameOverOverlay();
    }

    ctx.restore();
  }

  private renderCleared(): void {
    const ctx = this.ctx;
    ctx.save();
    this.drawBackground(false);
    ctx.restore();
  }

  private drawBackground(animated = true, phase: SongPhase = 'early') {
    const ctx = this.ctx;
    const theme = PHASE_BACKGROUND_THEMES[phase];
    const grad = ctx.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, theme.top);
    grad.addColorStop(0.38, theme.mid);
    grad.addColorStop(1, theme.bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    const nebula = ctx.createRadialGradient(
      this.width * 0.62,
      this.height * 0.42,
      0,
      this.width * 0.62,
      this.height * 0.42,
      this.width * 0.72,
    );
    nebula.addColorStop(0, theme.nebulaCenter);
    nebula.addColorStop(0.45, theme.nebulaMid);
    nebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, this.width, this.height);

    const laneNebula = ctx.createRadialGradient(
      this.getPlayfieldCenterX(),
      this.height * 0.55,
      0,
      this.getPlayfieldCenterX(),
      this.height * 0.55,
      this.width * 0.38,
    );
    laneNebula.addColorStop(0, theme.nebulaMid);
    laneNebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = laneNebula;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalAlpha = 1;

    const [sr, sg, sb] = theme.starRgb;
    for (const star of this.bgStars) {
      const x = star.x * this.width;
      const y = animated
        ? (star.y * this.height + this.time * 20 * star.z) % this.height
        : star.y * this.height;
      const twinkle = animated ? 0.78 + 0.22 * Math.sin(this.time * 1.1 + star.x * 10) : 0.65;
      const size = star.z * 2;
      ctx.globalAlpha = star.brightness * twinkle;
      ctx.fillStyle = `rgb(${sr}, ${sg}, ${sb})`;
      ctx.fillRect(x, y, size, size);
    }
    ctx.globalAlpha = 1;

    if (this.phaseTransition > 0.02 && !this.reducedFlash) {
      const [fr, fg, fb] = theme.flashRgb;
      const flash =
        this.phaseTransition * (phase === 'late' ? 0.42 : phase === 'mid' ? 0.36 : 0.32);
      const flashGrad = ctx.createRadialGradient(
        this.width * 0.5,
        this.height * 0.45,
        0,
        this.width * 0.5,
        this.height * 0.45,
        this.width * 0.65,
      );
      flashGrad.addColorStop(0, `rgba(${fr}, ${fg}, ${fb}, ${flash})`);
      flashGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = flashGrad;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  private drawLanes() {
    const ctx = this.ctx;
    const laneBottom = this.laneBottomY;
    const { stress, severity, pulse } = this.getPlayfieldStressMetrics(this.lastDanceGauge);
    const danger = stress >= 2;
    const warning = stress === 1;
    const stressMix = this.reducedFlash ? severity * 0.35 : severity;

    for (let i = 0; i < 4; i++) {
      const glow = this.laneGlows[i];
      const left = this.laneLeft(i as LaneIndex);
      const laneStressPulse =
        stress >= 1 ? 0.65 + 0.35 * Math.sin(this.time * (danger ? 12 : 8) + i * 1.4) : 1;

      if (glow.intensity > 0.05) {
        ctx.fillStyle = `${glow.color}${Math.floor(glow.intensity * 45)
          .toString(16)
          .padStart(2, '0')}`;
        ctx.fillRect(left, this.hitLineY - 90, this.laneWidth, 90);
      }

      if (i > 0) {
        ctx.strokeStyle =
          stress >= 1
            ? danger
              ? `rgba(255, 72, 88, ${0.22 + stressMix * 0.28 * laneStressPulse})`
              : `rgba(255, 140, 72, ${0.18 + stressMix * 0.22 * laneStressPulse})`
            : `${LANE_COLORS[i - 1]}55`;
        ctx.lineWidth = stress >= 1 ? 1.2 + stressMix * 0.5 : 1;
        ctx.beginPath();
        ctx.moveTo(left, this.laneTopY);
        ctx.lineTo(left, laneBottom);
        ctx.stroke();
      }
    }

    const borderPulse = stress >= 1 ? (danger ? 0.55 : 0.42) + (danger ? 0.45 : 0.35) * pulse : 1;
    ctx.strokeStyle = danger
      ? `rgba(255, 64, 80, ${0.28 + stressMix * 0.32 * borderPulse})`
      : warning
        ? `rgba(255, 128, 64, ${0.24 + stressMix * 0.28 * borderPulse})`
        : 'rgba(255,255,255,0.28)';
    ctx.lineWidth = danger ? 2 + stressMix * 0.8 : warning ? 1.8 : 1.6;
    if (stress >= 1 && !this.reducedFlash) {
      ctx.shadowColor = danger ? '#ff3355' : '#ff8833';
      ctx.shadowBlur = 6 + stressMix * (danger ? 12 : 8) * borderPulse;
    }
    ctx.strokeRect(this.laneStartX, this.laneTopY, this.laneWidth * 4, laneBottom - this.laneTopY);
    ctx.shadowBlur = 0;

    const laneEnd = this.laneStartX + this.laneWidth * 4;
    for (const edgeX of [this.laneStartX, laneEnd]) {
      const outward = edgeX === this.laneStartX ? -48 : 48;
      const stageGrad = ctx.createLinearGradient(edgeX, 0, edgeX + outward, 0);
      if (stress >= 1) {
        const edgeRgb = danger ? '255, 48, 64' : '255, 112, 48';
        stageGrad.addColorStop(0, `rgba(${edgeRgb}, ${0.14 + stressMix * 0.2 * borderPulse})`);
        stageGrad.addColorStop(1, 'rgba(255, 112, 48, 0)');
      } else {
        stageGrad.addColorStop(0, 'rgba(0, 229, 255, 0.16)');
        stageGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
      }
      ctx.strokeStyle = stageGrad;
      ctx.lineWidth = danger ? 2.5 : 1.8;
      ctx.beginPath();
      ctx.moveTo(edgeX, this.laneTopY);
      ctx.lineTo(edgeX, laneBottom);
      ctx.stroke();
    }

    this.drawLaneCenterGuides(this.laneTopY + this.gaugeBandH, this.hitLineY);
  }

  private drawLaneCenterGuides(topY: number, bottomY: number) {
    const ctx = this.ctx;
    if (bottomY <= topY) return;
    const { stress, severity } = this.getPlayfieldStressMetrics(this.lastDanceGauge);
    const stressMix = this.reducedFlash ? severity * 0.35 : severity;

    ctx.save();
    ctx.setLineDash([5, 7]);
    for (let i = 0; i < 4; i++) {
      const cx = this.getLaneCenterX(i as LaneIndex);
      const color = LANE_COLORS[i];
      const lanePulse =
        stress >= 1 ? 0.55 + 0.45 * Math.sin(this.time * (stress >= 2 ? 10 : 7) + i * 1.1) : 1;
      if (stress >= 1) {
        const rgb = stress >= 2 ? '255, 72, 88' : '255, 140, 80';
        ctx.strokeStyle = `rgba(${rgb}, ${(0.28 + stressMix * 0.42) * lanePulse})`;
        ctx.lineWidth = stress >= 2 ? 1.4 + stressMix * 0.6 : 1.2;
      } else {
        ctx.strokeStyle = `${color}44`;
        ctx.lineWidth = 0.9;
      }
      ctx.beginPath();
      ctx.moveTo(cx, topY);
      ctx.lineTo(cx, bottomY);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  private maxChainGapSec(currentTime: number): number {
    return (this.noteHeight / this.getNoteSpeed(currentTime)) * 1.4;
  }

  private drawNoteChain(
    left: number,
    w: number,
    yTop: number,
    yBottom: number,
    color: string,
    alpha: number,
  ) {
    if (yBottom <= yTop) return;
    const ctx = this.ctx;

    const grad = ctx.createLinearGradient(left, 0, left + w, 0);
    grad.addColorStop(0, this.blendHex(color, alpha * 0.88));
    grad.addColorStop(0.5, this.blendHex(color, alpha * 1.08));
    grad.addColorStop(1, this.blendHex(color, alpha * 0.88));
    ctx.fillStyle = grad;
    ctx.fillRect(left, yTop, w, yBottom - yTop);

    ctx.fillStyle = `rgba(255,255,255,${0.06 + alpha * 0.08})`;
    ctx.fillRect(left, yTop, w, Math.max(2, (yBottom - yTop) * 0.12));
  }

  private getHoldReleaseUrgency(note: ActiveNote, currentTime: number): number {
    if (!note.endTime || note.released) return 0;
    const timeToEnd = note.endTime - currentTime;
    if (timeToEnd > 1.0 || timeToEnd < -0.15) return 0;
    const raw = 1 - Math.max(0, timeToEnd) / 1.0;
    if (note.holding) return raw;
    if (!note.hit && timeToEnd < 0.55) return raw * 0.35;
    return 0;
  }

  private drawHoldBody(
    left: number,
    w: number,
    yTop: number,
    yBottom: number,
    color: string,
    holding: boolean,
    progress: number,
  ) {
    if (yBottom <= yTop) return;
    const ctx = this.ctx;
    const height = yBottom - yTop;

    this.drawNoteChain(left, w, yTop, yBottom, color, holding ? 0.94 : 0.68);
    if (!holding) return;

    ctx.save();
    const pulse = 0.62 + 0.38 * Math.sin(this.time * 10.5);
    const inset = w * 0.2;
    const innerW = w - inset * 2;

    ctx.shadowColor = color;
    ctx.shadowBlur = 14 + pulse * 10;
    const coreGrad = ctx.createLinearGradient(left, yTop, left + w, yTop);
    coreGrad.addColorStop(0, this.blendHex(color, 0.25 * pulse));
    coreGrad.addColorStop(0.5, this.blendHex(color, 0.75 * pulse));
    coreGrad.addColorStop(1, this.blendHex(color, 0.25 * pulse));
    ctx.fillStyle = coreGrad;
    ctx.fillRect(left + inset, yTop, innerW, height);

    const filledTop = yBottom - height * Math.min(1, Math.max(0, progress));
    const fillGrad = ctx.createLinearGradient(0, filledTop, 0, yBottom);
    fillGrad.addColorStop(0, 'rgba(255,255,255,0)');
    fillGrad.addColorStop(0.35, `rgba(255,255,255,${0.1 * pulse})`);
    fillGrad.addColorStop(1, `rgba(255,255,255,${0.28 * pulse})`);
    ctx.fillStyle = fillGrad;
    ctx.fillRect(left + inset, filledTop, innerW, yBottom - filledTop);

    const bandH = Math.max(10, height * 0.14);
    const travel = yTop + ((this.time * 150) % (height + bandH)) - bandH;
    ctx.fillStyle = `rgba(255,255,255,${0.2 * pulse})`;
    ctx.fillRect(left + inset, travel, innerW, bandH);

    ctx.strokeStyle = `rgba(255,255,255,${0.22 + pulse * 0.2})`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(left + inset + 1, yTop + 1, innerW - 2, height - 2);
    ctx.restore();
  }

  private drawTapChains(
    notes: ActiveNote[],
    currentTime: number,
    visibleTop: number,
    visibleBottom: number,
    h: number,
  ) {
    for (let lane = 0; lane < 4; lane++) {
      const left = this.laneLeft(lane as LaneIndex);
      const w = this.laneWidth;
      const color = LANE_COLORS[lane];

      const taps = notes
        .filter((n) => n.lane === lane && n.type === 'tap' && !n.hit && !n.missed)
        .filter((n) => this.shouldDrawNote(n, currentTime))
        .map((n) => ({ note: n, y: this.noteY(currentTime, n.time) }))
        .filter((t) => t.y >= visibleTop && t.y <= visibleBottom)
        .sort((a, b) => a.note.time - b.note.time);

      const maxGap = this.maxChainGapSec(currentTime);
      for (let i = 0; i < taps.length - 1; i++) {
        const dt = taps[i + 1].note.time - taps[i].note.time;
        if (dt > maxGap) continue;

        const gapTop = taps[i].y + h / 2;
        const gapBottom = taps[i + 1].y - h / 2;

        if (gapBottom > gapTop) {
          this.drawNoteChain(left, w, gapTop, gapBottom, color, 0.82);
        } else {
          const top = Math.min(taps[i].y, taps[i + 1].y) - h / 2;
          const bottom = Math.max(taps[i].y, taps[i + 1].y) + h / 2;
          this.drawNoteChain(left, w, top, bottom, color, 0.82);
        }
      }
    }
  }

  private drawHoldBodies(
    notes: ActiveNote[],
    currentTime: number,
    visibleTop: number,
    visibleBottom: number,
    laneBottom: number,
    h: number,
  ) {
    for (const note of notes) {
      if (note.missed && !note.holding) continue;
      if (note.type !== 'hold' || !note.endTime) continue;
      if (!this.shouldDrawNote(note, currentTime)) continue;

      const startY = this.noteY(currentTime, note.time);
      const endY = this.noteY(currentTime, note.endTime);
      if (Math.max(startY, endY) < visibleTop || Math.min(startY, endY) > visibleBottom) continue;

      const color = LANE_COLORS[note.lane];
      const left = this.laneLeft(note.lane);
      const w = this.laneWidth;
      const tailCy = note.holding ? this.hitLineY : endY;
      const headBottom = startY + h / 2;
      const tailTop = tailCy - h / 2;
      const bodyTop = Math.min(headBottom, tailTop);
      const bodyBottom = Math.min(laneBottom, Math.max(headBottom, tailTop));
      const progress =
        note.holding && note.endTime
          ? Math.min(1, Math.max(0, (currentTime - note.time) / (note.endTime - note.time)))
          : 0;

      if (bodyBottom > bodyTop) {
        this.drawHoldBody(left, w, bodyTop, bodyBottom, color, note.holding, progress);
      }
    }
  }

  private getChainedTapIds(
    notes: ActiveNote[],
    currentTime: number,
    visibleTop: number,
    visibleBottom: number,
  ): Set<number> {
    const chained = new Set<number>();
    const maxGap = this.maxChainGapSec(currentTime);

    for (let lane = 0; lane < 4; lane++) {
      const taps = notes
        .filter((n) => n.lane === lane && n.type === 'tap' && !n.hit && !n.missed)
        .filter((n) => this.shouldDrawNote(n, currentTime))
        .map((n) => ({ note: n, y: this.noteY(currentTime, n.time) }))
        .filter((t) => t.y >= visibleTop && t.y <= visibleBottom)
        .sort((a, b) => a.note.time - b.note.time);

      for (let i = 0; i < taps.length - 1; i++) {
        if (taps[i + 1].note.time - taps[i].note.time <= maxGap) {
          chained.add(taps[i].note.id);
          chained.add(taps[i + 1].note.id);
        }
      }
    }

    return chained;
  }

  private getChordNoteIds(notes: ActiveNote[]): Set<number> {
    const byTime = new Map<number, ActiveNote[]>();

    for (const note of notes) {
      if (note.type !== 'tap' || note.hit || note.missed) continue;
      const key = Math.round(note.time * 1000);
      const group = byTime.get(key) ?? [];
      group.push(note);
      byTime.set(key, group);
    }

    const chordIds = new Set<number>();
    for (const group of byTime.values()) {
      if (group.length < 2) continue;
      if (new Set(group.map((n) => n.lane)).size < 2) continue;
      for (const note of group) chordIds.add(note.id);
    }
    return chordIds;
  }

  private drawChordBridges(
    notes: ActiveNote[],
    currentTime: number,
    visibleTop: number,
    visibleBottom: number,
  ) {
    const byTime = new Map<number, ActiveNote[]>();
    for (const note of notes) {
      if (note.type !== 'tap' || note.hit || note.missed) continue;
      const key = Math.round(note.time * 1000);
      const group = byTime.get(key) ?? [];
      group.push(note);
      byTime.set(key, group);
    }

    const ctx = this.ctx;
    ctx.save();
    for (const group of byTime.values()) {
      if (group.length < 2) continue;
      const lanes = [...new Set(group.map((n) => n.lane))].sort((a, b) => a - b);
      if (lanes.length < 2) continue;

      const y = this.noteY(currentTime, group[0].time);
      if (y < visibleTop || y > visibleBottom) continue;

      const leftX = this.getLaneCenterX(lanes[0] as LaneIndex);
      const rightX = this.getLaneCenterX(lanes[lanes.length - 1] as LaneIndex);
      const pulse = 0.65 + 0.35 * Math.sin(this.time * 8);

      ctx.strokeStyle = `rgba(0, 255, 255, ${0.35 * pulse})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(leftX, y);
      ctx.lineTo(rightX, y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  private drawNotePanels(
    notes: ActiveNote[],
    currentTime: number,
    visibleTop: number,
    visibleBottom: number,
    laneBottom: number,
    h: number,
  ) {
    const chordIds = this.getChordNoteIds(notes);
    const chainedIds = this.getChainedTapIds(notes, currentTime, visibleTop, visibleBottom);

    for (const note of notes) {
      if (note.missed && !note.holding) continue;
      if (!this.shouldDrawNote(note, currentTime)) continue;

      const color = LANE_COLORS[note.lane];
      const left = this.laneLeft(note.lane);
      const w = this.laneWidth;

      if (note.type === 'tap') {
        if (note.hit) continue;
        const y = this.noteY(currentTime, note.time);
        if (y < visibleTop || y > visibleBottom) continue;
        const marker: PanelMarker = chordIds.has(note.id)
          ? 'chord'
          : chainedIds.has(note.id)
            ? 'chain'
            : 'tap';
        this.drawTapNote(left, y, w, h, color, note.time - currentTime, marker, currentTime);
      } else if (note.type === 'hold' && note.endTime) {
        const startY = this.noteY(currentTime, note.time);
        const endY = this.noteY(currentTime, note.endTime);
        if (Math.max(startY, endY) < visibleTop || Math.min(startY, endY) > visibleBottom) continue;

        const tailCy = note.holding ? this.hitLineY : endY;

        if (!note.hit) {
          this.drawTapNote(
            left,
            startY,
            w,
            h,
            color,
            note.time - currentTime,
            'hold-press',
            currentTime,
          );
        }
        if (!note.released) {
          const clampedTailCy = Math.min(laneBottom - h / 2, tailCy);
          const tailTime = note.holding ? 0 : note.endTime - currentTime;
          const releaseUrgency = this.getHoldReleaseUrgency(note, currentTime);
          this.drawTapNote(
            left,
            clampedTailCy,
            w,
            h,
            color,
            tailTime,
            'hold-release',
            currentTime,
            releaseUrgency,
          );
        }
      }
    }
  }

  private drawNotes(notes: ActiveNote[], currentTime: number) {
    const laneBottom = this.laneBottomY;
    const visibleTop = this.laneTopY - this.noteHeight;
    const visibleBottom = laneBottom + this.noteHeight;
    const h = this.noteHeight;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(
      this.laneStartX,
      this.laneTopY + this.gaugeBandH,
      this.laneWidth * 4,
      laneBottom - this.laneTopY - this.gaugeBandH,
    );
    this.ctx.clip();

    this.drawTapChains(notes, currentTime, visibleTop, visibleBottom, h);
    this.drawChordBridges(notes, currentTime, visibleTop, visibleBottom);
    this.drawHoldBodies(notes, currentTime, visibleTop, visibleBottom, laneBottom, h);
    this.drawNotePanels(notes, currentTime, visibleTop, visibleBottom, laneBottom, h);
    this.ctx.restore();
  }

  private drawTapNote(
    left: number,
    cy: number,
    w: number,
    h: number,
    color: string,
    timeToHit: number,
    marker: PanelMarker = 'tap',
    currentTime = 0,
    releaseUrgency = 0,
  ) {
    const ctx = this.ctx;
    const approach = Math.max(0, Math.min(1, 1 - timeToHit / this.getApproachTime(currentTime)));
    const top = cy - h / 2;
    const urgencyScale = marker === 'hold-release' ? 1 + releaseUrgency * 0.12 : 1;

    if (urgencyScale !== 1) {
      ctx.save();
      ctx.translate(left + w / 2, cy);
      ctx.scale(urgencyScale, urgencyScale);
      ctx.translate(-(left + w / 2), -cy);
    }

    const fillGrad = ctx.createLinearGradient(left, 0, left + w, 0);
    fillGrad.addColorStop(0, this.blendHex(color, 0.95));
    fillGrad.addColorStop(0.5, this.blendHex(color, 1.15));
    fillGrad.addColorStop(1, this.blendHex(color, 0.95));

    ctx.fillStyle = fillGrad;
    ctx.fillRect(left, top, w, h);

    const highlight =
      marker === 'hold-release' && releaseUrgency > 0.4
        ? 0.25 + releaseUrgency * 0.35
        : 0.15 + approach * 0.2;
    ctx.fillStyle = `rgba(255,255,255,${highlight})`;
    ctx.fillRect(left, top, w, Math.max(2, h * 0.28));

    if (marker === 'hold-release' && releaseUrgency > 0.25) {
      ctx.save();
      ctx.strokeStyle = `rgba(255, 220, 80, ${0.35 + releaseUrgency * 0.55})`;
      ctx.lineWidth = 2 + releaseUrgency * 2;
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 6 + releaseUrgency * 18;
      const pad = 3 + releaseUrgency * 4;
      ctx.strokeRect(left - pad, top - pad, w + pad * 2, h + pad * 2);
      ctx.restore();
    }

    if (marker !== 'tap') {
      this.drawPanelMarker(left, top, w, h, marker, releaseUrgency);
    }

    if (urgencyScale !== 1) ctx.restore();
  }

  private drawPanelMarker(
    left: number,
    top: number,
    w: number,
    h: number,
    marker: PanelMarker,
    releaseUrgency = 0,
  ) {
    const ctx = this.ctx;
    const cx = left + w / 2;
    const cy = top + h / 2;
    const fontSize = Math.max(7, Math.min(12, h * 0.24));
    const lineW = Math.max(1, w * 0.055);

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';

    if (marker === 'hold-press') {
      const barW = w * 0.42;
      const gap = h * 0.11;
      for (let i = -1; i <= 1; i++) {
        const y = cy + i * gap - h * 0.04;
        ctx.beginPath();
        ctx.moveTo(cx - barW / 2, y);
        ctx.lineTo(cx + barW / 2, y);
        ctx.stroke();
      }
      ctx.font = `700 ${fontSize}px Orbitron, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t('game.hold'), cx, top + h * 0.78);
    } else if (marker === 'hold-release') {
      const bounce = releaseUrgency > 0.45 ? Math.sin(this.time * 16) * releaseUrgency * 3 : 0;
      const arrow = h * (0.16 + releaseUrgency * 0.05);
      const arrowY = cy + bounce;
      ctx.fillStyle =
        releaseUrgency > 0.55
          ? `rgba(255, 235, 120, ${0.85 + releaseUrgency * 0.15})`
          : 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.moveTo(cx, arrowY - arrow * 0.35);
      ctx.lineTo(cx - arrow * 0.7, arrowY + arrow * 0.45);
      ctx.lineTo(cx + arrow * 0.7, arrowY + arrow * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.font = `700 ${fontSize + (releaseUrgency > 0.55 ? 1 : 0)}px Orbitron, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = releaseUrgency > 0.7 ? t('game.release') : t('game.end');
      ctx.fillText(label, cx, top + h * 0.8);
      if (releaseUrgency > 0.45) {
        ctx.font = `700 ${Math.max(8, fontSize - 1)}px "Noto Sans JP", sans-serif`;
        ctx.fillStyle = `rgba(255, 220, 80, ${0.7 + releaseUrgency * 0.3})`;
        ctx.fillText(t('game.releaseJa'), cx, top + h * 0.58);
      }
    } else if (marker === 'chain') {
      const r = Math.max(2.5, h * 0.09);
      const span = w * 0.22;
      ctx.beginPath();
      ctx.arc(cx - span, cy - h * 0.02, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + span, cy - h * 0.02, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - span + r, cy - h * 0.02);
      ctx.lineTo(cx + span - r, cy - h * 0.02);
      ctx.stroke();
      ctx.font = `700 ${Math.max(7, fontSize - 1)}px Orbitron, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t('game.chain'), cx, top + h * 0.78);
    } else if (marker === 'chord') {
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.75)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 10;
      ctx.strokeRect(left + 2, top + 2, w - 4, h - 4);
      ctx.shadowBlur = 0;
      ctx.font = `700 ${Math.max(7, fontSize - 1)}px Orbitron, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e8ffff';
      ctx.fillText(t('game.chord'), cx, top + h * 0.78);
    }

    ctx.restore();
  }

  private drawHitLine() {
    const ctx = this.ctx;
    const left = this.laneStartX;
    const right = this.laneStartX + this.laneWidth * 4;
    const { stress, severity, pulse } = this.getPlayfieldStressMetrics(this.lastDanceGauge);
    const danger = stress >= 2;
    const warning = stress === 1;
    const stressMix = this.reducedFlash ? severity * 0.35 : severity;
    const basePulse = 0.7 + 0.3 * Math.sin(this.time * 4) + this.screen.perfectPulse * 0.3;
    const stressPulse =
      stress >= 1 ? basePulse * (0.72 + 0.28 * pulse) * (1 + stressMix * 0.35) : basePulse;

    const lineR = danger ? 255 : warning ? 255 : 0;
    const lineG = danger
      ? Math.round(48 + stressMix * 40)
      : warning
        ? Math.round(96 + stressMix * 48)
        : 255;
    const lineB = danger
      ? Math.round(64 + stressMix * 24)
      : warning
        ? Math.round(48 + stressMix * 16)
        : 255;
    const glowColor = danger ? '#ff3355' : warning ? '#ff8833' : '#00ffff';

    ctx.shadowColor = glowColor;
    ctx.shadowBlur = (danger ? 32 : warning ? 24 : 25) * stressPulse;
    ctx.strokeStyle = `rgba(${lineR}, ${lineG}, ${lineB}, ${(danger ? 0.82 : warning ? 0.74 : 0.7) * stressPulse})`;
    ctx.lineWidth = danger ? 5 + stressMix * 1.5 : warning ? 4.5 : 4;
    ctx.beginPath();
    ctx.moveTo(left, this.hitLineY);
    ctx.lineTo(right, this.hitLineY);
    ctx.stroke();

    const bandH = danger ? 56 : warning ? 48 : 40;
    const lineGrad = ctx.createLinearGradient(
      left,
      this.hitLineY - bandH,
      left,
      this.hitLineY + bandH,
    );
    lineGrad.addColorStop(0, 'rgba(0,0,0,0)');
    lineGrad.addColorStop(
      0.5,
      danger
        ? `rgba(255, 48, 64, ${(0.16 + stressMix * 0.22) * stressPulse})`
        : warning
          ? `rgba(255, 112, 48, ${(0.12 + stressMix * 0.16) * stressPulse})`
          : `rgba(0,255,255,${0.12 * stressPulse})`,
    );
    lineGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lineGrad;
    ctx.fillRect(left, this.hitLineY - bandH, right - left, bandH * 2);
    ctx.shadowBlur = 0;
  }

  private drawHoldLaneFeedback(notes: ActiveNote[], currentTime: number) {
    const ctx = this.ctx;

    for (const note of notes) {
      if (note.type !== 'hold' || !note.holding || note.released || !note.endTime) continue;

      const timeToEnd = note.endTime - currentTime;
      if (timeToEnd < -0.2) continue;

      const urgency = this.getHoldReleaseUrgency(note, currentTime);
      const pulse = 0.68 + 0.32 * Math.sin(this.time * (7 + urgency * 9));
      const left = this.laneLeft(note.lane);
      const w = this.laneWidth;
      const color = LANE_COLORS[note.lane];
      const cx = left + w / 2;

      ctx.save();

      ctx.shadowColor = color;
      ctx.shadowBlur = 10 + urgency * 22;
      ctx.strokeStyle = `rgba(255,255,255,${(0.2 + urgency * 0.5) * pulse})`;
      ctx.lineWidth = 2 + urgency * 2.5;
      ctx.strokeRect(left + 5, this.hitLineY - 20, w - 10, 40);

      const beamGrad = ctx.createLinearGradient(0, this.hitLineY - 50, 0, this.hitLineY + 8);
      beamGrad.addColorStop(0, 'rgba(255,255,255,0)');
      beamGrad.addColorStop(1, `rgba(255,255,255,${(0.06 + urgency * 0.14) * pulse})`);
      ctx.fillStyle = beamGrad;
      ctx.fillRect(left + 8, this.hitLineY - 50, w - 16, 58);

      if (urgency < 0.5) {
        ctx.font = '700 11px "Noto Sans JP", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(255,255,255,${0.62 * pulse})`;
        ctx.fillText(t('game.keepHold'), cx, this.hitLineY - 30);
      } else {
        ctx.font = '700 13px "Noto Sans JP", Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(255, 220, 80, ${(0.78 + urgency * 0.22) * pulse})`;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 12 + urgency * 10;
        const bounce = Math.sin(this.time * 18) * urgency * 4;
        ctx.fillText(t('game.releaseUp'), cx, this.hitLineY - 32 + bounce);
      }

      ctx.restore();
    }
  }

  private drawLaneKeyHints() {
    const ctx = this.ctx;
    const stripH = this.laneBottomY - this.hitLineY;
    const y = this.hitLineY + stripH * 0.52;

    for (let i = 0; i < 4; i++) {
      const cx = this.getLaneCenterX(i as LaneIndex);
      const color = LANE_COLORS[i];

      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.roundRect(cx - 26, y - 26, 52, 58, 8);
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 18px Orbitron, sans-serif';
      ctx.fillStyle = color;
      ctx.fillText(LANE_LABELS[i], cx, y - 8);

      ctx.font = 'bold 16px Orbitron, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillText(LANE_ARROW_LABELS[i], cx, y + 14);
    }
  }

  private drawDanceGauge(gauge: number) {
    const ctx = this.ctx;
    const ratio = Math.max(0, Math.min(1, gauge));
    const stress = getDanceGaugeStressLevel(ratio);
    const danger = stress >= 2;
    const warning = stress === 1;
    const full = isDanceGaugeFull(ratio);
    const laneW = this.laneWidth * 4;
    const margin = 3;
    const headerX = this.laneStartX;
    const headerY = this.laneTopY;
    const headerW = laneW;
    const headerH = this.gaugeBandH;
    const barH = 20;
    const barY = headerY + (headerH - barH) * 0.5;
    const labelW = 58;
    const labelH = 22;
    const labelX = headerX + margin;
    const labelY = headerY + (headerH - labelH) * 0.5;
    const segGap = 2;
    const segCount = DANCE_GAUGE_SEGMENT_COUNT;
    const segAreaX = labelX + labelW + 5;
    const segAreaW = headerW - margin * 2 - labelW - 5;
    const segW = (segAreaW - segGap * (segCount - 1)) / segCount;
    const shake =
      danger && !this.reducedFlash
        ? Math.sin(this.time * 22) * (2 + (1 - ratio / DANCE_GAUGE_DANGER_THRESHOLD) * 3)
        : warning && !this.reducedFlash
          ? Math.sin(this.time * 14) * 0.8
          : 0;
    const stressPulse = danger
      ? 0.55 + 0.45 * Math.sin(this.time * 11)
      : warning
        ? 0.72 + 0.28 * Math.sin(this.time * 7)
        : 1;
    const pulse =
      ratio > 0
        ? (0.86 + 0.14 * Math.sin(this.time * (full ? 8 : 4 + ratio * 4))) * stressPulse
        : 0.5;

    ctx.save();
    ctx.translate(shake, 0);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
    ctx.fillRect(headerX, headerY, headerW, headerH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(headerX + 0.5, headerY + 0.5, headerW - 1, headerH - 1);

    const labelGrad = ctx.createLinearGradient(labelX, labelY, labelX + labelW, labelY + labelH);
    labelGrad.addColorStop(0, danger ? '#ff4a7a' : '#e91e8c');
    labelGrad.addColorStop(0.55, danger ? '#c42a5c' : '#c026d3');
    labelGrad.addColorStop(1, danger ? '#8b1a44' : '#7c3aed');
    ctx.beginPath();
    ctx.roundRect(labelX, labelY, labelW, labelH, 4);
    ctx.fillStyle = labelGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = 'bold 9px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 4;
    ctx.fillText(t('ui.danceGauge'), labelX + labelW * 0.5, labelY + labelH * 0.5 + 0.5);
    ctx.shadowBlur = 0;

    for (let i = 0; i < segCount; i++) {
      const sx = segAreaX + i * (segW + segGap);
      const fill = getDanceGaugeSegmentFill(ratio, i, segCount);
      const colorT = (i + 0.5) / segCount;
      const segColor = danger
        ? {
            fill: `rgb(${Math.round(200 + colorT * 30)}, ${Math.round(24 + colorT * 18)}, ${Math.round(40 + colorT * 20)})`,
            glow: '#ff5577',
            edge: '#ff99aa',
          }
        : warning
          ? {
              fill: `rgb(${Math.round(220 + colorT * 20)}, ${Math.round(80 + colorT * 40)}, ${Math.round(20 + colorT * 10)})`,
              glow: '#ff9944',
              edge: '#ffbb77',
            }
          : getDanceGaugeSegmentColor(i, segCount, this.time, full);
      const emptyPulse =
        fill < 0.004 && stress >= 1 && !this.reducedFlash
          ? 0.1 + 0.08 * Math.sin(this.time * 13 + i * 1.7)
          : 0;

      this.traceEnergyChevron(sx, barY, segW, barH);
      ctx.fillStyle =
        emptyPulse > 0 ? `rgba(255, 48, 64, ${emptyPulse})` : 'rgba(14, 10, 20, 0.94)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (fill <= 0.004) continue;

      ctx.save();
      this.traceEnergyChevron(sx, barY, segW, barH);
      ctx.clip();
      if (fill < 0.999) {
        ctx.beginPath();
        ctx.rect(sx, barY, segW * fill, barH);
        ctx.clip();
      }

      const grad = ctx.createLinearGradient(sx, barY, sx, barY + barH);
      grad.addColorStop(0, segColor.edge);
      grad.addColorStop(0.4, segColor.glow);
      grad.addColorStop(1, segColor.fill);
      ctx.globalAlpha = (0.82 + fill * 0.18) * pulse;
      this.traceEnergyChevron(sx, barY, segW, barH);
      ctx.fillStyle = grad;
      ctx.fill();

      if (!this.reducedFlash) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = (full ? 0.28 : 0.16) + 0.18 * Math.sin(this.time * (danger ? 14 : 9) + i);
        ctx.fillStyle = segColor.glow;
        this.traceEnergyChevron(sx, barY, segW, barH);
        ctx.fill();
        ctx.restore();
      }

      ctx.shadowColor = segColor.glow;
      ctx.shadowBlur = full ? 8 : stress >= 2 ? 6 : 4;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 + fill * 0.25})`;
      ctx.lineWidth = 1;
      this.traceEnergyChevron(sx, barY, segW, barH);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    if (this.gaugeDamageFx && this.gaugeDamageFx.intensity > 0.03) {
      const fx = this.gaugeDamageFx;
      const alpha = fx.intensity;
      ctx.save();
      ctx.globalAlpha = 0.38 * alpha;
      ctx.fillStyle = '#ff2040';
      ctx.fillRect(segAreaX, barY - 2, segAreaW, barH + 4);
      ctx.globalAlpha = 1;

      const pctText = `${Math.round(fx.delta * 100)}%`;
      const textY = barY - 6 - fx.offsetY;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = 'bold 16px Orbitron, sans-serif';
      ctx.strokeStyle = `rgba(0, 0, 0, ${0.92 * alpha})`;
      ctx.lineWidth = 4;
      ctx.strokeText(pctText, segAreaX + segAreaW * 0.5, textY);
      ctx.fillStyle = `rgba(255, 72, 96, ${alpha})`;
      ctx.fillText(pctText, segAreaX + segAreaW * 0.5, textY);
      ctx.restore();
    }

    ctx.restore();
  }

  private traceEnergyChevron(x: number, y: number, w: number, h: number, tip = 0.26): void {
    const slant = Math.max(3, w * tip);
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - slant, y);
    ctx.lineTo(x + w, y + h * 0.5);
    ctx.lineTo(x + w - slant, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  }

  private drawPlayfieldStressSkyTint(metrics: PlayfieldStressMetrics): void {
    const ctx = this.ctx;
    const { stress, severity, pulse } = metrics;
    const danger = stress >= 2;
    const mix = this.reducedFlash ? severity * 0.35 : severity;
    const cx = this.getPlayfieldCenterX();
    const playMidY = (this.laneTopY + this.laneBottomY) * 0.5;

    ctx.save();
    const skyGrad = ctx.createRadialGradient(
      cx,
      playMidY,
      this.width * 0.04,
      cx,
      playMidY,
      this.width * 0.55,
    );
    const rgb = danger ? '255, 32, 48' : '255, 96, 40';
    skyGrad.addColorStop(0, `rgba(${rgb}, ${(0.08 + mix * 0.14 * pulse) * (danger ? 1 : 0.75)})`);
    skyGrad.addColorStop(0.55, `rgba(${rgb}, ${(0.05 + mix * 0.1) * (danger ? 1 : 0.7)})`);
    skyGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  private drawPlayfieldStressOverlay(metrics: PlayfieldStressMetrics): void {
    const ctx = this.ctx;
    const { stress, severity, pulse } = metrics;
    const danger = stress >= 2;
    const mix = this.reducedFlash ? severity * 0.35 : severity;
    const left = this.laneStartX;
    const right = this.laneStartX + this.laneWidth * 4;
    const top = this.laneTopY + this.gaugeBandH;
    const bottom = this.laneBottomY;
    const w = right - left;
    const h = bottom - top;
    if (w <= 0 || h <= 0) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, w, h);
    ctx.clip();

    const fog = ctx.createLinearGradient(left, bottom, left, top);
    const fogRgb = danger ? '255, 24, 40' : '255, 88, 32';
    fog.addColorStop(0, `rgba(${fogRgb}, ${0.14 + mix * 0.28 * pulse})`);
    fog.addColorStop(0.45, `rgba(${fogRgb}, ${0.06 + mix * 0.12 * pulse})`);
    fog.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = fog;
    ctx.fillRect(left, top, w, h);

    if (!this.reducedFlash) {
      const scanY = top + ((this.time * (danger ? 95 : 70)) % (h + 48)) - 24;
      const scanGrad = ctx.createLinearGradient(left, scanY - 18, left, scanY + 18);
      const scanRgb = danger ? '255, 48, 64' : '255, 120, 48';
      scanGrad.addColorStop(0, 'rgba(0,0,0,0)');
      scanGrad.addColorStop(0.5, `rgba(${scanRgb}, ${0.1 + mix * 0.16 * pulse})`);
      scanGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = scanGrad;
      ctx.fillRect(left, scanY - 18, w, 36);

      const stripeW = 14;
      const offset = (this.time * (danger ? 42 : 28)) % (stripeW * 2);
      ctx.globalAlpha = 0.05 + mix * 0.07 * pulse;
      ctx.fillStyle = danger ? 'rgba(255, 40, 56, 0.9)' : 'rgba(255, 110, 40, 0.9)';
      for (let x = left - stripeW * 2 + offset; x < right + stripeW; x += stripeW * 2) {
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x + stripeW * 0.55, top);
        ctx.lineTo(x + stripeW * 0.55 - h * 0.12, bottom);
        ctx.lineTo(x - h * 0.12, bottom);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    const corner = Math.min(22, w * 0.05);
    const bracketLen = Math.min(34, h * 0.14);
    const rgb = danger ? '255, 56, 72' : '255, 132, 64';
    const bracketAlpha = (danger ? 0.55 : 0.42) + mix * 0.35 * pulse;
    ctx.strokeStyle = `rgba(${rgb}, ${bracketAlpha})`;
    ctx.lineWidth = danger ? 2.5 : 2;
    ctx.lineJoin = 'round';

    const corners: [number, number, number, number][] = [
      [left + corner, top + corner, 1, 1],
      [right - corner, top + corner, -1, 1],
      [left + corner, bottom - corner, 1, -1],
      [right - corner, bottom - corner, -1, -1],
    ];
    for (const [x, y, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x, y + sy * bracketLen);
      ctx.lineTo(x, y);
      ctx.lineTo(x + sx * bracketLen, y);
      ctx.stroke();
    }

    for (let i = 0; i < 4; i++) {
      const cx = this.getLaneCenterX(i as LaneIndex);
      const chevPulse = 0.5 + 0.5 * Math.sin(this.time * (danger ? 9 : 6) + i * 0.9);
      const chevY = top + h * (0.18 + chevPulse * 0.08);
      const size = 5 + mix * (danger ? 4 : 2.5);
      ctx.fillStyle = `rgba(${rgb}, ${(0.18 + mix * 0.28 * chevPulse) * (danger ? 1 : 0.8)})`;
      ctx.beginPath();
      ctx.moveTo(cx, chevY + size);
      ctx.lineTo(cx - size, chevY - size * 0.35);
      ctx.lineTo(cx + size, chevY - size * 0.35);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  private drawPlayfieldStressHitBand(metrics: PlayfieldStressMetrics): void {
    const ctx = this.ctx;
    const { stress, severity, pulse } = metrics;
    const danger = stress >= 2;
    const mix = this.reducedFlash ? severity * 0.35 : severity;
    const left = this.laneStartX;
    const right = this.laneStartX + this.laneWidth * 4;
    const y = this.hitLineY;
    const bandH = danger ? 72 : 58;

    ctx.save();
    ctx.beginPath();
    ctx.rect(
      left,
      this.laneTopY + this.gaugeBandH,
      right - left,
      this.laneBottomY - this.laneTopY - this.gaugeBandH,
    );
    ctx.clip();

    const bandGrad = ctx.createLinearGradient(left, y - bandH, left, y + bandH);
    const rgb = danger ? '255, 40, 56' : '255, 104, 48';
    bandGrad.addColorStop(0, 'rgba(0,0,0,0)');
    bandGrad.addColorStop(0.42, `rgba(${rgb}, ${(0.08 + mix * 0.12) * pulse})`);
    bandGrad.addColorStop(0.5, `rgba(${rgb}, ${(0.2 + mix * 0.28) * pulse})`);
    bandGrad.addColorStop(0.58, `rgba(${rgb}, ${(0.08 + mix * 0.12) * pulse})`);
    bandGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bandGrad;
    ctx.fillRect(left, y - bandH, right - left, bandH * 2);

    if (!this.reducedFlash) {
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 4; i++) {
        const cx = this.getLaneCenterX(i as LaneIndex);
        const lanePulse = 0.55 + 0.45 * Math.sin(this.time * (danger ? 13 : 9) + i * 1.3);
        const pillar = ctx.createRadialGradient(cx, y, 0, cx, y, this.laneWidth * 0.62);
        pillar.addColorStop(0, `rgba(${rgb}, ${(0.16 + mix * 0.22) * lanePulse})`);
        pillar.addColorStop(0.55, `rgba(${rgb}, ${(0.06 + mix * 0.1) * lanePulse})`);
        pillar.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = pillar;
        ctx.fillRect(cx - this.laneWidth * 0.62, y - bandH, this.laneWidth * 1.24, bandH * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();
  }

  private drawDanceGaugeStressVignette(gauge: number, metrics: PlayfieldStressMetrics) {
    const ctx = this.ctx;
    const { stress, pulse } = metrics;
    const ratio = clampDanceGauge(gauge);
    const threshold = stress >= 2 ? DANCE_GAUGE_DANGER_THRESHOLD : DANCE_GAUGE_WARNING_THRESHOLD;
    const vignetteSeverity = Math.min(1, 1 - ratio / threshold) * (stress >= 2 ? 1 : 0.55);
    const redScale = stress >= 2 ? 1 : 0.62;
    const flashScale = this.reducedFlash ? 0.45 : 1;

    ctx.save();

    const vignette = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.38,
      this.width * 0.06,
      this.width * 0.5,
      this.height * 0.42,
      this.width * 0.82,
    );
    vignette.addColorStop(
      0,
      `rgba(255, 24, 48, ${(0.05 + vignetteSeverity * 0.1 * pulse) * redScale * flashScale})`,
    );
    vignette.addColorStop(
      0.55,
      `rgba(180, 0, 32, ${(0.1 + vignetteSeverity * 0.18 * pulse) * redScale * flashScale})`,
    );
    vignette.addColorStop(
      1,
      `rgba(80, 0, 16, ${(0.18 + vignetteSeverity * 0.2) * redScale * flashScale})`,
    );
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.width, this.height);

    if (stress >= 2) {
      const topWash = ctx.createLinearGradient(0, 0, 0, this.height * 0.38);
      topWash.addColorStop(
        0,
        `rgba(255, 40, 60, ${(0.18 + vignetteSeverity * 0.22 * pulse) * flashScale})`,
      );
      topWash.addColorStop(1, 'rgba(255, 0, 0, 0)');
      ctx.fillStyle = topWash;
      ctx.fillRect(0, 0, this.width, this.height * 0.38);
    }

    ctx.restore();
  }

  private drawDangerBanner(metrics: PlayfieldStressMetrics): void {
    const ctx = this.ctx;
    const { severity, pulse } = metrics;
    const flashScale = this.reducedFlash ? 0.7 : 1;
    const cx = this.getPlayfieldCenterX();
    const playTop = this.laneTopY + this.gaugeBandH;
    const cy = playTop + (this.hitLineY - playTop) * 0.38;
    const label = t('ui.danceGaugeDanger');
    const alpha = (0.78 + severity * 0.22 * pulse) * flashScale;
    const fontSize = Math.round(Math.min(64, this.width * 0.13) * (0.92 + severity * 0.08));
    const scalePulse = this.reducedFlash ? 1 : 0.96 + 0.04 * pulse;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scalePulse, scalePulse);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${fontSize}px Orbitron, sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.92})`;
    ctx.strokeText(label, 0, 0);
    ctx.shadowColor = '#ff2244';
    ctx.shadowBlur = this.reducedFlash ? 10 : 18 + severity * 16 * pulse;
    ctx.fillStyle = `rgba(255, 64, 88, ${alpha})`;
    ctx.fillText(label, 0, 0);
    ctx.shadowBlur = 0;

    if (!this.reducedFlash) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.22 + severity * 0.18 * pulse;
      ctx.fillStyle = '#ff4466';
      ctx.fillText(label, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  private drawGameOverOverlay(): void {
    const ctx = this.ctx;
    const age = this.gameOverFx?.age ?? 0;
    const enter = Math.min(1, age / 0.45);
    const pulse = 0.62 + 0.38 * Math.sin(age * 7.5);
    const eased = 1 - Math.pow(1 - enter, 3);
    const flashScale = this.reducedFlash ? 0.55 : 1;

    const cx = this.width * 0.5;
    const cy = this.height * 0.42;
    const playLeft = this.laneStartX;
    const playRight = this.laneStartX + this.laneWidth * 4;
    const playTop = this.laneTopY;
    const playBottom = this.laneBottomY;
    const playCx = (playLeft + playRight) / 2;
    const playCy = (playTop + playBottom) / 2;

    ctx.save();

    const edgeVignette = ctx.createRadialGradient(
      cx,
      cy,
      this.width * 0.24,
      cx,
      cy,
      this.width * 0.92,
    );
    edgeVignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    edgeVignette.addColorStop(0.7, `rgba(16, 0, 6, ${0.14 * eased * flashScale})`);
    edgeVignette.addColorStop(1, `rgba(0, 0, 0, ${0.38 * eased * flashScale})`);
    ctx.fillStyle = edgeVignette;
    ctx.fillRect(0, 0, this.width, this.height);

    const playBloom = ctx.createRadialGradient(
      playCx,
      playCy,
      0,
      playCx,
      playCy,
      Math.max(playRight - playLeft, playBottom - playTop) * 0.92,
    );
    playBloom.addColorStop(0, `rgba(255, 40, 60, ${0.2 * pulse * eased * flashScale})`);
    playBloom.addColorStop(0.5, `rgba(255, 24, 40, ${0.09 * pulse * eased * flashScale})`);
    playBloom.addColorStop(1, 'rgba(255, 0, 0, 0)');
    ctx.fillStyle = playBloom;
    ctx.fillRect(playLeft - 24, playTop - 16, playRight - playLeft + 48, playBottom - playTop + 32);

    const edgeW = Math.min(44, this.width * 0.055);
    const leftEdge = ctx.createLinearGradient(0, 0, edgeW, 0);
    leftEdge.addColorStop(0, `rgba(255, 32, 48, ${0.24 * pulse * eased * flashScale})`);
    leftEdge.addColorStop(1, 'rgba(255, 32, 48, 0)');
    ctx.fillStyle = leftEdge;
    ctx.fillRect(0, 0, edgeW, this.height);

    const rightEdge = ctx.createLinearGradient(this.width, 0, this.width - edgeW, 0);
    rightEdge.addColorStop(0, `rgba(255, 32, 48, ${0.24 * pulse * eased * flashScale})`);
    rightEdge.addColorStop(1, 'rgba(255, 32, 48, 0)');
    ctx.fillStyle = rightEdge;
    ctx.fillRect(this.width - edgeW, 0, edgeW, this.height);

    const textBloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.width * 0.26);
    textBloom.addColorStop(0, `rgba(255, 48, 72, ${0.16 * pulse * eased * flashScale})`);
    textBloom.addColorStop(1, 'rgba(255, 0, 0, 0)');
    ctx.fillStyle = textBloom;
    ctx.fillRect(
      cx - this.width * 0.28,
      cy - this.height * 0.18,
      this.width * 0.56,
      this.height * 0.36,
    );

    const fontSize = Math.round(Math.min(78, this.width * 0.14) * (0.82 + eased * 0.18));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${fontSize}px Orbitron, sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = `rgba(0, 0, 0, ${0.88 * eased})`;
    ctx.strokeText(t('ui.gameOver'), cx, cy);
    ctx.shadowColor = '#ff2244';
    ctx.shadowBlur = 20 + pulse * 18;
    ctx.fillStyle = `rgba(255, 64, 88, ${0.82 + pulse * 0.18})`;
    ctx.fillText(t('ui.gameOver'), cx, cy);
    ctx.shadowBlur = 0;

    const subSize = Math.round(Math.min(22, this.width * 0.045));
    ctx.font = `700 ${subSize}px Orbitron, sans-serif`;
    ctx.fillStyle = `rgba(255, 180, 190, ${0.55 * eased})`;
    ctx.fillText(t('ui.failed'), cx, cy + fontSize * 0.62);

    ctx.restore();
  }

  private drawHUD(stats: GameStats, chart: ChartData, _currentTime: number) {
    drawPlayHud(
      this.ctx,
      {
        width: this.width,
        laneMarginRight: Renderer.LANE_MARGIN_LEFT,
        scoreCenterX: this.getPlayfieldCenterX(),
        songDuration: this.songDuration,
        scrollSpeed: this.scrollSpeed,
        time: this.time,
      },
      stats,
      chart,
    );
  }

  private drawAccuracyMilestoneBanner() {
    const banner = this.accuracyMilestoneBanner;
    if (!banner) return;

    const style = ACCURACY_MILESTONE_STYLE[banner.tier];
    const ctx = this.ctx;
    const y = this.hitLineY - 150;

    ctx.save();
    ctx.translate(this.getPlayfieldCenterX(), y);
    ctx.scale(banner.scale, banner.scale);
    ctx.globalAlpha = banner.alpha;

    const glowR = banner.tier === 95 ? 120 : banner.tier === 90 ? 100 : 80;
    const burstColor =
      banner.tier === 95
        ? 'rgba(255, 215, 0, 0.35)'
        : banner.tier === 90
          ? 'rgba(0, 229, 255, 0.32)'
          : 'rgba(152, 251, 152, 0.28)';
    const burst = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
    burst.addColorStop(0, burstColor);
    burst.addColorStop(1, 'transparent');
    ctx.fillStyle = burst;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${banner.tier === 95 ? 52 : 46}px Orbitron, sans-serif`;
    ctx.fillStyle = style.color;
    ctx.shadowColor = style.color;
    ctx.shadowBlur = banner.tier === 95 ? 36 : 28;
    ctx.fillText(style.label, 0, -8);

    ctx.font = 'bold 14px Orbitron, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.shadowBlur = 14;
    ctx.letterSpacing = '0.28em';
    ctx.fillText(getMilestoneSublabel(banner.tier), 0, 28);
    ctx.letterSpacing = '0px';

    ctx.restore();
  }

  private drawMissFlashOverlay(): void {
    if (this.screen.missFlash <= 0.02) return;
    const ctx = this.ctx;
    const alpha = this.screen.missFlash * (this.reducedFlash ? 0.32 : 0.52);
    ctx.save();
    if (!this.gameOverFx) {
      ctx.fillStyle = `rgba(255, 24, 48, ${alpha})`;
      ctx.fillRect(0, 0, this.width, this.height);
    } else if (this.playfieldActive) {
      const playLeft = this.laneStartX;
      const playRight = this.laneStartX + this.laneWidth * 4;
      const playTop = this.laneTopY;
      const playBottom = this.laneBottomY;
      const playCx = (playLeft + playRight) / 2;
      const playCy = (playTop + playBottom) / 2;
      const bloom = ctx.createRadialGradient(
        playCx,
        playCy,
        0,
        playCx,
        playCy,
        Math.max(playRight - playLeft, playBottom - playTop) * 0.75,
      );
      bloom.addColorStop(0, `rgba(255, 32, 48, ${alpha * 0.55})`);
      bloom.addColorStop(1, 'rgba(255, 24, 48, 0)');
      ctx.fillStyle = bloom;
      ctx.fillRect(
        playLeft - 12,
        playTop - 8,
        playRight - playLeft + 24,
        playBottom - playTop + 16,
      );
    }

    const laneFlash = this.screen.missFlash * (this.reducedFlash ? 0.25 : 0.42);
    for (let lane = 0; lane < 4; lane++) {
      const glow = this.laneGlows[lane];
      if (glow.intensity <= 0.05) continue;
      const x = this.laneStartX + lane * this.laneWidth;
      const grad = ctx.createLinearGradient(x, this.laneTopY, x, this.laneBottomY);
      grad.addColorStop(0, `rgba(255, 40, 60, ${laneFlash * glow.intensity * 0.35})`);
      grad.addColorStop(0.55, `rgba(255, 24, 48, ${laneFlash * glow.intensity * 0.65})`);
      grad.addColorStop(1, 'rgba(255, 24, 48, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, this.laneTopY, this.laneWidth, this.laneBottomY - this.laneTopY);
    }
    ctx.restore();
  }

  private drawComboBreakFx(): void {
    const fx = this.comboBreak;
    if (!fx || fx.alpha <= 0) return;

    const ctx = this.ctx;
    const cx = this.getPlayfieldCenterX();
    const cy = (this.laneTopY + this.hitLineY) * 0.45;
    const fade = Math.max(0, fx.alpha);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = fade;

    ctx.strokeStyle = `rgba(255, 240, 200, ${0.55 * fade})`;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(0, 0, 52 + fx.age * 28, 0, Math.PI * 2);
    ctx.stroke();

    for (const shard of fx.shards) {
      const x = Math.cos(shard.angle) * shard.dist;
      const y = Math.sin(shard.angle) * shard.dist;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(shard.angle + fx.age * 3);
      ctx.fillStyle = `rgba(255, 248, 220, ${0.85 * fade})`;
      ctx.shadowColor = '#ff6b8a';
      ctx.shadowBlur = 8;
      ctx.fillRect(-shard.size * 0.35, -shard.size * 0.12, shard.size, shard.size * 0.24);
      ctx.restore();
    }

    ctx.font = 'bold 16px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255, 120, 140, ${0.9 * fade})`;
    ctx.shadowColor = '#ff2244';
    ctx.shadowBlur = 12;
    ctx.fillText(t('ui.comboBreak'), 0, 4);

    ctx.restore();
  }

  private drawComboDisplay(stats: GameStats) {
    if (stats.combo <= 0) return;

    const ctx = this.ctx;
    const cx = this.getPlayfieldCenterX();
    const cy = (this.laneTopY + this.hitLineY) * 0.45;
    const pulse = 1 + 0.06 * Math.sin(this.time * 9);
    const growth = 1 + Math.min(stats.combo / 60, 1) * 0.35;
    const scale = pulse * growth;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    const glowR = 70 + Math.min(stats.combo, 120) * 0.4;
    const burst = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
    burst.addColorStop(0, 'rgba(255, 215, 0, 0.35)');
    burst.addColorStop(0.45, 'rgba(255, 140, 0, 0.12)');
    burst.addColorStop(1, 'transparent');
    ctx.fillStyle = burst;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();

    const ringAlpha = 0.35 + 0.15 * Math.sin(this.time * 12);
    ctx.strokeStyle = `rgba(255, 215, 0, ${ringAlpha})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, 0, glowR * 0.72, 0, Math.PI * 2);
    ctx.stroke();

    const fontSize = Math.min(96, 56 + Math.log10(stats.combo + 1) * 22);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${fontSize}px Orbitron, sans-serif`;
    ctx.fillStyle = '#fffef0';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 28 + Math.min(stats.combo, 100) * 0.35;
    ctx.fillText(String(stats.combo), 0, -6);

    ctx.font = 'bold 18px Orbitron, sans-serif';
    ctx.fillStyle = 'rgba(255, 215, 0, 0.95)';
    ctx.shadowBlur = 14;
    ctx.letterSpacing = '0.35em';
    ctx.fillText(t('ui.combo'), 0, fontSize * 0.48);
    ctx.letterSpacing = '0px';

    ctx.restore();
  }

  private drawJudgmentText() {
    if (!this.lastJudgment) return;
    const ctx = this.ctx;
    const j = this.lastJudgment;

    ctx.save();
    ctx.translate(this.getPlayfieldCenterX(), this.hitLineY - 90);
    ctx.scale(j.scale, j.scale);
    ctx.globalAlpha = j.alpha;
    ctx.textAlign = 'center';
    ctx.font = '900 36px Orbitron, sans-serif';
    ctx.fillStyle = j.color;
    ctx.shadowColor = j.color;
    ctx.shadowBlur = j.glow;
    ctx.fillText(j.text, 0, 0);
    ctx.restore();
  }
}
