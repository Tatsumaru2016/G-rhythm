import fs from 'node:fs';

const path = 'src/styles.css';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

function findLine(predicate, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (predicate(lines[i], i)) return i;
  }
  return -1;
}

const resultStart = findLine((line) => line.includes('/* Ready Screen */'));
const resultEnd = findLine((line) => line.includes('/* Touch zones'));
const loadingStart = findLine((line) => line.includes('/* Loading */'));
const loadingEnd = findLine((line) => line.includes('/* Folder mode'));

if ([resultStart, resultEnd, loadingStart, loadingEnd].some((n) => n < 0)) {
  throw new Error('Could not locate CSS split markers');
}

fs.mkdirSync('src/styles', { recursive: true });
fs.writeFileSync('src/styles/result.css', lines.slice(resultStart, resultEnd).join('\n'));
fs.writeFileSync('src/styles/loading.css', lines.slice(loadingStart, loadingEnd).join('\n'));

const importLines = [
  "@import url('./styles/result.css');",
  "@import url('./styles/loading.css');",
  '',
];

const kept = [
  ...lines.slice(0, 3),
  ...importLines,
  ...lines.slice(3, resultStart),
  ...lines.slice(resultEnd, loadingStart),
  ...lines.slice(loadingEnd),
];

fs.writeFileSync(path, kept.join('\n').replace(/\n{3,}/g, '\n\n'));
console.log('Extracted result.css and loading.css');
