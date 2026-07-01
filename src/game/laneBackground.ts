import type { LaneIndex } from '../types';
import { LANE_COLORS } from '../types';
import type { MessageKey } from '../i18n/messages';
import { loadCustomLaneBackgroundDataUrl } from '../settings/customLaneBackgroundImage';

/** 4レーン合計の最大幅（Renderer.LANE_AREA_MAX_PX と同期） */
export const LANE_PLAYFIELD_MAX_WIDTH_PX = 392;
/** 1レーンの最大幅 */
export const LANE_MAX_WIDTH_PX = LANE_PLAYFIELD_MAX_WIDTH_PX / 4;

/**
 * カスタム画像を使う場合の推奨サイズ（縦方向はタイル繰り返し想定）。
 * 実際の表示は画面サイズに応じて伸縮します。
 */
export const LANE_BG_TEXTURE_RECOMMENDED = { width: 98, height: 512 } as const;
export const LANE_BG_STRIP_RECOMMENDED = {
  width: LANE_PLAYFIELD_MAX_WIDTH_PX,
  height: 512,
} as const;

export const LANE_BACKGROUND_IDS = [
  'classic',
  'neonPlasma',
  'psychedelicSwirl',
  'deepCosmos',
  'acidWave',
  'prismScan',
  'custom',
] as const;

export type LaneBackgroundId = (typeof LANE_BACKGROUND_IDS)[number];

export const DEFAULT_LANE_BACKGROUND: LaneBackgroundId = 'neonPlasma';

export function isValidLaneBackgroundId(value: string): value is LaneBackgroundId {
  return (LANE_BACKGROUND_IDS as readonly string[]).includes(value);
}

export function laneBackgroundI18nKey(id: LaneBackgroundId): MessageKey {
  return `settings.laneBg.${id}` as MessageKey;
}

export interface LaneBackgroundLayout {
  laneStartX: number;
  laneTopY: number;
  laneBottomY: number;
  laneWidth: number;
}

export interface LaneBackgroundDrawOptions {
  id: LaneBackgroundId;
  layout: LaneBackgroundLayout;
  time: number;
  reducedFlash: boolean;
}

export function getLanePlayfieldHeight(layout: LaneBackgroundLayout): number {
  return Math.max(0, layout.laneBottomY - layout.laneTopY);
}

/** 現在のレイアウトに基づく実ピクセルサイズ（参考値） */
export function getLaneBackgroundPixelSize(layout: LaneBackgroundLayout): {
  stripWidth: number;
  stripHeight: number;
  laneWidth: number;
} {
  return {
    stripWidth: layout.laneWidth * 4,
    stripHeight: getLanePlayfieldHeight(layout),
    laneWidth: layout.laneWidth,
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hsla(h: number, s: number, l: number, a: number): string {
  return `hsla(${((h % 360) + 360) % 360}, ${s}%, ${l}%, ${a})`;
}

function laneColorRgb(lane: LaneIndex): [number, number, number] {
  return hexToRgb(LANE_COLORS[lane]);
}

function drawClassicLane(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  w: number,
  h: number,
  lane: LaneIndex,
): void {
  const [r, g, b] = laneColorRgb(lane);
  const grad = ctx.createLinearGradient(left, top, left, top + h);
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.06)`);
  grad.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.14)`);
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.04)`);
  ctx.fillStyle = grad;
  ctx.fillRect(left, top, w, h);

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(left, top, w, h);
}

function drawNeonPlasmaLane(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  w: number,
  h: number,
  lane: LaneIndex,
  time: number,
  intensity: number,
): void {
  const [r, g, b] = laneColorRgb(lane);
  const cx = left + w / 2;

  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(left, top, w, h);

  for (let layer = 0; layer < 3; layer++) {
    const phase = time * (1.6 + layer * 0.4) + lane * 1.7 + layer * 2.1;
    const grad = ctx.createLinearGradient(left, top, left + w, top + h);
    const wave = 0.5 + 0.5 * Math.sin(phase);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${(0.08 + wave * 0.12) * intensity})`);
    grad.addColorStop(
      0.5,
      `rgba(${Math.min(255, r + 40)}, ${g}, ${Math.min(255, b + 60)}, ${(0.14 + wave * 0.18) * intensity})`,
    );
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${(0.05 + wave * 0.1) * intensity})`);
    ctx.fillStyle = grad;
    ctx.fillRect(left, top, w, h);
  }

  const pulse = 0.5 + 0.5 * Math.sin(time * 3.2 + lane);
  const pillar = ctx.createRadialGradient(cx, top + h * 0.62, 0, cx, top + h * 0.62, w * 0.9);
  pillar.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${(0.22 + pulse * 0.2) * intensity})`);
  pillar.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${0.08 * intensity})`);
  pillar.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = pillar;
  ctx.fillRect(left, top, w, h);
}

function drawPsychedelicSwirlLane(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  w: number,
  h: number,
  lane: LaneIndex,
  time: number,
  intensity: number,
): void {
  const cx = left + w / 2;
  const cy = top + h * 0.5;
  const baseHue = lane * 72 + time * 28;

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(left, top, w, h);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let ring = 0; ring < 4; ring++) {
    const spin = time * (0.8 + ring * 0.25) + lane * 0.9;
    const radius = w * (0.35 + ring * 0.22);
    const gx = cx + Math.cos(spin) * w * 0.08;
    const gy = cy + Math.sin(spin * 1.3) * h * 0.06;
    const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
    grad.addColorStop(0, hsla(baseHue + ring * 40, 88, 58, 0.34 * intensity));
    grad.addColorStop(0.55, hsla(baseHue + ring * 40 + 60, 92, 48, 0.16 * intensity));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(left, top, w, h);
  }
  ctx.restore();
}

function drawDeepCosmosLane(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  w: number,
  h: number,
  lane: LaneIndex,
  time: number,
  intensity: number,
): void {
  const [r, g, b] = laneColorRgb(lane);
  const nebula = ctx.createLinearGradient(left, top, left, top + h);
  nebula.addColorStop(0, `rgba(8, 4, 28, 0.92)`);
  nebula.addColorStop(
    0.5,
    `rgba(${Math.floor(r * 0.15)}, ${Math.floor(g * 0.12)}, ${Math.floor(b * 0.2)}, 0.75)`,
  );
  nebula.addColorStop(1, `rgba(4, 0, 18, 0.95)`);
  ctx.fillStyle = nebula;
  ctx.fillRect(left, top, w, h);

  const cx = left + w / 2;
  const blobY = top + h * (0.35 + 0.08 * Math.sin(time * 0.9 + lane));
  const blob = ctx.createRadialGradient(cx, blobY, 0, cx, blobY, w * 1.1);
  blob.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.28 * intensity})`);
  blob.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, ${0.08 * intensity})`);
  blob.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = blob;
  ctx.fillRect(left, top, w, h);

  const starCount = 6;
  for (let s = 0; s < starCount; s++) {
    const seed = lane * 17 + s * 31;
    const sx = left + (((seed * 13) % 97) / 100) * w;
    const sy = top + (((seed * 29 + time * 12) % 100) / 100) * h;
    const twinkle = 0.35 + 0.65 * Math.sin(time * 4 + seed);
    ctx.fillStyle = `rgba(255,255,255,${twinkle * 0.55 * intensity})`;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }
}

function drawAcidWaveLane(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  w: number,
  h: number,
  lane: LaneIndex,
  time: number,
  intensity: number,
): void {
  const [r, g, blue] = laneColorRgb(lane);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(left, top, w, h);

  const bands = 10;
  const bandH = h / bands;
  for (let b = 0; b < bands; b++) {
    const wave = Math.sin(time * 2.4 + b * 0.7 + lane * 1.1);
    const offset = wave * w * 0.12;
    const y = top + b * bandH + Math.sin(time * 1.5 + b + lane) * bandH * 0.25;
    const hue = (lane * 70 + b * 28 + time * 45) % 360;
    const alpha = (0.1 + (0.5 + 0.5 * wave) * 0.14) * intensity;
    ctx.fillStyle =
      b % 2 === 0 ? hsla(hue, 90, 55, alpha) : `rgba(${r}, ${g}, ${blue}, ${alpha * 0.85})`;
    ctx.fillRect(left + offset, y, w, bandH * 1.15);
  }
}

function drawPrismScanLane(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  w: number,
  h: number,
  lane: LaneIndex,
  time: number,
  intensity: number,
): void {
  ctx.fillStyle = 'rgba(0,0,0,0.48)';
  ctx.fillRect(left, top, w, h);

  const scanY = top + ((time * 0.22 + lane * 0.18) % 1) * h;
  const scanGrad = ctx.createLinearGradient(left, scanY - h * 0.18, left, scanY + h * 0.18);
  const hue = lane * 65 + time * 35;
  scanGrad.addColorStop(0, 'rgba(0,0,0,0)');
  scanGrad.addColorStop(0.45, hsla(hue, 95, 62, 0.22 * intensity));
  scanGrad.addColorStop(0.5, hsla(hue + 40, 100, 70, 0.38 * intensity));
  scanGrad.addColorStop(0.55, hsla(hue + 80, 95, 62, 0.22 * intensity));
  scanGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = scanGrad;
  ctx.fillRect(left, top, w, h);

  for (let stripe = 0; stripe < 5; stripe++) {
    const sx = left + ((stripe / 5 + time * 0.06 + lane * 0.04) % 1) * w;
    const stripeGrad = ctx.createLinearGradient(sx - w * 0.08, top, sx + w * 0.08, top);
    stripeGrad.addColorStop(0, 'rgba(0,0,0,0)');
    stripeGrad.addColorStop(0.5, hsla(hue + stripe * 50, 88, 58, 0.2 * intensity));
    stripeGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = stripeGrad;
    ctx.fillRect(left, top, w, h);
  }
}

let customLaneImage: HTMLImageElement | null = null;
let customLaneImageSrc: string | null = null;

export function preloadCustomLaneBackgroundImage(dataUrl?: string | null): void {
  const src = dataUrl === undefined ? loadCustomLaneBackgroundDataUrl() : dataUrl;
  if (!src) {
    customLaneImage = null;
    customLaneImageSrc = null;
    return;
  }
  if (src === customLaneImageSrc && customLaneImage?.complete) return;

  customLaneImageSrc = src;
  customLaneImage = null;
  const img = new Image();
  img.onload = () => {
    if (customLaneImageSrc === src) customLaneImage = img;
  };
  img.onerror = () => {
    if (customLaneImageSrc === src) {
      customLaneImage = null;
      customLaneImageSrc = null;
    }
  };
  img.src = src;
}

function drawCustomImagePlayfield(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  totalW: number,
  h: number,
): boolean {
  if (!customLaneImage?.complete || customLaneImage.naturalWidth <= 0) return false;

  const img = customLaneImage;
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;
  const perLane = imgW <= imgH * 0.35;
  const drawW = perLane ? totalW / 4 : totalW;
  const scale = drawW / imgW;
  const tileH = Math.max(1, imgH * scale);

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, totalW, h);
  ctx.clip();

  if (perLane) {
    for (let lane = 0; lane < 4; lane++) {
      const laneLeft = left + lane * (totalW / 4);
      for (let y = top; y < top + h; y += tileH) {
        ctx.drawImage(img, laneLeft, y, drawW, tileH);
      }
    }
  } else {
    for (let y = top; y < top + h; y += tileH) {
      ctx.drawImage(img, left, y, totalW, tileH);
    }
  }

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(left, top, totalW, h);
  ctx.restore();
  return true;
}

function drawCustomLane(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  w: number,
  h: number,
  lane: LaneIndex,
  layoutStartX: number,
  totalW: number,
): void {
  if (lane !== 0) return;
  if (drawCustomImagePlayfield(ctx, layoutStartX, top, totalW, h)) return;
  drawClassicLane(ctx, left, top, w, h, lane);
}

const LANE_DRAWERS: Record<
  Exclude<LaneBackgroundId, 'custom'>,
  (
    ctx: CanvasRenderingContext2D,
    left: number,
    top: number,
    w: number,
    h: number,
    lane: LaneIndex,
    time: number,
    intensity: number,
  ) => void
> = {
  classic: (ctx, l, t, w, h, lane) => drawClassicLane(ctx, l, t, w, h, lane),
  neonPlasma: drawNeonPlasmaLane,
  psychedelicSwirl: drawPsychedelicSwirlLane,
  deepCosmos: drawDeepCosmosLane,
  acidWave: drawAcidWaveLane,
  prismScan: drawPrismScanLane,
};

export function drawLaneBackground(
  ctx: CanvasRenderingContext2D,
  options: LaneBackgroundDrawOptions,
): void {
  const { id, layout, time, reducedFlash } = options;
  const top = layout.laneTopY;
  const h = getLanePlayfieldHeight(layout);
  if (h <= 0) return;

  const intensity = reducedFlash ? 0.45 : 1;
  const totalW = layout.laneWidth * 4;

  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.laneStartX, top, totalW, h);
  ctx.clip();

  if (id === 'custom') {
    for (let lane = 0; lane < 4; lane++) {
      const left = layout.laneStartX + lane * layout.laneWidth;
      drawCustomLane(
        ctx,
        left,
        top,
        layout.laneWidth,
        h,
        lane as LaneIndex,
        layout.laneStartX,
        totalW,
      );
    }
  } else {
    const drawer = LANE_DRAWERS[id];
    for (let lane = 0; lane < 4; lane++) {
      const left = layout.laneStartX + lane * layout.laneWidth;
      drawer(ctx, left, top, layout.laneWidth, h, lane as LaneIndex, time, intensity);
    }
  }

  ctx.restore();
}
