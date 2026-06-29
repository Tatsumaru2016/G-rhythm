import type { ActiveNote, ChartData, GameStats, JudgmentType, LaneIndex } from '../types';
import {
  LANE_COLORS, LANE_LABELS, LANE_ARROW_LABELS, DEFAULT_NOTE_SPEED, BASE_APPROACH_TIME,
} from '../types';
import { JUDGMENT_COLORS } from './Judgment';
import { ParticleSystem } from './ParticleSystem';
import { SideStageFX, type LaneBounds } from './SideStageFX';
import { StageDancers } from './StageDancers';
import type { DancerModelId } from './dancerCatalog';
import {
  getPerfectDancerTier,
  getPerfectStackRatio,
} from './dancerCatalog';
import type { AudioReactive } from '../audio/AudioEngine';
import { DEFAULT_SCROLL_SPEED } from '../settings/scrollSpeed';
import { getPhaseLabel, getPhaseScrollMultiplier, getSongPhase, type SongPhase } from './scrollPhase';
import { getGenreLabel, resolveGenre } from '../audio/musicGenre';
import {
  getMilestoneSublabel,
  t,
} from '../i18n';
import { getJudgmentLabel } from './Judgment';
import {
  ACCURACY_MILESTONE_STYLE,
  getAccuracyTier,
  type AccuracyTier,
} from './accuracyMilestone';

interface LaneGlow {
  intensity: number;
  color: string;
}

interface ScreenEffect {
  shake: number;
  perfectPulse: number;
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
  private readonly perfectMeterBandH = 36;
  private laneGlows: LaneGlow[] = [];
  private scrollSpeed = DEFAULT_SCROLL_SPEED;
  private songDuration = 0;
  private dancerRotationDuration = 0;
  private reducedFlash = false;
  private screen: ScreenEffect = { shake: 0, perfectPulse: 0 };
  private lastJudgment: { text: string; color: string; alpha: number; scale: number; glow: number } | null = null;
  private accuracyMilestoneBanner: {
    tier: AccuracyTier;
    alpha: number;
    scale: number;
    age: number;
  } | null = null;
  private bgStars: { x: number; y: number; z: number; brightness: number }[] = [];
  private time = 0;
  private lastDt = 0;
  private sideFX = new SideStageFX();
  private stageDancers: StageDancers;
  private playfieldActive = false;
  private dancerPreviewActive = false;
  private previewRafId = 0;
  private previewLastTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    const parent = canvas.parentElement;
    if (!parent) throw new Error('#app not found');
    this.stageDancers = new StageDancers(parent);

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

  private laneBounds(): { startX: number; topY: number; width: number; bottomY: number; hitLineY: number } {
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
    this.laneStartX = Renderer.LANE_MARGIN_LEFT;
    this.laneTopY = 0;
    const keyHintReserve = Math.max(80, Math.min(108, Math.round(this.height * 0.11)));
    this.hitLineY = this.height - keyHintReserve;
    this.laneBottomY = this.height;
    this.noteHeight = Math.max(14, this.laneWidth * 0.32);
    const bounds = this.laneBounds();
    this.stageDancers.resize(this.width, this.height, bounds);
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

  private getDancerStageBounds(): { left: number; centerX: number; right: number; width: number } {
    const left = this.laneStartX + this.laneWidth * 4;
    const width = Math.max(120, this.width - left);
    return {
      left,
      centerX: left + width * 0.5,
      right: this.width - Renderer.LANE_MARGIN_LEFT,
      width,
    };
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

  setDancerRotationDuration(duration: number): void {
    this.dancerRotationDuration = Math.max(0, duration);
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

  preloadDancerModels(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    return this.stageDancers.preloadAll(onProgress);
  }

  preloadEarlyDancers(): Promise<void> {
    return this.stageDancers.preloadEarlyPhase();
  }

  startDancerPreview(leftId: DancerModelId, rightId: DancerModelId): void {
    if (this.dancerPreviewActive) {
      this.stageDancers.setPreviewPair(leftId, rightId);
      return;
    }
    this.dancerPreviewActive = true;
    this.resize();
    this.stageDancers.startPreview(leftId, rightId);
    this.previewLastTime = performance.now();
    const loop = (now: number) => {
      if (!this.dancerPreviewActive) return;
      const dt = Math.min((now - this.previewLastTime) / 1000, 0.05);
      this.previewLastTime = now;
      this.time += dt;
      this.renderCleared();
      const bounds = this.laneBounds();
      this.compositeDancers(dt, bounds, 0, 0);
      this.previewRafId = requestAnimationFrame(loop);
    };
    this.previewRafId = requestAnimationFrame(loop);
  }

  setDancerPreviewModels(leftId: DancerModelId, rightId: DancerModelId): void {
    if (!this.dancerPreviewActive) return;
    this.stageDancers.setPreviewPair(leftId, rightId);
  }

  stopDancerPreview(): void {
    if (!this.dancerPreviewActive) return;
    this.dancerPreviewActive = false;
    cancelAnimationFrame(this.previewRafId);
    this.previewRafId = 0;
    this.stageDancers.stopPreview();
    this.renderCleared();
  }

  isDancerPreviewActive(): boolean {
    return this.dancerPreviewActive;
  }

  resetSideEffects(chart: ChartData): void {
    this.playfieldActive = true;
    this.sideFX.reset(chart);
    this.stageDancers.show();
    const bounds = this.laneBounds();
    this.stageDancers.resize(this.width, this.height, bounds);
  }

  onGameEnd(): void {
    this.playfieldActive = false;
    this.songDuration = 0;
    this.dancerRotationDuration = 0;
    this.lastJudgment = null;
    this.accuracyMilestoneBanner = null;
    this.screen = { shake: 0, perfectPulse: 0 };
    for (const g of this.laneGlows) g.intensity = 0;
    this.sideFX.clear();
    this.stageDancers.hide();
    this.renderCleared();
  }

  notifySideJudgment(judgment: JudgmentType, combo: number): void {
    this.sideFX.onJudgment(judgment, combo, this.width, this.height, this.laneBounds());
  }

  triggerAccuracyMilestone(tier: AccuracyTier): void {
    const style = ACCURACY_MILESTONE_STYLE[tier];

    this.accuracyMilestoneBanner = { tier, alpha: 1, scale: 0.55, age: 0 };

    if (!this.reducedFlash) {
      this.screen.perfectPulse = Math.max(this.screen.perfectPulse, style.pulse);
      this.screen.shake = Math.max(this.screen.shake, tier === 95 ? 5 : tier === 90 ? 4 : 3);
    }

    this.sideFX.onAccuracyMilestone(tier, this.width, this.height, this.laneBounds());
  }

  getScrollSpeed(): number {
    return this.scrollSpeed;
  }

  private getEffectiveScrollMultiplier(currentTime: number): number {
    const phaseMult = getPhaseScrollMultiplier(currentTime, this.songDuration);
    return this.scrollSpeed * phaseMult;
  }

  getNoteSpeed(currentTime = 0): number {
    return DEFAULT_NOTE_SPEED * this.getEffectiveScrollMultiplier(currentTime);
  }

  getApproachTime(currentTime = 0): number {
    const travel = this.hitLineY - this.laneTopY;
    const speed = this.getNoteSpeed(currentTime);
    if (travel <= 0 || speed <= 0) return BASE_APPROACH_TIME / this.getEffectiveScrollMultiplier(currentTime);
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
      perfect: 1.2,
      great: 1.0,
      good: 0.92,
      bad: 0.82,
      miss: 0.5,
    };
    this.laneGlows[lane].intensity = intensity[judgment] * scale;
    this.laneGlows[lane].color = JUDGMENT_COLORS[judgment];
  }

  triggerScreenEffect(judgment: JudgmentType) {
    if (this.reducedFlash) {
      if (judgment === 'miss' || judgment === 'bad') this.screen.shake = 2;
      else if (judgment === 'good') this.screen.shake = 1;
      return;
    }
    switch (judgment) {
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
        break;
    }
  }

  showJudgment(judgment: JudgmentType) {
    const scales: Record<JudgmentType, number> = {
      perfect: 1.45,
      great: 1.32,
      good: 1.28,
      bad: 1.22,
      miss: 1.1,
    };
    const glows: Record<JudgmentType, number> = {
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

  update(dt: number) {
    if (!this.playfieldActive) return;
    this.lastDt = dt;
    this.time += dt;
    for (const g of this.laneGlows) {
      g.intensity *= 0.92;
    }
    this.screen.shake *= 0.85;
    this.screen.perfectPulse *= 0.9;
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
  }

  render(
    notes: ActiveNote[],
    currentTime: number,
    chart: ChartData,
    stats: GameStats,
    particles: ParticleSystem,
    audioReactive: AudioReactive,
  ) {
    const ctx = this.ctx;
    ctx.save();

    if (this.screen.shake > 0.5 && !this.reducedFlash) {
      const sx = (Math.random() - 0.5) * this.screen.shake;
      const sy = (Math.random() - 0.5) * this.screen.shake;
      ctx.translate(sx, sy);
    }

    const pulseScale = this.reducedFlash ? 0.2 : 1;
    const pulse = (this.screen.perfectPulse + (stats.combo > 0 ? Math.min(0.4, stats.combo * 0.004) : 0)) * pulseScale;
    const laneBounds = this.laneBounds();
    const songPhase = getSongPhase(currentTime, this.songDuration);
    const preSync = SideStageFX.buildSync(
      currentTime, chart, stats, pulse, audioReactive,
      this.sideFX.getHitBoost(),
      this.sideFX.getPerfectBoost(),
      this.sideFX.getHue(),
    );
    this.sideFX.update(this.lastDt, preSync, this.width, this.height, laneBounds);
    const sync = SideStageFX.buildSync(
      currentTime, chart, stats, pulse, audioReactive,
      this.sideFX.getHitBoost(),
      this.sideFX.getPerfectBoost(),
      this.sideFX.getHue(),
    );

    this.drawBackground(!this.reducedFlash);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = this.reducedFlash ? 0.2 : 0.74;
    this.sideFX.draw(ctx, this.width, this.height, laneBounds, sync, songPhase);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.restore();

    this.compositeDancers(this.lastDt, laneBounds, currentTime, this.sideFX.getPerfectBoost());

    this.drawLanes();
    if (this.playfieldActive) {
      this.drawPerfectMeter(this.sideFX.getPerfectBoost());
    }
    particles.draw(ctx);
    this.drawNotes(notes, currentTime);
    this.drawHitLine();
    this.drawLaneKeyHints();
    this.drawHoldLaneFeedback(notes, currentTime);
    this.drawHUD(stats, chart, currentTime);
    this.drawComboDisplay(stats);
    this.drawAccuracyMilestoneBanner();
    this.drawJudgmentText();

    ctx.restore();
  }

  /** 左右マージン演出の直後・レーンより手前にダンサーを合成（ステージ右エリア） */
  private compositeDancers(
    dt: number,
    laneBounds: LaneBounds,
    currentTime: number,
    perfectBoost: number,
  ): void {
    if (!this.playfieldActive && !this.dancerPreviewActive) return;

    this.stageDancers.render(
      dt,
      laneBounds,
      currentTime,
      this.dancerRotationDuration > 0 ? this.dancerRotationDuration : this.songDuration,
      perfectBoost,
      this.width,
      this.height,
    );

    const dancerCanvas = this.stageDancers.getCanvas();
    if (dancerCanvas.width <= 0 || dancerCanvas.height <= 0) return;

    const laneEnd = laneBounds.startX + laneBounds.width;
    const stageX = laneEnd;
    const stageW = this.width - laneEnd;

    const ctx = this.ctx;
    const blit = () => ctx.drawImage(dancerCanvas, 0, 0, this.width, this.height);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    if (this.dancerPreviewActive) {
      blit();
      ctx.restore();
      return;
    }

    if (stageW > 12) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(stageX, 0, stageW, this.height);
      ctx.clip();
      blit();
      ctx.restore();
    }

    ctx.restore();
  }

  private renderCleared(): void {
    const ctx = this.ctx;
    ctx.save();
    this.drawBackground(false);
    ctx.restore();
  }

  private drawBackground(animated = true) {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, '#050010');
    grad.addColorStop(0.35, '#0a0018');
    grad.addColorStop(1, '#1a0035');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);

    for (const star of this.bgStars) {
      const x = star.x * this.width;
      const y = animated
        ? (star.y * this.height + this.time * 20 * star.z) % this.height
        : star.y * this.height;
      const twinkle = animated
        ? 0.78 + 0.22 * Math.sin(this.time * 1.1 + star.x * 10)
        : 0.65;
      const size = star.z * 2;
      ctx.globalAlpha = star.brightness * twinkle;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, size, size);
    }
    ctx.globalAlpha = 1;
  }

  private drawLanes() {
    const ctx = this.ctx;
    const laneBottom = this.laneBottomY;
    const laneW = this.laneWidth * 4;

    ctx.fillStyle = 'rgba(3, 0, 10, 0.9)';
    ctx.fillRect(this.laneStartX, this.laneTopY, laneW, laneBottom - this.laneTopY);

    for (let i = 0; i < 4; i++) {
      const color = LANE_COLORS[i];
      const glow = this.laneGlows[i];
      const left = this.laneLeft(i as LaneIndex);
      const right = this.laneRight(i as LaneIndex);

      const floorGrad = ctx.createLinearGradient(left, this.laneTopY, left, laneBottom);
      floorGrad.addColorStop(0, 'rgba(6, 0, 14, 0.9)');
      floorGrad.addColorStop(0.5, 'rgba(10, 2, 22, 0.87)');
      floorGrad.addColorStop(1, `${color}38`);
      ctx.fillStyle = floorGrad;
      ctx.fillRect(left, this.laneTopY, this.laneWidth, laneBottom - this.laneTopY);

      const edgeGrad = ctx.createLinearGradient(left, 0, right, 0);
      edgeGrad.addColorStop(0, `${color}45`);
      edgeGrad.addColorStop(0.04, `${color}16`);
      edgeGrad.addColorStop(0.5, `${color}0c`);
      edgeGrad.addColorStop(0.96, `${color}16`);
      edgeGrad.addColorStop(1, `${color}45`);
      ctx.fillStyle = edgeGrad;
      ctx.globalAlpha = 0.82;
      ctx.fillRect(left, this.laneTopY, this.laneWidth, laneBottom - this.laneTopY);
      ctx.globalAlpha = 1;

      if (glow.intensity > 0.05) {
        ctx.fillStyle = `${glow.color}${Math.floor(glow.intensity * 45).toString(16).padStart(2, '0')}`;
        ctx.fillRect(left, this.hitLineY - 90, this.laneWidth, 90);
      }

      if (i > 0) {
        ctx.strokeStyle = `${LANE_COLORS[i - 1]}70`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(left, this.laneTopY);
        ctx.lineTo(left, laneBottom);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.36)';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.laneStartX, this.laneTopY, this.laneWidth * 4, laneBottom - this.laneTopY);

    const laneEnd = this.laneStartX + this.laneWidth * 4;
    const stageGrad = ctx.createLinearGradient(laneEnd, 0, laneEnd + 48, 0);
    stageGrad.addColorStop(0, 'rgba(0, 229, 255, 0.22)');
    stageGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');
    ctx.strokeStyle = stageGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(laneEnd, this.laneTopY);
    ctx.lineTo(laneEnd, laneBottom);
    ctx.stroke();

    this.drawLaneCenterGuides(
      this.laneTopY + this.perfectMeterBandH,
      this.hitLineY,
    );
  }

  private drawLaneCenterGuides(topY: number, bottomY: number) {
    const ctx = this.ctx;
    if (bottomY <= topY) return;

    ctx.save();
    ctx.setLineDash([5, 7]);
    for (let i = 0; i < 4; i++) {
      const cx = this.getLaneCenterX(i as LaneIndex);
      const color = LANE_COLORS[i];
      ctx.strokeStyle = `${color}66`;
      ctx.lineWidth = 1;
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
      const progress = note.holding && note.endTime
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
          this.drawTapNote(left, startY, w, h, color, note.time - currentTime, 'hold-press', currentTime);
        }
        if (!note.released) {
          const clampedTailCy = Math.min(laneBottom - h / 2, tailCy);
          const tailTime = note.holding ? 0 : note.endTime - currentTime;
          const releaseUrgency = this.getHoldReleaseUrgency(note, currentTime);
          this.drawTapNote(
            left, clampedTailCy, w, h, color, tailTime, 'hold-release', currentTime, releaseUrgency,
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
      this.laneTopY + this.perfectMeterBandH,
      this.laneWidth * 4,
      laneBottom - this.laneTopY - this.perfectMeterBandH,
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

    const highlight = marker === 'hold-release' && releaseUrgency > 0.4
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
      ctx.fillStyle = releaseUrgency > 0.55
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
    const pulse = 0.7 + 0.3 * Math.sin(this.time * 4) + this.screen.perfectPulse * 0.3;

    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 25 * pulse;
    ctx.strokeStyle = `rgba(0, 255, 255, ${0.7 * pulse})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(left, this.hitLineY);
    ctx.lineTo(right, this.hitLineY);
    ctx.stroke();

    const lineGrad = ctx.createLinearGradient(left, this.hitLineY - 40, left, this.hitLineY + 40);
    lineGrad.addColorStop(0, 'rgba(0,255,255,0)');
    lineGrad.addColorStop(0.5, `rgba(0,255,255,${0.12 * pulse})`);
    lineGrad.addColorStop(1, 'rgba(0,255,255,0)');
    ctx.fillStyle = lineGrad;
    ctx.fillRect(left, this.hitLineY - 40, right - left, 80);
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

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
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

  private drawPerfectMeter(perfectBoost: number) {
    const ctx = this.ctx;
    const stackRatio = getPerfectStackRatio(perfectBoost);
    const tier = getPerfectDancerTier(perfectBoost);
    const barX = this.laneStartX + 6;
    const barY = this.laneTopY + 24;
    const barW = this.laneWidth * 4 - 12;
    const barH = 7;
    const pulse = tier > 0 ? 0.75 + 0.25 * Math.sin(this.time * (6 + tier * 2)) : 0.55;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 4);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let i = 1; i <= 4; i++) {
      const tx = barX + (i / 4) * barW;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.beginPath();
      ctx.moveTo(tx, barY);
      ctx.lineTo(tx, barY + barH);
      ctx.stroke();
    }

    if (stackRatio > 0.004) {
      const fillW = Math.max(2, barW * stackRatio);
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0, `rgba(0, 220, 255, ${0.55 * pulse})`);
      grad.addColorStop(0.55, `rgba(120, 255, 220, ${0.75 * pulse})`);
      grad.addColorStop(1, `rgba(255, 215, 0, ${0.9 * pulse})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(barX, barY, fillW, barH, 4);
      ctx.fill();
      ctx.shadowColor = tier >= 4 ? '#ffd700' : '#00ffff';
      ctx.shadowBlur = 8 + tier * 4;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 + tier * 0.12})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.font = 'bold 9px Orbitron, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = tier > 0 ? '#aaf8ff' : 'rgba(200, 230, 255, 0.65)';
    ctx.fillText(t('ui.perfectMeter'), barX, barY - 4);

    if (tier > 0) {
      ctx.textAlign = 'right';
      ctx.fillStyle = tier >= 4 ? '#ffe566' : '#aaf8ff';
      ctx.fillText(`p0${tier}`, barX + barW, barY - 4);
    }

    ctx.restore();
  }

  private drawHUD(stats: GameStats, chart: ChartData, currentTime: number) {
    const ctx = this.ctx;
    const margin = Renderer.LANE_MARGIN_LEFT;
    const hudRightX = this.width - margin;
    const stage = this.getDancerStageBounds();

    ctx.save();

    // 曲名・BPMなど — 画面右上
    ctx.textAlign = 'right';
    ctx.font = 'bold 14px "Noto Sans JP", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(chart.title, hudRightX, 30);
    ctx.fillText(`${chart.bpm} BPM · ${getGenreLabel(resolveGenre(chart))}`, hudRightX, 50);

    if (this.songDuration > 0) {
      const phaseLabel = getPhaseLabel(currentTime, this.songDuration);
      const phaseMult = getPhaseScrollMultiplier(currentTime, this.songDuration);
      ctx.font = 'bold 12px "Noto Sans JP", sans-serif';
      ctx.fillStyle = phaseMult >= 1.4
        ? 'rgba(255, 120, 180, 0.9)'
        : phaseMult >= 1.15
          ? 'rgba(120, 220, 255, 0.88)'
          : 'rgba(180, 255, 200, 0.75)';
      ctx.fillText(`${phaseLabel}  ×${phaseMult.toFixed(2)}`, hudRightX, 70);
    }

    const total = stats.perfect + stats.great + stats.good + stats.bad + stats.miss;
    if (total > 0) {
      const acc = ((stats.perfect + stats.great * 0.7 + stats.good * 0.4) / total * 100).toFixed(1);
      const tier = getAccuracyTier(stats);
      const tierStyle = tier ? ACCURACY_MILESTONE_STYLE[tier] : null;
      const tierPulse = tier === 95 ? 0.22 + Math.sin(this.time * 10) * 0.12
        : tier === 90 ? 0.14 + Math.sin(this.time * 8) * 0.08
        : tier === 80 ? 0.08 + Math.sin(this.time * 6) * 0.05
        : 0;

      ctx.font = 'bold 11px Orbitron, sans-serif';
      ctx.fillStyle = tierStyle ? tierStyle.color : 'rgba(255, 255, 255, 0.45)';
      if (tierStyle) {
        ctx.shadowColor = tierStyle.color;
        ctx.shadowBlur = 8 + tierPulse * 20;
      }
      ctx.fillText(t('ui.acc'), hudRightX, 92);
      ctx.font = 'bold 22px Orbitron, sans-serif';
      ctx.fillStyle = tierStyle ? tierStyle.color : 'rgba(255, 255, 255, 0.88)';
      if (tierStyle) ctx.shadowBlur = 12 + tierPulse * 28;
      ctx.fillText(`${acc}%`, hudRightX, 116);
      ctx.shadowBlur = 0;
    }

    // スコア — ダンサーエリア中央上
    const scoreX = stage.centerX;
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px Orbitron, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillText(t('ui.score'), scoreX, 36);
    ctx.font = 'bold 38px Orbitron, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 14;
    ctx.fillText(stats.score.toLocaleString(), scoreX, 70);
    ctx.shadowBlur = 0;

    ctx.restore();
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
    const burstColor = banner.tier === 95 ? 'rgba(255, 215, 0, 0.35)'
      : banner.tier === 90 ? 'rgba(0, 229, 255, 0.32)'
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
