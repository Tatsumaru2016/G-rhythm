import type { AudioEngine } from './AudioEngine';
import type { ChartData } from '../types';
import { applyBuiltinAudioSync, CHARTS } from '../data/charts';
import { IS_PROD_WEB } from '../perf/webPerf';

export class BuiltinSongAudio {
  private buffers = new Map<string, AudioBuffer>();

  async preloadAll(audio: AudioEngine): Promise<void> {
    const charts = CHARTS.filter((chart) => chart.audioTrack);
    const loadOne = async (chart: ChartData) => {
      const url = `${import.meta.env.BASE_URL}audio/${chart.audioTrack}`;
      const buffer = await audio.loadTrackFromUrl(url);
      this.buffers.set(chart.id, buffer);
    };

    if (IS_PROD_WEB) {
      for (const chart of charts) {
        await loadOne(chart);
      }
    } else {
      await Promise.all(charts.map(loadOne));
    }
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
