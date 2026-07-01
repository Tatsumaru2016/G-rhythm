import { describe, expect, it } from 'vitest';
import type { ChartData } from '../types';
import { sortBuiltinIndices, stepBuiltinIndex } from './builtinCatalogSort';

function chart(id: string, title: string, bpm = 120): ChartData {
  return {
    id,
    title,
    artist: 'Artist',
    bpm,
    offset: 0,
    lpb: 4,
    difficulty: 'NORMAL',
    level: 5,
    notes: [{ lane: 0, beat: 4, type: 'tap' }],
  };
}

const charts = [chart('b', 'Bravo', 140), chart('a', 'Alpha', 120), chart('c', 'Charlie', 100)];

describe('sortBuiltinIndices', () => {
  it('sorts by title ascending', () => {
    const order = sortBuiltinIndices(charts, { key: 'title', direction: 'asc' });
    expect(order.map((i) => charts[i].title)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('keeps default catalog order', () => {
    const order = sortBuiltinIndices(charts, { key: 'default', direction: 'asc' });
    expect(order).toEqual([0, 1, 2]);
  });

  it('sorts by bpm descending', () => {
    const order = sortBuiltinIndices(charts, { key: 'bpm', direction: 'desc' });
    expect(order.map((i) => charts[i].bpm)).toEqual([140, 120, 100]);
  });
});

describe('stepBuiltinIndex', () => {
  it('steps through sorted display order', () => {
    const settings = { key: 'title' as const, direction: 'asc' as const };
    expect(stepBuiltinIndex(charts, settings, 0, 1)).toBe(2);
    expect(stepBuiltinIndex(charts, settings, 2, -1)).toBe(0);
  });
});
