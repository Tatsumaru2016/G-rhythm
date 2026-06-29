export type Locale = 'ja' | 'en';

const STORAGE_KEY = 'g-rhythm-locale';

export function detectDefaultLocale(): Locale {
  if (typeof navigator !== 'undefined') {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith('ja')) return 'ja';
  }
  return 'en';
}

export function loadLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'ja' || stored === 'en') return stored;
  } catch { /* ignore */ }
  return detectDefaultLocale();
}

export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch { /* ignore */ }
}
