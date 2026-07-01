import type { ChartData, ChartNote, MusicGenre } from '../types';
import { generateChart, type CustomDifficulty } from '../audio/AutoChartGenerator';
import { analyzeGenre } from '../audio/musicGenre';
import { chartDisplayLevel } from '../chart/chartRadar';

const BUILTIN_LIMITS: Record<CustomDifficulty, { maxDurationSec: number; maxNotes: number }> = {
  EASY: { maxDurationSec: 55, maxNotes: 34 },
  NORMAL: { maxDurationSec: 72, maxNotes: 52 },
  HARD: { maxDurationSec: 88, maxNotes: 76 },
  EXTREME: { maxDurationSec: 108, maxNotes: 104 },
};

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seedRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function trimBuffer(buffer: AudioBuffer, maxDurationSec: number): AudioBuffer {
  const maxSamples = Math.min(
    buffer.length,
    Math.floor(buffer.sampleRate * maxDurationSec),
  );
  if (maxSamples >= buffer.length) return buffer;

  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    channelData.push(buffer.getChannelData(c).slice(0, maxSamples));
  }

  return {
    duration: maxSamples / sampleRate,
    length: maxSamples,
    numberOfChannels: channels,
    sampleRate,
    getChannelData(channel: number) {
      return channelData[channel] ?? new Float32Array(0);
    },
    copyFromChannel() {},
    copyToChannel() {},
  } as AudioBuffer;
}

function capNotes(notes: ChartNote[], maxNotes: number): ChartNote[] {
  if (notes.length <= maxNotes) return notes;
  const step = notes.length / maxNotes;
  const picked: ChartNote[] = [];
  for (let i = 0; i < maxNotes; i++) {
    picked.push(notes[Math.floor(i * step)]);
  }
  return picked;
}

function levelFromSyncedChart(chart: ChartData, notes: ChartNote[], bpm: number, genre: MusicGenre): number {
  return chartDisplayLevel({
    ...chart,
    bpm,
    genre,
    notes,
  });
}

export function resolveBuiltinDifficulty(chart: ChartData): CustomDifficulty {
  const d = chart.difficulty.toUpperCase();
  if (d === 'EASY' || d === 'NORMAL' || d === 'HARD' || d === 'EXTREME') {
    return d;
  }
  return 'NORMAL';
}

/** MP3 から BPM・譜面・LV を再生成（内蔵曲プレイと表示を一致させる） */
export function syncBuiltinChartFromAudio(chart: ChartData, buffer: AudioBuffer): ChartData {
  const difficulty = resolveBuiltinDifficulty(chart);
  const limits = BUILTIN_LIMITS[difficulty];
  const analysis = analyzeGenre(buffer);
  const bpm = analysis.features.bpm;
  const genre = analysis.genre;
  const offset = chart.offset ?? 0;
  const trimmed = trimBuffer(buffer, limits.maxDurationSec);

  const nativeRandom = Math.random;
  Math.random = seedRandom(hashId(chart.id));
  const generated = generateChart(trimmed, chart.title, bpm, offset, difficulty, genre);
  Math.random = nativeRandom;

  const notes = capNotes(generated.notes, limits.maxNotes);
  const level = levelFromSyncedChart(chart, notes, bpm, genre);

  return {
    ...chart,
    artist: '',
    bpm,
    genre,
    level,
    notes,
  };
}
