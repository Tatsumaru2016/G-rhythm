import { describe, expect, it } from 'vitest';
import type { ChartData, GameStats } from '../types';
import {
  compareDdrGrades,
  computeDdrMillionScore,
  ddrBasePointPerStep,
  getDdrGrade,
  isDdrGradeHigher,
} from './ddrScoring';

const chart: ChartData = {
  id: 'test',
  title: 'Test',
  artist: 'Test',
  bpm: 120,
  offset: 0,
  lpb: 4,
  difficulty: 'NORMAL',
  level: 5,
  notes: [{ lane: 0, beat: 4, type: 'tap' }],
};

describe('ddrBasePointPerStep', () => {
  it('splits one million across steps', () => {
    expect(ddrBasePointPerStep(100)).toBe(10_000);
  });
});

describe('getDdrGrade', () => {
  it('maps high scores to AAA', () => {
    expect(getDdrGrade(995_000)).toBe('AAA');
  });

  it('maps failed runs to E', () => {
    expect(getDdrGrade(100_000, true)).toBe('E');
  });

  it('maps very low passing scores to D', () => {
    expect(getDdrGrade(100_000)).toBe('D');
  });
});

describe('compareDdrGrades', () => {
  it('orders grades low to high', () => {
    expect(compareDdrGrades('B', 'A')).toBeLessThan(0);
    expect(isDdrGradeHigher('AA', 'A+')).toBe(true);
  });
});

describe('computeDdrMillionScore', () => {
  it('returns zero when no judgments are recorded', () => {
    const stats: GameStats = {
      score: 0,
      combo: 0,
      maxCombo: 0,
      marvelous: 0,
      perfect: 0,
      great: 0,
      good: 0,
      bad: 0,
      miss: 0,
    };
    expect(computeDdrMillionScore(stats, chart)).toBe(0);
  });

  it('scores marvelous at least as high as perfect', () => {
    const marvelousOnly: GameStats = {
      score: 0,
      combo: 1,
      maxCombo: 1,
      marvelous: 1,
      perfect: 0,
      great: 0,
      good: 0,
      bad: 0,
      miss: 0,
    };
    const perfectOnly: GameStats = {
      ...marvelousOnly,
      marvelous: 0,
      perfect: 1,
    };
    expect(computeDdrMillionScore(marvelousOnly, chart)).toBeGreaterThanOrEqual(
      computeDdrMillionScore(perfectOnly, chart),
    );
  });
});
