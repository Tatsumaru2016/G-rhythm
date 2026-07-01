import { AudioEngine } from './AudioEngine';
import { analyzeGenre, getGenreLabel } from './musicGenre';
import { generateChart, estimateBpm, type CustomDifficulty } from './AutoChartGenerator';
import { titleFromFileName } from './customAudioExtensions';
import { fileSongRecordKey } from '../data/songRecordKey';
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

interface CachedTrackAnalysis {
  bpm: number;
  duration: number;
  genre: MusicGenre;
  genreConfidence: number;
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
  private currentFile: File | null = null;
  private bufferCache = new Map<string, AudioBuffer>();
  private trackAnalysisCache = new Map<string, CachedTrackAnalysis>();
  private inflightAnalysis = new Map<string, Promise<CachedTrackAnalysis>>();
  private chartPreviewCache = new Map<string, ChartData>();

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
    this.selectedIndex =
      ((index % this.catalog.length) + this.catalog.length) % this.catalog.length;
  }

  getFolderLabel(): string {
    return this.folderLabel;
  }

  hasTrackMeta(file: File): boolean {
    return this.trackAnalysisCache.has(this.trackCacheKey(file));
  }

  /** Unblocks folder cards when background analysis fails. */
  markTrackMetaFailed(file: File): void {
    const cacheKey = this.trackCacheKey(file);
    if (this.trackAnalysisCache.has(cacheKey)) return;
    this.trackAnalysisCache.set(cacheKey, {
      bpm: 120,
      duration: 0,
      genre: 'other',
      genreConfidence: 0,
    });
  }

  getTrackSortMeta(file: File): CustomTrackSortMeta {
    const meta = this.trackAnalysisCache.get(this.trackCacheKey(file));
    if (!meta) return { bpm: null, duration: null };
    return { bpm: meta.bpm, duration: meta.duration };
  }

  setCatalogFromFiles(files: File[], folderLabel = ''): CustomTrackEntry[] {
    this.importMode = 'folder';
    this.folderLabel = folderLabel;
    this.catalog = files.map((file) => ({
      id: fileSongRecordKey(file),
      title: titleFromFileName(file.name),
      file,
    }));
    this.selectedIndex = 0;
    this.buffer = null;
    this.fileName = '';
    this.bufferCache.clear();
    this.trackAnalysisCache.clear();
    this.inflightAnalysis.clear();
    this.chartPreviewCache.clear();
    return this.catalog;
  }

  async loadFile(file: File): Promise<CustomSongMeta> {
    this.importMode = 'single';
    this.catalog = [];
    this.selectedIndex = 0;
    this.folderLabel = '';
    this.bufferCache.clear();
    this.trackAnalysisCache.clear();
    this.inflightAnalysis.clear();
    this.chartPreviewCache.clear();
    return this.decodeFile(file);
  }

  async selectTrack(index: number): Promise<CustomSongMeta> {
    if (!this.catalog.length) throw new Error('No catalog');
    const wrapped = ((index % this.catalog.length) + this.catalog.length) % this.catalog.length;
    this.selectedIndex = wrapped;
    return this.decodeFile(this.catalog[wrapped].file);
  }

  /** Decode + analyze one track; safe to call in background for folder catalog meta. */
  async analyzeTrackMeta(file: File): Promise<CustomTrackSortMeta> {
    const analysis = await this.ensureTrackAnalysis(file);
    return { bpm: analysis.bpm, duration: analysis.duration };
  }

  private trackCacheKey(file: File): string {
    return `${file.name}:${file.size}:${file.lastModified}`;
  }

  private async ensureTrackDecoded(file: File): Promise<AudioBuffer> {
    const cacheKey = this.trackCacheKey(file);
    let buffer = this.bufferCache.get(cacheKey);
    if (!buffer) {
      await this.audio.resume();
      const arrayBuffer = await file.arrayBuffer();
      buffer = await this.audio.decodeArrayBuffer(arrayBuffer);
      this.bufferCache.set(cacheKey, buffer);
    }
    return buffer;
  }

  private async ensureTrackAnalysis(file: File): Promise<CachedTrackAnalysis> {
    const cacheKey = this.trackCacheKey(file);
    const cached = this.trackAnalysisCache.get(cacheKey);
    if (cached) return cached;

    let inflight = this.inflightAnalysis.get(cacheKey);
    if (!inflight) {
      inflight = this.runTrackAnalysis(file, cacheKey);
      this.inflightAnalysis.set(cacheKey, inflight);
      void inflight.finally(() => {
        if (this.inflightAnalysis.get(cacheKey) === inflight) {
          this.inflightAnalysis.delete(cacheKey);
        }
      });
    }
    return inflight;
  }

  private async runTrackAnalysis(file: File, cacheKey: string): Promise<CachedTrackAnalysis> {
    const buffer = await this.ensureTrackDecoded(file);
    const suggestedBpm = estimateBpm(buffer);
    const analysis = analyzeGenre(buffer);
    const meta: CachedTrackAnalysis = {
      bpm: suggestedBpm,
      duration: buffer.duration,
      genre: analysis.genre,
      genreConfidence: analysis.confidence,
    };
    this.trackAnalysisCache.set(cacheKey, meta);
    return meta;
  }

  private async decodeFile(file: File): Promise<CustomSongMeta> {
    this.currentFile = file;
    const buffer = await this.ensureTrackDecoded(file);
    const analysis = await this.ensureTrackAnalysis(file);

    this.buffer = buffer;
    this.fileName = titleFromFileName(file.name);
    this.genre = analysis.genre;
    this.genreConfidence = analysis.genreConfidence;

    this.audio.setUserBuffer(buffer);

    return {
      title: this.fileName,
      duration: analysis.duration,
      suggestedBpm: analysis.bpm,
      genre: this.genre,
      genreLabel: getGenreLabel(this.genre),
      genreConfidence: this.genreConfidence,
    };
  }

  buildChart(bpm: number, offset: number, difficulty: CustomDifficulty): ChartData {
    if (!this.buffer) throw new Error('No audio loaded');
    const chart = generateChart(this.buffer, this.fileName, bpm, offset, difficulty, this.genre);
    chart.genreConfidence = this.genreConfidence;
    const recordKey = this.getActiveRecordKey();
    if (recordKey) chart.songRecordKey = recordKey;
    return chart;
  }

  /** Folder list level preview — uses cached decode/analysis without switching the active track. */
  buildChartPreviewForFile(
    file: File,
    difficulty: CustomDifficulty,
    bpm?: number,
    offset = 0,
  ): ChartData | null {
    const trackKey = this.trackCacheKey(file);
    const analysis = this.trackAnalysisCache.get(trackKey);
    const buffer = this.bufferCache.get(trackKey);
    if (!analysis || !buffer) return null;

    const useBpm = bpm ?? analysis.bpm;
    const previewKey = `${trackKey}:${difficulty}:${useBpm}:${offset}`;
    const cached = this.chartPreviewCache.get(previewKey);
    if (cached) return cached;

    const chart = generateChart(
      buffer,
      titleFromFileName(file.name),
      useBpm,
      offset,
      difficulty,
      analysis.genre,
    );
    chart.genreConfidence = analysis.genreConfidence;
    chart.songRecordKey = fileSongRecordKey(file);
    this.chartPreviewCache.set(previewKey, chart);
    return chart;
  }

  getActiveRecordKey(): string | null {
    if (this.importMode === 'folder' && this.catalog.length > 0) {
      return fileSongRecordKey(this.catalog[this.selectedIndex].file);
    }
    if (this.currentFile) return fileSongRecordKey(this.currentFile);
    return null;
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
    this.currentFile = null;
    this.bufferCache.clear();
    this.trackAnalysisCache.clear();
    this.inflightAnalysis.clear();
    this.chartPreviewCache.clear();
    this.audio.clearUserBuffer();
  }
}
