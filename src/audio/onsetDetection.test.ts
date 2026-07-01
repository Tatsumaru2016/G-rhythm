import { describe, expect, it } from 'vitest';
import { detectOnsets } from './onsetDetection';

function makeImpulseBuffer(sampleRate: number, impulses: number[]): AudioBuffer {
  const durationSec = 2;
  const length = Math.ceil(sampleRate * durationSec);
  const data = new Float32Array(length);
  for (const t of impulses) {
    const idx = Math.floor(t * sampleRate);
    if (idx >= 0 && idx < length) data[idx] = 1;
  }
  return {
    duration: durationSec,
    length,
    numberOfChannels: 1,
    sampleRate,
    getChannelData: () => data,
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as AudioBuffer;
}

describe('detectOnsets', () => {
  it('finds spaced impulses', () => {
    const buffer = makeImpulseBuffer(44100, [0.2, 0.6, 1.0]);
    const onsets = detectOnsets(buffer, 0.15);
    expect(onsets.length).toBeGreaterThanOrEqual(2);
    expect(onsets[0].time).toBeGreaterThanOrEqual(0.1);
  });

  it('respects minimum gap', () => {
    const buffer = makeImpulseBuffer(44100, [0.5, 0.52, 0.54]);
    const onsets = detectOnsets(buffer, 0.2);
    expect(onsets.length).toBeLessThanOrEqual(2);
  });
});
