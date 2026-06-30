import type { ChartData } from '../types';
import {
  computeGrooveRadar,
  GROOVE_RADAR_AXES,
  type GrooveRadarAxis,
  type GrooveRadarStats,
} from './grooveRadar';

/** @deprecated GrooveRadarStats を使用 */
export type ChartRadarStats = GrooveRadarStats;
export type ChartRadarAxis = GrooveRadarAxis;
export const CHART_RADAR_AXES = GROOVE_RADAR_AXES;

export function analyzeChartRadar(chart: ChartData): ChartRadarStats {
  return computeGrooveRadar(chart);
}

export const CHART_STAR_MAX = 5;

export type ChartRadarRank = 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';

function clamp100(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function radarStatsToScore(stats: ChartRadarStats): number {
  const values = CHART_RADAR_AXES.map((key) => stats[key]);
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const peak = Math.max(...values);
  const contrast = Math.max(...values) - Math.min(...values);
  return avg * 0.5 + peak * 0.32 + contrast * 0.18;
}

export function scoreToChartRadarRank(score: number): ChartRadarRank {
  if (score >= 86) return 'SS';
  if (score >= 74) return 'S';
  if (score >= 60) return 'A';
  if (score >= 46) return 'B';
  if (score >= 32) return 'C';
  return 'D';
}

/** グルーヴレーダー形状＋ノーツ量から曲の表示難易度スコア（0〜100）を算出 */
export function chartDifficultyScore(chart: ChartData): number {
  if (chart.notes.length === 0) return 0;
  const stats = analyzeChartRadar(chart);
  const radarScore = radarStatsToScore(stats);
  const noteLoad = clamp100((chart.notes.length / 96) * 100);
  return clamp100(radarScore * 0.62 + noteLoad * 0.38);
}

export function scoreToChartStars(score: number, maxStars = CHART_STAR_MAX): number {
  if (score <= 0) return 0;
  if (score >= 86) return Math.min(maxStars, 5);
  if (score >= 74) return Math.min(maxStars, 4);
  if (score >= 60) return Math.min(maxStars, 3);
  if (score >= 46) return Math.min(maxStars, 2);
  return 1;
}

export function chartRadarRank(chart: ChartData): ChartRadarRank {
  if (chart.notes.length === 0) return 'D';
  return scoreToChartRadarRank(chartDifficultyScore(chart));
}

/** ランクと同じスコア帯から★（1〜CHART_STAR_MAX）を導出 */
export function chartRadarStars(chart: ChartData, maxStars = CHART_STAR_MAX): number {
  if (chart.notes.length === 0) return 0;
  return scoreToChartStars(chartDifficultyScore(chart), maxStars);
}

/** chart.level 表示用（1〜20）。DDR の難易度レベル相当 */
export function chartDisplayLevel(chart: ChartData): number {
  if (chart.notes.length === 0) return 1;
  return Math.min(20, Math.max(1, Math.round((chartDifficultyScore(chart) / 100) * 20)));
}

/** @deprecated chartRadarStars を使用 */
export function chartLevelToStars(level: number, maxStars = CHART_STAR_MAX): number {
  return scoreToChartStars(Math.round((level / 15) * 100), maxStars);
}
