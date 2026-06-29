export type MusicGenre =
  | 'electronic'
  | 'rock'
  | 'pop'
  | 'jazz'
  | 'classical'
  | 'hiphop'
  | 'other';

export type LaneIndex = 0 | 1 | 2 | 3;

export type NoteType = 'tap' | 'hold';

export type JudgmentType = 'perfect' | 'great' | 'good' | 'bad' | 'miss';

export interface JudgmentConfig {
  name: JudgmentType;
  windowMs: number;
  scoreRatio: number;
  countsCombo: boolean;
}

export interface ChartNote {
  lane: LaneIndex;
  beat: number;
  type: NoteType;
  duration?: number; // beats for hold
}

export interface ChartData {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  offset: number;
  lpb: number;
  difficulty: string;
  level: number;
  notes: ChartNote[];
  /** public/audio/ 内のファイル名（内蔵曲 BGM） */
  audioTrack?: string;
  customAudio?: boolean;
  audioDuration?: number;
  /** 手動タグまたは自動判定 */
  genre?: MusicGenre;
  genreConfidence?: number;
}

export interface ActiveNote {
  id: number;
  lane: LaneIndex;
  time: number;
  type: NoteType;
  endTime?: number;
  hit: boolean;
  holding: boolean;
  missed: boolean;
  released: boolean;
}

export interface JudgmentResult {
  type: JudgmentType;
  lane: LaneIndex;
  time: number;
  score: number;
}

export interface GameStats {
  score: number;
  combo: number;
  maxCombo: number;
  perfect: number;
  great: number;
  good: number;
  bad: number;
  miss: number;
}

export const LANE_KEYS = ['d', 'f', 'j', 'k'] as const;
export const LANE_ARROW_KEYS = ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'] as const;
export const LANE_COLORS = ['#ff2d6a', '#00e5ff', '#a855f7', '#ffd700'] as const;
export const LANE_LABELS = ['D', 'F', 'J', 'K'] as const;
export const LANE_ARROW_LABELS = ['←', '↑', '↓', '→'] as const;

export const JUDGMENTS: JudgmentConfig[] = [
  { name: 'perfect', windowMs: 35, scoreRatio: 1.0, countsCombo: true },
  { name: 'great', windowMs: 70, scoreRatio: 0.7, countsCombo: true },
  { name: 'good', windowMs: 110, scoreRatio: 0.4, countsCombo: true },
  { name: 'bad', windowMs: 150, scoreRatio: 0.1, countsCombo: false },
];

export const DEFAULT_NOTE_SPEED = 680; // pixels per second at 1.0x
export const NOTE_SPEED = DEFAULT_NOTE_SPEED;
export const BASE_APPROACH_TIME = 1.8; // seconds at 1.0x (fallback)
export const APPROACH_TIME = BASE_APPROACH_TIME;
export const BASE_SCORE = 500;
