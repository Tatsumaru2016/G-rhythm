import type { SongPhase } from '../game/scrollPhase';
import type { JudgmentType, MusicGenre } from '../types';
import { loadLocale, saveLocale } from '../settings/language';
import { MESSAGES, type Locale, type MessageKey } from './messages';

export type { Locale, MessageKey };

const listeners = new Set<() => void>();
let locale: Locale = 'ja';

function applyDocumentLocale(l: Locale): void {
  document.documentElement.lang = l;
  document.title = t('meta.title');
  const meta = document.querySelector('meta[name="description"]');
  meta?.setAttribute('content', t('meta.description'));
  const playHud = document.getElementById('play-hud');
  if (playHud) playHud.setAttribute('aria-label', t('ui.playHudAria'));
}

export function initLocale(): Locale {
  locale = loadLocale() as Locale;
  applyDocumentLocale(locale);
  return locale;
}

export function getLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale): void {
  if (next === locale) return;
  locale = next;
  saveLocale(next);
  applyDocumentLocale(next);
  for (const fn of listeners) fn();
}

export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const table = MESSAGES[locale] ?? MESSAGES.ja;
  let text = table[key] ?? MESSAGES.ja[key] ?? String(key);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

export function tGenre(genre: MusicGenre): string {
  return t(`genre.${genre}`);
}

export function tPhase(phase: SongPhase): string {
  return t(`phase.${phase}`);
}

export function tJudgment(judgment: JudgmentType): string {
  return t(`judgment.${judgment}`);
}

export type FreezeJudgment = 'ok' | 'ng';

export function tFreezeJudgment(judgment: FreezeJudgment): string {
  return t(`judgment.${judgment}`);
}

export function tDifficultyHint(difficulty: 'EASY' | 'NORMAL' | 'HARD' | 'EXTREME'): string {
  const key: MessageKey = {
    EASY: 'difficulty.easy',
    NORMAL: 'difficulty.normal',
    HARD: 'difficulty.hard',
    EXTREME: 'difficulty.extreme',
  }[difficulty];
  return t(key);
}

export function formatNotesCount(count: number): string {
  return t('ui.notes', { count });
}

export function formatLevel(count: number): string {
  return t('ui.level', { level: count });
}

export function formatChartBpm(bpm: number): string {
  const rounded = Math.round(bpm * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return t('ui.bpm', { bpm: text });
}

export function getMilestoneSublabel(tier: 80 | 90 | 95): string {
  return tier === 95 ? t('milestone.ultraAcc') : t('milestone.accuracy');
}
