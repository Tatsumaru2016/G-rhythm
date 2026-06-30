import { menuBackgroundFps, useLiteMenuBackground } from '../perf/webPerf';
import { MenuCanvasLoop } from './menuCanvasLoop';

const INTRO_SEC = 2.5;
const BASE_FILL = '#080112';
const TOTAL_LANES = 12;

interface NebulaOrb {
  color: string;
  xMotion: (time: number, w: number) => number;
  yMotion: (time: number, h: number) => number;
}

const NEBULA_ORBS: NebulaOrb[] = [
  {
    color: '#ff007f',
    xMotion: (time, w) => Math.sin(time * 0.5) * (w * 0.2),
    yMotion: (time, h) => Math.cos(time * 0.4) * (h * 0.15),
  },
  {
    color: '#00f3ff',
    xMotion: (time, w) => Math.cos(time * 0.4) * (w * 0.22),
    yMotion: (time, h) => Math.sin(time * 0.6) * (h * 0.12),
  },
  {
    color: '#7a00ff',
    xMotion: (time, w) => -Math.cos(time * 0.3) * (w * 0.18),
    yMotion: (time, h) => -Math.cos(time * 0.5) * (h * 0.18),
  },
  {
    color: '#ffaa00',
    xMotion: (time, w) => Math.sin(time * 0.8) * (w * 0.12),
    yMotion: (time, h) => -Math.sin(time * 0.6) * (h * 0.1),
  },
];

class RhythmNote {
  private lane = 0;
  private z = 0;
  private speed = 0.006;
  private cyan = true;
  private lengthFactor = 1;

  constructor(
    private readonly maxLanes: number,
    scatter = false,
  ) {
    this.init(scatter);
  }

  private init(scatter = false): void {
    this.lane = Math.floor(Math.random() * this.maxLanes) - Math.floor(this.maxLanes / 2);
    this.z = scatter ? Math.random() : 0;
    this.speed = Math.random() * 0.007 + 0.005;
    this.cyan = Math.random() > 0.4;
    this.lengthFactor = Math.random() * 0.6 + 0.4;
  }

  updateAndDraw(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    cx: number,
    horizon: number,
    ease: number,
    flashScale: number,
  ): void {
    this.z += this.speed;
    if (this.z > 1) this.init();

    const p = this.z ** 3;
    const y = horizon + p * (h - horizon);
    const laneWidthAtBottom = w * 0.08;
    const xBottom = cx + this.lane * laneWidthAtBottom;
    const x = cx + p * (xBottom - cx);
    const noteW = (50 * p + 8) * this.lengthFactor;
    const noteH = 6 * p + 2;
    const alpha = Math.min(1, p * 2.5) * ease * flashScale;
    const color = this.cyan ? '#00f3ff' : '#ff007f';

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `${color}${Math.floor(alpha * 255).toString(16).padStart(2, '0')}`;
    ctx.shadowBlur = (20 * p + 5) * flashScale;
    ctx.shadowColor = color;
    ctx.fillRect(x - noteW / 2, y - noteH / 2, noteW, noteH);
    ctx.restore();
  }
}

function easeOutQuart(t: number): number {
  return 1 - (1 - t) ** 4;
}

export class TitleScreenBackground {
  private host: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private loop = new MenuCanvasLoop(menuBackgroundFps(), (dt) => this.onFrame(dt));
  private readonly lite = useLiteMenuBackground();
  private t = 0;
  private reducedFlash = false;
  private rhythmNotes: RhythmNote[] = [];
  private readonly onResize = () => this.resize();

  setReducedFlash(enabled: boolean): void {
    this.reducedFlash = enabled;
    this.initRhythmNotes();
  }

  mount(host: HTMLElement): void {
    this.unmount();
    this.host = host;
    host.innerHTML = '';

    const canvas = document.createElement('canvas');
    canvas.className = 'title-bg-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.t = 0;
    this.resize();
    window.addEventListener('resize', this.onResize);
    this.loop.start();
  }

  unmount(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.onResize);
    this.host?.replaceChildren();
    this.host = null;
    this.canvas = null;
    this.ctx = null;
    this.rhythmNotes = [];
  }

  private resize(): void {
    if (!this.canvas || !this.host) return;
    const rect = this.host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.lite ? 1.5 : 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.initRhythmNotes();
  }

  private initRhythmNotes(): void {
    const count = this.lite ? 8 : (this.reducedFlash ? 10 : 14);
    this.rhythmNotes = Array.from(
      { length: count },
      () => new RhythmNote(TOTAL_LANES, true),
    );
  }

  private onFrame(dt: number): void {
    this.t += dt * (this.reducedFlash ? 0.75 : 1);
    this.tick();
  }

  private tick(): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w <= 0 || h <= 0) return;

    const time = this.t;
    const ease = easeOutQuart(Math.min(time / INTRO_SEC, 1));
    const flashScale = this.reducedFlash ? 0.55 : 1;
    const cx = w / 2;
    const cy = h / 2;
    const currentRadius = Math.min(w, h) * 0.26 * ease;
    const horizon = cy + currentRadius * 0.1;

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = BASE_FILL;
    ctx.fillRect(0, 0, w, h);

    this.drawNebulaOrbs(ctx, w, h, cx, cy, time, flashScale);

    ctx.globalCompositeOperation = 'screen';
    this.drawCenterMask(ctx, cx, cy, currentRadius, flashScale);

    ctx.globalCompositeOperation = 'lighter';
    this.drawGrid(ctx, w, h, cx, horizon, time, flashScale);
    for (const note of this.rhythmNotes) {
      note.updateAndDraw(ctx, w, h, cx, horizon, ease, flashScale);
    }
    this.drawNeonRibbon(ctx, w, cx, cy, currentRadius, time, ease, flashScale);
    this.drawCyberRings(ctx, cx, cy, currentRadius, time, flashScale);
    if (!this.reducedFlash) {
      this.drawPulse(ctx, cx, cy, w, h, time, ease, flashScale);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
  }

  private drawNebulaOrbs(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    cx: number,
    cy: number,
    time: number,
    flashScale: number,
  ): void {
    const orbRadius = Math.max(w, h) * 0.35;
    const orbCount = this.lite ? 3 : NEBULA_ORBS.length;

    for (let index = 0; index < orbCount; index++) {
      const orb = NEBULA_ORBS[index];
      const x = cx + orb.xMotion(time, w);
      const y = cy + orb.yMotion(time, h);

      if (this.reducedFlash || this.lite) {
        ctx.globalCompositeOperation = 'screen';
      } else {
        ctx.globalCompositeOperation = index % 2 === 0 ? 'difference' : 'screen';
      }

      const grad = ctx.createRadialGradient(x, y, 0, x, y, orbRadius);
      grad.addColorStop(0, orb.color);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.globalAlpha = flashScale;
      ctx.beginPath();
      ctx.arc(x, y, orbRadius * 1.3, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  private drawCenterMask(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    currentRadius: number,
    flashScale: number,
  ): void {
    if (currentRadius <= 0) return;

    ctx.globalCompositeOperation = 'source-over';
    const centerMask = ctx.createRadialGradient(cx, cy, 0, cx, cy, currentRadius * 1.8);
    const inner = 0.75 * flashScale;
    centerMask.addColorStop(0, `rgba(5, 2, 14, ${inner})`);
    centerMask.addColorStop(0.6, `rgba(5, 2, 14, ${0.4 * flashScale})`);
    centerMask.addColorStop(1, 'rgba(5, 2, 14, 0)');

    ctx.beginPath();
    ctx.arc(cx, cy, currentRadius * 2, 0, Math.PI * 2);
    ctx.fillStyle = centerMask;
    ctx.fill();
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    cx: number,
    horizon: number,
    time: number,
    flashScale: number,
  ): void {
    const gridAlpha = (this.lite ? 0.7 : 1) * flashScale;

    ctx.save();
    const gridGradient = ctx.createLinearGradient(0, horizon, 0, h);
    gridGradient.addColorStop(0, 'rgba(0, 243, 255, 0)');
    gridGradient.addColorStop(0.1, `rgba(255, 0, 127, ${0.25 * gridAlpha})`);
    gridGradient.addColorStop(1, `rgba(255, 170, 0, ${gridAlpha})`);

    ctx.strokeStyle = gridGradient;
    ctx.lineWidth = this.lite ? 1 : 1.5;

    const moveOffset = (time * 2.5) % 1;
    const numHlines = this.lite ? 12 : 20;
    for (let i = 0; i < numHlines; i++) {
      const p = (i + moveOffset) / numHlines;
      const y = horizon + (p ** 3.5) * (h - horizon);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const laneWidthAtBottom = w * 0.08;
    const halfLanes = Math.floor(TOTAL_LANES / 2);
    for (let i = -halfLanes; i <= halfLanes; i++) {
      const xBottom = cx + i * laneWidthAtBottom;
      ctx.beginPath();
      ctx.moveTo(cx, horizon);
      ctx.lineTo(xBottom, h);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawNeonRibbon(
    ctx: CanvasRenderingContext2D,
    w: number,
    cx: number,
    cy: number,
    currentRadius: number,
    time: number,
    ease: number,
    flashScale: number,
  ): void {
    const freq = 0.008;
    const baseAmp = currentRadius * 0.85;
    const step = this.lite ? 12 : 8;
    const halfThickness = this.lite ? 14 : 18;
    const yJitter = this.lite ? 8 : 12;

    const waveY = (x: number): number => {
      const envelope = Math.max(0, 1 - Math.abs(x - cx) / (w * 0.55));
      const yOffset = Math.sin(x * 0.02 + time * 5) * yJitter;
      return cy + Math.sin(x * freq + time * 3) * baseAmp * envelope * ease + yOffset;
    };

    ctx.save();
    ctx.shadowBlur = 25 * flashScale;
    ctx.shadowColor = '#00f3ff';
    ctx.beginPath();

    for (let x = 0; x <= w; x += step) {
      const y = waveY(x);
      if (x === 0) ctx.moveTo(x, y - halfThickness);
      else ctx.lineTo(x, y - halfThickness);
    }
    for (let x = w; x >= 0; x -= step) {
      ctx.lineTo(x, waveY(x) + halfThickness);
    }
    ctx.closePath();

    const waveGrad = ctx.createLinearGradient(0, 0, w, 0);
    waveGrad.addColorStop(0.1, 'rgba(0, 243, 255, 0)');
    waveGrad.addColorStop(0.3, `rgba(0, 243, 255, ${0.6 * flashScale})`);
    waveGrad.addColorStop(0.5, `rgba(255, 0, 127, ${0.8 * flashScale})`);
    waveGrad.addColorStop(0.7, `rgba(0, 243, 255, ${0.6 * flashScale})`);
    waveGrad.addColorStop(0.9, 'rgba(0, 243, 255, 0)');
    ctx.fillStyle = waveGrad;
    ctx.fill();
    ctx.restore();
  }

  private drawCyberRings(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    time: number,
    flashScale: number,
  ): void {
    if (radius <= 0) return;

    const speedScale = this.reducedFlash ? 0.45 : 1;

    ctx.save();
    ctx.shadowBlur = 30 * flashScale;
    ctx.shadowColor = '#ff007f';
    ctx.lineWidth = this.lite ? 3 : 4;
    ctx.strokeStyle = '#ff007f';

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.setLineDash([60, 30, 10, 30]);
    ctx.lineDashOffset = -time * 40 * speedScale;
    ctx.stroke();

    ctx.lineWidth = this.lite ? 1.5 : 2;
    ctx.strokeStyle = '#00f3ff';
    ctx.shadowColor = '#00f3ff';
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.88, 0, Math.PI * 2);
    ctx.setLineDash([10, 15]);
    ctx.lineDashOffset = time * 80 * speedScale;
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 * flashScale})`;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.85, 0, Math.PI * 2);
    ctx.setLineDash([]);
    ctx.stroke();
    ctx.restore();
  }

  private drawPulse(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    w: number,
    h: number,
    time: number,
    ease: number,
    flashScale: number,
  ): void {
    const pulseMax = Math.min(w, h) * 0.8;
    const pulseRadius = (time * 220) % pulseMax;
    const pulseAlpha = Math.max(0, 0.6 - pulseRadius / pulseMax) * ease * flashScale;

    ctx.beginPath();
    ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(0, 243, 255, ${pulseAlpha})`;
    ctx.shadowBlur = 0;
    ctx.stroke();
  }
}
