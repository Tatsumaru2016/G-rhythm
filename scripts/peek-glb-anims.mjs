import { openSync, readSync } from 'node:fs';
import { basename } from 'node:path';

function readGlbJson(path) {
  const fd = openSync(path, 'r');
  const head = Buffer.alloc(20);
  readSync(fd, head, 0, 20, 0);
  const jsonLen = head.readUInt32LE(12);
  const chunk = Buffer.alloc(jsonLen);
  readSync(fd, chunk, 0, jsonLen, 20);
  return JSON.parse(chunk.toString('utf8'));
}

function animDuration(json, animIndex) {
  const anim = json.animations[animIndex];
  if (!anim) return null;
  let maxT = 0;
  for (const sampler of anim.samplers ?? []) {
    const input = json.accessors[sampler.input];
    if (!input) continue;
    const bufferView = json.bufferViews[input.bufferView];
    const byteOffset = (bufferView.byteOffset ?? 0) + (input.byteOffset ?? 0);
    const count = input.count;
    const fd = openSync(process.argv[2], 'r');
    const binStart = 20 + jsonLen;
    const binHeader = Buffer.alloc(12);
    readSync(fd, binHeader, 0, 12, binStart);
    const binChunkStart = binStart + 8;
    const times = Buffer.alloc(count * 4);
    readSync(fd, times, 0, times.length, binChunkStart + byteOffset);
    for (let i = 0; i < count; i++) {
      maxT = Math.max(maxT, times.readFloatLE(i * 4));
    }
  }
  return maxT;
}

const path = process.argv[2];
const json = readGlbJson(path);
console.log(basename(path), 'animation count:', json.animations?.length ?? 0);
for (let i = 0; i < Math.min(8, json.animations?.length ?? 0); i++) {
  const name = json.animations[i].name ?? `anim${i}`;
  const dur = animDuration(json, i);
  console.log(`  [${i}] ${name} duration=${dur?.toFixed(2)}s channels=${json.animations[i].channels?.length}`);
}
