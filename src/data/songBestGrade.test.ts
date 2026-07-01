import { beforeEach, describe, expect, it } from 'vitest';
import type { ChartData } from '../types';
import { getBestGradeForChart, recordSongBestGrade } from './songBestGrade';

function mockLocalStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
    configurable: true,
  });
}

const chart: ChartData = {
  id: 'test-song',
  title: 'TEST',
  artist: '',
  bpm: 120,
  offset: 0,
  lpb: 4,
  difficulty: 'NORMAL',
  level: 1,
  notes: [],
};

describe('songBestGrade', () => {
  beforeEach(() => {
    mockLocalStorage();
    localStorage.clear();
  });

  it('records and reads best grade by chart key', () => {
    expect(recordSongBestGrade(chart, 'B')).toBe(true);
    expect(getBestGradeForChart(chart)).toBe('B');
  });

  it('keeps higher grade when a worse result is recorded', () => {
    recordSongBestGrade(chart, 'A');
    expect(recordSongBestGrade(chart, 'C')).toBe(false);
    expect(getBestGradeForChart(chart)).toBe('A');
  });

  it('records failed E rank', () => {
    expect(recordSongBestGrade(chart, 'E')).toBe(true);
    expect(getBestGradeForChart(chart)).toBe('E');
  });
});
