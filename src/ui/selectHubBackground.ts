import { menuBackgroundFps, useLiteMenuBackground } from '../perf/webPerf';
import { CosmicWarpBackground } from './cosmicWarpBackground';
import { MenuCanvasLoop } from './menuCanvasLoop';

const NORMAL_WARP_SPEED = 1;
const DECIDE_WARP_SPEED = 30;
const DECIDE_WARP_SPEED_REDUCED = 12;

export class SelectHubBackground {
  private host: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private warp: CosmicWarpBackground | null = null;
  private readonly loop = new MenuCanvasLoop(menuBackgroundFps(), (dt) => this.onFrame(dt));
  private readonly lite = useLiteMenuBackground();
  private reducedFlash = false;
  private readonly onResize = () => this.resize();

  setReducedFlash(enabled: boolean): void {
    this.reducedFlash = enabled;
    this.applyParticleBudget();
  }

  setWarpSpeedMultiplier(multiplier: number): void {
    if (this.warp) this.warp.warpSpeedMultiplier = multiplier;
  }

  burstWarp(): void {
    this.setWarpSpeedMultiplier(this.reducedFlash ? DECIDE_WARP_SPEED_REDUCED : DECIDE_WARP_SPEED);
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
    this.warp = null;
  }

  private particleCount(): number {
    if (this.lite) return 140;
    if (this.reducedFlash) return 180;
    return 280;
  }

  private applyParticleBudget(): void {
    if (!this.warp) return;
    this.warp.setMaxParticles(this.particleCount());
  }

  private resize(): void {
    if (!this.canvas || !this.host) return;
    const rect = this.host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.lite ? 1.5 : 2);
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);

    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!this.warp) {
      this.warp = new CosmicWarpBackground(w, h, this.particleCount());
      this.warp.warpSpeedMultiplier = NORMAL_WARP_SPEED;
    } else {
      this.warp.resize(w, h);
      this.applyParticleBudget();
    }
  }

  private onFrame(dt: number): void {
    const ctx = this.ctx;
    const warp = this.warp;
    if (!ctx || !warp) return;

    const w = this.canvas?.clientWidth ?? 0;
    const h = this.canvas?.clientHeight ?? 0;
    if (w <= 0 || h <= 0) return;

    warp.update(dt);
    warp.draw(ctx);
  }
}
