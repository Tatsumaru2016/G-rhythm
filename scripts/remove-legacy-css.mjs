import fs from 'node:fs';

const path = 'src/styles.css';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

function findLine(predicate, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (predicate(lines[i], i)) return i;
  }
  return -1;
}

function addRange(ranges, start, end) {
  if (start < 0 || end < 0 || end <= start) {
    console.warn('Skip invalid range', { start, end });
    return;
  }
  ranges.push([start, end]);
}

const ranges = [];

addRange(ranges,
  findLine((line) => line.includes('/* Song Select */')),
  findLine((line) => line.includes('/* Ready Screen */')),
);

addRange(ranges,
  findLine((line) => line.trim() === '.ready-diff {'),
  findLine((line) => line.trim() === '.ready-title {'),
);

addRange(ranges,
  findLine((line) => line.trim() === '.title-flash-panel {'),
  findLine((line) => line.trim() === '.title-debug-panel {'),
);

addRange(ranges,
  findLine((line) => line.trim() === '.flash-corner-panel .setting-toggle {'),
  findLine((line) => line.trim() === '.debug-corner-panel {'),
);

addRange(ranges,
  findLine((line) => line.includes('title flash switch')),
  findLine((line) => line.trim() === 'body.reduced-flash .btn-primary.pulse {'),
);

addRange(ranges,
  findLine((line) => line.trim() === '.custom-ready-panel .custom-settings {'),
  findLine((line) => line.trim() === '.setting-row {'),
);

addRange(ranges,
  findLine((line) => line.trim() === '.difficulty-picker {'),
  findLine((line) => line.trim() === '.difficulty-options {'),
);

addRange(ranges,
  findLine((line) => line.trim() === '.custom-ready-title-preview {'),
  findLine((line) => line.trim() === '.custom-folder-screen.is-loading-track .song-ring-center {'),
);

addRange(ranges,
  findLine((line) => line.trim() === '.custom-folder-footer .custom-ready-actions {'),
  findLine((line) => line.trim() === '@media (max-width: 600px) {'),
);

const panelRightRule = findLine((line) => line.trim() === '.panel-right .scroll-speed-panel .setting-row {');
addRange(ranges, panelRightRule, panelRightRule >= 0 ? panelRightRule + 4 : -1);

const remove = new Set();
for (const [start, end] of ranges) {
  for (let i = start; i < end; i++) remove.add(i);
}

let output = lines.filter((_, index) => !remove.has(index));

output = output.map((line) => line
  .replace('#ui-overlay:has(.select-screen),', '')
  .replace('#ui-overlay:has(.custom-ready-screen),', '')
  .replace('.custom-ready-screen,', '')
);

output = output.filter((line) => line.trim() !== '.song-grid { grid-template-columns: 1fr; }');

if (!output.some((line) => line.includes('--custom-compact-panel-w'))) {
  const insertAt = output.findIndex((line) => line.trim() === '.difficulty-options {');
  if (insertAt >= 0) {
    output.splice(insertAt, 0, '', '.custom-folder-screen {', '  --custom-compact-panel-w: min(360px, 94vw);', '}', '');
  }
}

const text = output.join('\n').replace(/\n{3,}/g, '\n\n');
fs.writeFileSync(path, text);
console.log(`Removed ${remove.size} legacy CSS lines across ${ranges.length} ranges`);
