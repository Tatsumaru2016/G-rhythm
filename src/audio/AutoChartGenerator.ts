import type { ChartData, ChartNote, LaneIndex, MusicGenre } from '../types';
import { chartDisplayLevel } from '../chart/chartRadar';
import {
  analyzeGenre,
  getGenreChartModifiers,
  type GenreChartModifiers,
} from './musicGenre';
import { detectOnsets, type AudioOnset } from './onsetDetection';

export type CustomDifficulty = 'EASY' | 'NORMAL' | 'HARD' | 'EXTREME';

export const CUSTOM_DIFFICULTIES: CustomDifficulty[] = ['EASY', 'NORMAL', 'HARD', 'EXTREME'];

interface DifficultyConfig {
  minGapSec: number;
  minBeatGap: number;
  holdChance: boolean;
  holdEnergy: number;
  holdBeatMod: number;
  holdDuration: number;
  holdSpawnChance: number;
  chordChance: number;
  maxChordLanes: number;
  fallbackStep: number;
}

/** DDR 4 段階（BEGINNER / BASIC / DIFFICULT / EXPERT）に相当する自動譜面スケール */
const DIFFICULTY_CONFIG: Record<CustomDifficulty, DifficultyConfig> = {
  EASY: {
    minGapSec: 0.58,
    minBeatGap: 14,
    holdChance: false,
    holdEnergy: 1,
    holdBeatMod: 32,
    holdDuration: 4,
    holdSpawnChance: 0,
    chordChance: 0,
    maxChordLanes: 1,
    fallbackStep: 12,
  },
  NORMAL: {
    minGapSec: 0.36,
    minBeatGap: 6,
    holdChance: false,
    holdEnergy: 0.14,
    holdBeatMod: 16,
    holdDuration: 4,
    holdSpawnChance: 0,
    chordChance: 0.1,
    maxChordLanes: 2,
    fallbackStep: 8,
  },
  HARD: {
    minGapSec: 0.30,
    minBeatGap: 4,
    holdChance: false,
    holdEnergy: 0.14,
    holdBeatMod: 12,
    holdDuration: 6,
    holdSpawnChance: 0,
    chordChance: 0.12,
    maxChordLanes: 2,
    fallbackStep: 6,
  },
  EXTREME: {
    minGapSec: 0.18,
    minBeatGap: 2,
    holdChance: true,
    holdEnergy: 0.04,
    holdBeatMod: 4,
    holdDuration: 12,
    holdSpawnChance: 0.48,
    chordChance: 0.28,
    maxChordLanes: 4,
    fallbackStep: 2,
  },
};

export function estimateBpm(buffer: AudioBuffer): number {
  return analyzeGenre(buffer).features.bpm;
}

export function formatChartDifficultyLabel(difficulty: string): string {
  return difficulty.toUpperCase();
}

export function difficultyCssClass(difficulty: string): string {
  return difficulty.toLowerCase();
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
  onset: AudioOnset,
  cfg: DifficultyConfig,
): ChartNote[] {
  const onHoldGrid = beat % cfg.holdBeatMod === 0;
  const isHold = cfg.holdChance
    && onHoldGrid
    && (onset.energy > cfg.holdEnergy || Math.random() < cfg.holdSpawnChance);

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

/** 難易度ごとの最小ビート間隔フロア（ジャンル補正後も下回らない） */
const MIN_BEAT_GAP_FLOOR: Record<CustomDifficulty, number> = {
  EASY: 10,
  NORMAL: 5,
  HARD: 3,
  EXTREME: 1,
};

export function generateChart(
  buffer: AudioBuffer,
  title: string,
  bpm: number,
  offset: number,
  difficulty: CustomDifficulty,
  genre: MusicGenre = 'other',
): ChartData {
  const genreMod = getGenreChartModifiers(genre);
  const cfgBase = applyGenreToConfig(DIFFICULTY_CONFIG[difficulty], genreMod);
  const cfg = {
    ...cfgBase,
    minBeatGap: Math.max(MIN_BEAT_GAP_FLOOR[difficulty], cfgBase.minBeatGap),
  };
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

  const draft: ChartData = {
    id: `custom-${Date.now()}`,
    title,
    artist: 'Custom Track',
    bpm,
    offset,
    lpb,
    difficulty,
    level: 1,
    notes,
    customAudio: true,
    audioDuration: buffer.duration,
    genre,
  };
  const level = chartDisplayLevel(draft);

  return {
    ...draft,
    level,
  };
}
