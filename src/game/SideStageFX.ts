import type { ChartData, GameStats, JudgmentType } from '../types';
import { AUDIO_BAND_COUNT, type AudioReactive } from '../audio/AudioEngine';
import { blendPhaseWithGenre, getGenreVisualProfile, resolveGenre } from '../audio/musicGenre';
import type { MusicGenre } from '../types';
import { isValidStageFxPattern, pickSidePatterns, type SideFxPairing } from './stageFxPatterns';
import {
  getPhaseColorScheme,
  PHASE_SIDE_FX_DRIVE,
  type PhaseColorScheme,
  type SongPhase,
} from './scrollPhase';

export interface MusicSync {
  currentTime: number;
  bpm: number;
  beat: number;
  beatPhase: number;
  combo: number;
  pulse: number;
  accuracy: number;
  accuracyTier: 0 | 80 | 90 | 95;
  hitBoost: number;
  perfectBoost: number;
  musicDrive: number;
  hue: number;
  audio: AudioReactive;
}

export interface LaneBounds {
  startX: number;
  topY: number;
  width: number;
  bottomY: number;
  hitLineY: number;
}

/** 0=Rings 1=PrismPulse 2=Plasma 3=AuroraFlow 4=Beams 5=Waves 6=NeonCascade 7=Scanlines 8=Starburst */
const BAND_COUNT = AUDIO_BAND_COUNT;

interface SidePanel {
  x: number;
  y: number;
  w: number;
  h: number;
}

type SideId = 'left' | 'right';

interface PulseRing {
  x: number;
  y: number;
  r: number;
  life: number;
  hue: number;
  spin: number;
}

interface PsyBurst {
  x: number;
  y: number;
  angle: number;
  life: number;
  hue: number;
}

export class SideStageFX {
  private leftPattern = 0;
  private rightPattern = 0;
  private pairing: SideFxPairing = 'unified';
  private bandLevels: number[] = Array.from({ length: BAND_COUNT }, () => 0);
  private hitBoost = 0;
  private perfectBoost = 0;
  private hue = 0;
  private time = 0;
  private rings: PulseRing[] = [];
  private bursts: PsyBurst[] = [];
  private lastBeat = -1;
  private reducedFlash = false;
  private debugPattern: number | null = null;
  private genre: MusicGenre = 'other';
  private lastBounds: LaneBounds | null = null;
  private lastSongPhase: SongPhase | null = null;
  private patternWeights: number[] = [];

  setDebugPattern(pattern: number | null): void {
    this.debugPattern = pattern !== null && isValidStageFxPattern(pattern) ? pattern : null;
  }

  getPattern(): number {
    return this.leftPattern;
  }

  getLeftPattern(): number {
    return this.leftPattern;
  }

  getRightPattern(): number {
    return this.rightPattern;
  }

  getPairing(): SideFxPairing {
    return this.pairing;
  }

  setReducedFlash(enabled: boolean): void {
    this.reducedFlash = enabled;
  }

  private dampenSync(sync: MusicSync): MusicSync {
    if (!this.reducedFlash) return sync;
    return {
      ...sync,
      pulse: sync.pulse * 0.12,
      hitBoost: sync.hitBoost * 0.1,
      perfectBoost: sync.perfectBoost * 0.1,
      musicDrive: sync.musicDrive * 0.22,
    };
  }

  private brightness(): number {
    return this.reducedFlash ? 0.16 : 1;
  }

  /** 演出全体の派手さ係数 */
  private fxDrive(sync: MusicSync): number {
    return 1.42 + sync.musicDrive * 0.52 + sync.perfectBoost * 0.62 + sync.hitBoost * 0.34;
  }

  /** ビート同期の滑らかな波形（0→1→0、明滅・フラッシュなし） */
  private beatFlow(sync: MusicSync): number {
    return Math.sin(sync.beatPhase * Math.PI);
  }

  private usesRingHitFx(pattern = this.leftPattern): boolean {
    return pattern === 0;
  }

  /** 線が多い演出 — PERFECT時のヒット演出を抑える */
  private usesLightHitOverlay(pattern = this.leftPattern): boolean {
    return pattern === 5 || pattern === 7;
  }

  private anyLightHitOverlay(): boolean {
    return (
      this.usesLightHitOverlay(this.leftPattern) || this.usesLightHitOverlay(this.rightPattern)
    );
  }

  private anyRingHitFx(): boolean {
    return this.usesRingHitFx(this.leftPattern) || this.usesRingHitFx(this.rightPattern);
  }

  /** 演出全体の派手さ係数 */
  private patternDrive(sync: MusicSync, pattern: number): number {
    const base = this.fxDrive(sync);
    if (pattern === 5 || pattern === 7) {
      return 1.2 + sync.musicDrive * 0.4 + sync.perfectBoost * 0.12 + sync.hitBoost * 0.12;
    }
    return base;
  }

  private assignPatterns(phase: SongPhase): void {
    const base =
      this.patternWeights.length > 0
        ? this.patternWeights
        : getGenreVisualProfile(this.genre).patternWeights;

    const pick = pickSidePatterns(base, this.debugPattern, phase);
    this.leftPattern = pick.left;
    this.rightPattern = pick.right;
    this.pairing = pick.pairing;
  }

  private sidePanels(
    screenW: number,
    screenH: number,
    bounds: LaneBounds,
  ): { left: SidePanel; right: SidePanel } {
    const laneEnd = bounds.startX + bounds.width;
    return {
      left: { x: 0, y: 0, w: bounds.startX, h: screenH },
      right: { x: laneEnd, y: 0, w: screenW - laneEnd, h: screenH },
    };
  }

  private panelCenter(panel: SidePanel): { x: number; y: number } {
    return { x: panel.x + panel.w * 0.5, y: panel.y + panel.h * 0.5 };
  }

  private cappedShadow(level: number, extra = 0, max = 14): number {
    return Math.min(max, 4 + level * 6 + extra);
  }

  reset(chart: ChartData) {
    this.genre = resolveGenre(chart);
    this.patternWeights = [...getGenreVisualProfile(this.genre).patternWeights];
    this.lastSongPhase = null;
    this.assignPatterns('early');
    this.hitBoost = 0;
    this.perfectBoost = 0;
    this.hue = Math.random() * 360;
    this.time = 0;
    this.rings = [];
    this.bursts = [];
    this.lastBeat = -1;
    this.bandLevels = Array.from({ length: BAND_COUNT }, () => 0);
    void chart;
  }

  onJudgment(
    judgment: JudgmentType,
    combo: number,
    screenW: number,
    screenH: number,
    bounds?: LaneBounds,
  ) {
    const boosts: Record<JudgmentType, number> = {
      marvelous: 1.0,
      perfect: 0.85,
      great: 0.42,
      good: 0.34,
      bad: 0.24,
      miss: 0,
    };

    const perfectAdds: Record<JudgmentType, number> = {
      marvelous: 1.75,
      perfect: 1.45,
      great: 0.48,
      good: 0.32,
      bad: 0.18,
      miss: 0,
    };

    if (this.reducedFlash) {
      const scale = 0.15;
      this.hitBoost = Math.max(this.hitBoost, boosts[judgment] * scale);
      if (judgment !== 'miss') {
        this.perfectBoost = Math.min(0.35, this.perfectBoost + perfectAdds[judgment] * 0.08);
        this.hue += judgment === 'bad' ? 6 : 10;
      }
      return;
    }

    this.hitBoost = Math.max(this.hitBoost, boosts[judgment] + Math.min(0.25, combo * 0.004));

    if (judgment !== 'miss') {
      this.perfectBoost = Math.min(
        2.8,
        this.perfectBoost + perfectAdds[judgment] + Math.min(0.4, combo * 0.012),
      );
      this.hue +=
        judgment === 'marvelous'
          ? 68 + combo * 0.55
          : judgment === 'perfect'
            ? 52 + combo * 0.5
            : judgment === 'great'
              ? 28
              : judgment === 'good'
                ? 20
                : 14;
      this.spawnJudgmentBurst(screenW, screenH, judgment, bounds);
    }
  }

  onAccuracyMilestone(tier: 80 | 90 | 95, screenW: number, screenH: number, bounds?: LaneBounds) {
    const scale = this.reducedFlash ? 0.2 : 1;
    const tierBoost = tier === 95 ? 1.4 : tier === 90 ? 1.0 : 0.7;
    this.hitBoost = Math.max(this.hitBoost, tierBoost * scale);
    this.perfectBoost = Math.min(2.8, this.perfectBoost + tierBoost * 0.85 * scale);
    this.hue += tier === 95 ? 120 : tier === 90 ? 75 : 45;

    if (this.reducedFlash) return;

    const centers = this.hitCenters(screenW, screenH, bounds);
    const ringLife = tier === 95 ? 1.6 : tier === 90 ? 1.3 : 1.05;
    const burstLife = tier === 95 ? 1.4 : tier === 90 ? 1.15 : 0.95;
    const hueBase = this.hue + (tier === 95 ? 50 : tier === 90 ? 30 : 10);
    const count = tier === 95 ? 4 : tier === 90 ? 3 : 2;

    for (const { x: cx, y: cy } of centers) {
      for (let i = 0; i < count; i++) {
        this.bursts.push({
          x: cx,
          y: cy,
          angle: Math.random() * Math.PI * 2,
          life: burstLife,
          hue: hueBase + Math.random() * 80,
        });
        if (this.anyRingHitFx()) {
          this.rings.push({
            x: cx,
            y: cy,
            r: 24 + i * 8,
            life: ringLife,
            hue: hueBase + Math.random() * 90,
            spin: (Math.random() > 0.5 ? 1 : -1) * (3 + Math.random() * 4),
          });
        }
      }
    }
  }

  private hitCenters(
    screenW: number,
    screenH: number,
    bounds?: LaneBounds,
  ): { x: number; y: number }[] {
    const b = bounds ?? this.lastBounds;
    if (!b) {
      return [{ x: screenW * 0.72, y: screenH * 0.5 }];
    }
    const panels = this.sidePanels(screenW, screenH, b);
    if (panels.right.w > 16) {
      return [this.panelCenter(panels.right)];
    }
    return [{ x: b.startX + b.width * 0.5, y: screenH * 0.5 }];
  }

  private spawnJudgmentBurst(
    screenW: number,
    screenH: number,
    judgment: JudgmentType,
    bounds?: LaneBounds,
  ) {
    const centers = this.hitCenters(screenW, screenH, bounds);

    const ringLife: Record<JudgmentType, number> = {
      marvelous: 1.5,
      perfect: 1.35,
      great: 0.95,
      good: 0.8,
      bad: 0.65,
      miss: 0,
    };
    const burstLife: Record<JudgmentType, number> = {
      marvelous: 1.35,
      perfect: 1.2,
      great: 0.9,
      good: 0.75,
      bad: 0.6,
      miss: 0,
    };
    const hueShift: Record<JudgmentType, number> = {
      marvelous: 75,
      perfect: 60,
      great: 45,
      good: 30,
      bad: -15,
      miss: 0,
    };

    const life = ringLife[judgment];
    if (life <= 0) return;

    const hueBase = this.hue + hueShift[judgment];
    const lightHit = this.anyLightHitOverlay();
    const ringCount = lightHit
      ? 1
      : judgment === 'marvelous'
        ? 4
        : judgment === 'perfect'
          ? 3
          : judgment === 'great'
            ? 2
            : 1;

    for (const { x: cx, y: cy } of centers) {
      for (let i = 0; i < ringCount; i++) {
        this.bursts.push({
          x: cx,
          y: cy,
          angle: Math.random() * Math.PI * 2,
          life: burstLife[judgment],
          hue: hueBase + Math.random() * 50,
        });
        if (this.anyRingHitFx()) {
          this.rings.push({
            x: cx,
            y: cy,
            r: 18 + i * 10,
            life,
            hue: hueBase + Math.random() * 70,
            spin: (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 3),
          });
        }
      }
    }
  }

  getHitBoost(): number {
    return this.hitBoost;
  }

  getPerfectBoost(): number {
    return this.perfectBoost;
  }

  getHue(): number {
    return this.hue;
  }

  clear(): void {
    this.bandLevels = Array.from({ length: BAND_COUNT }, () => 0);
    this.hitBoost = 0;
    this.perfectBoost = 0;
    this.rings = [];
    this.bursts = [];
  }

  private phaseHue(sync: MusicSync, palette: PhaseColorScheme, offset = 0): number {
    return (sync.hue + palette.hueBase + offset) % 360;
  }

  private psyColor(
    hue: number,
    sat = 92,
    light = 58,
    alpha = 1,
    palette?: PhaseColorScheme,
  ): string {
    const s = palette ? palette.saturation : sat;
    return `hsla(${((hue % 360) + 360) % 360}, ${s}%, ${light}%, ${alpha})`;
  }

  private computeMusicDrive(sync: MusicSync): number {
    const a = sync.audio;
    const avg = this.bandLevels.reduce((s, v) => s + v, 0) / BAND_COUNT;
    const beatFlow = Math.sin(sync.beatPhase * Math.PI);
    const tierDrive =
      sync.accuracyTier === 95
        ? 0.35
        : sync.accuracyTier === 90
          ? 0.22
          : sync.accuracyTier === 80
            ? 0.12
            : 0;
    return Math.min(
      2.2,
      a.energy * 1.8 +
        a.bass * 1.1 +
        a.vocal * 1.2 +
        a.spike * 1.6 +
        avg * 0.9 +
        beatFlow * 0.55 +
        sync.hitBoost * 0.5 +
        tierDrive,
    );
  }

  private playScale(sync: MusicSync): number {
    return 0.6 + sync.accuracy * 1.2 + sync.musicDrive * 0.55 + sync.perfectBoost * 0.45;
  }

  private spawnBeatPulse(screenW: number, screenH: number, sync: MusicSync, bounds?: LaneBounds) {
    if (!this.anyRingHitFx()) return;
    const beat = Math.floor(sync.beat);
    if (beat === this.lastBeat) return;
    this.lastBeat = beat;
    const flow = Math.sin(sync.beatPhase * Math.PI);
    for (const { x, y } of this.hitCenters(screenW, screenH, bounds)) {
      this.rings.push({
        x,
        y,
        r: 28 + flow * 10,
        life: 0.75 + flow * 0.35,
        hue: this.hue + beat * 37,
        spin: 2.5,
      });
    }
  }

  update(dt: number, sync: MusicSync, screenW: number, screenH: number, bounds?: LaneBounds) {
    this.time += dt;
    this.hitBoost *= Math.max(0, 1 - dt * 3.8);
    this.perfectBoost *= Math.max(0, 1 - dt * 2.2);

    const localSync = { ...sync, perfectBoost: this.perfectBoost, hue: this.hue };
    const musicDrive = this.computeMusicDrive(localSync);
    const hueSpeed = this.reducedFlash
      ? 12 + musicDrive * 18
      : 35 + musicDrive * 140 + this.perfectBoost * 200 + sync.audio.spike * 80;
    this.hue = (this.hue + dt * hueSpeed) % 360;
    localSync.hue = this.hue;
    localSync.musicDrive = musicDrive;

    const scale = this.playScale(localSync);

    for (let i = 0; i < BAND_COUNT; i++) {
      const target = (sync.audio.bands[i] ?? 0) * scale;
      const current = this.bandLevels[i];
      const norm = i / BAND_COUNT;
      const attack = 16 + norm * 26 + musicDrive * 22 + this.perfectBoost * 18;
      const decay = 3.5 + (1 - norm) * 5 + sync.accuracy;
      const rate = target > current ? attack : decay;
      this.bandLevels[i] += (target - current) * Math.min(1, dt * rate);
    }

    if (!sync.audio.hasSignal) {
      const beatFlow = Math.sin(sync.beatPhase * Math.PI);
      for (let i = 0; i < BAND_COUNT; i++) {
        const wobble = 0.45 + 0.55 * Math.sin(this.time * (2.2 + i * 0.28) + i * 1.17);
        const bandBeat = Math.sin(sync.beatPhase * Math.PI + i * 0.62);
        const fake = (beatFlow * 0.28 + bandBeat * 0.32) * wobble * scale;
        this.bandLevels[i] = Math.max(this.bandLevels[i] * 0.9, fake);
      }
    }

    if (!this.reducedFlash) this.spawnBeatPulse(screenW, screenH, localSync, bounds);

    const ringSpeed = 180 + musicDrive * 200 + this.perfectBoost * 280;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.r += dt * ringSpeed;
      ring.hue += dt * (60 + ring.spin * 40);
      ring.life -= dt * (0.7 + musicDrive * 0.25);
      if (ring.life <= 0) this.rings.splice(i, 1);
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.hue += dt * 120;
      b.life -= dt * 0.9;
      if (b.life <= 0) this.bursts.splice(i, 1);
    }
  }

  /** レーン右のステージエリアに演出を描画 */
  draw(
    ctx: CanvasRenderingContext2D,
    screenW: number,
    screenH: number,
    bounds: LaneBounds,
    sync: MusicSync,
    phase: SongPhase,
  ) {
    this.lastBounds = bounds;

    if (this.debugPattern === null && phase !== this.lastSongPhase) {
      this.assignPatterns(phase);
      if (this.lastSongPhase !== null && !this.reducedFlash) {
        this.hitBoost = Math.max(
          this.hitBoost,
          phase === 'late' ? 0.72 : phase === 'mid' ? 0.52 : 0.38,
        );
        this.perfectBoost = Math.min(2.8, this.perfectBoost + (phase === 'late' ? 0.35 : 0.2));
      }
    }
    this.lastSongPhase = phase;

    const palette = blendPhaseWithGenre(getPhaseColorScheme(phase), this.genre);
    const drawSync = this.dampenSync(sync);
    const genreVisual = getGenreVisualProfile(this.genre);
    const bright =
      this.brightness() *
      (this.reducedFlash ? 1 : genreVisual.driveScale) *
      PHASE_SIDE_FX_DRIVE[phase];
    const panels = this.sidePanels(screenW, screenH, bounds);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha *= bright;

    if (panels.left.w > 12) {
      this.drawSidePanel(ctx, panels.left, this.leftPattern, drawSync, palette, 'left');
    }

    if (panels.right.w > 12) {
      this.drawSidePanel(ctx, panels.right, this.rightPattern, drawSync, palette, 'right');
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawSidePanel(
    ctx: CanvasRenderingContext2D,
    panel: SidePanel,
    pattern: number,
    sync: MusicSync,
    palette: PhaseColorScheme,
    side: SideId,
  ) {
    const hueOffset = side === 'left' ? 0 : 48;
    const bandShift = side === 'left' ? 0 : 5;
    const sideSync: MusicSync = { ...sync, hue: sync.hue + hueOffset };

    ctx.save();
    ctx.translate(panel.x, panel.y);
    ctx.beginPath();
    ctx.rect(0, 0, panel.w, panel.h);
    ctx.clip();

    const cx = panel.w * 0.5;
    const cy = panel.h * 0.5;
    this.drawAmbientWash(ctx, panel.w, panel.h, sideSync, palette, cx, cy);
    this.drawPattern(ctx, pattern, panel.w, panel.h, sideSync, palette, cx, cy, bandShift);
    this.drawHitOverlay(ctx, panel, sideSync, palette, pattern);

    ctx.restore();
  }

  private drawPattern(
    ctx: CanvasRenderingContext2D,
    pattern: number,
    w: number,
    h: number,
    sync: MusicSync,
    palette: PhaseColorScheme,
    cx: number,
    cy: number,
    bandShift: number,
  ) {
    switch (pattern) {
      case 0:
        this.drawRingField(ctx, w, h, sync, palette, cx, cy, bandShift);
        break;
      case 1:
        this.drawPrismPulse(ctx, w, h, sync, palette, cx, cy, bandShift);
        break;
      case 2:
        this.drawPlasma(ctx, w, h, sync, palette, bandShift);
        break;
      case 3:
        this.drawAuroraFlow(ctx, w, h, sync, palette, bandShift);
        break;
      case 4:
        this.drawBeams(ctx, w, h, sync, palette, bandShift);
        break;
      case 5:
        this.drawWaves(ctx, w, h, sync, palette, pattern, bandShift);
        break;
      case 6:
        this.drawNeonCascade(ctx, w, h, sync, palette, bandShift);
        break;
      case 7:
        this.drawScanlines(ctx, w, h, sync, palette, pattern, bandShift);
        break;
      case 8:
        this.drawStarburst(ctx, w, h, sync, palette, cx, cy, bandShift);
        break;
    }
  }

  private drawAmbientWash(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    sync: MusicSync,
    palette: PhaseColorScheme,
    cx: number,
    cy: number,
  ) {
    const pulse = (0.2 + sync.musicDrive * 0.26 + sync.perfectBoost * 0.24) * this.fxDrive(sync);
    const maxR = Math.max(w, h) * 0.9;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    grad.addColorStop(
      0,
      this.psyColor(this.phaseHue(sync, palette), palette.saturation, 60, pulse * 0.62, palette),
    );
    grad.addColorStop(
      0.4,
      this.psyColor(
        this.phaseHue(sync, palette, palette.hueSecondary),
        palette.saturation,
        54,
        pulse * 0.42,
        palette,
      ),
    );
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  private bandValue(i: number, shift = 0): number {
    return Math.max(0, Math.min(1.8, this.bandLevels[(i + shift) % BAND_COUNT] ?? 0));
  }

  private drawRingField(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    sync: MusicSync,
    palette: PhaseColorScheme,
    cx: number,
    cy: number,
    bandShift = 0,
  ) {
    const maxR = Math.max(w, h) * 0.78;
    const drive = this.fxDrive(sync);
    for (let i = 0; i < BAND_COUNT; i++) {
      const level = this.bandValue(i, bandShift);
      const r = 24 + (i / BAND_COUNT) * maxR * (0.45 + level * 0.85);
      const hue = this.phaseHue(sync, palette, i * 28);
      ctx.strokeStyle = this.psyColor(
        hue,
        palette.saturation,
        60,
        (0.22 + level * 0.5) * drive,
        palette,
      );
      ctx.lineWidth = 2 + level * 4 + sync.perfectBoost * 3.5;
      ctx.shadowColor = this.psyColor(hue, palette.saturation, 68, 0.75, palette);
      ctx.shadowBlur = level > 0.15 ? 12 + sync.musicDrive * 20 + sync.perfectBoost * 18 : 0;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  /** 固定プリズム扇形 — 回転なし、半径の伸縮で動き */
  private drawPrismPulse(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    sync: MusicSync,
    palette: PhaseColorScheme,
    cx: number,
    cy: number,
    bandShift = 0,
  ) {
    const maxR = Math.max(w, h) * 0.95;
    const segs = 10;
    const drive = this.fxDrive(sync);
    const flow = this.beatFlow(sync);

    ctx.save();
    ctx.translate(cx, cy);

    for (let s = 0; s < segs; s++) {
      const segAngle = (Math.PI * 2) / segs;
      const level = this.bandValue(s % BAND_COUNT, bandShift);
      const breath = 0.72 + Math.sin(this.time * 2.8 + s * 0.9) * 0.18 + flow * 0.22;
      const hue = this.phaseHue(sync, palette, s * (360 / segs));
      const r0 = maxR * 0.06;
      const r1 = maxR * (0.32 + level * 0.5) * breath;
      const a0 = segAngle * s + segAngle * 0.06;
      const a1 = segAngle * (s + 1) - segAngle * 0.06;

      ctx.fillStyle = this.psyColor(
        hue,
        palette.saturation,
        60,
        (0.18 + level * 0.42) * drive,
        palette,
      );
      ctx.shadowColor = this.psyColor(hue + 40, palette.saturation, 68, 0.55, palette);
      ctx.shadowBlur = level > 0.15 ? 10 + sync.perfectBoost * 14 : 0;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
      ctx.arc(0, 0, r1, a0, a1);
      ctx.lineTo(Math.cos(a1) * r0, Math.sin(a1) * r0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  private drawPlasma(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    sync: MusicSync,
    palette: PhaseColorScheme,
    _bandShift = 0,
  ) {
    const drive = sync.musicDrive;
    const fx = this.fxDrive(sync);
    const cols = 14;
    const rows = 10;
    const cellW = w / cols;
    const cellH = h / rows;
    const warp = 1 + drive * 0.8 + sync.perfectBoost * 0.6;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = (c + 0.5) * cellW;
        const cy = (r + 0.5) * cellH;
        const n =
          Math.sin(cx * 0.01 * warp + this.time * 2.1) +
          Math.cos(cy * 0.012 * warp - this.time * 1.7);
        const level = ((n + 2) / 4) * (0.45 + drive * 0.75);
        const hue = this.phaseHue(sync, palette, c * 24 + r * 20 + n * 35);
        const radius = Math.min(cellW, cellH) * (0.38 + level * 1.0);

        ctx.fillStyle = this.psyColor(
          hue,
          palette.saturation,
          56,
          (0.14 + level * 0.34) * fx,
          palette,
        );
        ctx.shadowColor = this.psyColor(hue, palette.saturation, 68, 0.45, palette);
        ctx.shadowBlur = level > 0.25 ? 8 + sync.perfectBoost * 10 : 0;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
  }

  /** オーロラ状の横ストリーム — 縦スクロール、中心白飛びなし */
  private drawAuroraFlow(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    sync: MusicSync,
    palette: PhaseColorScheme,
    bandShift = 0,
  ) {
    const fx = this.fxDrive(sync);
    const flow = this.beatFlow(sync);
    const strips = 11;

    for (let s = 0; s < strips; s++) {
      const level = this.bandValue(s % BAND_COUNT, bandShift);
      const hue = this.phaseHue(sync, palette, s * 34 + this.time * 18);
      const scrollY = ((this.time * (22 + s * 3.5) + s * 81) % (h + 140)) - 70;
      const stripH = 48 + level * 64 + flow * 28;
      const xOff = Math.sin(this.time * 1.1 + s * 0.9) * w * 0.05;
      const waveSkew = Math.sin(this.time * 0.8 + s) * 0.12;

      const grad = ctx.createLinearGradient(0, scrollY, 0, scrollY + stripH);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(
        0.35,
        this.psyColor(hue, palette.saturation, 56, (0.08 + level * 0.15) * fx, palette),
      );
      grad.addColorStop(
        0.65,
        this.psyColor(
          hue + palette.hueSecondary * 0.15,
          palette.saturation,
          58,
          (0.1 + level * 0.18) * fx,
          palette,
        ),
      );
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.save();
      ctx.translate(xOff, waveSkew * stripH);
      ctx.fillRect(-xOff, scrollY, w + Math.abs(xOff) * 2, stripH);
      ctx.restore();

      if (level > 0.2) {
        ctx.strokeStyle = this.psyColor(
          hue + 40,
          palette.saturation,
          62,
          (0.06 + level * 0.1) * fx,
          palette,
        );
        ctx.lineWidth = 1.5 + level * 2;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const wy =
            scrollY + stripH * 0.35 + Math.sin(x * 0.012 + this.time * 2 + s) * (8 + level * 14);
          if (x === 0) ctx.moveTo(x, wy);
          else ctx.lineTo(x, wy);
        }
        ctx.stroke();
      }
    }
  }

  private drawBeams(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    sync: MusicSync,
    palette: PhaseColorScheme,
    bandShift = 0,
  ) {
    const bands = 14;
    const thickBase = 10 + sync.musicDrive * 28 + sync.perfectBoost * 22;
    const fx = this.fxDrive(sync);

    for (let i = 0; i < bands; i++) {
      const level = this.bandValue(i, bandShift);
      const hue = this.phaseHue(sync, palette, i * 26);
      const y = (i + 0.5) * (h / bands);
      const thick = thickBase * (0.5 + level * 0.65);
      const phase = Math.sin(this.time * 4 + i * 0.7) * thick * 0.28;
      const grad = ctx.createLinearGradient(0, y, w, y);
      grad.addColorStop(0, this.psyColor(hue, palette.saturation, 58, 0, palette));
      grad.addColorStop(
        0.35,
        this.psyColor(hue + 30, palette.saturation, 62, (0.32 + level * 0.42) * fx, palette),
      );
      grad.addColorStop(
        0.65,
        this.psyColor(hue + 60, palette.saturation, 64, (0.32 + level * 0.42) * fx, palette),
      );
      grad.addColorStop(1, this.psyColor(hue + 90, palette.saturation, 58, 0, palette));
      const beamAlpha = (0.32 + level * 0.45 + sync.perfectBoost * 0.25) * fx;
      ctx.fillStyle = grad;
      ctx.globalAlpha *= beamAlpha;
      ctx.fillRect(0, y - thick * 0.5 + phase, w, thick);
      ctx.globalAlpha /= beamAlpha;
    }
  }

  private drawWaves(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    sync: MusicSync,
    palette: PhaseColorScheme,
    pattern: number,
    bandShift = 0,
  ) {
    const lines = 14;
    const step = 8;
    const drive = this.patternDrive(sync, pattern);
    const ampBase = (16 + sync.accuracy * 38 + sync.hitBoost * 26 + sync.perfectBoost * 10) * drive;

    for (let l = 0; l < lines; l++) {
      const bandIdx = Math.floor((l / lines) * BAND_COUNT);
      const level = this.bandValue(bandIdx, bandShift);
      const amp = ampBase * (0.5 + level);
      const baseY = (l + 0.5) * (h / lines);
      const hue = this.phaseHue(sync, palette, l * 16);

      ctx.strokeStyle = this.psyColor(hue, palette.saturation, 60, 0.28 + level * 0.5, palette);
      ctx.lineWidth = 2 + level * 3;
      if (l % 3 === 0 && level > 0.12) {
        ctx.shadowColor = this.psyColor(hue + 30, palette.saturation, 68, 0.45, palette);
        ctx.shadowBlur = this.cappedShadow(level);
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.beginPath();
      for (let px = 0; px <= w; px += step) {
        const t = this.time * (2.2 + l * 0.15) + px * 0.022;
        const y = baseY + Math.sin(t) * amp + Math.sin(t * 2.3) * amp * 0.35;
        if (px === 0) ctx.moveTo(px, y);
        else ctx.lineTo(px, y);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  /** 縦ネオンの光の滝 — サイドマージン向け（イコライザー代替） */
  private drawNeonCascade(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    sync: MusicSync,
    palette: PhaseColorScheme,
    bandShift = 0,
  ) {
    const cols = Math.max(5, Math.min(10, Math.floor(w / 28)));
    const colW = w / cols;
    const fx = this.fxDrive(sync);
    const flow = this.beatFlow(sync);
    const boost = sync.perfectBoost;

    for (let c = 0; c < cols; c++) {
      const bandIdx = Math.floor((c / cols) * BAND_COUNT);
      const level = this.bandValue(bandIdx, bandShift);
      const hue = this.phaseHue(sync, palette, c * 38 + this.time * 22);
      const cx = (c + 0.5) * colW;
      const pillarW = colW * (0.42 + level * 0.22);
      const hFrac = Math.min(0.92, 0.18 + level * 0.72 + flow * 0.08 + boost * 0.06);
      const pillarH = h * hFrac;
      const y = h - pillarH;
      const wobble = Math.sin(this.time * 3.5 + c * 1.3) * colW * 0.06;

      const grad = ctx.createLinearGradient(cx, y, cx, h);
      grad.addColorStop(
        0,
        this.psyColor(hue + 40, palette.saturation, 78, (0.45 + level * 0.35) * fx, palette),
      );
      grad.addColorStop(
        0.35,
        this.psyColor(hue + 15, palette.saturation, 66, (0.28 + level * 0.38) * fx, palette),
      );
      grad.addColorStop(
        0.75,
        this.psyColor(hue, palette.saturation, 58, (0.14 + level * 0.28) * fx, palette),
      );
      grad.addColorStop(
        1,
        this.psyColor(hue - 25, palette.saturation, 48, (0.04 + level * 0.12) * fx, palette),
      );
      ctx.fillStyle = grad;
      ctx.shadowColor = this.psyColor(hue + 50, palette.saturation, 72, 0.7, palette);
      ctx.shadowBlur = 8 + level * 16 + boost * 8;
      ctx.fillRect(cx - pillarW * 0.5 + wobble, y, pillarW, pillarH);

      if (level > 0.2) {
        const coreW = pillarW * 0.35;
        const coreGrad = ctx.createLinearGradient(cx, y, cx, h);
        coreGrad.addColorStop(
          0,
          this.psyColor(hue + 70, palette.saturation, 82, (0.35 + level * 0.3) * fx, palette),
        );
        coreGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = coreGrad;
        ctx.fillRect(cx - coreW * 0.5 + wobble, y, coreW, pillarH * 0.85);
      }

      const dripCount = 2 + Math.floor(level * 3);
      for (let d = 0; d < dripCount; d++) {
        const phase = (this.time * (1.8 + c * 0.2) + d * 1.7) % 1;
        const dy = h - phase * h * (0.55 + level * 0.35);
        const dropR = 2 + level * 4;
        ctx.fillStyle = this.psyColor(
          hue + 55,
          palette.saturation,
          76,
          (0.25 + level * 0.35) * (1 - phase) * fx,
          palette,
        );
        ctx.beginPath();
        ctx.arc(cx + wobble + Math.sin(phase * 6) * 4, dy, dropR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.globalAlpha *= 0.22 + flow * 0.12;
    for (let c = 0; c < cols; c++) {
      const level = this.bandValue(Math.floor((c / cols) * BAND_COUNT), bandShift);
      const hue = this.phaseHue(sync, palette, c * 38);
      const cx = (c + 0.5) * colW;
      const rippleY = h - ((this.time * (90 + c * 12)) % (h * 0.7)) - h * 0.05;
      const rippleH = 18 + level * 28;
      const grad = ctx.createLinearGradient(0, rippleY, 0, rippleY + rippleH);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(
        0.5,
        this.psyColor(hue, palette.saturation, 64, 0.35 + level * 0.4, palette),
      );
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - colW * 0.45, rippleY, colW * 0.9, rippleH);
    }
    ctx.restore();
  }

  private drawScanlines(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    sync: MusicSync,
    palette: PhaseColorScheme,
    pattern: number,
    bandShift = 0,
  ) {
    const drive = this.patternDrive(sync, pattern);
    const flow = this.beatFlow(sync);
    const gap = 4;
    const scroll = (this.time * 140 + sync.beatPhase * gap) % gap;

    for (let yi = 0, y = -gap; y < h + gap; y += gap, yi++) {
      const bandIdx = Math.floor((y / h) * BAND_COUNT);
      const level = this.bandValue(bandIdx, bandShift);
      const alpha = (0.22 + level * 0.4 + sync.perfectBoost * 0.08) * drive;
      const hue = this.phaseHue(sync, palette, y * 0.1 + this.time * 25);
      const lineH = 2.5 + level * 3 + flow * 1.5;
      const glow = yi % 5 === 0;
      ctx.shadowBlur = glow ? this.cappedShadow(level, 2) : 0;
      if (glow) {
        ctx.shadowColor = this.psyColor(hue + 40, palette.saturation, 72, 0.7, palette);
      }
      ctx.fillStyle = this.psyColor(hue, palette.saturation, 64, alpha, palette);
      ctx.fillRect(0, y + scroll, w, lineH);
    }
    ctx.shadowBlur = 0;

    ctx.save();
    const diagCount = 5;
    for (let d = 0; d < diagCount; d++) {
      const level = this.bandValue(d * 2, bandShift);
      const hue = this.phaseHue(sync, palette, d * 48 + this.time * 30);
      const offset = ((this.time * 90 + d * 80) % (w + h)) - h;
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(
        0.45,
        this.psyColor(hue, palette.saturation, 66, (0.1 + level * 0.24) * drive, palette),
      );
      grad.addColorStop(
        0.55,
        this.psyColor(hue + 60, palette.saturation, 70, (0.14 + level * 0.28) * drive, palette),
      );
      grad.addColorStop(1, 'transparent');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 12 + level * 14;
      ctx.beginPath();
      ctx.moveTo(offset, 0);
      ctx.lineTo(offset + h, h);
      ctx.stroke();
    }
    ctx.restore();

    for (let b = 0; b < 4; b++) {
      const bandY = ((this.time * (38 + b * 11) + b * h * 0.19) % (h + 100)) - 50;
      const level = this.bandValue(b * 2, bandShift);
      const hue = this.phaseHue(sync, palette, b * 55 + this.time * 12);
      const bandGrad = ctx.createLinearGradient(0, bandY - 18, 0, bandY + 18);
      bandGrad.addColorStop(0, 'transparent');
      bandGrad.addColorStop(
        0.5,
        this.psyColor(hue, palette.saturation, 66, (0.12 + level * 0.2) * drive, palette),
      );
      bandGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = bandGrad;
      ctx.fillRect(0, bandY - 20, w, 40);
    }

    const sweepY = ((this.time * 0.65) % 1) * h;
    const sweepH = 110 + sync.musicDrive * 50 + sync.perfectBoost * 24;
    const sweepGrad = ctx.createLinearGradient(0, sweepY - sweepH, 0, sweepY + sweepH);
    sweepGrad.addColorStop(0, 'transparent');
    sweepGrad.addColorStop(
      0.5,
      this.psyColor(
        this.phaseHue(sync, palette, palette.hueAccent + this.time * 50),
        palette.saturation,
        74,
        (0.24 + sync.perfectBoost * 0.14) * drive,
        palette,
      ),
    );
    sweepGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = sweepGrad;
    ctx.fillRect(0, 0, w, h);
  }

  private drawStarburst(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    sync: MusicSync,
    palette: PhaseColorScheme,
    cx: number,
    cy: number,
    bandShift = 0,
  ) {
    const rays = 20;
    const maxLen = Math.max(w, h) * 0.78;
    const fx = this.fxDrive(sync);
    const flow = this.beatFlow(sync);

    ctx.save();
    ctx.translate(cx, cy);

    for (let i = 0; i < rays; i++) {
      const level = this.bandValue(i % BAND_COUNT, bandShift);
      const ang = (Math.PI * 2 * i) / rays;
      const pulse = 0.75 + Math.sin(this.time * 3.2 + i * 0.55) * 0.2 + flow * 0.15;
      const len = maxLen * (0.5 + level * 0.55) * pulse;
      const hue = this.phaseHue(sync, palette, i * 22);
      const grad = ctx.createLinearGradient(0, 0, Math.cos(ang) * len, Math.sin(ang) * len);
      grad.addColorStop(
        0,
        this.psyColor(
          hue,
          palette.saturation,
          66,
          (0.32 + level * 0.45 + sync.perfectBoost * 0.18) * fx,
          palette,
        ),
      );
      grad.addColorStop(1, 'transparent');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.5 + level * 5 + sync.perfectBoost * 4;
      ctx.shadowColor = this.psyColor(hue + 40, palette.saturation, 72, 0.7, palette);
      ctx.shadowBlur = 8 + level * 10 + sync.perfectBoost * 14;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    // 中心コアグロー
    const coreR = Math.min(w, h) * (0.12 + sync.musicDrive * 0.08 + sync.perfectBoost * 0.06);
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    coreGrad.addColorStop(
      0,
      this.psyColor(
        this.phaseHue(sync, palette, this.time * 60),
        palette.saturation,
        78,
        0.55 * fx,
        palette,
      ),
    );
    coreGrad.addColorStop(
      0.45,
      this.psyColor(this.phaseHue(sync, palette, 80), palette.saturation, 70, 0.22 * fx, palette),
    );
    coreGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawHitOverlay(
    ctx: CanvasRenderingContext2D,
    panel: SidePanel,
    sync: MusicSync,
    palette: PhaseColorScheme,
    pattern: number,
  ) {
    const cx = panel.w * 0.5;
    const cy = panel.h * 0.5;
    if (this.bursts.length > 0 || sync.perfectBoost > 0.04 || sync.hitBoost > 0.06) {
      this.drawHitBursts(ctx, panel.w, panel.h, sync, palette, cx, cy, pattern, panel);
    }
    if (this.usesRingHitFx(pattern) && this.rings.length > 0) {
      this.drawAnimatedRings(ctx, sync, palette, panel);
    }
  }

  private drawAnimatedRings(
    ctx: CanvasRenderingContext2D,
    sync: MusicSync,
    palette: PhaseColorScheme,
    panel: SidePanel,
  ) {
    for (const ring of this.rings) {
      const lx = ring.x - panel.x;
      const ly = ring.y - panel.y;
      if (lx < -ring.r - 8 || lx > panel.w + ring.r + 8) continue;
      if (ly < -ring.r - 8 || ly > panel.h + ring.r + 8) continue;
      const alpha = ring.life * (0.65 + sync.perfectBoost * 0.3);
      ctx.strokeStyle = this.psyColor(
        ring.hue + palette.hueBase * 0.1,
        palette.saturation,
        64,
        alpha,
        palette,
      );
      ctx.lineWidth = 3 + sync.musicDrive * 6 + sync.perfectBoost * 10;
      ctx.shadowColor = this.psyColor(ring.hue, palette.saturation, 68, 0.95, palette);
      ctx.shadowBlur = 18 + sync.perfectBoost * 42 + sync.musicDrive * 22;
      ctx.beginPath();
      ctx.arc(lx, ly, ring.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  private drawHitBursts(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    sync: MusicSync,
    palette: PhaseColorScheme,
    cx: number,
    cy: number,
    pattern: number,
    panel: SidePanel,
  ) {
    const light = this.usesLightHitOverlay(pattern);
    const burstAlpha = Math.min(1, 0.55 + sync.perfectBoost * 0.45 + sync.hitBoost * 0.5);
    const fx = light ? 1 + sync.hitBoost * 0.15 : this.fxDrive(sync);

    for (const b of this.bursts) {
      const lx = b.x - panel.x;
      const ly = b.y - panel.y;
      if (lx < -80 || lx > panel.w + 80 || ly < -80 || ly > panel.h + 80) continue;
      const arms = light ? 4 : sync.perfectBoost > 0.5 ? 10 : 6;
      const len =
        (light ? 36 : 50) +
        sync.perfectBoost * (light ? 70 : 160) +
        sync.hitBoost * (light ? 40 : 80) * fx;
      ctx.strokeStyle = this.psyColor(
        b.hue + palette.hueAccent * 0.15,
        palette.saturation,
        72,
        b.life * burstAlpha,
        palette,
      );
      ctx.lineWidth = light
        ? 2 + sync.hitBoost * 1.5
        : 2.5 + sync.perfectBoost * 6 + sync.hitBoost * 2.5;
      if (!light) {
        ctx.shadowColor = this.psyColor(b.hue + 60, palette.saturation, 78, 0.9, palette);
        ctx.shadowBlur = 16 + sync.perfectBoost * 36 + sync.hitBoost * 22;
      }
      for (let a = 0; a < arms; a++) {
        const ang = b.angle + (Math.PI * 2 * a) / arms;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + Math.cos(ang) * len * b.life, ly + Math.sin(ang) * len * b.life);
        ctx.stroke();
      }
    }

    if (!light && (sync.perfectBoost > 0.06 || sync.hitBoost > 0.1)) {
      const drive = Math.max(sync.perfectBoost, sync.hitBoost * 0.85) * fx;
      const base = Math.min(w, h) * 0.38 * drive;
      const hue = this.phaseHue(sync, palette, this.time * 40);

      for (let i = 0; i < 3; i++) {
        const pulse = 0.82 + Math.sin(this.time * 7 + i * 1.4) * 0.18;
        const size = base * (0.55 + i * 0.28) * pulse;
        const alpha = drive * (0.32 - i * 0.07);
        ctx.strokeStyle = this.psyColor(hue + i * 25, palette.saturation, 74, alpha, palette);
        ctx.lineWidth = 2.5 + drive * 3.5 - i * 0.6;
        ctx.shadowColor = this.psyColor(hue + 40, palette.saturation, 78, 0.75, palette);
        ctx.shadowBlur = 14 + sync.perfectBoost * 28 - i * 4;
        ctx.beginPath();
        ctx.rect(cx - size, cy - size, size * 2, size * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - size, cy);
        ctx.lineTo(cx + size, cy);
        ctx.moveTo(cx, cy - size);
        ctx.lineTo(cx, cy + size);
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
  }

  static computeAccuracy(stats: GameStats): number {
    const total = stats.perfect + stats.great + stats.good + stats.bad + stats.miss;
    if (total === 0) return 0.5;
    return (stats.perfect + stats.great * 0.7 + stats.good * 0.4) / total;
  }

  static computeAccuracyTier(stats: GameStats): 0 | 80 | 90 | 95 {
    const acc = SideStageFX.computeAccuracy(stats);
    if (acc >= 0.95) return 95;
    if (acc >= 0.9) return 90;
    if (acc >= 0.8) return 80;
    return 0;
  }

  static buildSync(
    currentTime: number,
    chart: ChartData,
    stats: GameStats,
    pulse: number,
    audio: AudioReactive,
    hitBoost: number,
    perfectBoost: number,
    hue: number,
  ): MusicSync {
    const beatDur = 60 / chart.bpm;
    const beat = (currentTime - chart.offset) / beatDur;
    const beatPhase = beat - Math.floor(beat);
    const base: MusicSync = {
      currentTime,
      bpm: chart.bpm,
      beat: Math.max(0, beat),
      beatPhase,
      combo: stats.combo,
      pulse,
      accuracy: SideStageFX.computeAccuracy(stats),
      accuracyTier: SideStageFX.computeAccuracyTier(stats),
      hitBoost,
      perfectBoost,
      musicDrive: 0,
      hue,
      audio,
    };
    const a = audio;
    const beatFlow = Math.sin(beatPhase * Math.PI);
    const avg = audio.bands.reduce((s, v) => s + v, 0) / Math.max(1, audio.bands.length);
    base.musicDrive = Math.min(
      2.2,
      a.energy * 1.8 +
        a.bass * 1.1 +
        a.vocal * 1.2 +
        a.spike * 1.6 +
        avg * 0.9 +
        beatFlow * 0.55 +
        hitBoost * 0.5 +
        perfectBoost * 0.4,
    );
    return base;
  }
}
