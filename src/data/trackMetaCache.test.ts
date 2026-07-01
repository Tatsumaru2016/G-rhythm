import { beforeEach, describe, expect, it } from 'vitest';
import {
  getPersistedTrackMeta,
  prunePersistedTrackMeta,
  savePersistedTrackLevel,
  savePersistedTrackMeta,
} from './trackMetaCache';

function mockLocalStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
    configurable: true,
  });
}

describe('trackMetaCache', () => {
  beforeEach(() => {
    mockLocalStorage();
    localStorage.clear();
  });

  it('saves and loads track meta by record key', () => {
    const key = 'custom:song.mp3:1234:5678';
    savePersistedTrackMeta(key, {
      bpm: 145,
      duration: 198,
      genre: 'pop',
      genreConfidence: 0.8,
    });
    expect(getPersistedTrackMeta(key)).toEqual({
      bpm: 145,
      duration: 198,
      genre: 'pop',
      genreConfidence: 0.8,
    });
  });

  it('prunes stale keys', () => {
    savePersistedTrackMeta('custom:a:1:1', {
      bpm: 120,
      duration: 60,
      genre: 'other',
      genreConfidence: 0,
    });
    savePersistedTrackMeta('custom:b:2:2', {
      bpm: 128,
      duration: 90,
      genre: 'rock',
      genreConfidence: 0.5,
    });
    prunePersistedTrackMeta(new Set(['custom:a:1:1']));
    expect(getPersistedTrackMeta('custom:a:1:1')).not.toBeNull();
    expect(getPersistedTrackMeta('custom:b:2:2')).toBeNull();
  });

  it('saves and loads display levels per difficulty', () => {
    const key = 'custom:song.mp3:1234:5678';
    savePersistedTrackMeta(key, {
      bpm: 145,
      duration: 198,
      genre: 'pop',
      genreConfidence: 0.8,
    });
    savePersistedTrackLevel(key, 'NORMAL', 12);
    expect(getPersistedTrackMeta(key)?.levels?.NORMAL).toBe(12);
  });
});
