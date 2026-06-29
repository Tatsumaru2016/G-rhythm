const STORAGE_KEY = 'g-rhythm-reduced-flash-v2';

/** 初回・未設定時はフラッシュ軽減オフ */
export const DEFAULT_REDUCED_FLASH = false;

export function loadReducedFlash(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return DEFAULT_REDUCED_FLASH;
    return stored === '1';
  } catch { /* ignore */ }
  return DEFAULT_REDUCED_FLASH;
}

export function saveReducedFlash(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch { /* ignore */ }
}
