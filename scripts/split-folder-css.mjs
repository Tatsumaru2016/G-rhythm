import fs from 'node:fs';

const path = 'src/styles.css';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

function findLine(predicate, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (predicate(lines[i])) return i;
  }
  return -1;
}

const importEnd = findLine((line) => !line.startsWith('@import') && line.trim() !== '', 0);
const componentsStart = findLine((line) => line.includes('/* Buttons */'));
const folderStart = findLine((line) => line.includes('/* Folder mode'));

if (componentsStart < 0 || folderStart < 0) {
  throw new Error('Could not locate CSS split markers');
}

const importLines = lines.slice(0, importEnd);
const base = lines.slice(importEnd, componentsStart);
const componentsLines = lines.slice(componentsStart, folderStart);
let folderLines = lines.slice(folderStart);

const hubStart = folderLines.findIndex(
  (line) => line.startsWith('.hub-toggle__state') || line.startsWith('.song-preview-state'),
);
const hubEnd = folderLines.findIndex(
  (line) =>
    line.includes('.hub-toggle--loading .hub-toggle__state::after') ||
    line.includes('.is-preview-loading .hub-toggle__state::after') ||
    line.includes('.is-preview-loading .song-preview-state::after'),
);

fs.mkdirSync('src/styles', { recursive: true });

if (hubStart >= 0 && hubEnd >= 0) {
  fs.writeFileSync('src/styles/hub-toggle.css', folderLines.slice(hubStart, hubEnd + 1).join('\n'));
  folderLines = [...folderLines.slice(0, hubStart), ...folderLines.slice(hubEnd + 1)];
}

fs.writeFileSync('src/styles/components.css', componentsLines.join('\n'));
fs.writeFileSync('src/styles/folder.css', folderLines.join('\n'));

const extraImports = [
  "@import url('./styles/hub-toggle.css');",
  "@import url('./styles/components.css');",
  "@import url('./styles/folder.css');",
];

const kept = [...importLines, ...extraImports, '', ...base];

fs.writeFileSync(path, kept.join('\n').replace(/\n{3,}/g, '\n\n'));
console.log('Extracted hub-toggle.css, components.css, folder.css');
