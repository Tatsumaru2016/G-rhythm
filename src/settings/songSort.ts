import type { MessageKey } from '../i18n/messages';

export type SongSortKey =
  'default' | 'title' | 'name' | 'artist' | 'bpm' | 'level' | 'notes' | 'duration';

export type SongSortDirection = 'asc' | 'desc';

export interface SongSortSettings {
  key: SongSortKey;
  direction: SongSortDirection;
}

export const DEFAULT_SONG_SORT: SongSortSettings = { key: 'default', direction: 'asc' };

export const BUILTIN_SORT_KEYS: readonly SongSortKey[] = [
  'default',
  'title',
  'artist',
  'bpm',
  'level',
  'notes',
  'duration',
];

export const FOLDER_SORT_KEYS: readonly SongSortKey[] = [
  'default',
  'title',
  'name',
  'bpm',
  'duration',
];

const FOLDER_STORAGE_KEY = 'g-rhythm-folder-song-sort';
const BUILTIN_STORAGE_KEY = 'g-rhythm-builtin-song-sort';

const LEGACY_MODE_MAP: Record<string, SongSortSettings> = {
  default: DEFAULT_SONG_SORT,
  titleAsc: { key: 'title', direction: 'asc' },
  titleDesc: { key: 'title', direction: 'desc' },
  nameAsc: { key: 'name', direction: 'asc' },
  nameDesc: { key: 'name', direction: 'desc' },
  levelAsc: { key: 'level', direction: 'asc' },
  levelDesc: { key: 'level', direction: 'desc' },
  bpmAsc: { key: 'bpm', direction: 'asc' },
  bpmDesc: { key: 'bpm', direction: 'desc' },
};

function isSongSortKey(value: string, allowed: readonly SongSortKey[]): value is SongSortKey {
  return (allowed as readonly string[]).includes(value);
}

function normalizeSettings(raw: unknown, allowedKeys: readonly SongSortKey[]): SongSortSettings {
  if (typeof raw === 'string') {
    return LEGACY_MODE_MAP[raw] ?? DEFAULT_SONG_SORT;
  }
  if (!raw || typeof raw !== 'object') return DEFAULT_SONG_SORT;
  const candidate = raw as Partial<SongSortSettings>;
  const key =
    typeof candidate.key === 'string' && isSongSortKey(candidate.key, allowedKeys)
      ? candidate.key
      : 'default';
  const direction = candidate.direction === 'desc' ? 'desc' : 'asc';
  return { key, direction };
}

function loadSettings(storageKey: string, allowedKeys: readonly SongSortKey[]): SongSortSettings {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return DEFAULT_SONG_SORT;
    if (stored.startsWith('{')) {
      return normalizeSettings(JSON.parse(stored), allowedKeys);
    }
    return normalizeSettings(stored, allowedKeys);
  } catch {
    /* ignore */
  }
  return DEFAULT_SONG_SORT;
}

function saveSettings(storageKey: string, settings: SongSortSettings): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function loadFolderSongSort(): SongSortSettings {
  return loadSettings(FOLDER_STORAGE_KEY, FOLDER_SORT_KEYS);
}

export function saveFolderSongSort(settings: SongSortSettings): void {
  saveSettings(FOLDER_STORAGE_KEY, settings);
}

export function loadBuiltinSongSort(): SongSortSettings {
  return loadSettings(BUILTIN_STORAGE_KEY, BUILTIN_SORT_KEYS);
}

export function saveBuiltinSongSort(settings: SongSortSettings): void {
  saveSettings(BUILTIN_STORAGE_KEY, settings);
}

export function songSortKeyLabelKey(key: SongSortKey): MessageKey {
  return `ui.songSort.${key}` as MessageKey;
}

export function isSongSortDirectionEnabled(settings: SongSortSettings): boolean {
  return settings.key !== 'default';
}
