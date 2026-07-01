import { describe, expect, it } from 'vitest';
import type { ChartData } from '../types';
import { beatToTime, parseChart, withLeadInPad } from './ChartParser';

const sampleChart: ChartData = {
  id: 'test',
  title: 'Test',
  artist: 'Test',
  bpm: 120,
  offset: 1,
  lpb: 4,
  difficulty: 'NORMAL',
  level: 5,
  notes: [
    { lane: 0, beat: 4, type: 'tap' },
    { lane: 1, beat: 8, type: 'hold', duration: 4 },
  ],
};

describe('beatToTime', () => {
  it('converts quarter-note beats using offset', () => {
    expect(beatToTime(0, sampleChart)).toBe(1);
    expect(beatToTime(2, sampleChart)).toBe(2);
  });
});

describe('parseChart', () => {
  it('creates active notes with hold end times', () => {
    const notes = parseChart(sampleChart);
    expect(notes).toHaveLength(2);
    expect(notes[1].type).toBe('hold');
    expect(notes[1].endTime).toBeGreaterThan(notes[1].time);
  });
});

describe('withLeadInPad', () => {
  it('extends offset when the first note is too soon', () => {
    const padded = withLeadInPad(sampleChart, 3);
    expect(padded.offset).toBeGreaterThan(sampleChart.offset);
  });
});
