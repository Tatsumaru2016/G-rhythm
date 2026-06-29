export type Locale = 'ja' | 'en';

const STORAGE_KEY = 'g-rhythm-locale';

function parseBcp47Tag(tag: string): { language: string; region: string | null } {
  const lower = tag.trim().toLowerCase();
  try {
    const locale = new Intl.Locale(lower);
    return {
      language: locale.language,
      region: locale.region?.toUpperCase() ?? null,
    };
  } catch {
    const [language, ...rest] = lower.split('-');
    const regionPart = rest.find((part) => /^[a-z]{2}$/i.test(part) && part.length === 2);
    return {
      language: language ?? lower,
      region: regionPart?.toUpperCase() ?? null,
    };
  }
}

/** 日本（地域 JP）なら日本語、それ以外は英語 */
export function detectDefaultLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en';

  const tags = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  for (const tag of tags) {
    const { language, region } = parseBcp47Tag(tag);
    if (region === 'JP') return 'ja';
    if (!region && language === 'ja') return 'ja';
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
