import { describe, expect, it } from 'vitest';
import {
  LANE_BG_STRIP_RECOMMENDED,
  LANE_BG_TEXTURE_RECOMMENDED,
  LANE_MAX_WIDTH_PX,
  LANE_PLAYFIELD_MAX_WIDTH_PX,
  getLaneBackgroundPixelSize,
} from './laneBackground';

describe('laneBackground dimensions', () => {
  it('exports recommended texture sizes', () => {
    expect(LANE_PLAYFIELD_MAX_WIDTH_PX).toBe(392);
    expect(LANE_MAX_WIDTH_PX).toBe(98);
    expect(LANE_BG_TEXTURE_RECOMMENDED).toEqual({ width: 98, height: 512 });
    expect(LANE_BG_STRIP_RECOMMENDED).toEqual({ width: 392, height: 512 });
  });

  it('reports live layout pixel size', () => {
    expect(
      getLaneBackgroundPixelSize({
        laneStartX: 100,
        laneTopY: 0,
        laneBottomY: 900,
        laneWidth: 80,
      }),
    ).toEqual({ stripWidth: 320, stripHeight: 900, laneWidth: 80 });
  });
});
