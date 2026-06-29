import type { AudioEngine } from './AudioEngine';
import type { ChartData } from '../types';
import { applyBuiltinAudioSync, CHARTS } from '../data/charts';

export class BuiltinSongAudio {
  private buffers = new Map<string, AudioBuffer>();

  async preloadAll(audio: AudioEngine): Promise<void> {
    const tasks = CHARTS
      .filter((chart) => chart.audioTrack)
      .map(async (chart) => {
        const url = `${import.meta.env.BASE_URL}audio/${chart.audioTrack}`;
        const buffer = await audio.loadTrackFromUrl(url);
        this.buffers.set(chart.id, buffer);
      });
    await Promise.all(tasks);
    applyBuiltinAudioSync(this.buffers);
  }

  getBuffers(): ReadonlyMap<string, AudioBuffer> {
    return this.buffers;
  }

  getBuffer(chartId: string): AudioBuffer | null {
    return this.buffers.get(chartId) ?? null;
  }

  withAudioDuration(chart: ChartData): ChartData {
    const buffer = this.buffers.get(chart.id);
    if (!buffer) return chart;
    return { ...chart, audioDuration: buffer.duration };
  }
}
