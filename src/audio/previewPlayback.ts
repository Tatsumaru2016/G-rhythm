export interface PendingPreview {
  buffer: AudioBuffer;
  loop: boolean;
  offset: number;
}

export interface PreviewPlaybackHost {
  getCtx(): AudioContext | null;
  getMusicGain(): GainNode | null;
  getUserBuffer(): AudioBuffer | null;
  isContextRunning(): boolean;
}

/** 曲選択プレビュー再生（AudioEngine から分離） */
export class PreviewPlayback {
  private previewPlaybackBuffer: AudioBuffer | null = null;
  private previewSource: AudioBufferSourceNode | null = null;
  private previewLoop = true;
  private previewOffset = 0;
  private previewStartedAt = 0;
  private previewPaused = false;
  private previewEnabled = true;
  private pendingPreview: PendingPreview | null = null;

  constructor(private readonly host: PreviewPlaybackHost) {}

  isPlaying(): boolean {
    return this.previewSource !== null && !this.previewPaused;
  }

  isPaused(): boolean {
    return this.previewPaused;
  }

  isActive(): boolean {
    return this.previewSource !== null && !this.previewPaused;
  }

  isEnabled(): boolean {
    return this.previewEnabled;
  }

  getPending(): PendingPreview | null {
    return this.pendingPreview;
  }

  clearPending(): void {
    this.pendingPreview = null;
  }

  flushPendingIfReady(): void {
    if (!this.host.isContextRunning()) return;
    const pending = this.pendingPreview;
    if (!pending) return;
    this.pendingPreview = null;
    this.startNow(pending.buffer, pending.loop, pending.offset);
  }

  playUser(loop = true): void {
    this.previewEnabled = true;
    void this.startUser(loop, 0);
  }

  async startUser(loop = true, offset = 0): Promise<void> {
    if (!this.previewEnabled) return;
    const buffer = this.host.getUserBuffer();
    if (!buffer) return;
    this.previewPlaybackBuffer = buffer;
    await this.startBuffer(buffer, loop, offset);
  }

  async startBuffer(buffer: AudioBuffer, loop = true, offset = 0): Promise<void> {
    this.previewEnabled = true;
    this.previewPlaybackBuffer = buffer;
    if (!this.host.isContextRunning()) {
      this.pendingPreview = { buffer, loop, offset };
      return;
    }
    this.pendingPreview = null;
    this.startNow(buffer, loop, offset);
  }

  private startNow(buffer: AudioBuffer, loop: boolean, offset: number): void {
    const ctx = this.host.getCtx();
    const musicGain = this.host.getMusicGain();
    if (!ctx || !musicGain || !this.host.isContextRunning()) return;
    this.clearSource();
    this.previewLoop = loop;
    this.previewOffset = offset;
    this.previewPaused = false;
    this.spawnSource(offset);
  }

  private getActiveBuffer(): AudioBuffer | null {
    return this.previewPlaybackBuffer ?? this.host.getUserBuffer();
  }

  private spawnSource(offset: number): void {
    const buffer = this.getActiveBuffer();
    const ctx = this.host.getCtx();
    const musicGain = this.host.getMusicGain();
    if (!ctx || !musicGain || !buffer) return;

    musicGain.gain.value = 0.85;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = this.previewLoop;
    source.connect(musicGain);
    source.onended = () => {
      if (!this.previewLoop) {
        this.previewSource = null;
        this.previewPaused = false;
      }
    };

    const safeOffset = Math.max(0, Math.min(offset, Math.max(0, buffer.duration - 0.01)));
    source.start(0, safeOffset);
    this.previewStartedAt = ctx.currentTime - safeOffset;
    this.previewSource = source;
  }

  pause(): void {
    const buffer = this.getActiveBuffer();
    const ctx = this.host.getCtx();
    if (this.previewSource && ctx && buffer) {
      const elapsed = ctx.currentTime - this.previewStartedAt;
      this.previewOffset = this.previewLoop
        ? elapsed % buffer.duration
        : Math.min(Math.max(0, elapsed), buffer.duration);
    }
    this.pendingPreview = null;
    this.clearSource();
    this.previewPaused = false;
    this.previewEnabled = false;
  }

  resume(): void {
    const buffer = this.getActiveBuffer();
    if (!this.previewEnabled || !this.previewPaused || !buffer) return;
    void this.startBuffer(buffer, this.previewLoop, this.previewOffset);
  }

  async toggle(): Promise<void> {
    if (this.isActive()) {
      this.pause();
      return;
    }
    this.previewEnabled = true;
    const buffer = this.getActiveBuffer();
    if (!buffer) return;
    await this.startBuffer(buffer, this.previewLoop, this.previewOffset);
  }

  stopPlayback(): void {
    this.pendingPreview = null;
    this.clearSource();
    this.previewPaused = false;
  }

  stopUser(): void {
    this.clearSource();
    this.previewPaused = false;
    this.previewEnabled = true;
    this.previewOffset = 0;
  }

  private clearSource(): void {
    if (!this.previewSource) return;
    try {
      this.previewSource.stop();
    } catch {
      /* already stopped */
    }
    this.previewSource = null;
  }
}
