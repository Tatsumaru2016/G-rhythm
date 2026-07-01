import type { CustomTrackEntry } from '../audio/CustomSongLoader';
import type { ChartData } from '../types';

/** カスタム曲 — ファイル属性で安定したキー */
export function fileSongRecordKey(file: File): string {
  return `custom:${file.name}:${file.size}:${file.lastModified}`;
}

export function builtinSongRecordKey(chartId: string): string {
  return `builtin:${chartId}`;
}

export function trackEntryRecordKey(entry: CustomTrackEntry): string {
  return fileSongRecordKey(entry.file);
}

export function chartSongRecordKey(chart: ChartData): string {
  if (chart.songRecordKey) return chart.songRecordKey;
  if (!chart.customAudio) return builtinSongRecordKey(chart.id);
  return `custom-legacy:${chart.title}`;
}
