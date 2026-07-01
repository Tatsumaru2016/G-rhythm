import type { ChartData } from '../types';
import {
  DDR_GRADE_ORDER,
  type DdrGrade,
  isDdrGradeHigher,
} from '../scoring/ddrScoring';
import { chartSongRecordKey } from './songRecordKey';

const STORAGE_KEY = 'g-rhythm-song-best-grades';

type GradeStore = Record<string, DdrGrade>;

const VALID_GRADES = new Set<string>(DDR_GRADE_ORDER);

function loadStore(): GradeStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const store: GradeStore = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && VALID_GRADES.has(value)) {
        store[key] = value as DdrGrade;
      }
    }
    return store;
  } catch {
    return {};
  }
}

function saveStore(store: GradeStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

export function getSongBestGrade(recordKey: string): DdrGrade | null {
  return loadStore()[recordKey] ?? null;
}

export function getBestGradeForChart(chart: ChartData): DdrGrade | null {
  return getSongBestGrade(chartSongRecordKey(chart));
}

/** 今回のランクが記録更新なら true */
export function recordSongBestGrade(chart: ChartData, grade: DdrGrade): boolean {
  const key = chartSongRecordKey(chart);
  const store = loadStore();
  const prev = store[key];
  if (prev && !isDdrGradeHigher(grade, prev)) return false;
  store[key] = grade;
  saveStore(store);
  return !prev || isDdrGradeHigher(grade, prev);
}
