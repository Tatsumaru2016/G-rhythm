const STORAGE_KEY = 'g-rhythm-custom-lane-bg-v1';
const MAX_DATA_URL_CHARS = 2_800_000;

export function loadCustomLaneBackgroundDataUrl(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || !raw.startsWith('data:image/')) return null;
    return raw;
  } catch {
    return null;
  }
}

export function saveCustomLaneBackgroundDataUrl(dataUrl: string): boolean {
  if (!dataUrl.startsWith('data:image/') || dataUrl.length > MAX_DATA_URL_CHARS) {
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, dataUrl);
    return true;
  } catch {
    return false;
  }
}

export function clearCustomLaneBackgroundImage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function hasCustomLaneBackgroundImage(): boolean {
  return loadCustomLaneBackgroundDataUrl() !== null;
}
