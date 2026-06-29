import type { CustomTrackEntry } from '../audio/CustomSongLoader';

export interface RingItemStyle {
  angle: number;
  opacity: number;
  scale: number;
  zIndex: number;
}

export function ringItemStyle(index: number, selected: number, total: number): RingItemStyle {
  if (total <= 0) {
    return { angle: 0, opacity: 0, scale: 0.8, zIndex: 0 };
  }

  let delta = index - selected;
  const half = total / 2;
  if (delta > half) delta -= total;
  if (delta < -half) delta += total;

  const abs = Math.abs(delta);
  const spread = 40;
  if (abs > 2) {
    return { angle: delta * spread, opacity: 0, scale: 0.65, zIndex: 0 };
  }

  const angle = delta * spread;
  const opacity = abs === 0 ? 0 : abs === 1 ? 0.78 : 0.42;
  const scale = abs === 0 ? 1 : abs === 1 ? 0.9 : 0.78;

  return {
    angle,
    opacity,
    scale,
    zIndex: 120 - Math.round(abs * 10),
  };
}

export function renderSongRingItems(
  tracks: readonly CustomTrackEntry[],
  selectedIndex: number,
): string {
  const total = tracks.length;
  return tracks.map((track, index) => {
    const style = ringItemStyle(index, selectedIndex, total);
    if (style.opacity <= 0.04) return '';
    if (index === selectedIndex) return '';
    let delta = index - selectedIndex;
    const half = total / 2;
    if (delta > half) delta -= total;
    if (delta < -half) delta += total;
    const adjacent = Math.abs(delta) === 1;
    const xNudge = adjacent ? (delta < 0 ? -15 : 15) : 0;
    return `
      <div
        class="song-ring-item${adjacent ? ' is-adjacent' : ''}"
        data-ring-index="${index}"
        style="
          --ring-angle:${style.angle}deg;
          --ring-opacity:${style.opacity};
          --ring-scale:${style.scale};
          --ring-x-nudge:${xNudge}px;
          z-index:${style.zIndex};
        "
      >
        <span class="song-ring-item-label">${escapeHtml(track.title)}</span>
      </div>
    `;
  }).join('');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
