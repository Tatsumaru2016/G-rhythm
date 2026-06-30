import type { CustomTrackEntry } from '../audio/CustomSongLoader';
import type { CatalogSortRow } from '../audio/songCatalogSort';

export function renderFolderSongList(
  rows: readonly CatalogSortRow[],
  selectedCatalogIndex: number,
): string {
  const pad = String(rows.length).length;
  return rows.map((row, displayIndex) => {
    const selected = row.catalogIndex === selectedCatalogIndex;
    const num = String(displayIndex + 1).padStart(pad, '0');
    return `
      <button
        type="button"
        class="folder-song-item${selected ? ' is-selected' : ''}"
        data-list-index="${row.catalogIndex}"
        aria-pressed="${selected}"
      >
        <span class="folder-song-item-inner">
          <span class="folder-song-item-num">${num}</span>
          <span class="folder-song-item-title">${escapeHtml(row.track.title)}</span>
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
