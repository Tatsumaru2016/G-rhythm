import { escapeHtml } from './htmlUtils';

export type UiErrorScreen = 'select' | 'title';

export interface UiErrorHost {
  render(html: string): void;
  showSelect(): void;
  showTitle(): void;
}

/** ユーザー向けエラー表示（import失敗・フォルダ空など） */
export function showUserError(
  host: UiErrorHost,
  message: string,
  options?: { returnTo?: UiErrorScreen; delayMs?: number },
): void {
  const returnTo = options?.returnTo ?? 'select';
  const delayMs = options?.delayMs ?? 2500;

  host.render(`
    <div class="screen error-screen">
      <p class="error-text">${escapeHtml(message)}</p>
    </div>
  `);

  window.setTimeout(() => {
    if (returnTo === 'title') host.showTitle();
    else host.showSelect();
  }, delayMs);
}
