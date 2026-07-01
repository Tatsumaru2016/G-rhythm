import type { ChartData } from '../types';
import {
  analyzeChart,
  CHART_RADAR_AXIS_ORDER,
  type ChartRadarAxes,
  type ChartRadarAxis,
} from './chartMetrics';

/** @deprecated ChartRadarAxes を使用 */
export type GrooveRadarStats = ChartRadarAxes;
export type GrooveRadarAxis = ChartRadarAxis;
export const GROOVE_RADAR_AXES = CHART_RADAR_AXIS_ORDER;

export type { ChartRadarAxes, ChartRadarAxis };
export { CHART_RADAR_AXIS_ORDER };

/** DDR Groove Radar 互換 5 軸（STREAM / VOLTAGE / AIR / FREEZE / CHAOS） */
export function computeGrooveRadar(chart: ChartData): ChartRadarAxes {
  return analyzeChart(chart).axes;
}
