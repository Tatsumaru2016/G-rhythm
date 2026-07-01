const VIEWPORT_PAD = 8;
const TOOLTIP_GAP = 6;

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

function measureBubble(bubble: HTMLElement): { width: number; height: number } {
  bubble.classList.add('tooltip-bubble--measuring');
  const width = bubble.offsetWidth;
  const height = bubble.offsetHeight;
  bubble.classList.remove('tooltip-bubble--measuring');
  return { width, height };
}

function positionTooltipBubble(host: HTMLElement, bubble: HTMLElement): void {
  const preferAbove = host.classList.contains('has-tooltip--above');
  const hostRect = host.getBoundingClientRect();
  const { width, height } = measureBubble(bubble);

  let placeAbove = preferAbove;
  let top = placeAbove ? hostRect.top - height - TOOLTIP_GAP : hostRect.bottom + TOOLTIP_GAP;

  if (!placeAbove && top + height > window.innerHeight - VIEWPORT_PAD) {
    const aboveTop = hostRect.top - height - TOOLTIP_GAP;
    if (aboveTop >= VIEWPORT_PAD) {
      placeAbove = true;
      top = aboveTop;
    }
  } else if (placeAbove && top < VIEWPORT_PAD) {
    const belowTop = hostRect.bottom + TOOLTIP_GAP;
    if (belowTop + height <= window.innerHeight - VIEWPORT_PAD) {
      placeAbove = false;
      top = belowTop;
    }
  }

  top = Math.max(VIEWPORT_PAD, Math.min(top, window.innerHeight - height - VIEWPORT_PAD));

  let left = hostRect.left + hostRect.width / 2 - width / 2;
  left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - width - VIEWPORT_PAD));

  bubble.style.setProperty('--tooltip-x', `${Math.round(left)}px`);
  bubble.style.setProperty('--tooltip-y', `${Math.round(top)}px`);
  bubble.classList.toggle('tooltip-bubble--above-placed', placeAbove);
  bubble.classList.add('tooltip-bubble--placed');
}

function resetTooltipBubble(bubble: HTMLElement): void {
  bubble.classList.remove('tooltip-bubble--placed', 'tooltip-bubble--above-placed');
  bubble.style.removeProperty('--tooltip-x');
  bubble.style.removeProperty('--tooltip-y');
}

function bindTooltipHost(host: HTMLElement): void {
  if (host.dataset.tooltipBound === '1') return;
  host.dataset.tooltipBound = '1';

  const bubble = host.querySelector<HTMLElement>('.tooltip-bubble');
  if (!bubble) return;

  const place = () => positionTooltipBubble(host, bubble);
  const clear = () => resetTooltipBubble(bubble);

  host.addEventListener('mouseenter', place);
  host.addEventListener('focusin', place);
  host.addEventListener('mouseleave', clear);
  host.addEventListener('focusout', (e) => {
    if (!host.contains(e.relatedTarget as Node)) clear();
  });
}

function repositionVisibleTooltips(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('.tooltip-bubble--placed').forEach((bubble) => {
    const host = bubble.closest<HTMLElement>('.has-tooltip');
    if (host) positionTooltipBubble(host, bubble);
  });
}

/** 画面内に収まるようツールチップ位置を調整する */
export function bindTooltips(root: ParentNode | null): void {
  if (!root) return;

  root.querySelectorAll<HTMLElement>('.has-tooltip').forEach(bindTooltipHost);

  if (root instanceof HTMLElement && root.dataset.tooltipViewportBound !== '1') {
    root.dataset.tooltipViewportBound = '1';
    const onViewportChange = () => repositionVisibleTooltips(root);
    window.addEventListener('resize', onViewportChange);
    root.addEventListener('scroll', onViewportChange, true);
  }
}
