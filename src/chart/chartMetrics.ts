import type { ChartData, ChartNote } from '../types';

/** 譜面から算出する生メトリクス（G.DANSYNC / DDR 分析 20 項目） */
export interface ChartRawMetrics {
  bpm: number;
  maxBpm: number;
  minBpm: number;
  avgNps: number;
  maxNps: number;
  totalNotes: number;
  eighthRatio: number;
  twelfthRatio: number;
  sixteenthRatio: number;
  fastDivisionRatio: number;
  jumpRate: number;
  /** ホールド頭の個数比率 */
  holdHeadRate: number;
  /** ホールド占有時間 ÷ 曲長（DDR FREEZE 相当） */
  holdOccupancy: number;
  alternateRate: number;
  burstRate: number;
  crossRate: number;
  rhythmDifficulty: number;
  stopCount: number;
  sofranCount: number;
  staminaIndex: number;
  techIndex: number;
}

/**
 * レベル算出・Groove Radar 共通の正規化メトリクス（0〜1）。
 * いずれも同じ典型値 (TYPICAL) でスケールする。
 */
export interface ChartNormalizedMetrics {
  bpm: number;
  avgNps: number;
  maxNps: number;
  totalNotes: number;
  jump: number;
  freeze: number;
  chaos: number;
  cross: number;
}

/** DDR Groove Radar 互換 5 軸（0〜100） */
export interface ChartRadarAxes {
  stream: number;
  voltage: number;
  air: number;
  freeze: number;
  chaos: number;
}

export type ChartRadarAxis = keyof ChartRadarAxes;

export const CHART_RADAR_AXIS_ORDER: ChartRadarAxis[] = [
  'stream',
  'voltage',
  'air',
  'freeze',
  'chaos',
];

/** @deprecated レーダー軸と同一ソース。互換用エイリアス */
export interface ChartTraitIndices {
  stamina: number;
  technical: number;
  rhythm: number;
  jump: number;
  freeze: number;
}

const TYPICAL = {
  bpm: 200,
  avgNps: 10,
  maxNps: 14,
  totalNotes: 700,
  jumpRate: 0.45,
  holdOccupancy: 0.14,
  crossRate: 0.38,
  rhythm: 1.4,
  stopCount: 4,
  divisionMix: 0.4,
} as const;

const LEVEL_BREAKS = buildLevelBreaks();

/** G.DANSYNC 重み付け難易度 — DDR レベル (1〜20) の算出式 */
const DIFFICULTY_WEIGHTS = {
  bpm: 0.1,
  avgNps: 0.25,
  maxNps: 0.2,
  jump: 0.1,
  freeze: 0.1,
  chaos: 0.15,
  cross: 0.1,
} as const;

/** Groove Radar 表示用 — 正規化値を DDR らしいコントラストに伸ばす */
const RADAR_GAMMA = 0.84;

function buildLevelBreaks(): number[] {
  const breaks = [0.08, 0.15, 0.23];
  const step = (0.85 - 0.23) / 14;
  for (let i = 1; i <= 14; i++) breaks.push(0.23 + step * i);
  breaks.push(0.92);
  return breaks;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clamp100(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normLinear(value: number, typical: number): number {
  if (typical <= 0) return 0;
  return clamp01(value / typical);
}

function spreadRadar(norm01: number, gamma = RADAR_GAMMA): number {
  return clamp100(Math.pow(clamp01(norm01), gamma) * 100);
}

function computeHoldMetrics(
  notes: ChartNote[],
  chart: ChartData,
  songSec: number,
): {
  holdHeadRate: number;
  holdOccupancy: number;
} {
  if (notes.length === 0 || songSec <= 0) {
    return { holdHeadRate: 0, holdOccupancy: 0 };
  }

  const quarterSec = 60 / chart.bpm;
  let holdHeads = 0;
  let holdSec = 0;

  for (const n of notes) {
    if (n.type !== 'hold') continue;
    holdHeads++;
    const quarters = n.duration && n.duration > 0 ? n.duration / chart.lpb : 0.25;
    holdSec += quarters * quarterSec;
  }

  return {
    holdHeadRate: holdHeads / notes.length,
    holdOccupancy: clamp01(holdSec / songSec),
  };
}

function songLengthSec(chart: ChartData): number {
  const beatDur = 60 / chart.bpm;
  if (chart.notes.length === 0) return 60;
  const lastBeat = chart.notes[chart.notes.length - 1].beat;
  const end = chart.offset + (lastBeat / chart.lpb) * beatDur;
  return Math.max(20, end - chart.offset + 3);
}

function beatRows(notes: ChartNote[]): Map<number, ChartNote[]> {
  const rows = new Map<number, ChartNote[]>();
  for (const note of notes) {
    const list = rows.get(note.beat) ?? [];
    list.push(note);
    rows.set(note.beat, list);
  }
  return rows;
}

function isJumpRow(notes: ChartNote[]): boolean {
  if (notes.length < 2) return false;
  const lanes = notes.map((n) => n.lane);
  return Math.max(...lanes) - Math.min(...lanes) >= 2;
}

function classifyDivisionGap(
  gapQuarters: number,
): 'eighth' | 'twelfth' | 'sixteenth' | 'fast' | 'other' {
  const tol = 0.06;
  if (Math.abs(gapQuarters - 0.5) <= tol) return 'eighth';
  if (Math.abs(gapQuarters - 1 / 3) <= tol) return 'twelfth';
  if (Math.abs(gapQuarters - 0.25) <= tol) return 'sixteenth';
  if (gapQuarters > 0 && gapQuarters <= 0.2) return 'fast';
  return 'other';
}

function laneCorrection(lane: number): number {
  if (lane === 0 || lane === 3) return 1.35;
  return 1;
}

function noteIrregularity(chart: ChartData): number {
  const sorted = [...chart.notes].sort((a, b) => a.beat - b.beat || a.lane - b.lane);
  if (sorted.length < 2) return 0;

  let total = 0;
  let prevBeat = sorted[0].beat;
  let prevLane = sorted[0].lane;

  for (let i = 1; i < sorted.length; i++) {
    const note = sorted[i];
    const beatGap = Math.max(0.25, (note.beat - prevBeat) / chart.lpb);
    total += laneCorrection(note.lane) / beatGap;
    if (note.beat !== prevBeat) {
      prevBeat = note.beat;
      prevLane = note.lane;
    } else if (Math.abs(note.lane - prevLane) >= 2) {
      total += laneCorrection(note.lane);
    }
  }
  return total;
}

function computeStaminaIndex(chart: ChartData, songSec: number): number {
  const rows = beatRows(chart.notes);
  const beats = [...rows.keys()].sort((a, b) => a - b);
  if (beats.length === 0) return 0;

  const beatDur = 60 / chart.bpm / chart.lpb;
  const windowBeats = chart.lpb;
  let peakDensity = 0;
  let runDensity = 0;
  let runSec = 0;
  let best = 0;

  for (let i = 0; i < beats.length; i++) {
    const start = beats[i];
    const end = start + windowBeats;
    let count = 0;
    for (let j = i; j < beats.length && beats[j] < end; j++) {
      count += rows.get(beats[j])!.length;
    }
    const nps = count / (windowBeats * beatDur);
    peakDensity = Math.max(peakDensity, nps);

    if (nps >= TYPICAL.avgNps * 0.72) {
      runDensity += nps;
      runSec +=
        beats[i + 1] !== undefined ? Math.max(0, (beats[i + 1] - beats[i]) * beatDur) : beatDur;
    } else if (runSec > 0) {
      best = Math.max(best, (runDensity / Math.max(1, runSec)) * runSec);
      runDensity = 0;
      runSec = 0;
    }
  }
  if (runSec > 0) best = Math.max(best, runDensity);

  const lengthFactor = Math.min(1.4, songSec / 120);
  return ((peakDensity * 0.45 + best * 0.55) * lengthFactor) / TYPICAL.maxNps;
}

function computeTechIndex(
  crossRate: number,
  jumpRate: number,
  alternateRate: number,
  irregularity: number,
  songSec: number,
): number {
  const chaosUnit = (irregularity * 100) / Math.max(20, songSec);
  const layout = crossRate * 0.42 + jumpRate * 0.28 + (1 - alternateRate) * 0.3;
  return layout * 0.72 + normLinear(chaosUnit, 120) * 0.28;
}

export function computeChartRawMetrics(chart: ChartData): ChartRawMetrics {
  const notes = chart.notes;
  if (notes.length === 0) {
    return {
      bpm: chart.bpm,
      maxBpm: chart.bpm,
      minBpm: chart.bpm,
      avgNps: 0,
      maxNps: 0,
      totalNotes: 0,
      eighthRatio: 0,
      twelfthRatio: 0,
      sixteenthRatio: 0,
      fastDivisionRatio: 0,
      jumpRate: 0,
      holdHeadRate: 0,
      holdOccupancy: 0,
      alternateRate: 0,
      burstRate: 0,
      crossRate: 0,
      rhythmDifficulty: 0,
      stopCount: 0,
      sofranCount: 0,
      staminaIndex: 0,
      techIndex: 0,
    };
  }

  const songSec = songLengthSec(chart);
  const rows = beatRows(notes);
  const rowKeys = [...rows.keys()].sort((a, b) => a - b);
  const beatDur = 60 / chart.bpm / chart.lpb;

  let jumpRows = 0;
  for (const row of rows.values()) {
    if (isJumpRow(row)) jumpRows++;
    else if (row.length >= 2) jumpRows += 0.5;
  }

  const { holdHeadRate, holdOccupancy } = computeHoldMetrics(notes, chart, songSec);

  let eighth = 0;
  let twelfth = 0;
  let sixteenth = 0;
  let fast = 0;
  let divisionSamples = 0;
  for (let i = 1; i < rowKeys.length; i++) {
    const gapQuarters = (rowKeys[i] - rowKeys[i - 1]) / chart.lpb;
    if (gapQuarters <= 0) continue;
    divisionSamples++;
    const kind = classifyDivisionGap(gapQuarters);
    if (kind === 'eighth') eighth++;
    else if (kind === 'twelfth') twelfth++;
    else if (kind === 'sixteenth') sixteenth++;
    else if (kind === 'fast') fast++;
  }

  const sorted = [...notes].sort((a, b) => a.beat - b.beat || a.lane - b.lane);
  let alternates = 0;
  let bursts = 0;
  let crosses = 0;
  let transitions = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.beat === prev.beat) continue;
    transitions++;
    const laneDelta = Math.abs(cur.lane - prev.lane);
    if (laneDelta === 0) bursts++;
    else if (laneDelta === 1) alternates++;
    else if (laneDelta >= 2) crosses++;
  }

  const gaps: number[] = [];
  for (let i = 1; i < rowKeys.length; i++) {
    gaps.push((rowKeys[i] - rowKeys[i - 1]) / chart.lpb);
  }
  const gapMean = gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : 0;
  const gapVar = gaps.length ? gaps.reduce((s, g) => s + (g - gapMean) ** 2, 0) / gaps.length : 0;
  const gapCv = gapMean > 0 ? Math.sqrt(gapVar) / gapMean : 0;
  const offbeat = gaps.filter((g) => {
    const near = (target: number) => Math.abs(g - target) < 0.07;
    return !near(0.25) && !near(0.5) && !near(1) && g > 0.12;
  }).length;
  const rhythmDifficulty = gapCv * 0.65 + (gaps.length ? offbeat / gaps.length : 0) * 0.85;

  let stopCount = 0;
  const stopThresholdSec = 2.2;
  for (let i = 1; i < rowKeys.length; i++) {
    const gapSec = (rowKeys[i] - rowKeys[i - 1]) * beatDur;
    if (gapSec >= stopThresholdSec) stopCount++;
  }

  const windowBeats = chart.lpb;
  let peakNps = 0;
  for (let i = 0; i < rowKeys.length; i++) {
    const start = rowKeys[i];
    const end = start + windowBeats;
    let count = 0;
    for (let j = i; j < rowKeys.length && rowKeys[j] < end; j++) {
      count += rows.get(rowKeys[j])!.length;
    }
    const windowSec = windowBeats * beatDur;
    peakNps = Math.max(peakNps, count / Math.max(0.001, windowSec));
  }

  const irregularity = noteIrregularity(chart);
  const jumpRate = jumpRows / Math.max(1, rows.size);
  const alternateRate = transitions > 0 ? alternates / transitions : 0;
  const burstRate = transitions > 0 ? bursts / transitions : 0;
  const crossRate = transitions > 0 ? crosses / transitions : 0;
  const staminaIndex = computeStaminaIndex(chart, songSec);
  const techIndex = computeTechIndex(crossRate, jumpRate, alternateRate, irregularity, songSec);

  return {
    bpm: chart.bpm,
    maxBpm: chart.bpm,
    minBpm: chart.bpm,
    avgNps: notes.length / songSec,
    maxNps: peakNps,
    totalNotes: notes.length,
    eighthRatio: divisionSamples ? eighth / divisionSamples : 0,
    twelfthRatio: divisionSamples ? twelfth / divisionSamples : 0,
    sixteenthRatio: divisionSamples ? sixteenth / divisionSamples : 0,
    fastDivisionRatio: divisionSamples ? fast / divisionSamples : 0,
    jumpRate,
    holdHeadRate,
    holdOccupancy,
    alternateRate,
    burstRate,
    crossRate,
    rhythmDifficulty,
    stopCount,
    sofranCount: 0,
    staminaIndex,
    techIndex,
  };
}

export function normalizeChartMetrics(raw: ChartRawMetrics): ChartNormalizedMetrics {
  const divisionMix =
    (raw.eighthRatio + raw.twelfthRatio + raw.sixteenthRatio + raw.fastDivisionRatio) * 0.25;
  const chaos = clamp01(
    normLinear(raw.rhythmDifficulty, TYPICAL.rhythm) * 0.52 +
      normLinear(divisionMix, TYPICAL.divisionMix) * 0.28 +
      normLinear(raw.stopCount, TYPICAL.stopCount) * 0.2,
  );

  return {
    bpm: normLinear(raw.bpm, TYPICAL.bpm),
    avgNps: normLinear(raw.avgNps, TYPICAL.avgNps),
    maxNps: normLinear(raw.maxNps, TYPICAL.maxNps),
    totalNotes: normLinear(raw.totalNotes, TYPICAL.totalNotes),
    jump: normLinear(raw.jumpRate, TYPICAL.jumpRate),
    freeze: normLinear(raw.holdOccupancy, TYPICAL.holdOccupancy),
    chaos,
    cross: normLinear(raw.crossRate, TYPICAL.crossRate),
  };
}

/**
 * DDR Groove Radar 5 軸 — レベル算出と同じ norm から導出。
 *
 * | 軸 | DDR 意味 | ソース |
 * |----|----------|--------|
 * | STREAM | 平均密度 | avgNps + totalNotes |
 * | VOLTAGE | 瞬間ピーク | maxNps |
 * | AIR | ジャンプ・体のひねり | jump + cross |
 * | FREEZE | ホールド占有時間 | holdOccupancy |
 * | CHAOS | リズム難・変拍子 | chaos |
 */
export function metricsToRadarAxes(norm: ChartNormalizedMetrics): ChartRadarAxes {
  return {
    stream: spreadRadar(norm.avgNps * 0.72 + norm.totalNotes * 0.28),
    voltage: spreadRadar(norm.maxNps),
    air: spreadRadar(norm.jump * 0.58 + norm.cross * 0.42),
    freeze: spreadRadar(norm.freeze, 0.76),
    chaos: spreadRadar(norm.chaos),
  };
}

export function metricsToTraitIndices(
  norm: ChartNormalizedMetrics,
  axes: ChartRadarAxes,
): ChartTraitIndices {
  return {
    stamina: axes.voltage,
    technical: axes.air,
    rhythm: axes.chaos,
    jump: axes.air,
    freeze: axes.freeze,
  };
}

export function computeWeightedDifficulty(norm: ChartNormalizedMetrics): number {
  return clamp01(
    DIFFICULTY_WEIGHTS.bpm * norm.bpm +
      DIFFICULTY_WEIGHTS.avgNps * norm.avgNps +
      DIFFICULTY_WEIGHTS.maxNps * norm.maxNps +
      DIFFICULTY_WEIGHTS.jump * norm.jump +
      DIFFICULTY_WEIGHTS.freeze * norm.freeze +
      DIFFICULTY_WEIGHTS.chaos * norm.chaos +
      DIFFICULTY_WEIGHTS.cross * norm.cross,
  );
}

export function difficultyNormToLevel(norm: number): number {
  if (norm <= 0) return 1;
  for (let i = 0; i < LEVEL_BREAKS.length; i++) {
    if (norm < LEVEL_BREAKS[i]) return i + 1;
  }
  return LEVEL_BREAKS.length + 1;
}

export interface ChartAnalysis {
  raw: ChartRawMetrics;
  normalized: ChartNormalizedMetrics;
  axes: ChartRadarAxes;
  traits: ChartTraitIndices;
  difficultyNorm: number;
  level: number;
}

export function analyzeChart(chart: ChartData): ChartAnalysis {
  const raw = computeChartRawMetrics(chart);
  const normalized = normalizeChartMetrics(raw);
  const axes = metricsToRadarAxes(normalized);
  const traits = metricsToTraitIndices(normalized, axes);
  const difficultyNorm = computeWeightedDifficulty(normalized);
  const level = chart.notes.length === 0 ? 1 : difficultyNormToLevel(difficultyNorm);

  return { raw, normalized, axes, traits, difficultyNorm, level };
}
