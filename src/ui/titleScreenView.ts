import { t } from '../i18n';

const TITLE_EQ_COLORS = [
  '#ff2d6a',
  '#00e5ff',
  '#a855f7',
  '#ffd700',
  '#ff007f',
  '#00f3ff',
  '#ffaa00',
];

export function titleEqBarsHtml(barCount = 24): string {
  const rand = (min: number, max: number) => min + Math.random() * (max - min);
  return Array.from({ length: barCount }, (_, i) => {
    const color = TITLE_EQ_COLORS[i % TITLE_EQ_COLORS.length];
    const delay = rand(0, 1.8).toFixed(2);
    const duration = rand(0.55, 1.35).toFixed(2);
    const lo = rand(0.18, 0.55).toFixed(3);
    const mid1 = rand(0.35, 0.85).toFixed(3);
    const hi = rand(0.75, 1.55).toFixed(3);
    const mid2 = rand(0.28, 0.92).toFixed(3);
    return `<span class="title-eq-bar" style="--eq-color:${color};--eq-delay:${delay}s;--eq-dur:${duration}s;--eq-lo:${lo};--eq-m1:${mid1};--eq-hi:${hi};--eq-m2:${mid2}" aria-hidden="true"></span>`;
  }).join('');
}

export function songInfoSideEqBarsHtml(): string {
  return titleEqBarsHtml(20);
}

export function accessibilityNoticeHtml(): string {
  return `
    <div class="accessibility-notice" role="note">
      <p>${t('accessibility.notice')}</p>
    </div>
  `;
}
