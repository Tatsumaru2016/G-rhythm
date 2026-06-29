import type { ChartData, ChartNote } from '../types';

/** DDR グルーヴレーダー5軸（0〜200、表示は 0〜100 に正規化） */
export interface GrooveRadarStats {
  stream: number;
  voltage: number;
  chaos: number;
  air: number;
  freeze: number;
}

export type GrooveRadarAxis = keyof GrooveRadarStats;

export const GROOVE_RADAR_AXES: GrooveRadarAxis[] = [
  'stream',
  'voltage',
  'chaos',
  'air',
  'freeze',
];

function clampDisplay(ddrRaw: number, typicalMax: number): number {
  if (typicalMax <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((ddrRaw / typicalMax) * 100)));
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

function notesPerMinute(chart: ChartData, songSec: number): number {
  return Math.floor((60 * chart.notes.length) / songSec);
}

/** DDR X2 以降 Singles STREAM */
function ddrStream(notesPerMin: number): number {
  if (notesPerMin >= 300) return ((notesPerMin - 203) * 100) / 97;
  return notesPerMin / 3;
}

function peakRowsIn4Beats(chart: ChartData): number {
  const rows = beatRows(chart.notes);
  const beats = [...rows.keys()].sort((a, b) => a - b);
  if (beats.length === 0) return 0;

  const windowBeats = chart.lpb;
  let peak = 0;
  for (let i = 0; i < beats.length; i++) {
    const start = beats[i];
    const end = start + windowBeats;
    let count = 0;
    for (let j = i; j < beats.length && beats[j] < end; j++) {
      count += rows.get(beats[j])!.length;
    }
    peak = Math.max(peak, count);
  }
  return peak;
}

/** DDR X2 以降 VOLTAGE */
function ddrVoltage(maxDensityPerMin: number): number {
  if (maxDensityPerMin >= 600) return ((maxDensityPerMin + 102) * 100) / 702;
  return maxDensityPerMin / 6;
}

function laneCorrection(lane: number): number {
  // 4レーン版: 外レーンほど CHAOS 寄与を大きく（DDR の色補正の簡易近似）
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
    const arrows = 1;
    total += (arrows * laneCorrection(note.lane)) / beatGap;
    if (note.beat !== prevBeat) {
      prevBeat = note.beat;
      prevLane = note.lane;
    } else if (Math.abs(note.lane - prevLane) >= 2) {
      total += laneCorrection(note.lane);
    }
  }
  return total;
}

/** DDR X2 以降 Singles CHAOS（BPM 変化なし譜面向け） */
function ddrChaos(irregularity: number, songSec: number): number {
  const unit = (irregularity * 100) / songSec;
  if (unit >= 2000) return ((unit + 21605) * 100) / 23605;
  return unit / 20;
}

function isJumpRow(notes: ChartNote[]): boolean {
  if (notes.length < 2) return false;
  const lanes = notes.map((n) => n.lane);
  const min = Math.min(...lanes);
  const max = Math.max(...lanes);
  return max - min >= 2;
}

function jumpsPerMinute(chart: ChartData, songSec: number): number {
  const rows = beatRows(chart.notes);
  let jumps = 0;
  for (const row of rows.values()) {
    if (isJumpRow(row)) jumps++;
    else if (row.length >= 2) jumps += 0.5;
  }
  return (60 * jumps) / songSec;
}

/** DDR X2 以降 AIR */
function ddrAir(jumpsPerMin: number): number {
  if (jumpsPerMin >= 55) return ((jumpsPerMin - 1) * 50) / 27;
  return (jumpsPerMin * 20) / 11;
}

function freezeBeatCount(chart: ChartData): number {
  return chart.notes.reduce((sum, note) => {
    if (note.type !== 'hold') return sum;
    return sum + (note.duration ?? chart.lpb / 2);
  }, 0);
}

function songBeatCount(chart: ChartData, songSec: number): number {
  const fromNotes = chart.notes.length > 0
    ? chart.notes[chart.notes.length - 1].beat + chart.lpb
    : chart.lpb * 16;
  const fromDuration = (songSec / (60 / chart.bpm)) * chart.lpb;
  return Math.max(fromNotes, fromDuration);
}

/** DDR X2 以降 FREEZE */
function ddrFreeze(freezeRatio10k: number): number {
  if (freezeRatio10k >= 3500) return ((freezeRatio10k + 2484) * 100) / 5984;
  return freezeRatio10k / 35;
}

/** DDR グルーヴレーダー（譜面統計から算出、0〜100 表示スケール） */
export function computeGrooveRadar(chart: ChartData): GrooveRadarStats {
  if (chart.notes.length === 0) {
    return { stream: 0, voltage: 0, chaos: 0, air: 0, freeze: 0 };
  }

  const songSec = songLengthSec(chart);
  const npm = notesPerMinute(chart, songSec);
  const peak4 = peakRowsIn4Beats(chart);
  const maxDensityPerMin = Math.floor((chart.bpm * peak4) / 4);
  const irregularity = noteIrregularity(chart);
  const jmpm = jumpsPerMinute(chart, songSec);
  const freezeRatio10k = (10000 * freezeBeatCount(chart)) / songBeatCount(chart, songSec);

  return {
    stream: clampDisplay(ddrStream(npm), 55),
    voltage: clampDisplay(ddrVoltage(maxDensityPerMin), 45),
    chaos: clampDisplay(ddrChaos(irregularity, songSec), 40),
    air: clampDisplay(ddrAir(jmpm), 35),
    freeze: clampDisplay(ddrFreeze(freezeRatio10k), 50),
  };
}
