const STORAGE_KEY = 'g-rhythm-folder-select-track-v1';

export function loadLastFolderTrackRecordKey(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function saveLastFolderTrackRecordKey(recordKey: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, recordKey);
  } catch {
    /* ignore */
  }
}

export function resolveFolderTrackIndex(
  catalog: ReadonlyArray<{ id: string }>,
  savedRecordKey: string | null = loadLastFolderTrackRecordKey(),
): number {
  if (!savedRecordKey || catalog.length === 0) return 0;
  const found = catalog.findIndex((entry) => entry.id === savedRecordKey);
  return found >= 0 ? found : 0;
}
