import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadLastFolderTrackRecordKey,
  resolveFolderTrackIndex,
  saveLastFolderTrackRecordKey,
} from './folderSelectState';

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

describe('folderSelectState', () => {
  beforeEach(() => {
    mockLocalStorage();
    localStorage.clear();
  });

  it('saves and restores last folder track key', () => {
    saveLastFolderTrackRecordKey('custom:song.mp3:1:2');
    expect(loadLastFolderTrackRecordKey()).toBe('custom:song.mp3:1:2');
  });

  it('resolves catalog index from saved key', () => {
    const catalog = [{ id: 'custom:a:1:1' }, { id: 'custom:b:2:2' }];
    expect(resolveFolderTrackIndex(catalog, 'custom:b:2:2')).toBe(1);
    expect(resolveFolderTrackIndex(catalog, 'custom:missing:0:0')).toBe(0);
  });
});
