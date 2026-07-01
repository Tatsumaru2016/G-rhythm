import { describe, expect, it } from 'vitest';
import type { ChartData } from '../types';
import {
  analyzeChart,
  computeChartRawMetrics,
  computeWeightedDifficulty,
  difficultyNormToLevel,
  metricsToRadarAxes,
  normalizeChartMetrics,
} from './chartMetrics';

function miniChart(notes: ChartData['notes']): ChartData {
  return {
    id: 'test',
    title: 'Test',
    artist: 'Artist',
    bpm: 120,
    offset: 0,
    lpb: 4,
    difficulty: 'NORMAL',
    level: 5,
    notes,
  };
}

describe('computeChartRawMetrics', () => {
  it('counts tap notes', () => {
    const chart = miniChart([
      { lane: 0, beat: 4, type: 'tap' },
      { lane: 1, beat: 8, type: 'tap' },
    ]);
    const raw = computeChartRawMetrics(chart);
    expect(raw.totalNotes).toBe(2);
    expect(raw.bpm).toBe(120);
  });
});

describe('normalizeChartMetrics', () => {
  it('clamps normalized values between 0 and 1', () => {
    const chart = miniChart([{ lane: 0, beat: 4, type: 'tap' }]);
    const norm = normalizeChartMetrics(computeChartRawMetrics(chart));
    for (const value of Object.values(norm)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe('metricsToRadarAxes', () => {
  it('returns 0-100 radar scores', () => {
    const chart = miniChart([
      { lane: 0, beat: 4, type: 'tap' },
      { lane: 2, beat: 8, type: 'hold', duration: 8 },
    ]);
    const axes = metricsToRadarAxes(normalizeChartMetrics(computeChartRawMetrics(chart)));
    for (const value of Object.values(axes)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});

describe('analyzeChart', () => {
  it('derives a difficulty level from chart density', () => {
    const chart = miniChart(
      Array.from({ length: 40 }, (_, i) => ({
        lane: (i % 4) as 0 | 1 | 2 | 3,
        beat: 4 + i * 2,
        type: 'tap' as const,
      })),
    );
    const analysis = analyzeChart(chart);
    expect(analysis.level).toBe(
      difficultyNormToLevel(computeWeightedDifficulty(analysis.normalized)),
    );
    expect(analysis.level).toBeGreaterThanOrEqual(1);
  });
});
