import type { ChartData, GameStats } from '../types';
import chartNeonPulse from '../charts/neon-pulse.json';
import chartStarfall from '../charts/starfall.json';
import chartVelocity from '../charts/velocity.json';
import { syncBuiltinChartFromAudio } from './builtinChartSync';

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

export function getRank(stats: GameStats, maxNotes: number): string {
  const total = stats.perfect + stats.great + stats.good + stats.bad + stats.miss;
  if (total === 0) return 'D';
  const ratio = (stats.perfect + stats.great * 0.8 + stats.good * 0.5) / Math.max(total, maxNotes);
  if (ratio >= 0.98) return 'S+';
  if (ratio >= 0.95) return 'S';
  if (ratio >= 0.90) return 'A';
  if (ratio >= 0.80) return 'B';
  if (ratio >= 0.65) return 'C';
  return 'D';
}

export function getAccuracy(stats: GameStats): string {
  const total = stats.perfect + stats.great + stats.good + stats.bad + stats.miss;
  if (total === 0) return '0.00';
  const acc = (stats.perfect + stats.great * 0.7 + stats.good * 0.4) / total * 100;
  return acc.toFixed(2);
}

/** 0〜1 の成功率（ヒット音のピッチ・派手さに使用） */
export function getAccuracyRatio(stats: GameStats): number {
  const total = stats.perfect + stats.great + stats.good + stats.bad + stats.miss;
  if (total === 0) return 0.5;
  return (stats.perfect + stats.great * 0.7 + stats.good * 0.4) / total;
}
