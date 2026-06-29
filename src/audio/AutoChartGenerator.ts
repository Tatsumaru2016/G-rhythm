import type { ChartData, ChartNote, LaneIndex, MusicGenre } from '../types';
import {
  analyzeGenre,
  getGenreChartModifiers,
  type GenreChartModifiers,
} from './musicGenre';
import { tDifficultyHint } from '../i18n';

export type CustomDifficulty = 'EASY' | 'NORMAL' | 'HARD' | 'EXTREME';

export const CUSTOM_DIFFICULTIES: CustomDifficulty[] = ['EASY', 'NORMAL', 'HARD', 'EXTREME'];

interface DifficultyConfig {
  minGapSec: number;
  minBeatGap: number;
  holdChance: boolean;
  holdEnergy: number;
  holdBeatMod: number;
  holdDuration: number;
  chordChance: number;
  maxChordLanes: number;
  fallbackStep: number;
  levelBonus: number;
}

const DIFFICULTY_CONFIG: Record<CustomDifficulty, DifficultyConfig> = {
  EASY: {
    minGapSec: 0.62,
    minBeatGap: 10,
    holdChance: false,
    holdEnergy: 1,
    holdBeatMod: 32,
    holdDuration: 4,
    chordChance: 0,
    maxChordLanes: 2,
    fallbackStep: 10,
    levelBonus: -1,
  },
  NORMAL: {
    minGapSec: 0.4,
    minBeatGap: 5,
    holdChance: false,
    holdEnergy: 0.14,
    holdBeatMod: 16,
    holdDuration: 4,
    chordChance: 0.12,
    maxChordLanes: 2,
    fallbackStep: 6,
    levelBonus: 0,
  },
  HARD: {
    minGapSec: 0.27,
    minBeatGap: 3,
    holdChance: false,
    holdEnergy: 0.11,
    holdBeatMod: 12,
    holdDuration: 6,
    chordChance: 0.24,
    maxChordLanes: 3,
    fallbackStep: 4,
    levelBonus: 2,
  },
  EXTREME: {
    minGapSec: 0.17,
    minBeatGap: 1,
    holdChance: true,
    holdEnergy: 0.08,
    holdBeatMod: 8,
    holdDuration: 8,
    chordChance: 0.34,
    maxChordLanes: 4,
    fallbackStep: 2,
    levelBonus: 4,
  },
};

export function getCustomDifficultyHint(difficulty: CustomDifficulty): string {
  return tDifficultyHint(difficulty);
}

interface Onset {
  time: number;
  energy: number;
}

export function estimateBpm(buffer: AudioBuffer): number {
  return analyzeGenre(buffer).features.bpm;
}

export function detectOnsets(buffer: AudioBuffer, minGap: number, fluxScale = 1): Onset[] {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const windowSize = Math.floor(sampleRate * 0.023);
  const onsets: Onset[] = [];
  let prevEnergy = 0;
  let lastOnset = -minGap;
  const fluxThreshold = 0.008 * fluxScale;
  const energyThreshold = 0.015 * fluxScale;

  for (let i = 0; i < data.length; i += windowSize) {
    let energy = 0;
    const end = Math.min(i + windowSize, data.length);
    for (let j = i; j < end; j++) energy += data[j] * data[j];
    energy = Math.sqrt(energy / (end - i));

    const flux = Math.max(0, energy - prevEnergy);
    const time = i / sampleRate;

    if (flux > fluxThreshold && energy > energyThreshold && time - lastOnset >= minGap) {
      onsets.push({ time, energy });
      lastOnset = time;
    }
    prevEnergy = energy * 0.85 + prevEnergy * 0.15;
  }

  return onsets;
}

function quantizeToBeat(time: number, bpm: number, offset: number, lpb: number): number {
  const beatDur = 60 / bpm;
  const step = beatDur / lpb;
  const adjusted = time - offset;
  if (adjusted < 0) return -1;
  return Math.round(adjusted / step);
}

function pickLane(
  beat: number,
  energy: number,
  prevLane: LaneIndex,
  smooth: boolean,
): LaneIndex {
  const lanes: LaneIndex[] = [0, 1, 2, 3];
  const energyBias = energy > 0.08 ? 1 : 0;
  const idx = (beat + energyBias) % 4;
  let lane = lanes[idx];

  if (smooth) {
    if (lane === prevLane) lane = lanes[(idx + 1) % 4];
    if (beat % 3 === 0 && lane === prevLane) lane = lanes[(idx + 2) % 4];
  } else if (lane === prevLane && beat % 2 === 0) {
    lane = lanes[(idx + 2) % 4];
  }

  return lane;
}

function pickChordLanes(baseLane: LaneIndex, maxLanes: number): LaneIndex[] {
  const lanes = new Set<LaneIndex>([baseLane]);
  const target = Math.min(4, Math.max(2, maxLanes));
  let guard = 0;
  while (lanes.size < target && guard++ < 12) {
    lanes.add((Math.floor(Math.random() * 4)) as LaneIndex);
  }
  return [...lanes];
}

function notesAtBeat(
  beat: number,
  lane: LaneIndex,
  onset: Onset,
  cfg: DifficultyConfig,
): ChartNote[] {
  const isHold = cfg.holdChance
    && onset.energy > cfg.holdEnergy
    && beat % cfg.holdBeatMod === 0;

  if (isHold) {
    return [{ lane, beat, type: 'hold', duration: cfg.holdDuration }];
  }

  if (cfg.chordChance > 0 && Math.random() < cfg.chordChance) {
    const lanes = pickChordLanes(lane, cfg.maxChordLanes);
    return lanes.map((chordLane) => ({ lane: chordLane, beat, type: 'tap' as const }));
  }

  return [{ lane, beat, type: 'tap' }];
}

function applyGenreToConfig(
  cfg: DifficultyConfig,
  genreMod: GenreChartModifiers,
): DifficultyConfig {
  return {
    ...cfg,
    minGapSec: cfg.minGapSec * genreMod.minGapScale,
    minBeatGap: Math.max(1, cfg.minBeatGap + genreMod.minBeatGapDelta),
    holdEnergy: cfg.holdEnergy * genreMod.holdEnergyScale,
    holdBeatMod: Math.max(4, cfg.holdBeatMod + genreMod.holdBeatModDelta),
    holdDuration: cfg.holdDuration + genreMod.holdDurationBonus,
  };
}

function isEmphasizedBeat(beat: number, lpb: number, emphasis: boolean): boolean {
  if (!emphasis) return true;
  const quarter = Math.floor(lpb / 4) || 1;
  return beat % (quarter * 4) === 0 || beat % (quarter * 2) === 0;
}

export function generateChart(
  buffer: AudioBuffer,
  title: string,
  bpm: number,
  offset: number,
  difficulty: CustomDifficulty,
  genre: MusicGenre = 'other',
): ChartData {
  const genreMod = getGenreChartModifiers(genre);
  const cfg = applyGenreToConfig(DIFFICULTY_CONFIG[difficulty], genreMod);
  const lpb = genreMod.lpb;
  const onsets = detectOnsets(buffer, cfg.minGapSec, genreMod.onsetFluxScale);
  const maxTime = buffer.duration - 1;
  const usedBeats = new Set<number>();
  const notes: ChartNote[] = [];
  let prevLane: LaneIndex = 0;
  let lastPlacedBeat = -cfg.minBeatGap;

  for (const onset of onsets) {
    if (onset.time > maxTime) break;
    const beat = quantizeToBeat(onset.time, bpm, offset, lpb);
    if (beat < 0 || usedBeats.has(beat)) continue;
    if (beat - lastPlacedBeat < cfg.minBeatGap) continue;
    if (!isEmphasizedBeat(beat, lpb, genreMod.beatEmphasis) && onset.energy < cfg.holdEnergy * 1.2) continue;

    usedBeats.add(beat);
    lastPlacedBeat = beat;

    const lane = pickLane(beat, onset.energy, prevLane, genreMod.smoothLanes);
    prevLane = lane;

    for (const note of notesAtBeat(beat, lane, onset, cfg)) {
      notes.push(note);
    }
  }

  if (notes.length < 6) {
    const totalBeats = Math.floor((buffer.duration - offset) / (60 / bpm)) * lpb;
    for (let b = 0; b < totalBeats && notes.length < 30; b += cfg.fallbackStep) {
      if (usedBeats.has(b)) continue;
      notes.push({ lane: (b / cfg.fallbackStep % 4) as LaneIndex, beat: b, type: 'tap' });
      usedBeats.add(b);
    }
  }

  notes.sort((a, b) => a.beat - b.beat);

  const level = Math.min(15, Math.max(1, Math.round(notes.length / 15) + cfg.levelBonus));

  return {
    id: `custom-${Date.now()}`,
    title,
    artist: 'Custom Track',
    bpm,
    offset,
    lpb,
    difficulty,
    level,
    notes,
    customAudio: true,
    audioDuration: buffer.duration,
    genre,
  };
}
