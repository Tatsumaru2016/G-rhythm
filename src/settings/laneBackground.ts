import {
  DEFAULT_LANE_BACKGROUND,
  isValidLaneBackgroundId,
  type LaneBackgroundId,
} from '../game/laneBackground';

const STORAGE_KEY = 'g-rhythm-lane-background-v1';

export function loadLaneBackground(): LaneBackgroundId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isValidLaneBackgroundId(stored)) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_LANE_BACKGROUND;
}

export function saveLaneBackground(id: LaneBackgroundId): void {
  try {
    if (isValidLaneBackgroundId(id)) {
      localStorage.setItem(STORAGE_KEY, id);
    }
  } catch {
    /* ignore */
  }
}

export function normalizeLaneBackground(value: string): LaneBackgroundId {
  if (isValidLaneBackgroundId(value)) return value;
  return DEFAULT_LANE_BACKGROUND;
}
