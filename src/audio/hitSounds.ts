import type { JudgmentType, LaneIndex } from '../types';
import type { CyberSynth } from './cyberSynth';

/** レーン別ベース周波数（サイバー系デジタル音階） */
const LANE_FREQS = [196.0, 247.94, 311.13, 392.0];

interface HitSoundStyle {
  pitch: number;
  vol: number;
  fmDepth: number;
  glitchVol: number;
  sparkle: boolean;
  shine: boolean;
  dazzle: boolean;
}

function hitStyle(accuracy: number): HitSoundStyle {
  const a = Math.max(0, Math.min(1, accuracy));
  return {
    pitch: 1 + a * 0.55,
    vol: 0.72 + a * 0.38,
    fmDepth: 60 + a * 180,
    glitchVol: 0.05 + a * 0.2,
    sparkle: a >= 0.45,
    shine: a >= 0.68,
    dazzle: a >= 0.82,
  };
}

function p(freq: number, style: HitSoundStyle, mult = 1): number {
  return freq * style.pitch * mult;
}

function v(vol: number, style: HitSoundStyle): number {
  return vol * style.vol;
}

function playPerfectHit(synth: CyberSynth, freq: number, style: HitSoundStyle): void {
  const t = synth.now();
  if (t == null) return;
  const f = p(freq, style);

  synth.fmBlip(t, f, f * 2.4, style.fmDepth * 1.2, v(0.28, style), 0.14, f * 2.8);
  synth.blip(t, f * 1.5, v(0.16, style), 0.1, 'square', f * 2.2, 3200);
  synth.glitch(t, 0.05, v(style.glitchVol, style), 2200, 6800);

  if (style.sparkle) {
    synth.blip(t + 0.01, f * 2.6, v(0.1, style), 0.07, 'square', f * 3.4, 4800);
  }
  if (style.shine) {
    synth.fmBlip(t, f * 3, f * 5.5, style.fmDepth, v(0.09, style), 0.08);
    synth.glitch(t + 0.02, 0.04, v(style.glitchVol * 0.7, style), 3000, 9000);
  }
  if (style.dazzle) {
    synth.scan(t, f * 4, f * 7, v(0.07, style), 0.06);
  }
}

function playGreatHit(synth: CyberSynth, freq: number, style: HitSoundStyle): void {
  const t = synth.now();
  if (t == null) return;
  const f = p(freq, style);

  synth.fmBlip(t, f, f * 1.8, style.fmDepth, v(0.24, style), 0.12, f * 2);
  synth.blip(t, f * 1.25, v(0.11, style), 0.09, 'square', f * 1.7, 2800);

  if (style.sparkle) {
    synth.blip(t, f * 2, v(0.08, style), 0.07, 'square', undefined, 4200);
    synth.glitch(t, 0.035, v(style.glitchVol * 0.55, style), 1800, 5500);
  }
  if (style.shine) {
    synth.scan(t, f * 2.2, f * 3.5, v(0.06, style), 0.05);
  }
}

function playGoodHit(synth: CyberSynth, freq: number, style: HitSoundStyle): void {
  const t = synth.now();
  if (t == null) return;
  const f = p(freq, style, 0.98);

  synth.blip(t, f, v(0.18, style), 0.1, 'square', f * 1.4, 2400);

  if (style.sparkle) {
    synth.fmBlip(t, f * 1.6, f * 3.2, style.fmDepth * 0.6, v(0.07, style), 0.08);
  }
  if (style.shine) {
    synth.glitch(t, 0.03, v(style.glitchVol * 0.4, style), 1500, 4500);
  }
}

function playBadHit(synth: CyberSynth, freq: number, style: HitSoundStyle): void {
  const t = synth.now();
  if (t == null) return;
  const f = p(freq, style, 0.72);

  synth.drop(t, f, p(freq, style, 0.4), v(0.2, style), 0.14);
  synth.blip(t, 88 * style.pitch, v(0.09, style), 0.1, 'sawtooth', 55 * style.pitch, 600);

  if (style.shine) {
    synth.glitch(t + 0.01, 0.05, v(0.06, style), 400, 1200);
  }
}

export function playLaneHitSound(
  synth: CyberSynth,
  lane: LaneIndex,
  judgment: JudgmentType,
  accuracy = 0.5,
): void {
  const baseFreq = LANE_FREQS[lane];
  const style = hitStyle(accuracy);

  switch (judgment) {
    case 'marvelous':
      playPerfectHit(synth, baseFreq, {
        ...style,
        vol: style.vol * 1.08,
        pitch: style.pitch * 1.04,
      });
      break;
    case 'perfect':
      playPerfectHit(synth, baseFreq, style);
      break;
    case 'great':
      playGreatHit(synth, baseFreq, style);
      break;
    case 'good':
      playGoodHit(synth, baseFreq, style);
      break;
    case 'bad':
      playBadHit(synth, baseFreq, style);
      break;
    default:
      break;
  }
}
