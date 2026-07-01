import { t, type MessageKey } from '../i18n';

export const HUB_TOGGLE_ON = 'hub-toggle--on';
export const HUB_TOGGLE_OFF = 'hub-toggle--off';
export const HUB_TOGGLE_LOADING = 'hub-toggle--loading';

export function hubToggleStateClasses(on: boolean): string {
  return on ? HUB_TOGGLE_ON : HUB_TOGGLE_OFF;
}

export function syncHubToggleElement(
  el: Element | null,
  options: { on: boolean; loading?: boolean },
): void {
  if (!el) return;
  const loading = options.loading ?? false;
  el.classList.toggle(HUB_TOGGLE_LOADING, loading);
  if (loading) return;
  el.classList.toggle(HUB_TOGGLE_ON, options.on);
  el.classList.toggle(HUB_TOGGLE_OFF, !options.on);
  el.setAttribute('aria-pressed', String(options.on));
}

export function flashIconSvg(): string {
  return `<svg class="title-flash-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M8 1.1a4.9 4.9 0 0 0-3.02 8.82 1.15 1.15 0 0 0-.45.91v.57h7.04v-.57a1.15 1.15 0 0 0-.45-.91A4.9 4.9 0 0 0 8 1.1Zm-1.15 11.4h2.3v1.15H6.85v-1.15Z"/>
      <path fill="currentColor" opacity="0.55" d="M8 0l.55 1.35L9.9 1.8 8.65 2.7 9.05 4.2 8 3.35 6.95 4.2 7.35 2.7 6.1 1.8 7.45 1.35 8 0Z"/>
    </svg>`;
}

export function renderHubToggleStateHtml(
  titleKey: MessageKey,
  onLabelKey: MessageKey,
  offLabelKey: MessageKey,
  id?: string,
  glyph = '\u266a',
): string {
  const idAttr = id ? ` id="${id}"` : '';
  return `
      <span class="hub-toggle__state"${idAttr} title="${t(titleKey)}">
        <span class="hub-toggle__icon hub-toggle__icon--on">
          <span class="hub-toggle__glyph" aria-hidden="true">${glyph}</span>
          <span class="hub-toggle__label">${t(onLabelKey)}</span>
        </span>
        <span class="hub-toggle__icon hub-toggle__icon--off">
          <span class="hub-toggle__glyph" aria-hidden="true">${glyph}</span>
          <span class="hub-toggle__label">${t(offLabelKey)}</span>
        </span>
      </span>
    `;
}

export function renderFlashToggleStateHtml(): string {
  const icon = flashIconSvg();
  return `
      <span class="hub-toggle__state" title="${t('settings.reducedFlash')}">
        <span class="hub-toggle__icon hub-toggle__icon--on">
          <span class="title-flash-icon-wrap" aria-hidden="true">${icon}</span>
          <span class="hub-toggle__label">${t('ui.titleFlashReduceOn')}</span>
        </span>
        <span class="hub-toggle__icon hub-toggle__icon--off">
          <span class="title-flash-icon-wrap" aria-hidden="true">${icon}</span>
          <span class="hub-toggle__label">${t('ui.titleFlashReduceOff')}</span>
        </span>
      </span>
    `;
}

export function renderHubToggleButtonHtml(options: {
  id: string;
  on: boolean;
  ariaLabelKey: MessageKey;
  onLabelKey?: MessageKey;
  offLabelKey?: MessageKey;
  titleKey?: MessageKey;
  modifiers?: string;
}): string {
  const {
    id,
    on,
    ariaLabelKey,
    onLabelKey = 'ui.titleSoundOn',
    offLabelKey = 'ui.titleSoundOff',
    titleKey = ariaLabelKey,
    modifiers = '',
  } = options;
  const mod = modifiers ? ` ${modifiers}` : '';
  return `
      <button type="button"
        class="hub-toggle${mod} ${hubToggleStateClasses(on)}"
        id="${id}"
        aria-pressed="${on}"
        aria-label="${t(ariaLabelKey)}">
        ${renderHubToggleStateHtml(titleKey, onLabelKey, offLabelKey)}
      </button>
    `;
}

export function renderFlashToggleButtonHtml(on: boolean): string {
  return `
      <button type="button"
        class="hub-toggle hub-toggle--flash ${hubToggleStateClasses(on)}"
        id="title-flash-toggle"
        aria-pressed="${on}"
        aria-label="${t('settings.reducedFlash')}">
        ${renderFlashToggleStateHtml()}
      </button>
    `;
}
