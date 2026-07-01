import type { ChartData, GameStats } from '../types';
import chartNeonPulse from '../charts/neon-pulse.json';
import chartStarfall from '../charts/starfall.json';
import chartVelocity from '../charts/velocity.json';
import { syncBuiltinChartFromAudio } from './builtinChartSync';
import {
  computeDdrMillionScore,
  formatDdrAccuracy,
  getDdrGrade,
  getDdrAccuracyRatio,
  type DdrGrade,
} from '../scoring/ddrScoring';

export const CHARTS: ChartData[] = [
  chartNeonPulse as ChartData,
  chartStarfall as ChartData,
  chartVelocity as ChartData,
];

/** 読み込んだ内蔵曲 MP3 から BPM / NOTES / LV を反映 */
export function applyBuiltinAudioSync(buffers: ReadonlyMap<string, AudioBuffer>): void {
  for (let i = 0; i < CHARTS.length; i++) {
    const chart = CHARTS[i];
    const buffer = buffers.get(chart.id);
    if (!buffer) continue;
    CHARTS[i] = syncBuiltinChartFromAudio(chart, buffer);
  }
}

export function getRank(stats: GameStats, chart: ChartData): DdrGrade {
  const score = computeDdrMillionScore(stats, chart);
  return getDdrGrade(score, stats.failed === true);
}

export function getAccuracy(stats: GameStats): string {
  return formatDdrAccuracy(stats.score);
}

/** 0〜1 の達成率（ヒット音のピッチ・派手さに使用） */
export function getAccuracyRatio(stats: GameStats): number {
  return getDdrAccuracyRatio(stats.score);
}
