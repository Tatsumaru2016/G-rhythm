export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.webm'] as const;

export function isAudioFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}
