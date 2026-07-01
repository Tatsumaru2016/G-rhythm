import type { ResultVoiceId } from './resultVoice';
import { fetchAndDecodeAudio } from './loadAudioBuffer';
import type { ChartData, LaneIndex, JudgmentType } from '../types';
import { CyberSynth } from './cyberSynth';
import { playLaneHitSound } from './hitSounds';
import { PreviewPlayback } from './previewPlayback';

/** 周波数バー数（イコライザー等で共有） */
export const AUDIO_BAND_COUNT = 24;

export interface AudioReactive {
  bass: number;
  vocal: number;
  energy: number;
  spike: number;
  bands: number[];
  hasSignal: boolean;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private bandRanges: [number, number][] = [];
  private audioReactive: AudioReactive = {
    bass: 0,
    vocal: 0,
    energy: 0,
    spike: 0,
    bands: Array.from({ length: AUDIO_BAND_COUNT }, () => 0),
    hasSignal: false,
  };
  private energyBaseline = 0;
  private smoothedBass = 0;
  private smoothedVocal = 0;
  private startTime = 0;
  private playing = false;
  private scheduledNodes: AudioScheduledSourceNode[] = [];
  private chart: ChartData | null = null;
  private musicEndCallback: (() => void) | null = null;
  private userBuffer: AudioBuffer | null = null;
  private chartBuffer: AudioBuffer | null = null;
  private userSource: AudioBufferSourceNode | null = null;
  private titleBgmBuffer: AudioBuffer | null = null;
  private titleBgmSource: AudioBufferSourceNode | null = null;
  private titleBgmGain: GainNode | null = null;
  private startSoundBuffer: AudioBuffer | null = null;
  private countdownTickBuffer: AudioBuffer | null = null;
  private activeCountdownSequence: AudioBufferSourceNode | null = null;
  private resultAnnounceBuffer: AudioBuffer | null = null;
  private resultVoiceBuffers = new Map<ResultVoiceId, AudioBuffer>();
  private gameplayCheerBuffers: AudioBuffer[] = [];
  private activeGameplayCheer: AudioBufferSourceNode | null = null;
  private randomPickRouletteBuffer: AudioBuffer | null = null;
  private randomPickDecideBuffer: AudioBuffer | null = null;
  private randomPickPanelLandBuffer: AudioBuffer | null = null;
  private activeRandomPickRoulette: AudioBufferSourceNode | null = null;
  private randomPickSoundUrls: { roulette: string; decide: string; panelLand: string } | null =
    null;
  private randomPickLoadPromise: Promise<void> | null = null;
  private songFinishCheerBuffer: AudioBuffer | null = null;
  private songFinishCheerUrl: string | null = null;
  private songFinishCheerLoadPromise: Promise<void> | null = null;
  private dangerVoiceBuffer: AudioBuffer | null = null;
  private activeDangerVoice: AudioBufferSourceNode | null = null;
  private unlockListenersBound = false;
  private wantsTitleBgmPlay = false;
  private synth: CyberSynth | null = null;
  private preview: PreviewPlayback | null = null;

  private getSynth(): CyberSynth {
    if (!this.synth) {
      this.synth = new CyberSynth(
        () => this.ctx,
        () => this.sfxGain,
      );
    }
    return this.synth;
  }

  private getPreview(): PreviewPlayback {
    if (!this.preview) {
      this.preview = new PreviewPlayback({
        getCtx: () => this.ctx,
        getMusicGain: () => this.musicGain,
        getUserBuffer: () => this.userBuffer,
        isContextRunning: () => this.isContextRunning(),
      });
    }
    return this.preview;
  }

  async decodeArrayBuffer(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    await this.init();
    return this.ctx!.decodeAudioData(arrayBuffer);
  }

  setUserBuffer(buffer: AudioBuffer): void {
    this.userBuffer = buffer;
  }

  clearUserBuffer(): void {
    this.userBuffer = null;
  }

  setChartBuffer(buffer: AudioBuffer | null): void {
    this.chartBuffer = buffer;
  }

  clearChartBuffer(): void {
    this.chartBuffer = null;
  }

  async loadTrackFromUrl(url: string): Promise<AudioBuffer> {
    await this.init();
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`[AudioEngine] failed to load track: ${url}`);
    }
    return this.decodeArrayBuffer(await response.arrayBuffer());
  }

  async loadTitleBgm(url: string): Promise<void> {
    this.titleBgmBuffer = await this.loadTrackFromUrl(url);
  }

  async loadStartSound(url: string): Promise<void> {
    this.startSoundBuffer = await this.loadTrackFromUrl(url);
  }

  async loadCountdownSound(url: string): Promise<void> {
    await this.init();
    this.countdownTickBuffer = await fetchAndDecodeAudio(
      (ab) => this.decodeArrayBuffer(ab),
      url,
      'countdown',
    );
  }

  async loadResultVoices(loadUrl: (id: ResultVoiceId) => string): Promise<void> {
    const ids: ResultVoiceId[] = ['marvelous', 'excellent', 'good', 'close'];
    await Promise.all(
      ids.map(async (id) => {
        try {
          const buffer = await this.loadTrackFromUrl(loadUrl(id));
          this.resultVoiceBuffers.set(id, buffer);
        } catch (err) {
          console.warn(`[AudioEngine] result voice load failed: ${id}`, err);
        }
      }),
    );
  }

  async loadResultAnnounce(url: string): Promise<void> {
    await this.init();
    this.resultAnnounceBuffer = await fetchAndDecodeAudio(
      (ab) => this.decodeArrayBuffer(ab),
      url,
      'result announce',
    );
  }

  async loadGameplayCheers(urls: string[]): Promise<void> {
    this.gameplayCheerBuffers = [];
    await Promise.all(
      urls.map(async (url) => {
        try {
          const buffer = await this.loadTrackFromUrl(url);
          this.gameplayCheerBuffers.push(buffer);
        } catch (err) {
          console.warn(`[AudioEngine] gameplay cheer load failed: ${url}`, err);
        }
      }),
    );
  }

  async loadRandomPickSounds(urls: {
    roulette: string;
    decide: string;
    panelLand: string;
  }): Promise<void> {
    this.randomPickSoundUrls = urls;
    const entries: [keyof typeof urls, string][] = [
      ['roulette', urls.roulette],
      ['decide', urls.decide],
      ['panelLand', urls.panelLand],
    ];
    await Promise.all(
      entries.map(async ([key, url]) => {
        if (
          (key === 'roulette' && this.randomPickRouletteBuffer) ||
          (key === 'decide' && this.randomPickDecideBuffer) ||
          (key === 'panelLand' && this.randomPickPanelLandBuffer)
        ) {
          return;
        }
        try {
          const buffer = await this.loadTrackFromUrl(url);
          if (key === 'roulette') this.randomPickRouletteBuffer = buffer;
          else if (key === 'decide') this.randomPickDecideBuffer = buffer;
          else this.randomPickPanelLandBuffer = buffer;
        } catch (err) {
          console.warn(`[AudioEngine] random pick sound load failed: ${key}`, url, err);
        }
      }),
    );
  }

  async ensureRandomPickSoundsLoaded(): Promise<void> {
    if (!this.randomPickSoundUrls) return;
    if (
      this.randomPickRouletteBuffer &&
      this.randomPickDecideBuffer &&
      this.randomPickPanelLandBuffer
    ) {
      return;
    }
    if (!this.randomPickLoadPromise) {
      this.randomPickLoadPromise = this.loadRandomPickSounds(this.randomPickSoundUrls).finally(
        () => {
          this.randomPickLoadPromise = null;
        },
      );
    }
    await this.randomPickLoadPromise;
  }

  hasRandomPickSounds(): boolean {
    return Boolean(
      this.randomPickRouletteBuffer &&
      this.randomPickDecideBuffer &&
      this.randomPickPanelLandBuffer,
    );
  }

  async loadSongFinishCheer(url: string): Promise<void> {
    this.songFinishCheerUrl = url;
    if (this.songFinishCheerBuffer) return;
    try {
      this.songFinishCheerBuffer = await this.loadTrackFromUrl(url);
    } catch (err) {
      console.warn('[AudioEngine] song finish cheer load failed', url, err);
    }
  }

  async ensureSongFinishCheerLoaded(): Promise<void> {
    if (this.songFinishCheerBuffer || !this.songFinishCheerUrl) return;
    if (!this.songFinishCheerLoadPromise) {
      this.songFinishCheerLoadPromise = this.loadSongFinishCheer(this.songFinishCheerUrl).finally(
        () => {
          this.songFinishCheerLoadPromise = null;
        },
      );
    }
    await this.songFinishCheerLoadPromise;
  }

  playSongFinishCheer(): void {
    if (!this.ctx || !this.sfxGain || !this.songFinishCheerBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.songFinishCheerBuffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.92;
    src.connect(gain);
    gain.connect(this.sfxGain);
    src.start(0);
  }

  async loadDangerVoice(url: string): Promise<void> {
    if (this.dangerVoiceBuffer) return;
    try {
      this.dangerVoiceBuffer = await this.loadTrackFromUrl(url);
    } catch (err) {
      console.warn('[AudioEngine] danger voice load failed', url, err);
    }
  }

  playDangerVoice(): void {
    if (!this.ctx || !this.sfxGain || !this.dangerVoiceBuffer) return;
    if (this.activeDangerVoice) {
      try {
        this.activeDangerVoice.stop();
      } catch {
        /* already stopped */
      }
      this.activeDangerVoice = null;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.dangerVoiceBuffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.95;
    src.connect(gain);
    gain.connect(this.sfxGain);
    src.onended = () => {
      if (this.activeDangerVoice === src) this.activeDangerVoice = null;
    };
    src.start(0);
    this.activeDangerVoice = src;
  }

  stopRandomPickRoulette(): void {
    if (!this.activeRandomPickRoulette) return;
    try {
      this.activeRandomPickRoulette.stop();
    } catch {
      /* already stopped */
    }
    this.activeRandomPickRoulette = null;
  }

  playRandomPickRoulette(): void {
    if (!this.ctx || !this.sfxGain) return;
    this.stopRandomPickRoulette();
    if (!this.randomPickRouletteBuffer) {
      console.warn('[AudioEngine] random pick roulette buffer not loaded');
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.randomPickRouletteBuffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 1;
    src.connect(gain);
    gain.connect(this.sfxGain);
    src.onended = () => {
      if (this.activeRandomPickRoulette === src) this.activeRandomPickRoulette = null;
    };
    src.start(0);
    this.activeRandomPickRoulette = src;
  }

  playRandomPickSongDecided(): void {
    this.playRandomPickOneShot(this.randomPickDecideBuffer, 1);
  }

  playRandomPickPanelLand(): void {
    this.playRandomPickOneShot(this.randomPickPanelLandBuffer, 1);
  }

  private playRandomPickOneShot(buffer: AudioBuffer | null, volume: number): void {
    if (!this.ctx || !this.sfxGain) return;
    if (!buffer) {
      console.warn('[AudioEngine] random pick one-shot buffer not loaded');
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(this.sfxGain);
    src.start(0);
  }

  isTitleBgmPlaying(): boolean {
    return this.titleBgmSource !== null;
  }

  async playTitleBgm(): Promise<void> {
    if (!this.titleBgmBuffer) return;
    await this.resume();
    if (!this.isContextRunning()) {
      this.wantsTitleBgmPlay = true;
      this.ensureUnlockListeners();
      return;
    }
    this.wantsTitleBgmPlay = false;
    this.startTitleBgmSource();
  }

  private startTitleBgmSource(): void {
    if (!this.titleBgmBuffer || !this.ctx || !this.masterGain) return;
    if (!this.isContextRunning()) return;
    this.stopTitleBgm();

    if (!this.titleBgmGain) {
      this.titleBgmGain = this.ctx.createGain();
      this.titleBgmGain.gain.value = 0.55;
      this.titleBgmGain.connect(this.masterGain);
    }

    const source = this.ctx.createBufferSource();
    source.buffer = this.titleBgmBuffer;
    source.loop = true;
    source.connect(this.titleBgmGain);
    source.start(0);
    this.titleBgmSource = source;
  }

  stopTitleBgm(): void {
    this.wantsTitleBgmPlay = false;
    if (!this.titleBgmSource) return;
    try {
      this.titleBgmSource.stop();
    } catch {
      /* already stopped */
    }
    this.titleBgmSource = null;
  }

  hasUserBuffer(): boolean {
    return this.userBuffer !== null;
  }

  setOnMusicEnd(callback: (() => void) | null): void {
    this.musicEndCallback = callback;
  }

  getUserDuration(): number {
    return this.userBuffer?.duration ?? 0;
  }

  async init(): Promise<void> {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.85;
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.45;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.2;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.bandRanges = this.buildLogBandRanges(this.analyser.frequencyBinCount);
    this.musicGain.connect(this.analyser);
    this.analyser.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.7;
    this.sfxGain.connect(this.masterGain);
    this.ensureUnlockListeners();
  }

  async resume(): Promise<void> {
    await this.init();
    if (this.ctx?.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* autoplay policy — wait for user gesture */
      }
    }
  }

  private isContextRunning(): boolean {
    return this.ctx?.state === 'running';
  }

  private ensureUnlockListeners(): void {
    if (this.unlockListenersBound) return;
    this.unlockListenersBound = true;
    const onGesture = () => {
      void this.flushPendingAfterUnlock();
    };
    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
    window.addEventListener('touchstart', onGesture, true);
  }

  private async flushPendingAfterUnlock(): Promise<void> {
    await this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        return;
      }
    }
    if (!this.isContextRunning()) return;

    if (this.wantsTitleBgmPlay && this.titleBgmBuffer) {
      this.wantsTitleBgmPlay = false;
      this.startTitleBgmSource();
    }

    const pending = this.getPreview().getPending();
    if (pending) {
      this.getPreview().flushPendingIfReady();
    }
  }

  getCurrentTime(): number {
    if (!this.ctx || !this.playing) return 0;
    return this.ctx.currentTime - this.startTime;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  isPreviewPlaying(): boolean {
    return this.getPreview().isPlaying();
  }

  isPreviewPaused(): boolean {
    return this.getPreview().isPaused();
  }

  isUserPreviewActive(): boolean {
    return this.getPreview().isActive();
  }

  isPreviewEnabled(): boolean {
    return this.getPreview().isEnabled();
  }

  playUserPreview(loop = true): void {
    this.getPreview().playUser(loop);
  }

  async startUserPreview(loop = true, offset = 0): Promise<void> {
    if (!this.userBuffer) return;
    await this.startBufferPreview(this.userBuffer, loop, offset);
  }

  async startBufferPreview(buffer: AudioBuffer, loop = true, offset = 0): Promise<void> {
    await this.resume();
    await this.getPreview().startBuffer(buffer, loop, offset);
    if (this.getPreview().getPending()) {
      this.ensureUnlockListeners();
    }
  }

  pauseUserPreview(): void {
    this.getPreview().pause();
  }

  resumeUserPreview(): void {
    this.getPreview().resume();
  }

  async toggleUserPreview(): Promise<void> {
    await this.getPreview().toggle();
  }

  stopPreviewPlayback(): void {
    this.getPreview().stopPlayback();
  }

  stopUserPreview(): void {
    this.getPreview().stopUser();
  }

  getAudioReactive(): AudioReactive {
    return this.audioReactive;
  }

  updateAudioReactive(dt: number): void {
    if (!this.analyser || !this.freqData || !this.playing) {
      this.audioReactive.bass = 0;
      this.audioReactive.vocal = 0;
      this.audioReactive.energy = 0;
      this.audioReactive.spike *= Math.max(0, 1 - dt * 10);
      this.audioReactive.hasSignal = false;
      for (let i = 0; i < AUDIO_BAND_COUNT; i++) {
        this.audioReactive.bands[i] *= Math.max(0, 1 - dt * (6 + (i % 6)));
      }
      return;
    }

    this.analyser.getByteFrequencyData(this.freqData);
    const len = this.freqData.length;
    const bassEnd = Math.max(2, Math.floor(len * 0.06));
    const vocalEnd = Math.max(bassEnd + 1, Math.floor(len * 0.42));

    let bassSum = 0;
    let vocalSum = 0;
    let total = 0;
    for (let i = 0; i < len; i++) {
      const v = this.freqData[i];
      total += v;
      if (i < bassEnd) bassSum += v;
      else if (i < vocalEnd) vocalSum += v;
    }

    const bass = bassSum / (bassEnd * 255);
    const vocal = vocalSum / ((vocalEnd - bassEnd) * 255);
    const energy = total / (len * 255);

    const combined = vocal * 1.35 + bass * 0.85;
    const onset = Math.max(0, combined - this.energyBaseline * 1.12);
    this.energyBaseline += (combined - this.energyBaseline) * 0.1;

    this.smoothedBass = this.attackDecay(this.smoothedBass, bass);
    this.smoothedVocal = this.attackDecay(this.smoothedVocal, vocal);
    const spikeTarget = Math.min(1, onset * 3.2 + vocal * 0.35);
    this.audioReactive.spike = Math.max(spikeTarget, this.audioReactive.spike * (1 - dt * 9));

    this.audioReactive.bass = this.smoothedBass;
    this.audioReactive.vocal = this.smoothedVocal;
    this.audioReactive.energy = energy;
    this.audioReactive.hasSignal = energy > 0.02 || combined > 0.03;

    for (let b = 0; b < AUDIO_BAND_COUNT; b++) {
      const [start, end] = this.bandRanges[b] ?? [0, 1];
      let peak = 0;
      let sum = 0;
      for (let i = start; i < end; i++) {
        const v = this.freqData[i];
        sum += v;
        if (v > peak) peak = v;
      }
      const count = Math.max(1, end - start);
      const avg = sum / (count * 255);
      const peakNorm = peak / 255;
      const raw = avg * 0.55 + peakNorm * 0.45;
      const prev = this.audioReactive.bands[b];
      const norm = b / AUDIO_BAND_COUNT;
      const attack = 0.42 + norm * 0.38;
      const decay = 0.09 + (1 - norm) * 0.1;
      this.audioReactive.bands[b] =
        raw > prev ? prev + (raw - prev) * attack : prev + (raw - prev) * decay;
    }
  }

  /** 低域〜高域を対数分割した FFT ビン範囲 */
  private buildLogBandRanges(binCount: number): [number, number][] {
    const ranges: [number, number][] = [];
    const minBin = 1;
    const maxBin = Math.max(minBin + 2, binCount - 1);
    const logMin = Math.log(minBin);
    const logMax = Math.log(maxBin);
    for (let b = 0; b < AUDIO_BAND_COUNT; b++) {
      const t0 = b / AUDIO_BAND_COUNT;
      const t1 = (b + 1) / AUDIO_BAND_COUNT;
      const start = Math.min(
        maxBin,
        Math.max(0, Math.floor(Math.exp(logMin + (logMax - logMin) * t0))),
      );
      const end = Math.min(
        binCount,
        Math.max(start + 1, Math.floor(Math.exp(logMin + (logMax - logMin) * t1))),
      );
      ranges.push([start, end]);
    }
    return ranges;
  }

  private attackDecay(current: number, target: number): number {
    return target > current
      ? current + (target - current) * 0.5
      : current + (target - current) * 0.1;
  }

  resetAudioReactive(): void {
    this.energyBaseline = 0;
    this.smoothedBass = 0;
    this.smoothedVocal = 0;
    this.audioReactive = {
      bass: 0,
      vocal: 0,
      energy: 0,
      spike: 0,
      bands: Array.from({ length: AUDIO_BAND_COUNT }, () => 0),
      hasSignal: false,
    };
  }

  play(chart: ChartData): void {
    if (!this.ctx || !this.musicGain) return;
    this.stop();
    this.chart = chart;
    this.resetAudioReactive();

    if (chart.customAudio && this.userBuffer) {
      this.playBuffer(this.userBuffer, chart);
    } else if (this.chartBuffer) {
      this.playBuffer(this.chartBuffer, chart);
    } else {
      this.playProcedural(chart);
    }
  }

  private playBuffer(buffer: AudioBuffer, chart: ChartData): void {
    if (!this.ctx || !this.musicGain) return;
    this.playing = true;
    this.startTime = this.ctx.currentTime + 0.1;
    const startAt = this.startTime + chart.offset;

    this.musicGain.gain.value = 0.85;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.musicGain);
    source.start(startAt, 0);
    source.onended = () => {
      this.playing = false;
      this.musicEndCallback?.();
    };

    this.userSource = source;
    this.scheduledNodes.push(source);
  }

  private playProcedural(chart: ChartData): void {
    if (!this.ctx || !this.musicGain) return;
    this.musicGain.gain.value = 0.45;
    this.playing = true;
    this.startTime = this.ctx.currentTime + 0.1;
    const startAt = this.startTime;

    this.scheduleDrums(chart, startAt);
    this.scheduleBass(chart, startAt);
    this.scheduleMelody(chart, startAt);
  }

  stop(): void {
    this.stopTitleBgm();
    this.stopUserPreview();
    this.stopGameplayCheer();
    this.stopCountdownSequence();
    for (const node of this.scheduledNodes) {
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
    }
    this.scheduledNodes = [];
    this.userSource = null;
    this.playing = false;
  }

  playHitSound(lane: LaneIndex, judgment: JudgmentType, accuracy = 0.5): void {
    playLaneHitSound(this.getSynth(), lane, judgment, accuracy);
  }

  playMissSound(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.getSynth().drop(t, 200, 48, 0.2, 0.2);
    this.getSynth().glitch(t, 0.1, 0.12, 720, 180);
    this.getSynth().drop(t + 0.04, 90, 38, 0.1, 0.14);
  }

  playGameOverSound(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.getSynth().drop(t, 72, 52, 0.34, 0.28);
    this.getSynth().glitch(t + 0.06, 0.18, 0.16, 280, 90);
    this.getSynth().drop(t + 0.12, 48, 40, 0.22, 0.2);
    this.getSynth().fmBlip(t + 0.2, 180, 90, 120, 0.14, 0.1, 400);
  }

  playJudgmentVoice(judgment: JudgmentType): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;

    switch (judgment) {
      case 'marvelous':
        this.getSynth().fmBlip(t, 1600, 3000, 260, 0.1, 0.08, 2400);
        this.getSynth().glitch(t + 0.015, 0.025, 0.035, 4500, 9000);
        break;
      case 'perfect':
        this.getSynth().fmBlip(t, 1400, 2800, 220, 0.09, 0.07, 2200);
        this.getSynth().glitch(t + 0.02, 0.03, 0.04, 4000, 8000);
        break;
      case 'great':
        this.getSynth().blip(t, 1100, 0.07, 0.07, 'square', 1500, 3500);
        break;
      case 'good':
        this.getSynth().blip(t, 740, 0.055, 0.065, 'square', 920, 2600);
        break;
      case 'bad':
        this.getSynth().drop(t, 220, 90, 0.08, 0.1);
        break;
      case 'miss':
        this.getSynth().drop(t, 160, 55, 0.075, 0.12);
        this.getSynth().glitch(t, 0.06, 0.06, 600, 150);
        break;
    }
  }

  playAccuracyMilestone(tier: 80 | 90 | 95): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const notes = tier === 95 ? [392, 494, 587, 784] : tier === 90 ? [330, 415, 494] : [294, 370];

    notes.forEach((freq, i) => {
      const start = t + i * 0.065;
      const vol = tier === 95 ? 0.1 : tier === 90 ? 0.085 : 0.07;
      this.getSynth().fmBlip(start, freq, freq * 2.2, 90 + i * 20, vol, 0.12, freq * 1.6);
      this.getSynth().glitch(start + 0.01, 0.025, vol * 0.35, 2000 + i * 400, 6000 + i * 500);
    });

    if (tier === 95) {
      this.getSynth().scan(t + 0.26, 880, 1760, 0.08, 0.14);
      this.getSynth().fmBlip(t + 0.3, 988, 1976, 160, 0.09, 0.16, 1568);
    }
  }

  /** 画面遷移・戻る・キャンセル */
  playUiNavigate(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.getSynth().glitch(t, 0.025, 0.04, 2800, 5200);
    this.getSynth().blip(t, 620, 0.045, 0.045, 'square', 480, 3200);
  }

  /** 曲・難易度・CUSTOMなどの選択 */
  playUiSelect(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.getSynth().blip(t, 740, 0.055, 0.055, 'square', 880, 3400);
    this.getSynth().fmBlip(t + 0.05, 988, 1976, 70, 0.05, 0.07, 1240);
  }

  /** PLAY・RETRYなどの決定 */
  playUiDecide(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.getSynth().fmBlip(t, 494, 988, 100, 0.065, 0.1, 784);
    this.getSynth().scan(t + 0.06, 660, 1320, 0.06, 0.09);
    this.getSynth().glitch(t + 0.02, 0.04, 0.035, 1200, 7000);
  }

  /** カウントダウン 5〜1（連続クリップは先頭の1回のみ再生） */
  playCountdownTick(num: number): void {
    if (!this.ctx || !this.sfxGain) return;
    if (this.countdownTickBuffer) {
      if (!this.activeCountdownSequence) {
        this.playCountdownBeep(0.92, 1, true);
      }
      return;
    }
    this.playCountdownTickSynth(num);
  }

  /** カウントダウン GO（UI表示用） */
  playCountdownStart(): void {
    if (!this.ctx || !this.sfxGain) return;
    if (this.countdownTickBuffer) {
      return;
    }
    this.playCountdownStartSynth();
  }

  private stopCountdownSequence(): void {
    if (!this.activeCountdownSequence) return;
    try {
      this.activeCountdownSequence.stop();
    } catch {
      /* already stopped */
    }
    this.activeCountdownSequence = null;
  }

  private playCountdownBeep(volume = 0.88, playbackRate = 1, trackSequence = false): void {
    if (!this.ctx || !this.sfxGain || !this.countdownTickBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.countdownTickBuffer;
    src.playbackRate.value = playbackRate;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(this.sfxGain);
    if (trackSequence) {
      this.stopCountdownSequence();
      this.activeCountdownSequence = src;
      src.onended = () => {
        if (this.activeCountdownSequence === src) this.activeCountdownSequence = null;
      };
    }
    src.start();
  }

  /** お任せルーレットのリスト移動（progress 0〜1 で高くなる） */
  playRandomPickRouletteTick(progress: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const p = Math.min(1, Math.max(0, progress));
    if (this.countdownTickBuffer) {
      this.playCountdownBeep(0.4 + p * 0.24, 0.86 + p * 0.32);
      return;
    }
    const t = this.ctx.currentTime;
    const freq = 360 + p * 340;
    this.getSynth().blip(t, freq, 0.038 + p * 0.022, 0.042, 'square', freq * 1.28, 2200 + p * 900);
  }

  private playCountdownTickSynth(num: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const freqs: Record<number, number> = { 5: 280, 4: 310, 3: 370, 2: 494, 1: 622 };
    const freq = freqs[num] ?? 440;
    const vol = num === 1 ? 0.1 : 0.085;
    this.getSynth().blip(t, freq, vol, 0.09, 'square', freq * 1.35, 2800 + num * 300);
    this.getSynth().glitch(t, 0.02, vol * 0.35, 1800 + num * 200, 5500 + num * 400);
  }

  /** カウントダウン終了後のプレイ開始 */
  playGameStartSound(): void {
    if (!this.ctx || !this.sfxGain) return;
    if (this.startSoundBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.startSoundBuffer;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.92;
      src.connect(gain);
      gain.connect(this.sfxGain);
      src.start();
      return;
    }
    this.playCountdownStartSynth();
  }

  /** Perfect / Great 時の歓声（6種からランダム） */
  playRandomGameplayCheer(): void {
    if (!this.ctx || !this.sfxGain || this.gameplayCheerBuffers.length === 0) return;
    if (this.activeGameplayCheer) return;

    const buffer =
      this.gameplayCheerBuffers[Math.floor(Math.random() * this.gameplayCheerBuffers.length)];
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.72;
    src.connect(gain);
    gain.connect(this.sfxGain);
    src.onended = () => {
      if (this.activeGameplayCheer === src) this.activeGameplayCheer = null;
    };
    this.activeGameplayCheer = src;
    src.start();
  }

  private stopGameplayCheer(): void {
    if (!this.activeGameplayCheer) return;
    try {
      this.activeGameplayCheer.stop();
    } catch {
      /* already stopped */
    }
    this.activeGameplayCheer = null;
  }

  /** リザルト前のアナウンス「注目の結果は？」 */
  async playResultAnnounce(): Promise<void> {
    if (!this.resultAnnounceBuffer) return;
    await this.resume();
    await this.playSfxBuffer(this.resultAnnounceBuffer);
  }

  /** リザルト画面のグレード別ボイス */
  async playResultVoice(id: ResultVoiceId): Promise<void> {
    const buffer = this.resultVoiceBuffers.get(id);
    if (!buffer) return;
    await this.resume();
    await this.playSfxBuffer(buffer);
  }

  private playSfxBuffer(buffer: AudioBuffer, volume = 0.92): Promise<void> {
    return new Promise((resolve) => {
      if (!this.ctx || !this.sfxGain) {
        resolve();
        return;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain);
      gain.connect(this.sfxGain);
      src.onended = () => resolve();
      src.start();
    });
  }

  private playCountdownStartSynth(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    this.getSynth().fmBlip(t, 622, 1244, 130, 0.085, 0.1, 988);
    this.getSynth().scan(t + 0.05, 740, 1480, 0.075, 0.1);
    this.getSynth().fmBlip(t + 0.1, 988, 1976, 100, 0.08, 0.14, 1568);
    this.getSynth().glitch(t + 0.02, 0.06, 0.04, 900, 8000);
  }

  private scheduleDrums(chart: ChartData, startAt: number): void {
    if (!this.ctx || !this.musicGain) return;
    const beatDur = 60 / chart.bpm;
    const totalBeats = Math.ceil((chart.offset + 60) / beatDur) + chart.notes.length;

    for (let beat = 0; beat < totalBeats; beat++) {
      const t = startAt + chart.offset + beat * beatDur;
      if (beat % 4 === 0) this.scheduleKick(t);
      if (beat % 4 === 2) this.scheduleSnare(t);
      if (beat % 2 === 1) this.scheduleHiHat(t + beatDur * 0.5);
    }
  }

  private scheduleBass(chart: ChartData, startAt: number): void {
    if (!this.ctx || !this.musicGain) return;
    const beatDur = 60 / chart.bpm;
    const bassNotes = [65.41, 73.42, 82.41, 98.0];
    const totalBeats = Math.ceil(60 / beatDur) + chart.notes.length;

    for (let beat = 0; beat < totalBeats; beat++) {
      const t = startAt + chart.offset + beat * beatDur;
      const freq = bassNotes[beat % 4];
      this.scheduleTone(t, freq, beatDur * 0.9, 0.15, 'sawtooth');
    }
  }

  private scheduleMelody(chart: ChartData, startAt: number): void {
    if (!this.ctx || !this.musicGain) return;
    const beatDur = 60 / chart.bpm;
    const scale = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25];
    const totalBeats = Math.ceil(60 / beatDur) + chart.notes.length;

    for (let beat = 0; beat < totalBeats; beat++) {
      if (beat % 2 !== 0) continue;
      const t = startAt + chart.offset + beat * beatDur;
      const freq = scale[(beat * 3) % scale.length];
      this.scheduleTone(t, freq, beatDur * 1.8, 0.08, 'sine');
    }
  }

  private scheduleKick(t: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.6, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.35);
    this.scheduledNodes.push(osc);
  }

  private scheduleSnare(t: number): void {
    if (!this.ctx || !this.musicGain) return;
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;
    src.buffer = buffer;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    src.start(t);
    src.stop(t + 0.2);
    this.scheduledNodes.push(src);
  }

  private scheduleHiHat(t: number): void {
    if (!this.ctx || !this.musicGain) return;
    const bufferSize = this.ctx.sampleRate * 0.05;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    src.buffer = buffer;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.1, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    src.start(t);
    src.stop(t + 0.06);
    this.scheduledNodes.push(src);
  }

  private scheduleTone(
    t: number,
    freq: number,
    dur: number,
    vol: number,
    type: OscillatorType,
  ): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.02);
    gain.gain.setValueAtTime(vol, t + dur - 0.05);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.01);
    this.scheduledNodes.push(osc);
  }
}
