export const DANGER_VOICE_FILE = 'danger_voice.wav';

export function dangerVoiceUrl(baseUrl: string): string {
  return `${baseUrl}audio/${DANGER_VOICE_FILE}`;
}
