import fs from 'node:fs';

const lines = fs.readFileSync('src/styles.css', 'utf8').split(/\r?\n/);
const start = lines.findIndex((line) => line.includes('Random pick spectacle'));
const end = lines.findIndex((line, index) => index > start && line.startsWith('@keyframes btn-select-rhythm-beat'));

if (start < 0 || end < 0) {
  console.error('Could not locate random-pick CSS boundaries', { start, end });
  process.exit(1);
}

const rp = lines.slice(start, end).join('\n');
fs.mkdirSync('src/styles', { recursive: true });
fs.writeFileSync('src/styles/random-pick.css', rp);
const out = ["@import url('./styles/random-pick.css');", '', ...lines.slice(0, start), ...lines.slice(end)].join('\n');
fs.writeFileSync('src/styles.css', out);
console.log(`Extracted lines ${start + 1}-${end} to src/styles/random-pick.css`);
