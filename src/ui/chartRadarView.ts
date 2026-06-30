import {
  analyzeChartRadar,
  CHART_RADAR_AXES,
  chartDisplayLevel,
  type ChartRadarStats,
} from '../chart/chartRadar';
import type { ChartData } from '../types';
import { t } from '../i18n';

const RADAR_CENTER = 100;
const RADAR_RADIUS = 72;
const VIEWBOX_PAD = 40;
const VIEWBOX_SIZE = 200 + VIEWBOX_PAD * 2;

function polarPoint(angleRad: number, radius: number): { x: number; y: number } {
  return {
    x: RADAR_CENTER + Math.sin(angleRad) * radius,
    y: RADAR_CENTER - Math.cos(angleRad) * radius,
  };
}

function axisAngle(index: number): number {
  return (Math.PI * 2 * index) / CHART_RADAR_AXES.length;
}

function polygonPoints(values: number[], maxRadius = RADAR_RADIUS): string {
  return values.map((value, i) => {
    const r = (Math.min(100, Math.max(0, value)) / 100) * maxRadius;
    const { x, y } = polarPoint(axisAngle(i), r);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function gridPolygon(scale: number): string {
  const points = CHART_RADAR_AXES.map((_, i) => {
    const { x, y } = polarPoint(axisAngle(i), RADAR_RADIUS * scale);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return points.join(' ');
}

function gridPolygonMarkup(scale: number): string {
  const points = gridPolygon(scale);
  const outer = scale === 1;
  if (outer) {
    return `
      <polygon class="chart-radar-grid-outline chart-radar-grid-outline--outer" points="${points}" />
      <polygon class="chart-radar-grid chart-radar-grid--outer" points="${points}" />
    `;
  }
  return `<polygon class="chart-radar-grid" points="${points}" />`;
}

function axisLine(x1: number, y1: number, x2: number, y2: number): string {
  return `<line class="chart-radar-axis" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" />`;
}

function dataShape(points: string, fillPaint: string): string {
  return `<polygon class="chart-radar-fill" points="${points}" ${fillPaint} />`;
}

export function renderChartLevelHtml(
  chart: ChartData | null,
  variant: 'default' | 'card' = 'default',
): string {
  const level = chart && chart.notes.length > 0 ? chartDisplayLevel(chart) : null;
  const label = level !== null ? t('ui.levelEn', { level }) : '—';
  const cardClass = variant === 'card' ? ' song-chart-level--card' : '';
  return `<span class="song-chart-level${cardClass}" aria-label="${t('ui.chartLevel', { level: level ?? 0 })}">${label}</span>`;
}

export function renderChartRatingHtml(
  chart: ChartData | null,
  variant: 'default' | 'card' = 'default',
): string {
  const levelHtml = renderChartLevelHtml(chart, variant);

  if (variant === 'card') {
    return `
      <div class="song-chart-rating song-chart-rating--card">
        ${levelHtml}
      </div>
    `;
  }

  return `
    <div class="song-chart-rating" id="song-chart-rating">
      ${levelHtml}
    </div>
  `;
}

function radarSvgUid(seed: string): string {
  return seed.replace(/[^a-zA-Z0-9_-]/g, '') || 'chart';
}

export function renderChartRadarSvg(stats: ChartRadarStats, large = false, chartId = 'chart'): string {
  const uid = radarSvgUid(chartId);
  const gradId = `chart-radar-fill-grad-${uid}`;
  const values = CHART_RADAR_AXES.map((key) => stats[key]);
  const gridLevels = [0.25, 0.5, 0.75, 1];
  const labelRadius = large ? RADAR_RADIUS + 18 : RADAR_RADIUS + 16;
  const labelClass = large ? 'chart-radar-label chart-radar-label--large' : 'chart-radar-label';
  const svgClass = large ? 'chart-radar-svg chart-radar-svg--large' : 'chart-radar-svg';

  const axes = CHART_RADAR_AXES.map((key, i) => {
    const outer = polarPoint(axisAngle(i), RADAR_RADIUS);
    const { x, y } = polarPoint(axisAngle(i), labelRadius);
    let anchor = 'middle';
    let baseline = 'middle';
    if (x < RADAR_CENTER - 8) anchor = 'end';
    else if (x > RADAR_CENTER + 8) anchor = 'start';
    if (y < RADAR_CENTER - 8) baseline = 'hanging';
    else if (y > RADAR_CENTER + 8) baseline = 'text-after-edge';
    return `
      ${axisLine(RADAR_CENTER, RADAR_CENTER, outer.x, outer.y)}
      <text class="${labelClass}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="${baseline}">${t(`ui.radar.${key}`)}</text>
    `;
  }).join('');

  const defs = large ? `
    <defs>
      <radialGradient id="${gradId}" cx="${RADAR_CENTER}" cy="${RADAR_CENTER}" r="${RADAR_RADIUS}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#d4fcff" stop-opacity="0.92" />
        <stop offset="45%" stop-color="#4deaff" stop-opacity="0.74" />
        <stop offset="100%" stop-color="#00a0e0" stop-opacity="0.58" />
      </radialGradient>
    </defs>
  ` : '';

  const bodyFill = `<polygon class="chart-radar-body" points="${gridPolygon(1)}" />`;

  const grids = gridLevels.map((scale) => gridPolygonMarkup(scale)).join('');

  const dataPoints = polygonPoints(values);
  const fillPaint = large
    ? `fill="url(#${gradId})"`
    : 'fill="rgba(0, 210, 255, 0.52)"';

  const svg = `
    <svg class="${svgClass}" viewBox="${-VIEWBOX_PAD} ${-VIEWBOX_PAD} ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}" role="img" aria-label="${t('ui.chartRadar')}" data-chart-id="${uid}">
      ${defs}
      ${bodyFill}
      ${grids}
      ${axes}
      ${dataShape(dataPoints, fillPaint)}
    </svg>
  `;

  if (large) {
    return `<div class="chart-radar-disc">${svg}</div>`;
  }

  return svg;
}

export function renderSongChartAnalysisHtml(
  chart: ChartData | null,
  options?: { largeRadar?: boolean },
): {
  ratingHtml: string;
  radarHtml: string;
} {
  const largeRadar = options?.largeRadar ?? false;
  const chartId = chart?.id ?? 'empty';
  if (!chart || chart.notes.length === 0) {
    return {
      ratingHtml: renderChartRatingHtml(null),
      radarHtml: renderChartRadarSvg({ stream: 0, voltage: 0, chaos: 0, air: 0, freeze: 0 }, largeRadar, chartId),
    };
  }
  return {
    ratingHtml: renderChartRatingHtml(chart),
    radarHtml: renderChartRadarSvg(analyzeChartRadar(chart), largeRadar, chartId),
  };
}
