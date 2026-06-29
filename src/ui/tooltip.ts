export function escapeTooltipText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** ラベルにホバー／フォーカスで表示するツールチップを付ける */
export function withTooltip(labelHtml: string, tip: string, extraClass = ''): string {
  const cls = extraClass ? `has-tooltip ${extraClass}` : 'has-tooltip';
  return `
    <span class="${cls}" tabindex="0">
      ${labelHtml}
      <span class="tooltip-bubble" role="tooltip">${escapeTooltipText(tip)}</span>
    </span>
  `;
}

export function updateTooltip(root: ParentNode | null, selector: string, tip: string): void {
  const host = root?.querySelector(selector);
  if (!host) return;
  const bubble = host.querySelector('.tooltip-bubble');
  if (bubble) bubble.textContent = tip;
}
