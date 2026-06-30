export class MenuCanvasLoop {
  private raf = 0;
  private lastTick = 0;
  private active = false;
  private readonly onVisibility = (): void => {
    if (!document.hidden) this.lastTick = 0;
  };

  constructor(
    private readonly targetFps: number,
    private readonly onFrame: (dt: number) => void,
  ) {}

  start(): void {
    if (this.active) return;
    this.active = true;
    this.lastTick = 0;
    document.addEventListener('visibilitychange', this.onVisibility);
    this.frame(performance.now());
  }

  stop(): void {
    this.active = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.lastTick = 0;
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private frame = (now: number): void => {
    if (!this.active) return;
    this.raf = requestAnimationFrame(this.frame);

    if (document.hidden) return;

    const minDelta = 1000 / this.targetFps;
    if (this.lastTick > 0 && now - this.lastTick < minDelta * 0.92) return;

    const dt = this.lastTick > 0 ? Math.min((now - this.lastTick) / 1000, 0.05) : 0;
    this.lastTick = now;
    this.onFrame(dt);
  };
}
