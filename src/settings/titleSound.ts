const STORAGE_KEY = 'g-rhythm-title-sound-v1';

/** 初回・未設定時はサウンドオン */
export const DEFAULT_TITLE_SOUND = true;

export function loadTitleSound(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return DEFAULT_TITLE_SOUND;
    return stored === '1';
  } catch {
    /* ignore */
  }
  return DEFAULT_TITLE_SOUND;
}

export function saveTitleSound(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}
