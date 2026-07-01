import type { MusicGenre } from '../types';

const STORAGE_KEY = 'g-rhythm-track-meta-v1';

export interface PersistedTrackMeta {
  bpm: number;
  duration: number;
  genre: MusicGenre;
  genreConfidence: number;
  levels?: Record<string, number>;
}

const VALID_GENRES = new Set<MusicGenre>([
  'electronic',
  'rock',
  'pop',
  'jazz',
  'classical',
  'hiphop',
  'other',
]);

function loadStore(): Record<string, PersistedTrackMeta> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const store: Record<string, PersistedTrackMeta> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') continue;
      const v = value as PersistedTrackMeta;
      if (
        typeof v.bpm === 'number' &&
        typeof v.duration === 'number' &&
        typeof v.genreConfidence === 'number' &&
        typeof v.genre === 'string' &&
        VALID_GENRES.has(v.genre as MusicGenre)
      ) {
        const levels: Record<string, number> = {};
        if (v.levels && typeof v.levels === 'object') {
          for (const [key, value] of Object.entries(v.levels)) {
            if (typeof value === 'number' && value > 0) levels[key] = value;
          }
        }
        store[key] = {
          bpm: v.bpm,
          duration: v.duration,
          genre: v.genre as MusicGenre,
          genreConfidence: v.genreConfidence,
          ...(Object.keys(levels).length > 0 ? { levels } : {}),
        };
      }
    }
    return store;
  } catch {
    return {};
  }
}

function saveStore(store: Record<string, PersistedTrackMeta>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

export function getPersistedTrackMeta(recordKey: string): PersistedTrackMeta | null {
  return loadStore()[recordKey] ?? null;
}

export function savePersistedTrackMeta(recordKey: string, meta: PersistedTrackMeta): void {
  const store = loadStore();
  store[recordKey] = meta;
  saveStore(store);
}

export function savePersistedTrackLevel(
  recordKey: string,
  difficulty: string,
  level: number,
): void {
  const meta = getPersistedTrackMeta(recordKey);
  if (!meta || level <= 0) return;
  savePersistedTrackMeta(recordKey, {
    ...meta,
    levels: { ...meta.levels, [difficulty]: level },
  });
}

export function prunePersistedTrackMeta(validKeys: ReadonlySet<string>): void {
  const store = loadStore();
  let changed = false;
  for (const key of Object.keys(store)) {
    if (!validKeys.has(key)) {
      delete store[key];
      changed = true;
    }
  }
  if (changed) saveStore(store);
}
