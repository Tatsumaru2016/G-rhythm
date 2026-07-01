import { chartDisplayLevel } from '../chart/chartRadar';
import type { ChartData } from '../types';
import type { SongSortSettings } from '../settings/songSort';

function compareLocale(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function applyDirection(value: number, direction: SongSortSettings['direction']): number {
  return direction === 'desc' ? -value : value;
}

function compareNumber(a: number, b: number): number {
  return a - b;
}

export function sortBuiltinIndices(
  charts: readonly ChartData[],
  settings: SongSortSettings,
): number[] {
  const indices = charts.map((_, index) => index);
  if (settings.key === 'default') return indices;

  return indices.sort((a, b) => {
    let cmp = 0;
    switch (settings.key) {
      case 'title':
        cmp = compareLocale(charts[a].title, charts[b].title);
        break;
      case 'artist':
        cmp = compareLocale(charts[a].artist ?? '', charts[b].artist ?? '');
        break;
      case 'bpm':
        cmp = compareNumber(charts[a].bpm, charts[b].bpm);
        break;
      case 'level':
        cmp = compareNumber(chartDisplayLevel(charts[a]), chartDisplayLevel(charts[b]));
        break;
      case 'notes':
        cmp = compareNumber(charts[a].notes.length, charts[b].notes.length);
        break;
      case 'duration':
        cmp = compareNumber(charts[a].audioDuration ?? 0, charts[b].audioDuration ?? 0);
        break;
      default:
        cmp = 0;
    }
    if (cmp === 0) cmp = compareLocale(charts[a].title, charts[b].title);
    if (cmp === 0) cmp = a - b;
    return applyDirection(cmp, settings.direction);
  });
}

export function stepBuiltinIndex(
  charts: readonly ChartData[],
  settings: SongSortSettings,
  currentIndex: number,
  delta: number,
): number {
  const order = sortBuiltinIndices(charts, settings);
  if (!order.length) return 0;
  const displayIndex = order.indexOf(currentIndex);
  const base = displayIndex < 0 ? 0 : displayIndex;
  const nextDisplay = (base + delta + order.length) % order.length;
  return order[nextDisplay];
}
