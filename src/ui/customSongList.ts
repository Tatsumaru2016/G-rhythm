import type { CustomTrackEntry } from '../audio/CustomSongLoader';

export function renderFolderSongList(
  tracks: readonly CustomTrackEntry[],
  selectedIndex: number,
): string {
  const pad = String(tracks.length).length;
  return tracks.map((track, index) => {
    const selected = index === selectedIndex;
    const num = String(index + 1).padStart(pad, '0');
    return `
      <button
        type="button"
        class="folder-song-item${selected ? ' is-selected' : ''}"
        data-list-index="${index}"
        aria-pressed="${selected}"
      >
        <span class="folder-song-item-inner">
          <span class="folder-song-item-num">${num}</span>
          <span class="folder-song-item-title">${escapeHtml(track.title)}</span>
        </span>
      </button>
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
