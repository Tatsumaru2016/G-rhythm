import { describe, expect, it } from 'vitest';
import {
  buildRandomPickRouletteSteps,
  pickRandomCatalogIndex,
  randomRouletteStepDelay,
} from './randomPickSequence';

describe('pickRandomCatalogIndex', () => {
  it('returns 0 for single-item catalogs', () => {
    expect(pickRandomCatalogIndex(1, 0)).toBe(0);
  });

  it('avoids the current index when possible', () => {
    for (let i = 0; i < 20; i++) {
      const picked = pickRandomCatalogIndex(5, 2);
      expect(picked).not.toBe(2);
    }
  });
});

describe('buildRandomPickRouletteSteps', () => {
  it('ends on the target catalog index', () => {
    const indices = [10, 20, 30, 40, 50];
    const steps = buildRandomPickRouletteSteps(indices, 10, 50);
    expect(steps[steps.length - 1]).toBe(50);
  });
});

describe('randomRouletteStepDelay', () => {
  it('slows down toward the end', () => {
    const early = randomRouletteStepDelay(0, 10);
    const late = randomRouletteStepDelay(8, 10);
    expect(late).toBeGreaterThan(early);
  });
});
