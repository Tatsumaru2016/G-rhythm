import type { ChartData, MusicGenre } from '../types';
import type { PhaseColorScheme } from '../game/scrollPhase';
import { tGenre } from '../i18n';

export const MUSIC_GENRES: MusicGenre[] = [
  'electronic', 'rock', 'pop', 'jazz', 'classical', 'hiphop', 'other',
];

/** @deprecated use tGenre() */
export const GENRE_LABELS: Record<MusicGenre, string> = {
  electronic: 'Electronic',
  rock: 'Rock',
  pop: 'Pop',
  jazz: 'Jazz',
  classical: 'Classical',
  hiphop: 'Hip-Hop',
  other: 'Other',
};

export function getGenreLabel(genre: MusicGenre): string {
  return tGenre(genre);
}

export interface AudioFeatures {
  bpm: number;
  onsetDensity: number;
  transientRatio: number;
  bassRatio: number;
  midRatio: number;
  highRatio: number;
  tempoStability: number;
  dynamicRange: number;
  swingScore: number;
  sustainedScore: number;
}

export interface GenreAnalysis {
  genre: MusicGenre;
  confidence: number;
  features: AudioFeatures;
}

export interface GenreChartModifiers {
  lpb: number;
  minGapScale: number;
  minBeatGapDelta: number;
  onsetFluxScale: number;
  holdEnergyScale: number;
  holdDurationBonus: number;
  holdBeatModDelta: number;
  smoothLanes: boolean;
  beatEmphasis: boolean;
}

export interface GenreVisualProfile {
  hueBase: number;
  hueSecondary: number;
  hueAccent: number;
  saturation: number;
  patternWeights: number[];
  driveScale: number;
}

import { detectOnsets, type AudioOnset } from './onsetDetection';

function estimateBpmFromOnsets(onsets: AudioOnset[]): number {
  if (onsets.length < 4) return 128;

  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    const gap = onsets[i].time - onsets[i - 1].time;
    if (gap > 0.2 && gap < 1.5) intervals.push(gap);
  }
  if (intervals.length === 0) return 128;

  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  let bpm = Math.round(60 / median);

  while (bpm < 80) bpm *= 2;
  while (bpm > 200) bpm /= 2;

  return Math.max(80, Math.min(200, bpm));
}

export function extractAudioFeatures(buffer: AudioBuffer): AudioFeatures {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const windowSize = Math.floor(sampleRate * 0.046);
  const onsets = detectOnsets(buffer, 0.15);
  const duration = Math.max(0.01, buffer.duration);

  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    intervals.push(onsets[i].time - onsets[i - 1].time);
  }

  let tempoStability = 0.5;
  let swingScore = 0;
  if (intervals.length >= 4) {
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
    const cv = Math.sqrt(variance) / Math.max(0.001, mean);
    tempoStability = Math.max(0, Math.min(1, 1 - cv * 1.8));

    let swingPairs = 0;
    for (let i = 1; i < intervals.length; i += 2) {
      const ratio = intervals[i] / Math.max(0.001, intervals[i - 1]);
      if (ratio > 1.12 && ratio < 1.92) swingPairs++;
    }
    swingScore = Math.min(1, swingPairs / Math.max(1, intervals.length / 2) * 1.6);
  }

  let bassEnergy = 0;
  let midEnergy = 0;
  let highEnergy = 0;
  let peak = 0;
  let rmsSum = 0;
  let prevSmoothed = 0;
  const smoothAlpha = 0.06;
  const windows = Math.max(1, Math.floor(data.length / windowSize));

  for (let i = 0; i < data.length; i += windowSize) {
    let sum = 0;
    let absSum = 0;
    const end = Math.min(i + windowSize, data.length);
    for (let j = i; j < end; j++) {
      sum += data[j];
      absSum += Math.abs(data[j]);
    }
    const n = end - i;
    const avg = sum / n;
    const rms = Math.sqrt(absSum / n);
    rmsSum += rms;

    const smoothed = prevSmoothed + smoothAlpha * (avg - prevSmoothed);
    const high = avg - smoothed;
    bassEnergy += Math.abs(smoothed);
    highEnergy += Math.abs(high);
    midEnergy += rms;
    peak = Math.max(peak, rms);
    prevSmoothed = smoothed;
  }

  bassEnergy /= windows;
  midEnergy /= windows;
  highEnergy /= windows;
  const bandTotal = bassEnergy + midEnergy + highEnergy + 0.0001;

  const avgOnsetEnergy = onsets.reduce((s, o) => s + o.energy, 0) / Math.max(1, onsets.length);
  const onsetDensity = onsets.length / duration;
  const dynamicRange = Math.min(1, peak / (rmsSum / windows + 0.001) / 10);
  const sustainedScore = Math.max(0, Math.min(1, (1 - onsetDensity / 2.8) * 0.6 + dynamicRange * 0.4));

  return {
    bpm: estimateBpmFromOnsets(onsets),
    onsetDensity,
    transientRatio: Math.min(1, avgOnsetEnergy * 10),
    bassRatio: bassEnergy / bandTotal,
    midRatio: midEnergy / bandTotal,
    highRatio: highEnergy / bandTotal,
    tempoStability,
    dynamicRange,
    swingScore,
    sustainedScore,
  };
}

function scoreGenres(f: AudioFeatures): Record<MusicGenre, number> {
  const scores: Record<MusicGenre, number> = {
    electronic: 0.05,
    rock: 0.05,
    pop: 0.1,
    jazz: 0.05,
    classical: 0.05,
    hiphop: 0.05,
    other: 0.08,
  };

  scores.electronic += f.tempoStability * 1.8 + f.bassRatio * 2.2 + (f.onsetDensity > 1.2 ? 0.8 : 0);
  scores.rock += f.transientRatio * 2.2 + f.midRatio * 1.4 + f.tempoStability * 0.9;
  scores.pop += f.tempoStability * 1.2 + (1 - Math.abs(f.bassRatio - 0.32)) * 1.2 + (f.onsetDensity > 0.6 && f.onsetDensity < 2.2 ? 0.6 : 0);
  scores.jazz += f.swingScore * 3.2 + (1 - f.tempoStability) * 0.4 + f.midRatio * 0.6;
  scores.classical += f.sustainedScore * 2.4 + f.dynamicRange * 1.6 + (f.onsetDensity < 1.1 ? 1.0 : 0);
  scores.hiphop += f.bassRatio * 2.8 + f.transientRatio * 1.4 + (f.onsetDensity > 0.8 && f.onsetDensity < 2.5 ? 0.5 : 0);

  return scores;
}

export function analyzeGenre(buffer: AudioBuffer): GenreAnalysis {
  const features = extractAudioFeatures(buffer);
  const scores = scoreGenres(features);

  let genre: MusicGenre = 'other';
  let best = -1;
  let second = -1;

  for (const g of MUSIC_GENRES) {
    const s = scores[g];
    if (s > best) {
      second = best;
      best = s;
      genre = g;
    } else if (s > second) {
      second = s;
    }
  }

  const confidence = best <= 0 ? 0.3 : Math.max(0.35, Math.min(0.98, (best - Math.max(0, second)) / best + 0.35));

  return { genre, confidence, features };
}

const GENRE_CHART: Record<MusicGenre, GenreChartModifiers> = {
  electronic: {
    lpb: 4, minGapScale: 0.82, minBeatGapDelta: -1, onsetFluxScale: 0.9,
    holdEnergyScale: 0.82, holdDurationBonus: 2, holdBeatModDelta: -2,
    smoothLanes: false, beatEmphasis: true,
  },
  rock: {
    lpb: 4, minGapScale: 0.88, minBeatGapDelta: -1, onsetFluxScale: 0.82,
    holdEnergyScale: 0.92, holdDurationBonus: 1, holdBeatModDelta: 0,
    smoothLanes: false, beatEmphasis: false,
  },
  pop: {
    lpb: 4, minGapScale: 1.0, minBeatGapDelta: 0, onsetFluxScale: 1.0,
    holdEnergyScale: 1.0, holdDurationBonus: 0, holdBeatModDelta: 0,
    smoothLanes: true, beatEmphasis: false,
  },
  jazz: {
    lpb: 6, minGapScale: 1.08, minBeatGapDelta: 1, onsetFluxScale: 1.05,
    holdEnergyScale: 1.15, holdDurationBonus: 3, holdBeatModDelta: 2,
    smoothLanes: true, beatEmphasis: false,
  },
  classical: {
    lpb: 4, minGapScale: 1.28, minBeatGapDelta: 2, onsetFluxScale: 1.15,
    holdEnergyScale: 0.68, holdDurationBonus: 6, holdBeatModDelta: 4,
    smoothLanes: true, beatEmphasis: false,
  },
  hiphop: {
    lpb: 4, minGapScale: 0.92, minBeatGapDelta: 0, onsetFluxScale: 0.88,
    holdEnergyScale: 1.05, holdDurationBonus: 1, holdBeatModDelta: -1,
    smoothLanes: false, beatEmphasis: true,
  },
  other: {
    lpb: 4, minGapScale: 1.0, minBeatGapDelta: 0, onsetFluxScale: 1.0,
    holdEnergyScale: 1.0, holdDurationBonus: 0, holdBeatModDelta: 0,
    smoothLanes: false, beatEmphasis: false,
  },
};

/** 0=Rings 1=PrismPulse 2=Plasma 3=AuroraFlow 4=Beams 5=Waves 6=NeonCascade 7=Scanlines 8=Starburst */
const GENRE_VISUAL: Record<MusicGenre, GenreVisualProfile> = {
  electronic: {
    hueBase: 285, hueSecondary: 195, hueAccent: 320, saturation: 96,
    patternWeights: [1, 2, 3, 1, 2, 1, 4, 1, 3],
    driveScale: 1.15,
  },
  rock: {
    hueBase: 350, hueSecondary: 25, hueAccent: 5, saturation: 94,
    patternWeights: [3, 1, 1, 2, 4, 2, 4, 3, 2],
    driveScale: 1.2,
  },
  pop: {
    hueBase: 310, hueSecondary: 55, hueAccent: 200, saturation: 90,
    patternWeights: [2, 2, 2, 3, 2, 2, 3, 1, 3],
    driveScale: 1.0,
  },
  jazz: {
    hueBase: 38, hueSecondary: 280, hueAccent: 160, saturation: 82,
    patternWeights: [1, 1, 2, 3, 2, 4, 3, 1, 2],
    driveScale: 0.95,
  },
  classical: {
    hueBase: 220, hueSecondary: 45, hueAccent: 260, saturation: 72,
    patternWeights: [2, 1, 1, 4, 1, 2, 3, 1, 3],
    driveScale: 0.88,
  },
  hiphop: {
    hueBase: 130, hueSecondary: 300, hueAccent: 50, saturation: 88,
    patternWeights: [2, 1, 2, 2, 3, 2, 5, 4, 2],
    driveScale: 1.1,
  },
  other: {
    hueBase: 240, hueSecondary: 300, hueAccent: 180, saturation: 88,
    patternWeights: [1, 1, 1, 1, 1, 1, 3, 1, 1],
    driveScale: 1.0,
  },
};

export function getGenreChartModifiers(genre: MusicGenre): GenreChartModifiers {
  return GENRE_CHART[genre];
}

export function getGenreVisualProfile(genre: MusicGenre): GenreVisualProfile {
  return GENRE_VISUAL[genre];
}

export function resolveGenre(chart: ChartData): MusicGenre {
  return chart.genre ?? 'other';
}

export function pickWeightedPattern(weights: number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

export function blendPhaseWithGenre(
  phase: PhaseColorScheme,
  genre: MusicGenre,
  amount = 0.38,
): PhaseColorScheme {
  const g = GENRE_VISUAL[genre];
  const t = amount;
  const mix = (a: number, b: number) => a * (1 - t) + b * t;
  return {
    hueBase: mix(phase.hueBase, g.hueBase),
    hueSecondary: mix(phase.hueSecondary, g.hueSecondary),
    hueAccent: mix(phase.hueAccent, g.hueAccent),
    saturation: mix(phase.saturation, g.saturation),
  };
}
