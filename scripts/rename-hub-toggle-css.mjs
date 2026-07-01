import fs from 'node:fs';
import path from 'node:path';

const STYLE_DIR = 'src/styles';
const ROOT_CSS = 'src/styles.css';

function findLine(lines, predicate, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (predicate(lines[i], i)) return i;
  }
  return -1;
}

function applyReplacements(text) {
  const pairs = [
    ['.title-flash-toggle', '.hub-toggle--flash'],
    ['.title-sound-toggle', '.hub-toggle'],
    ['.song-preview-icon--on', '.hub-toggle__icon--on'],
    ['.song-preview-icon--off', '.hub-toggle__icon--off'],
    ['.song-preview-icon', '.hub-toggle__icon'],
    ['.song-preview-state', '.hub-toggle__state'],
    ['.song-preview-note', '.hub-toggle__glyph'],
    ['.song-preview-label', '.hub-toggle__label'],
    ['.is-preview-playing', '.hub-toggle--on'],
    ['.is-preview-paused', '.hub-toggle--off'],
  ];
  let out = text;
  for (const [from, to] of pairs) {
    out = out.split(from).join(to);
  }
  // Toggle-only loading state (keep song-ring-center.is-preview-loading)
  out = out.replace(/\.hub-toggle--loading \.hub-toggle__icon/g, '.hub-toggle--loading .hub-toggle__icon');
  out = out.replace(
    /\.hub-toggle--loading \.hub-toggle__icon--on,/g,
    '.hub-toggle--loading .hub-toggle__icon--on,',
  );
  out = out.replace(/\.is-preview-loading \.hub-toggle/g, '.hub-toggle--loading .hub-toggle');
  out = out.replace(
    /\.is-preview-loading \.hub-toggle__state::after/g,
    '.hub-toggle--loading .hub-toggle__state::after',
  );
  return out;
}

const files = [ROOT_CSS, ...fs.readdirSync(STYLE_DIR).map((f) => path.join(STYLE_DIR, f))].filter(
  (f) => f.endsWith('.css'),
);

for (const file of files) {
  const next = applyReplacements(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, next);
}

console.log('Renamed hub-toggle classes in CSS');
