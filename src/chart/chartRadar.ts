import type { ChartData } from '../types';
import {
  analyzeChart,
  CHART_RADAR_AXIS_ORDER,
  type ChartAnalysis,
  type ChartRadarAxes,
  type ChartRadarAxis,
  type ChartTraitIndices,
} from './chartMetrics';

export type ChartRadarStats = ChartRadarAxes;
export type { ChartRadarAxis, ChartAnalysis, ChartTraitIndices };
export const CHART_RADAR_AXES = CHART_RADAR_AXIS_ORDER;

export function analyzeChartRadar(chart: ChartData): ChartRadarStats {
  return analyzeChart(chart).axes;
}

export function analyzeChartFull(chart: ChartData): ChartAnalysis {
  return analyzeChart(chart);
}

export const CHART_STAR_MAX = 5;

export type ChartRadarRank = 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';

function clamp100(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** 5 軸 Groove Radar の総合プロファイル（0〜100） */
export function radarStatsToScore(stats: ChartRadarStats): number {
  const values = CHART_RADAR_AXES.map((key) => stats[key]);
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const peak = Math.max(...values);
  return avg * 0.62 + peak * 0.38;
}

export function scoreToChartRadarRank(score: number): ChartRadarRank {
  if (score >= 86) return 'SS';
  if (score >= 74) return 'S';
  if (score >= 60) return 'A';
  if (score >= 46) return 'B';
  if (score >= 32) return 'C';
  return 'D';
}

/**
 * 譜面難易度スコア（0〜100）。
 * レベル (1〜20) と同じ difficultyNorm を唯一のソースとする。
 */
export function chartDifficultyScore(chart: ChartData): number {
  if (chart.notes.length === 0) return 0;
  return clamp100(analyzeChart(chart).difficultyNorm * 100);
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

export function chartRadarStars(chart: ChartData, maxStars = CHART_STAR_MAX): number {
  if (chart.notes.length === 0) return 0;
  return scoreToChartStars(chartDifficultyScore(chart), maxStars);
}

/** 表示レベル Lv1〜20（G.DANSYNC 重み付け → DDR 足数相当） */
export function chartDisplayLevel(chart: ChartData): number {
  if (chart.notes.length === 0) return 1;
  return analyzeChart(chart).level;
}
