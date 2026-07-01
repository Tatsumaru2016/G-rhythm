import type { JudgmentType } from '../types';

/** DDR 系ダンスゲージ — 0〜1、中央付近からスタート */
export const DANCE_GAUGE_START = 0.5;
/** DDRA 風 ENERGY バー — 細かいシェブロン分割 */
export const DANCE_GAUGE_SEGMENT_COUNT = 12;
export const DANCE_GAUGE_DANGER_THRESHOLD = 0.22;
export const DANCE_GAUGE_WARNING_THRESHOLD = 0.38;
export const DANCE_GAUGE_FULL_THRESHOLD = 0.995;

/** DDR Extreme 系 DP をゲージ 0〜1 に写像（1DP ≒ 1%）
 *  Perfect +2 / Great +1 / Good 0 / Boo -4 / Miss -8 / 落ち -10
 *  ノーツ落ち（未入力スルー）は BAD・押して Miss より重い。スコアはいずれも加点なし。 */
export const DANCE_GAUGE_DELTA: Record<JudgmentType, number> = {
  marvelous: 0.025,
  perfect: 0.02,
  great: 0.01,
  good: 0,
  bad: -0.04,
  miss: -0.08,
};

/** ノーツ落ち（キー未入力で通過）— BAD(-4%)・押下Miss(-8%)より大きく減少 */
export const DANCE_GAUGE_DROP_DELTA = -0.1;

const GAUGE_DELTA = DANCE_GAUGE_DELTA;

/** DDRA ENERGY グラデ（左=マゼンタ → 右=シアン） */
const ENERGY_GRADIENT_STOPS = [
  { t: 0.0, r: 233, g: 30, b: 140 },
  { t: 0.12, r: 255, g: 64, b: 128 },
  { t: 0.28, r: 255, g: 106, b: 0 },
  { t: 0.42, r: 255, g: 204, b: 0 },
  { t: 0.56, r: 136, g: 255, b: 0 },
  { t: 0.7, r: 0, g: 230, b: 118 },
  { t: 0.84, r: 0, g: 229, b: 255 },
  { t: 1.0, r: 179, g: 240, b: 255 },
] as const;

export function getDanceGaugeEnergyRgb(t: number): { r: number; g: number; b: number } {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < ENERGY_GRADIENT_STOPS.length; i++) {
    const a = ENERGY_GRADIENT_STOPS[i - 1];
    const b = ENERGY_GRADIENT_STOPS[i];
    if (x <= b.t) {
      const f = (x - a.t) / (b.t - a.t);
      return {
        r: Math.round(a.r + (b.r - a.r) * f),
        g: Math.round(a.g + (b.g - a.g) * f),
        b: Math.round(a.b + (b.b - a.b) * f),
      };
    }
  }
  const last = ENERGY_GRADIENT_STOPS[ENERGY_GRADIENT_STOPS.length - 1];
  return { r: last.r, g: last.g, b: last.b };
}

export function getDanceGaugeEnergyColor(t: number, alpha = 1): string {
  const { r, g, b } = getDanceGaugeEnergyRgb(t);
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

export function clampDanceGauge(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function applyDanceGaugeJudgment(gauge: number, judgment: JudgmentType): number {
  return clampDanceGauge(gauge + GAUGE_DELTA[judgment]);
}

/** フリーズ N.G. — Miss より大きくゲージを削る（DDR 系） */
export const DANCE_GAUGE_NG_DELTA = -0.12;

export function applyDanceGaugeNg(gauge: number): number {
  return clampDanceGauge(gauge + DANCE_GAUGE_NG_DELTA);
}

export function applyDanceGaugeDrop(gauge: number): number {
  return clampDanceGauge(gauge + DANCE_GAUGE_DROP_DELTA);
}

export function isDanceGaugeDanger(gauge: number): boolean {
  const g = clampDanceGauge(gauge);
  return g > 0 && g < DANCE_GAUGE_DANGER_THRESHOLD;
}

export function isDanceGaugeWarning(gauge: number): boolean {
  const g = clampDanceGauge(gauge);
  return g > 0 && g < DANCE_GAUGE_WARNING_THRESHOLD;
}

/** 0=安全, 1=警告, 2=危険 */
export function getDanceGaugeStressLevel(gauge: number): 0 | 1 | 2 {
  const g = clampDanceGauge(gauge);
  if (g <= 0) return 2;
  if (g < DANCE_GAUGE_DANGER_THRESHOLD) return 2;
  if (g < DANCE_GAUGE_WARNING_THRESHOLD) return 1;
  return 0;
}

export function isDanceGaugeFailed(gauge: number): boolean {
  return clampDanceGauge(gauge) <= 0;
}

export function isDanceGaugeFull(gauge: number): boolean {
  return clampDanceGauge(gauge) >= DANCE_GAUGE_FULL_THRESHOLD;
}

/** セグメント内の充填率（0〜1） */
export function getDanceGaugeSegmentFill(
  gauge: number,
  segmentIndex: number,
  segmentCount = DANCE_GAUGE_SEGMENT_COUNT,
): number {
  const segSize = 1 / segmentCount;
  const segStart = segmentIndex * segSize;
  const segEnd = segStart + segSize;
  if (gauge <= segStart) return 0;
  if (gauge >= segEnd) return 1;
  return (gauge - segStart) / segSize;
}

export interface DanceGaugePalette {
  fill: string;
  glow: string;
  label: string;
}

/** ゲージ量に応じた DDR 風カラー（低=赤、高=シアン） */
export function getDanceGaugePalette(gauge: number): DanceGaugePalette {
  if (gauge < DANCE_GAUGE_DANGER_THRESHOLD) {
    return { fill: '#ff2244', glow: '#ff5577', label: '#ff8a9a' };
  }
  if (gauge < 0.45) {
    return { fill: '#ff9a2e', glow: '#ffbb55', label: '#ffd080' };
  }
  if (gauge < 0.72) {
    return { fill: '#b8f04a', glow: '#d4ff70', label: '#e8ff9a' };
  }
  return { fill: '#00e8ff', glow: '#66f4ff', label: '#aaf8ff' };
}

export function getDanceGaugeSegmentColor(
  segmentIndex: number,
  segmentCount = DANCE_GAUGE_SEGMENT_COUNT,
  time = 0,
  rainbow = false,
): { fill: string; glow: string; edge: string } {
  const t = (segmentIndex + 0.5) / segmentCount;
  if (rainbow) {
    const hue = (time * 140 + segmentIndex * 30) % 360;
    const hue2 = (hue + 28) % 360;
    return {
      fill: `hsl(${hue}, 96%, 56%)`,
      glow: `hsl(${hue2}, 100%, 68%)`,
      edge: `hsl(${(hue + 14) % 360}, 100%, 78%)`,
    };
  }
  const { r, g, b } = getDanceGaugeEnergyRgb(t);
  const edge = getDanceGaugeEnergyColor(Math.max(0, t - 0.04));
  const glow = getDanceGaugeEnergyColor(Math.min(1, t + 0.06));
  const fill = `rgb(${Math.round(r * 0.88)},${Math.round(g * 0.88)},${Math.round(b * 0.88)})`;
  return { fill, glow, edge };
}

export function formatDanceGaugePercent(gauge: number): string {
  return `${Math.floor(clampDanceGauge(gauge) * 100)}%`;
}
