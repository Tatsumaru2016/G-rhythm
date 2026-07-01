import { describe, expect, it } from 'vitest';
import { folderCatalogDisplayIndex, sortFolderCatalog } from './songCatalogSort';
import type { CustomTrackEntry } from './CustomSongLoader';

function track(name: string, title = name): CustomTrackEntry {
  return { id: name, title, file: new File([], name) };
}

describe('sortFolderCatalog', () => {
  const catalog = [track('b.mp3', 'Bravo'), track('a.mp3', 'Alpha'), track('c.mp3', 'Charlie')];

  it('sorts by title ascending', () => {
    const rows = sortFolderCatalog(catalog, { key: 'title', direction: 'asc' }, () => ({
      bpm: null,
      duration: null,
    }));
    expect(rows.map((row) => row.track.title)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('keeps default catalog order', () => {
    const rows = sortFolderCatalog(catalog, { key: 'default', direction: 'asc' }, () => ({
      bpm: null,
      duration: null,
    }));
    expect(rows.map((row) => row.catalogIndex)).toEqual([0, 1, 2]);
  });
});

describe('folderCatalogDisplayIndex', () => {
  it('maps catalog index to sorted position', () => {
    const catalog = [track('b.mp3', 'Bravo'), track('a.mp3', 'Alpha'), track('c.mp3', 'Charlie')];
    const meta = () => ({ bpm: null, duration: null });
    const settings = { key: 'title' as const, direction: 'asc' as const };
    expect(folderCatalogDisplayIndex(catalog, settings, 0, meta)).toBe(1);
    expect(folderCatalogDisplayIndex(catalog, settings, 2, meta)).toBe(2);
  });
});
