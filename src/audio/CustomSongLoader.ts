import { AudioEngine } from './AudioEngine';
import { analyzeGenre, getGenreLabel } from './musicGenre';
import { generateChart, estimateBpm, type CustomDifficulty } from './AutoChartGenerator';
import type { ChartData, MusicGenre } from '../types';

export interface CustomSongMeta {
  title: string;
  duration: number;
  suggestedBpm: number;
  genre: MusicGenre;
  genreLabel: string;
  genreConfidence: number;
}

export class CustomSongLoader {
  private buffer: AudioBuffer | null = null;
  private fileName = '';
  private genre: MusicGenre = 'other';
  private genreConfidence = 0;

  constructor(private audio: AudioEngine) {}

  getBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  getGenre(): MusicGenre {
    return this.genre;
  }

  async loadFile(file: File): Promise<CustomSongMeta> {
    await this.audio.resume();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = await this.audio.decodeArrayBuffer(arrayBuffer);
    this.buffer = buffer;
    this.fileName = file.name.replace(/\.[^.]+$/, '');

    const analysis = analyzeGenre(buffer);
    this.genre = analysis.genre;
    this.genreConfidence = analysis.confidence;

    this.audio.setUserBuffer(buffer);

    return {
      title: this.fileName,
      duration: buffer.duration,
      suggestedBpm: estimateBpm(buffer),
      genre: this.genre,
      genreLabel: getGenreLabel(this.genre),
      genreConfidence: this.genreConfidence,
    };
  }

  buildChart(bpm: number, offset: number, difficulty: CustomDifficulty): ChartData {
    if (!this.buffer) throw new Error('No audio loaded');
    const chart = generateChart(
      this.buffer,
      this.fileName,
      bpm,
      offset,
      difficulty,
      this.genre,
    );
    chart.genreConfidence = this.genreConfidence;
    return chart;
  }

  clear() {
    this.buffer = null;
    this.fileName = '';
    this.genre = 'other';
    this.genreConfidence = 0;
    this.audio.clearUserBuffer();
  }
}
