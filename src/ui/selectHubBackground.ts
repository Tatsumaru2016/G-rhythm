import { menuBackgroundFps, useLiteMenuBackground } from '../perf/webPerf';
import { MenuCanvasLoop } from './menuCanvasLoop';

interface HubParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  hue: number;
  twinkle: number;
}

export class SelectHubBackground {
  private host: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private loop = new MenuCanvasLoop(menuBackgroundFps(), () => this.tick());
  private readonly lite = useLiteMenuBackground();
  private particles: HubParticle[] = [];
  private reducedFlash = false;
  private readonly onResize = () => this.resize();

  setReducedFlash(enabled: boolean): void {
    this.reducedFlash = enabled;
    if (this.host) this.initParticles();
  }

  mount(host: HTMLElement): void {
    this.unmount();
    this.host = host;
    host.innerHTML = '';

    const canvas = document.createElement('canvas');
    canvas.className = 'select-hub-bg-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    this.initParticles();
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
    this.particles = [];
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
    this.initParticles();
  }

  private initParticles(): void {
    if (!this.canvas) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const density = this.lite ? 48000 : (this.reducedFlash ? 32000 : 14000);
    const minCount = this.lite ? 14 : (this.reducedFlash ? 18 : 42);
    const count = Math.max(minCount, Math.floor((w * h) / density));

    this.particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * (this.reducedFlash ? 0.14 : 0.28),
      vy: (Math.random() - 0.5) * (this.reducedFlash ? 0.14 : 0.28) - 0.06,
      size: 0.8 + Math.random() * (this.reducedFlash ? 1.4 : 2.2),
      alpha: 0.15 + Math.random() * 0.45,
      hue: 185 + Math.random() * 55,
      twinkle: Math.random() * Math.PI * 2,
    }));
  }

  private tick(): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);

    const beamAlpha = this.reducedFlash ? 0.04 : 0.09;
    const beamGrad = ctx.createLinearGradient(0, 0, w, h);
    beamGrad.addColorStop(0, `rgba(0, 180, 255, ${beamAlpha})`);
    beamGrad.addColorStop(0.5, 'rgba(0, 80, 180, 0)');
    beamGrad.addColorStop(1, `rgba(120, 80, 255, ${beamAlpha * 0.85})`);
    ctx.fillStyle = beamGrad;
    ctx.fillRect(0, 0, w, h);

    const flashScale = this.reducedFlash ? 0.42 : 1;

    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.twinkle += this.reducedFlash ? 0.012 : 0.024;

      if (p.x < -8) p.x = w + 8;
      if (p.x > w + 8) p.x = -8;
      if (p.y < -8) p.y = h + 8;
      if (p.y > h + 8) p.y = -8;

      const pulse = 0.55 + Math.sin(p.twinkle) * 0.45;
      const a = p.alpha * pulse * flashScale;
      const r = p.size * (0.85 + pulse * 0.25);

      if (this.lite) {
        ctx.fillStyle = `hsla(${p.hue}, 90%, 72%, ${a * 0.9})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2);
      grad.addColorStop(0, `hsla(${p.hue}, 95%, 72%, ${a})`);
      grad.addColorStop(0.45, `hsla(${p.hue}, 90%, 55%, ${a * 0.35})`);
      grad.addColorStop(1, `hsla(${p.hue}, 90%, 50%, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `hsla(${p.hue}, 100%, 88%, ${Math.min(1, a * 1.6)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
