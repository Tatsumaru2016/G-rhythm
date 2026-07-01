export interface WarpParticle {
  x: number;
  y: number;
  z: number;
  color: string;
  size: number;
  hue: number;
}

const BASE_SPEED = 260;
const TUNNEL_RING_COUNT = 12;
const TUNNEL_DEPTH_POWER = 2.15;
const TUNNEL_SCROLL_SPEED = 1.85;

const WARP_COLORS = [
  '#00f3ff',
  '#ff007f',
  '#9d00ff',
  '#ffe600',
  '#00ff88',
  '#ff6b2d',
  '#ffffff',
  '#4dffb8',
  '#ff44ff',
  '#66aaff',
];

/** 4分割ベース — タイトル壁面と同系統のネオン */
const QUADRANT_THEME = [
  { base: '#3a0058', neon: '#ff2d6a', hue: 322 },
  { base: '#002848', neon: '#00e5ff', hue: 192 },
  { base: '#220058', neon: '#a855f7', hue: 272 },
  { base: '#381018', neon: '#ffd700', hue: 48 },
] as const;

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const lerp = (x: number, y: number) => Math.round(x + (y - x) * t);
  const r = lerp(ar, br);
  const g = lerp(ag, bg);
  const bl = lerp(ab, bb);
  return `rgb(${r},${g},${bl})`;
}

function lerpHue(a: number, b: number, t: number): number {
  const delta = ((b - a + 540) % 360) - 180;
  return a + delta * t;
}

function quadrantThemeAt(index: number, time: number): { base: string; neon: string; hue: number } {
  const cycle = (time * 0.11) % QUADRANT_THEME.length;
  const i0 = Math.floor(cycle);
  const blend = cycle - i0;
  const themeA = QUADRANT_THEME[(index + i0) % QUADRANT_THEME.length];
  const themeB = QUADRANT_THEME[(index + i0 + 1) % QUADRANT_THEME.length];
  return {
    base: mixHex(themeA.base, themeB.base, blend),
    neon: mixHex(themeA.neon, themeB.neon, blend),
    hue: lerpHue(themeA.hue, themeB.hue, blend),
  };
}

export class CosmicWarpBackground {
  private particles: WarpParticle[] = [];
  private readonly colors = WARP_COLORS;
  private time = 0;
  private gridOffset = 0;

  warpSpeedMultiplier = 1;

  constructor(
    private width: number,
    private height: number,
    private maxParticles = 150,
  ) {
    this.initParticles();
  }

  setMaxParticles(count: number): void {
    this.maxParticles = count;
    this.initParticles();
  }

  private initParticles(): void {
    this.particles = [];
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push(this.resetParticle());
    }
  }

  private resetParticle(): WarpParticle {
    const hue = Math.random() * 360;
    return {
      x: (Math.random() - 0.5) * this.width * 2.6,
      y: (Math.random() - 0.5) * this.height * 2.6,
      z: Math.random() * this.width,
      color: this.colors[Math.floor(Math.random() * this.colors.length)],
      size: Math.random() * 3.2 + 0.9,
      hue,
    };
  }

  update(deltaTime: number): void {
    this.time += deltaTime;
    this.gridOffset += deltaTime * TUNNEL_SCROLL_SPEED * this.warpSpeedMultiplier;
    const currentSpeed = BASE_SPEED * this.warpSpeedMultiplier * deltaTime;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.z -= currentSpeed;
      if (p.z <= 0) {
        this.particles[i] = this.resetParticle();
      }
    }
  }

  private focal(): { cx: number; cy: number } {
    return { cx: this.width / 2, cy: this.height * 0.48 };
  }

  private drawQuadrantBase(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    const t = this.time;
    const halfW = w / 2;
    const halfH = h / 2;
    const { cx, cy } = this.focal();

    const rects = [
      { x: 0, y: 0, index: 0 },
      { x: halfW, y: 0, index: 1 },
      { x: 0, y: halfH, index: 2 },
      { x: halfW, y: halfH, index: 3 },
    ];

    for (const rect of rects) {
      const theme = quadrantThemeAt(rect.index, t);
      const pulse = 0.55 + Math.sin(t * 1.35 + theme.hue * 0.02) * 0.45;
      const fill = mixHex(theme.base, theme.neon, pulse * 0.42);
      ctx.fillStyle = fill;
      ctx.fillRect(rect.x, rect.y, halfW, halfH);

      const cornerX = rect.x === 0 ? halfW : w;
      const cornerY = rect.y === 0 ? halfH : h;
      const glow = ctx.createRadialGradient(
        cx,
        cy,
        0,
        cornerX,
        cornerY,
        Math.max(halfW, halfH) * 1.05,
      );
      glow.addColorStop(0, `hsla(${theme.hue + Math.sin(t * 0.9) * 18}, 98%, 62%, 0.55)`);
      glow.addColorStop(0.45, `hsla(${theme.hue}, 92%, 52%, 0.22)`);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(rect.x, rect.y, halfW, halfH);
    }
  }

  private drawKaleidoscope(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    const t = this.time;
    const { cx, cy } = this.focal();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.18);
    const spin = ctx.createConicGradient(0, 0, 0);
    spin.addColorStop(0, 'rgba(255, 0, 127, 0.28)');
    spin.addColorStop(0.18, 'rgba(0, 243, 255, 0.22)');
    spin.addColorStop(0.38, 'rgba(157, 0, 255, 0.26)');
    spin.addColorStop(0.58, 'rgba(255, 230, 0, 0.2)');
    spin.addColorStop(0.78, 'rgba(0, 255, 136, 0.22)');
    spin.addColorStop(1, 'rgba(255, 0, 127, 0.28)');
    ctx.fillStyle = spin;
    ctx.fillRect(-w, -h, w * 2, h * 2);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.translate(cx, cy);
    ctx.rotate(-t * 0.11);
    const spin2 = ctx.createConicGradient(0, 0, 0);
    spin2.addColorStop(0, 'rgba(255, 45, 154, 0.16)');
    spin2.addColorStop(0.5, 'rgba(0, 229, 255, 0.14)');
    spin2.addColorStop(1, 'rgba(255, 45, 154, 0.16)');
    ctx.fillStyle = spin2;
    ctx.fillRect(-w * 0.85, -h * 0.85, w * 1.7, h * 1.7);
    ctx.restore();
  }

  private drawWarpTunnelGrid(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    const { cx, cy } = this.focal();
    const maxSpan = Math.max(w, h) * 0.62;
    const moveOffset = this.gridOffset % 1;
    const aspect = w / Math.max(h, 1);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';

    for (let i = 0; i < TUNNEL_RING_COUNT; i++) {
      const phase = (i + moveOffset) / TUNNEL_RING_COUNT;
      const d = phase ** TUNNEL_DEPTH_POWER;
      const alpha = (0.1 + d * 0.34) * (1 - phase * 0.28);
      const hw = d * maxSpan * aspect * 0.92;
      const hh = d * maxSpan * 0.88;
      const hue = (phase * 280 + this.time * 18) % 360;

      ctx.strokeStyle = `hsla(${hue}, 96%, 68%, ${alpha})`;
      ctx.lineWidth = 0.85 + d * 1.35;
      ctx.strokeRect(cx - hw, cy - hh, hw * 2, hh * 2);
    }

    const spokes = 20;
    for (let i = 0; i < spokes; i++) {
      const angle = (i / spokes) * Math.PI * 2 + this.time * 0.06;
      const hue = (i * 18 + this.time * 35) % 360;
      const len = maxSpan * 1.15;
      const g = ctx.createLinearGradient(
        cx,
        cy,
        cx + Math.cos(angle) * len,
        cy + Math.sin(angle) * len,
      );
      g.addColorStop(0, `hsla(${hue}, 95%, 72%, 0.38)`);
      g.addColorStop(0.55, `hsla(${hue}, 90%, 58%, 0.12)`);
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawQuadrantCross(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    const { cx, cy } = this.focal();
    const t = this.time;
    const pulse = 0.65 + Math.sin(t * 2.1) * 0.35;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineWidth = 2.2 + pulse * 1.2;
    ctx.shadowBlur = 16 + pulse * 10;

    const vGrad = ctx.createLinearGradient(cx, 0, cx, h);
    vGrad.addColorStop(0, `rgba(0, 229, 255, ${0.15 * pulse})`);
    vGrad.addColorStop(0.5, `rgba(255, 45, 154, ${0.55 * pulse})`);
    vGrad.addColorStop(1, `rgba(168, 85, 247, ${0.15 * pulse})`);
    ctx.strokeStyle = vGrad;
    ctx.shadowColor = '#ff2d9a';
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.stroke();

    const hGrad = ctx.createLinearGradient(0, cy, w, cy);
    hGrad.addColorStop(0, `rgba(168, 85, 247, ${0.15 * pulse})`);
    hGrad.addColorStop(0.5, `rgba(255, 213, 74, ${0.5 * pulse})`);
    hGrad.addColorStop(1, `rgba(0, 229, 255, ${0.15 * pulse})`);
    ctx.strokeStyle = hGrad;
    ctx.shadowColor = '#00e5ff';
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  private drawLightBeams(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    const { cx, cy } = this.focal();
    const t = this.time;

    const drawLayer = (count: number, rotSpeed: number, alphaScale: number, widthScale: number) => {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.translate(cx, cy);
      ctx.rotate(t * rotSpeed);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.sin(t * 0.42 + i) * 0.1;
        const len = Math.max(w, h) * 1.15;
        const hue = (i * (360 / count) + t * 48) % 360;
        const g = ctx.createLinearGradient(0, 0, Math.cos(angle) * len, Math.sin(angle) * len);
        g.addColorStop(0, `hsla(${hue}, 98%, 66%, ${0.34 * alphaScale})`);
        g.addColorStop(0.32, `hsla(${hue}, 92%, 58%, ${0.14 * alphaScale})`);
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        const spread = 0.035 * widthScale;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle - spread) * len, Math.sin(angle - spread) * len);
        ctx.lineTo(Math.cos(angle + spread) * len, Math.sin(angle + spread) * len);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    };

    drawLayer(14, 0.1, 1, 1);
    drawLayer(10, -0.065, 0.72, 1.35);
  }

  private drawWarpParticles(ctx: CanvasRenderingContext2D): void {
    const { cx, cy } = this.focal();
    const fov = 440;
    const warpStreak = this.warpSpeedMultiplier > 1.8;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';

    for (const p of this.particles) {
      if (p.z <= 0) continue;

      const screenX = cx + (p.x / p.z) * fov;
      const screenY = cy + (p.y / p.z) * fov;
      const radius = (p.size * fov) / p.z;

      if (
        screenX < -50 ||
        screenX > this.width + 50 ||
        screenY < -50 ||
        screenY > this.height + 50
      ) {
        continue;
      }

      const streakLen = warpStreak
        ? BASE_SPEED * 0.09 * this.warpSpeedMultiplier
        : BASE_SPEED * 0.034;
      const prevX = cx + (p.x / (p.z + streakLen)) * fov;
      const prevY = cy + (p.y / (p.z + streakLen)) * fov;

      ctx.shadowBlur = warpStreak ? 10 : 6;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(prevX, prevY);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(0.7, radius * (warpStreak ? 0.85 : 0.58));
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.drawQuadrantBase(ctx);
    this.drawKaleidoscope(ctx);
    this.drawWarpTunnelGrid(ctx);
    this.drawQuadrantCross(ctx);
    this.drawLightBeams(ctx);
    this.drawWarpParticles(ctx);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }
}
