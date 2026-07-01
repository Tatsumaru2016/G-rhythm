/** Web Audio サイバー系 SFX プリミティブ（ヒット音・UI・判定ボイスで共有） */
export class CyberSynth {
  constructor(
    private getCtx: () => AudioContext | null,
    private getGain: () => GainNode | null,
  ) {}

  blip(
    t: number,
    freq: number,
    vol: number,
    dur: number,
    type: OscillatorType = 'square',
    endFreq?: number,
    filterFreq = 3000,
  ): void {
    const ctx = this.getCtx();
    const sfxGain = this.getGain();
    if (!ctx || !sfxGain) return;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), t + dur * 0.7);
    }
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 6;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  fmBlip(
    t: number,
    carrier: number,
    modFreq: number,
    modIndex: number,
    vol: number,
    dur: number,
    endCarrier?: number,
  ): void {
    const ctx = this.getCtx();
    const sfxGain = this.getGain();
    if (!ctx || !sfxGain) return;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    car.type = 'square';
    mod.type = 'sine';
    car.frequency.setValueAtTime(carrier, t);
    if (endCarrier != null) {
      car.frequency.exponentialRampToValueAtTime(Math.max(30, endCarrier), t + dur * 0.75);
    }
    mod.frequency.value = modFreq;
    modGain.gain.setValueAtTime(modIndex, t);
    modGain.gain.exponentialRampToValueAtTime(8, t + dur);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(carrier * 2.5, t);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(400, (endCarrier ?? carrier) * 3),
      t + dur,
    );
    filter.Q.value = 5;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    mod.connect(modGain);
    modGain.connect(car.frequency);
    car.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);

    mod.start(t);
    car.start(t);
    mod.stop(t + dur + 0.02);
    car.stop(t + dur + 0.02);
  }

  glitch(t: number, dur: number, vol: number, bpStart: number, bpEnd: number): void {
    const ctx = this.getCtx();
    const sfxGain = this.getGain();
    if (!ctx || !sfxGain) return;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() < 0.5 ? -1 : 1;
    }

    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(bpStart, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(200, bpEnd), t + dur);
    filter.Q.value = 8;
    src.buffer = buffer;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  scan(t: number, start: number, end: number, vol: number, dur: number): void {
    const ctx = this.getCtx();
    const sfxGain = this.getGain();
    if (!ctx || !sfxGain) return;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(start, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, end), t + dur);
    filter.type = 'highpass';
    filter.frequency.value = 1200;
    filter.Q.value = 4;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  drop(t: number, start: number, end: number, vol: number, dur: number): void {
    const ctx = this.getCtx();
    const sfxGain = this.getGain();
    if (!ctx || !sfxGain) return;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(start, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, end), t + dur);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + dur);
    filter.Q.value = 3;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  now(): number | null {
    return this.getCtx()?.currentTime ?? null;
  }
}
