import { AudioEngine } from './AudioEngine';
import { analyzeGenre, getGenreLabel } from './musicGenre';
import { generateChart, estimateBpm, type CustomDifficulty } from './AutoChartGenerator';
import { titleFromFileName } from './customAudioExtensions';
import type { ChartData, MusicGenre } from '../types';

export type CustomImportMode = 'single' | 'folder';

export interface CustomSongMeta {
  title: string;
  duration: number;
  suggestedBpm: number;
  genre: MusicGenre;
  genreLabel: string;
  genreConfidence: number;
}

export interface CustomTrackEntry {
  id: string;
  title: string;
  file: File;
}

export interface CustomTrackSortMeta {
  bpm: number | null;
  duration: number | null;
}

export class CustomSongLoader {
  private buffer: AudioBuffer | null = null;
  private fileName = '';
  private genre: MusicGenre = 'other';
  private genreConfidence = 0;
  private importMode: CustomImportMode | null = null;
  private catalog: CustomTrackEntry[] = [];
  private selectedIndex = 0;
  private folderLabel = '';
  private bufferCache = new Map<string, AudioBuffer>();
  private trackMetaCache = new Map<string, { bpm: number; duration: number }>();

  constructor(private audio: AudioEngine) {}

  getBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  getGenre(): MusicGenre {
    return this.genre;
  }

  getImportMode(): CustomImportMode | null {
    return this.importMode;
  }

  isFolderMode(): boolean {
    return this.importMode === 'folder';
  }

  getCatalog(): readonly CustomTrackEntry[] {
    return this.catalog;
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  setSelectedIndex(index: number): void {
    if (!this.catalog.length) return;
    this.selectedIndex = ((index % this.catalog.length) + this.catalog.length) % this.catalog.length;
  }

  getFolderLabel(): string {
    return this.folderLabel;
  }

  getTrackSortMeta(file: File): CustomTrackSortMeta {
    const meta = this.trackMetaCache.get(this.trackCacheKey(file));
    if (!meta) return { bpm: null, duration: null };
    return meta;
  }

  setCatalogFromFiles(files: File[], folderLabel = ''): CustomTrackEntry[] {
    this.importMode = 'folder';
    this.folderLabel = folderLabel;
    this.catalog = files.map((file, index) => ({
      id: `custom-folder-${index}-${file.name}`,
      title: titleFromFileName(file.name),
      file,
    }));
    this.selectedIndex = 0;
    this.buffer = null;
    this.fileName = '';
    this.bufferCache.clear();
    this.trackMetaCache.clear();
    return this.catalog;
  }

  async loadFile(file: File): Promise<CustomSongMeta> {
    this.importMode = 'single';
    this.catalog = [];
    this.selectedIndex = 0;
    this.bufferCache.clear();
    this.trackMetaCache.clear();
    return this.decodeFile(file);
  }

  async selectTrack(index: number): Promise<CustomSongMeta> {
    if (!this.catalog.length) throw new Error('No catalog');
    const wrapped = ((index % this.catalog.length) + this.catalog.length) % this.catalog.length;
    this.selectedIndex = wrapped;
    return this.decodeFile(this.catalog[wrapped].file);
  }

  private trackCacheKey(file: File): string {
    return `${file.name}:${file.size}:${file.lastModified}`;
  }

  private async decodeFile(file: File): Promise<CustomSongMeta> {
    await this.audio.resume();
    const cacheKey = this.trackCacheKey(file);
    let buffer = this.bufferCache.get(cacheKey);
    if (!buffer) {
      const arrayBuffer = await file.arrayBuffer();
      buffer = await this.audio.decodeArrayBuffer(arrayBuffer);
      this.bufferCache.set(cacheKey, buffer);
    }

    this.buffer = buffer;
    this.fileName = titleFromFileName(file.name);
    const suggestedBpm = estimateBpm(buffer);
    this.trackMetaCache.set(cacheKey, {
      bpm: suggestedBpm,
      duration: buffer.duration,
    });

    const analysis = analyzeGenre(buffer);
    this.genre = analysis.genre;
    this.genreConfidence = analysis.confidence;

    this.audio.setUserBuffer(buffer);

    return {
      title: this.fileName,
      duration: buffer.duration,
      suggestedBpm,
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
    this.importMode = null;
    this.catalog = [];
    this.selectedIndex = 0;
    this.folderLabel = '';
    this.bufferCache.clear();
    this.trackMetaCache.clear();
    this.audio.clearUserBuffer();
  }
}
