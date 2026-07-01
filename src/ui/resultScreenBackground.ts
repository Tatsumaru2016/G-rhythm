import { menuBackgroundFps, useLiteMenuBackground } from '../perf/webPerf';
import { CosmicWarpBackground } from './cosmicWarpBackground';
import { MenuCanvasLoop } from './menuCanvasLoop';

const NORMAL_WARP_SPEED = 1.12;
const ENTRANCE_WARP_SPEED = 24;
const ENTRANCE_WARP_SPEED_REDUCED = 10;
const ENTRANCE_BURST_SEC = 1.75;

interface ResultSpark {
  angle: number;
  dist: number;
  speed: number;
  size: number;
  hue: number;
}

interface PulseRing {
  radius: number;
  speed: number;
  alpha: number;
  hue: number;
}

export class ResultScreenBackground {
  private host: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private warp: CosmicWarpBackground | null = null;
  private readonly loop = new MenuCanvasLoop(menuBackgroundFps(), (dt) => this.onFrame(dt));
  private readonly lite = useLiteMenuBackground();
  private t = 0;
  private burstTimer = 0;
  private reducedFlash = false;
  private sparks: ResultSpark[] = [];
  private rings: PulseRing[] = [];
  private readonly onResize = () => this.resize();
  private resizeObserver: ResizeObserver | null = null;
  private observedScreen: HTMLElement | null = null;

  setReducedFlash(enabled: boolean): void {
    this.reducedFlash = enabled;
    this.applyParticleBudget();
    this.initFx();
  }

  mount(host: HTMLElement): void {
    this.unmount();
    this.host = host;
    host.innerHTML = '';

    const canvas = document.createElement('canvas');
    canvas.className = 'result-bg-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.t = 0;
    this.burstTimer = ENTRANCE_BURST_SEC;
    this.initFx();
    this.resize();
    if (this.warp) {
      this.warp.warpSpeedMultiplier = this.reducedFlash ? ENTRANCE_WARP_SPEED_REDUCED : ENTRANCE_WARP_SPEED;
    }
    window.addEventListener('resize', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize);
    this.observedScreen = this.host.closest('.result-screen') as HTMLElement | null;
    if (this.observedScreen && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.observedScreen);
    }
    requestAnimationFrame(() => {
      this.resize();
      requestAnimationFrame(() => this.resize());
    });
    this.loop.start();
  }

  unmount(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.observedScreen = null;
    this.host?.replaceChildren();
    this.host = null;
    this.canvas = null;
    this.ctx = null;
    this.warp = null;
    this.sparks = [];
    this.rings = [];
    this.burstTimer = 0;
  }

  private particleCount(): number {
    if (this.lite) return 120;
    if (this.reducedFlash) return 160;
    return 240;
  }

  private applyParticleBudget(): void {
    this.warp?.setMaxParticles(this.particleCount());
  }

  private initFx(): void {
    const sparkCount = this.lite ? 28 : (this.reducedFlash ? 36 : 64);
    this.sparks = Array.from({ length: sparkCount }, () => ({
      angle: Math.random() * Math.PI * 2,
      dist: Math.random() * 0.35,
      speed: 0.08 + Math.random() * 0.18,
      size: 1.4 + Math.random() * 3.2,
      hue: Math.random() * 360,
    }));

    const ringCount = this.lite ? 4 : (this.reducedFlash ? 5 : 7);
    this.rings = Array.from({ length: ringCount }, (_, i) => ({
      radius: i * 0.14,
      speed: 0.16 + i * 0.028,
      alpha: 0.42 + Math.random() * 0.28,
      hue: (i * 52 + Math.random() * 40) % 360,
    }));
  }

  private viewportSize(): { w: number; h: number } {
    const screen = this.host?.closest('.result-screen') as HTMLElement | null;
    const rect = screen?.getBoundingClientRect() ?? this.host?.getBoundingClientRect();
    const vv = window.visualViewport;
    const w = Math.max(
      1,
      Math.ceil(rect?.width ?? 0),
      Math.ceil(vv?.width ?? window.innerWidth),
      Math.ceil(window.innerWidth),
    );
    const h = Math.max(
      1,
      Math.ceil(rect?.height ?? 0),
      Math.ceil(vv?.height ?? window.innerHeight),
      Math.ceil(window.innerHeight),
    );
    return { w, h };
  }

  private resize(): void {
    if (!this.canvas || !this.host) return;
    const { w: fallbackW, h: fallbackH } = this.viewportSize();
    const displayW = Math.max(1, this.host.clientWidth || fallbackW);
    const displayH = Math.max(1, this.host.clientHeight || fallbackH);
    const dpr = Math.min(window.devicePixelRatio || 1, this.lite ? 1.5 : 2);

    this.canvas.width = Math.max(1, Math.floor(displayW * dpr));
    this.canvas.height = Math.max(1, Math.floor(displayH * dpr));
    this.canvas.style.removeProperty('width');
    this.canvas.style.removeProperty('height');
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!this.warp) {
      this.warp = new CosmicWarpBackground(displayW, displayH, this.particleCount());
    } else {
      this.warp.resize(displayW, displayH);
      this.applyParticleBudget();
    }
    this.initFx();
  }

  private onFrame(dt: number): void {
    this.t += dt;
    const flashScale = this.reducedFlash ? 0.55 : 1;

    if (this.burstTimer > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0 && this.warp) {
        this.warp.warpSpeedMultiplier = NORMAL_WARP_SPEED;
      }
    }

    const maxDist = 1.2;
    for (const spark of this.sparks) {
      spark.dist += spark.speed * dt * flashScale;
      if (spark.dist > maxDist) {
        spark.dist = 0;
        spark.angle = Math.random() * Math.PI * 2;
        spark.hue = Math.random() * 360;
      }
    }

    for (const ring of this.rings) {
      ring.radius += ring.speed * dt * flashScale;
      ring.hue = (ring.hue + dt * 28) % 360;
      if (ring.radius > 1.08) ring.radius = 0;
    }

    this.render(dt);
  }

  private render(dt: number): void {
    const ctx = this.ctx;
    const warp = this.warp;
    if (!ctx || !warp) return;

    const w = this.canvas?.clientWidth ?? 0;
    const h = this.canvas?.clientHeight ?? 0;
    if (w <= 0 || h <= 0) return;

    warp.update(dt);
    warp.draw(ctx);

    const flashScale = this.reducedFlash ? 0.55 : 1;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const maxR = Math.hypot(
      Math.max(cx, w - cx),
      Math.max(cy, h - cy),
    ) * 1.12;

    this.drawCelebrationWash(ctx, cx, cy, w, h, flashScale);
    this.drawPulseRings(ctx, cx, cy, maxR, flashScale);
    this.drawSparks(ctx, cx, cy, maxR, flashScale);
    this.drawRotatingRays(ctx, cx, cy, maxR, flashScale);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawCelebrationWash(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    w: number,
    h: number,
    flashScale: number,
  ): void {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(cx, cy);
    ctx.rotate(this.t * (this.reducedFlash ? 0.06 : 0.14));
    const spin = ctx.createConicGradient(0, 0, 0);
    spin.addColorStop(0, `rgba(255, 45, 154, ${0.2 * flashScale})`);
    spin.addColorStop(0.17, `rgba(0, 243, 255, ${0.18 * flashScale})`);
    spin.addColorStop(0.34, `rgba(157, 0, 255, ${0.22 * flashScale})`);
    spin.addColorStop(0.52, `rgba(255, 230, 0, ${0.16 * flashScale})`);
    spin.addColorStop(0.68, `rgba(0, 255, 136, ${0.18 * flashScale})`);
    spin.addColorStop(0.84, `rgba(255, 107, 45, ${0.15 * flashScale})`);
    spin.addColorStop(1, `rgba(255, 45, 154, ${0.2 * flashScale})`);
    ctx.fillStyle = spin;
    ctx.fillRect(-w * 1.15, -h * 1.15, w * 2.3, h * 2.3);
    ctx.restore();
  }

  private drawRotatingRays(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    flashScale: number,
  ): void {
    const count = this.lite ? 12 : 18;
    const rotation = this.t * (this.reducedFlash ? 0.05 : 0.12);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const hue = (i * (360 / count) + this.t * 42) % 360;
      const g = ctx.createLinearGradient(0, 0, Math.cos(a) * radius, Math.sin(a) * radius);
      g.addColorStop(0, `hsla(${hue}, 96%, 68%, ${0.28 * flashScale})`);
      g.addColorStop(0.45, `hsla(${hue}, 92%, 58%, ${0.1 * flashScale})`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPulseRings(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    maxR: number,
    flashScale: number,
  ): void {
    for (const ring of this.rings) {
      const r = ring.radius * maxR;
      const fade = 1 - ring.radius;
      const alpha = ring.alpha * fade * flashScale;
      if (alpha <= 0.02) continue;

      ctx.strokeStyle = `hsla(${ring.hue}, 95%, 64%, ${alpha * 0.7})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `hsla(${(ring.hue + 120) % 360}, 92%, 62%, ${alpha * 0.45})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.93, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawSparks(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    maxR: number,
    flashScale: number,
  ): void {
    ctx.globalCompositeOperation = 'screen';
    for (const spark of this.sparks) {
      const r = spark.dist * maxR;
      const x = cx + Math.cos(spark.angle) * r;
      const y = cy + Math.sin(spark.angle) * r;
      const fade = 1 - spark.dist * 0.82;
      const alpha = fade * 0.82 * flashScale;
      if (alpha <= 0.03) continue;

      const size = spark.size * (0.65 + fade * 0.9);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, size * 3.2);
      grad.addColorStop(0, `hsla(${spark.hue}, 98%, 72%, ${alpha})`);
      grad.addColorStop(0.45, `hsla(${(spark.hue + 40) % 360}, 95%, 62%, ${alpha * 0.55})`);
      grad.addColorStop(1, `hsla(${spark.hue}, 90%, 55%, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, size * 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
