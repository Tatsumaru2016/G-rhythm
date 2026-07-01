import { describe, expect, it } from 'vitest';
import { gradeToResultStars, RESULT_STAR_MAX } from './resultStars';

describe('gradeToResultStars', () => {
  it('returns zero stars on failed runs', () => {
    expect(gradeToResultStars('AAA', true)).toBe(0);
    expect(gradeToResultStars('E', true)).toBe(0);
  });

  it('maps AAA to max stars', () => {
    expect(gradeToResultStars('AAA')).toBe(RESULT_STAR_MAX);
  });

  it('maps low passing grades to one star', () => {
    expect(gradeToResultStars('D')).toBe(1);
    expect(gradeToResultStars('E')).toBe(0);
  });
});
