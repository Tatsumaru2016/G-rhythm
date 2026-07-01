import { menuBackgroundFps, useLiteMenuBackground } from '../perf/webPerf';
import { LANE_COLORS } from '../types';
import { MenuCanvasLoop } from './menuCanvasLoop';

const NOTE_DEPTH_POWER = 3.2;
const NUM_TUNNEL_LANES = 4;

type TunnelSide = 'bottom' | 'top' | 'left' | 'right';
type LaneIndex = 0 | 1 | 2 | 3;

interface TunnelGridGeom {
  leftX: (d: number) => number;
  rightX: (d: number) => number;
  ceilY: (d: number) => number;
  floorY: (d: number) => number;
}

function createTunnelGridGeom(vpX: number, vpY: number, w: number, h: number): TunnelGridGeom {
  return {
    leftX: (d) => vpX - d * vpX,
    rightX: (d) => vpX + d * (w - vpX),
    ceilY: (d) => vpY - d * vpY,
    floorY: (d) => vpY + d * (h - vpY),
  };
}

function tunnelDepthFromZ(z: number): number {
  return z ** NOTE_DEPTH_POWER;
}

interface TunnelNotePlacement {
  x: number;
  y: number;
  laneSpan: number;
  travelSpan: number;
  horizontal: boolean;
}

/** グリッドの奥行きリング上・レーン区画内の座標 */
function tunnelNotePlacement(
  side: TunnelSide,
  lane: LaneIndex,
  z: number,
  geom: TunnelGridGeom,
): TunnelNotePlacement {
  const d = tunnelDepthFromZ(z);
  const lx = geom.leftX(d);
  const rx = geom.rightX(d);
  const yt = geom.ceilY(d);
  const yb = geom.floorY(d);
  const t0 = lane / NUM_TUNNEL_LANES;
  const t1 = (lane + 1) / NUM_TUNNEL_LANES;
  const laneWidth = t1 - t0;

  switch (side) {
    case 'bottom':
      return {
        x: lx + (t0 + laneWidth * 0.5) * (rx - lx),
        y: yb,
        laneSpan: laneWidth * (rx - lx),
        travelSpan: 7 + 20 * d,
        horizontal: true,
      };
    case 'top':
      return {
        x: lx + (t0 + laneWidth * 0.5) * (rx - lx),
        y: yt,
        laneSpan: laneWidth * (rx - lx),
        travelSpan: 7 + 20 * d,
        horizontal: true,
      };
    case 'left':
      return {
        x: lx,
        y: yt + (t0 + laneWidth * 0.5) * (yb - yt),
        laneSpan: laneWidth * (yb - yt),
        travelSpan: 7 + 20 * d,
        horizontal: false,
      };
    case 'right':
      return {
        x: rx,
        y: yt + (t0 + laneWidth * 0.5) * (yb - yt),
        laneSpan: laneWidth * (yb - yt),
        travelSpan: 7 + 20 * d,
        horizontal: false,
      };
  }
}

function blendNoteHex(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = (c: number) => Math.min(255, Math.round(c * factor));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

class TunnelNote {
  side: TunnelSide = 'bottom';
  lane: LaneIndex = 0;
  z = 0;
  speed = 0.55;

  respawn(scatter = false): void {
    const sides: TunnelSide[] = ['bottom', 'top', 'left', 'right'];
    this.side = sides[Math.floor(Math.random() * sides.length)];
    this.lane = Math.floor(Math.random() * NUM_TUNNEL_LANES) as LaneIndex;
    this.z = scatter ? Math.random() * 0.85 : 0;
    this.speed = 0.4 + Math.random() * 0.65;
  }

  get color(): string {
    return LANE_COLORS[this.lane];
  }

  update(dt: number, speedScale: number): void {
    this.z += this.speed * speedScale * dt;
    if (this.z > 1) this.respawn();
  }

  draw(
    ctx: CanvasRenderingContext2D,
    vpX: number,
    vpY: number,
    w: number,
    h: number,
    flashScale: number,
  ): void {
    const geom = createTunnelGridGeom(vpX, vpY, w, h);
    const place = tunnelNotePlacement(this.side, this.lane, this.z, geom);
    const p = tunnelDepthFromZ(this.z);
    const alpha = Math.min(1, 0.55 + p * 1.35) * flashScale;
    const { x, y, laneSpan, travelSpan, horizontal } = place;

    const width = horizontal ? laneSpan : travelSpan;
    const height = horizontal ? travelSpan : laneSpan;
    const left = x - width / 2;
    const top = y - height / 2;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = (10 * p + 6) * flashScale;
    ctx.shadowColor = this.color;

    const fillGrad = horizontal
      ? ctx.createLinearGradient(left, 0, left + width, 0)
      : ctx.createLinearGradient(0, top, 0, top + height);
    fillGrad.addColorStop(0, blendNoteHex(this.color, 1));
    fillGrad.addColorStop(0.5, blendNoteHex(this.color, 1.18));
    fillGrad.addColorStop(1, blendNoteHex(this.color, 1));
    ctx.fillStyle = fillGrad;
    ctx.fillRect(left, top, width, height);

    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.12 + p * 0.22})`;
    const hi = Math.max(2, (horizontal ? height : width) * 0.34);
    if (this.side === 'bottom') {
      ctx.fillRect(left, top, width, hi);
    } else if (this.side === 'top') {
      ctx.fillRect(left, top + height - hi, width, hi);
    } else if (this.side === 'left') {
      ctx.fillRect(left + width - hi, top, hi, height);
    } else {
      ctx.fillRect(left, top, hi, height);
    }

    ctx.restore();
  }
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function themeRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** 4面とも色相が被らないテーマカラー（レーンカラーと同系統） */
const WALL_COLORS = {
  floor: '#ff2d6a',
  ceiling: '#00e5ff',
  left: '#a855f7',
  right: '#ffd700',
} as const;

/** 壁面とは別系統のグリッド線色 */
const GRID_LINE = {
  depth: [255, 255, 255] as const,
  lane: [210, 248, 255] as const,
};

const TOTAL_LANES = NUM_TUNNEL_LANES;

export class TitleScreenBackground {
  private host: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private readonly loop = new MenuCanvasLoop(menuBackgroundFps(), (dt) => this.onFrame(dt));
  private readonly lite = useLiteMenuBackground();
  private gridOffset = 0;
  private reducedFlash = false;
  private tunnelNotes: TunnelNote[] = [];
  private readonly onResize = () => this.resize();

  setReducedFlash(enabled: boolean): void {
    this.reducedFlash = enabled;
    if (this.canvas) this.initTunnelNotes();
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
    this.gridOffset = 0;
    this.initTunnelNotes();

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
    this.tunnelNotes = [];
  }

  private initTunnelNotes(): void {
    const count = this.lite ? 11 : (this.reducedFlash ? 13 : 21);
    this.tunnelNotes = Array.from({ length: count }, () => {
      const note = new TunnelNote();
      note.respawn(true);
      return note;
    });
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
    this.initTunnelNotes();
  }

  private onFrame(dt: number): void {
    this.gridOffset += dt * 2.5;
    for (const note of this.tunnelNotes) {
      note.update(dt, 1);
    }
    this.render();
  }

  private render(): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w <= 0 || h <= 0) return;

    const flashScale = this.reducedFlash ? 0.55 : 1;
    const cx = w / 2;
    const cy = h / 2;

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    this.drawBaseFill(ctx, w, h, cx, cy);
    this.drawTunnelWalls(ctx, w, h, cx, cy, flashScale);
    this.drawGrid(ctx, w, h, cx, cy, flashScale);
    this.drawTunnelNotes(ctx, cx, cy, w, h, flashScale);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
  }

  private drawBaseFill(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    cx: number,
    cy: number,
  ): void {
    const radius = Math.max(w, h) * 0.92;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, '#1a1040');
    grad.addColorStop(0.5, '#12082a');
    grad.addColorStop(1, '#0c1838');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  /** 深度リング×レーンで4面トンネル壁をテーマカラーで塗る */
  private drawTunnelWalls(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    vpX: number,
    vpY: number,
    flashScale: number,
  ): void {
    const numDepth = this.lite ? 10 : 16;
    const moveOffset = this.gridOffset % 1;
    const power = NOTE_DEPTH_POWER;
    const geom = createTunnelGridGeom(vpX, vpY, w, h);
    const { leftX, rightX, ceilY, floorY } = geom;

    const depthAt = (index: number): number => {
      const p = (index + moveOffset) / numDepth;
      return p ** power;
    };

    const fillQuad = (
      x0: number, y0: number,
      x1: number, y1: number,
      x2: number, y2: number,
      x3: number, y3: number,
      color: string,
      depth: number,
    ) => {
      const edge = Math.abs((depth - 0.5) * 2);
      const alpha = (0.32 + depth * 0.58 + edge * 0.1) * flashScale;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.closePath();
      ctx.fillStyle = themeRgba(color, Math.min(0.88, alpha));
      ctx.fill();
    };

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    for (let i = 0; i < numDepth; i++) {
      const d0 = depthAt(i);
      const d1 = depthAt(Math.min(i + 1, numDepth));
      const depthMid = (d0 + d1) * 0.5;

      for (let lane = 0; lane < TOTAL_LANES; lane++) {
        const t0 = lane / TOTAL_LANES;
        const t1 = (lane + 1) / TOTAL_LANES;

        const flx0 = leftX(d0);
        const frx0 = rightX(d0);
        const flx1 = leftX(d1);
        const frx1 = rightX(d1);
        const fy0 = floorY(d0);
        const fy1 = floorY(d1);
        fillQuad(
          flx0 + t0 * (frx0 - flx0), fy0,
          flx0 + t1 * (frx0 - flx0), fy0,
          flx1 + t1 * (frx1 - flx1), fy1,
          flx1 + t0 * (frx1 - flx1), fy1,
          WALL_COLORS.floor,
          depthMid,
        );

        const cly0 = ceilY(d0);
        const cly1 = ceilY(d1);
        fillQuad(
          flx0 + t0 * (frx0 - flx0), cly0,
          flx1 + t0 * (frx1 - flx1), cly1,
          flx1 + t1 * (frx1 - flx1), cly1,
          flx0 + t1 * (frx0 - flx0), cly0,
          WALL_COLORS.ceiling,
          depthMid,
        );

        const lyt0 = ceilY(d0) + t0 * (floorY(d0) - ceilY(d0));
        const lyt1 = ceilY(d0) + t1 * (floorY(d0) - ceilY(d0));
        const lyb0 = ceilY(d1) + t0 * (floorY(d1) - ceilY(d1));
        const lyb1 = ceilY(d1) + t1 * (floorY(d1) - ceilY(d1));
        const lx0 = leftX(d0);
        const lx1 = leftX(d1);
        fillQuad(
          lx0, lyt0,
          lx0, lyt1,
          lx1, lyb1,
          lx1, lyb0,
          WALL_COLORS.left,
          depthMid,
        );

        const ryt0 = ceilY(d0) + t0 * (floorY(d0) - ceilY(d0));
        const ryt1 = ceilY(d0) + t1 * (floorY(d0) - ceilY(d0));
        const ryb0 = ceilY(d1) + t0 * (floorY(d1) - ceilY(d1));
        const ryb1 = ceilY(d1) + t1 * (floorY(d1) - ceilY(d1));
        const rx0 = rightX(d0);
        const rx1 = rightX(d1);
        fillQuad(
          rx0, ryt0,
          rx1, ryb0,
          rx1, ryb1,
          rx0, ryt1,
          WALL_COLORS.right,
          depthMid,
        );
      }
    }

    ctx.restore();
  }

  /** 4辺グリッド — 深度リングは閉じた四角形、レーン線は四辺の角で一致 */
  private drawGrid(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    vpX: number,
    vpY: number,
    flashScale: number,
  ): void {
    const gridAlpha = (this.lite ? 0.65 : 1) * flashScale;
    const moveOffset = this.gridOffset % 1;
    const numDepth = this.lite ? 10 : 16;
    const numLanes = TOTAL_LANES;
    const power = NOTE_DEPTH_POWER;
    const lineWidth = this.lite ? 1 : 1.5;
    const geom = createTunnelGridGeom(vpX, vpY, w, h);

    const depthAt = (index: number): number => {
      const p = (index + moveOffset) / numDepth;
      return p ** power;
    };

    const { leftX, rightX, ceilY, floorY } = geom;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = lineWidth;

    const strokeGrid = (rgb: readonly [number, number, number], alpha: number) => {
      ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
    };

    // 奥行きリング（4辺が同じ四角形で接続）
    for (let i = 0; i < numDepth; i++) {
      const d = depthAt(i);
      const alpha = (0.25 + d * 0.7) * gridAlpha;
      const lx = leftX(d);
      const rx = rightX(d);
      const yt = ceilY(d);
      const yb = floorY(d);

      strokeGrid(GRID_LINE.depth, alpha * 0.82);
      ctx.beginPath();
      ctx.moveTo(lx, yb);
      ctx.lineTo(rx, yb);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(lx, yt);
      ctx.lineTo(rx, yt);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(lx, yt);
      ctx.lineTo(lx, yb);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(rx, yt);
      ctx.lineTo(rx, yb);
      ctx.stroke();
    }

    // レーン線（四隅で一致するよう端から端へ等分）
    for (let lane = 0; lane <= numLanes; lane++) {
      const t = lane / numLanes;
      const edgeT = Math.abs(t - 0.5) * 2;
      const laneAlpha = (0.3 + edgeT * 0.42) * gridAlpha;

      const bottomX = t * w;
      const topX = t * w;
      const leftY = t * h;
      const rightY = t * h;

      strokeGrid(GRID_LINE.lane, laneAlpha);
      ctx.beginPath();
      ctx.moveTo(vpX, vpY);
      ctx.lineTo(bottomX, h);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(vpX, vpY);
      ctx.lineTo(topX, 0);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(vpX, vpY);
      ctx.lineTo(0, leftY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(vpX, vpY);
      ctx.lineTo(w, rightY);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawTunnelNotes(
    ctx: CanvasRenderingContext2D,
    vpX: number,
    vpY: number,
    w: number,
    h: number,
    flashScale: number,
  ): void {
    for (const note of this.tunnelNotes) {
      note.draw(ctx, vpX, vpY, w, h, flashScale);
    }
  }
}
