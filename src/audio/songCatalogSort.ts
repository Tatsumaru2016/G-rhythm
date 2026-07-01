import type { CustomTrackEntry } from './CustomSongLoader';
import type { SongSortSettings } from '../settings/songSort';

export interface CatalogSortRow {
  catalogIndex: number;
  track: CustomTrackEntry;
}

export interface FolderTrackSortMeta {
  bpm: number | null;
  duration: number | null;
}

function compareLocale(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function applyDirection(value: number, direction: SongSortSettings['direction']): number {
  return direction === 'desc' ? -value : value;
}

function compareOptionalNumber(
  a: number | null,
  b: number | null,
  direction: SongSortSettings['direction'],
): number {
  const missing = direction === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const av = a ?? missing;
  const bv = b ?? missing;
  return av - bv;
}

export function sortFolderCatalog(
  catalog: readonly CustomTrackEntry[],
  settings: SongSortSettings,
  getMeta: (track: CustomTrackEntry) => FolderTrackSortMeta,
): CatalogSortRow[] {
  const rows = catalog.map((track, catalogIndex) => ({ catalogIndex, track }));
  if (settings.key === 'default') return rows;

  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (settings.key) {
      case 'title':
        cmp = compareLocale(a.track.title, b.track.title);
        break;
      case 'name':
        cmp = compareLocale(a.track.file.name, b.track.file.name);
        break;
      case 'bpm':
        cmp = compareOptionalNumber(getMeta(a.track).bpm, getMeta(b.track).bpm, settings.direction);
        break;
      case 'duration':
        cmp = compareOptionalNumber(
          getMeta(a.track).duration,
          getMeta(b.track).duration,
          settings.direction,
        );
        break;
      default:
        cmp = 0;
    }
    if (cmp === 0) cmp = a.catalogIndex - b.catalogIndex;
    return applyDirection(cmp, settings.direction);
  });
}

function sortedRows(
  catalog: readonly CustomTrackEntry[],
  settings: SongSortSettings,
  getMeta: (track: CustomTrackEntry) => FolderTrackSortMeta,
): CatalogSortRow[] {
  return sortFolderCatalog(catalog, settings, getMeta);
}

export function folderCatalogDisplayIndex(
  catalog: readonly CustomTrackEntry[],
  settings: SongSortSettings,
  catalogIndex: number,
  getMeta: (track: CustomTrackEntry) => FolderTrackSortMeta,
): number {
  return sortedRows(catalog, settings, getMeta).findIndex(
    (row) => row.catalogIndex === catalogIndex,
  );
}

export function stepFolderCatalogIndex(
  catalog: readonly CustomTrackEntry[],
  settings: SongSortSettings,
  currentCatalogIndex: number,
  delta: number,
  getMeta: (track: CustomTrackEntry) => FolderTrackSortMeta,
): number {
  const rows = sortedRows(catalog, settings, getMeta);
  if (!rows.length) return 0;
  const displayIndex = folderCatalogDisplayIndex(catalog, settings, currentCatalogIndex, getMeta);
  const base = displayIndex < 0 ? 0 : displayIndex;
  const nextDisplay = (base + delta + rows.length) % rows.length;
  return rows[nextDisplay].catalogIndex;
}

export function firstFolderCatalogIndex(
  catalog: readonly CustomTrackEntry[],
  settings: SongSortSettings,
  getMeta: (track: CustomTrackEntry) => FolderTrackSortMeta,
): number {
  return sortedRows(catalog, settings, getMeta)[0]?.catalogIndex ?? 0;
}

export function lastFolderCatalogIndex(
  catalog: readonly CustomTrackEntry[],
  settings: SongSortSettings,
  getMeta: (track: CustomTrackEntry) => FolderTrackSortMeta,
): number {
  const rows = sortedRows(catalog, settings, getMeta);
  return rows[rows.length - 1]?.catalogIndex ?? 0;
}
