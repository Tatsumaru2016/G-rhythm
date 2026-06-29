import type { ActiveNote, JudgmentConfig, JudgmentType } from '../types';
import { JUDGMENTS } from '../types';
import { tJudgment } from '../i18n';
export function judgeTiming(diffMs: number): JudgmentType {
  const abs = Math.abs(diffMs);
  for (const j of JUDGMENTS) {
    if (abs <= j.windowMs) return j.name;
  }
  return 'miss';
}

export function getJudgmentConfig(type: JudgmentType): JudgmentConfig | null {
  return JUDGMENTS.find(j => j.name === type) ?? null;
}

export function findHittableNote(
  notes: ActiveNote[],
  lane: number,
  currentTime: number,
  forRelease = false
): ActiveNote | null {
  let best: ActiveNote | null = null;
  let bestDiff = Infinity;

  for (const note of notes) {
    if (note.lane !== lane) continue;
    if (note.missed) continue;

    if (forRelease) {
      if (note.type !== 'hold' || !note.holding || note.released) continue;
      if (!note.endTime) continue;
      const diff = Math.abs(currentTime - note.endTime);
      if (diff < bestDiff && diff <= JUDGMENTS[JUDGMENTS.length - 1].windowMs) {
        bestDiff = diff;
        best = note;
      }
      continue;
    }

    if (note.hit) continue;

    const targetTime = note.time;
    const diff = Math.abs(currentTime - targetTime);

    if (diff < bestDiff && diff <= JUDGMENTS[JUDGMENTS.length - 1].windowMs) {
      bestDiff = diff;
      best = note;
    }
  }

  return best;
}

export function getMissedNotes(notes: ActiveNote[], currentTime: number): ActiveNote[] {
  const missed: ActiveNote[] = [];
  for (const note of notes) {
    if (note.hit || note.missed) continue;
    const deadline = note.time + JUDGMENTS[JUDGMENTS.length - 1].windowMs;
    if (currentTime > deadline) {
      note.missed = true;
      missed.push(note);
    }
  }
  return missed;
}

export function checkHoldBreaks(notes: ActiveNote[], currentTime: number, lanePressed: boolean[]): ActiveNote[] {
  const broken: ActiveNote[] = [];
  for (const note of notes) {
    if (note.type !== 'hold' || !note.holding || note.released || note.missed) continue;
    if (!lanePressed[note.lane]) {
      note.missed = true;
      note.holding = false;
      broken.push(note);
    }
    if (note.endTime && currentTime > note.endTime + JUDGMENTS[JUDGMENTS.length - 1].windowMs && !note.released) {
      note.missed = true;
      broken.push(note);
    }
  }
  return broken;
}

export function getJudgmentLabel(type: JudgmentType): string {
  return tJudgment(type);
}

/** @deprecated use getJudgmentLabel() */
export const JUDGMENT_LABELS: Record<JudgmentType, string> = {
  perfect: 'PERFECT',
  great: 'GREAT',
  good: 'GOOD',
  bad: 'BAD',
  miss: 'MISS',
};
export const JUDGMENT_COLORS: Record<JudgmentType, string> = {
  perfect: '#00ffff',
  great: '#7fff00',
  good: '#ffd700',
  bad: '#ff8c00',
  miss: '#ff2d6a',
};
