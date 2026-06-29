import type { ChartData, ChartNote, ActiveNote } from '../types';

export function beatToTime(beatInQuarterNotes: number, chart: ChartData): number {
  const beatDuration = 60 / chart.bpm;
  return chart.offset + beatInQuarterNotes * beatDuration;
}

/** 長押しは EXTREME のみ。それ以外の難易度ではホールドをタップに変換 */
export function normalizeChartForPlay(chart: ChartData): ChartData {
  if (chart.difficulty.toUpperCase() === 'EXTREME') return chart;
  return {
    ...chart,
    notes: chart.notes.map((note) => (
      note.type === 'hold'
        ? { lane: note.lane, beat: note.beat, type: 'tap' as const }
        : note
    )),
  };
}

export function parseChart(chart: ChartData): ActiveNote[] {
  const beatUnit = chart.lpb;
  return chart.notes.map((note, i) => {
    const time = beatToTime(note.beat / beatUnit, chart);
    const active: ActiveNote = {
      id: i,
      lane: note.lane,
      time,
      type: note.type,
      hit: false,
      holding: false,
      missed: false,
      released: false,
    };
    if (note.type === 'hold' && note.duration) {
      active.endTime = beatToTime((note.beat + note.duration) / beatUnit, chart);
    }
    return active;
  }).sort((a, b) => a.time - b.time);
}

/** 最初のノーツが画面上端から流れ始めるよう offset を補正 */
export function withLeadInPad(chart: ChartData, approachTime: number): ChartData {
  const notes = parseChart(chart);
  const firstTime = notes[0]?.time ?? chart.offset;
  const leadPad = Math.max(0, approachTime - firstTime);
  if (leadPad <= 0) return chart;
  return { ...chart, offset: chart.offset + leadPad };
}

export function getSongDuration(chart: ChartData): number {
  let maxTime = chart.offset + 4;
  for (const note of chart.notes) {
    const start = beatToTime(note.beat / chart.lpb, chart);
    const end = note.type === 'hold' && note.duration
      ? beatToTime((note.beat + note.duration) / chart.lpb, chart)
      : start;
    maxTime = Math.max(maxTime, end);
  }
  const noteEnd = maxTime + 3;
  if (chart.audioDuration != null) {
    return Math.max(noteEnd, chart.audioDuration);
  }
  return noteEnd;
}

/** ダンサー切替用（譜面終端ベース。長い無音区間の MP3 長さは使わない） */
export function getDancerRotationDuration(chart: ChartData): number {
  let maxTime = chart.offset + 4;
  for (const note of chart.notes) {
    const start = beatToTime(note.beat / chart.lpb, chart);
    const end = note.type === 'hold' && note.duration
      ? beatToTime((note.beat + note.duration) / chart.lpb, chart)
      : start;
    maxTime = Math.max(maxTime, end);
  }
  return maxTime + 3;
}

export function validateNote(note: ChartNote): boolean {
  return note.lane >= 0 && note.lane <= 3;
}
