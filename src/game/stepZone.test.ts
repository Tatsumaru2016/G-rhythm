import { describe, expect, it } from 'vitest';
import { judgmentLineOffsetPx, judgmentLineY, stepZoneBottom, stepZoneTop } from './stepZone';

describe('stepZone', () => {
  const center = 400;
  const height = 40;

  it('uses full zone height for timing offset', () => {
    expect(judgmentLineOffsetPx(height, -0.9)).toBe(-18);
    expect(judgmentLineOffsetPx(height, 0.9)).toBe(18);
    expect(judgmentLineOffsetPx(height, 0)).toBe(0);
  });

  it('places judgment line inside the step zone', () => {
    expect(judgmentLineY(center, height, -0.9)).toBe(center - 18);
    expect(judgmentLineY(center, height, 0.9)).toBe(center + 18);
    expect(stepZoneTop(center, height)).toBe(380);
    expect(stepZoneBottom(center, height)).toBe(420);
  });
});
