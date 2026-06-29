/**
 * Regenerates built-in chart JSON from public/audio/*.mp3
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import decode from 'audio-decode';
import type { ChartData } from '../src/types';
import type { CustomDifficulty } from '../src/audio/AutoChartGenerator';
import { syncBuiltinChartFromAudio } from '../src/data/builtinChartSync';

const ROOT = join(import.meta.dirname, '..');

const BUILTIN: Array<{
  json: string;
  audio: string;
  difficulty: CustomDifficulty;
}> = [
  { json: 'neon-pulse.json', audio: 'Normal.mp3', difficulty: 'NORMAL' },
  { json: 'starfall.json', audio: 'Hard.mp3', difficulty: 'HARD' },
  { json: 'velocity.json', audio: 'Extreme.mp3', difficulty: 'EXTREME' },
];

function toAudioBuffer(pcm: Awaited<ReturnType<typeof decode>>): AudioBuffer {
  if (typeof (pcm as AudioBuffer).getChannelData === 'function') {
    return pcm as AudioBuffer;
  }

  const raw = pcm as { channelData?: Float32Array[]; sampleRate?: number };
  const channels = raw.channelData ?? (Array.isArray(pcm) ? pcm as Float32Array[] : [pcm as Float32Array]);
  const sampleRate = raw.sampleRate ?? 44100;
  const length = channels[0]?.length ?? 0;

  return {
    duration: length / sampleRate,
    length,
    numberOfChannels: channels.length,
    sampleRate,
    getChannelData(channel: number) {
      return channels[channel] ?? new Float32Array(0);
    },
    copyFromChannel() {},
    copyToChannel() {},
  } as AudioBuffer;
}

async function syncOne(jsonFile: string, audioFile: string): Promise<void> {
  const chartPath = join(ROOT, 'src/charts', jsonFile);
  const audioPath = join(ROOT, 'public/audio', audioFile);
  const existing = JSON.parse(await readFile(chartPath, 'utf8')) as ChartData;
  const pcm = toAudioBuffer(await decode(await readFile(audioPath)));
  const updated = syncBuiltinChartFromAudio({ ...existing, audioTrack: audioFile }, pcm);

  await writeFile(chartPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  console.log(
    `${updated.title}: BPM ${updated.bpm}, ${updated.notes.length} notes, Lv.${updated.level}, genre=${updated.genre}`,
  );
}

for (const entry of BUILTIN) {
  await syncOne(entry.json, entry.audio);
}
