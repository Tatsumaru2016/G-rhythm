import { openSync, readSync } from 'node:fs';
import { basename } from 'node:path';

function peekGlb(path) {
  const fd = openSync(path, 'r');
  const head = Buffer.alloc(20);
  readSync(fd, head, 0, 20, 0);
  const jsonLen = head.readUInt32LE(12);
  const chunk = Buffer.alloc(jsonLen);
  readSync(fd, chunk, 0, jsonLen, 20);
  const json = JSON.parse(chunk.toString('utf8'));
  const animSummaries = (json.animations ?? []).map((anim, i) => ({
    i,
    name: anim.name ?? `anim${i}`,
    channels: anim.channels?.length ?? 0,
    samplers: anim.samplers?.length ?? 0,
  }));
  return {
    file: basename(path),
    animations: json.animations?.length ?? 0,
    animSummaries: animSummaries.slice(0, 8),
  };
}

const files = process.argv.slice(2);
for (const file of files) {
  console.log(JSON.stringify(peekGlb(file)));
}
