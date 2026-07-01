import fs from 'node:fs';

const path = 'src/styles.css';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

function findLine(predicate, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (predicate(lines[i], i)) return i;
  }
  return -1;
}

const titleStart = findLine((line) => line.includes('/* Title Screen */'));
const titleEnd = findLine((line) => line.includes('/* Buttons */'));
const selectHubStart = findLine((line) => line.includes('/* Unified song select hub'));
const selectHubEnd = findLine((line) => line.includes('/* Folder screen'));

if ([titleStart, titleEnd, selectHubStart, selectHubEnd].some((n) => n < 0)) {
  throw new Error('Could not locate CSS split markers');
}

fs.mkdirSync('src/styles', { recursive: true });
fs.writeFileSync('src/styles/title.css', lines.slice(titleStart, titleEnd).join('\n'));
fs.writeFileSync('src/styles/select-hub.css', lines.slice(selectHubStart, selectHubEnd).join('\n'));

const imports = [
  "@import url('./styles/random-pick.css');",
  "@import url('./styles/title.css');",
  "@import url('./styles/select-hub.css');",
  '',
];

const kept = [
  ...imports,
  ...lines.slice(0, titleStart),
  ...lines.slice(titleEnd, selectHubStart),
  ...lines.slice(selectHubEnd),
];

fs.writeFileSync(path, kept.join('\n').replace(/\n{3,}/g, '\n\n'));
console.log('Extracted title.css and select-hub.css');
