import { describe, expect, it } from 'vitest';
import { judgeTiming, MARVELOUS_WINDOW_MS } from './Judgment';
import { JUDGMENTS } from '../types';

describe('judgeTiming', () => {
  it('returns marvelous inside the tight window', () => {
    expect(judgeTiming(0)).toBe('marvelous');
    expect(judgeTiming(MARVELOUS_WINDOW_MS)).toBe('marvelous');
    expect(judgeTiming(-MARVELOUS_WINDOW_MS)).toBe('marvelous');
  });

  it('returns perfect between marvelous and great windows', () => {
    const perfectWindow = JUDGMENTS.find((j) => j.name === 'perfect')!.windowMs;
    expect(judgeTiming(MARVELOUS_WINDOW_MS + 1)).toBe('perfect');
    expect(judgeTiming(perfectWindow)).toBe('perfect');
  });

  it('returns miss outside bad window', () => {
    const badWindow = JUDGMENTS.find((j) => j.name === 'bad')!.windowMs;
    expect(judgeTiming(badWindow + 1)).toBe('miss');
  });
});
