import type { DdrGrade } from '../scoring/ddrScoring';

export type ResultVoiceId = 'marvelous' | 'excellent' | 'good' | 'close';

export const RESULT_ANNOUNCE_FILE = 'result_announce.wav';
/** アナウンス終了後、ランク表示までの待ち（ms） */
export const RESULT_RANK_REVEAL_DELAY_MS = 500;

const RESULT_VOICE_FILES: Record<ResultVoiceId, string> = {
  marvelous: 'result_marvelous.wav',
  excellent: 'result_excellent.wav',
  good: 'result_good.wav',
  close: 'result_close.wav',
};

/** S(AAA〜AA) / A / B / C 系の結果ボイス */
export function getResultVoiceId(grade: DdrGrade): ResultVoiceId {
  if (grade === 'AAA' || grade.startsWith('AA')) return 'marvelous';
  if (grade.startsWith('A')) return 'excellent';
  if (grade.startsWith('B')) return 'good';
  return 'close';
}

export function resultVoiceUrl(id: ResultVoiceId, baseUrl: string): string {
  return `${baseUrl}audio/${RESULT_VOICE_FILES[id]}`;
}

export function resultAnnounceUrl(baseUrl: string): string {
  return `${baseUrl}audio/${RESULT_ANNOUNCE_FILE}`;
}

export const RESULT_VOICE_IDS = Object.keys(RESULT_VOICE_FILES) as ResultVoiceId[];
