export const SONG_FINISH_CHEER_FILE = 'song_finish_cheer.wav';

export function songFinishCheerUrl(baseUrl: string): string {
  return `${baseUrl}audio/${SONG_FINISH_CHEER_FILE}`;
}
